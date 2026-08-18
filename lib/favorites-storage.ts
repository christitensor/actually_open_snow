// Shared between lib/favorites.ts (the localStorage-backed store itself)
// and lib/auth.tsx (which needs to read the pre-account list once, right
// after sign-in, to import it into the new account) — kept out of both so
// neither has to import the other.
export const FAVORITES_STORAGE_KEY = "actually-open-snow:favorites";
export const FAVORITES_CHANGE_EVENT = "actually-open-snow:favorites-changed";
