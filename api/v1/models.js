export const config = { runtime: "edge" };

export default async function handler(req) {
  const res = await fetch("https://ai.sinarcloud.com/v1/models", {
    headers: { authorization: req.headers.get("authorization") || "" },
  });
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(res.body, { status: res.status, headers: out });
}
