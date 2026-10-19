import { cropPhoto, imageDataUrl } from "./photo-tools.js";

const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

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

export function initBatch({ state, uploadImage, publishMetadata, getMetadata, renderList }) {
  const dialog = $("#batchDialog");
  const photosElement = $("#batchPhotos");
  const coinsElement = $("#batchCoins");
  const statusElement = $("#batchStatus");
  const groups = [];
  const photos = [];
  let busy = false;

  function status(message, type = "") {
    statusElement.textContent = message;
    statusElement.className = `save-status ${type}`;
  }

  function addGroup() {
    const group = {
      id: crypto.randomUUID(), name: "", year: "", collectionId: "",
      country: "", denomination: "", metal: "", mint: "", notes: "", sources: []
    };
    groups.push(group);
    render();
    return group;
  }

  function groupPhotos(groupId) {
    return photos.filter(photo => photo.groupId === groupId);
  }

  function render() {
    $("#batchSummary").textContent = `${photos.length} photo(s) · ${groups.length} fiche(s)`;
    photosElement.innerHTML = photos.length ? photos.map(photo => `
      <div class="batch-photo">
        <img src="${safe(photo.preview)}" alt="Photo à affecter">
        <label>Pièce
          <select class="admin-select" data-photo="${photo.id}" data-action="assign">
            ${groups.map((group, index) => `<option value="${group.id}" ${group.id === photo.groupId ? "selected" : ""}>${safe(group.name || `Pièce ${index + 1}`)}</option>`).join("")}
          </select>
        </label>
        <div class="batch-photo-actions">
          <button type="button" class="button ghost" data-action="crop" data-photo="${photo.id}">Rogner</button>
          <button type="button" class="button ghost" data-action="remove-photo" data-photo="${photo.id}" aria-label="Retirer la photo">×</button>
        </div>
      </div>`).join("") : '<p class="help">Ajoute plusieurs photos. Elles seront réparties deux par deux, puis tu pourras les déplacer.</p>';

    coinsElement.innerHTML = groups.map((group, index) => `
      <section class="batch-coin" data-group="${group.id}">
        <div class="batch-coin-head">
          <h3>Pièce ${index + 1} <small>· ${groupPhotos(group.id).length} photo(s)</small></h3>
          <div>
            <button type="button" class="button ghost" data-action="identify" data-group="${group.id}" ${groupPhotos(group.id).length ? "" : "disabled"}>✨ Proposer avec l’IA</button>
            <button type="button" class="button ghost" data-action="remove-group" data-group="${group.id}" ${groups.length === 1 ? "disabled" : ""}>Retirer la fiche</button>
          </div>
        </div>
        <div class="admin-grid two">
          <label>Nom *<input class="admin-input" data-field="name" value="${safe(group.name)}" required></label>
          <label>Année *<input class="admin-input" data-field="year" type="number" value="${safe(group.year)}" required></label>
          <label>Collection<select class="admin-select" data-field="collectionId">
            <option value="">Sans collection</option>
            ${state.meta.collections.map(collection => `<option value="${safe(collection.id)}" ${collection.id === group.collectionId ? "selected" : ""}>${safe(collection.name)}</option>`).join("")}
          </select></label>
          <label>Pays<input class="admin-input" data-field="country" value="${safe(group.country)}"></label>
          <label>Valeur / dénomination<input class="admin-input" data-field="denomination" value="${safe(group.denomination)}"></label>
          <label>Métal<input class="admin-input" data-field="metal" value="${safe(group.metal)}"></label>
          <label>Atelier / fabricant<input class="admin-input" data-field="mint" value="${safe(group.mint)}"></label>
        </div>
        <label>Notes<textarea class="admin-textarea" data-field="notes" rows="2">${safe(group.notes)}</textarea></label>
        ${group.sources.length ? `<div class="batch-sources"><strong>Sources proposées par l’IA :</strong> ${group.sources.map(source => `<a href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">${safe(source.title || source.url)}</a>`).join(" · ")}</div>` : ""}
      </section>`).join("");
  }

  function addPhotos(files) {
    const valid = files.filter(file => file.type.startsWith("image/"));
    if (valid.length !== files.length) status("Certains fichiers ne sont pas des images.", "error");
    let current = groups.find(group => groupPhotos(group.id).length < 2);
    for (const file of valid) {
      if (!current || groupPhotos(current.id).length >= 2) current = addGroup();
      photos.push({ id: crypto.randomUUID(), groupId: current.id, file, preview: URL.createObjectURL(file), imageId: null, uploadedGroupId: null });
    }
    render();
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
      status("Proposition ajoutée. Vérifie les informations et les sources avant de publier.", "success");
    } catch (error) {
      status(error.message, "error");
    } finally {
      busy = false;
    }
  }

  async function publish() {
    if (busy) return;
    const ready = groups.filter(group => groupPhotos(group.id).length);
    if (!ready.length) return status("Ajoute au moins une photo à une fiche.", "error");
    const invalid = ready.find(group => !group.name.trim() || !/^\d{1,4}$/.test(String(group.year)));
    if (invalid) return status("Renseigne un nom et une année valide pour chaque pièce avec photo.", "error");
    busy = true;
    $("#publishBatchButton").disabled = true;
    const created = [];
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
          location: "", condition: "", quantity: 1, estimatedValue: null,
          acquisitionDate: "", tags: [], notes: group.notes.trim(),
          imageIds: groupPhotos(group.id).map(photo => photo.imageId),
          createdAt: timestamp, updatedAt: timestamp
        });
      }
      let previous = state.meta.coins;
      state.meta.coins = [...previous, ...created];
      try {
        await publishMetadata(`Ajout de ${created.length} pièces`);
      } catch (error) {
        state.meta.coins = previous;
        if (error.status !== 409) throw error;
        await getMetadata();
        previous = state.meta.coins;
        state.meta.coins = [...previous, ...created];
        try {
          await publishMetadata(`Ajout de ${created.length} pièces`);
        } catch (retryError) {
          state.meta.coins = previous;
          throw retryError;
        }
      }
      photos.forEach(photo => URL.revokeObjectURL(photo.preview));
      photos.length = 0;
      groups.length = 0;
      addGroup();
      renderList();
      status(`${created.length} pièce(s) publiées.`, "success");
    } catch (error) {
      status(error.status === 409 ? "Conflit GitHub : les fiches sont conservées, mais la publication a échoué. Réessaie plus tard." : error.message, "error");
    } finally {
      busy = false;
      $("#publishBatchButton").disabled = false;
    }
  }

  $("#batchButton").onclick = () => {
    if (!groups.length) addGroup();
    render();
    dialog.showModal();
  };
  $("#closeBatchButton").onclick = () => dialog.close();
  $("#addBatchCoinButton").onclick = () => addGroup();
  $("#publishBatchButton").onclick = publish;
  $("#batchPhotoInput").onchange = event => {
    addPhotos([...event.target.files]);
    event.target.value = "";
  };
  photosElement.addEventListener("change", event => {
    if (event.target.dataset.action !== "assign") return;
    const photo = photos.find(item => item.id === event.target.dataset.photo);
    if (photo) {
      photo.groupId = event.target.value;
      if (photo.uploadedGroupId !== photo.groupId) photo.imageId = null;
    }
    render();
  });
  photosElement.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const index = photos.findIndex(photo => photo.id === button.dataset.photo);
    if (index < 0) return;
    const photo = photos[index];
    if (button.dataset.action === "remove-photo") {
      URL.revokeObjectURL(photo.preview);
      photos.splice(index, 1);
      render();
    } else if (button.dataset.action === "crop") {
      try {
        const cropped = await cropPhoto(photo.file);
        if (!cropped) return;
        URL.revokeObjectURL(photo.preview);
        photo.file = cropped;
        photo.preview = URL.createObjectURL(cropped);
        photo.imageId = null;
        render();
      } catch (error) {
        status(error.message, "error");
      }
    }
  });
  coinsElement.addEventListener("input", event => {
    const group = groups.find(item => item.id === event.target.closest("[data-group]")?.dataset.group);
    if (group && event.target.dataset.field) group[event.target.dataset.field] = event.target.value;
  });
  coinsElement.addEventListener("change", event => {
    const group = groups.find(item => item.id === event.target.closest("[data-group]")?.dataset.group);
    if (group && event.target.dataset.field) group[event.target.dataset.field] = event.target.value;
  });
  coinsElement.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const group = groups.find(item => item.id === button.dataset.group);
    if (!group) return;
    if (button.dataset.action === "identify") identify(group);
    if (button.dataset.action === "remove-group" && groups.length > 1) {
      photos.filter(photo => photo.groupId === group.id).forEach(photo => {
        photo.groupId = groups.find(item => item.id !== group.id).id;
        photo.imageId = null;
      });
      groups.splice(groups.indexOf(group), 1);
      render();
    }
  });
}
