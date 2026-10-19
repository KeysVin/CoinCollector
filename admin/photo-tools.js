export async function imageDataUrl(file, maximum = 1100) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function cropPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const dialog = document.createElement("dialog");
  dialog.className = "admin-dialog crop-dialog";
  dialog.innerHTML = `
    <div class="dialog-admin-head"><h2>Rogner la photo</h2></div>
    <p class="help">Trace un rectangle autour de la pièce. Tu peux recommencer autant de fois que nécessaire.</p>
    <div class="crop-stage"><canvas></canvas><div class="crop-selection"></div></div>
    <div class="crop-actions">
      <button type="button" class="button ghost" data-action="cancel">Annuler</button>
      <button type="button" class="button primary" data-action="apply">Appliquer le rognage</button>
    </div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector("canvas");
  const stage = dialog.querySelector(".crop-stage");
  const selection = dialog.querySelector(".crop-selection");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  let rectangle = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };
  let start = null;
  const clamp = number => Math.max(0, Math.min(1, number));
  const point = event => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height)
    };
  };
  const drawSelection = () => {
    const bounds = canvas.getBoundingClientRect();
    selection.style.left = `${bounds.left - stage.getBoundingClientRect().left + rectangle.x * bounds.width}px`;
    selection.style.top = `${bounds.top - stage.getBoundingClientRect().top + rectangle.y * bounds.height}px`;
    selection.style.width = `${rectangle.width * bounds.width}px`;
    selection.style.height = `${rectangle.height * bounds.height}px`;
  };
  stage.addEventListener("pointerdown", event => {
    start = point(event);
    stage.setPointerCapture(event.pointerId);
    rectangle = { x: start.x, y: start.y, width: 0, height: 0 };
    drawSelection();
  });
  stage.addEventListener("pointermove", event => {
    if (!start) return;
    const end = point(event);
    rectangle = {
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y)
    };
    drawSelection();
  });
  stage.addEventListener("pointerup", () => { start = null; });
  dialog.showModal();
  drawSelection();
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      bitmap.close();
      dialog.remove();
      resolve(result);
    };
    dialog.addEventListener("close", () => finish(null), { once: true });
    dialog.querySelector('[data-action="cancel"]').onclick = () => dialog.close();
    dialog.querySelector('[data-action="apply"]').onclick = () => {
      if (rectangle.width < 0.02 || rectangle.height < 0.02) return;
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(rectangle.width * bitmap.width));
      output.height = Math.max(1, Math.round(rectangle.height * bitmap.height));
      output.getContext("2d").drawImage(
        bitmap,
        Math.round(rectangle.x * bitmap.width), Math.round(rectangle.y * bitmap.height),
        output.width, output.height,
        0, 0, output.width, output.height
      );
      output.toBlob(blob => {
        if (!blob) return;
        const result = new File([blob], file.name.replace(/\.[^.]+$/, "") + "-rognee.jpg", { type: "image/jpeg" });
        dialog.close();
        finish(result);
      }, "image/jpeg", 0.92);
    };
  });
}
