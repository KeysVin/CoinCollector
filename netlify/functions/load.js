exports.handler = async () => {
  try {
    const cache = await caches.open("coincollector");
    const response = await cache.match("latest");

    if (!response) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, message: "No data yet" })
      };
    }

    const text = await response.text();

    return {
      statusCode: 200,
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: "Load error" };
  }
};