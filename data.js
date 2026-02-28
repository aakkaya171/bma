// /mnt/data/app.js
(() => {
  const STATIONS = window.STATIONS || {};

  const stationSelect = document.getElementById("stationSelect");
  const levelSelect = document.getElementById("levelSelect");
  const pageIndicator = document.getElementById("pageIndicator");

  const adminBtn = document.getElementById("adminBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const pngBtn = document.getElementById("pngBtn");
  const zipBtn = document.getElementById("zipBtn");

  const planWrap = document.getElementById("planWrap");
  const planImg = document.getElementById("planImg");
  const marksLayer = document.getElementById("marksLayer");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  let adminEnabled = false;
  let currentStation = null;
  let currentLevel = null;
  let currentPageIdx = 0;
  let ignoreNextClick = false;

  // ✅ FIX: funktioniert, egal ob index.html im Root ODER in /images liegt
  const resolveAssetUrl = (src) => {
    let s = String(src || "");

    // wenn du die App im Ordner /images laufen lässt UND data.js "images/..." nutzt -> doppelt
    // /images/index.html + "images/foo.jpg" => /images/images/foo.jpg (falsch)
    if (window.location.pathname.includes("/images/") && s.startsWith("images/")) {
      s = s.replace(/^images\//, "");
    }

    // + im Dateinamen sicher URL-kodieren
    s = encodeURI(s);

    return new URL(s, window.location.href).toString();
  };

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

  const saveMarks = (pages) => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(pages));
    } catch {}
  };

  function setAdminUI() {
    adminBtn.textContent = adminEnabled ? "Admin: EIN" : "Admin: AUS";
  }

  function getPages() {
    if (!currentStation || !currentLevel) return [];
    return STATIONS[currentStation]?.levels?.[currentLevel] || [];
  }

  function setNavDisabled() {
    const pages = getPages();
    const max = Math.max(0, pages.length - 1);

    prevBtn.classList.toggle("disabled", currentPageIdx <= 0);
    nextBtn.classList.toggle("disabled", currentPageIdx >= max);

    pageIndicator.textContent = `Seite: ${pages.length ? currentPageIdx + 1 : 0}/${pages.length || 0}`;
  }

  function populateStations() {
    stationSelect.innerHTML = "";
    const names = Object.keys(STATIONS);
    for (const name of names) {
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

  function hydrateFromStorageIntoData() {
    const pages = getPages();
    const saved = loadSavedMarks();
    if (Array.isArray(saved) && saved.length === pages.length) {
      for (let i = 0; i < pages.length; i++) {
        pages[i].marks = Array.isArray(saved[i].marks) ? saved[i].marks : [];
      }
    }
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

  function renderImageAndMarks() {
    const pages = getPages();

    if (!pages.length) {
      planImg.removeAttribute("src");
      marksLayer.innerHTML = "";
      setNavDisabled();
      return;
    }

    const page = pages[currentPageIdx] || pages[0];

    planImg.onerror = () => {
      console.error("Bild konnte nicht geladen werden:", page.src, "=>", resolveAssetUrl(page.src));
    };

    // ✅ FIX: hier resolveAssetUrl verwenden
    planImg.src = resolveAssetUrl(page.src);

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

  function getRelativePointerPos(evt) {
    const rect = planImg.getBoundingClientRect();
    const point =
      (evt.changedTouches && evt.changedTouches[0]) ||
      (evt.touches && evt.touches[0]) ||
      evt;

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
    if (!page.marks) page.marks = [];

    const hitRadius = 0.045;
    const idx = page.marks.findIndex((m) => Math.hypot(m.x - x, m.y - y) < hitRadius);

    if (idx >= 0) page.marks.splice(idx, 1);
    else page.marks.push({ x, y });

    saveMarks(pages);
    renderImageAndMarks();
  }

  stationSelect.addEventListener("change", () => {
    currentStation = stationSelect.value;
    populateLevels(currentStation);

    // ✅ FIX: falls Level leer war
    currentLevel =
      levelSelect.value ||
      Object.keys(STATIONS[currentStation]?.levels || {})[0] ||
      null;

    if (currentLevel) levelSelect.value = currentLevel;

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
    adminEnabled = !adminEnabled;
    setAdminUI();
  });

  planWrap.addEventListener("click", (evt) => {
    if (!adminEnabled) return;
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
    (evt) => {
      if (!adminEnabled) return;
      const pos = getRelativePointerPos(evt);
      if (!pos) return;

      ignoreNextClick = true;
      setTimeout(() => (ignoreNextClick = false), 300);

      toggleMarkAt(pos.x, pos.y);
    },
    { passive: true }
  );

  function init() {
    populateStations();

    const firstStation = Object.keys(STATIONS)[0] || null;
    if (!firstStation) return;

    currentStation = firstStation;
    stationSelect.value = firstStation;

    populateLevels(firstStation);

    const firstLevel = Object.keys(STATIONS[firstStation].levels || {})[0] || null;
    currentLevel = firstLevel;
    if (firstLevel) levelSelect.value = firstLevel;

    currentPageIdx = 0;
    hydrateFromStorageIntoData();

    adminEnabled = false;
    setAdminUI();

    renderImageAndMarks();
  }

  init();
})();
