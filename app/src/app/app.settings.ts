export const appSettings = {
  auth0: {
    domain: 'dev-hte6ekrcmpejgmww.au.auth0.com',
    clientId: 'LrqtZdycPuTrOrAPqSHorJiWqFMgvuD2',
    audience: '',
  },
};

export function isAuth0Configured(): boolean {
  return Boolean(appSettings.auth0.domain && appSettings.auth0.clientId);
}
