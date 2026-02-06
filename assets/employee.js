// ===============================
// Employee Portal (A-to-Z STYLE, NO EMOJIS)
// ✅ Bottom Tab Bar on mobile: Home / Schedule / Pay / Benefits / More
// ✅ Desktop keeps sidebar
// ✅ A-to-Z Home cards (no blanks)
// ✅ Schedule tabs + real calendar month grid (neutral colors)
// ✅ Timecard grid + punch list (A-to-Z feel)
// ✅ Uses employeeRecords/{SP###} + portal/public + users/{uid}
// ✅ Employee ID gate allowedEmployees/{SP###} + optional range auto-allow
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Firestore refs ----------
const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const TICKETS_COL = () => collection(db, "supportTickets");

// ✅ Range auto-allow (avoid adding 180 IDs by hand)
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ---------- Route helpers ----------
function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}

function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  document.getElementById("pageBody").innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function normalizeEmpId(input) {
  if (!input) return "";
  let v = input.toString().toUpperCase().trim();
  v = v.replace(/[\s-_]/g, "");
  if (!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if (!/^\d+$/.test(nums)) return "";
  return "SP" + nums;
}

function empIdToNumber(empId) {
  const m = String(empId || "").toUpperCase().match(/^SP(\d{1,6})$/);
  if (!m) return null;
  return Number(m[1]);
}

function fmtDate(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d || "");
    return x.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return String(d || "");
  }
}

function fmtMonthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function telLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "tel:0";
}

