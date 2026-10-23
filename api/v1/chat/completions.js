export const config = { runtime: "edge" };

export default async function handler(req) {
  const res = await fetch("https://ai.sinarcloud.com/v1/chat/completions", {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") || "application/json",
      authorization: req.headers.get("authorization") || "",
    },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
  });
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(res.body, { status: res.status, headers: out });
}
