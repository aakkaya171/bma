// app.js
(() => {
  const STATIONS = window.STATIONS || {};
  const LS_KEY = "bma_marks_v1";

  const stationSelect = document.getElementById("stationSelect");
  const levelSelect = document.getElementById("levelSelect");
  const pageBubble = document.getElementById("pageBubble");
  const adminBtn = document.getElementById("adminBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const pngBtn = document.getElementById("pngBtn");
  const zipBtn = document.getElementById("zipBtn");

  const canvas = document.getElementById("mapCanvas");
  const wrap = document.getElementById("canvasWrap");
  const navLeft = document.getElementById("navLeft");
  const navRight = document.getElementById("navRight");
  const ctx = canvas.getContext("2d");

  // ---------- State ----------
  let adminMode = false;
  let currentStation = null;
  let currentLevel = null;
  let currentIndex = 0;

  // Persisted store: marks are per image src
  // store = { [src]: [ {x:0..1, y:0..1} ] }
  let store = loadStore();

  // Image cache
  const img = new Image();
  img.decoding = "async";

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

  function resolveUrl(rel) {
    // robust, egal ob GitHub Pages root oder subfolder
    return new URL(rel, window.location.href).toString();
  }

  // ---------- UI Build ----------
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
    adminBtn.textContent = adminMode ? "Admin: EIN" : "Admin: AUS";
    adminBtn.classList.toggle("ok", adminMode);
    adminBtn.classList.toggle("secondary", !adminMode);
  }

  function updateNavUI() {
    const pages = getPages(currentStation, currentLevel);
    const total = pages.length || 1;
    const idx = Math.min(currentIndex, total - 1);
    pageBubble.textContent = `${idx + 1}/${total}`;

    navLeft.classList.toggle("disabled", idx <= 0);
    navRight.classList.toggle("disabled", idx >= total - 1);
  }

  // ---------- Canvas ----------
  function fitCanvas() {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const page = currentPage();
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    if (!page || !page.src) {
      // Empty state
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.font = "18px system-ui";
      ctx.fillText("Kein Bild gefunden.", 16, 32);
      ctx.restore();
      return;
    }

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    // Draw image cover (contain)
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.drawImage(img, dx, dy, dw, dh);

    // Marks
    const marks = store[page.src] || [];
    for (const m of marks) {
      const px = dx + m.x * dw;
      const py = dy + m.y * dh;
      drawBigCheck(px, py);
    }
  }

  function drawBigCheck(x, y) {
    // große, gut sichtbare ✓ wie bei dir am Foto: weiß mit schwarzer Outline
    const size = 46; // in px (screen)
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

  function loadCurrentImage() {
    const page = currentPage();
    if (!page || !page.src) {
      draw();
      return;
    }
    img.onload = () => draw();
    img.onerror = () => draw();
    img.src = resolveUrl(page.src);
  }

  function setStation(name) {
    currentStation = name;
    buildLevelOptions(name);
    currentLevel = levelSelect.value || Object.keys(STATIONS[name].levels)[0];
    levelSelect.value = currentLevel;
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

  // Convert click position to normalized image coords (0..1 inside drawn image)
  function getImageCoordsFromEvent(ev) {
    const page = currentPage();
    if (!page) return null;

    const rect = canvas.getBoundingClientRect();
    const cx = (ev.clientX - rect.left);
    const cy = (ev.clientY - rect.top);

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    const inside = (cx >= dx && cx <= dx + dw && cy >= dy && cy <= dy + dh);
    if (!inside) return null;

    return {
      x: (cx - dx) / dw,
      y: (cy - dy) / dh,
      dx, dy, dw, dh
    };
  }

  function findNearestMarkIndex(marks, x, y) {
    // remove if user taps near existing check (radius)
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
    if (!adminMode) return; // Admin AUS -> gar nichts

    const page = currentPage();
    if (!page) return;

    const pos = getImageCoordsFromEvent(ev);
    if (!pos) return;

    const marks = store[page.src] || [];
    const i = findNearestMarkIndex(marks, pos.x, pos.y);

    if (i >= 0) {
      marks.splice(i, 1);
    } else {
      marks.push({ x: pos.x, y: pos.y });
    }

    store[page.src] = marks;
    saveStore();
    draw();
  }

  // ---------- Export ----------
  async function exportPNGCurrent() {
    const page = currentPage();
    if (!page) return alert("Kein Bild.");

    // Render at original size for sharp export
    const off = document.createElement("canvas");
    off.width = img.naturalWidth || 1200;
    off.height = img.naturalHeight || 800;
    const octx = off.getContext("2d");

    // draw image
    const exportImg = new Image();
    exportImg.crossOrigin = "anonymous";
    exportImg.src = resolveUrl(page.src);
    await exportImg.decode().catch(()=>{});

    octx.drawImage(exportImg, 0, 0, off.width, off.height);

    // draw marks in original pixel coords
    const marks = store[page.src] || [];
    for (const m of marks) {
      const x = m.x * off.width;
      const y = m.y * off.height;

      // draw same check, scaled a bit to original image
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

  function safeName(s){ return String(s||"").replace(/[^\w\-+]+/g,"_"); }

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

    const zip = new window.JSZip();
    const station = STATIONS[currentStation];
    if (!station) return alert("Keine Station.");

    for (const [levelKey, pages] of Object.entries(station.levels || {})) {
      const folder = zip.folder(levelKey);
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        // load image blob
        const url = resolveUrl(p.src);
        const res = await fetch(url);
        const blob = await res.blob();

        // create image with marks as PNG
        const baseImg = await blobToImage(blob);

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

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = URL.createObjectURL(blob);
    });
  }

  // ---------- Clear ----------
  function clearAll() {
    const ok = confirm("Wirklich ALLES löschen? (Alle Häkchen von allen Bildern)");
    if (!ok) return;
    store = {};
    saveStore();
    draw();
  }

  // ---------- Events ----------
  stationSelect.addEventListener("change", () => setStation(stationSelect.value));
  levelSelect.addEventListener("change", () => setLevel(levelSelect.value));

  adminBtn.addEventListener("click", () => {
    adminMode = !adminMode;
    setAdminUI();
  });

  clearAllBtn.addEventListener("click", clearAll);

  navLeft.addEventListener("click", () => setPage(currentIndex - 1));
  navRight.addEventListener("click", () => setPage(currentIndex + 1));

  pngBtn.addEventListener("click", exportPNGCurrent);
  zipBtn.addEventListener("click", exportZIPStation);

  // Click / tap on canvas to toggle mark
  canvas.addEventListener("click", (ev) => toggleMarkAt(ev));

  // Resize
  window.addEventListener("resize", () => {
    fitCanvas();
    draw();
  });

  // ---------- Init ----------
  function init() {
    buildStationOptions();

    const firstStation = Object.keys(STATIONS)[0] || null;
    currentStation = firstStation;
    if (firstStation) stationSelect.value = firstStation;

    buildLevelOptions(firstStation);
    const firstLevel = Object.keys(STATIONS[firstStation]?.levels || {})[0] || null;
    currentLevel = firstLevel;
    if (firstLevel) levelSelect.value = firstLevel;

    currentIndex = 0;
    setAdminUI();

    fitCanvas();
    updateNavUI();
    loadCurrentImage();
  }

  init();
})();
