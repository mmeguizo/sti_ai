import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, switchMap, take, throwError } from 'rxjs';

export interface AdminUserRecord {
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
  items: AdminUserRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root',
})
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly auth0 = inject(AuthService);
  private readonly apiBaseUrl = 'http://localhost:3000';

  listUsers(search: string, page: number, pageSize: number): Observable<AdminUserListResponse> {
    const searchParams = new URLSearchParams({
      search,
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.withAuthHeaders((headers) =>
      this.http.get<AdminUserListResponse>(
        `${this.apiBaseUrl}/auth/admin/users?${searchParams.toString()}`,
        { headers },
      ),
    );
  }

  updateUser(
    auth0UserId: string,
    updates: { role?: 'user' | 'admin'; status?: 'pending' | 'active' | 'disabled' },
  ): Observable<AdminUserRecord> {
    return this.withAuthHeaders((headers) =>
      this.http.patch<AdminUserRecord>(
        `${this.apiBaseUrl}/auth/admin/users/${encodeURIComponent(auth0UserId)}`,
        updates,
        { headers },
      ),
    );
  }

  private withAuthHeaders<T>(callback: (headers: HttpHeaders) => Observable<T>): Observable<T> {
    return this.auth0.idTokenClaims$.pipe(
      take(1),
      switchMap((claims) => {
        const rawToken = (claims as { __raw?: string } | null)?.__raw;
        if (!rawToken) {
          return throwError(() => new Error('Missing Auth0 token for admin request.'));
        }

        return callback(
          new HttpHeaders({
            Authorization: `Bearer ${rawToken}`,
          }),
        );
      }),
    );
  }
}
