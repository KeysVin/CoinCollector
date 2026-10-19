const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "year", "country", "denomination", "metal", "mint", "notes", "sources"],
  properties: {
    name: { type: "string" },
    year: { type: "string" },
    country: { type: "string" },
    denomination: { type: "string" },
    metal: { type: "string" },
    mint: { type: "string" },
    notes: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } }
      }
    }
  }
};

export default async function identifyCoin(request) {
  if (request.method !== "POST") return reply(405, { error: "Méthode non autorisée." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return reply(503, { error: "L’IA n’est pas configurée. Ajoute OPENAI_API_KEY dans les variables Netlify des fonctions." });
  const token = /^Bearer (.+)$/i.exec(request.headers.get("Authorization") || "")?.[1];
  if (!token) return reply(401, { error: "Connecte l’administration à GitHub." });

  try {
    const owner = process.env.COINCOLLECTOR_OWNER || "KeysVin";
    const repoName = process.env.COINCOLLECTOR_REPO || "CoinCollector";
    const repo = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!repo.ok || !(await repo.json()).permissions?.push) {
      return reply(403, { error: "Le token GitHub doit pouvoir modifier ce dépôt." });
    }

    const body = await request.json();
    if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 3 ||
      body.images.some(image => typeof image !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 4_000_000)) {
      return reply(400, { error: "Envoie de 1 à 3 photos JPEG de moins de 3 Mo chacune." });
    }
    const hint = typeof body.hint === "string" ? body.hint.slice(0, 250) : "";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        store: false,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Identifie cette pièce de collection à partir de ses photos. Indice donné par l'utilisateur : ${hint || "aucun"}. Fais une recherche web pour vérifier les informations. Réponds en français. N'invente ni année, ni pays, ni source : laisse une chaîne vide si l'information est incertaine. Les sources doivent être les pages réellement consultées. Pour les notes, distingue les indices visibles des hypothèses. Ne propose pas de prix.` },
            ...body.images.map(image => ({ type: "input_image", image_url: image, detail: "high" }))
          ]
        }],
        text: { format: { type: "json_schema", name: "coin_identification", strict: true, schema } }
      })
    });
    const result = await response.json();
    if (!response.ok) return reply(502, { error: result.error?.message || "Le service d’IA n’a pas répondu." });
    const text = result.output?.filter(item => item.type === "message")
      .flatMap(item => item.content || [])
      .find(item => item.type === "output_text")?.text;
    if (!text) return reply(502, { error: "L’IA n’a pas produit de fiche exploitable." });
    const suggestion = JSON.parse(text);
    const webSources = result.output?.filter(item => item.type === "web_search_call")
      .flatMap(item => item.action?.sources || []).map(source => source.url) || [];
    suggestion.sources = [...new Set(webSources)].filter(url => {
      try { return new URL(url).protocol === "https:"; } catch { return false; }
    }).slice(0, 5).map(url => ({
      url,
      title: suggestion.sources?.find(source => source.url === url)?.title || new URL(url).hostname
    }));
    return reply(200, suggestion);
  } catch {
    return reply(502, { error: "L’identification a échoué. Réessaie avec des photos plus nettes." });
  }
}