function clamp(n, a, b) {
  n = Number(n);
  if (isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function nowISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymd(d) {
  // Accept Date or string ISO
  try {
    const x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

// ---------- Default docs ----------
function defaultPublicContent() {
  return {
    brand: {
      name: "SunPowerC",
      logoText: "sunpowerc",
      accent: "#2563eb"
    },
    help: {
      phone: "(502) 555-0148",
      email: "hr@sunpowerc.energy",
      text: "We’re here to help. Choose an option below and we’ll get you taken care of."
    },
    site: {
      managerPhone: "(502) 555-0122",
      safetyPhone: "(502) 555-0172",
      address: ""
    },
    home: {
      news: [
        { title: "SunPowerC updates", subtitle: "Company news and updates", linkText: "All news", route: "notifications" }
      ]
    },
    footwear: {
      programTitle: "Safety Footwear Program",
      shopUrl: "https://shop.sunpowerc.energy"
    },
    globalNotifications: []
  };
}

function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",
    appointment: { date: "", time: "", address: "", notes: "" },

    steps: [
      { id: "application", label: "Application", done: true },
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Documents", done: false },
      { id: "documents", label: "Complete Onboarding Documents", done: false }, // in person
      { id: "firstday", label: "First Day Preparation", done: false }           // in person
    ],

    shift: { position: "", shift: "" },
    footwear: { ack1: false, ack2: false, ack3: false, ack4: false, ack5: false },
    i9: { ack: false },

    employeeId: "",
    notifications: [],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

async function ensureUserDocExists(user) {
  if (!isFirebaseConfigured()) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const patch = {
    email: user?.email || "",
    fullName: user?.displayName || "",
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...patch, role: "employee", status: "active", createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(ref, patch, { merge: true });
  }
}

async function isAdminUser(user) {
  if (!isFirebaseConfigured()) return false;
  try {
    const ref = doc(db, "admins", user.uid);
    const snap = await getDoc(ref);
    const d = snap.exists() ? (snap.data() || {}) : {};
    return snap.exists() && (d.role === "admin" || d.isAdmin === true);
  } catch {
    return false;
  }
}

async function ensureEmployeeId(user) {
  if (!isFirebaseConfigured()) return "PREVIEW";

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  if (data?.employeeId) return data.employeeId;

  let empId = prompt("Enter your Employee ID (example: SP023):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required.");

  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  let ok = false;

  if (allowedSnap.exists()) {
    ok = (allowedSnap.data()?.active === true);
  } else {
    const n = empIdToNumber(empId);
    if (n !== null && n >= EMP_ID_RANGE.min && n <= EMP_ID_RANGE.max) {
      ok = true;
      if (AUTO_CREATE_ALLOWED_ID) {
        await setDoc(allowedRef, { active: true, createdAt: serverTimestamp() }, { merge: true });
      }
    }
  }

  if (!ok) throw new Error("Invalid Employee ID. Contact HR.");

  await setDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() }, { merge: true });
  return empId;
}

// ===============================
// A-to-Z CHROME (NO HAMBURGER, NO EMOJIS)
// ===============================
function isMobile() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function azIcon(name) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    home: `<svg ${common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
    schedule: `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4M16 2v4"/><path d="M3 10h18"/></svg>`,
    pay: `<svg ${common}><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M3 11h18"/><path d="M7 15h4"/></svg>`,
    benefits: `<svg ${common}><path d="M12 22s7-4 7-10V6l-7-3-7 3v6c0 6 7 10 7 10Z"/></svg>`,
    more: `<svg ${common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    bell: `<svg ${common}><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    chat: `<svg ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    chevR: `<svg ${common}><path d="M9 18l6-6-6-6"/></svg>`,
    chevL: `<svg ${common}><path d="M15 18l-6-6 6-6"/></svg>`,
    dots: `<svg ${common}><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`
  };
  return icons[name] || icons.dots;
}

function ensureChromeOnce() {
  // Hide hamburger if exists
  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) btnMenu.style.display = "none";

  // Sidebar visible only on desktop
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  // If tabs already exist, just re-apply visibility + force-close overlay so it doesn't block taps
  if (document.getElementById("azTabs")) {
    applyChromeVisibility();
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (ov) { ov.style.display = "none"; ov.style.pointerEvents = "none"; }
    if (sh) sh.classList.remove("open");
    return;
  }

  const style = document.createElement("style");
  style.id = "azStyle";
  style.textContent = `
    /* A-to-Z base spacing */
    body.portal.has-tabs .content{ padding-bottom: 92px; }

    #azTabs{
      position:fixed; left:0; right:0; bottom:0;
      height:72px; z-index:5000;
      background: rgba(255,255,255,.98);
      border-top:1px solid rgba(229,234,242,.95);
      display:none;
      padding-bottom: env(safe-area-inset-bottom);
      backdrop-filter: blur(10px);
    }
    #azTabs .az-wrap{
      max-width:980px; margin:0 auto;
      height:72px;
      display:grid;
      grid-template-columns: repeat(5, 1fr);
      align-items:center;
      gap:6px;
      padding:8px 10px;
    }
    .az-tab{
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:6px;
      border-radius:14px;
      padding:8px 6px;
      border:1px solid transparent;
      user-select:none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      color: rgba(11,18,32,.85);
      font-weight:900;
      font-size:11px;
      background:transparent;
    }
    .az-ico{
      width:28px;height:28px;
      border-radius:999px;
      display:flex;align-items:center;justify-content:center;
      background: rgba(2,6,23,.04);
      color: rgba(2,6,23,.78);
    }
    .az-ico svg{ width:18px; height:18px; }
    .az-tab.active{ color: rgba(29,78,216,1); }
    .az-tab.active .az-ico{ background: rgba(29,78,216,.10); color: rgba(29,78,216,1); }

    /* More overlay MUST NOT block clicks when closed */
    #azMoreOverlay{
      position:fixed; inset:0;
      background:rgba(0,0,0,.45);
      display:none;
      pointer-events:none; /* 👈 critical */
      z-index:6000;
    }
    #azMoreSheet{
      position:fixed; left:0; right:0; bottom:0;
      background:rgba(255,255,255,.98);
      border-top-left-radius:20px; border-top-right-radius:20px;
      border:1px solid rgba(229,234,242,.95);
      box-shadow: 0 18px 55px rgba(2,6,23,.18);
      transform: translateY(110%);
      transition: transform .22s ease;
      z-index:6100;
      max-height: 72vh;
      overflow:auto;
      padding-bottom: env(safe-area-inset-bottom);
    }
    #azMoreSheet.open{ transform: translateY(0); }

    .azMoreHead{
      padding:14px 14px 10px;
      display:flex;align-items:center;justify-content:space-between;
      gap:10px;
      border-bottom:1px solid rgba(229,234,242,.95);
      position:sticky; top:0; background:rgba(255,255,255,.98);
      backdrop-filter: blur(10px);
      z-index:1;
    }
    .azMoreTitle{ font-weight:1000; font-size:14px; }
    .azMoreGrid{ padding:12px 14px 16px; display:grid; grid-template-columns: 1fr; gap:10px; }
    .azMoreItem{
      display:flex; align-items:center; justify-content:space-between;
      gap:10px;
      padding:12px;
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 10px 24px rgba(15,23,42,.05);
      font-weight:1000;
      text-decoration:none;
      color: inherit;
    }
    .azMoreItem .sub{ font-size:12px; font-weight:800; color: var(--muted); margin-top:4px; }
    .azMoreArrow{ display:flex; align-items:center; justify-content:center; width:18px; height:18px; color: rgba(2,6,23,.45); }
    .azMoreArrow svg{ width:18px; height:18px; }

    /* Home top bar row (icons) */
    .azTopRow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .azTopIcons{ display:flex; gap:10px; }
    .azIconBtn{
      width:34px; height:34px;
      border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
      color: rgba(2,6,23,.70);
      text-decoration:none;
    }
    .azIconBtn svg{ width:18px; height:18px; }

    /* Home hero */
    .azHero{
      border-radius:18px;
      overflow:hidden;
      border:1px solid rgba(229,234,242,.95);
      background: linear-gradient(180deg, rgba(2,6,23,.06), rgba(2,6,23,.02));
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    }
    .azHeroInner{ padding:12px; }
    .azHeroTitle{ font-weight:1000; font-size:13px; color: rgba(2,6,23,.78); }
    .azHeroSub{ margin-top:6px; font-weight:900; font-size:12px; color: rgba(2,6,23,.55); }
    .azHeroPills{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .azPill{
      padding:7px 10px;
      border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background: rgba(255,255,255,.92);
      font-weight:900;
      font-size:12px;
      color: rgba(2,6,23,.72);
      display:inline-flex;
      align-items:center;
      gap:8px;
      text-decoration:none;
    }

    /* Two-card row like A-to-Z */
    .azRow2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
    .azCard{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      padding:12px;
    }
    .azCardTitle{ font-weight:1000; font-size:13px; }
    .azCardSub{ margin-top:6px; font-weight:900; font-size:12px; color: var(--muted); line-height:1.25; }
    .azCardLink{
      margin-top:10px;
      display:inline-flex;
      align-items:center;
      gap:6px;
      font-weight:1000;
      font-size:12px;
      color: rgba(29,78,216,1);
      text-decoration:none;
    }
    .azCardLink svg{ width:16px; height:16px; }

    /* Single wide card */
    .azWide{ margin-top:10px; }
    .azBar{
      height:10px; border-radius:999px;
      background: rgba(2,6,23,.08);
      overflow:hidden;
      border:1px solid rgba(229,234,242,.95);
      margin-top:10px;
    }
    .azBar > div{ height:100%; background: rgba(29,78,216,.45); width:0%; }

    /* Schedule top tabs */
    .azTabsTop{
      display:flex; gap:18px; align-items:center;
      border-bottom:1px solid rgba(229,234,242,.95);
      margin: 4px 0 12px;
      padding-bottom:8px;
      overflow:auto;
      -webkit-overflow-scrolling: touch;
    }
    .azTabsTop a{
      text-decoration:none;
      font-weight:1000;
      font-size:13px;
      color: rgba(2,6,23,.55);
      padding:8px 0;
      border-bottom:3px solid transparent;
      white-space:nowrap;
    }
    .azTabsTop a.active{
      color: rgba(2,6,23,.85);
      border-bottom-color: rgba(29,78,216,.85);
    }

    /* Calendar */
    .azCalWrap{
      border-radius:16px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
      overflow:hidden;
    }
    .azCalHead{
      display:flex; justify-content:space-between; align-items:center;
      padding:12px;
      border-bottom:1px solid rgba(229,234,242,.95);
    }
    .azCalMonth{ font-weight:1000; font-size:14px; }
    .azCalNav{ display:flex; gap:8px; }
    .azCalBtn{
      width:34px;height:34px;border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      display:flex;align-items:center;justify-content:center;
      color: rgba(2,6,23,.70);
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
    }
    .azCalGrid{
      display:grid;
      grid-template-columns: repeat(7, 1fr);
      gap:0;
      padding:10px;
    }
    .azCalDow{
      font-weight:1000;
      font-size:11px;
      color: rgba(2,6,23,.45);
      padding:8px 6px;
      text-align:center;
    }
    .azDay{
      height:44px;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      font-weight:1000;
      font-size:12px;
      color: rgba(2,6,23,.75);
      border-radius:10px;
      margin:2px;
      cursor:pointer;
      user-select:none;
    }
    .azDay.muted{ color: rgba(2,6,23,.28); font-weight:900; }
    .azDay.sel{ outline:2px solid rgba(29,78,216,.65); outline-offset:1px; }
    .azDay.today{ border:1px solid rgba(2,6,23,.18); }
    .azDay .dot{
      position:absolute; bottom:6px; left:50%; transform:translateX(-50%);
      width:5px;height:5px;border-radius:99px;background: rgba(2,6,23,.25);
    }
    .azLegend{
      display:flex; gap:14px; flex-wrap:wrap;
      padding:10px 12px 12px;
      border-top:1px solid rgba(229,234,242,.95);
      color: rgba(2,6,23,.55);
      font-weight:900;
      font-size:12px;
    }

    /* Timecard quick grid */
    .azQuickGrid{
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap:10px;
      margin-top:10px;
    }
    .azQuick{
      border-radius:14px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
      padding:12px;
      font-weight:1000;
      min-height:70px;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      color: rgba(2,6,23,.82);
      text-decoration:none;
    }
    .azQuickTop{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .azQuickIcon{
      width:34px;height:34px;border-radius:12px;
      background: rgba(2,6,23,.05);
      display:flex;align-items:center;justify-content:center;
      color: rgba(2,6,23,.70);
    }
    .azQuickIcon svg{ width:18px;height:18px; }
    .azQuickSub{ margin-top:8px; font-weight:900; font-size:12px; color: rgba(2,6,23,.50); }

    /* Punch list row */
    .azPunchRow{
      display:flex; justify-content:space-between; align-items:center;
      padding:10px 0;
      border-top:1px solid rgba(229,234,242,.95);
      font-weight:1000;
    }
    .azPunchRow:first-child{ border-top:none; }
    .azPunchLeft{ display:flex; flex-direction:column; gap:4px; }
    .azPunchType{ font-size:12px; color: rgba(2,6,23,.65); }
    .azPunchTime{ font-size:14px; color: rgba(2,6,23,.85); }

    @media (max-width: 420px){
      .azRow2{ grid-template-columns: 1fr; }
      .azQuickGrid{ grid-template-columns: repeat(2,1fr); }
    }
  `;
  document.head.appendChild(style);

  // Bottom tabs
  const tabs = document.createElement("div");
  tabs.id = "azTabs";
  tabs.innerHTML = `
    <div class="az-wrap">
      <a class="az-tab" data-route="home" href="#home">
        <div class="az-ico">${azIcon("home")}</div>
        <div>Home</div>
      </a>
      <a class="az-tab" data-route="schedule" href="#schedule">
        <div class="az-ico">${azIcon("schedule")}</div>
        <div>Schedule</div>
      </a>
      <a class="az-tab" data-route="payroll" href="#payroll">
        <div class="az-ico">${azIcon("pay")}</div>
        <div>Pay</div>
      </a>
      <a class="az-tab" data-route="timeoff" href="#timeoff">
        <div class="az-ico">${azIcon("benefits")}</div>
        <div>Benefits</div>
      </a>
      <button class="az-tab" id="azMoreBtn" type="button">
        <div class="az-ico">${azIcon("more")}</div>
        <div>More</div>
      </button>
    </div>
  `;
  document.body.appendChild(tabs);

  // More overlay + sheet
  const overlay = document.createElement("div");
  overlay.id = "azMoreOverlay";
  document.body.appendChild(overlay);

  const sheet = document.createElement("div");
  sheet.id = "azMoreSheet";
  sheet.innerHTML = `
    <div class="azMoreHead">
      <div>
        <div class="azMoreTitle">More</div>
        <div class="small muted" style="font-weight:900;margin-top:2px;">All portal modules</div>
      </div>
      <button class="btn sm ghost" id="azMoreClose" type="button">Close</button>
    </div>

    <div class="azMoreGrid">
      <a class="azMoreItem" href="#progress">
        <div>
          <div>Progress</div>
          <div class="sub">Onboarding checklist</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#shift">
        <div>
          <div>Shift Selection</div>
          <div class="sub">Choose your preference</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#footwear">
        <div>
          <div>Safety Footwear</div>
          <div class="sub">Program + acknowledgement</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#i9">
        <div>
          <div>I-9</div>
          <div class="sub">Bring documents on day 1</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#documents">
        <div>
          <div>Documents</div>
          <div class="sub">Completed in person</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#firstday">
        <div>
          <div>First Day</div>
          <div class="sub">Check-in instructions</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#hours">
        <div>
          <div>My Hours</div>
          <div class="sub">Weekly summary</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#deposit">
        <div>
          <div>Direct Deposit</div>
          <div class="sub">View only</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#notifications">
        <div>
          <div>Notifications</div>
          <div class="sub">Company + HR + personal</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>

      <a class="azMoreItem" href="#help">
        <div>
          <div>Help & Support</div>
          <div class="sub">Call / Email / Ticket</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
      </a>
    </div>
  `;
  document.body.appendChild(sheet);
// ===== iOS: matar "tap" al soltar después de SCROLL dentro del sheet =====
(() => {
  const sh = document.getElementById("azMoreSheet");
  if (!sh) return;

  let startTop = 0;
  let sx = 0, sy = 0;
  let ignoreUntil = 0;

  sh.addEventListener("touchstart", (e) => {
    startTop = sh.scrollTop;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });

  // CAPTURE: corre antes que cualquier handler global (uiWireGlobalTaps o similares)
  sh.addEventListener("touchend", (e) => {
    const endTop = sh.scrollTop;
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - sx);
    const dy = Math.abs(t.clientY - sy);
    const dScroll = Math.abs(endTop - startTop);

    // Si el sheet se movió (scroll real) o el dedo se movió, NO es tap válido
    if (dScroll > 2 || dx > 10 || dy > 10) {
      ignoreUntil = Date.now() + 600;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return false;
    }
  }, true);

  // También bloquea clicks que lleguen después del touchend
  sh.addEventListener("click", (e) => {
    if (Date.now() < ignoreUntil) {
      const a = e.target.closest("a");
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return false;
      }
    }
  }, true);

  // Pointer events (por si iOS te dispara pointerup)
  sh.addEventListener("pointerdown", (e) => {
    startTop = sh.scrollTop;
    sx = e.clientX; sy = e.clientY;
  }, { passive: true });

  sh.addEventListener("pointerup", (e) => {
    const endTop = sh.scrollTop;
    const dx = Math.abs(e.clientX - sx);
    const dy = Math.abs(e.clientY - sy);
    const dScroll = Math.abs(endTop - startTop);

    if (dScroll > 2 || dx > 10 || dy > 10) {
      ignoreUntil = Date.now() + 600;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return false;
    }
  }, true);
})();
  // ====== FIX DEFINITIVO: More funciona SIEMPRE + overlay nunca bloquea taps ======
  const azMoreOpen = () => {
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (!ov || !sh) return;
    ov.style.display = "block";
    ov.style.pointerEvents = "auto";
    sh.classList.add("open");
  };

  const azMoreClose = () => {
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (!ov || !sh) return;
    sh.classList.remove("open");
    ov.style.display = "none";
    ov.style.pointerEvents = "none"; // 👈 clave: no traga clicks (Log out vuelve a funcionar)
  };

  // Siempre arrancar cerrado (mata overlays fantasmas)
  azMoreClose();

  // Delegación (captura) para que nunca se pierda el click aunque haya rerenders
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#azMoreBtn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    azMoreOpen();
  }, true);

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("#azMoreClose");
    if (!closeBtn) return;
    e.preventDefault();
    e.stopPropagation();
    azMoreClose();
  }, true);

  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "azMoreOverlay") {
      e.preventDefault();
      e.stopPropagation();
      azMoreClose();
    }
  }, true);

  document.addEventListener("click", (e) => {
    const link = e.target.closest("#azMoreSheet a");
    if (!link) return;
    azMoreClose();
  }, true);

  applyChromeVisibility();
  window.addEventListener("resize", applyChromeVisibility);
}

function applyChromeVisibility() {
  const tabs = document.getElementById("azTabs");
  if (!tabs) return;

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (isMobile()) {
    tabs.style.display = "block";
    document.body.classList.add("has-tabs");
  } else {
    tabs.style.display = "none";
    document.body.classList.remove("has-tabs");

    const overlay = document.getElementById("azMoreOverlay");
    const sheet = document.getElementById("azMoreSheet");
    if (overlay) { overlay.style.display = "none"; overlay.style.pointerEvents = "none"; }
    if (sheet) sheet.classList.remove("open");
  }
}

function setActiveTabsAndSidebar() {
  const r = routeName();

  const tabKey =
    (r === "home" || r === "progress") ? "home" :
    (r.startsWith("schedule")) ? "schedule" :
    (r === "payroll") ? "payroll" :
    (r === "timeoff") ? "timeoff" :
    "more";

  document.querySelectorAll("#azTabs .az-tab").forEach(el => {
    const key = el.getAttribute("data-route");
    if (key) el.classList.toggle("active", key === tabKey);
  });

  document.querySelectorAll(".nav-item").forEach(a => {
    const rr = (a.getAttribute("data-route") || "").toLowerCase();
    a.classList.toggle("active", rr === r);
  });
}

// ===============================
// STAGEBAR (ONLY Progress)
// ===============================
function renderStagebar(userData) {
  const el = document.getElementById("stagebar");
  if (!el) return;

  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  if (!steps.length) { el.innerHTML = ""; return; }

  const firstPendingIndex = steps.findIndex(s => !s.done);
  const currentIndex = firstPendingIndex === -1 ? steps.length - 1 : firstPendingIndex;

  const chips = steps.map((s, i) => {
    const done = !!s.done;
    const locked = i > currentIndex;
    const cls = done ? "sb-chip ok" : locked ? "sb-chip lock" : "sb-chip warn";
    const icon = done ? "✓" : locked ? "•" : "•";
    return `
      <div class="${cls}">
        <span class="sb-ico">${icon}</span>
        <span class="sb-lbl">${escapeHtml(s.label || "")}</span>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <style>
      .sb-wrap{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;}
      .sb-chip{
        display:flex;align-items:center;gap:8px;
        border:1px solid var(--line); background:#fff;
        border-radius:999px; padding:10px 12px;
        font-size:12px; font-weight:900;
        box-shadow: 0 6px 18px rgba(15,23,42,.06);
      }
      .sb-chip.ok{border-color:rgba(22,163,74,.25);background:rgba(22,163,74,.08);color:var(--good);}
      .sb-chip.warn{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.08);color:#92400e;}
      .sb-chip.lock{opacity:.55}
      .sb-ico{width:18px;display:inline-flex;justify-content:center;}
    </style>
    <div class="sb-wrap">${chips}</div>
  `;
}

// ===============================
// UI blocks (A-to-Z feel)
// ===============================
function sectionHeader(title, right = "") {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
}

function azCard(title, sub, linkText, href) {
  return `
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(title)}</div>
      <div class="azCardSub">${escapeHtml(sub)}</div>
      ${href ? `
        <a class="azCardLink" href="${escapeHtml(href)}">
          <span>${escapeHtml(linkText || "View more")}</span>
          ${azIcon("chevR")}
        </a>
      ` : `
        <div class="azCardSub" style="margin-top:10px;">${escapeHtml(linkText || "")}</div>
      `}
    </div>
  `;
}

// ===============================
// HOME (A-to-Z cards)
// ===============================
function renderHome(publicData, recordData, userData) {
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;

  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;

  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);

  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);

  setPage(
    "Home",
    "",
    `
      <div class="azTopRow">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-weight:1000;color:rgba(2,6,23,.75);">Sun-Power</div>
        </div>
        <div class="azTopIcons">
          <a class="azIconBtn" href="#help" aria-label="Help">${azIcon("chat")}</a>
          <a class="azIconBtn" href="#notifications" aria-label="Notifications">${azIcon("bell")}</a>
        </div>
      </div>

      <div class="azHero">
        <div class="azHeroInner">
          <div class="azHeroTitle">${escapeHtml(news?.[0]?.title || "A to Z news")}</div>
          <div class="azHeroSub">${escapeHtml(news?.[0]?.subtitle || "Company updates and announcements")}</div>
          <div class="azHeroPills">
            <a class="azPill" href="#notifications">
              <span>All news</span>
              ${azIcon("chevR")}
            </a>
            <span class="azPill">Updates</span>
            <span class="azPill">Resources</span>
          </div>
        </div>
      </div>

      <div style="height:10px"></div>

      <div class="azRow2">
        ${azCard(
          "Find shifts",
          safe(recordData?.findShiftsText, "No shifts available at the moment"),
          "View more",
          "#schedule-findshifts"
        )}
        ${azCard(
          "VTO",
          safe(recordData?.vtoText, "No VTO available at the moment"),
          "",
          ""
        )}
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">Time off & leave</div>
          <div class="azCardSub">Manage your time off & leave requests</div>
          <a class="azCardLink" href="#timeoff">
            <span>Open</span>
            ${azIcon("chevR")}
          </a>
        </div>
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">Max. ${escapeHtml(String(maxHours))}h</div>
          <div class="azCardSub">
            ${escapeHtml(Math.floor(scheduledMin / 60))}h ${escapeHtml(String(scheduledMin % 60).padStart(2,"0"))}m scheduled
            &nbsp;&nbsp;•&nbsp;&nbsp;
            ${escapeHtml(Math.floor(remainingMin / 60))}h ${escapeHtml(String(remainingMin % 60).padStart(2,"0"))}m to max. hours
          </div>
          <div class="azBar"><div style="width:${pct.toFixed(0)}%"></div></div>
        </div>
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">${escapeHtml(String(punchesCount))} punches today</div>
          <div class="azCardSub">Last clocked in at ${escapeHtml(safe(recordData?.lastClockedIn, "—"))}</div>
          <a class="azCardLink" href="#schedule-timecard">
            <span>Open timecard</span>
            ${azIcon("chevR")}
          </a>
        </div>
      </div>

      <div class="azWide">
        <div class="azCard" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div class="azCardTitle">Explore trainings</div>
            <div class="azCardSub">Browse trainings offered by SunPowerC</div>
          </div>
          <div class="azIconBtn" style="width:44px;height:44px;border-radius:16px;">
            ${azIcon("chevR")}
          </div>
        </div>
      </div>

      <div style="height:8px"></div>
    `
  );
}

// ===============================
// SCHEDULE: Tabs + Calendar + Detail section
// ===============================
function scheduleSubtabFromRoute(r) {
  // schedule, schedule-timecard, schedule-findshifts
  if (r === "schedule-timecard") return "timecard";
  if (r === "schedule-findshifts") return "findshifts";
  return "myschedule";
}

function scheduleTopTabsHtml(active) {
  const tab = (key, label, href) => `
    <a href="${href}" class="${active === key ? "active" : ""}">
      ${escapeHtml(label)}
    </a>
  `;
  return `
    <div class="azTabsTop">
      ${tab("myschedule","My Schedule","#schedule")}
      ${tab("timecard","Timecard","#schedule-timecard")}
      ${tab("findshifts","Find Shifts","#schedule-findshifts")}
    </div>
  `;
}

function buildEventsIndex(recordData) {
  const events = Array.isArray(recordData?.scheduleEvents) ? recordData.scheduleEvents : [];
  const idx = new Map(); // ymd -> events[]
  for (const ev of events) {
    const key = ymd(ev?.date);
    if (!key) continue;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(ev);
  }
  return idx;
}

function renderCalendarMonth(recordData, state) {
  // state: { y, m, selectedYmd }
  const y = state.y;
  const m = state.m;
  const selected = state.selectedYmd;

  const first = new Date(y, m, 1);
  const startDow = first.getDay(); // 0 Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const prevDays = startDow; // days from prev month shown
  const totalCells = 42; // 6 weeks
  const prevMonthDays = new Date(y, m, 0).getDate();

  const today = ymd(new Date());

  const eventsIdx = buildEventsIndex(recordData);

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - prevDays + 1;
    let cellDate;
    let label;
    let muted = false;

    if (dayNum <= 0) {
      // prev month
      const d = prevMonthDays + dayNum;
      cellDate = new Date(y, m - 1, d);
      label = d;
      muted = true;
    } else if (dayNum > daysInMonth) {
      // next month
      const d = dayNum - daysInMonth;
      cellDate = new Date(y, m + 1, d);
      label = d;
      muted = true;
    } else {
      // current month
      cellDate = new Date(y, m, dayNum);
      label = dayNum;
    }

    const key = ymd(cellDate);
    const hasEvent = eventsIdx.has(key);

    const isSel = (key && key === selected);
    const isToday = (key && key === today);

    cells.push(`
      <div class="azDay ${muted ? "muted" : ""} ${isSel ? "sel" : ""} ${isToday ? "today" : ""}"
           data-ymd="${escapeHtml(key)}">
        ${escapeHtml(String(label))}
        ${hasEvent ? `<span class="dot"></span>` : ``}
      </div>
    `);
  }

  const dow = ["SUN","MON","TUE","WED","THU","FRI","SAT"].map(x => `<div class="azCalDow">${x}</div>`).join("");

  return `
    <div class="azCalWrap">
      <div class="azCalHead">
        <div class="azCalMonth">${escapeHtml(fmtMonthTitle(y,m))}</div>
        <div class="azCalNav">
          <button class="azCalBtn" id="calPrev" type="button" aria-label="Previous month">${azIcon("chevL")}</button>
          <button class="azCalBtn" id="calNext" type="button" aria-label="Next month">${azIcon("chevR")}</button>
        </div>
      </div>

      <div class="azCalGrid">
        ${dow}
        ${cells.join("")}
      </div>

      <div class="azLegend">
        <div class="azKey"><span class="azKeyBox"></span><span>Punches</span></div>
        <div class="azKey"><span class="azKeyBox"></span><span>Attention</span></div>
        <div class="azKey"><span class="azKeyBox"></span><span>Scheduled shifts</span></div>
        <div class="azKey"><span style="width:10px;height:10px;border-radius:999px;background:rgba(2,6,23,.25);display:inline-block;"></span><span>Day has data</span></div>
      </div>
    </div>
  `;
}

function renderMySchedule(recordData) {
  // default state: current month, today selected
  const today = new Date();
  const state = {
    y: today.getFullYear(),
    m: today.getMonth(),
    selectedYmd: ymd(today)
  };

  setPage(
    "Schedule",
    "",
    `
      ${scheduleTopTabsHtml("myschedule")}

      ${renderCalendarMonth(recordData, state)}

      <div style="height:12px"></div>

      <div class="azCard" id="dayDetailsCard">
        <div class="azCardTitle">Day details</div>
        <div class="azCardSub" id="dayDetailsSub">Select a day to view details.</div>
        <div id="dayDetailsBody" style="margin-top:10px;"></div>
      </div>
    `
  );

  const eventsIdx = buildEventsIndex(recordData);

  function renderDayDetails(key) {
    const cardSub = document.getElementById("dayDetailsSub");
    const body = document.getElementById("dayDetailsBody");
    if (!cardSub || !body) return;

    const list = eventsIdx.get(key) || [];
    uiSetText(cardSub, key ? fmtDate(key) : "Select a day to view details.");

    if (!key) {
      body.innerHTML = `<div class="muted">No day selected.</div>`;
      return;
    }

    if (!list.length) {
      body.innerHTML = `
        <div class="muted" style="line-height:1.45;">
          There are no scheduled shifts for this day.
          Check back later or search another day.
        </div>
      `;
      return;
    }

    body.innerHTML = list.map(ev => {
      const start = safe(ev.start, "—");
      const end = safe(ev.end, "—");
      const loc = safe(ev.location, "");
      const site = safe(ev.site, "");
      const role = safe(ev.role, "");
      const status = safe(ev.status, "Scheduled");
      return `
        <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div>
              <div class="azCardTitle">${escapeHtml(`${start} - ${end}`)}</div>
              <div class="azCardSub">${escapeHtml([role, site].filter(Boolean).join(" • ") || "Scheduled shift")}</div>
              ${loc ? `<div class="azCardSub" style="margin-top:8px;">${escapeHtml(loc)}</div>` : ""}
            </div>
            <div class="azCardSub" style="font-weight:1000;color:rgba(2,6,23,.60);">${escapeHtml(status)}</div>
          </div>

          <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
            <button class="btn ghost" type="button" disabled style="border-radius:999px;min-width:120px;">View Details</button>
            <button class="btn ghost" type="button" disabled style="border-radius:999px;min-width:120px;">Actions</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function rerenderCalendar() {
    const newHtml = renderCalendarMonth(recordData, state);
    const old = document.querySelector(".azCalWrap");
    if (old) old.outerHTML = newHtml;
    wireCalendar();
    renderDayDetails(state.selectedYmd);
  }

  function wireCalendar() {
    const prev = document.getElementById("calPrev");
    const next = document.getElementById("calNext");
    if (prev) prev.onclick = () => {
      state.m -= 1;
      if (state.m < 0) { state.m = 11; state.y -= 1; }
      rerenderCalendar();
    };
    if (next) next.onclick = () => {
      state.m += 1;
      if (state.m > 11) { state.m = 0; state.y += 1; }
      rerenderCalendar();
    };

    document.querySelectorAll(".azDay").forEach(el => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-ymd") || "";
        state.selectedYmd = key;

        document.querySelectorAll(".azDay").forEach(x => x.classList.remove("sel"));
        el.classList.add("sel");

        renderDayDetails(key);
      });
    });
  }

  wireCalendar();
  renderDayDetails(state.selectedYmd);
}

