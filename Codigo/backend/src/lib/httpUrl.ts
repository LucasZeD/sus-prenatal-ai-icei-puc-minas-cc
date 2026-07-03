/** Garante esquema http(s) para fetch (ex.: `127.0.0.1:11434` -> `http://127.0.0.1:11434`). */
export function normalizeHttpBase(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) {
    return "";
  }
  if (/^https?:\/\//i.test(t)) {
    return t.replace(/\/$/, "");
  }
  return `http://${t.replace(/\/$/, "")}`;
}
