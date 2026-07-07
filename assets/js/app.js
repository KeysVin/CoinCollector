const DATA_URLS = [
  "/data/coins-meta.json",
  "/data/coins-meta.example.json"
];

const state = {
  data: null,
  coins: [],
  collections: [],
  filtered: [],
  view: "gallery",
  map: null,
  markerLayer: null
};

const $ = selector => document.querySelector(selector);

const els = {
  status: $("#statusMessage"),
  grid: $("#coinGrid"),
  search: $("#searchInput"),
  collection: $("#collectionFilter"),
  yearMin: $("#yearMin"),
  yearMax: $("#yearMax"),
  sort: $("#sortSelect"),
  visible: $("#visibleCount"),
  hero: $("#heroCount"),
  dialog: $("#coinDialog"),
  dialogContent: $("#dialogContent"),
  stats: $("#statsGrid"),
  mapNotice: $("#mapNotice")
};

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function collectionName(id) {
  return state.collections.find(collection => collection.id === id)?.name
    || "Sans collection";
}

function imageUrls(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) {
    return coin.images.map(path =>
      path.startsWith("http")
        ? path
        : `/${path.replace(/^\//, "")}`
    );
  }

  return (coin.imageIds || []).map(
    imageId => `/data/images/${coin.id}/${imageId}.jpg`
  );
}

function countryFromLocation(location = "") {
  const parts = location
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

  return parts.at(-1) || "Non renseigné";
}

