const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  try {
    const store = getStore({
      name: "coincollector",
      siteID: context.site?.id || process.env.SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN || context.token,
    });

    const data = await store.get("latest", { type: "json" });

    if (!data) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, message: "No data yet" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error("Load error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
