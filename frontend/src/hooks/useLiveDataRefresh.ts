import { useEffect } from 'react';

export function useRefreshOnFocus(refresh: () => void | Promise<void>) {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);
}

export function usePollingWhile(
  enabled: boolean,
  refresh: () => void | Promise<void>,
  intervalMs = 5000,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, refresh]);
}
