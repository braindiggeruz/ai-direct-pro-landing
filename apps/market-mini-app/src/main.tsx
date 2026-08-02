import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import App from './App';
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

initializeTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
