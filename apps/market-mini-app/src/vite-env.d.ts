/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKET_API_BASE_URL?: string;
  readonly VITE_MARKET_DEV_INIT_DATA?: string;
  readonly VITE_MARKET_DEV_MODE?: 'fixture' | 'signed';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