function renderTimecard(recordData) {
  const punches = Array.isArray(recordData?.punches) ? recordData.punches : [];
  const missedPunch = !!recordData?.missedPunch;

  setPage(
    "Schedule",
    "",
    `
      ${scheduleTopTabsHtml("timecard")}

      <div class="azQuickGrid">
        ${quickTile("Guide Me", "guide")}
        ${quickTile("Attendance", "clock")}
        ${quickTile("Time off & leave", "benefits")}
        ${quickTile("Task List", "dots")}
        ${quickTile("Report Absence", "schedule")}
        ${quickTile("Correct Punches", "pay")}
        ${quickTile("More", "more")}
      </div>

      <div style="height:12px"></div>

      <div class="azCard">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
          <div>
            <div class="azCardTitle">Today</div>
            <div class="azCardSub">${escapeHtml(fmtDate(nowISODate()))}</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="azCalBtn" type="button" disabled aria-label="Prev">${azIcon("chevL")}</button>
            <button class="azCalBtn" type="button" disabled aria-label="Next">${azIcon("chevR")}</button>
          </div>
        </div>

        <div style="margin-top:12px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div class="azCardTitle" style="font-size:13px;">Punch times (${escapeHtml(String(punches.length))})</div>
          <a class="azCardLink" href="#help" style="margin-top:0;">
            <span>Missed a punch?</span>
            ${azIcon("chevR")}
          </a>
        </div>

        ${missedPunch ? `
          <div class="alert warn" style="margin-top:10px;">
            Missed Punch
          </div>
        ` : ``}

        <div style="margin-top:10px;">
          ${punches.length ? punches.map(p => `
            <div class="azPunchRow">
              <div class="azPunchLeft">
                <div class="azPunchType">${escapeHtml(safe(p.type, "In"))}</div>
                <div class="azPunchType">${escapeHtml(safe(p.date, nowISODate()))}</div>
              </div>
              <div class="azPunchTime">${escapeHtml(safe(p.time, "—"))}</div>
            </div>
          `).join("") : `
            <div class="muted" style="line-height:1.45;">
              No punches recorded yet.
            </div>
          `}
        </div>
      </div>
    `
  );

  function quickTile(title, iconKey) {
    const icon =
      iconKey === "guide" ? azIcon("search") :
      iconKey === "clock" ? azIcon("clock") :
      iconKey === "benefits" ? azIcon("benefits") :
      iconKey === "pay" ? azIcon("pay") :
      iconKey === "schedule" ? azIcon("schedule") :
      azIcon("dots");

    return `
      <a class="azQuick" href="#help">
        <div class="azQuickTop">
          <div class="azQuickIcon">${icon}</div>
          <div style="color:rgba(2,6,23,.40);">${azIcon("chevR")}</div>
        </div>
        <div>
          <div>${escapeHtml(title)}</div>
          <div class="azQuickSub">Open</div>
        </div>
      </a>
    `;
  }
}

