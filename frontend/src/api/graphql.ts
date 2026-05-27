import { authorizedFetch } from './authorizedFetch';
import keycloak from '../auth/keycloak';
import { resolveMisRole } from '../auth/roles';

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export class GraphqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphqlError';
  }
}

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? '/graphql';

function hasuraRoleHeaders(): Record<string, string> {
  const role = resolveMisRole(keycloak.tokenParsed);
  return role ? { 'x-hasura-role': role } : {};
}

export async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await authorizedFetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...hasuraRoleHeaders(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GraphqlError(`HTTP ${response.status}: ${response.statusText}`);
  }

  const body = (await response.json()) as GraphqlResponse<T>;

  if (body.errors?.length) {
    throw new GraphqlError(body.errors.map((e) => e.message).join('; '));
  }

  if (body.data === undefined) {
    throw new GraphqlError('Пустой ответ GraphQL');
  }

  return body.data;
}
