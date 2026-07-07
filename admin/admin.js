const PATH = "data/coins-meta.json";
const PHOTON_API = "https://photon.komoot.io/api/";

const state = {
  cfg: null,
  meta: null,
  metaSha: null,
  currentId: null,
  pendingFiles: [],
  removedImageIds: new Set(),
  busy: false,
  selectedGeo: null,
  locationTimer: null,
  locationController: null
};

const $ = selector => document.querySelector(selector);

const els = {
  login: $("#loginScreen"),
  app: $("#adminApp"),
  form: $("#coinForm"),
  empty: $("#emptyEditor"),
  list: $("#coinList"),
  search: $("#adminSearch"),
  mapFilter: $("#mapFilter"),
  mapFilterSummary: $("#mapFilterSummary"),
  status: $("#saveStatus"),
  connection: $("#connectionState"),
  location: $("#coinLocation"),
  country: $("#coinCountry"),
  locationStatus: $("#locationStatus"),
  locationSuggestions: $("#locationSuggestions")
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

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function imageUrls(coin) {
  const ids = (coin.imageIds || [])
    .filter(id => !state.removedImageIds.has(id));

  const legacy = ids.map(
    id =>
      `https://raw.githubusercontent.com/`
      + `${state.cfg.owner}/${state.cfg.repo}/${state.cfg.branch}`
      + `/data/images/${coin.id}/${id}.jpg`
  );

  return [...legacy, ...(coin.images || [])];
}

function baseApi() {
  return `https://api.github.com/repos/`
    + `${encodeURIComponent(state.cfg.owner)}/`
    + `${encodeURIComponent(state.cfg.repo)}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${baseApi()}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `GitHub ${response.status} — ${text.slice(0, 220)}`
    );

    error.status = response.status;
    throw error;
  }

  return response.status === 204
    ? null
    : response.json();
}

function decode64(value) {
  const bytes = Uint8Array.from(
    atob(value.replace(/\n/g, "")),
    character => character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

function encode64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + 0x8000)
    );
  }

  return btoa(binary);
}

async function getMetadata() {
  const data = await api(
    `/contents/${PATH}?ref=${encodeURIComponent(state.cfg.branch)}`
  );

  state.metaSha = data.sha;
  state.meta = JSON.parse(decode64(data.content));

  state.meta.collections ||= [];
  state.meta.coins ||= [];
  state.meta.geoMap ||= {};
}

async function publishMetadata(message) {
  state.meta.savedAt = now();

  const body = {
    message,
    content: encode64(JSON.stringify(state.meta, null, 2)),
    sha: state.metaSha,
    branch: state.cfg.branch
  };

  const result = await api(`/contents/${PATH}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  state.metaSha = result.content.sha;
}

async function initializeMetadata() {
  state.meta = {
    version: 2,
    savedAt: now(),
    collections: [],
    geoMap: {},
    coins: []
  };

  const body = {
    message: "Initialisation CoinCollector",
    content: encode64(JSON.stringify(state.meta, null, 2)),
    branch: state.cfg.branch
  };

  const result = await api(`/contents/${PATH}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  state.metaSha = result.content.sha;
}

function setBusy(busy, text = "") {
  state.busy = busy;

  els.form
    .querySelectorAll("button")
    .forEach(button => {
      button.disabled = busy;
    });

  if (text) {
    setStatus(text);
  }
}

function setStatus(text, type = "") {
  els.status.textContent = text;
  els.status.className = `save-status ${type}`;
}

function collectionName(id) {
  return state.meta.collections
    .find(collection => collection.id === id)?.name
    || "Sans collection";
}

function fillCollections(selected = "") {
  const select = $("#coinCollection");

  select.innerHTML =
    '<option value="">Sans collection</option>'
    + state.meta.collections
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map(collection => (
        `<option value="${esc(collection.id)}">`
        + `${esc(collection.name)}`
        + "</option>"
      ))
      .join("");

  select.value = selected || "";
}

function coordinatesForLocation(location) {
  const coordinates = state.meta.geoMap?.[location];

  if (
    coordinates
    && Number.isFinite(Number(coordinates.lat))
    && Number.isFinite(Number(coordinates.lon))
  ) {
    return {
      lat: Number(coordinates.lat),
      lon: Number(coordinates.lon)
    };
  }

  return null;
}

function mapStatus(coin) {
  const location = String(coin.location || "").trim();

  if (!location) {
    return "no-location";
  }

  return coordinatesForLocation(location)
    ? "positioned"
    : "no-coordinates";
}

function mapStatusLabel(status) {
  return {
    positioned: "Position enregistrée",
    "no-coordinates": "Lieu sans coordonnées",
    "no-location": "Aucun lieu"
  }[status];
}

function matchesMapFilter(coin, filter) {
  const status = mapStatus(coin);

  switch (filter) {
    case "positioned":
      return status === "positioned";

    case "no-location":
      return status === "no-location";

    case "no-coordinates":
      return status === "no-coordinates";

    case "missing-map":
      return status !== "positioned";

    default:
      return true;
  }
}

function updateFilterCounts() {
  const counts = {
    all: state.meta.coins.length,
    positioned: 0,
    "no-location": 0,
    "no-coordinates": 0,
    "missing-map": 0
  };

  state.meta.coins.forEach(coin => {
    const status = mapStatus(coin);
    counts[status]++;

    if (status !== "positioned") {
      counts["missing-map"]++;
    }
  });

  const labels = {
    all: `Toutes les pièces (${counts.all})`,
    "missing-map": `Sans position sur la carte (${counts["missing-map"]})`,
    "no-location": `Sans lieu (${counts["no-location"]})`,
    "no-coordinates": `Lieu sans coordonnées (${counts["no-coordinates"]})`,
    positioned: `Correctement positionnées (${counts.positioned})`
  };

  [...els.mapFilter.options].forEach(option => {
    option.textContent = labels[option.value];
  });
}

function renderList() {
  const search = els.search.value
    .toLowerCase()
    .trim();

  const filter = els.mapFilter.value;

  const coins = state.meta.coins
    .filter(coin => (
      [coin.name, coin.location, coin.year]
        .join(" ")
        .toLowerCase()
        .includes(search)
    ))
    .filter(coin => matchesMapFilter(coin, filter))
    .sort((a, b) =>
      String(a.name).localeCompare(String(b.name), "fr")
    );

  els.mapFilterSummary.textContent =
    `${coins.length} pièce${coins.length > 1 ? "s" : ""} affichée`
    + `${coins.length > 1 ? "s" : ""}`;

  els.list.innerHTML = coins
    .map(coin => {
      const source = imageUrls(coin)[0];
      const status = mapStatus(coin);

      return `
        <button
          class="admin-coin-item
          ${state.currentId === coin.id ? "is-active" : ""}"
          data-id="${esc(coin.id)}"
          title="${esc(mapStatusLabel(status))}"
        >
          ${
            source
              ? `
                <img
                  src="${esc(source)}"
                  alt=""
                  onerror="
                    this.outerHTML =
                    '<span class=admin-coin-thumb>◉</span>'
                  "
                >
              `
              : '<span class="admin-coin-thumb">◉</span>'
          }

          <span>
            <strong>${esc(coin.name || "Sans nom")}</strong>
            <small>
              ${esc(coin.year || "")}
              ·
              ${esc(collectionName(coin.collectionId))}
            </small>
          </span>

          <span
            class="map-state-dot ${status}"
            aria-label="${esc(mapStatusLabel(status))}"
          ></span>
        </button>
      `;
    })
    .join("");

  els.list
    .querySelectorAll("button")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => editCoin(button.dataset.id)
      );
    });

  updateFilterCounts();
}

function value(selector, nextValue = "") {
  $(selector).value = nextValue ?? "";
}

function currentCoin() {
  return state.meta.coins
    .find(coin => coin.id === state.currentId);
}

function hideLocationSuggestions() {
  els.locationSuggestions.hidden = true;
  els.location.setAttribute("aria-expanded", "false");
}

function showLocationMessage(message) {
  els.locationSuggestions.innerHTML = `
    <div class="location-suggestion-message">
      ${esc(message)}
    </div>
  `;

  els.locationSuggestions.hidden = false;
  els.location.setAttribute("aria-expanded", "true");
}

function updateLocationStatus() {
  const location = els.location.value.trim();
  const existingCoordinates = coordinatesForLocation(location);

  let status = "no-location";
  let text = "Aucun lieu renseigné";

  if (location && (state.selectedGeo || existingCoordinates)) {
    status = "positioned";
    text = "Position prête pour la carte";
  } else if (location) {
    status = "no-coordinates";
    text = "Choisis une suggestion pour enregistrer la position";
  }

  els.locationStatus.className = `location-status ${status}`;
  els.locationStatus.textContent = text;
}

function editCoin(id) {
  state.currentId = id;
  state.pendingFiles = [];
  state.removedImageIds.clear();

  const coin = currentCoin();

  els.empty.hidden = true;
  els.form.hidden = false;

  $("#editorTitle").textContent =
    coin.name || "Modifier la pièce";

  $("#editorKicker").textContent = "Modifier la fiche";

  value("#coinId", coin.id);
  value("#coinName", coin.name);
  value("#coinYear", coin.year);
  fillCollections(coin.collectionId);
  value("#coinLocation", coin.location);
  value("#coinCountry", coin.country);
  value("#coinDenomination", coin.denomination);
  value("#coinMetal", coin.metal);
  value("#coinCondition", coin.condition);
  value("#coinMint", coin.mint);
  value("#coinQuantity", coin.quantity || 1);
  value("#coinEstimatedValue", coin.estimatedValue);
  value("#coinAcquisitionDate", coin.acquisitionDate);
  value("#coinTags", (coin.tags || []).join(", "));
  value("#coinNotes", coin.notes);

  state.selectedGeo = coordinatesForLocation(coin.location);

  $("#deleteCoinButton").hidden = false;

  hideLocationSuggestions();
  updateLocationStatus();
  renderImages();
  renderList();
  setStatus("");
}

function newCoin() {
  state.currentId = null;
  state.pendingFiles = [];
  state.removedImageIds.clear();
  state.selectedGeo = null;

  els.empty.hidden = true;
  els.form.hidden = false;
  els.form.reset();

  value("#coinId", uuid());
  fillCollections("");
  value("#coinQuantity", 1);

  $("#editorTitle").textContent = "Nouvelle pièce";
  $("#editorKicker").textContent = "Créer une fiche";
  $("#deleteCoinButton").hidden = true;

  hideLocationSuggestions();
  updateLocationStatus();
  renderImages();
  renderList();
  setStatus("");
}

function renderImages() {
  const coin = currentCoin() || {
    id: $("#coinId").value,
    imageIds: [],
    images: []
  };

  const existing = imageUrls(coin).map((source, index) => ({
    source,
    type: "existing",
    id: (coin.imageIds || [])[index] || null
  }));

  const pending = state.pendingFiles.map((file, index) => ({
    source: file.preview,
    type: "pending",
    index
  }));

  $("#imagePreview").innerHTML = [...existing, ...pending]
    .map(item => `
      <div class="admin-image">
        <img src="${esc(item.source)}" alt="">

        <button
          type="button"
          data-type="${item.type}"
          data-id="${esc(item.id || "")}"
          data-index="${item.index ?? ""}"
        >
          ×
        </button>

        ${
          item.type === "pending"
            ? '<span class="pending-badge">À publier</span>'
            : ""
        }
      </div>
    `)
    .join("");

  $("#imagePreview")
    .querySelectorAll("button")
    .forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.type === "pending") {
          const index = Number(button.dataset.index);

          URL.revokeObjectURL(
            state.pendingFiles[index].preview
          );

          state.pendingFiles.splice(index, 1);
        } else if (button.dataset.id) {
          state.removedImageIds.add(button.dataset.id);
        }

        renderImages();
      });
    });
}

async function compress(file) {
  const bitmap = await createImageBitmap(file);
  const maximum = 1500;

  const scale = Math.min(
    1,
    maximum / Math.max(bitmap.width, bitmap.height)
  );

  const canvas = document.createElement("canvas");

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  canvas
    .getContext("2d")
    .drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height
    );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Compression impossible"));
        }
      },
      "image/jpeg",
      0.84
    );
  });
}

async function blob64(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (let index = 0; index < buffer.length; index += 0x8000) {
    binary += String.fromCharCode(
      ...buffer.subarray(index, index + 0x8000)
    );
  }

  return btoa(binary);
}

async function uploadImage(
  coinId,
  pending,
  index,
  total
) {
  setStatus(`Publication de la photo ${index}/${total}…`);

  const imageId = uuid();
  const blob = await compress(pending.file);

  await api(
    `/contents/data/images/${coinId}/${imageId}.jpg`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Ajout photo ${coinId}`,
        content: await blob64(blob),
        branch: state.cfg.branch
      })
    }
  );

  return imageId;
}

