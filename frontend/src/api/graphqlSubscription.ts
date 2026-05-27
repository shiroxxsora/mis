import { createClient, type Client } from 'graphql-ws';

import keycloak from '../auth/keycloak';
import { resolveMisRole } from '../auth/roles';

import { GraphqlError } from './graphql';



let client: Client | null = null;



export function getGraphqlWsUrl(): string {

  const httpUrl = import.meta.env.VITE_GRAPHQL_URL ?? '/graphql';

  if (httpUrl.startsWith('http://') || httpUrl.startsWith('https://')) {

    const url = new URL(httpUrl);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    return url.toString();

  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const path = httpUrl.startsWith('/') ? httpUrl : `/${httpUrl}`;

  return `${protocol}//${window.location.host}${path}`;

}



export function getGraphqlSubscriptionClient(): Client {

  if (!client) {

    client = createClient({

      url: getGraphqlWsUrl(),

      lazy: true,

      lazyCloseTimeout: 5_000,

      retryAttempts: 5,

      shouldRetry: () => keycloak.authenticated === true,

      connectionParams: async () => {

        await keycloak.updateToken(30);

        const token = keycloak.token;

        if (!token) {

          throw new Error('Не авторизован');

        }

        const role = resolveMisRole(keycloak.tokenParsed);

        return {

          headers: {

            Authorization: `Bearer ${token}`,

            ...(role ? { 'x-hasura-role': role } : {}),

          },

        };

      },

    });

  }

  return client;

}



export function disposeGraphqlSubscriptionClient(): void {

  if (client) {

    client.dispose();

    client = null;

  }

}



export function subscribeGraphql<T>(

  query: string,

  variables: Record<string, unknown> | undefined,

  onData: (data: T) => void,

  onError?: (error: Error) => void,

): () => void {

  const wsClient = getGraphqlSubscriptionClient();

  let active = true;



  const unsubscribe = wsClient.subscribe(

    { query, variables },

    {

      next: (result) => {

        if (!active) {

          return;

        }

        if (result.errors?.length) {

          onError?.(

            new GraphqlError(result.errors.map((error) => error.message).join('; ')),

          );

          return;

        }

        if (result.data !== undefined) {

          onData(result.data as T);

        }

      },

      error: (error) => {

        if (!active) {

          return;

        }

        const message =

          error instanceof CloseEvent

            ? `WebSocket закрыт (${error.code})`

            : Array.isArray(error)

              ? error.map((item) => item.message).join('; ')

              : error instanceof Error

                ? error.message

                : 'Ошибка GraphQL subscription';

        onError?.(new GraphqlError(message));

      },

      complete: () => {},

    },

  );



  return () => {

    active = false;

    unsubscribe();

  };

}

