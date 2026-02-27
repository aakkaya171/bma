const stationSelect = document.getElementById("stationSelect");
const levelSelect   = document.getElementById("levelSelect");
const plan          = document.getElementById("plan");
const planImg       = document.getElementById("planImg");
const scroller      = document.getElementById("scroller");

const btnPrev       = document.getElementById("prev");
const btnNext       = document.getElementById("next");
const btnLevelUp    = document.getElementById("levelUp");
const btnLevelDown  = document.getElementById("levelDown");
const btnAdmin      = document.getElementById("toggleAdmin");
const btnClear      = document.getElementById("clearMarks");
const adminHint     = document.getElementById("adminHint");
const pageInfo      = document.getElementById("pageInfo");

const btnExportCurrent = document.getElementById("exportCurrent");
const btnExportStation = document.getElementById("exportStation");

let adminMode = false;

// Level-Reihenfolge
const LEVEL_ORDER = ["n+1","n0","n-1","n-2"];

// Speichern der Häkchen
const KEY = "bma_marks_levels_export_v1";
function loadAll(){ try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function saveAll(x){ localStorage.setItem(KEY, JSON.stringify(x)); }
let ALL = loadAll();

let STATIONS = window.STATIONS;
let currentStation = Object.keys(STATIONS)[0];

let currentLevel = "n0";
let currentIndexInLevel = 0;

/* ---------- Helper ---------- */

function getLevelFromName(path){
  const name = path.toLowerCase();
  for(const lv of LEVEL_ORDER){
    if(name.includes(lv)) return lv;
  }
  return "n0";
}

function groupedImages(){
  const all = STATIONS[currentStation].images.slice();
  const groups = {};
  for(const lv of LEVEL_ORDER) groups[lv] = [];

  for(const img of all){
    const lv = getLevelFromName(img);
    (groups[lv] ??= []).push(img);
  }

  for(const lv of Object.keys(groups)){
    groups[lv].sort((a,b)=>a.localeCompare(b));
  }

  return groups;
}

function levelIndex(){
  return LEVEL_ORDER.indexOf(currentLevel);
}

function getCurrentList(){
  const groups = groupedImages();
  return groups[currentLevel] || [];
}

function getCurrentImage(){
  const list = getCurrentList();
  if(list.length === 0) return null;

  if(currentIndexInLevel < 0) currentIndexInLevel = 0;
  if(currentIndexInLevel > list.length - 1) currentIndexInLevel = list.length - 1;

  return list[currentIndexInLevel];
}

function marksKey(station=currentStation, level=currentLevel, idx=currentIndexInLevel){
  return `${station}::${level}::${idx}`;
}

function getMarksFor(station=currentStation, level=currentLevel, idx=currentIndexInLevel){
  const k = marksKey(station, level, idx);
  if(!ALL[k]) ALL[k] = [];
  return ALL[k];
}

function clearMarksDOM(){
  plan.querySelectorAll(".mark").forEach(m=>m.remove());
}

/* ---------- UI ---------- */

function fillStation(){
  stationSelect.innerHTML = "";
  Object.keys(STATIONS).forEach(s=>{
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    stationSelect.appendChild(o);
  });
  stationSelect.value = currentStation;
}

function fillLevel(){
  levelSelect.innerHTML = "";
  const groups = groupedImages();

  LEVEL_ORDER.forEach(lv=>{
    if((groups[lv] || []).length === 0) return;
    const o = document.createElement("option");
    o.value = lv;
    o.textContent = lv.toUpperCase();
    levelSelect.appendChild(o);
  });

  if(!Array.from(levelSelect.options).some(o=>o.value === currentLevel)){
    currentLevel = levelSelect.options[0]?.value || "n0";
    currentIndexInLevel = 0;
  }
  levelSelect.value = currentLevel;
}

function setDisabled(btn, yes){
  if(yes) btn.classList.add("disabled");
  else btn.classList.remove("disabled");
}

function updateButtons(){
  const list = getCurrentList();
  setDisabled(btnPrev, currentIndexInLevel <= 0);
  setDisabled(btnNext, currentIndexInLevel >= list.length - 1);

  const groups = groupedImages();
  const curIdx = levelIndex();

  let upPossible = false;
  for(let i=curIdx-1;i>=0;i--){
    if((groups[LEVEL_ORDER[i]]||[]).length>0){ upPossible=true; break; }
  }

  let downPossible = false;
  for(let i=curIdx+1;i<LEVEL_ORDER.length;i++){
    if((groups[LEVEL_ORDER[i]]||[]).length>0){ downPossible=true; break; }
  }

  setDisabled(btnLevelUp, !upPossible);
  setDisabled(btnLevelDown, !downPossible);

  const total = Math.max(1, list.length);
  const cur = Math.min(total, currentIndexInLevel + 1);
  pageInfo.textContent = `Seite: ${cur}/${total}`;
}

/* ---------- Render ---------- */

function render(){
  const img = getCurrentImage();
  if(!img){
    planImg.removeAttribute("src");
    clearMarksDOM();
    updateButtons();
    return;
  }

  planImg.src = img;

  clearMarksDOM();
  getMarksFor().forEach(m=>{
    const el = document.createElement("div");
    el.className = "mark";
    el.style.left = m.x + "%";
    el.style.top  = m.y + "%";
    el.textContent = "✔";

    // ✅ OPTION A: Löschen nur wenn Admin EIN
    el.addEventListener("click",(e)=>{
      e.stopPropagation();
      if(!adminMode) return;
      removeMark(m);
    });

    plan.appendChild(el);
  });

  updateButtons();
}

/* ---------- Marks ---------- */

function addMarkFromClient(clientX, clientY){
  const rect = plan.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top)  / rect.height) * 100;

  getMarksFor().push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  saveAll(ALL);
  render();
}