function formCoin() {
  const existing = currentCoin();

  return {
    ...(existing || {}),
    id: $("#coinId").value || uuid(),
    name: $("#coinName").value.trim(),
    year: Number($("#coinYear").value),
    collectionId: $("#coinCollection").value || null,
    location: els.location.value.trim(),
    country: els.country.value.trim(),
    denomination: $("#coinDenomination").value.trim(),
    metal: $("#coinMetal").value.trim(),
    condition: $("#coinCondition").value.trim(),
    mint: $("#coinMint").value.trim(),
    quantity: Number($("#coinQuantity").value) || 1,
    estimatedValue: $("#coinEstimatedValue").value
      ? Number($("#coinEstimatedValue").value)
      : null,
    acquisitionDate: $("#coinAcquisitionDate").value || "",
    tags: $("#coinTags")
      .value
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean),
    notes: $("#coinNotes").value.trim(),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
    imageIds: (existing?.imageIds || [])
      .filter(id => !state.removedImageIds.has(id))
  };
}

function cleanUnusedGeoLocation(oldLocation, newLocation, coinId) {
  if (
    !oldLocation
    || oldLocation === newLocation
    || !state.meta.geoMap?.[oldLocation]
  ) {
    return;
  }

  const stillUsed = state.meta.coins.some(coin =>
    coin.id !== coinId
    && String(coin.location || "").trim() === oldLocation
  );

  if (!stillUsed) {
    delete state.meta.geoMap[oldLocation];
  }
}

