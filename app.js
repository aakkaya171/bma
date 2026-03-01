// app.js
(() => {
  const STATIONS_STORAGE_KEY = "bma_stations_v3";

  const stationSelect = document.getElementById("stationSelect");
  const levelSelect = document.getElementById("levelSelect");
  const pageIndicator = document.getElementById("pageIndicator");

  const adminBtn = document.getElementById("adminBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const pngBtn = document.getElementById("pngBtn");
  const zipBtn = document.getElementById("zipBtn");
  const maintBtn = document.getElementById("maintBtn");

  const planWrap = document.getElementById("planWrap");
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

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadStations() {
    try {
      const raw = localStorage.getItem(STATIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {}

    const fallback = (window.STATIONS && typeof window.STATIONS === "object") ? clone(window.STATIONS) : {};
    try {
      localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify(fallback));
    } catch {}
    return fallback;
  }

  function saveStations() {
    try {
      localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify(STATIONS));
    } catch {
      alert("Speichern fehlgeschlagen. Eventuell ist der Speicher voll.");
    }
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
      saveStations();
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

  function renderImageAndMarks() {
    const pages = getPages();
    if (!pages.length) {
      planImg.removeAttribute("src");
      marksLayer.innerHTML = "";
      pageIndicator.textContent = "0/0";
      return;
    }

    if (currentPageIdx > pages.length - 1) currentPageIdx = pages.length - 1;
    const page = pages[currentPageIdx];
    planImg.src = page.src;

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
        <path d="M18 49 L38 66 L72 26" fill="none" stroke="black" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
        <path d="M18 49 L38 66 L72 26" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function getRelativePointerPos(evt) {
    const rect = planImg.getBoundingClientRect();
    const point = (evt.changedTouches && evt.changedTouches[0]) || (evt.touches && evt.touches[0]) || evt;

    if (!point || rect.width <= 0 || rect.height <= 0) return null;

    const x = (point.clientX - rect.left) / rect.width;
    const y = (point.clientY - rect.top) / rect.height;

    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function toggleMarkAt(x, y) {
    const pages = getPages();
    if (!pages.length) return;

    const page = pages[currentPageIdx];
    if (!Array.isArray(page.marks)) page.marks = [];

    const hitRadius = 0.045;
    const idx = page.marks.findIndex(m => {
      const dx = m.x - x;
      const dy = m.y - y;
      return Math.sqrt(dx * dx + dy * dy) < hitRadius;
    });

    if (idx >= 0) page.marks.splice(idx, 1);
    else page.marks.push({ x, y });

    saveMarks(getPages());
    renderImageAndMarks();
  }

  async function exportPNGCurrent() {
    const pages = getPages();
    if (!pages.length) return;

    const page = pages[currentPageIdx];

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = page.src;

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
      const size = Math.max(60, Math.round(canvas.width * 0.05));
      ctx.save();
      ctx.translate(px, py);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.lineWidth = 0.16 * size;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "white";
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
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = page.src;

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
      const size = Math.max(60, Math.round(canvas.width * 0.05));

      ctx.save();
      ctx.translate(px, py);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.lineWidth = 0.16 * size;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.3 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "white";
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

    saveStations();
    renderImageAndMarks();
  }

  async function fileToDataURL(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });
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
    saveStations();

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
    saveStations();

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
      alert("Bild konnte nicht geladen werden.");
      return;
    }

    const pages = STATIONS[currentStation].levels[currentLevel] || (STATIONS[currentStation].levels[currentLevel] = []);
    pages.push({ src: dataUrl, marks: [] });
    saveStations();

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
    saveStations();
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

    saveStations();
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

    saveStations();
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

  planWrap.addEventListener("click", evt => {
    if (!maintenanceEnabled) return;
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }

    const pos = getRelativePointerPos(evt);
    if (!pos) return;
    toggleMarkAt(pos.x, pos.y);
  });

  planWrap.addEventListener(
    "touchend",
    evt => {
      if (!maintenanceEnabled) return;

      const pos = getRelativePointerPos(evt);
      if (!pos) return;

      ignoreNextClick = true;
      setTimeout(() => {
        ignoreNextClick = false;
      }, 300);

      toggleMarkAt(pos.x, pos.y);
    },
    { passive: true }
  );

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
