import keycloak from '../auth/keycloak';

async function bearerHeaders(init?: RequestInit): Promise<Headers> {
  await keycloak.updateToken(30);
  const token = keycloak.token;
  if (!token) {
    throw new Error('Не авторизован');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * fetch с Bearer JWT; при 401 — обновление токена и повтор, затем редирект на login.
 */
export async function authorizedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let response = await fetch(input, {
    ...init,
    headers: await bearerHeaders(init),
  });

  if (response.status !== 401) {
    return response;
  }

  try {
    await keycloak.updateToken(-1);
  } catch {
    keycloak.login();
    throw new Error('Сессия истекла, выполняется вход…');
  }

  const retryToken = keycloak.token;
  if (!retryToken) {
    keycloak.login();
    throw new Error('Сессия истекла, выполняется вход…');
  }

  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set('Authorization', `Bearer ${retryToken}`);
  response = await fetch(input, { ...init, headers: retryHeaders });

  if (response.status === 401) {
    keycloak.login();
    throw new Error('Сессия истекла, выполняется вход…');
  }

  return response;
}
