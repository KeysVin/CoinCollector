import assert from "node:assert/strict";
import test from "node:test";
import { initBatch } from "../admin/batch.js";

test("sixty imported photos stay beside their thirty coin forms after reassignment", async () => {
  const elements = new Map();
  const saved = new Map();
  for (const id of [
    "batchDialog", "batchCoins", "batchStatus", "batchSummary", "batchButton",
    "batchDraftStatus", "clearBatchDraftButton", "closeBatchButton",
    "addBatchCoinButton", "publishBatchButton", "batchPhotoInput"
  ]) {
    elements.set(`#${id}`, {
      innerHTML: "", textContent: "", handlers: {},
      addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
      querySelector() { return { scrollIntoView() {} }; },
      showModal() {}, close() {}
    });
  }
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector(selector) { return elements.get(selector); },
    addEventListener() {}
  };
  try {
    const options = {
      state: { cfg: { owner: "test", repo: "coins", branch: "main" }, meta: { collections: [], geoMap: {} } },
      uploadImage() {}, publishMetadata() {}, getMetadata() {}, renderList() {},
      offlineStore: {
        async readOffline(key) { return saved.get(key); },
        async writeOffline(key, value) { saved.set(key, value); },
        async removeOffline(key) { saved.delete(key); }
      }
    };
    initBatch(options);
    await elements.get("#batchButton").onclick();
    const files = Array.from({ length: 60 }, (_, index) =>
      new File([`photo ${index}`], `photo-${index}.jpg`, { type: "image/jpeg" }));
    elements.get("#batchPhotoInput").onchange({ target: { files, value: "photos" } });

    let markup = elements.get("#batchCoins").innerHTML;
    let cards = [...markup.matchAll(/<section class="batch-coin" data-group="([^"]+)">([\s\S]*?)<\/section>/g)];
    assert.equal(cards.length, 30);
    assert.equal([...markup.matchAll(/class="batch-photo"/g)].length, 60);
    assert.ok(cards.every(card => [...card[2].matchAll(/class="batch-photo"/g)].length === 2));

    const photoId = cards[0][2].match(/data-photo="([^"]+)" data-action="assign"/)[1];
    const destination = cards[29][1];
    const event = { target: {
      dataset: { action: "assign", photo: photoId }, value: destination,
      closest: () => ({ dataset: { group: cards[0][1] } })
    } };
    elements.get("#batchCoins").handlers.change.forEach(handler => handler(event));
    markup = elements.get("#batchCoins").innerHTML;
    cards = [...markup.matchAll(/<section class="batch-coin" data-group="([^"]+)">([\s\S]*?)<\/section>/g)];
    assert.equal([...cards[0][2].matchAll(/class="batch-photo"/g)].length, 1);
    assert.equal([...cards[29][2].matchAll(/class="batch-photo"/g)].length, 3);
    elements.get("#batchDialog").handlers.close.forEach(handler => handler());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(saved.get("draft:test/coins/main").photos.length, 60);
    assert.ok(saved.get(`draft:test/coins/main:photo:${photoId}`) instanceof File);

    initBatch(options);
    await elements.get("#batchButton").onclick();
    assert.equal([...elements.get("#batchCoins").innerHTML.matchAll(/class="batch-photo"/g)].length, 60);
  } finally {
    globalThis.document = previousDocument;
  }
});