function renderFindShifts(recordData) {
  const list = Array.isArray(recordData?.availableShifts) ? recordData.availableShifts : [];

  setPage(
    "Schedule",
    "",
    `
      ${scheduleTopTabsHtml("findshifts")}

      <div class="azCard">
        <div class="azCardTitle">Find shifts</div>
        <div class="azCardSub">Search and view opportunities posted by HR.</div>

        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div class="azCardSub" style="display:flex;align-items:center;gap:8px;">
            <span style="display:flex;align-items:center;">${azIcon("search")}</span>
            <span>Filters (${escapeHtml(String(recordData?.filtersCount ?? 0))})</span>
          </div>
          <button class="btn ghost" type="button" disabled style="border-radius:999px;">Filters</button>
        </div>

        <div style="margin-top:12px;">
          ${list.length ? list.map(s => `
            <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
              <div class="azCardTitle">${escapeHtml(safe(s.timeRange, "Shift"))}</div>
              <div class="azCardSub">${escapeHtml(safe(s.site, safe(s.location, "Site pending")))}</div>
              <div style="margin-top:10px;display:flex;gap:10px;">
                <button class="btn ghost" type="button" disabled style="border-radius:999px;min-width:120px;">View Details</button>
                <button class="btn ghost" type="button" disabled style="border-radius:999px;min-width:120px;">Actions</button>
              </div>
            </div>
          `).join("") : `
            <div class="muted" style="margin-top:10px;line-height:1.45;">
              There aren't any available shifts. Check back later or search another day.
            </div>
          `}
        </div>
      </div>
    `
  );
}

