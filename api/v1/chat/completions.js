export const config = { runtime: "edge" };

const TARGET = "https://api.ontoken.id/v1";

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Token dari app (kolom "API key")
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const code = process.env.ACCESS_CODE;
  const serverKey = process.env.SINARCLOUD_API_KEY;

  // Kalau token = ACCESS_CODE, pakai key dari env. Selain itu, teruskan key milik pengguna seperti sekarang.
  const key = code && serverKey && bearer === code ? serverKey : bearer;

  const res = await fetch(TARGET, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: req.body,
  });
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(res.body, { status: res.status, headers: out });
}
