// app.js
(() => {
  const els = {
    stationSelect: document.getElementById("stationSelect"),
    levelSelect: document.getElementById("levelSelect"),
    pageInfo: document.getElementById("pageInfo"),
    adminBtn: document.getElementById("adminBtn"),
    deleteAllBtn: document.getElementById("deleteAllBtn"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    exportZipBtn: document.getElementById("exportZipBtn"),
    scroller: document.getElementById("scroller"),
    plan: document.getElementById("plan"),
    planImg: document.getElementById("planImg"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
  };

  let state = {
    station: Object.keys(STATIONS)[0],
    level: null,
    pageIndex: 0,
    admin: false,
  };

  // ---------- Helpers ----------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function getPages() {
    const stationObj = STATIONS[state.station];
    if (!stationObj) return [];
    const lvl = stationObj.levels[state.level];
    return Array.isArray(lvl) ? lvl : [];
  }

  function saveLocal() {
    // speichert Marker lokal pro Station/Level/Seite
    // (damit nach Reload nicht weg)
    try {
      const key = "bma_marks_v1";
      const payload = JSON.stringify(STATIONS);
      localStorage.setItem(key, payload);
    } catch {}
  }

  function loadLocal() {
    try {
      const key = "bma_marks_v1";
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // nur wenn Struktur passt
      if (parsed && typeof parsed === "object") {
        // überschreiben
        for (const st of Object.keys(parsed)) {
          STATIONS[st] = parsed[st];
        }
      }
    } catch {}
  }

  function setNavDisabled() {
    const pages = getPages();
    const max = pages.length - 1;

    const prevDisabled = state.pageIndex <= 0;
    const nextDisabled = state.pageIndex >= max;

    els.prevBtn.classList.toggle("disabled", prevDisabled);
    els.nextBtn.classList.toggle("disabled", nextDisabled);
    els.prevBtn.disabled = prevDisabled;
    els.nextBtn.disabled = nextDisabled;
  }

  function updatePageInfo() {
    const pages = getPages();
    els.pageInfo.textContent = `Seite: ${pages.length ? (state.pageIndex + 1) : 0}/${pages.length}`;
  }

  function clearMarksDom() {
    els.plan.querySelectorAll(".mark").forEach(n => n.remove());
  }

  function renderMarks() {
    clearMarksDom();
    const pages = getPages();
    const page = pages[state.pageIndex];
    if (!page) return;

    for (const m of page.marks) {
      const div = document.createElement("div");
      div.className = "mark";
      div.textContent = "✓";
      div.style.left = `${m.x}%`;
      div.style.top = `${m.y}%`;
      els.plan.appendChild(div);
    }
  }

  function loadImage() {
    const pages = getPages();
    const page = pages[state.pageIndex];
    if (!page) {
      els.planImg.removeAttribute("src");
      clearMarksDom();
      updatePageInfo();
      setNavDisabled();
      return;
    }

    els.planImg.onload = () => {
      renderMarks();
      updatePageInfo();
      setNavDisabled();
    };

    els.planImg.onerror = () => {
      // Wenn Bildpfad falsch ist, siehst du es sofort
      clearMarksDom();
      els.pageInfo.textContent = "Bild konnte nicht geladen werden (Pfad prüfen!)";
      setNavDisabled();
    };

    els.planImg.src = page.src;
  }

  function setAdmin(on) {
    state.admin = on;
    els.adminBtn.textContent = `Admin: ${on ? "EIN" : "AUS"}`;
  }

  // Klick im Bild: nur wenn Admin EIN → Marker togglen
  function onPlanClick(ev) {
    if (!state.admin) return;

    const pages = getPages();
    const page = pages[state.pageIndex];
    if (!page) return;

    const rect = els.planImg.getBoundingClientRect();
    // Klick relativ zum Bild
    const xPx = ev.clientX - rect.left;
    const yPx = ev.clientY - rect.top;

    if (xPx < 0 || yPx < 0 || xPx > rect.width || yPx > rect.height) return;

    const x = (xPx / rect.width) * 100;
    const y = (yPx / rect.height) * 100;

    // Toggle: wenn nahe an bestehendem Marker → entfernen, sonst hinzufügen
    const threshold = 2.2; // Prozent
    const idx = page.marks.findIndex(m => Math.hypot(m.x - x, m.y - y) < threshold);

    if (idx >= 0) {
      page.marks.splice(idx, 1);
    } else {
      page.marks.push({ x, y });
    }

    saveLocal();
    renderMarks();
  }

  // ---------- Exporte ----------
  async function exportCurrentPng() {
    const pages = getPages();
    const page = pages[state.pageIndex];
    if (!page) return;

    // Canvas render
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = page.src;

    await img.decode().catch(() => null);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Draw marks (✓) groß, wie am Plan (dunkel + weißer Rand)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.round(canvas.width * 0.06); // skaliert automatisch
    ctx.font = `900 ${fontSize}px Arial`;

    for (const m of page.marks) {
      const px = (m.x / 100) * canvas.width;
      const py = (m.y / 100) * canvas.height;

      // weißer Rand (Stroke)
      ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.12));
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText("✓", px, py);

      // dunkle Füllung
      ctx.fillStyle = "#111111";
      ctx.fillText("✓", px, py);
    }

    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.station}_${state.level}_Seite${state.pageIndex + 1}.png`.replaceAll(" ", "_");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportStationZip() {
    if (typeof JSZip === "undefined") {
      alert("JSZip konnte nicht geladen werden. Bitte Internet/Pages prüfen.");
      return;
    }

    const zip = new JSZip();
    const stationObj = STATIONS[state.station];
    if (!stationObj) return;

    for (const [lvl, pages] of Object.entries(stationObj.levels)) {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const fileName = `${state.station}/${lvl}/Seite_${i + 1}.png`.replaceAll(" ", "_");

        // render jede Seite als PNG in zip
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = page.src;
        await img.decode().catch(() => null);

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = Math.round(canvas.width * 0.06);
        ctx.font = `900 ${fontSize}px Arial`;

        for (const m of page.marks) {
          const px = (m.x / 100) * canvas.width;
          const py = (m.y / 100) * canvas.height;

          ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.12));
          ctx.strokeStyle = "#ffffff";
          ctx.strokeText("✓", px, py);

          ctx.fillStyle = "#111111";
          ctx.fillText("✓", px, py);
        }

        const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
        const arrBuf = await blob.arrayBuffer();
        zip.file(fileName, arrBuf);
      }
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${state.station}_EXPORT.zip`.replaceAll(" ", "_");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Delete ----------
  function deleteAllWithPassword() {
    const pw = prompt("Passwort zum Löschen eingeben:");
    if (pw !== "1705") {
      alert("Falsches Passwort.");
      return;
    }

    const stationObj = STATIONS[state.station];
    if (!stationObj) return;

    for (const lvl of Object.keys(stationObj.levels)) {
      for (const page of stationObj.levels[lvl]) {
        page.marks = [];
      }
    }

    saveLocal();
    renderMarks();
    alert("Alles gelöscht.");
  }

  // ---------- UI build ----------
  function fillStations() {
    els.stationSelect.innerHTML = "";
    for (const st of Object.keys(STATIONS)) {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      els.stationSelect.appendChild(opt);
    }
    els.stationSelect.value = state.station;
  }

  function fillLevels() {
    const stationObj = STATIONS[state.station];
    els.levelSelect.innerHTML = "";
    const levels = stationObj ? Object.keys(stationObj.levels) : [];
    // wenn noch kein Level gesetzt, nimm das erste
    if (!state.level || !levels.includes(state.level)) state.level = levels[0] || null;

    for (const lvl of levels) {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = lvl;
      els.levelSelect.appendChild(opt);
    }
    if (state.level) els.levelSelect.value = state.level;
  }

  function goToPage(idx) {
    const pages = getPages();
    if (!pages.length) return;
    state.pageIndex = clamp(idx, 0, pages.length - 1);
    loadImage();
  }

  // ---------- Events ----------
  els.stationSelect.addEventListener("change", () => {
    state.station = els.stationSelect.value;
    fillLevels();
    state.pageIndex = 0;
    loadImage();
  });

  els.levelSelect.addEventListener("change", () => {
    state.level = els.levelSelect.value;
    state.pageIndex = 0;
    loadImage();
  });

  els.prevBtn.addEventListener("click", () => {
    if (els.prevBtn.disabled) return;
    goToPage(state.pageIndex - 1);
  });

  els.nextBtn.addEventListener("click", () => {
    if (els.nextBtn.disabled) return;
    goToPage(state.pageIndex + 1);
  });

  els.adminBtn.addEventListener("click", () => setAdmin(!state.admin));

  els.deleteAllBtn.addEventListener("click", deleteAllWithPassword);
  els.exportPngBtn.addEventListener("click", exportCurrentPng);
  els.exportZipBtn.addEventListener("click", exportStationZip);

  // Klick ins Bild → Marker
  els.planImg.addEventListener("click", onPlanClick);

  // ---------- Boot ----------
  loadLocal();
  fillStations();
  fillLevels();
  setAdmin(false);
  state.pageIndex = 0;
  loadImage();
})();
