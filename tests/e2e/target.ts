/** Fixture overrides accept an exact loopback HTTP origin, never a cloud target. */
export function fixtureOrigin(value: string | undefined, fallback: string): string {
  const candidate = value === undefined ? fallback : value;
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.origin === candidate) return candidate;
  } catch { /* Use the same safe failure for malformed or unauthorized values. */ }
  throw new Error("Fixture verification targets must be exact loopback HTTP origins without paths or credentials.");
}

export const apiOrigin = fixtureOrigin(process.env.VIBEESTIMATE_E2E_API_ORIGIN, "http://127.0.0.1:8080");
export const appOrigin = fixtureOrigin(process.env.VIBEESTIMATE_E2E_BASE_URL, "http://127.0.0.1:3000");
