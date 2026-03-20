const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
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

    const store = getStore({
      name: "coincollector",
      siteID: context.site?.id || process.env.SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN || context.token,
    });

    const payload = {
      savedAt: new Date().toISOString(),
      backup: data,
    };

    await store.setJSON("latest", payload);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, savedAt: payload.savedAt }),
    };
  } catch (e) {
    console.error("Save error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
