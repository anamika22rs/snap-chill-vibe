// Username-only accounts: each username maps to an internal sign-in identifier.
// No email is ever sent to it (email confirmation is off for this app).
export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}
export function usernameToLogin(u: string) {
  return `${normalizeUsername(u)}@users.chillsnap.app`;
}
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
