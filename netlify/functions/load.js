exports.handler = async () => {
  try {
    const blob = await globalThis.NETLIFY_BLOBS.get("coincollector-latest");

    if (!blob) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, message: "No data yet" })
      };
    }

    const text = await blob.text();

    return {
      statusCode: 200,
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: "Load error" };
  }
};