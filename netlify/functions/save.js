exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const auth = event.headers.authorization || "";
  const expected = process.env.ADMIN_KEY
    ? `Bearer ${process.env.ADMIN_KEY}`
    : "";

  if (!process.env.ADMIN_KEY || auth !== expected) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const data = JSON.parse(event.body);

    // Stockage simple via Netlify Cache API
    const cache = await caches.open("coincollector");
    const response = new Response(JSON.stringify({
      savedAt: new Date().toISOString(),
      backup: data
    }), { headers: { "Content-Type": "application/json" } });

    await cache.put("latest", response);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: "Save error" };
  }
};