function removeMark(mark){
  const k = marksKey();
  ALL[k] = getMarksFor().filter(m => m !== mark);
  saveAll(ALL);
  render();
}

/* ---------- Navigation ---------- */

function nextImg(){
  const list = getCurrentList();
  if(currentIndexInLevel >= list.length - 1) return;
  currentIndexInLevel++;
  render();
}

function prevImg(){
  if(currentIndexInLevel <= 0) return;
  currentIndexInLevel--;
  render();
}

function goLevelUp(){
  const groups = groupedImages();
  for(let i=levelIndex()-1;i>=0;i--){
    if((groups[LEVEL_ORDER[i]]||[]).length>0){
      currentLevel = LEVEL_ORDER[i];
      currentIndexInLevel = 0;
      fillLevel();
      render();
      return;
    }
  }
}

function goLevelDown(){
  const groups = groupedImages();
  for(let i=levelIndex()+1;i<LEVEL_ORDER.length;i++){
    if((groups[LEVEL_ORDER[i]]||[]).length>0){
      currentLevel = LEVEL_ORDER[i];
      currentIndexInLevel = 0;
      fillLevel();
      render();
      return;
    }
  }
}

/* ---------- ALLES löschen (Passwort 1705) ---------- */

function clearAllForCurrentStation(){
  const prefix = `${currentStation}::`;
  for(const k of Object.keys(ALL)){
    if(k.startsWith(prefix)) delete ALL[k];
  }
  saveAll(ALL);
}

btnClear.addEventListener("click", ()=>{
  const ok = confirm("ALLES löschen?\n\nDas entfernt alle Häkchen dieser Station (alle Level & Seiten).");
  if(!ok) return;

  const pw = prompt("Passwort eingeben (1705):");
  if(pw === null) return;
  if(pw !== "1705"){ alert("Falsches Passwort."); return; }

  clearAllForCurrentStation();
  alert("Alles gelöscht.");
  render();
});

/* ---------- EXPORT (PNG + ZIP) ---------- */

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = ()=>reject(new Error("Bild konnte nicht geladen werden: " + src));
    img.src = src;
  });
}

