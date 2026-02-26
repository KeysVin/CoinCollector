import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = req.headers.get("authorization") || "";
  const expected = process.env.ADMIN_KEY ? `Bearer ${process.env.ADMIN_KEY}` : "";
  if (!process.env.ADMIN_KEY || auth !== expected) return new Response("Unauthorized", { status: 401 });

  let body;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!body || body.version !== 2 || !Array.isArray(body.collections) || !Array.isArray(body.coins)) {
    return new Response("Bad backup format (expected v2)", { status: 400 });
  }

  const store = getStore("coincollector");
  const payload = { savedAt: new Date().toISOString(), backup: body };
  await store.set("latest", JSON.stringify(payload), { metadata: { contentType: "application/json" } });

  return new Response(JSON.stringify({ ok: true, savedAt: payload.savedAt }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