async function saveCoin(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  const existing = currentCoin();
  const oldLocation = String(existing?.location || "").trim();
  const coin = formCoin();

  if (!coin.name || !coin.year) {
    setStatus(
      "Le nom et l’année sont obligatoires.",
      "error"
    );

    return;
  }

  const currentCoordinates =
    state.selectedGeo
    || coordinatesForLocation(coin.location);

  if (coin.location && !currentCoordinates) {
    setStatus(
      "Sélectionne une proposition de lieu pour enregistrer "
      + "les coordonnées de la carte.",
      "error"
    );

    els.location.focus();
    updateLocationStatus();
    return;
  }

  try {
    setBusy(true, "Préparation…");

    for (
      let index = 0;
      index < state.pendingFiles.length;
      index++
    ) {
      coin.imageIds.push(
        await uploadImage(
          coin.id,
          state.pendingFiles[index],
          index + 1,
          state.pendingFiles.length
        )
      );
    }

    if (coin.location && currentCoordinates) {
      state.meta.geoMap[coin.location] = {
        lat: Number(currentCoordinates.lat),
        lon: Number(currentCoordinates.lon)
      };
    }

    cleanUnusedGeoLocation(
      oldLocation,
      coin.location,
      coin.id
    );

    const index = state.meta.coins
      .findIndex(item => item.id === coin.id);

    if (index >= 0) {
      state.meta.coins[index] = coin;
    } else {
      state.meta.coins.push(coin);
    }

    await publishMetadata(
      `${index >= 0 ? "Mise à jour" : "Ajout"} : ${coin.name}`
    );

    state.currentId = coin.id;

    state.pendingFiles.forEach(file =>
      URL.revokeObjectURL(file.preview)
    );

    state.pendingFiles = [];
    state.removedImageIds.clear();
    state.selectedGeo = currentCoordinates;

    renderList();
    editCoin(coin.id);

    setStatus(
      "La pièce et sa position ont été publiées avec succès.",
      "success"
    );
  } catch (error) {
    setStatus(
      error.status === 409
        ? "Conflit de modification : recharge l’administration "
          + "puis recommence."
        : error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function deleteCoin() {
  const coin = currentCoin();

  if (
    !coin
    || !confirm(
      `Supprimer « ${coin.name} » de la collection ?`
    )
  ) {
    return;
  }

  try {
    setBusy(true, "Suppression…");

    const oldLocation = String(coin.location || "").trim();

    state.meta.coins = state.meta.coins
      .filter(item => item.id !== coin.id);

    cleanUnusedGeoLocation(
      oldLocation,
      "",
      coin.id
    );

    await publishMetadata(`Suppression : ${coin.name}`);

    state.currentId = null;
    els.form.hidden = true;
    els.empty.hidden = false;

    renderList();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function renderCollections() {
  $("#collectionsList").innerHTML = state.meta.collections
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map(collection => `
      <div
        class="collection-row"
        data-id="${esc(collection.id)}"
      >
        <input
          class="admin-input"
          value="${esc(collection.name)}"
        >

        <button class="button save-col">Renommer</button>
        <button class="button danger del-col">Supprimer</button>
      </div>
    `)
    .join("");

  $("#collectionsList")
    .querySelectorAll(".collection-row")
    .forEach(row => {
      row.querySelector(".save-col").onclick = async () => {
        const collection = state.meta.collections
          .find(item => item.id === row.dataset.id);

        collection.name = row
          .querySelector("input")
          .value
          .trim();

        await publishMetadata(
          `Renommage collection : ${collection.name}`
        );

        renderCollections();
        renderList();
        fillCollections(currentCoin()?.collectionId);
      };

      row.querySelector(".del-col").onclick = async () => {
        const collection = state.meta.collections
          .find(item => item.id === row.dataset.id);

        if (
          !confirm(
            `Supprimer la collection « ${collection.name} » ? `
            + "Les pièces seront placées sans collection."
          )
        ) {
          return;
        }

        state.meta.coins.forEach(coin => {
          if (coin.collectionId === collection.id) {
            coin.collectionId = null;
          }
        });

        state.meta.collections = state.meta.collections
          .filter(item => item.id !== collection.id);

        await publishMetadata(
          `Suppression collection : ${collection.name}`
        );

        renderCollections();
        renderList();
        fillCollections(currentCoin()?.collectionId);
      };
    });
}

async function addCollection() {
  const input = $("#newCollectionName");
  const name = input.value.trim();

  if (!name) {
    return;
  }

  state.meta.collections.push({
    id: uuid(),
    name,
    createdAt: now()
  });

  await publishMetadata(`Ajout collection : ${name}`);

  input.value = "";

  renderCollections();
  fillCollections(currentCoin()?.collectionId);
  renderList();
}

function locationParts(properties) {
  const main =
    properties.name
    || properties.street
    || properties.city
    || properties.county
    || properties.state
    || properties.country
    || "Lieu";

  const detailCandidates = [
    properties.housenumber && properties.street
      ? `${properties.housenumber} ${properties.street}`
      : properties.street,
    properties.postcode,
    properties.city,
    properties.district,
    properties.county,
    properties.state,
    properties.country
  ];

  const seen = new Set([String(main).toLowerCase()]);

  const details = detailCandidates
    .filter(Boolean)
    .filter(value => {
      const normalized = String(value).toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });

  const label = [main, ...details].join(", ");

  return {
    main,
    details: details.join(", "),
    label
  };
}

function renderLocationSuggestions(features) {
  if (!features.length) {
    showLocationMessage("Aucun lieu trouvé.");
    return;
  }

  els.locationSuggestions.innerHTML = features
    .map((feature, index) => {
      const properties = feature.properties || {};
      const parts = locationParts(properties);

      return `
        <button
          type="button"
          class="location-suggestion"
          role="option"
          data-index="${index}"
        >
          <strong>${esc(parts.main)}</strong>
          <small>${esc(parts.details || parts.label)}</small>
        </button>
      `;
    })
    .join("");

  els.locationSuggestions.hidden = false;
  els.location.setAttribute("aria-expanded", "true");

  els.locationSuggestions
    .querySelectorAll(".location-suggestion")
    .forEach(button => {
      button.addEventListener("click", () => {
        selectLocation(
          features[Number(button.dataset.index)]
        );
      });
    });
}

function selectLocation(feature) {
  const properties = feature.properties || {};
  const coordinates = feature.geometry?.coordinates || [];
  const parts = locationParts(properties);

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);

  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
  ) {
    showLocationMessage(
      "Cette proposition ne contient pas de coordonnées."
    );

    return;
  }

  els.location.value = parts.label;

  if (properties.country) {
    els.country.value = properties.country;
  }

  state.selectedGeo = {
    lat: latitude,
    lon: longitude
  };

  hideLocationSuggestions();
  updateLocationStatus();
}

async function searchLocations(query) {
  if (state.locationController) {
    state.locationController.abort();
  }

  state.locationController = new AbortController();

  showLocationMessage("Recherche en cours…");

  try {
    const url = new URL(PHOTON_API);

    url.searchParams.set("q", query);
    url.searchParams.set("limit", "6");
    url.searchParams.set("lang", "fr");

    const response = await fetch(url, {
      signal: state.locationController.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Service de recherche ${response.status}`);
    }

    const data = await response.json();

    renderLocationSuggestions(
      Array.isArray(data.features)
        ? data.features
        : []
    );
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    showLocationMessage(
      "La recherche de lieux est momentanément indisponible."
    );
  }
}

function handleLocationInput() {
  const query = els.location.value.trim();

  state.selectedGeo = coordinatesForLocation(query);

  clearTimeout(state.locationTimer);
  updateLocationStatus();

  if (query.length < 3) {
    hideLocationSuggestions();
    return;
  }

  state.locationTimer = setTimeout(
    () => searchLocations(query),
    450
  );
}

async function login(event) {
  event.preventDefault();

  const errorElement = $("#loginError");
  errorElement.textContent = "";

  state.cfg = {
    owner: $("#ownerInput").value.trim(),
    repo: $("#repoInput").value.trim(),
    branch: $("#branchInput").value.trim(),
    token: $("#tokenInput").value.trim()
  };

  try {
    await getMetadata();
  } catch (error) {
    if (
      error.status === 404
      && confirm(
        "Le fichier de données n’existe pas. "
        + "Créer une collection vide ?"
      )
    ) {
      await initializeMetadata();
    } else {
      errorElement.textContent = error.message;
      return;
    }
  }

  sessionStorage.setItem(
    "coincollector-admin",
    JSON.stringify(state.cfg)
  );

  openApp();
}

function openApp() {
  els.login.hidden = true;
  els.app.hidden = false;
  $("#logoutButton").hidden = false;

  els.connection.textContent =
    `${state.cfg.owner}/${state.cfg.repo}`
    + ` · ${state.cfg.branch}`;

  fillCollections();
  renderList();
}

function logout() {
  sessionStorage.removeItem("coincollector-admin");
  location.reload();
}

$("#loginForm").addEventListener("submit", login);
$("#coinForm").addEventListener("submit", saveCoin);
$("#newCoinButton").onclick = newCoin;
$("#deleteCoinButton").onclick = deleteCoin;
$("#logoutButton").onclick = logout;

els.search.addEventListener("input", renderList);
els.mapFilter.addEventListener("change", renderList);
els.location.addEventListener("input", handleLocationInput);

els.location.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    hideLocationSuggestions();
  }
});

document.addEventListener("click", event => {
  if (
    !event.target.closest(".location-control")
  ) {
    hideLocationSuggestions();
  }
});

$("#collectionsButton").onclick = () => {
  renderCollections();
  $("#collectionsDialog").showModal();
};

$("#addCollectionButton").onclick = addCollection;

$("#photoInput").addEventListener("change", event => {
  [...event.target.files].forEach(file => {
    state.pendingFiles.push({
      file,
      preview: URL.createObjectURL(file)
    });
  });

  event.target.value = "";
  renderImages();
});

(async () => {
  const saved = sessionStorage.getItem(
    "coincollector-admin"
  );

  if (!saved) {
    return;
  }

  try {
    state.cfg = JSON.parse(saved);
    await getMetadata();
    openApp();
  } catch {
    sessionStorage.removeItem("coincollector-admin");
  }
})();
