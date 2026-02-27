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

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // Stockage persistant Netlify KV
  await context.env.COIN_STORE.put("latest", JSON.stringify({
    savedAt: new Date().toISOString(),
    backup: data
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};