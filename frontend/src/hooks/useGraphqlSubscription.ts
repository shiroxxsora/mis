import { useEffect, useState } from 'react';
import { graphqlRequest } from '../api/graphql';
import { subscribeGraphql } from '../api/graphqlSubscription';

const POLL_INTERVAL_MS = 5_000;

function subscriptionToQuery(subscription: string): string {
  return subscription.replace(/^\s*subscription\s+\w+/i, 'query LiveQuery');
}

export type GraphqlTransport = 'ws' | 'poll';

export function useGraphqlSubscription<T>(
  query: string,
  variables?: Record<string, unknown>,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [transport, setTransport] = useState<GraphqlTransport>('ws');
  const variablesKey = JSON.stringify(variables ?? {});

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      setTransport('ws');
      return;
    }

    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let pollingStarted = false;

    const applyData = (payload: T) => {
      if (!active) {
        return;
      }
      setData(payload);
      setLoading(false);
    };

    const applyError = (subscriptionError: Error) => {
      if (!active) {
        return;
      }
      setError(subscriptionError);
      setLoading(false);
    };

    const startPolling = (reason: Error) => {
      if (pollingStarted || !active) {
        return;
      }
      pollingStarted = true;
      setTransport('poll');
      applyError(reason);

      const poll = async () => {
        if (!active) {
          return;
        }
        try {
          const payload = await graphqlRequest<T>(
            subscriptionToQuery(query),
            variables,
          );
          applyData(payload);
        } catch (pollError) {
          applyError(
            pollError instanceof Error
              ? pollError
              : new Error('Ошибка GraphQL polling'),
          );
        }
      };

      void poll();
      pollTimer = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    setData(null);
    setError(null);
    setLoading(true);
    setTransport('ws');

    let wsUnsubscribed = false;
    const unsubscribeWs = subscribeGraphql<T>(
      query,
      variables,
      applyData,
      (subscriptionError) => {
        if (wsUnsubscribed) {
          return;
        }
        wsUnsubscribed = true;
        unsubscribeWs();
        startPolling(subscriptionError);
      },
    );

    return () => {
      active = false;
      wsUnsubscribed = true;
      unsubscribeWs();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [query, variablesKey, enabled]);

  return { data, error, loading, transport };
}
