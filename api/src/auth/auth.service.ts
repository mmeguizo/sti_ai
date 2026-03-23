import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface SyncedUser {
  auth0UserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'disabled';
}

export interface AdminUserListItem {
  auth0UserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'disabled';
  approvedBy: string | null;
  approvedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class AuthSyncService {
  private readonly supabase: SupabaseClient;
  private readonly auth0Issuer: string;
  private readonly auth0ClientId: string;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const auth0Issuer = this.configService.get<string>('AUTH0_ISSUER_BASE_URL');
    const auth0ClientId = this.configService.get<string>('AUTH0_CLIENT_ID');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.',
      );
    }

    if (!auth0Issuer || !auth0ClientId) {
      throw new Error(
        'Missing AUTH0_ISSUER_BASE_URL or AUTH0_CLIENT_ID in environment variables.',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    this.auth0Issuer = auth0Issuer.replace(/\/$/, '');
    this.auth0ClientId = auth0ClientId;
  }

  async syncFromAuth0Token(rawToken: string): Promise<SyncedUser> {
    const claims = await this.verifyIdToken(rawToken);

    const auth0UserId = claims.sub;
    if (!auth0UserId) {
      throw new UnauthorizedException('Invalid token: missing subject claim.');
    }

    const nowIso = new Date().toISOString();
    const email = this.getClaimAsString(claims, 'email');
    const nameClaim =
      this.getClaimAsString(claims, 'name') ||
      this.getClaimAsString(claims, 'nickname') ||
      email ||
      auth0UserId;
    const pictureClaim = this.getClaimAsString(claims, 'picture') || '';

    try {
      const { data: existingUser, error: existingUserError } =
        await this.supabase
          .from('app_users')
          .select('auth0_user_id, role, status')
          .eq('auth0_user_id', auth0UserId)
          .maybeSingle();

      if (existingUserError) {
        throw new InternalServerErrorException(
          `Failed to read existing user from Supabase: ${existingUserError.message}`,
        );
      }

      const nextStatus =
        existingUser?.status === 'disabled' ? 'disabled' : 'active';
      const nextRole = existingUser?.role || 'user';

      const { data, error } = await this.supabase
        .from('app_users')
        .upsert(
          {
            auth0_user_id: auth0UserId,
            email,
            display_name: nameClaim,
            avatar_url: pictureClaim,
            auth_provider: 'auth0',
            role: nextRole,
            status: nextStatus,
            approved_at: nextStatus === 'active' ? nowIso : null,
            approved_by: nextStatus === 'active' ? auth0UserId : null,
            last_login_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'auth0_user_id' },
        )
        .select('auth0_user_id, email, display_name, avatar_url, role, status')
        .single();

      if (error || !data) {
        throw new InternalServerErrorException(
          `Failed to sync user to Supabase: ${error?.message || 'Unknown error'}`,
        );
      }

      return {
        auth0UserId: data.auth0_user_id,
        email: data.email,
        displayName: data.display_name,
        avatarUrl: data.avatar_url || '',
        role: data.role,
        status: data.status,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to sync user to Supabase: ${this.formatSupabaseError(error)}`,
      );
    }
  }

  async listUsersForAdmin(
    rawToken: string,
    search: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<AdminUserListResponse> {
    await this.assertAdmin(rawToken);

    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safePageSize =
      Number.isFinite(pageSize) && pageSize > 0
        ? Math.min(Math.floor(pageSize), 50)
        : 10;
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    let query = this.supabase
      .from('app_users')
      .select(
        'auth0_user_id, email, display_name, avatar_url, role, status, approved_by, approved_at, last_login_at, created_at, updated_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const escapedSearch = this.escapeLike(trimmedSearch);
      query = query.or(
        [
          `auth0_user_id.ilike.%${escapedSearch}%`,
          `email.ilike.%${escapedSearch}%`,
          `display_name.ilike.%${escapedSearch}%`,
          `role.ilike.%${escapedSearch}%`,
          `status.ilike.%${escapedSearch}%`,
        ].join(','),
      );
    }

    const { data, error, count } = await query;

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to load users from Supabase: ${error?.message || 'Unknown error'}`,
      );
    }

    return {
      items: data.map((user) => ({
        auth0UserId: user.auth0_user_id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url || '',
        role: user.role,
        status: user.status,
        approvedBy: user.approved_by,
        approvedAt: user.approved_at,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      })),
      page: safePage,
      pageSize: safePageSize,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / safePageSize)),
    };
  }

  async updateUserForAdmin(
    rawToken: string,
    targetAuth0UserId: string,
    updates: {
      role?: 'user' | 'admin';
      status?: 'pending' | 'active' | 'disabled';
    },
  ): Promise<AdminUserListItem> {
    const requester = await this.assertAdmin(rawToken);

    const payload: Record<string, string | null> = {};
    if (updates.role) {
      payload.role = updates.role;
    }
    if (updates.status) {
      payload.status = updates.status;
      if (updates.status === 'active') {
        payload.approved_at = new Date().toISOString();
        payload.approved_by = requester.auth0UserId;
      }
      if (updates.status === 'pending') {
        payload.approved_at = null;
        payload.approved_by = null;
      }
    }

    const { data, error } = await this.supabase
      .from('app_users')
      .update(payload)
      .eq('auth0_user_id', targetAuth0UserId)
      .select(
        'auth0_user_id, email, display_name, avatar_url, role, status, approved_by, approved_at, last_login_at, created_at, updated_at',
      )
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `Failed to update user in Supabase: ${error?.message || 'Unknown error'}`,
      );
    }

    return {
      auth0UserId: data.auth0_user_id,
      email: data.email,
      displayName: data.display_name,
      avatarUrl: data.avatar_url || '',
      role: data.role,
      status: data.status,
      approvedBy: data.approved_by,
      approvedAt: data.approved_at,
      lastLoginAt: data.last_login_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  private async verifyIdToken(rawToken: string): Promise<JWTPayload> {
    const jwks = createRemoteJWKSet(
      new URL(`${this.auth0Issuer}/.well-known/jwks.json`),
    );

    try {
      const { payload } = await jwtVerify(rawToken, jwks, {
        issuer: `${this.auth0Issuer}/`,
        audience: this.auth0ClientId,
      });

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired Auth0 token.');
    }
  }

  private async assertAdmin(rawToken: string): Promise<SyncedUser> {
    const syncedUser = await this.syncFromAuth0Token(rawToken);

    if (syncedUser.role !== 'admin') {
      throw new ForbiddenException('Admin access is required for this action.');
    }

    return syncedUser;
  }

  private getClaimAsString(payload: JWTPayload, claim: string): string | null {
    const value = payload[claim];
    return typeof value === 'string' ? value : null;
  }

  private escapeLike(input: string): string {
    return input.replace(/[,%]/g, ' ');
  }

  private formatSupabaseError(error: unknown): string {
    if (error instanceof InternalServerErrorException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
    }

    if (!error || typeof error !== 'object') {
      return String(error);
    }

    const errorWithCause = error as {
      message?: string;
      cause?: {
        code?: string;
        hostname?: string;
        message?: string;
      };
    };

    const parts = [errorWithCause.message].filter(Boolean);
    if (errorWithCause.cause?.code) {
      parts.push(`cause=${errorWithCause.cause.code}`);
    }
    if (errorWithCause.cause?.hostname) {
      parts.push(`hostname=${errorWithCause.cause.hostname}`);
    }
    if (errorWithCause.cause?.message) {
      parts.push(errorWithCause.cause.message);
    }

    return parts.join(' | ') || 'Unknown error';
  }
}
