// app.js (KOMPLETT ERSETZEN)
(() => {
  const STATIONS = window.STATIONS || {};
  const LS_KEY = "bma_marks_v1";

  // ---- DOM (IDs passen jetzt zu index.html) ----
  const stationSelect = document.getElementById("stationSelect");
  const levelSelect   = document.getElementById("levelSelect");
  const pagePill      = document.getElementById("pagePill");

  const btnAdmin      = document.getElementById("btnAdmin");
  const btnClearAll   = document.getElementById("btnClearAll");
  const btnExportPng  = document.getElementById("btnExportPng");
  const btnExportZip  = document.getElementById("btnExportZip");

  const planImg       = document.getElementById("planImg");
  const markCanvas    = document.getElementById("markCanvas");
  const canvasWrap    = document.getElementById("canvasWrap");

  const btnPrev       = document.getElementById("btnPrev");
  const btnNext       = document.getElementById("btnNext");

  const ctx = markCanvas.getContext("2d");

  // ---- State ----
  let adminMode = false;
  let currentStation = null;
  let currentLevel = null;
  let currentIndex = 0;

  // store: { [src]: [ {x:0..1, y:0..1} ] }
  let store = loadStore();

  function loadStore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function saveStore() {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  }

  function resolveUrl(rel) {
    return new URL(rel, window.location.href).toString();
  }

  function safeName(s){ return String(s||"").replace(/[^\w\-+]+/g,"_"); }

  function getPages(stationName, levelKey) {
    const st = STATIONS[stationName];
    if (!st) return [];
    const arr = st.levels?.[levelKey];
    return Array.isArray(arr) ? arr : [];
  }

  function currentPage() {
    const pages = getPages(currentStation, currentLevel);
    return pages[currentIndex] || null;
  }

  // ---- UI ----
  function buildStationOptions() {
    stationSelect.innerHTML = "";
    const names = Object.keys(STATIONS);

    if (names.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Keine Stationen";
      stationSelect.appendChild(opt);
      return;
    }

    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      stationSelect.appendChild(opt);
    }
  }

  function buildLevelOptions(stationName) {
    levelSelect.innerHTML = "";
    const levels = STATIONS[stationName]?.levels ? Object.keys(STATIONS[stationName].levels) : [];

    if (levels.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Keine Level";
      levelSelect.appendChild(opt);
      return;
    }

    for (const lv of levels) {
      const opt = document.createElement("option");
      opt.value = lv;
      opt.textContent = lv;
      levelSelect.appendChild(opt);
    }
  }

  function setAdminUI() {
    btnAdmin.textContent = adminMode ? "Admin: EIN" : "Admin: AUS";
  }

  function updateNavUI() {
    const pages = getPages(currentStation, currentLevel);
    const total = pages.length || 1;
    const idx = Math.min(currentIndex, total - 1);

    pagePill.textContent = `Seite: ${idx + 1}/${total}`;
    btnPrev.classList.toggle("disabled", idx <= 0);
    btnNext.classList.toggle("disabled", idx >= total - 1);
  }

  // ---- Canvas sizing ----
  function resizeCanvasToImage() {
    const r = planImg.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

    markCanvas.width  = Math.floor(r.width * dpr);
    markCanvas.height = Math.floor(r.height * dpr);

    markCanvas.style.width  = `${r.width}px`;
    markCanvas.style.height = `${r.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMarks();
  }

  function drawBigCheck(x, y) {
    const size = 46;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Outline
    ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.50, y + size * 0.05);
    ctx.lineTo(x - size * 0.15, y + size * 0.38);
    ctx.lineTo(x + size * 0.55, y - size * 0.45);
    ctx.stroke();

    // White stroke
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.50, y + size * 0.05);
    ctx.lineTo(x - size * 0.15, y + size * 0.38);
    ctx.lineTo(x + size * 0.55, y - size * 0.45);
    ctx.stroke();

    ctx.restore();
  }

  function drawMarks() {
    const page = currentPage();
    const w = markCanvas.clientWidth;
    const h = markCanvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    if (!page || !page.src) return;

    const marks = store[page.src] || [];
    for (const m of marks) {
      const x = m.x * w;
      const y = m.y * h;
      drawBigCheck(x, y);
    }
  }

  // ---- Click -> normalized coords ----
  function getNormalizedCoords(ev) {
    const page = currentPage();
    if (!page) return null;

    const rect = markCanvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    const w = rect.width;
    const h = rect.height;

    if (x < 0 || y < 0 || x > w || y > h) return null;

    return { nx: x / w, ny: y / h };
  }

  function findNearestMarkIndex(marks, x, y) {
    const radius = 0.06; // normalized
    let best = -1;
    let bestD = Infinity;

    for (let i = 0; i < marks.length; i++) {
      const dx = marks[i].x - x;
      const dy = marks[i].y - y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= radius ? best : -1;
  }

  function toggleMarkAt(ev) {
    // Admin AUS: KEIN hinzufügen UND KEIN entfernen
    if (!adminMode) return;

    const page = currentPage();
    if (!page) return;

    const p = getNormalizedCoords(ev);
    if (!p) return;

    const marks = store[page.src] || [];
    const i = findNearestMarkIndex(marks, p.nx, p.ny);

    if (i >= 0) marks.splice(i, 1);
    else marks.push({ x: p.nx, y: p.ny });

    store[page.src] = marks;
    saveStore();
    drawMarks();
  }

  // ---- Image load ----
  function loadCurrentImage() {
    const page = currentPage();

    if (!page || !page.src) {
      planImg.removeAttribute("src");
      ctx.clearRect(0, 0, markCanvas.clientWidth, markCanvas.clientHeight);
      return;
    }

    planImg.onload = () => resizeCanvasToImage();
    planImg.onerror = () => {
      // falls Bildpfad falsch ist, wenigstens UI nicht crashen
      resizeCanvasToImage();
    };

    planImg.src = resolveUrl(page.src);
  }

  // ---- Station/Level/Page ----
  function setStation(name) {
    currentStation = name;
    buildLevelOptions(name);

    const firstLevel = levelSelect.value || Object.keys(STATIONS[name]?.levels || {})[0] || null;
    currentLevel = firstLevel;
    if (firstLevel) levelSelect.value = firstLevel;

    currentIndex = 0;
    updateNavUI();
    loadCurrentImage();
  }

  function setLevel(levelKey) {
    currentLevel = levelKey;
    currentIndex = 0;
    updateNavUI();
    loadCurrentImage();
  }

  function setPage(idx) {
    const pages = getPages(currentStation, currentLevel);
    if (!pages.length) return;

    currentIndex = Math.max(0, Math.min(idx, pages.length - 1));
    updateNavUI();
    loadCurrentImage();
  }

  // ---- Clear All ----
  function clearAll() {
    if (!adminMode) {
      alert("Admin ist AUS. Zum Löschen zuerst Admin: EIN aktivieren.");
      return;
    }

    const ok = prompt("ALLES löschen? Passwort eingeben:");
    if (ok !== "1705") {
      alert("Falsches Passwort.");
      return;
    }

    store = {};
    saveStore();
    drawMarks();
  }

  // ---- Export PNG ----
  async function exportPNGCurrent() {
    const page = currentPage();
    if (!page) return alert("Kein Bild.");

    // Bild original laden
    const baseImg = new Image();
    baseImg.crossOrigin = "anonymous";
    baseImg.src = resolveUrl(page.src);
    await baseImg.decode().catch(()=>{});

    const off = document.createElement("canvas");
    off.width = baseImg.naturalWidth || 1200;
    off.height = baseImg.naturalHeight || 800;

    const octx = off.getContext("2d");
    octx.drawImage(baseImg, 0, 0, off.width, off.height);

    const marks = store[page.src] || [];
    for (const m of marks) {
      const x = m.x * off.width;
      const y = m.y * off.height;

      const size = Math.max(40, Math.min(90, off.width * 0.05));
      octx.save();
      octx.lineJoin = "round";
      octx.lineCap = "round";

      octx.strokeStyle = "rgba(0,0,0,.85)";
      octx.lineWidth = size * 0.26;
      octx.beginPath();
      octx.moveTo(x - size * 0.50, y + size * 0.05);
      octx.lineTo(x - size * 0.15, y + size * 0.38);
      octx.lineTo(x + size * 0.55, y - size * 0.45);
      octx.stroke();

      octx.strokeStyle = "rgba(255,255,255,.95)";
      octx.lineWidth = size * 0.15;
      octx.beginPath();
      octx.moveTo(x - size * 0.50, y + size * 0.05);
      octx.lineTo(x - size * 0.15, y + size * 0.38);
      octx.lineTo(x + size * 0.55, y - size * 0.45);
      octx.stroke();

      octx.restore();
    }

    off.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName(currentStation)}_${safeName(currentLevel)}_${currentIndex+1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  // ---- Export ZIP ----
  async function ensureJSZip() {
    if (window.JSZip) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function exportZIPStation() {
    await ensureJSZip();

    const station = STATIONS[currentStation];
    if (!station) return alert("Keine Station.");

    const zip = new window.JSZip();

    for (const [levelKey, pages] of Object.entries(station.levels || {})) {
      const folder = zip.folder(levelKey);

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];

        const baseImg = new Image();
        baseImg.crossOrigin = "anonymous";
        baseImg.src = resolveUrl(p.src);
        await baseImg.decode().catch(()=>{});

        const off = document.createElement("canvas");
        off.width = baseImg.naturalWidth || 1200;
        off.height = baseImg.naturalHeight || 800;

        const octx = off.getContext("2d");
        octx.drawImage(baseImg, 0, 0, off.width, off.height);

        const marks = store[p.src] || [];
        for (const m of marks) {
          const x = m.x * off.width;
          const y = m.y * off.height;
          const size = Math.max(40, Math.min(90, off.width * 0.05));

          octx.save();
          octx.lineJoin = "round";
          octx.lineCap = "round";

          octx.strokeStyle = "rgba(0,0,0,.85)";
          octx.lineWidth = size * 0.26;
          octx.beginPath();
          octx.moveTo(x - size * 0.50, y + size * 0.05);
          octx.lineTo(x - size * 0.15, y + size * 0.38);
          octx.lineTo(x + size * 0.55, y - size * 0.45);
          octx.stroke();

          octx.strokeStyle = "rgba(255,255,255,.95)";
          octx.lineWidth = size * 0.15;
          octx.beginPath();
          octx.moveTo(x - size * 0.50, y + size * 0.05);
          octx.lineTo(x - size * 0.15, y + size * 0.38);
          octx.lineTo(x + size * 0.55, y - size * 0.45);
          octx.stroke();

          octx.restore();
        }

        const pngBlob = await new Promise((resolve) => off.toBlob(resolve, "image/png"));
        const arrayBuf = await pngBlob.arrayBuffer();
        folder.file(`${safeName(currentStation)}_${safeName(levelKey)}_${i+1}.png`, arrayBuf);
      }
    }

    const out = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = `${safeName(currentStation)}_EXPORT.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---- Events ----
  stationSelect.addEventListener("change", () => setStation(stationSelect.value));
  levelSelect.addEventListener("change", () => setLevel(levelSelect.value));

  btnAdmin.addEventListener("click", () => {
    adminMode = !adminMode;
    setAdminUI();
  });

  btnClearAll.addEventListener("click", clearAll);

  btnPrev.addEventListener("click", () => setPage(currentIndex - 1));
  btnNext.addEventListener("click", () => setPage(currentIndex + 1));

  btnExportPng.addEventListener("click", exportPNGCurrent);
  btnExportZip.addEventListener("click", exportZIPStation);

  // Tap/click auf Overlay
  markCanvas.addEventListener("click", toggleMarkAt);

  // Resize
  window.addEventListener("resize", () => resizeCanvasToImage());

  // ---- Init ----
  function init() {
    buildStationOptions();

    const firstStation = Object.keys(STATIONS)[0] || null;
    if (!firstStation) {
      setAdminUI();
      updateNavUI();
      return;
    }

    stationSelect.value = firstStation;
    setStation(firstStation);

    setAdminUI();
    updateNavUI();
    loadCurrentImage();
  }

  init();
})();
