function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Base HTTP da API (Vite: `VITE_API_BASE_URL`). */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  const v = typeof raw === "string" && raw.trim() ? trimSlash(raw.trim()) : "http://localhost:3000";
  return v;
}

/** Base WebSocket derivada da URL da API (`http`→`ws`, `https`→`wss`). */
export function getWsBaseUrl(): string {
  const http = getApiBaseUrl();
  if (http.startsWith("https://")) {
    return `wss://${http.slice("https://".length)}`;
  }
  if (http.startsWith("http://")) {
    return `ws://${http.slice("http://".length)}`;
  }
  return `ws://${http}`;
}
