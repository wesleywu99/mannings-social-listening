export function isAuthorized(token: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  return token === expected;
}
