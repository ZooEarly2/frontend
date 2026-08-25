/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_TTS_MODE?: 'auto' | 'server' | 'browser';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
