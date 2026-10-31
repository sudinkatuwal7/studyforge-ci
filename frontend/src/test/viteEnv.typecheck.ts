// Checked by `tsc -b` (part of `npm run build`); nothing imports this file, so it
// never reaches the bundle. If strictImportMetaEnv is removed from vite-env.d.ts,
// the typo below compiles, the directive is unused, and the build fails.

// @ts-expect-error A misspelled variable must not compile: it would silently disable Google sign-in.
export const misspelledClientId = import.meta.env.VITE_GOOGLE_CLIENTID;

export const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID;
