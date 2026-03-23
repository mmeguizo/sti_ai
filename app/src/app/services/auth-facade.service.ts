import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, map, of, switchMap, take } from 'rxjs';
import { appSettings, isAuth0Configured } from '../app.settings';
import { environment } from '../../environments/environment';

export interface AppUser {
  auth0UserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active';
}

@Injectable({
  providedIn: 'root',
})
export class AuthFacadeService {
  private readonly auth0 = inject(AuthService, { optional: true });
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiUrl;
  readonly isConfigured = isAuth0Configured();
  readonly authDomain = appSettings.auth0.domain;
  readonly isLoading$ = this.auth0?.isLoading$ ?? of(false);
  readonly isAuthenticated$ = this.auth0?.isAuthenticated$ ?? of(false);
  readonly user$ = this.auth0?.user$ ?? of(null);
  readonly error$ = this.auth0?.error$ ?? of(null);
  readonly syncError = signal<string | null>(null);

  /**
   * Emits the raw Auth0 ID token string, or null if unavailable.
   * Used by ChatService to authenticate requests to the backend.
   */
  readonly rawToken$ = !this.auth0
    ? of(null as string | null)
    : this.auth0.idTokenClaims$.pipe(
        map((claims) => (claims as { __raw?: string } | null)?.__raw ?? null),
      );

  readonly appUser$ = this.user$.pipe(
    switchMap((user) => {
      if (!user?.sub) {
        return of(null);
      }

      const fallbackAppUser: AppUser = {
        auth0UserId: user.sub,
        email: user.email ?? null,
        displayName: user.name || user.nickname || user.email || user.sub,
        avatarUrl: user.picture || '',
        role: 'user',
        status: 'active',
        // status: 'pending',
      };

      if (!this.auth0) {
        return of(fallbackAppUser);
      }

      return this.auth0.idTokenClaims$.pipe(
        take(1),
        switchMap((claims) => {
          const rawToken =
            (
              claims as {
                __raw?: string;
              } | null
            )?.__raw || null;
          if (!rawToken) {
            this.syncError.set('Missing Auth0 raw ID token for user sync.');
            return of(fallbackAppUser);
          }

          return this.http
            .post<{
              auth0UserId: string;
              email: string | null;
              displayName: string;
              avatarUrl: string;
              role: 'user' | 'admin';
              status: 'pending' | 'active' | 'disabled';
            }>(
              `${this.apiBaseUrl}/auth/sync-user`,
              {},
              {
                headers: new HttpHeaders({
                  Authorization: `Bearer ${rawToken}`,
                }),
              },
            )
            .pipe(
              map((dbUser) => {
                this.syncError.set(null);
                return {
                  ...fallbackAppUser,
                  ...dbUser,
                  status: dbUser.status === 'disabled' ? 'pending' : dbUser.status,
                };
              }),
              catchError((error) => {
                const message =
                  error?.error?.message ||
                  error?.message ||
                  'Failed to sync the logged-in user to the API.';
                console.error('User sync failed:', error);
                this.syncError.set(message);
                return of(fallbackAppUser);
              }),
            );
        }),
        catchError((error) => {
          console.error('Failed to read Auth0 ID token claims:', error);
          this.syncError.set(error?.message || 'Failed to read Auth0 ID token claims.');
          return of(fallbackAppUser);
        }),
      );
    }),
  );

  login(): void {
    if (!this.auth0 || !this.isConfigured) {
      return;
    }

    this.auth0.loginWithRedirect({
      appState: {
        target: '/',
      },
      authorizationParams: {
        scope: 'openid profile email',
      },
    });
  }

  logout(): void {
    this.auth0?.logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  }
}
