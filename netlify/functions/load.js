import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("coincollector");
  const raw = await store.get("latest", { type: "text" });

  if (!raw) {
    return new Response(JSON.stringify({ ok: false, message: "No data yet" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(raw, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
