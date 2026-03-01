/* /app.js */
(() => {
  const LS_KEY = "bma_v3_stations";

  /** @typedef {{x:number,y:number}} Mark */
  /** @typedef {{id:string,name:string,imageDataUrl:string|null,marks:Mark[]}} Level */
  /** @typedef {{id:string,name:string,levels:Record<string,Level>}} Station */
  /** @typedef {{stations:Station[],selected:{stationId:string|null,levelId:string|null},admin:boolean}} AppState */

  const $ = (id) => document.getElementById(id);

  const makeId = () => (crypto?.randomUUID ? crypto.randomUUID() : `id_${Math.random().toString(16).slice(2)}`);

  const loadState = () => {
    /** @type {AppState} */
    const fallback = { stations: [], selected: { stationId: null, levelId: null }, admin: false };
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.stations)) return fallback;
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  };

  const saveState = (state) => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  };

  const ensureSeed = (state) => {
    if (state.stations.length) return state;
    const stationId = makeId();
    const lvlId = makeId();
    state.stations = [{
      id: stationId,
      name: "Vorgartenstraße U1",
      levels: {
        [lvlId]: { id: lvlId, name: "N0", imageDataUrl: null, marks: [] }
      }
    }];
    state.selected.stationId = stationId;
    state.selected.levelId = lvlId;
    return state;
  };

  const findStation = (state, stationId) => state.stations.find((s) => s.id === stationId) || null;

  const findLevel = (station, levelId) => (station?.levels?.[levelId] ?? null);

  const current = (state) => {
    const st = state.selected.stationId ? findStation(state, state.selected.stationId) : null;
    const lv = (st && state.selected.levelId) ? findLevel(st, state.selected.levelId) : null;
    return { st, lv };
  };

  const checkSvgDataUrl = (() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90">
        <path d="M18 49 L38 66 L72 26" fill="none" stroke="black" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
        <path d="M18 49 L38 66 L72 26" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  })();

  function renderApp() {
    const root = document.getElementById("app");
    root.className = "app";
    root.innerHTML = `
      <div class="panel">
        <div class="controls">
          <div class="klabel">Station:</div>
          <div class="select-wrap">
            <select id="stationSelect" class="select"></select>
          </div>

          <div class="klabel">Level:</div>
          <div class="select-wrap" id="levelWrap">
            <select id="levelSelect" class="select"></select>
          </div>
        </div>

        <div class="row">
          <div id="pageIndicator" class="chip">Seite: 1/1</div>
        </div>

        <div class="row">
          <button id="adminBtn" class="btn half">Admin: AUS</button>
          <button id="clearAllBtn" class="btn half">ALLES löschen</button>
        </div>

        <div class="row">
          <button id="pngBtn" class="btn full">PNG Export (dieses Bild)</button>
        </div>

        <div class="row">
          <button id="zipBtn" class="btn full">ZIP Export (ganze Station)</button>
        </div>

        <div id="adminSheet" class="sheet" style="display:none;">
          <h3>Einstellungen (Admin)</h3>

          <div class="fieldRow">
            <input id="newStationName" class="input" placeholder="Neue Station (Name)" />
            <button id="addStationBtn" class="btn small">+ Station</button>
          </div>

          <div class="fieldRow" style="margin-top:10px;">
            <input id="newLevelName" class="input" placeholder="Neues Niveau/Level (z.B. N+1)" />
            <button id="addLevelBtn" class="btn small">+ Level</button>
          </div>

          <div class="fieldRow" style="margin-top:10px;">
            <label class="btn small fileBtn">Bild hochladen (aktuelles Level)
              <input id="levelImgInput" type="file" accept="image/*" />
            </label>
            <button id="deleteLevelBtn" class="btn small">Level löschen</button>
            <button id="deleteStationBtn" class="btn small">Station löschen</button>
          </div>

          <div class="fieldRow" style="margin-top:10px;">
            <button id="exportJsonBtn" class="btn small">Export JSON</button>
            <label class="btn small fileBtn">Import JSON
              <input id="importJsonInput" type="file" accept="application/json" />
            </label>
          </div>
        </div>
      </div>

      <div class="viewer">
        <div id="planWrap" class="plan-wrap">
          <img id="planImg" alt="Plan" />
          <div id="marksLayer"></div>
        </div>
      </div>
    `;
  }

  /** @param {HTMLSelectElement} sel */
  function fillSelect(sel, items, selectedId) {
    sel.innerHTML = "";
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = it.name;
      sel.appendChild(opt);
    }
    if (selectedId) sel.value = selectedId;
  }

  function setPageIndicator() {
    $("pageIndicator").textContent = "Seite: 1/1";
  }

  function setAdminUI(state) {
    $("adminBtn").textContent = state.admin ? "Admin: EIN" : "Admin: AUS";
    $("adminSheet").style.display = state.admin ? "block" : "none";
  }

  function renderImageAndMarks(state) {
    const { lv } = current(state);
    const img = $("planImg");
    const layer = $("marksLayer");

    layer.innerHTML = "";

    if (!lv || !lv.imageDataUrl) {
      img.removeAttribute("src");
      return;
    }

    img.src = lv.imageDataUrl;

    for (const m of lv.marks || []) {
      const el = document.createElement("img");
      el.className = "mark";
      el.src = checkSvgDataUrl;
      el.style.left = `${m.x * 100}%`;
      el.style.top = `${m.y * 100}%`;
      layer.appendChild(el);
    }
  }

  function getRelativePointerPos(imgEl, evt) {
    const rect = imgEl.getBoundingClientRect();
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

  function toggleMark(state, x, y) {
    const { st, lv } = current(state);
    if (!st || !lv) return state;

    const hit = 0.045;
    const idx = lv.marks.findIndex((m) => Math.hypot(m.x - x, m.y - y) < hit);
    if (idx >= 0) lv.marks.splice(idx, 1);
    else lv.marks.push({ x, y });

    return state;
  }

  async function fileToDataUrl(file) {
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("FileReader failed"));
      r.readAsDataURL(file);
    });
  }

  async function renderLevelToPngBlob(level) {
    if (!level.imageDataUrl) throw new Error("Kein Bild vorhanden");

    const baseImg = new Image();
    baseImg.crossOrigin = "anonymous";
    baseImg.src = level.imageDataUrl;

    await new Promise((res, rej) => {
      baseImg.onload = () => res();
      baseImg.onerror = () => rej(new Error("Bild konnte nicht geladen werden"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(baseImg, 0, 0);

    for (const m of level.marks || []) {
      const px = m.x * canvas.width;
      const py = m.y * canvas.height;
      const size = Math.max(60, Math.round(canvas.width * 0.05));

      ctx.save();
      ctx.translate(px, py);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(-0.30 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "rgba(0,0,0,0.95)";
      ctx.lineWidth = 0.16 * size;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.30 * size, 0.05 * size);
      ctx.lineTo(-0.05 * size, 0.28 * size);
      ctx.lineTo(0.38 * size, -0.25 * size);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 0.10 * size;
      ctx.stroke();

      ctx.restore();
    }

    return await new Promise((r) => canvas.toBlob(r, "image/png"));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeName(s) {
    return String(s || "").trim().replace(/\s+/g, "_").replace(/[^\w\-+]+/g, "");
  }

  function wire(state) {
    const stationSelect = $("stationSelect");
    const levelSelect = $("levelSelect");

    const syncSelectors = () => {
      const stations = state.stations;
      fillSelect(stationSelect, stations.map((s) => ({ id: s.id, name: s.name })), state.selected.stationId);

      const st = findStation(state, state.selected.stationId);
      const levels = st ? Object.values(st.levels) : [];
      fillSelect(levelSelect, levels.map((l) => ({ id: l.id, name: l.name })), state.selected.levelId);

      setPageIndicator();
      setAdminUI(state);
      renderImageAndMarks(state);
    };

    const persistAndRerender = () => {
      saveState(state);
      syncSelectors();
    };

    stationSelect.addEventListener("change", () => {
      state.selected.stationId = stationSelect.value;
      const st = findStation(state, state.selected.stationId);
      state.selected.levelId = st ? Object.keys(st.levels)[0] || null : null;
      persistAndRerender();
    });

    levelSelect.addEventListener("change", () => {
      state.selected.levelId = levelSelect.value;
      persistAndRerender();
    });

    $("adminBtn").addEventListener("click", () => {
      state.admin = !state.admin;
      persistAndRerender();
    });

    $("clearAllBtn").addEventListener("click", () => {
      const pw = prompt("Passwort für ALLES löschen:");
      if (pw !== "1705") {
        alert("Falsches Passwort.");
        return;
      }
      state = { stations: [], selected: { stationId: null, levelId: null }, admin: false };
      state = ensureSeed(state);
      saveState(state);
      location.reload();
    });

    $("planWrap").addEventListener("click", (evt) => {
      if (!state.admin) return;
      const { lv } = current(state);
      if (!lv) return;

      const pos = getRelativePointerPos($("planImg"), evt);
      if (!pos) return;

      state = toggleMark(state, pos.x, pos.y);
      persistAndRerender();
    });

    // Admin sheet actions
    $("addStationBtn").addEventListener("click", () => {
      if (!state.admin) return;
      const name = $("newStationName").value.trim();
      if (!name) return;

      const id = makeId();
      const lvlId = makeId();
      state.stations.push({
        id,
        name,
        levels: { [lvlId]: { id: lvlId, name: "N0", imageDataUrl: null, marks: [] } }
      });
      state.selected.stationId = id;
      state.selected.levelId = lvlId;
      $("newStationName").value = "";
      persistAndRerender();
    });

    $("addLevelBtn").addEventListener("click", () => {
      if (!state.admin) return;
      const st = findStation(state, state.selected.stationId);
      if (!st) return;

      const name = $("newLevelName").value.trim();
      if (!name) return;

      const id = makeId();
      st.levels[id] = { id, name, imageDataUrl: null, marks: [] };
      state.selected.levelId = id;
      $("newLevelName").value = "";
      persistAndRerender();
    });

    $("levelImgInput").addEventListener("change", async (e) => {
      if (!state.admin) return;
      const file = e.target.files?.[0];
      if (!file) return;

      const { lv } = current(state);
      if (!lv) return;

      lv.imageDataUrl = await fileToDataUrl(file);
      persistAndRerender();
      e.target.value = "";
    });

    $("deleteLevelBtn").addEventListener("click", () => {
      if (!state.admin) return;
      const st = findStation(state, state.selected.stationId);
      if (!st) return;

      const lvlId = state.selected.levelId;
      if (!lvlId) return;

      if (Object.keys(st.levels).length <= 1) {
        alert("Mindestens 1 Level muss bleiben.");
        return;
      }

      delete st.levels[lvlId];
      state.selected.levelId = Object.keys(st.levels)[0] || null;
      persistAndRerender();
    });

    $("deleteStationBtn").addEventListener("click", () => {
      if (!state.admin) return;
      if (state.stations.length <= 1) {
        alert("Mindestens 1 Station muss bleiben.");
        return;
      }

      const id = state.selected.stationId;
      state.stations = state.stations.filter((s) => s.id !== id);
      state.selected.stationId = state.stations[0].id;
      state.selected.levelId = Object.keys(state.stations[0].levels)[0] || null;
      persistAndRerender();
    });

    $("pngBtn").addEventListener("click", async () => {
      const { st, lv } = current(state);
      if (!st || !lv || !lv.imageDataUrl) {
        alert("Kein Bild im aktuellen Level.");
        return;
      }
      const blob = await renderLevelToPngBlob(lv);
      downloadBlob(blob, `${sanitizeName(st.name)}_${sanitizeName(lv.name)}.png`);
    });

    $("zipBtn").addEventListener("click", async () => {
      const { st } = current(state);
      if (!st) return;

      const zip = new window.JSZip();
      for (const lvl of Object.values(st.levels)) {
        if (!lvl.imageDataUrl) continue;
        const blob = await renderLevelToPngBlob(lvl);
        zip.file(`${sanitizeName(lvl.name)}.png`, blob);
      }

      const out = await zip.generateAsync({ type: "blob" });
      downloadBlob(out, `${sanitizeName(st.name)}_export.zip`);
    });

    $("exportJsonBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      downloadBlob(blob, "bma_backup.json");
    });

    $("importJsonInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.stations)) throw new Error("invalid schema");
        saveState(parsed);
        location.reload();
      } catch {
        alert("Import fehlgeschlagen (JSON ungültig).");
      } finally {
        e.target.value = "";
      }
    });

    syncSelectors();
  }

  // boot
  let state = ensureSeed(loadState());
  renderApp();
  wire(state);
})();
