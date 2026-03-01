// app.js
(() => {
  const STATIONS_STORAGE_KEY = "bma_stations_v3";
  const STATIONS_STORAGE_BACKUP_KEY = "bma_stations_v3_backup";
  const ASSETS_DB_NAME = "bma_assets_v1";
  const ASSETS_STORE = "images";

  const stationSelect = document.getElementById("stationSelect");
  const levelSelect = document.getElementById("levelSelect");
  const pageIndicator = document.getElementById("pageIndicator");

  const adminBtn = document.getElementById("adminBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const pngBtn = document.getElementById("pngBtn");
  const zipBtn = document.getElementById("zipBtn");
  const maintBtn = document.getElementById("maintBtn");

  const planWrap = document.getElementById("planWrap");
  const planViewport = document.getElementById("planViewport");
  const planImg = document.getElementById("planImg");
  const marksLayer = document.getElementById("marksLayer");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const settingsPanel = document.getElementById("settingsPanel");
  const newStationInput = document.getElementById("newStationInput");
  const addStationBtn = document.getElementById("addStationBtn");
  const newLevelInput = document.getElementById("newLevelInput");
  const addLevelBtn = document.getElementById("addLevelBtn");
  const uploadImageInput = document.getElementById("uploadImageInput");
  const addImageBtn = document.getElementById("addImageBtn");
  const deleteImageBtn = document.getElementById("deleteImageBtn");
  const deleteLevelBtn = document.getElementById("deleteLevelBtn");
  const deleteStationBtn = document.getElementById("deleteStationBtn");

  let STATIONS = loadStations();

  // ---- State
  let adminEnabled = false;
  let maintenanceEnabled = false;
  let currentStation = null;
  let currentLevel = null;
  let currentPageIdx = 0;
  let ignoreNextClick = false;

  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  let touchStartPoint = null;
  let movedTouch = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let isPinching = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let longPressTimer = null;
  let longPressTriggered = false;
  let sampleCanvas = null;
  let sampleCtx = null;
  let sampleSrc = "";
  const assetSrcCache = new Map();

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadStations() {
    const parseStations = raw => {
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    };

    try {
      const primary = parseStations(localStorage.getItem(STATIONS_STORAGE_KEY));
      if (primary) return primary;
    } catch {}

    try {
      const backup = parseStations(localStorage.getItem(STATIONS_STORAGE_BACKUP_KEY));
      if (backup) {
        localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify(backup));
        return backup;
      }
    } catch {}

    const fallback = (window.STATIONS && typeof window.STATIONS === "object") ? clone(window.STATIONS) : {};
    try {
      localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify(fallback));
      localStorage.setItem(STATIONS_STORAGE_BACKUP_KEY, JSON.stringify(fallback));
    } catch {}
    return fallback;
  }

  function saveStations() {
    let payload = "";
    try {
      payload = JSON.stringify(STATIONS);
      localStorage.setItem(STATIONS_STORAGE_KEY, payload);
    } catch {
      alert("Speichern fehlgeschlagen. Bild ist evtl. zu groß oder Speicher voll.");
      return false;
    }

    try {
      // Backup is best-effort and should not block the main save.
      localStorage.setItem(STATIONS_STORAGE_BACKUP_KEY, payload);
    } catch {}

    return true;
  }


  function openAssetsDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ASSETS_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          db.createObjectStore(ASSETS_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB öffnen fehlgeschlagen."));
    });
  }

  async function putImageAsset(dataUrl) {
    const db = await openAssetsDb();
    try {
      const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(ASSETS_STORE, "readwrite");
        tx.objectStore(ASSETS_STORE).put(dataUrl, assetId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Asset speichern fehlgeschlagen."));
      });
      assetSrcCache.set(assetId, dataUrl);
      return assetId;
    } finally {
      db.close();
    }
  }

  async function getImageAsset(assetId) {
    if (!assetId) return null;
    if (assetSrcCache.has(assetId)) return assetSrcCache.get(assetId);

    const db = await openAssetsDb();
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const tx = db.transaction(ASSETS_STORE, "readonly");
        const req = tx.objectStore(ASSETS_STORE).get(assetId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error("Asset laden fehlgeschlagen."));
      });
      if (dataUrl) assetSrcCache.set(assetId, dataUrl);
      return dataUrl;
    } finally {
      db.close();
    }
  }

  async function getPageSrc(page) {
    if (!page) return "";
    if (page.src) return page.src;
    if (page.assetId) return (await getImageAsset(page.assetId)) || "";
    return "";
  }

  // ---- Storage helpers for marks
  const storageKey = () => `bma_marks_v2_${currentStation}__${currentLevel}`;
  const loadSavedMarks = () => {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const saveMarks = pages => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(pages));
    } catch {}
  };

  // ---- UI helpers
  function setModeUI() {
    adminBtn.textContent = adminEnabled ? "Admin: EIN" : "Admin: AUS";
    maintBtn.textContent = maintenanceEnabled ? "Wartung: EIN" : "Wartung: AUS";
    settingsPanel.classList.toggle("show", adminEnabled);
  }

  function setNavDisabled() {
    const pages = getPages();
    const max = Math.max(0, pages.length - 1);

    prevBtn.classList.toggle("disabled", currentPageIdx <= 0);
    nextBtn.classList.toggle("disabled", currentPageIdx >= max);
    pageIndicator.textContent = `${pages.length ? currentPageIdx + 1 : 0}/${pages.length || 0}`;
  }

  function populateStations() {
    stationSelect.innerHTML = "";
    for (const name of Object.keys(STATIONS)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      stationSelect.appendChild(opt);
    }
  }

  function populateLevels(stationName) {
    levelSelect.innerHTML = "";
    const levels = Object.keys(STATIONS[stationName]?.levels || {});
    for (const lvl of levels) {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = lvl;
      levelSelect.appendChild(opt);
    }
  }

  function getPages() {
    if (!currentStation || !currentLevel) return [];
    return STATIONS[currentStation]?.levels?.[currentLevel] || [];
  }

  function hydrateFromStorageIntoData() {
    const pages = getPages();
    const saved = loadSavedMarks();
    if (Array.isArray(saved) && saved.length === pages.length) {
      for (let i = 0; i < pages.length; i++) {
        pages[i].marks = Array.isArray(saved[i].marks) ? saved[i].marks : [];
      }
    }
  }

  async function renderImageAndMarks(options = {}) {
    const { preserveView = false } = options;
    const pages = getPages();
    if (!pages.length) {
      planImg.removeAttribute("src");
      marksLayer.innerHTML = "";
      pageIndicator.textContent = "0/0";
      resetZoom();
      return;
    }

    if (currentPageIdx > pages.length - 1) currentPageIdx = pages.length - 1;
    const page = pages[currentPageIdx];
    const pageSrc = await getPageSrc(page);
    if (!pageSrc) {
      planImg.removeAttribute("src");
      marksLayer.innerHTML = "";
      pageIndicator.textContent = "0/0";
      return;
    }

    const currentSrc = planImg.getAttribute("src") || "";
    if (currentSrc !== pageSrc) {
      sampleSrc = "";
      planImg.src = pageSrc;
      planImg.onload = () => {
        refreshSampleCanvas();
      };
    } else {
      refreshSampleCanvas();
    }

    if (preserveView) applyPlanTransform();
    else resetZoom();

    marksLayer.innerHTML = "";
    for (const m of page.marks || []) {
      const el = document.createElement("img");
      el.className = "mark";
      el.src = makeCheckSVGDataURL();
      el.style.left = `${m.x * 100}%`;
      el.style.top = `${m.y * 100}%`;
      marksLayer.appendChild(el);
    }

    setNavDisabled();
  }

  function makeCheckSVGDataURL() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90">
        <text x="45" y="58" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#2C2550" opacity="0.55">✔</text>
        <text x="45" y="56" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="700" fill="#7865BE">✔</text>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }



  function refreshSampleCanvas() {
    const src = planImg.currentSrc || planImg.src || "";
    if (!src || !planImg.naturalWidth || !planImg.naturalHeight) return false;
    if (sampleCanvas && sampleSrc === src) return true;

    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = planImg.naturalWidth;
    sampleCanvas.height = planImg.naturalHeight;
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    sampleCtx.drawImage(planImg, 0, 0);
    sampleSrc = src;
    return true;
  }

  function getMagnetSnappedPos(pos) {
    if (!pos || !refreshSampleCanvas() || !sampleCtx) return pos;

    const w = sampleCanvas.width;
    const h = sampleCanvas.height;
    const px = pos.x * w;
    const py = pos.y * h;
    const radius = Math.max(16, Math.min(44, Math.round(Math.min(w, h) * 0.02)));

    const left = Math.max(0, Math.floor(px - radius));
    const top = Math.max(0, Math.floor(py - radius));
    const right = Math.min(w, Math.ceil(px + radius));
    const bottom = Math.min(h, Math.ceil(py + radius));
    const sw = right - left;
    const sh = bottom - top;
    if (sw < 6 || sh < 6) return pos;

    const data = sampleCtx.getImageData(left, top, sw, sh).data;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = sw;
    let minY = sh;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (a > 40 && lum < 96) {
          count++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (count < 24) return pos;

    const boxW = Math.max(1, maxX - minX + 1);
    const boxH = Math.max(1, maxY - minY + 1);
    const ratio = boxW / boxH;
    if (ratio < 0.6 || ratio > 1.7) return pos;

    const density = count / (boxW * boxH);
    if (density < 0.07 || density > 0.7) return pos;

    const cx = left + sumX / count;
    const cy = top + sumY / count;
    const dist = Math.hypot(cx - px, cy - py);
    if (dist > radius * 0.9) return pos;

    return { x: cx / w, y: cy / h };
  }

  function clampPan() {
    const baseW = planImg.clientWidth || planWrap.clientWidth || 1;
    const baseH = planImg.clientHeight || planWrap.clientHeight || 1;
    const maxPanX = Math.max(0, (baseW * (zoomScale - 1)) / 2);
    const maxPanY = Math.max(0, (baseH * (zoomScale - 1)) / 2);
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function applyPlanTransform() {
    clampPan();
    planViewport.style.transformOrigin = "50% 50%";
    planViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  }

  function resetZoom() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyPlanTransform();
  }

  function touchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  function getRelativePointerFromPoint(point) {
    const rect = planImg.getBoundingClientRect();
    if (!point || rect.width <= 0 || rect.height <= 0) return null;

    const x = (point.clientX - rect.left) / rect.width;
    const y = (point.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function clearLongPressTimer() {
    if (!longPressTimer) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function getRelativePointerPos(evt) {
    const point = (evt.changedTouches && evt.changedTouches[0]) || (evt.touches && evt.touches[0]) || evt;
    return getRelativePointerFromPoint(point);
  }

  function toggleMarkAt(x, y) {
    if (!maintenanceEnabled) return;
    const pages = getPages();
    if (!pages.length) return;

    const page = pages[currentPageIdx];
    if (!Array.isArray(page.marks)) page.marks = [];

    const hitRadius = 0.03;
    const idx = page.marks.findIndex(m => {
      const dx = m.x - x;
      const dy = m.y - y;
      return Math.sqrt(dx * dx + dy * dy) < hitRadius;
    });

    if (idx >= 0) page.marks.splice(idx, 1);
    else page.marks.push({ x, y });

    saveMarks(getPages());
    renderImageAndMarks({ preserveView: true });
  }

  async function exportPNGCurrent() {
    const pages = getPages();
    if (!pages.length) return;

    const page = pages[currentPageIdx];
    const pageSrc = await getPageSrc(page);
    if (!pageSrc) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = pageSrc;

    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Bild konnte nicht geladen werden (CORS/Path)."));
    }).catch(e => {
      alert(e.message);
      return null;
    });

    if (!img.complete) return;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0);

    for (const m of page.marks || []) {
      const px = m.x * canvas.width;
      const py = m.y * canvas.height;
      const size = Math.max(34, Math.round(canvas.width * 0.032));
      ctx.save();
      ctx.translate(px, py);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "rgba(44,37,80,0.88)";
      ctx.lineWidth = 0.16 * size;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "#7865BE";
      ctx.lineWidth = 0.1 * size;
      ctx.stroke();

      ctx.restore();
    }

    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (!blob) return;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentStation}_${currentLevel}_Seite-${currentPageIdx + 1}.png`.replaceAll(" ", "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function exportZIPStation() {
    if (typeof JSZip === "undefined") {
      alert("JSZip ist nicht geladen (Internet?).");
      return;
    }

    const zip = new JSZip();
    const station = STATIONS[currentStation];
    if (!station) return;

    for (const levelKey of Object.keys(station.levels || {})) {
      const pages = station.levels[levelKey] || [];
      const prevLevel = currentLevel;
      currentLevel = levelKey;
      hydrateFromStorageIntoData();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pngBlob = await renderPageToPNGBlob(page).catch(() => null);
        if (pngBlob) {
          zip.file(`${currentStation}/${levelKey}/Seite-${i + 1}.png`.replaceAll(" ", "_"), pngBlob);
        }
      }

      currentLevel = prevLevel;
    }

    const out = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `${currentStation}_Export.zip`.replaceAll(" ", "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);

    renderImageAndMarks();
  }

  async function renderPageToPNGBlob(page) {
    const pageSrc = await getPageSrc(page);
    if (!pageSrc) return null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = pageSrc;

    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Bild konnte nicht geladen werden (CORS/Path)."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    for (const m of page.marks || []) {
      const px = m.x * canvas.width;
      const py = m.y * canvas.height;
      const size = Math.max(34, Math.round(canvas.width * 0.032));

      ctx.save();
      ctx.translate(px, py);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "rgba(44,37,80,0.88)";
      ctx.lineWidth = 0.16 * size;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "#7865BE";
      ctx.lineWidth = 0.1 * size;
      ctx.stroke();

      ctx.restore();
    }

    return await new Promise(r => canvas.toBlob(r, "image/png"));
  }

  function clearAllWithPassword() {
    if (!adminEnabled) {
      alert("Admin-Modus erforderlich.");
      return;
    }
    const pw = prompt("Passwort für ALLES löschen:");
    if (pw !== "1705") {
      alert("Falsches Passwort.");
      return;
    }

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bma_marks_v2_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));

    for (const s of Object.keys(STATIONS)) {
      for (const l of Object.keys(STATIONS[s].levels || {})) {
        for (const p of STATIONS[s].levels[l] || []) p.marks = [];
      }
    }

    if (!saveStations()) return;
    renderImageAndMarks();
  }

  async function fileToDataURL(file) {
    const rawDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      image.src = rawDataUrl;
    });

    const maxDim = 1400;
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
    const targetH = Math.max(1, Math.round(img.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const candidates = [
      canvas.toDataURL("image/webp", 0.72),
      canvas.toDataURL("image/jpeg", 0.72),
      canvas.toDataURL("image/jpeg", 0.58),
      canvas.toDataURL("image/jpeg", 0.45)
    ];

    // Prefer the smallest candidate to reduce localStorage pressure.
    let best = candidates[0];
    for (const c of candidates) {
      if (c.length < best.length) best = c;
    }
    return best;
  }

  function addStation() {
    if (!adminEnabled) return;
    const name = newStationInput.value.trim();
    if (!name) return;
    if (STATIONS[name]) {
      alert("Station existiert bereits.");
      return;
    }

    STATIONS[name] = { levels: { N0: [] } };
    if (!saveStations()) {
      delete STATIONS[name];
      return;
    }

    populateStations();
    currentStation = name;
    stationSelect.value = name;
    populateLevels(name);
    currentLevel = levelSelect.value;
    currentPageIdx = 0;
    renderImageAndMarks();

    newStationInput.value = "";
  }

  function addLevel() {
    if (!adminEnabled) return;
    if (!currentStation) return;
    const lvl = newLevelInput.value.trim();
    if (!lvl) return;

    const levels = STATIONS[currentStation].levels || (STATIONS[currentStation].levels = {});
    if (!levels[lvl]) levels[lvl] = [];
    if (!saveStations()) {
      delete levels[lvl];
      return;
    }

    populateLevels(currentStation);
    currentLevel = lvl;
    levelSelect.value = lvl;
    currentPageIdx = 0;
    renderImageAndMarks();

    newLevelInput.value = "";
  }

  async function addImageToCurrentLevel() {
    if (!adminEnabled) return;
    if (!currentStation || !currentLevel) {
      alert("Bitte zuerst Station und Level wählen.");
      return;
    }

    const file = uploadImageInput.files?.[0];
    if (!file) {
      alert("Bitte ein Bild auswählen.");
      return;
    }

    const dataUrl = await fileToDataURL(file).catch(() => null);
    if (!dataUrl) {
      alert("Bild konnte nicht geladen/komprimiert werden.");
      return;
    }

    const assetId = await putImageAsset(dataUrl).catch(() => null);
    if (!assetId) {
      alert("Bild konnte nicht gespeichert werden (IndexedDB). Bitte Browser-Speicher prüfen.");
      return;
    }

    const pages = STATIONS[currentStation].levels[currentLevel] || (STATIONS[currentStation].levels[currentLevel] = []);
    pages.push({ assetId, marks: [] });
    if (!saveStations()) {
      pages.pop();
      return;
    }

    currentPageIdx = pages.length - 1;
    renderImageAndMarks();
    uploadImageInput.value = "";
  }



  function deleteCurrentPage() {
    if (!adminEnabled || !currentStation || !currentLevel) return;
    const pages = getPages();
    if (!pages.length) return;
    if (!confirm("Aktuelle Seite wirklich löschen?")) return;

    pages.splice(currentPageIdx, 1);
    if (currentPageIdx >= pages.length) currentPageIdx = Math.max(0, pages.length - 1);
    if (!saveStations()) return;
    saveMarks(pages);
    renderImageAndMarks();
  }

  function deleteCurrentLevel() {
    if (!adminEnabled || !currentStation || !currentLevel) return;
    if (!confirm(`Level ${currentLevel} wirklich löschen?`)) return;

    const levelToDelete = currentLevel;
    delete STATIONS[currentStation].levels[levelToDelete];

    const prefix = `bma_marks_v2_${currentStation}__${levelToDelete}`;
    localStorage.removeItem(prefix);

    const remainingLevels = Object.keys(STATIONS[currentStation].levels || {});
    if (!remainingLevels.length) STATIONS[currentStation].levels = { N0: [] };

    if (!saveStations()) return;
    populateLevels(currentStation);
    currentLevel = levelSelect.value;
    currentPageIdx = 0;
    hydrateFromStorageIntoData();
    renderImageAndMarks();
  }

  function deleteCurrentStation() {
    if (!adminEnabled || !currentStation) return;
    if (!confirm(`Station ${currentStation} wirklich löschen?`)) return;

    const stationToDelete = currentStation;
    delete STATIONS[stationToDelete];

    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`bma_marks_v2_${stationToDelete}__`)) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));

    if (!saveStations()) return;
    populateStations();

    const firstStation = Object.keys(STATIONS)[0] || null;
    if (!firstStation) {
      stationSelect.innerHTML = `<option value="">Keine Stationen</option>`;
      levelSelect.innerHTML = `<option value="">Keine Level</option>`;
      currentStation = null;
      currentLevel = null;
      currentPageIdx = 0;
      renderImageAndMarks();
      return;
    }

    currentStation = firstStation;
    stationSelect.value = firstStation;
    populateLevels(firstStation);
    currentLevel = levelSelect.value;
    currentPageIdx = 0;
    hydrateFromStorageIntoData();
    renderImageAndMarks();
  }

  stationSelect.addEventListener("change", () => {
    currentStation = stationSelect.value;
    populateLevels(currentStation);
    currentLevel = levelSelect.value;
    currentPageIdx = 0;
    hydrateFromStorageIntoData();
    renderImageAndMarks();
  });

  levelSelect.addEventListener("change", () => {
    currentLevel = levelSelect.value;
    currentPageIdx = 0;
    hydrateFromStorageIntoData();
    renderImageAndMarks();
  });

  adminBtn.addEventListener("click", () => {
    if (!adminEnabled) {
      const pw = prompt("Admin-Passwort:");
      if (pw !== "1705") {
        alert("Falsches Passwort.");
        return;
      }
      adminEnabled = true;
    } else {
      adminEnabled = false;
    }
    setModeUI();
  });

  maintBtn.addEventListener("click", () => {
    maintenanceEnabled = !maintenanceEnabled;
    setModeUI();
  });

  addStationBtn.addEventListener("click", addStation);
  addLevelBtn.addEventListener("click", addLevel);
  addImageBtn.addEventListener("click", addImageToCurrentLevel);
  deleteImageBtn.addEventListener("click", deleteCurrentPage);
  deleteLevelBtn.addEventListener("click", deleteCurrentLevel);
  deleteStationBtn.addEventListener("click", deleteCurrentStation);

  clearAllBtn.addEventListener("click", clearAllWithPassword);
  pngBtn.addEventListener("click", exportPNGCurrent);
  zipBtn.addEventListener("click", exportZIPStation);

  prevBtn.addEventListener("click", () => {
    if (currentPageIdx > 0) {
      currentPageIdx--;
      renderImageAndMarks();
    }
  });
  nextBtn.addEventListener("click", () => {
    const pages = getPages();
    if (currentPageIdx < pages.length - 1) {
      currentPageIdx++;
      renderImageAndMarks();
    }
  });

  planWrap.addEventListener("wheel", evt => {
    evt.preventDefault();
    const delta = evt.deltaY < 0 ? 0.12 : -0.12;
    zoomScale = Math.min(3, Math.max(1, zoomScale + delta));
    if (zoomScale === 1) {
      panX = 0;
      panY = 0;
    }
    applyPlanTransform();
  }, { passive: false });

  planWrap.addEventListener("touchstart", evt => {
    if (!evt.touches?.length) return;

    movedTouch = false;
    longPressTriggered = false;
    clearLongPressTimer();

    if (evt.touches.length === 2) {
      isPinching = true;
      pinchStartDist = touchDistance(evt.touches[0], evt.touches[1]);
      pinchStartScale = zoomScale;
      return;
    }

    isPinching = false;
    const t = evt.touches[0];
    touchStartPoint = { x: t.clientX, y: t.clientY };

    if (maintenanceEnabled) {
      const point = { clientX: t.clientX, clientY: t.clientY };
      longPressTimer = setTimeout(() => {
        if (movedTouch || isPinching) return;
        const pos = getRelativePointerFromPoint(point);
        if (!pos) return;
        const snapped = getMagnetSnappedPos(pos);
        longPressTriggered = true;
        toggleMarkAt(snapped.x, snapped.y);
      }, 2000);
    }

    if (zoomScale > 1) {
      panStartX = t.clientX;
      panStartY = t.clientY;
      panOriginX = panX;
      panOriginY = panY;
    }
  }, { passive: true });

  planWrap.addEventListener("touchmove", evt => {
    if (!evt.touches?.length) return;

    if (evt.touches.length === 2) {
      evt.preventDefault();
      isPinching = true;
      const dist = touchDistance(evt.touches[0], evt.touches[1]);
      if (!pinchStartDist) return;
      zoomScale = Math.min(3, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
      if (zoomScale === 1) {
        panX = 0;
        panY = 0;
      }
      applyPlanTransform();
      movedTouch = true;
      clearLongPressTimer();
      return;
    }

    const t = evt.touches[0];
    if (touchStartPoint) {
      const dx = t.clientX - touchStartPoint.x;
      const dy = t.clientY - touchStartPoint.y;
      if (Math.hypot(dx, dy) > 5) {
        movedTouch = true;
        clearLongPressTimer();
      }
    }

    if (zoomScale > 1) {
      evt.preventDefault();
      panX = panOriginX + (t.clientX - panStartX);
      panY = panOriginY + (t.clientY - panStartY);
      applyPlanTransform();
    }
  }, { passive: false });

  planWrap.addEventListener("click", evt => {
    if (!maintenanceEnabled) return;
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }

    const pos = getRelativePointerPos(evt);
    if (!pos) return;
    const snapped = getMagnetSnappedPos(pos);
    toggleMarkAt(snapped.x, snapped.y);
  });

  planWrap.addEventListener(
    "touchend",
    () => {
      clearLongPressTimer();
      if (isPinching) {
        isPinching = false;
      }

      if (longPressTriggered) {
        ignoreNextClick = true;
        setTimeout(() => {
          ignoreNextClick = false;
        }, 300);
      }
    },
    { passive: true }
  );

  planWrap.addEventListener("touchcancel", () => {
    clearLongPressTimer();
    isPinching = false;
  }, { passive: true });

  function init() {
    populateStations();

    const firstStation = Object.keys(STATIONS)[0] || null;
    if (!firstStation) {
      stationSelect.innerHTML = `<option value="">Keine Stationen</option>`;
      levelSelect.innerHTML = `<option value="">Keine Level</option>`;
      pageIndicator.textContent = "0/0";
      adminEnabled = false;
      maintenanceEnabled = false;
      setModeUI();
      return;
    }

    currentStation = firstStation;
    stationSelect.value = firstStation;

    populateLevels(firstStation);

    const firstLevel = Object.keys(STATIONS[firstStation].levels || {})[0] || null;
    currentLevel = firstLevel;
    levelSelect.value = firstLevel;

    currentPageIdx = 0;
    hydrateFromStorageIntoData();

    adminEnabled = false;
    maintenanceEnabled = false;
    setModeUI();

    renderImageAndMarks();
  }

  init();
})();
