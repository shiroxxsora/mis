import { describe, expect, it } from 'vitest';
import { getGraphqlWsUrl } from './graphqlSubscription';

describe('getGraphqlWsUrl', () => {
  it('converts relative graphql path to ws url', () => {
    expect(getGraphqlWsUrl()).toMatch(/^wss?:\/\/.+\/graphql$/);
  });
});
