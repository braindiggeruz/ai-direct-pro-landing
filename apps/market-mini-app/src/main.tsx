import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import App from './App';
import { launchQueryOptions } from './lib/api';
import { initializeTelegram } from './platform/telegram';
import './styles.css';

onlineManager.setEventListener((setOnline) => {
  const online = () => setOnline(true);
  const offline = () => setOnline(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
});

const client = new QueryClient({
  queryCache: new QueryCache({
    onError: () => {
      // Errors are projected by screen states; never log response or PII.
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
      gcTime: 10 * 60_000,
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});

const root = document.getElementById('root')!;
const mount = () => createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// Keep the filled, zero-JS catalog shell on screen while the signed launch
// request runs. Once the query is settled React hydrates from the cache, so
// users never trade visible products and prices for a blocking spinner.
void client.prefetchQuery(launchQueryOptions).finally(mount);

// Signed initData is available from Telegram's URL fragment, so React and the
// launch request do not need to wait for a slow Android bridge script. Theme,
// ready/expand and haptics attach concurrently as soon as the bridge arrives.
void initializeTelegram();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
