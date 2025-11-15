/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_FEATURE_DEV_BOTS_LAYOUT?: string;
  readonly VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB?: string;
  readonly VITE_FEATURE_TABBED_MONITOR_LAYOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
