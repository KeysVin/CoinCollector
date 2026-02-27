exports.handler = async (event, context) => {
  const raw = await context.env.COIN_STORE.get("latest");

  if (!raw) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, message: "No data yet" })
    };
  }

  return {
    statusCode: 200,
    body: raw
  };
};