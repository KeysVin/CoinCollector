import test from "node:test";
import assert from "node:assert/strict";
import identifyCoin from "../netlify/functions/identify-coin.mjs";

const image = "data:image/jpeg;base64,/9j/AA==";

test("refuses requests without a GitHub token", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const response = await identifyCoin(new Request("https://example.test/", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("requires repository write permission before calling OpenAI", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ permissions: { push: false } });
  };
  try {
    const response = await identifyCoin(new Request("https://example.test/", {
      method: "POST", headers: { Authorization: "Bearer github-token" }
    }));
    assert.equal(response.status, 403);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns only sources found through web search", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes("api.github.com")
    ? Response.json({ permissions: { push: true } })
    : Response.json({ output: [
      { type: "web_search_call", action: { sources: [{ url: "https://example.org/coin" }] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        name: "Pièce test", year: "2025", country: "France", denomination: "2 €",
        metal: "", mint: "", notes: "", sources: [
          { title: "Vérifiée", url: "https://example.org/coin" },
          { title: "Inventée", url: "https://example.org/fake" }
        ]
      }) }] }
    ] });
  try {
    const response = await identifyCoin(new Request("https://example.test/", {
      method: "POST",
      headers: { Authorization: "Bearer github-token", "Content-Type": "application/json" },
      body: JSON.stringify({ images: [image] })
    }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.name, "Pièce test");
    assert.deepEqual(data.sources, [{ title: "Vérifiée", url: "https://example.org/coin" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
