const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
    const expected = process.env.ADMIN_KEY ? `Bearer ${process.env.ADMIN_KEY}` : "";

    if (!process.env.ADMIN_KEY || auth !== expected) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON" };
    }

    // Validation light backup v2
    if (!body || body.version !== 2 || !Array.isArray(body.collections) || !Array.isArray(body.coins)) {
      return { statusCode: 400, body: "Bad backup format (expected v2)" };
    }

    const store = getStore("coincollector");
    const payload = { savedAt: new Date().toISOString(), backup: body };

    await store.set("latest", JSON.stringify(payload), {
      metadata: { contentType: "application/json" },
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, savedAt: payload.savedAt }),
    };
  } catch (err) {
    // Pour voir l'erreur dans les logs Netlify
    console.error("SAVE_ERROR", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
