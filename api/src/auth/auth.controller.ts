import {
  Body,
  Controller,
  Headers,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AdminUserListItem,
  AdminUserListResponse,
  AuthSyncService,
  SyncedUser,
} from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authSyncService: AuthSyncService) {}

  @Get('admin/users')
  async listUsers(
    @Headers('authorization') authorizationHeader?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminUserListResponse> {
    const token = this.extractBearerToken(authorizationHeader);

    return this.authSyncService.listUsersForAdmin(
      token,
      search,
      Number(page),
      Number(pageSize),
    );
  }

  @Patch('admin/users/:auth0UserId')
  async updateUser(
    @Headers('authorization') authorizationHeader: string | undefined,
    @Param('auth0UserId') auth0UserId: string,
    @Body()
    body: {
      role?: 'user' | 'admin';
      status?: 'pending' | 'active' | 'disabled';
    },
  ): Promise<AdminUserListItem> {
    const token = this.extractBearerToken(authorizationHeader);

    return this.authSyncService.updateUserForAdmin(token, auth0UserId, body);
  }

  @Post('sync-user')
  async syncUser(
    @Headers('authorization') authorizationHeader?: string,
  ): Promise<SyncedUser> {
    const token = this.extractBearerToken(authorizationHeader);

    return this.authSyncService.syncFromAuth0Token(token);
  }

  private extractBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token.');
    }

    const token = authorizationHeader.substring('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty Bearer token.');
    }

    return token;
  }
}