async function renderPngBlobFor(imageSrc, marks){
  const img = await loadImage(imageSrc);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  ctx.font = "900 96px system-ui, -apple-system, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#8b5cf6";

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#000";

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  for(const m of marks){
    const x = (m.x / 100) * canvas.width;
    const y = (m.y / 100) * canvas.height;
    ctx.strokeText("✔", x, y);
    ctx.fillText("✔", x, y);
  }

  return new Promise((resolve)=>{
    canvas.toBlob((blob)=>resolve(blob), "image/png");
  });
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseName(path){
  const p = path.split("/").pop();
  return p || "bild.png";
}

btnExportCurrent.addEventListener("click", async ()=>{
  try{
    const imgSrc = getCurrentImage();
    if(!imgSrc){ alert("Kein Bild geladen."); return; }

    const marks = getMarksFor().slice();
    const blob = await renderPngBlobFor(imgSrc, marks);

    const cleanBase = baseName(imgSrc).replace(/\.[^.]+$/,"");
    const fname = `${currentStation}_${currentLevel}_seite${currentIndexInLevel+1}_${cleanBase}.png`;
    downloadBlob(blob, fname);
  }catch(err){
    alert(String(err.message || err));
  }
});

btnExportStation.addEventListener("click", async ()=>{
  try{
    if(!window.JSZip){ alert("JSZip nicht geladen."); return; }

    const zip = new JSZip();
    const folderName = currentStation.replace(/[\\/:*?"<>|]/g, "_");
    const folder = zip.folder(folderName);

    const groups = groupedImages();

    for(const lv of LEVEL_ORDER){
      const list = groups[lv] || [];
      for(let i=0;i<list.length;i++){
        const imgSrc = list[i];
        const marks = getMarksFor(currentStation, lv, i).slice();
        const blob = await renderPngBlobFor(imgSrc, marks);

        const cleanBase = baseName(imgSrc).replace(/\.[^.]+$/,"").replace(/[\\/:*?"<>|]/g,"_");
        const fname = `${lv}_seite${i+1}_${cleanBase}.png`;
        folder.file(fname, blob);
      }
    }

    const zipBlob = await zip.generateAsync({type:"blob"});
    downloadBlob(zipBlob, `${folderName}_export.zip`);
  }catch(err){
    alert(String(err.message || err));
  }
});

/* ---------- Events ---------- */

btnNext.addEventListener("click", nextImg);
btnPrev.addEventListener("click", prevImg);
btnLevelUp.addEventListener("click", goLevelUp);
btnLevelDown.addEventListener("click", goLevelDown);

btnAdmin.addEventListener("click", ()=>{
  adminMode = !adminMode;
  btnAdmin.textContent = `Admin: ${adminMode ? "EIN" : "AUS"}`;
  adminHint.style.display = adminMode ? "block" : "none";
});

stationSelect.addEventListener("change", ()=>{
  currentStation = stationSelect.value;
  currentLevel = "n0";
  currentIndexInLevel = 0;
  fillLevel();
  render();
});

levelSelect.addEventListener("change", ()=>{
  currentLevel = levelSelect.value;
  currentIndexInLevel = 0;
  render();
});

plan.addEventListener("click", (e)=>{
  if(!adminMode) return;
  addMarkFromClient(e.clientX, e.clientY);
});

plan.addEventListener("touchend", (e)=>{
  if(!adminMode) return;
  const t = e.changedTouches?.[0];
  if(!t) return;
  e.preventDefault();
  addMarkFromClient(t.clientX, t.clientY);
}, {passive:false});

document.addEventListener("keydown", (e)=>{
  if(e.key === "ArrowLeft")  prevImg();
  if(e.key === "ArrowRight") nextImg();
  if(e.key === "ArrowUp")    goLevelUp();
  if(e.key === "ArrowDown")  goLevelDown();
});

let touchStartX = null;
scroller.addEventListener("touchstart", (e)=>{
  touchStartX = e.touches?.[0]?.clientX ?? null;
}, {passive:true});

scroller.addEventListener("touchend", (e)=>{
  const endX = e.changedTouches?.[0]?.clientX ?? null;
  if(touchStartX == null || endX == null) return;
  const dx = endX - touchStartX;
  if(Math.abs(dx) < 60) return;
  if(dx < 0) nextImg(); else prevImg();
  touchStartX = null;
}, {passive:true});

/* ---------- Start ---------- */
fillStation();
fillLevel();
render();