// ===============================
// PROGRESS + ONBOARDING (kept, no blanks)
// ===============================
function renderProgress(userData, recordData) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const appt = recordData?.appointment || userData?.appointment || {};

  const next = steps.find(s => !s.done);
  const nextLabel = next?.label ? `Next: ${next.label}` : "All steps completed";

  const stepsHtml = steps.map(s => `
    <div class="azCard" style="box-shadow:none;margin-top:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <div class="azCardTitle">${escapeHtml(s.label || "")}</div>
        <div class="azCardSub" style="margin-top:0;font-weight:1000;color:rgba(2,6,23,.55);">
          ${s.done ? "Completed" : "Pending"}
        </div>
      </div>
    </div>
  `).join("");

  setPage(
    "Progress",
    nextLabel,
    `
      <div class="azCard">
        ${sectionHeader("Your checklist")}
        ${stepsHtml || `<div class="muted">No steps yet.</div>`}
      </div>

      <div style="height:12px"></div>

      <div class="azCard">
        ${sectionHeader("Appointment")}
        <div class="kv" style="margin-top:0;">
          <div class="k">Date</div><div class="v">${escapeHtml(safe(appt.date, "Pending"))}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(safe(appt.time, "Pending"))}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(safe(appt.address, "Pending"))}</div>
          <div class="k">Notes</div><div class="v">${escapeHtml(safe(appt.notes, "—"))}</div>
        </div>
      </div>
    `
  );
}

function renderShiftSelection(userData, saveUserPatch) {
  const shift = userData?.shift || {};
  const pos = shift.position || "";
  const sh = shift.shift || "";

  setPage(
    "Shift Selection",
    "Choose your preferences (HR will confirm).",
    `
      <div class="ss-wrap">

        <!-- Intro / Why this matters -->
        <div class="ss-hero">
          <div class="ss-hero-title">Shift selection is required</div>
          <div class="ss-hero-sub">
            Select your position and shift preference. HR will review capacity and confirm your final assignment.
            This step must be completed to continue onboarding.
          </div>

          <div class="ss-badges">
            <span class="ss-badge">Warehouse / Production</span>
            <span class="ss-badge">HR Confirmation</span>
            <span class="ss-badge">Required Step</span>
          </div>
        </div>

        <!-- What to expect -->
        <div class="ss-card">
          <div class="ss-card-title">What to expect</div>
          <ul class="ss-list">
            <li>Preferences are submitted immediately.</li>
            <li>Final shift assignment depends on staffing, training seats, and business needs.</li>
            <li>HR may contact you if an alternate shift is needed.</li>
            <li>Once confirmed, your schedule will appear in the Schedule module.</li>
          </ul>
        </div>

        <!-- Position -->
        <div class="ss-card">
          <div class="ss-sec-head">
            <div class="ss-sec-title">Position Preference</div>
            <div class="ss-sec-sub">Choose 1 option</div>
          </div>

          <div class="ss-choice-col">
            ${posCard("assembler","Solar Panel Assembler","Hands-on assembly of solar panels.","$18–$23/hr",pos)}
            ${posCard("material","Material Handler / Warehouse","Moves materials, inventory support.","$18–$22/hr",pos)}
            ${posCard("qc","Quality Control / Inspection","Inspect panels for quality and safety.","$19–$23/hr",pos)}
          </div>

          <div class="ss-note">
            Note: Pay range shown is an estimate. Final pay is confirmed by HR based on experience and assignment.
          </div>
        </div>

        <!-- Shift -->
        <div class="ss-card">
          <div class="ss-sec-head">
            <div class="ss-sec-title">Shift Preference</div>
            <div class="ss-sec-sub">Choose 1 option</div>
          </div>

          <div class="ss-choice-col">
            ${shiftCard("early","Early Shift","6:00 AM – 2:30 PM",sh)}
            ${shiftCard("mid","Mid Shift","2:00 PM – 10:30 PM",sh)}
            ${shiftCard("late","Late Shift","10:00 PM – 6:30 AM",sh)}
          </div>

          <div class="ss-kv">
            <div class="k">Attendance</div>
            <div class="v">Arrive on time. Repeated tardiness may impact assignment.</div>

            <div class="k">Overtime</div>
            <div class="v">OT may be offered based on business needs and eligibility.</div>

            <div class="k">Training</div>
            <div class="v">Your first days include safety + role training. Shift choice affects training time slots.</div>
          </div>
        </div>

        <!-- Policies / Requirements -->
        <div class="ss-card">
          <div class="ss-card-title">Important requirements</div>
          <ul class="ss-list">
            <li>Bring required documents for I-9 on your first day (original, unexpired).</li>
            <li>Safety footwear is mandatory for operational roles (you will complete that step next).</li>
            <li>HR will confirm your start date/time and check-in instructions.</li>
            <li>Keep your contact information accurate for updates and confirmations.</li>
          </ul>

          <div class="ss-alert">
            <div class="ss-alert-title">Security</div>
            <div class="ss-alert-sub">
              Do not share your Employee ID or personal information by text message or social media.
            </div>
          </div>
        </div>

        <!-- Action -->
        <button class="btn primary ss-save" id="btnShiftSave" type="button">
          Save Preferences
        </button>

        <div class="ss-footnote">
          Preferences only — final assignment is confirmed by HR.
        </div>

        <!-- Confetti container (CSS handles visuals) -->
        <div id="ssConfetti" class="ss-confetti" aria-hidden="true"></div>

      </div>
    `
  );

  // ---------- MARKUP HELPERS (NO inline style) ----------
  function posCard(key, title, desc, pay, selectedKey) {
    const selected = selectedKey === key;
    return `
      <label class="ss-choice ${selected ? "is-selected" : ""}">
        <span class="ss-radio">
          <input type="radio" name="pos" value="${escapeHtml(key)}" ${selected ? "checked" : ""}/>
        </span>

        <span class="ss-choice-body">
          <span class="ss-choice-title">${escapeHtml(title)}</span>
          <span class="ss-choice-sub">${escapeHtml(desc)}</span>
          <span class="ss-choice-meta">Pay Range: ${escapeHtml(pay)}</span>
        </span>
      </label>
    `;
  }

  function shiftCard(key, title, hours, selectedKey) {
    const selected = selectedKey === key;
    return `
      <label class="ss-choice ${selected ? "is-selected" : ""}">
        <span class="ss-radio">
          <input type="radio" name="shift" value="${escapeHtml(key)}" ${selected ? "checked" : ""}/>
        </span>

        <span class="ss-choice-body">
          <span class="ss-choice-title">${escapeHtml(title)}</span>
          <span class="ss-choice-sub">${escapeHtml(hours)}</span>
        </span>
      </label>
    `;
  }

  // ---------- Save ----------
  const btn = document.getElementById("btnShiftSave");
  if (btn) {
    btn.onclick = async () => {
      const position = document.querySelector("input[name=pos]:checked")?.value || "";
      const shiftKey = document.querySelector("input[name=shift]:checked")?.value || "";

      if (!position || !shiftKey) {
        uiToast("Please select 1 position and 1 shift.");
        return;
      }

      // Complete step in Progress
      const steps = (userData.steps || []).map(s =>
        s.id === "shift_selection" ? ({ ...s, done: true }) : s
      );

      await saveUserPatch({
        shift: { position, shift: shiftKey },
        steps,
        stage: "footwear"
      });

      // UX: congrats + confetti
      uiToast("Preferences saved. HR will confirm your final assignment.");
      fireShiftConfetti();

      // Next step
      setTimeout(() => {
        location.hash = "#footwear";
      }, 700);
    };
  }

  function fireShiftConfetti() {
    const host = document.getElementById("ssConfetti");
    if (!host) return;

    // reset
    host.innerHTML = "";
    host.classList.remove("run");
    // build particles (CSS animates)
    const count = 26;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "ss-confetti-piece";
      p.style.setProperty("--i", String(i)); // (esto NO es estilo visual; solo variable de animación)
      host.appendChild(p);
    }
    host.classList.add("run");

    setTimeout(() => {
      host.classList.remove("run");
      host.innerHTML = "";
    }, 1400);
  }
}

}

