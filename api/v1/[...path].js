// Proxy same-origin ke Sinarcloud. Taruh di proyek Vercel: api/v1/[...path].js
// Base URL di app jadi: https://<app-kamu>.vercel.app/api/v1
export const config = { runtime: "edge" };

const TARGET = "https://ai.sinarcloud.com";

export default async function handler(req) {
  const u = new URL(req.url);
  const path = u.pathname.replace(/^\/api/, ""); // /api/v1/chat/completions -> /v1/chat/completions
  const headers = new Headers({
    "content-type": req.headers.get("content-type") || "application/json",
    authorization: req.headers.get("authorization") || "",
  });
  const res = await fetch(TARGET + path + u.search, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
