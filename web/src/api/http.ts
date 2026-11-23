// Shared fetch plumbing for the real backend (api/real/) — split out of client.ts so api/real/
// can use it without a client.ts <-> api/real import cycle.

import { API_BASE } from "../config";
import { ApiError } from "./backend";

export { ApiError };

export async function http<T>(path: string, init?: RequestInit, as: "json" | "blob" = "json"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "Backend offline");
  }
  if (!res.ok) {
    // 502-504 with no body is the dev proxy (or a gateway) failing to reach the server.
    let detail = res.status >= 502 && res.status <= 504 ? "Backend offline" : `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // not JSON (e.g. a proxy error page): keep the status line
    }
    throw new ApiError(res.status, detail);
  }
  return (as === "blob" ? res.blob() : res.json()) as Promise<T>;
}

export const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