function renderI9(userData, saveUserPatch) {
  const i9 = userData?.i9 || {};
  const done = !!(userData?.steps || []).find(s => s.id === "i9")?.done;

  setPage(
    "I-9 Documents",
    "Bring original, unexpired documents on your first day.",
    `
      <div class="azCard">
        <div class="alert info" style="margin-top:0;">
          You must bring original, unexpired documents on your first day.
        </div>

        <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;">
          <input type="checkbox" id="i9Ack" ${i9.ack ? "checked" : ""}/>
          <span style="font-size:13px;line-height:1.35;">
            I understand I must bring valid original documents on my first day of work to complete I-9 verification.
          </span>
        </label>

        <button class="btn primary" id="btnI9Save" type="button"
          style="margin-top:14px;width:100%;border-radius:16px;">
          ${done ? "Saved" : "Confirm"}
        </button>
      </div>
    `
  );

  document.getElementById("btnI9Save").onclick = async () => {
    const ack = document.getElementById("i9Ack").checked;
    if (!ack) return uiToast("Please acknowledge to continue.");

    const steps = (userData.steps || []).map(s =>
      s.id === "i9" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ i9: { ack: true }, steps });
    uiToast("I-9 confirmed.");
    location.hash = "#home";
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const fw = userData?.footwear || {};
  const steps = userData?.steps || [];
  const done = !!steps.find(s => s.id === "footwear")?.done;

  function ackRow(id, checked, text) {
    return `
      <label class="checkrow" style="
  display:flex;
  gap:12px;
  align-items:flex-start;
  margin-top:10px;
">
        <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked" : ""}/>
        <span style="font-size:13px;line-height:1.35;">${escapeHtml(text)}</span>
      </label>
    `;
  }

  setPage(
    fwPublic.programTitle || "Safety Footwear Program",
    "Safety footwear is required for warehouse and production roles.",
    `
      <div class="azCard">

        ${sectionHeader("Safety Footwear Requirement")}
        <div class="muted" style="line-height:1.55;">
          As part of warehouse onboarding and workplace safety compliance, approved safety footwear is a mandatory requirement for all operational employees.
          This requirement is necessary to:
          <ul class="ul" style="margin-top:8px;">
            <li>Complete onboarding</li>
            <li>Access operational areas</li>
            <li>Start work on your first day</li>
            <li>Maintain compliance with internal safety standards</li>
          </ul>
          Safety footwear is not optional.
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Mandatory for Your First Day")}
        <div class="muted" style="line-height:1.55;">
          You must report on your first day with approved safety footwear.
          Failure to meet this requirement may result in:
          <ul class="ul" style="margin-top:8px;">
            <li>Your start date being rescheduled</li>
            <li>Restricted access to work areas</li>
            <li>Temporary hold on operational onboarding</li>
            <li>Additional action based on internal policies</li>
          </ul>
          Our goal is to prevent injuries and protect every employee.
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Safety Footwear Standard")}
        <div class="muted" style="line-height:1.55;">
          Your footwear must meet all of the following:
          <ul class="ul" style="margin-top:8px;">
            <li>Protective toe (Steel Toe or Composite Toe)</li>
            <li>Slip-resistant sole</li>
            <li>Closed-toe work shoes or work boots</li>
            <li>New or in excellent condition</li>
            <li>Suitable for an industrial / warehouse environment</li>
          </ul>

          Not allowed:
          <ul class="ul" style="margin-top:8px;">
            <li>Regular athletic sneakers</li>
            <li>Sandals or open-toe shoes</li>
            <li>Shoes without toe protection</li>
            <li>Heavily worn or damaged footwear</li>
          </ul>
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Required Purchase Process")}
        <div class="muted" style="line-height:1.55;">
          To ensure compliance with safety standards, employees must purchase footwear through the Safety Footwear Store available in the portal.
          Required steps:
          <ul class="ul" style="margin-top:8px;">
            <li>Open the store from the portal</li>
            <li>Select an approved model</li>
            <li>Complete your purchase</li>
            <li>Keep your receipt</li>
            <li>Have the footwear before your first day</li>
          </ul>
          Completing this step is part of onboarding.
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Safety Footwear Reimbursement Policy")}
        <div class="muted" style="line-height:1.55;">
          The company offers reimbursement up to <strong>$100</strong> to support compliance with this safety requirement.

          <div style="height:10px"></div>

          <strong>Eligibility</strong>
          <ul class="ul" style="margin-top:8px;">
            <li>You have been officially hired</li>
            <li>You have started active work</li>
            <li>Your footwear meets the safety standard</li>
            <li>Your supervisor confirms usage on the job</li>
            <li>You provide a valid receipt</li>
            <li>You are active at the time payroll is processed</li>
          </ul>

          <div style="height:10px"></div>

          <strong>Reimbursement Processing</strong>
          <ul class="ul" style="margin-top:8px;">
            <li>Processed through payroll</li>
            <li>Typically appears on the first regular paycheck after verification</li>
            <li>Maximum reimbursement is $100</li>
            <li>Any amount above $100 is the employee’s responsibility</li>
          </ul>

          <div style="height:10px"></div>

          <strong>Corporate Notes</strong>
          <ul class="ul" style="margin-top:8px;">
            <li>One-time benefit upon initial hire</li>
            <li>Not a recurring benefit</li>
            <li>Not considered additional wages</li>
            <li>Subject to administrative verification</li>
            <li>The company reserves the right to validate compliance</li>
          </ul>
        </div>

        <div style="height:14px"></div>

        ${sectionHeader("Acknowledgements")}
        ${ackRow("fwAck1", fw.ack1, "I understand safety footwear is required for my role.")}
        ${ackRow("fwAck2", fw.ack2, "I will purchase approved footwear before my first shift.")}
        ${ackRow("fwAck3", fw.ack3, "I understand purchases must be made through the designated store to qualify.")}
        ${ackRow("fwAck4", fw.ack4, "I understand reimbursement is processed after verification.")}
        ${ackRow("fwAck5", fw.ack5, "I understand reimbursement will be included in my first paycheck after approval.")}

        <div style="height:14px"></div>

        <button class="btn primary" id="btnFootwearComplete" type="button"
  style="display:block;width:100%;text-align:center;border-radius:16px;padding:14px;">
  Complete Safety Footwear Requirement
</button>
       
        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          This step is required to complete your onboarding.
        </div>

        <div style="height:14px"></div>

        <div class="small muted" style="line-height:1.35;">
          Security note: Do not share your Employee ID or personal info by text message.
        </div>

      </div>
    `
  );

  const btn = document.getElementById("btnFootwearComplete");

const shopUrl = (fwPublic && fwPublic.shopUrl) ? String(fwPublic.shopUrl) : "";
const visited = localStorage.getItem("fwShopVisited") === "1";
  
 const syncBtn = () => {
  const a1 = document.getElementById("fwAck1")?.checked;
  const a2 = document.getElementById("fwAck2")?.checked;
  const a3 = document.getElementById("fwAck3")?.checked;
  const a4 = document.getElementById("fwAck4")?.checked;
  const a5 = document.getElementById("fwAck5")?.checked;

  const allAcks = !!(a1 && a2 && a3 && a4 && a5);

  if (btn) {
    btn.disabled = !allAcks;
    btn.style.opacity = allAcks ? "1" : ".75";
  }
};
  ["fwAck1", "fwAck2", "fwAck3", "fwAck4", "fwAck5"].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.addEventListener("change", syncBtn);
  });

  syncBtn();

  if (btn) {
  btn.onclick = async () => {

  const a1 = document.getElementById("fwAck1").checked;
  const a2 = document.getElementById("fwAck2").checked;
  const a3 = document.getElementById("fwAck3").checked;
  const a4 = document.getElementById("fwAck4").checked;
  const a5 = document.getElementById("fwAck5").checked;

  if (!a1 || !a2 || !a3 || !a4 || !a5) {
    uiToast("Confirm all items first.");
    return;
  }

  const visited = localStorage.getItem("fwShopVisited");

  // 👉 PRIMER TOQUE = abrir tienda
  if (!visited) {
    localStorage.setItem("fwShopVisited", "1");
    window.open(fwPublic.shopUrl, "_blank");
    return;
  }

  // 👉 SEGUNDO TOQUE = completar step
  const newSteps = (steps || []).map(s =>
    s.id === "footwear" ? ({ ...s, done: true }) : s
  );

  await saveUserPatch({
    footwear: { ack1:a1, ack2:a2, ack3:a3, ack4:a4, ack5:a5 },
    steps: newSteps,
    stage: "i9"
  });

  uiToast("Footwear requirement completed.");
  location.hash = "#i9";
};
  }
}

function renderFootwearShop(publicData) {
  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const url = fwPublic.shopUrl || "";

  setPage(
    "Safety Footwear Shop",
    "In-app store view.",
    `
      <div class="azCard">
        ${sectionHeader("Shop Approved Footwear", "Secure")}

        <div class="muted" style="line-height:1.45;">
          If the in-app view is blocked by the store's security settings, use "Open in Browser".
        </div>

        <div style="height:12px"></div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="btn ghost" href="#footwear" style="border-radius:14px;">Back</a>
        </div>

        <div style="height:12px"></div>

        ${
          url
            ? `
              <div style="border:1px solid rgba(229,234,242,.95);border-radius:18px;overflow:hidden;height:70vh;background:#fff;">
                <iframe
                  src="${escapeHtml(url)}"
                  style="width:100%;height:100%;border:0;"
                  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  referrerpolicy="no-referrer"
                ></iframe>
              </div>
            `
            : `<div class="alert warn" style="margin-top:0;">Shop URL is not set by admin yet.</div>`
        }
      </div>
    `
  );
}

function renderDocumentsLocked() {
  setPage(
    "Documents",
    "Completed in person on your first day.",
    `
      <div class="azCard">
        <div class="alert warn" style="margin-top:0;">
          This step is completed in person on your first day.
        </div>
        <div class="muted" style="line-height:1.45;">
          HR will review and finalize onboarding documents at the warehouse.
        </div>
      </div>
    `
  );
}

