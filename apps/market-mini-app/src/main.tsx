import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import App from './App';
import { applyStoredTheme, initializeTelegram } from './platform/telegram';
import './styles.css';

// Before the first paint. A remembered choice must not wait out the bridge, or
// someone who picked dark watches the app flash white for up to a second.
applyStoredTheme();

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// Signed initData is available from Telegram's URL fragment, so React and the
// launch request do not need to wait for a slow Android bridge script. Theme,
// ready/expand and haptics attach concurrently as soon as the bridge arrives.
void initializeTelegram();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
