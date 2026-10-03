/**
 * Substituto leve de "tldts" (Public Suffix List, ~100 KB gzip) no bundle.
 * O pacote só é usado pelo cookie store do MSW (via tough-cookie → getDomain); a aplicação
 * não usa cookies (o token fica em localStorage), então um domínio registrável aproximado basta.
 */
export function getDomain(hostname: string, _options?: unknown): string | null {
  const host = hostname.replace(/^\.+/, "").toLowerCase()
  if (!host) return null
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host
  const parts = host.split(".")
  return parts.length <= 2 ? host : parts.slice(-2).join(".")
}
