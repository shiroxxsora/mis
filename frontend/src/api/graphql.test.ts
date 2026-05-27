import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest } from './graphql';
import { authorizedFetch } from './authorizedFetch';

vi.mock('./authorizedFetch', () => ({
  authorizedFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(authorizedFetch);

describe('graphqlRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns data on success', async () => {
    const query = 'query Patients($limit: Int!) { patients(limit: $limit) { id } }';
    const variables = { limit: 10 };
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { patients: [] } }), { status: 200 }),
    );

    const data = await graphqlRequest<{ patients: unknown[] }>(query, variables);

    expect(data.patients).toEqual([]);
    expect(mockedFetch).toHaveBeenCalledWith(
      '/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      },
    );
  });

  it('throws GraphqlError on HTTP error', async () => {
    mockedFetch.mockResolvedValue(new Response('', { status: 500, statusText: 'Error' }));

    await expect(graphqlRequest('query')).rejects.toThrow('HTTP 500: Error');
  });

  it('throws GraphqlError when GraphQL returns errors', async () => {
    mockedFetch.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'permission denied' }] }), {
        status: 200,
      }),
    );

    await expect(graphqlRequest('query')).rejects.toThrow('permission denied');
  });

  it('throws GraphqlError when data is missing', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await expect(graphqlRequest('query')).rejects.toThrow('Пустой ответ GraphQL');
  });
});
