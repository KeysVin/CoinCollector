const DATA_URLS = ["/data/coins-meta.json", "/data/coins-meta.example.json"];
const state = { data: null, coins: [], collections: [], filtered: [], view: "gallery", map: null, mapBuilt: false };
const $ = (s) => document.querySelector(s);
const els = {
  status: $("#statusMessage"), grid: $("#coinGrid"), search: $("#searchInput"), collection: $("#collectionFilter"),
  yearMin: $("#yearMin"), yearMax: $("#yearMax"), sort: $("#sortSelect"), visible: $("#visibleCount"),
  hero: $("#heroCount"), dialog: $("#coinDialog"), dialogContent: $("#dialogContent"), stats: $("#statsGrid"), mapNotice: $("#mapNotice")
};

function esc(value = "") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function collectionName(id) { return state.collections.find(c => c.id === id)?.name || "Sans collection"; }
function imageUrls(coin) {
  if (Array.isArray(coin.images) && coin.images.length) return coin.images.map(p => p.startsWith("http") ? p : `/${p.replace(/^\//, "")}`);
  return (coin.imageIds || []).map(id => `/data/images/${coin.id}/${id}.jpg`);
}
function countryFromLocation(location = "") { const p = location.split(",").map(x => x.trim()).filter(Boolean); return p.at(-1) || "Non renseigné"; }

async function loadData() {
  for (const url of DATA_URLS) {
    try {
      const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      state.data = data; state.coins = Array.isArray(data.coins) ? data.coins : []; state.collections = Array.isArray(data.collections) ? data.collections : [];
      return;
    } catch (_) {}
  }
  throw new Error("Le fichier data/coins-meta.json est introuvable.");
}

function initFilters() {
  [...state.collections].sort((a,b) => a.name.localeCompare(b.name, "fr")).forEach(c => {
    const option = document.createElement("option"); option.value = c.id; option.textContent = c.name; els.collection.append(option);
  });
  [els.search, els.collection, els.yearMin, els.yearMax, els.sort].forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", applyFilters));
  $("#resetFilters").addEventListener("click", () => { els.search.value=""; els.collection.value=""; els.yearMin.value=""; els.yearMax.value=""; els.sort.value="recent"; applyFilters(); });
}

function applyFilters() {
  const q = els.search.value.trim().toLocaleLowerCase("fr"); const col = els.collection.value;
  const min = Number(els.yearMin.value) || -Infinity; const max = Number(els.yearMax.value) || Infinity;
  state.filtered = state.coins.filter(c => {
    const hay = [c.name,c.location,c.year,c.notes,c.country,c.mint,c.metal,c.denomination,(c.tags||[]).join(" ")].join(" ").toLocaleLowerCase("fr");
    return (!q || hay.includes(q)) && (!col || c.collectionId === col) && (Number(c.year)||0) >= min && (Number(c.year)||0) <= max;
  });
  const sorters = {
    recent: (a,b) => String(b.createdAt||"").localeCompare(String(a.createdAt||"")),
    name: (a,b) => String(a.name||"").localeCompare(String(b.name||""), "fr"),
    "year-desc": (a,b) => (Number(b.year)||0)-(Number(a.year)||0),
    "year-asc": (a,b) => (Number(a.year)||0)-(Number(b.year)||0)
  };
  state.filtered.sort(sorters[els.sort.value] || sorters.recent);
  els.visible.textContent = state.filtered.length;
  renderGallery(); renderStats(); if (state.view === "map") buildMap(true);
}

function renderGallery() {
  els.grid.innerHTML = "";
  if (!state.filtered.length) { els.grid.innerHTML = '<div class="empty-state"><strong>Aucune pièce trouvée</strong><br>Modifie les filtres pour élargir la recherche.</div>'; return; }
  const fragment = document.createDocumentFragment();
  state.filtered.forEach(coin => {
    const card = document.createElement("article"); card.className = "coin-card"; card.tabIndex = 0;
    const images = imageUrls(coin); const visual = images[0] ? `<img src="${esc(images[0])}" alt="${esc(coin.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=coin-placeholder>◉</div>'">` : '<div class="coin-placeholder">◉</div>';
    card.innerHTML = `<div class="coin-visual">${visual}<span class="coin-badge">${esc(collectionName(coin.collectionId))}</span></div><div class="coin-body"><h3>${esc(coin.name || "Sans nom")}</h3><div class="coin-meta"><span>${coin.year ? `◷ ${esc(coin.year)}` : "Année inconnue"}</span><span>${coin.location ? `⌖ ${esc(coin.location)}` : "Lieu inconnu"}</span></div>${coin.notes ? `<p class="coin-notes">${esc(coin.notes)}</p>` : ""}</div>`;
    card.addEventListener("click", () => openCoin(coin)); card.addEventListener("keydown", e => { if (e.key === "Enter") openCoin(coin); }); fragment.append(card);
  });
  els.grid.append(fragment);
}