function renderFirstDayLocked(userData, recordData) {
  const appt = recordData?.appointment || userData?.appointment || {};
  setPage(
    "First Day",
    "Check-in details and instructions.",
    `
      <div class="azCard">
        ${sectionHeader("Check-In Information")}
        <div class="kv" style="margin-top:0;">
          <div class="k">Start Date</div><div class="v">${escapeHtml(safe(appt.date, "To be provided by HR"))}</div>
          <div class="k">Check-In Time</div><div class="v">${escapeHtml(safe(appt.time, "To be provided by HR"))}</div>
          <div class="k">Facility Location</div><div class="v">${escapeHtml(safe(appt.address, "To be provided by HR"))}</div>
          <div class="k">Notes</div><div class="v">${escapeHtml(safe(appt.notes, "—"))}</div>
        </div>

        <div style="height:12px"></div>
        <div class="alert warn" style="margin-top:0;">
          First Day Preparation is completed in person.
        </div>
      </div>
    `
  );
}

// ===============================
// PAY / BENEFITS / HOURS / DEPOSIT / NOTIFS / HELP
// ===============================
function renderPayroll(recordData) {
  const items = Array.isArray(recordData?.payroll) ? recordData.payroll : [];

  setPage(
    "Payroll",
    "Pay stubs and pay periods.",
    `
      <div class="azCard">
        ${sectionHeader("Pay Stubs")}
        <div class="muted" style="line-height:1.45;">
          Pay stubs will appear here once uploaded by payroll.
        </div>

        <div style="margin-top:10px;">
          ${items.length ? items.map(p => `
            <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div class="azCardTitle">Pay Date: ${escapeHtml(p.payDate || "—")}</div>
                <div class="azCardSub" style="margin-top:0;font-weight:1000;">${escapeHtml(p.status || "stub")}</div>
              </div>
              <div class="azCardSub" style="margin-top:8px;">
                Period: ${escapeHtml((p.periodStart || "—") + " → " + (p.periodEnd || "—"))}
              </div>

              <button class="btn ghost" type="button" disabled style="margin-top:12px;width:100%;border-radius:16px;">
                View Pay Stub (enabled by HR)
              </button>
            </div>
          `).join("") : `
            <div class="muted" style="margin-top:12px;">No pay stubs yet.</div>
          `}
        </div>
      </div>
    `
  );
}

function renderTimeOff(recordData) {
  const reqs = Array.isArray(recordData?.timeOffRequests) ? recordData.timeOffRequests : [];

  setPage(
    "Time Off & Leave",
    "Requests and approvals.",
    `
      <div class="azCard">
        ${sectionHeader("Your Requests")}
        <div class="muted" style="line-height:1.45;">
          Requests will appear here with status (pending/approved/denied).
        </div>

        <div style="margin-top:10px;">
          ${reqs.length ? reqs.map(r => `
            <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
              <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                <div class="azCardTitle">${escapeHtml(r.type || "Time Off")}</div>
                <div class="azCardSub" style="margin-top:0;font-weight:1000;">${escapeHtml(r.status || "pending")}</div>
              </div>
              <div class="azCardSub" style="margin-top:8px;">
                ${escapeHtml((r.startDate || "—") + " → " + (r.endDate || "—"))}
              </div>
              ${r.reason ? `<div class="azCardSub" style="margin-top:8px;line-height:1.35;">${escapeHtml(r.reason)}</div>` : ""}
            </div>
          `).join("") : `
            <div class="muted" style="margin-top:12px;">No requests yet.</div>
          `}
        </div>
      </div>
    `
  );
}

function renderHours(recordData) {
  const items = Array.isArray(recordData?.hours) ? recordData.hours : [];
  setPage(
    "My Hours",
    "Weekly summary.",
    `
      <div class="azCard">
        ${sectionHeader("Weekly Hours")}
        <div class="muted" style="line-height:1.45;">
          Your posted hours will appear here.
        </div>

        <div style="margin-top:10px;">
          ${items.length ? items.map(h => `
            <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
              <div class="azCardTitle">Week of ${escapeHtml(h.weekStart || "—")}</div>
              <div class="azCardSub" style="margin-top:8px;">
                Total: ${escapeHtml(String(h.totalHours ?? "—"))}
                • Overtime: ${escapeHtml(String(h.overtime ?? "—"))}
              </div>
            </div>
          `).join("") : `
            <div class="muted" style="margin-top:12px;">No hours posted yet.</div>
          `}
        </div>
      </div>
    `
  );
}

function renderDeposit(recordData) {
  const d = recordData?.deposit || {};
  setPage(
    "Direct Deposit",
    "Banking info (view only).",
    `
      <div class="azCard">
        ${sectionHeader("Banking Information")}
        <div class="alert info" style="margin-top:0;">
          Contact HR to update banking information.
        </div>

        <div class="kv" style="margin-top:10px;">
          <div class="k">Bank</div><div class="v">${escapeHtml(safe(d.bankName, "Pending"))}</div>
          <div class="k">Account</div>
          <div class="v">${escapeHtml(safe(d.last4Account ? "****" + d.last4Account : "", "Pending"))}</div>
        </div>

        <div class="small muted" style="margin-top:12px;line-height:1.35;">
          For security, do not send account numbers by text message.
        </div>
      </div>
    `
  );
}

function renderNotifications(userData, recordData, publicData) {
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const recordNotifs = Array.isArray(recordData?.notifications) ? recordData.notifications : [];
  const globalN = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];

  const merged = [
    ...globalN.map(x => ({ ...x, _scope: "company" })),
    ...recordNotifs.map(x => ({ ...x, _scope: "hr" })),
    ...personal.map(x => ({ ...x, _scope: "you" }))
  ];

  setPage(
    "Notifications",
    "Updates and reminders.",
    `
      <div class="azCard">
        ${sectionHeader("Inbox")}
        ${merged.length ? merged.map(n => `
          <div class="azCard" style="box-shadow:none;border-radius:14px;margin-top:10px;">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div class="azCardTitle">${escapeHtml(n.title || "Update")}</div>
              <div class="azCardSub" style="margin-top:0;font-weight:1000;">
                ${escapeHtml(n._scope === "company" ? "Company" : n._scope === "hr" ? "HR" : "You")}
              </div>
            </div>
            <div class="azCardSub" style="margin-top:10px;line-height:1.45;">${escapeHtml(n.body || "")}</div>
            <div style="margin-top:12px;">
              <a class="btn ghost" href="#${escapeHtml(n.route || "home")}"
                style="border-radius:16px; width:100%; text-align:center;">
                ${escapeHtml(n.action || "Open")}
              </a>
            </div>
          </div>
        `).join("") : `<div class="muted">No notifications</div>`}
      </div>
    `
  );
}

function renderHelp(publicData, empId, user) {
  const h = publicData?.help || defaultPublicContent().help;
  const site = publicData?.site || defaultPublicContent().site;

  setPage(
    "Help & Support",
    "Get assistance fast.",
    `
      <div class="azCard">
        ${sectionHeader("We’re here to help.")}
        <div class="muted" style="line-height:1.45;">
          Choose the option below and we’ll get you taken care of.
        </div>

        <a class="btn ghost" href="${escapeHtml(telLink(h.phone))}" style="display:block;width:100%;border-radius:16px;margin-top:10px;">
          Call HR
        </a>
        <a class="btn ghost" href="${escapeHtml(`mailto:${h.email}?subject=${encodeURIComponent("Employee Portal Help")}`)}" style="display:block;width:100%;border-radius:16px;margin-top:10px;">
          Email HR
        </a>
        <a class="btn ghost" href="#help-ticket" style="display:block;width:100%;border-radius:16px;margin-top:10px;">
          Open a Support Ticket
        </a>

        <div style="height:12px"></div>
        <div class="alert info" style="margin-top:0;">
          Do not share your Employee ID or personal information by text message.
        </div>
      </div>

      <div id="help-ticket" class="azCard" style="margin-top:12px;">
        ${sectionHeader("Support Ticket")}
        <div class="muted" style="line-height:1.45;">
          Describe the issue and we’ll follow up as soon as possible.
        </div>

        <div style="height:10px"></div>

        <label class="lbl">What do you need help with?</label>
        <textarea id="t_msg" class="inp" rows="4" placeholder="Type your issue here..."></textarea>

        <div class="grid2" style="margin-top:10px;">
          <div>
            <label class="lbl">Category</label>
            <select id="t_cat" class="inp">
              <option>Payroll</option>
              <option>Schedule</option>
              <option>Portal Access</option>
              <option>Documents</option>
              <option>Safety Footwear</option>
              <option>Direct Deposit</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label class="lbl">Priority</label>
            <select id="t_pri" class="inp">
              <option>Normal</option>
              <option>Urgent</option>
            </select>
          </div>
        </div>

        <button class="btn primary" id="btnTicket" type="button" style="margin-top:12px;width:100%;border-radius:16px;">
          Submit Ticket
        </button>

        <div class="small muted" id="ticketMsg" style="margin-top:10px;"></div>
      </div>

      <div class="azCard" style="margin-top:12px;">
        ${sectionHeader("Emergencies / Safety")}
        <div class="alert warn" style="margin-top:0;">For immediate danger or medical emergencies, call 911.</div>
        <a class="btn ghost" href="tel:911" style="display:block;width:100%;border-radius:16px;margin-top:10px;">Emergency</a>
        <a class="btn ghost" href="${escapeHtml(telLink(site.safetyPhone))}" style="display:block;width:100%;border-radius:16px;margin-top:10px;">Safety / Supervisor</a>
        <a class="btn ghost" href="${escapeHtml(telLink(site.managerPhone))}" style="display:block;width:100%;border-radius:16px;margin-top:10px;">Site Manager</a>
        ${site.address ? `<div class="muted" style="margin-top:10px;line-height:1.45;">Site Address: ${escapeHtml(site.address)}</div>` : ""}
      </div>
    `
  );

  const btn = document.getElementById("btnTicket");
  if (btn && btn.dataset.wired !== "1") {
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      try {
        const msg = (document.getElementById("t_msg")?.value || "").trim();
        const cat = (document.getElementById("t_cat")?.value || "Other").trim();
        const pri = (document.getElementById("t_pri")?.value || "Normal").trim();
        const out = document.getElementById("ticketMsg");

        if (!msg) {
          if (out) out.textContent = "Please describe what you need help with.";
          return;
        }

        if (!isFirebaseConfigured()) {
          if (out) out.textContent = "Preview mode: ticket not sent.";
          return;
        }

        await addDoc(TICKETS_COL(), {
          employeeId: empId || "",
          userUid: user?.uid || "",
          userEmail: user?.email || "",
          category: cat,
          priority: pri,
          message: msg,
          status: "open",
          createdAt: serverTimestamp()
        });

        if (out) out.textContent = "Ticket submitted. HR will respond within 24 business hours.";
        uiToast("Ticket submitted.");
        document.getElementById("t_msg").value = "";
      } catch (e) {
        uiToast(e?.message || String(e));
        const out = document.getElementById("ticketMsg");
        if (out) out.textContent = e?.message || String(e);
      }
    };
  }
}