async function loadData() {
  for (const url of DATA_URLS) {
    try {
      const response = await fetch(
        `${url}?v=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      state.data = data;
      state.coins = Array.isArray(data.coins) ? data.coins : [];
      state.collections = Array.isArray(data.collections)
        ? data.collections
        : [];

      return;
    } catch (error) {
      console.warn(`Chargement impossible depuis ${url}`, error);
    }
  }

  throw new Error(
    "Le fichier data/coins-meta.json est introuvable."
  );
}

function initFilters() {
  [...state.collections]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .forEach(collection => {
      const option = document.createElement("option");

      option.value = collection.id;
      option.textContent = collection.name;

      els.collection.append(option);
    });

  [
    els.search,
    els.collection,
    els.yearMin,
    els.yearMax,
    els.sort
  ].forEach(element => {
    const eventName = element.tagName === "SELECT"
      ? "change"
      : "input";

    element.addEventListener(eventName, applyFilters);
  });

  $("#resetFilters").addEventListener("click", () => {
    els.search.value = "";
    els.collection.value = "";
    els.yearMin.value = "";
    els.yearMax.value = "";
    els.sort.value = "recent";

    applyFilters();
  });
}

function applyFilters() {
  const search = els.search.value
    .trim()
    .toLocaleLowerCase("fr");

  const selectedCollection = els.collection.value;

  const minimumYear = Number(els.yearMin.value) || -Infinity;
  const maximumYear = Number(els.yearMax.value) || Infinity;

  state.filtered = state.coins.filter(coin => {
    const searchableText = [
      coin.name,
      coin.location,
      coin.year,
      coin.notes,
      coin.country,
      coin.mint,
      coin.metal,
      coin.denomination,
      (coin.tags || []).join(" ")
    ]
      .join(" ")
      .toLocaleLowerCase("fr");

    const coinYear = Number(coin.year) || 0;

    return (
      (!search || searchableText.includes(search))
      && (
        !selectedCollection
        || coin.collectionId === selectedCollection
      )
      && coinYear >= minimumYear
      && coinYear <= maximumYear
    );
  });

  const sorters = {
    recent: (a, b) =>
      String(b.createdAt || "")
        .localeCompare(String(a.createdAt || "")),

    name: (a, b) =>
      String(a.name || "")
        .localeCompare(String(b.name || ""), "fr"),

    "year-desc": (a, b) =>
      (Number(b.year) || 0) - (Number(a.year) || 0),

    "year-asc": (a, b) =>
      (Number(a.year) || 0) - (Number(b.year) || 0)
  };

  state.filtered.sort(
    sorters[els.sort.value] || sorters.recent
  );

  els.visible.textContent = state.filtered.length;

  renderGallery();
  renderStats();

  if (state.view === "map") {
    buildMap();
  }
}

function renderGallery() {
  els.grid.innerHTML = "";

  if (state.filtered.length === 0) {
    els.grid.innerHTML = `
      <div class="empty-state">
        <strong>Aucune pièce trouvée</strong>
        <br>
        Modifie les filtres pour élargir la recherche.
      </div>
    `;

    return;
  }

  const fragment = document.createDocumentFragment();

  state.filtered.forEach(coin => {
    const card = document.createElement("article");

    card.className = "coin-card";
    card.tabIndex = 0;

    const images = imageUrls(coin);

    const visual = images[0]
      ? `
        <img
          src="${esc(images[0])}"
          alt="${esc(coin.name)}"
          loading="lazy"
          onerror="
            this.parentElement.innerHTML =
            '<div class=coin-placeholder>◉</div>'
          "
        >
      `
      : `<div class="coin-placeholder">◉</div>`;

    card.innerHTML = `
      <div class="coin-visual">
        ${visual}

        <span class="coin-badge">
          ${esc(collectionName(coin.collectionId))}
        </span>
      </div>

      <div class="coin-body">
        <h3>${esc(coin.name || "Sans nom")}</h3>

        <div class="coin-meta">
          <span>
            ${coin.year
              ? `◷ ${esc(coin.year)}`
              : "Année inconnue"}
          </span>

          <span>
            ${coin.location
              ? `⌖ ${esc(coin.location)}`
              : "Lieu inconnu"}
          </span>
        </div>

        ${coin.notes
          ? `<p class="coin-notes">${esc(coin.notes)}</p>`
          : ""}
      </div>
    `;

    card.addEventListener("click", () => openCoin(coin));

    card.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        openCoin(coin);
      }
    });

    fragment.append(card);
  });

  els.grid.append(fragment);
}

function detailItem(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div class="detail-item">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function openCoin(coin) {
  const images = imageUrls(coin);

  const gallery = images.length > 0
    ? `
      <div class="dialog-main-image">
        <img
          id="dialogMainImg"
          src="${esc(images[0])}"
          alt="${esc(coin.name)}"
        >
      </div>

      <div class="dialog-thumbs">
        ${images.map((source, index) => `
          <button
            type="button"
            class="dialog-thumb ${index === 0 ? "is-active" : ""}"
            data-src="${esc(source)}"
          >
            <img
              src="${esc(source)}"
              alt="Photo ${index + 1}"
            >
          </button>
        `).join("")}
      </div>
    `
    : `
      <div class="dialog-main-image">
        <div class="coin-placeholder">◉</div>
      </div>
    `;

  els.dialogContent.innerHTML = `
    <div class="dialog-layout">
      <div class="dialog-gallery">
        ${gallery}
      </div>

      <div class="dialog-details">
        <div class="dialog-kicker">
          ${esc(collectionName(coin.collectionId))}
        </div>

        <h2>${esc(coin.name || "Sans nom")}</h2>

        <div class="dialog-location">
          ${esc(coin.location || "Lieu non renseigné")}
        </div>

        <div class="detail-list">
          ${detailItem("Année", coin.year)}

          ${detailItem(
            "Pays",
            coin.country || countryFromLocation(coin.location)
          )}

          ${detailItem("Valeur", coin.denomination)}
          ${detailItem("Métal", coin.metal)}
          ${detailItem("État", coin.condition)}
          ${detailItem("Atelier", coin.mint)}
          ${detailItem("Quantité", coin.quantity)}

          ${detailItem(
            "Estimation",
            coin.estimatedValue
              ? `${coin.estimatedValue} €`
              : ""
          )}
        </div>

        ${coin.notes
          ? `<div class="dialog-notes">${esc(coin.notes)}</div>`
          : ""}
      </div>
    </div>
  `;

  els.dialogContent
    .querySelectorAll(".dialog-thumb")
    .forEach(button => {
      button.addEventListener("click", () => {
        const mainImage = $("#dialogMainImg");

        if (mainImage) {
          mainImage.src = button.dataset.src;
        }

        els.dialogContent
          .querySelectorAll(".dialog-thumb")
          .forEach(otherButton =>
            otherButton.classList.remove("is-active")
          );

        button.classList.add("is-active");
      });
    });

  els.dialog.showModal();
}

function switchView(view) {
  state.view = view;

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {
      button.classList.toggle(
        "is-active",
        button.dataset.view === view
      );
    });

  document
    .querySelectorAll(".view-panel")
    .forEach(panel => panel.classList.remove("is-active"));

  $(`#${view}View`).classList.add("is-active");

  if (view === "map") {
    setTimeout(() => buildMap(), 0);
  }

  if (view === "stats") {
    renderStats();
  }
}

function buildMap() {
  if (!window.L) {
    els.mapNotice.textContent =
      "La carte n’a pas pu être chargée.";

    return;
  }

  if (!state.map) {
    state.map = L.map("map", {
      scrollWheelZoom: false
    }).setView([46.6, 2.5], 5);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 18,
        attribution: "© OpenStreetMap"
      }
    ).addTo(state.map);
  }

  if (state.markerLayer) {
    state.markerLayer.remove();
  }

  state.markerLayer = L.layerGroup().addTo(state.map);

  const geoMap = state.data?.geoMap || {};
  const bounds = [];
  let positionedCoinCount = 0;

  state.filtered.forEach(coin => {
    const coordinates = geoMap[coin.location];

    if (!coordinates) {
      return;
    }

    positionedCoinCount++;

    bounds.push([
      coordinates.lat,
      coordinates.lon
    ]);

    const marker = L.circleMarker(
      [coordinates.lat, coordinates.lon],
      {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#173f35",
        fillOpacity: 0.92
      }
    ).addTo(state.markerLayer);

    const images = imageUrls(coin);
    const firstImage = images[0];

    const photoHtml = firstImage
      ? `
        <div class="map-popup-image-wrap">
          <img
            class="map-popup-image"
            src="${esc(firstImage)}"
            alt="${esc(coin.name || "Pièce")}"
            onerror="
              this.parentElement.innerHTML =
              '<div class=map-popup-placeholder>◉</div>'
            "
          >
        </div>
      `
      : `
        <div class="map-popup-placeholder">
          ◉
        </div>
      `;

    const popupHtml = `
      <div class="map-popup-card">
        ${photoHtml}

        <div class="map-popup-content">
          <div class="map-popup-collection">
            ${esc(collectionName(coin.collectionId))}
          </div>

          <strong class="map-popup-title">
            ${esc(coin.name || "Sans nom")}
          </strong>

          <div class="map-popup-meta">
            ${coin.year
              ? `<span>◷ ${esc(coin.year)}</span>`
              : ""}

            ${coin.location
              ? `<span>⌖ ${esc(coin.location)}</span>`
              : ""}
          </div>

          <button
            type="button"
            class="map-popup-button"
          >
            Voir la fiche
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      minWidth: 230,
      maxWidth: 260,
      className: "coin-map-popup"
    });

    marker.on("popupopen", () => {
      const popupElement = marker
        .getPopup()
        .getElement();

      const button = popupElement?.querySelector(
        ".map-popup-button"
      );

      if (!button) {
        return;
      }

      button.addEventListener(
        "click",
        () => openCoin(coin),
        { once: true }
      );
    });
  });

  if (bounds.length > 0) {
    state.map.fitBounds(bounds, {
      padding: [35, 35],
      maxZoom: 10
    });
  } else {
    state.map.setView([46.6, 2.5], 5);
  }

  els.mapNotice.textContent =
    `${positionedCoinCount} pièce`
    + `${positionedCoinCount > 1 ? "s" : ""} `
    + `positionnée`
    + `${positionedCoinCount > 1 ? "s" : ""} `
    + `sur la carte.`;

  setTimeout(() => {
    state.map.invalidateSize();
  }, 100);
}

function topCounts(values, limit = 8) {
  const result = {};

  values
    .filter(Boolean)
    .forEach(value => {
      result[value] = (result[value] || 0) + 1;
    });

  return Object.entries(result)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function bars(title, rows) {
  const maximum = rows[0]?.[1] || 1;

  return `
    <section class="chart-card">
      <h3>${esc(title)}</h3>

      ${rows.length > 0
        ? rows.map(([label, amount]) => `
          <div class="bar-item">
            <span
              class="bar-label"
              title="${esc(label)}"
            >
              ${esc(label)}
            </span>

            <span class="bar-track">
              <span
                class="bar-fill"
                style="
                  width:
                  ${Math.round(amount / maximum * 100)}%
                "
              ></span>
            </span>

            <strong>${amount}</strong>
          </div>
        `).join("")
        : "<p>Aucune donnée.</p>"}
    </section>
  `;
}

function renderStats() {
  const coins = state.filtered;

  const years = coins
    .map(coin => Number(coin.year))
    .filter(year => year > 0);

  const countries = topCounts(
    coins.map(coin =>
      coin.country
      || countryFromLocation(coin.location)
    )
  );

  const collections = topCounts(
    coins.map(coin =>
      collectionName(coin.collectionId)
    )
  );

  els.stats.innerHTML = `
    <div class="stat-card">
      <strong>${coins.length}</strong>
      <span>Pièces affichées</span>
    </div>

    <div class="stat-card">
      <strong>
        ${new Set(
          coins
            .map(coin => coin.collectionId)
            .filter(Boolean)
        ).size}
      </strong>

      <span>Collections</span>
    </div>

    <div class="stat-card">
      <strong>
        ${new Set(
          coins
            .map(coin =>
              coin.country
              || countryFromLocation(coin.location)
            )
            .filter(Boolean)
        ).size}
      </strong>

      <span>Pays</span>
    </div>

    <div class="stat-card">
      <strong>
        ${years.length > 0
          ? Math.min(...years)
          : "—"}
      </strong>

      <span>Plus ancienne</span>
    </div>

    ${bars("Principaux pays", countries)}
    ${bars("Répartition par collection", collections)}
  `;
}

$("#closeDialog").addEventListener(
  "click",
  () => els.dialog.close()
);

els.dialog.addEventListener("click", event => {
  if (event.target === els.dialog) {
    els.dialog.close();
  }
});

document
  .querySelectorAll(".nav-button")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => switchView(button.dataset.view)
    );
  });

(async function init() {
  try {
    await loadData();

    els.hero.textContent = state.coins.length;
    els.status.textContent = "";

    initFilters();
    applyFilters();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(error => {
          console.warn(
            "Service worker non enregistré",
            error
          );
        });
    }
  } catch (error) {
    els.status.innerHTML = `
      <strong>Collection indisponible.</strong>
      <br>
      ${esc(error.message)}
      <br>
      <small>
        Conserve le dossier
        <code>data</code>
        de ton ancien dépôt lors de l’installation.
      </small>
    `;
  }
})();