function detailItem(label, value) { return value ? `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : ""; }
function openCoin(coin) {
  const images = imageUrls(coin); const gallery = images.length ? `<div class="dialog-main-image"><img id="dialogMainImg" src="${esc(images[0])}" alt="${esc(coin.name)}"></div><div class="dialog-thumbs">${images.map((src,i)=>`<button class="dialog-thumb ${i===0?'is-active':''}" data-src="${esc(src)}"><img src="${esc(src)}" alt="Photo ${i+1}"></button>`).join("")}</div>` : '<div class="dialog-main-image"><div class="coin-placeholder">◉</div></div>';
  els.dialogContent.innerHTML = `<div class="dialog-layout"><div class="dialog-gallery">${gallery}</div><div class="dialog-details"><div class="dialog-kicker">${esc(collectionName(coin.collectionId))}</div><h2>${esc(coin.name||"Sans nom")}</h2><div class="dialog-location">${esc(coin.location||"Lieu non renseigné")}</div><div class="detail-list">${detailItem("Année",coin.year)}${detailItem("Pays",coin.country||countryFromLocation(coin.location))}${detailItem("Valeur",coin.denomination)}${detailItem("Métal",coin.metal)}${detailItem("État",coin.condition)}${detailItem("Atelier",coin.mint)}${detailItem("Quantité",coin.quantity)}${detailItem("Estimation",coin.estimatedValue ? `${coin.estimatedValue} €` : "")}</div>${coin.notes ? `<div class="dialog-notes">${esc(coin.notes)}</div>` : ""}</div></div>`;
  els.dialogContent.querySelectorAll(".dialog-thumb").forEach(btn => btn.addEventListener("click", () => { $("#dialogMainImg").src = btn.dataset.src; els.dialogContent.querySelectorAll(".dialog-thumb").forEach(b=>b.classList.remove("is-active")); btn.classList.add("is-active"); }));
  els.dialog.showModal();
}

function switchView(view) {
  state.view = view; document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("is-active", b.dataset.view===view));
  document.querySelectorAll(".view-panel").forEach(p=>p.classList.remove("is-active")); $(`#${view}View`).classList.add("is-active");
  if (view === "map") setTimeout(() => buildMap(), 0); if (view === "stats") renderStats();
}

function buildMap(force = false) {
  if (!window.L) { els.mapNotice.textContent = "La carte n’a pas pu être chargée."; return; }
  if (!state.map) { state.map = L.map("map", { scrollWheelZoom: false }).setView([46.6, 2.5], 5); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(state.map); }
  if (state.markerLayer) state.markerLayer.remove(); state.markerLayer = L.layerGroup().addTo(state.map);
  const geo = state.data?.geoMap || {}; const bounds=[]; let count=0;
  state.filtered.forEach(coin => { const point=geo[coin.location]; if (!point) return; count++; bounds.push([point.lat,point.lon]); const marker=L.circleMarker([point.lat,point.lon],{radius:8,color:"#fff",weight:2,fillColor:"#173f35",fillOpacity:.92}).addTo(state.markerLayer); marker.bindPopup(`<strong>${esc(coin.name)}</strong><br>${esc(coin.location||"")}<br>${esc(coin.year||"")}`); });
  if (bounds.length) state.map.fitBounds(bounds,{padding:[35,35],maxZoom:10}); else state.map.setView([46.6,2.5],5);
  els.mapNotice.textContent = `${count} pièce${count>1?"s":""} positionnée${count>1?"s":""} sur la carte.`; setTimeout(()=>state.map.invalidateSize(),100);
}

function topCounts(values, limit=8) { const map={}; values.filter(Boolean).forEach(v=>map[v]=(map[v]||0)+1); return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,limit); }
function bars(title, rows) { const max=rows[0]?.[1]||1; return `<section class="chart-card"><h3>${esc(title)}</h3>${rows.length?rows.map(([l,n])=>`<div class="bar-item"><span class="bar-label" title="${esc(l)}">${esc(l)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(n/max*100)}%"></span></span><strong>${n}</strong></div>`).join(""):"<p>Aucune donnée.</p>"}</section>`; }
function renderStats() {
  const coins=state.filtered; const years=coins.map(c=>Number(c.year)).filter(y=>y>0); const countries=topCounts(coins.map(c=>c.country||countryFromLocation(c.location))); const collections=topCounts(coins.map(c=>collectionName(c.collectionId)));
  els.stats.innerHTML = `<div class="stat-card"><strong>${coins.length}</strong><span>Pièces affichées</span></div><div class="stat-card"><strong>${new Set(coins.map(c=>c.collectionId).filter(Boolean)).size}</strong><span>Collections</span></div><div class="stat-card"><strong>${new Set(coins.map(c=>c.country||countryFromLocation(c.location)).filter(Boolean)).size}</strong><span>Pays</span></div><div class="stat-card"><strong>${years.length?Math.min(...years):"—"}</strong><span>Plus ancienne</span></div>${bars("Principaux pays",countries)}${bars("Répartition par collection",collections)}`;
}

$("#closeDialog").addEventListener("click",()=>els.dialog.close()); els.dialog.addEventListener("click",e=>{if(e.target===els.dialog)els.dialog.close();});
document.querySelectorAll(".nav-button").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));

(async function init(){
  try { await loadData(); els.hero.textContent=state.coins.length; els.status.textContent=""; initFilters(); applyFilters(); if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{}); }
  catch(error) { els.status.innerHTML = `<strong>Collection indisponible.</strong><br>${esc(error.message)}<br><small>Conserve le dossier <code>data</code> de ton ancien dépôt lors de l’installation.</small>`; }
})();