// ===============================
// ROUTER
// ===============================
function renderRoute(userData, saveUserPatch, publicData, recordData, ctx) {
  const sb = document.getElementById("stagebar");
  if (sb) sb.innerHTML = "";

  const r = routeName();

  if (r === "progress") renderStagebar(userData);

  switch (r) {
    // A-to-Z entry
    case "home":              return renderHome(publicData, recordData, userData);

    // schedule family
    case "schedule":          return renderMySchedule(recordData);
    case "schedule-timecard": return renderTimecard(recordData);
    case "schedule-findshifts": return renderFindShifts(recordData);

    // onboarding
    case "progress":          return renderProgress(userData, recordData);
    case "shift":
    case "shift_selection":   return renderShiftSelection(userData, saveUserPatch);
    case "footwear":          return renderFootwear(userData, saveUserPatch, publicData);
    case "footwearshop":      return renderFootwearShop(publicData);
    case "i9":                return renderI9(userData, saveUserPatch);
    case "documents":
    case "docs":              return renderDocumentsLocked();
    case "firstday":
    case "first_day":         return renderFirstDayLocked(userData, recordData);

    // modules
    case "hours":             return renderHours(recordData);
    case "payroll":           return renderPayroll(recordData);
    case "timeoff":           return renderTimeOff(recordData);
    case "deposit":           return renderDeposit(recordData);

    case "notifications":     return renderNotifications(userData, recordData, publicData);
    case "help":              return renderHelp(publicData, ctx?.empId, ctx?.user);

    default:
      location.hash = "#home";
      return;
  }
}

// ===============================
// INIT
// ===============================
export async function initEmployeeApp() {
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusShift");
  const adminBtn = document.getElementById("btnAdminGo");

  ensureChromeOnce();
  setActiveTabsAndSidebar();

  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview");
    if (statusChip) uiSetText(statusChip, "offline");
    if (adminBtn) adminBtn.style.display = "none";

    const demoUser = defaultUserDoc({ email: "preview@demo", displayName: "Preview" });
    const demoPublic = defaultPublicContent();

    // demo record so NOTHING looks empty
    const demoRecord = {
      findShiftsText: "5 shifts available",
      vtoText: "No VTO available at the moment",
      filtersCount: 2,
      lastClockedIn: "—",
      maxHours: { max: 60, scheduledMinutes: 25 * 60 + 58 },
      punchesToday: [{ type: "In", date: nowISODate(), time: "03:02 PM" }],
      scheduleEvents: [
        { date: nowISODate(), start: "9:00 AM", end: "1:00 PM", role: "Warehouse", location: "Site", status: "Scheduled" }
      ],
      punches: [
        { type: "In", date: nowISODate(), time: "7:30 AM" },
        { type: "Out", date: nowISODate(), time: "10:54 AM" }
      ],
      missedPunch: false,
      availableShifts: []
    };

    const ctx = { empId: "PREVIEW", user: { uid: "preview", email: "preview@demo" } };

    if (!location.hash) location.hash = "#home";

    renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx);
    setActiveTabsAndSidebar();

    window.addEventListener("hashchange", () => {
      renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx);
      setActiveTabsAndSidebar();
    });

    window.addEventListener("resize", () => {
      applyChromeVisibility();
      setActiveTabsAndSidebar();
    });

    return;
  }

  onAuth(async (user) => {
    try {
      if (!user) { window.location.href = "./index.html"; return; }

      if (statusChip) {
        uiSetText(statusChip, "online");
        statusChip.classList.add("ok");
      }

      const admin = await isAdminUser(user);
      if (adminBtn) adminBtn.style.display = admin ? "" : "none";

      await ensureUserDocExists(user);

      const empId = await ensureEmployeeId(user);
      uiSetText(badge, empId);

      const userRef = doc(db, "users", user.uid);
      const recordRef = RECORD_DOC(empId);
      const publicRef = PUBLIC_DOC();

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      let currentUserData = null;
      let currentPublicData = defaultPublicContent();
      let currentRecordData = {}; // employeeRecords/{SP###}
      const ctx = { empId, user };

      const rerender = () => {
        if (!currentUserData) return;
        ensureChromeOnce();
        applyChromeVisibility();
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        setActiveTabsAndSidebar();
      };

      // portal/public
      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists()
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        rerender();
      });

      // employeeRecords/{SP###}
      onSnapshot(recordRef, async (snap) => {
        currentRecordData = snap.exists() ? (snap.data() || {}) : {};

        // optional: copy appointment once if user doc has none
        try {
          const u = await getDoc(userRef);
          const ud = u.exists() ? u.data() : {};
          const userHasAppt = !!(ud?.appointment && (ud.appointment.date || ud.appointment.time || ud.appointment.address));
          const recAppt = currentRecordData?.appointment || null;
          const recHasAppt = !!(recAppt && (recAppt.date || recAppt.time || recAppt.address));
          if (!userHasAppt && recHasAppt) {
            await setDoc(userRef, { appointment: recAppt, updatedAt: serverTimestamp() }, { merge: true });
          }
        } catch {}
        rerender();
      });

      // users/{uid}
      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() || {};
        const base = defaultUserDoc(user);

        // merge steps (upgrade older ids)
        let mergedSteps = Array.isArray(d.steps) ? d.steps : [];
        if (!Array.isArray(d.steps) || d.steps.length < base.steps.length) {
          const old = Array.isArray(d.steps) ? d.steps : [];
          mergedSteps = base.steps.map(s => {
            const o =
              old.find(x => x.id === s.id) ||
              (s.id === "documents" ? old.find(x => x.id === "docs") : null) ||
              (s.id === "firstday" ? old.find(x => x.id === "first_day") : null);
            return o ? { ...s, done: !!o.done, label: s.label } : s;
          });
        }

        const fw = (d.footwear && typeof d.footwear === "object") ? d.footwear : {};
        const footwearMerged = {
          ack1: !!fw.ack1,
          ack2: !!fw.ack2,
          ack3: !!fw.ack3,
          ack4: !!fw.ack4,
          ack5: !!fw.ack5
        };

        currentUserData = {
          ...base,
          ...d,
          steps: mergedSteps,
          appointment: (d.appointment && typeof d.appointment === "object") ? d.appointment : base.appointment,
          shift: (d.shift && typeof d.shift === "object") ? d.shift : base.shift,
          footwear: footwearMerged,
          i9: (d.i9 && typeof d.i9 === "object") ? d.i9 : base.i9,
          notifications: Array.isArray(d.notifications) ? d.notifications : base.notifications
        };

        if (!location.hash) location.hash = "#home";
        rerender();
      });

      window.addEventListener("hashchange", rerender);
      window.addEventListener("resize", () => {
        applyChromeVisibility();
        setActiveTabsAndSidebar();
      });

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}

// ===== FIX DEFINITIVO iOS: scroll en #azMoreSheet NO debe disparar tap al soltar =====
(function () {
  let scrolled = false;
  let ignoreClicksUntil = 0;

  // Marca cuando el sheet realmente scrolleó (esto SIEMPRE funciona en iOS)
  document.addEventListener("scroll", (e) => {
    const sheet = document.getElementById("azMoreSheet");
    if (!sheet) return;
    if (e.target === sheet) scrolled = true;
  }, true);

  // En cuanto empieza un gesto dentro del sheet, resetea flag
  document.addEventListener("touchstart", (e) => {
    if (!e.target.closest("#azMoreSheet")) return;
    scrolled = false;
  }, { passive: true });

  // Si hubo scroll durante el gesto, bloquea clicks por un momento
  document.addEventListener("touchend", (e) => {
    if (!e.target.closest("#azMoreSheet")) return;
    if (scrolled) ignoreClicksUntil = Date.now() + 500; // ventana anti “tap fantasma”
    scrolled = false;
  }, { passive: true });

  // Captura clicks en links del sheet y los cancela si venimos de scroll
  document.addEventListener("click", (e) => {
    const link = e.target.closest("#azMoreSheet a");
    if (!link) return;

    if (Date.now() < ignoreClicksUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return false;
    }
  }, true);
})();
