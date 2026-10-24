/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** 'true' のときだけログイン画面に「Microsoft でログイン」を出す（本番の Auth 設定が済んでから Vercel に入れる） */
  readonly VITE_ENABLE_MICROSOFT_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json の version（vite.config.ts の define） */
declare const __APP_VERSION__: string;
