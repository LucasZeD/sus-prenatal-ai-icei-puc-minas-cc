function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/**
 * Base HTTP da API (`VITE_API_BASE_URL`).
 * - `"/"` ou vazio: mesma origem do browser (Docker: nginx faz proxy de `/api`, `/ws`, `/health`, …).
 * - URL absoluta: dev local ou API em outro host (ex.: `http://127.0.0.1:3000`).
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === null) {
    return "http://localhost:3000";
  }
  const s = String(raw).trim();
  if (s === "" || s === "/") {
    return "";
  }
  return trimSlash(s);
}

/** Base WebSocket derivada da URL da API (`http`→`ws`, `https`→`wss`). Com API na mesma origem, usa `window.location`. */
export function getWsBaseUrl(): string {
  const http = getApiBaseUrl();
  if (!http) {
    if (typeof window === "undefined") {
      return "ws://127.0.0.1:3000";
    }
    const { protocol, host } = window.location;
    return protocol === "https:" ? `wss://${host}` : `ws://${host}`;
  }
  if (http.startsWith("https://")) {
    return `wss://${http.slice("https://".length)}`;
  }
  if (http.startsWith("http://")) {
    return `ws://${http.slice("http://".length)}`;
  }
  return `ws://${http}`;
}
