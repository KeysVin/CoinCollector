const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const store = getStore("coincollector");
    const raw = await store.get("latest", { type: "text" });

    if (!raw) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, message: "No data yet" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: raw,
    };
  } catch (err) {
    console.error("LOAD_ERROR", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
