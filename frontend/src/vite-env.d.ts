/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Show one-click demo logins on the sign-in page in production builds (always shown in dev). */
  readonly VITE_SHOW_DEMO_LOGINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
