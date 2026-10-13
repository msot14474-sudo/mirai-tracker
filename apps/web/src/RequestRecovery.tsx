import {
  Component,
  type ReactNode,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function RequestRecovery() {
  const client = useQueryClient();
  const [, render] = useReducer((value) => value + 1, 0);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => client.getQueryCache().subscribe(() => render()), [client]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const failed = client
    .getQueryCache()
    .getAll()
    .filter(
      (query) =>
        query.getObserversCount() > 0 && query.state.status === 'error',
    );
  if (online && !failed.length) return null;
  const retrying = failed.some(
    (query) => query.state.fetchStatus === 'fetching',
  );
  return (
    <div className="request-recovery" role="status">
      <span>
        {!online
          ? 'You are offline. Reconnect to load current data.'
          : 'Some data could not be refreshed. Previously loaded data may be out of date.'}
      </span>
      {online ? (
        <button
          type="button"
          disabled={retrying}
          onClick={() =>
            void client.refetchQueries({
              type: 'active',
              predicate: (query) => query.state.status === 'error',
            })
          }
        >
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      ) : null}
    </div>
  );
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="request-recovery" role="alert">
          <span>
            This page could not be displayed. Reload to try again. Unsaved
            changes may be lost.
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    return this.props.children;
  }
}
