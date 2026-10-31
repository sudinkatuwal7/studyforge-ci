/// <reference types="vite/client" />

// Makes an undeclared import.meta.env variable a compile error. Without this, Vite
// types it as `any`, so a misspelled name compiles and is undefined at runtime.
// New VITE_ variables must be declared in ImportMetaEnv below.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // OAuth client ID from Google Cloud; the Google button is disabled without it.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
