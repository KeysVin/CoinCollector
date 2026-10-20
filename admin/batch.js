import { cropPhoto, imageDataUrl, rotatePhoto } from "./photo-tools.js";
import { draftKey, readOffline, removeOffline, writeOffline } from "./offline-store.js";

const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const PHOTON_API = "https://photon.komoot.io/api/";

function locationParts(properties) {
  const main = properties.name || properties.street || properties.city || properties.county
    || properties.state || properties.country || "Lieu";
  const candidates = [
    properties.housenumber && properties.street
      ? `${properties.housenumber} ${properties.street}` : properties.street,
    properties.postcode, properties.city, properties.district, properties.county,
    properties.state, properties.country
  ];
  const seen = new Set([String(main).toLowerCase()]);
  const details = candidates.filter(Boolean).filter(value => {
    const normalized = String(value).toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  return { main, details: details.join(", "), label: [main, ...details].join(", ") };
}

function coordinatesForLocation(meta, location) {
  const coordinates = meta.geoMap?.[location];
  return coordinates && Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lon))
    ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null;
}

export async function identifyPhotos(files, hint, token) {
  const images = await Promise.all(files.slice(0, 3).map(file => imageDataUrl(file)));
  const response = await fetch("/.netlify/functions/identify-coin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ images, hint })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Identification indisponible (${response.status})`);
  return data;
}

export function initBatch({ state, uploadImage, publishMetadata, getMetadata, renderList,
  offlineStore = { readOffline, writeOffline, removeOffline } }) {
  const dialog = $("#batchDialog");
  const coinsElement = $("#batchCoins");
  const statusElement = $("#batchStatus");
  const draftElement = $("#batchDraftStatus");
  const groups = [];
  const photos = [];
  const pendingPhotoVersions = new Map();
  const locationSearches = new Map();
  let busy = false;
  let draftReady = false;
  let draftTimer = null;
  let draftRevision = 0;
  let saveQueue = Promise.resolve();

  function status(message, type = "") {
    statusElement.textContent = message;
    statusElement.className = `save-status ${type}`;
  }

  const photoKey = id => `${draftKey(state.cfg)}:photo:${id}`;

  function draftSnapshot() {
    return {
      version: 1,
      groups: groups.map(group => ({ ...group })),
      photos: photos.map(({ id, groupId, file }) => ({ id, groupId, name: file.name, type: file.type }))
    };
  }

  function markPhotoForSave(photo) {
    pendingPhotoVersions.set(photo.id, (pendingPhotoVersions.get(photo.id) || 0) + 1);
  }

  async function persistDraft() {
    for (const [id, version] of pendingPhotoVersions) {
      const photo = photos.find(item => item.id === id);
      if (!photo) {
        pendingPhotoVersions.delete(id);
        continue;
      }
      await offlineStore.writeOffline(photoKey(id), photo.file);
      if (pendingPhotoVersions.get(id) === version) pendingPhotoVersions.delete(id);
    }
    if (pendingPhotoVersions.size) return persistDraft();
    await offlineStore.writeOffline(draftKey(state.cfg), draftSnapshot());
  }

  function queueDraftSave(task) {
    if (!draftReady || !state.cfg) return Promise.resolve();
    const revision = ++draftRevision;
    draftElement.textContent = "Enregistrement local…";
    saveQueue = saveQueue.catch(() => {}).then(task);
    saveQueue.then(() => {
      if (revision === draftRevision) draftElement.textContent = "Brouillon enregistré sur cet appareil";
    }).catch(() => {
      if (revision === draftRevision) draftElement.textContent = "Échec de la sauvegarde locale : vérifie l’espace disponible";
    });
    return saveQueue;
  }

  function scheduleDraftSave() {
    if (!draftReady) return;
    clearTimeout(draftTimer);
    draftElement.textContent = "Enregistrement local…";
    draftTimer = setTimeout(() => queueDraftSave(persistDraft), 350);
  }

  async function restoreDraft() {
    if (draftReady) return;
    try {
      const saved = await offlineStore.readOffline(draftKey(state.cfg));
      if (saved?.version === 1 && Array.isArray(saved.groups) && Array.isArray(saved.photos)) {
        groups.push(...saved.groups.filter(group => group && typeof group.id === "string"
          && typeof group.name === "string" && typeof group.location === "string"));
        for (const item of saved.photos) {
          if (!item || typeof item.id !== "string" || !groups.some(group => group.id === item.groupId)) continue;
          const file = await offlineStore.readOffline(photoKey(item.id));
          if (file instanceof Blob) {
            const restored = file instanceof File ? file
              : new File([file], item.name || "photo.jpg", { type: item.type || file.type });
            photos.push({ id: item.id, groupId: item.groupId, file: restored,
              preview: URL.createObjectURL(restored), imageId: null, uploadedGroupId: null });
          }
        }
        draftElement.textContent = photos.length
          ? `Brouillon local retrouvé · ${photos.length} photo(s)` : "Brouillon local retrouvé";
      } else {
        draftElement.textContent = "Brouillon conservé sur cet appareil";
      }
    } catch {
      draftElement.textContent = "Sauvegarde locale indisponible sur ce navigateur";
    } finally {
      draftReady = true;
    }
  }

  async function clearDraft() {
    clearTimeout(draftTimer);
    await saveQueue.catch(() => {});
    const saved = await offlineStore.readOffline(draftKey(state.cfg)).catch(() => null);
    const ids = new Set([...photos.map(photo => photo.id),
      ...(Array.isArray(saved?.photos) ? saved.photos.map(photo => photo.id) : [])]);
    await Promise.all([...ids].filter(id => typeof id === "string")
      .map(id => offlineStore.removeOffline(photoKey(id))));
    await offlineStore.removeOffline(draftKey(state.cfg));
    pendingPhotoVersions.clear();
    draftElement.textContent = "Brouillon local effacé";
  }

  function addGroup(shouldRender = true) {
    const group = {
      id: crypto.randomUUID(), name: "", year: "", collectionId: "",
      location: "", geo: null, country: "", denomination: "", metal: "", mint: "", notes: "", sources: []
    };
    groups.push(group);
    if (shouldRender) {
      render();
      scheduleDraftSave();
    }
    return group;
  }

  function groupPhotos(groupId) {
    return photos.filter(photo => photo.groupId === groupId);
  }

  function locationStatus(group) {
    if (!group.location.trim()) return { kind: "no-location", text: "Aucun lieu renseigné" };
    if (group.geo || coordinatesForLocation(state.meta, group.location.trim())) {
      return { kind: "positioned", text: "Position prête pour la carte" };
    }
    return { kind: "no-coordinates", text: "Choisis une suggestion pour enregistrer la position" };
  }

  function stopLocationSearch(groupId) {
    const search = locationSearches.get(groupId);
    if (search) {
      clearTimeout(search.timer);
      search.controller?.abort();
      locationSearches.delete(groupId);
    }
  }

  function showLocationMessage(group, message) {
    const section = coinsElement.querySelector(`[data-group="${group.id}"]`);
    const suggestions = section?.querySelector(".location-suggestions");
    const input = section?.querySelector('[data-field="location"]');
    if (!suggestions || !input) return;
    suggestions.innerHTML = `<div class="location-suggestion-message">${safe(message)}</div>`;
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function hideLocationSuggestions(group) {
    const section = coinsElement.querySelector(`[data-group="${group.id}"]`);
    const suggestions = section?.querySelector(".location-suggestions");
    const input = section?.querySelector('[data-field="location"]');
    if (suggestions) suggestions.hidden = true;
    if (input) input.setAttribute("aria-expanded", "false");
  }

  async function searchLocations(group, query) {
    const search = locationSearches.get(group.id);
    if (!search) return;
    search.controller = new AbortController();
    showLocationMessage(group, "Recherche en cours…");
    try {
      const url = new URL(PHOTON_API);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "6");
      url.searchParams.set("lang", "fr");
      const response = await fetch(url, {
        signal: search.controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Service de recherche ${response.status}`);
      const data = await response.json();
      if (locationSearches.get(group.id) !== search || group.location.trim() !== query) return;
      const features = Array.isArray(data.features) ? data.features : [];
      search.features = features;
      if (!features.length) return showLocationMessage(group, "Aucun lieu trouvé.");
      const section = coinsElement.querySelector(`[data-group="${group.id}"]`);
      const suggestions = section?.querySelector(".location-suggestions");
      const input = section?.querySelector('[data-field="location"]');
      if (!suggestions || !input) return;
      suggestions.innerHTML = features.map((feature, index) => {
        const parts = locationParts(feature.properties || {});
        return `<button type="button" class="location-suggestion" role="option" data-action="select-location" data-index="${index}">
          <strong>${safe(parts.main)}</strong><small>${safe(parts.details || parts.label)}</small>
        </button>`;
      }).join("");
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
    } catch (error) {
      if (error.name !== "AbortError" && locationSearches.get(group.id) === search) {
        showLocationMessage(group, "La recherche de lieux est momentanément indisponible.");
      }
    }
  }

  function render() {
    $("#batchSummary").textContent = `${photos.length} photo(s) · ${groups.length} fiche(s)`;
    coinsElement.innerHTML = (photos.length ? "" : '<p class="help">Ajoute plusieurs photos. Elles seront réparties deux par deux, puis tu pourras les déplacer.</p>') + groups.map((group, index) => {
      const place = locationStatus(group);
      const assigned = groupPhotos(group.id);
      return `
      <section class="batch-coin" data-group="${group.id}">
        <div class="batch-coin-head">
          <h3>Pièce ${index + 1} <small>· ${assigned.length} photo(s)</small></h3>
          <div>
            <button type="button" class="button ghost" data-action="identify" data-group="${group.id}" ${assigned.length && state.cfg?.token ? "" : "disabled"}>✨ Proposer avec l’IA</button>
            <button type="button" class="button ghost" data-action="remove-group" data-group="${group.id}" ${groups.length === 1 ? "disabled" : ""}>Retirer la fiche</button>
          </div>
        </div>
        <div class="batch-coin-content">
          <div class="batch-coin-details">
            <div class="admin-grid two">
              <label>Nom *<input class="admin-input" data-field="name" value="${safe(group.name)}" required></label>
              <label>Année *<input class="admin-input" data-field="year" type="number" value="${safe(group.year)}" required></label>
              <label>Collection<select class="admin-select" data-field="collectionId">
                <option value="">Sans collection</option>
                ${state.meta.collections.map(collection => `<option value="${safe(collection.id)}" ${collection.id === group.collectionId ? "selected" : ""}>${safe(collection.name)}</option>`).join("")}
              </select></label>
              <label class="location-label">Lieu / adresse
                <div class="location-control">
                  <input class="admin-input" data-field="location" value="${safe(group.location)}" placeholder="Commence à écrire un lieu…" autocomplete="off"
                    aria-autocomplete="list" aria-controls="locationSuggestions-${group.id}" aria-expanded="false">
                  <div id="locationSuggestions-${group.id}" class="location-suggestions" role="listbox" hidden></div>
                </div>
                <span class="location-status ${place.kind}">${place.text}</span>
              </label>
              <label>Pays<input class="admin-input" data-field="country" value="${safe(group.country)}"></label>
              <label>Valeur / dénomination<input class="admin-input" data-field="denomination" value="${safe(group.denomination)}"></label>
              <label>Métal<input class="admin-input" data-field="metal" value="${safe(group.metal)}"></label>
              <label>Atelier / fabricant<input class="admin-input" data-field="mint" value="${safe(group.mint)}"></label>
            </div>
            <label>Notes<textarea class="admin-textarea" data-field="notes" rows="2">${safe(group.notes)}</textarea></label>
            ${group.sources.length ? `<div class="batch-sources"><strong>Sources proposées par l’IA :</strong> ${group.sources.map(source => `<a href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">${safe(source.title || source.url)}</a>`).join(" · ")}</div>` : ""}
          </div>
          <aside class="batch-coin-photo-panel" aria-label="Photos de la pièce ${index + 1}">
            <strong>Photos associées</strong>
            <div class="batch-coin-photos">
              ${assigned.length ? assigned.map((photo, photoIndex) => `
                <div class="batch-photo">
                  <img src="${safe(photo.preview)}" alt="Photo ${photoIndex + 1} de la pièce ${index + 1}" loading="lazy">
                  <div class="batch-photo-controls">
                    <label>Déplacer vers
                      <select class="admin-select" data-photo="${photo.id}" data-action="assign">
                        ${groups.map((target, targetIndex) => `<option value="${target.id}" ${target.id === photo.groupId ? "selected" : ""}>${safe(target.name || `Pièce ${targetIndex + 1}`)}</option>`).join("")}
                      </select>
                    </label>
                    <div class="batch-photo-actions">
                      <button type="button" class="button ghost" data-action="rotate-left" data-photo="${photo.id}" aria-label="Tourner la photo à gauche" title="Tourner à gauche">↶</button>
                      <button type="button" class="button ghost" data-action="rotate-right" data-photo="${photo.id}" aria-label="Tourner la photo à droite" title="Tourner à droite">↷</button>
                      <button type="button" class="button ghost" data-action="crop" data-photo="${photo.id}">Rogner</button>
                      <button type="button" class="button ghost" data-action="remove-photo" data-photo="${photo.id}" aria-label="Retirer la photo">×</button>
                    </div>
                  </div>
                </div>`).join("") : '<p class="help">Aucune photo associée.</p>'}
            </div>
          </aside>
        </div>
      </section>`;
    }).join("");
  }

  function addPhotos(files) {
    const valid = files.filter(file => file.type.startsWith("image/"));
    if (valid.length !== files.length) status("Certains fichiers ne sont pas des images.", "error");
    let current = groups.find(group => groupPhotos(group.id).length < 2);
    const added = [];
    for (const file of valid) {
      if (!current || groupPhotos(current.id).length >= 2) current = addGroup(false);
      const photo = { id: crypto.randomUUID(), groupId: current.id, file,
        preview: URL.createObjectURL(file), imageId: null, uploadedGroupId: null };
      photos.push(photo);
      added.push(photo);
      markPhotoForSave(photo);
    }
    render();
    if (added.length) queueDraftSave(persistDraft);
  }

  async function identify(group) {
    const selected = groupPhotos(group.id).slice(0, 3);
    if (!selected.length || busy) return;
    busy = true;
    status(`Recherche des informations pour « ${group.name || "cette pièce"} »…`);
    try {
      const data = await identifyPhotos(selected.map(photo => photo.file),
        [group.name, group.year, group.denomination].filter(Boolean).join(" · "), state.cfg.token);
      for (const field of ["name", "year", "country", "denomination", "metal", "mint", "notes"]) {
        if (!group[field] && data[field] != null) group[field] = String(data[field]);
      }
      group.sources = Array.isArray(data.sources) ? data.sources.filter(source => {
        try { return new URL(source.url).protocol === "https:"; } catch { return false; }
      }).slice(0, 5) : [];
      render();
      scheduleDraftSave();
      status("Proposition ajoutée. Vérifie les informations et les sources avant de publier.", "success");
    } catch (error) {
      status(error.message, "error");
    } finally {
      busy = false;
    }
  }

  async function publish() {
    if (busy) return;
    if (!state.cfg?.token) return status("Connecte-toi à GitHub pour publier le brouillon local.", "error");
    if (!navigator.onLine) return status("Hors connexion : le brouillon reste sur cet appareil. Publie quand le réseau revient.", "error");
    if (state.offlineMetadata) {
      try {
        await getMetadata();
        state.offlineMetadata = false;
        renderList();
        render();
      } catch (error) {
        return status(error.status ? error.message
          : "Impossible de joindre GitHub. Le brouillon reste enregistré sur cet appareil.", "error");
      }
    }
    if (photos.some(photo => photo.editing)) return status("Attends la fin de la modification des photos avant de publier.", "error");
    const ready = groups.filter(group => groupPhotos(group.id).length);
    if (!ready.length) return status("Ajoute au moins une photo à une fiche.", "error");
    const invalid = ready.find(group => !group.name.trim() || !/^\d{1,4}$/.test(String(group.year)));
    if (invalid) return status("Renseigne un nom et une année valide pour chaque pièce avec photo.", "error");
    const locations = ready.map(group => ({
      group, location: group.location.trim(),
      coordinates: group.geo || coordinatesForLocation(state.meta, group.location.trim())
    }));
    const unlocated = locations.find(item => item.location && !item.coordinates)?.group;
    if (unlocated) {
      coinsElement.querySelector(`[data-group="${unlocated.id}"] [data-field="location"]`)?.focus();
      return status("Choisis une adresse proposée pour enregistrer sa position sur la carte.", "error");
    }
    busy = true;
    $("#publishBatchButton").disabled = true;
    $("#batchPhotoInput").disabled = true;
    $("#addBatchCoinButton").disabled = true;
    coinsElement.querySelectorAll("input,select,textarea").forEach(field => { field.disabled = true; });
    const created = [];
    let previousCoins = state.meta.coins;
    let previousGeoMap = state.meta.geoMap;
    const applyLocations = () => {
      state.meta.geoMap = { ...state.meta.geoMap };
      locations.forEach(({ location, coordinates }) => {
        if (location && coordinates) state.meta.geoMap[location] = coordinates;
      });
    };
    try {
      for (const [groupIndex, group] of ready.entries()) {
        status(`Publication de la pièce ${groupIndex + 1}/${ready.length}…`);
        for (const [photoIndex, photo] of groupPhotos(group.id).entries()) {
          if (!photo.imageId || photo.uploadedGroupId !== group.id) {
            photo.imageId = await uploadImage(group.id, photo, photoIndex + 1, groupPhotos(group.id).length);
            photo.uploadedGroupId = group.id;
          }
        }
        const timestamp = new Date().toISOString();
        created.push({
          id: group.id, name: group.name.trim(), year: Number(group.year),
          collectionId: group.collectionId || null, country: group.country.trim(),
          denomination: group.denomination.trim(), metal: group.metal.trim(), mint: group.mint.trim(),
          location: group.location.trim(), condition: "", quantity: 1, estimatedValue: null,
          acquisitionDate: "", tags: [], notes: group.notes.trim(),
          imageIds: groupPhotos(group.id).map(photo => photo.imageId),
          createdAt: timestamp, updatedAt: timestamp
        });
      }
      state.meta.coins = [...previousCoins, ...created];
      applyLocations();
      try {
        await publishMetadata(`Ajout de ${created.length} pièces`);
      } catch (error) {
        state.meta.coins = previousCoins;
        state.meta.geoMap = previousGeoMap;
        if (error.status !== 409) throw error;
        await getMetadata();
        previousCoins = state.meta.coins;
        previousGeoMap = state.meta.geoMap;
        state.meta.coins = [...previousCoins, ...created];
        applyLocations();
        await publishMetadata(`Ajout de ${created.length} pièces`);
      }
      let draftCleared = true;
      try {
        await clearDraft();
      } catch {
        draftCleared = false;
        draftElement.textContent = "Publication réussie, mais le brouillon local doit être effacé manuellement";
      }
      photos.forEach(photo => URL.revokeObjectURL(photo.preview));
      for (const groupId of locationSearches.keys()) stopLocationSearch(groupId);
      photos.length = 0;
      groups.length = 0;
      addGroup(false);
      render();
      renderList();
      status(`${created.length} pièce(s) publiées.${draftCleared ? "" : " Efface le brouillon local avant de recommencer."}`, "success");
    } catch (error) {
      state.meta.coins = previousCoins;
      state.meta.geoMap = previousGeoMap;
      status(error.status === 409 ? "Conflit GitHub : les fiches sont conservées, mais la publication a échoué. Réessaie plus tard." : error.message, "error");
    } finally {
      busy = false;
      $("#publishBatchButton").disabled = false;
      $("#batchPhotoInput").disabled = false;
      $("#addBatchCoinButton").disabled = false;
      coinsElement.querySelectorAll("input,select,textarea").forEach(field => { field.disabled = false; });
    }
  }

  $("#batchButton").onclick = async () => {
    await restoreDraft();
    if (!groups.length) addGroup(false);
    render();
    dialog.showModal();
  };
  $("#closeBatchButton").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    for (const groupId of locationSearches.keys()) stopLocationSearch(groupId);
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
      queueDraftSave(persistDraft);
    }
  });
  $("#addBatchCoinButton").onclick = () => addGroup();
  $("#clearBatchDraftButton").onclick = async () => {
    if (busy || !confirm("Effacer toutes les fiches et photos non publiées de ce navigateur ?")) return;
    try {
      await clearDraft();
      photos.forEach(photo => URL.revokeObjectURL(photo.preview));
      photos.length = 0;
      groups.length = 0;
      addGroup(false);
      render();
      status("Brouillon local effacé.", "success");
    } catch {
      status("Impossible d’effacer le brouillon local.", "error");
    }
  };
  $("#publishBatchButton").onclick = publish;
  $("#batchPhotoInput").onchange = event => {
    addPhotos([...event.target.files]);
    event.target.value = "";
  };
  coinsElement.addEventListener("change", event => {
    if (event.target.dataset.action !== "assign") return;
    const photo = photos.find(item => item.id === event.target.dataset.photo);
    const destination = event.target.value;
    const moved = photo && photo.groupId !== destination;
    if (photo) {
      photo.groupId = destination;
      if (photo.uploadedGroupId !== photo.groupId) photo.imageId = null;
    }
    render();
    if (moved) coinsElement.querySelector(`[data-group="${destination}"]`)?.scrollIntoView({ block: "nearest" });
    scheduleDraftSave();
  });
  coinsElement.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const index = photos.findIndex(photo => photo.id === button.dataset.photo);
    if (index < 0) return;
    const photo = photos[index];
    if (button.dataset.action === "remove-photo") {
      if (photo.editing) return;
      URL.revokeObjectURL(photo.preview);
      photos.splice(index, 1);
      pendingPhotoVersions.delete(photo.id);
      render();
      queueDraftSave(async () => {
        await offlineStore.removeOffline(photoKey(photo.id));
        await persistDraft();
      });
    } else if (["crop", "rotate-left", "rotate-right"].includes(button.dataset.action)) {
      if (photo.editing) return;
      photo.editing = true;
      try {
        const edited = button.dataset.action === "crop"
          ? await cropPhoto(photo.file)
          : await rotatePhoto(photo.file, button.dataset.action === "rotate-left" ? "left" : "right");
        if (!edited || !photos.includes(photo)) return;
        URL.revokeObjectURL(photo.preview);
        photo.file = edited;
        photo.preview = URL.createObjectURL(edited);
        photo.imageId = null;
        markPhotoForSave(photo);
        render();
        queueDraftSave(persistDraft);
      } catch (error) {
        status(error.message, "error");
      } finally {
        photo.editing = false;
      }
    }
  });
  coinsElement.addEventListener("input", event => {
    const group = groups.find(item => item.id === event.target.closest("[data-group]")?.dataset.group);
    if (!group || !event.target.dataset.field) return;
    group[event.target.dataset.field] = event.target.value;
    scheduleDraftSave();
    if (event.target.dataset.field !== "location") return;
    stopLocationSearch(group.id);
    group.geo = coordinatesForLocation(state.meta, group.location.trim());
    const place = locationStatus(group);
    const indicator = event.target.closest(".location-label").querySelector(".location-status");
    indicator.className = `location-status ${place.kind}`;
    indicator.textContent = place.text;
    const query = group.location.trim();
    if (query.length < 3) return hideLocationSuggestions(group);
    const search = { timer: null, controller: null, features: [] };
    locationSearches.set(group.id, search);
    search.timer = setTimeout(() => searchLocations(group, query), 450);
  });
  coinsElement.addEventListener("change", event => {
    const group = groups.find(item => item.id === event.target.closest("[data-group]")?.dataset.group);
    if (group && event.target.dataset.field) {
      group[event.target.dataset.field] = event.target.value;
      scheduleDraftSave();
    }
  });
  coinsElement.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const group = groups.find(item => item.id === button.dataset.group);
    if (button.dataset.action === "select-location") {
      const selected = groups.find(item => item.id === button.closest("[data-group]")?.dataset.group);
      const feature = locationSearches.get(selected?.id)?.features[Number(button.dataset.index)];
      if (!selected || !feature) return;
      const longitude = Number(feature.geometry?.coordinates?.[0]);
      const latitude = Number(feature.geometry?.coordinates?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return showLocationMessage(selected, "Cette proposition ne contient pas de coordonnées.");
      }
      selected.location = locationParts(feature.properties || {}).label;
      selected.geo = { lat: latitude, lon: longitude };
      if (feature.properties?.country) selected.country = feature.properties.country;
      stopLocationSearch(selected.id);
      render();
      scheduleDraftSave();
      return;
    }
    if (!group) return;
    if (button.dataset.action === "identify") identify(group);
    if (button.dataset.action === "remove-group" && groups.length > 1) {
      stopLocationSearch(group.id);
      photos.filter(photo => photo.groupId === group.id).forEach(photo => {
        photo.groupId = groups.find(item => item.id !== group.id).id;
        photo.imageId = null;
      });
      groups.splice(groups.indexOf(group), 1);
      render();
      scheduleDraftSave();
    }
  });
  coinsElement.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.target.dataset.field !== "location") return;
    const group = groups.find(item => item.id === event.target.closest("[data-group]")?.dataset.group);
    if (group) {
      stopLocationSearch(group.id);
      hideLocationSuggestions(group);
      event.preventDefault();
      event.stopPropagation();
    }
  });
  document.addEventListener("click", event => {
    if (!dialog.open || event.target.closest("#batchCoins .location-control")) return;
    groups.forEach(group => {
      stopLocationSearch(group.id);
      hideLocationSuggestions(group);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !draftTimer) return;
    clearTimeout(draftTimer);
    draftTimer = null;
    queueDraftSave(persistDraft);
  });
}
