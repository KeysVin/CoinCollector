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

    // Sauvegarde dans le stockage persistant Netlify Blobs
    const blob = new Blob([JSON.stringify({
      savedAt: new Date().toISOString(),
      backup: data
    })], { type: "application/json" });

    await globalThis.NETLIFY_BLOBS.put("coincollector-latest", blob);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return { statusCode: 500, body: "Save error" };
  }
};