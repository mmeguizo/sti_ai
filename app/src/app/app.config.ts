import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAuth0 } from '@auth0/auth0-angular';
import { routes } from './app.routes';
import { appSettings, isAuth0Configured } from './app.settings';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    ...(isAuth0Configured()
      ? [
          provideAuth0({
            domain: appSettings.auth0.domain,
            clientId: appSettings.auth0.clientId,
            authorizationParams: {
              redirect_uri: window.location.origin,
              scope: 'openid profile email',
              ...(appSettings.auth0.audience ? { audience: appSettings.auth0.audience } : {}),
            },
          }),
        ]
      : []),
  ],
};
