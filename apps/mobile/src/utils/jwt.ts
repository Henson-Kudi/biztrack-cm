/**
 * Safely decode a JWT and return the `sub` (subject / user ID) claim.
 * Returns null if the token is missing, malformed, or the payload can't be parsed.
 * Does NOT verify the signature — only used to extract identity for local store seeding.
 */
export function decodeJwtSub(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // React Native's atob may not exist on all versions — use Buffer fallback
    const payload =
      typeof atob === 'function'
        ? atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    const parsed = JSON.parse(payload)
    return typeof parsed?.sub === 'string' ? parsed.sub : null
  } catch {
    return null
  }
}
