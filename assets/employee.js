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
  serverTimestamp, collection, addDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Firestore refs ----------
const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const TICKETS_COL = () => collection(db, "supportTickets");
const CHAT_COL = () => collection(db, "companyChat");

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

function fmtDateTime(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return String(d || "");
    return x.toLocaleString(undefined, { 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
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

// ---------- Confetti Effect ----------
function triggerConfetti() {
  const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position:absolute;
      width:10px;
      height:10px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      left:${Math.random() * 100}%;
      top:-10px;
      border-radius:2px;
      animation:confetti-fall ${1 + Math.random()}s ease-out forwards;
    `;
    container.appendChild(confetti);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes confetti-fall {
      to { transform:translateY(100vh) rotate(720deg); opacity:0; }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    container.remove();
    style.remove();
  }, 2000);
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
      text: "We're here to help. Choose an option below and we'll get you taken care of."
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
      { id: "documents", label: "Complete Onboarding Documents", done: false },
      { id: "firstday", label: "First Day Preparation", done: false }
    ],

    shift: { position: "", shift: "", shiftStartDate: "", supervisor: "" },
    shiftChangeRequests: [],
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
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`,
    check: `<svg ${common}><path d="M20 6L9 17l-5-5"/></svg>`,
    info: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>`,
    alert: `<svg ${common}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    sun: `<svg ${common}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    moon: `<svg ${common}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    star: `<svg ${common}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    briefcase: `<svg ${common}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    user: `<svg ${common}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    file: `<svg ${common}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    edit: `<svg ${common}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    calendar: `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    lock: `<svg ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    unlock: `<svg ${common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>`,
    checkCircle: `<svg ${common}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    send: `<svg ${common}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
  };
  return icons[name] || icons.dots;
}

function ensureChromeOnce() {
  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) btnMenu.style.display = "none";

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (document.getElementById("azTabs")) {
    applyChromeVisibility();
    const ov = document.getElementById("azMoreOverlay");
    const sh = document.getElementById("azMoreSheet");
    if (ov) { ov.style.display = "none"; ov.style.pointerEvents = "none"; }
    if (sh) sh.classList.remove("open");
    return;
  }

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

      <a class="azMoreItem" href="#messages">
        <div>
          <div>Messages</div>
          <div class="sub">Chat with HR / Admin</div>
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

    sh.addEventListener("touchend", (e) => {
      const endTop = sh.scrollTop;
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - sx);
      const dy = Math.abs(t.clientY - sy);
      const dScroll = Math.abs(endTop - startTop);

      if (dScroll > 2 || dx > 10 || dy > 10) {
        ignoreUntil = Date.now() + 600;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return false;
      }
    }, true);

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
    ov.style.pointerEvents = "none";
  };

  azMoreClose();

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
// ENHANCED HOME - REAL EMPLOYEE PORTAL FEATURES
// ===============================
function renderHome(publicData, recordData, userData, ctx) {
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;

  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;

  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);
  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);

  // Get next pending step for home display
  const steps = userData?.steps || [];
  const nextStep = steps.find(s => !s.done && s.id !== "application");
  const completedCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;

  // Quick stats for home
  const unreadNotifications = (userData?.notifications || []).filter(n => !n.read).length;
  const unreadMessages = (recordData?.unreadMessages || 0);
  const upcomingShifts = (recordData?.upcomingShifts || []).length;
  const pendingRequests = (recordData?.pendingRequests || 0);

  setPage(
    "Home",
    "",
    `
      <div class="azTopRow">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-weight:1000;color:rgba(2,6,23,.75);">Sun-Power</div>
          <span style="background:rgba(29,78,216,.10);color:rgba(29,78,216,1);padding:4px 10px;border-radius:999px;font-size:11px;font-weight:900;">${escapeHtml(ctx?.empId || "")}</span>
        </div>
        <div class="azTopIcons">
          <a class="azIconBtn" href="#messages" aria-label="Messages" style="position:relative;">
            ${azIcon("chat")}
            ${unreadMessages > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;background:#ef4444;color:#fff;border-radius:999px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:900;">${unreadMessages}</span>` : ''}
          </a>
          <a class="azIconBtn" href="#notifications" aria-label="Notifications" style="position:relative;">
            ${azIcon("bell")}
            ${unreadNotifications > 0 ? `<span style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;background:#ef4444;color:#fff;border-radius:999px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:900;">${unreadNotifications}</span>` : ''}
          </a>
        </div>
      </div>

      ${nextStep ? `
        <div class="azCard" style="background:linear-gradient(135deg,rgba(29,78,216,.06),rgba(22,163,74,.06));border-color:rgba(29,78,216,.20);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:40px;height:40px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
              ${azIcon("briefcase")}
            </div>
            <div>
              <div class="azCardTitle">Complete Your Onboarding</div>
              <div class="azCardSub">${completedCount} of ${totalCount} steps done</div>
            </div>
          </div>
          <div style="height:8px;background:rgba(2,6,23,.08);border-radius:999px;overflow:hidden;margin-bottom:12px;">
            <div style="height:100%;width:${(completedCount/totalCount)*100}%;background:linear-gradient(90deg,rgba(29,78,216,.6),rgba(22,163,74,.6));border-radius:999px;transition:width .3s ease;"></div>
          </div>
          <a class="azCardLink" href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}">
            <span>Continue: ${escapeHtml(nextStep.label)}</span>
            ${azIcon("chevR")}
          </a>
        </div>
        <div style="height:10px"></div>
      ` : ''}

      <!-- Quick Actions Grid -->
      <div class="azQuickGrid" style="margin-bottom:10px;">
        <a class="azQuick" href="#schedule">
          <div class="azQuickTop">
            <div class="azQuickIcon">${azIcon("calendar")}</div>
            <div style="color:rgba(2,6,23,.40);">${azIcon("chevR")}</div>
          </div>
          <div>
            <div>My Schedule</div>
            <div class="azQuickSub">${upcomingShifts > 0 ? `${upcomingShifts} upcoming` : 'View shifts'}</div>
          </div>
        </a>
        
        <a class="azQuick" href="#payroll">
          <div class="azQuickTop">
            <div class="azQuickIcon">${azIcon("pay")}</div>
            <div style="color:rgba(2,6,23,.40);">${azIcon("chevR")}</div>
          </div>
          <div>
            <div>Pay Stubs</div>
            <div class="azQuickSub">View payments</div>
          </div>
        </a>
        
        <a class="azQuick" href="#timeoff">
          <div class="azQuickTop">
            <div class="azQuickIcon">${azIcon("benefits")}</div>
            <div style="color:rgba(2,6,23,.40);">${azIcon("chevR")}</div>
          </div>
          <div>
            <div>Time Off</div>
            <div class="azQuickSub">${pendingRequests > 0 ? `${pendingRequests} pending` : 'Request leave'}</div>
          </div>
        </a>
      </div>

      <!-- Company News / Announcements -->
      <div class="azHero" style="margin-bottom:10px;">
        <div class="azHeroInner">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="background:rgba(22,163,74,.12);color:#166534;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:900;">ANNOUNCEMENT</span>
            <span style="font-size:11px;color:rgba(2,6,23,.50);font-weight:900;">Today</span>
          </div>
          <div class="azHeroTitle">${escapeHtml(news?.[0]?.title || "Company Updates")}</div>
          <div class="azHeroSub">${escapeHtml(news?.[0]?.subtitle || "Stay informed with the latest news and resources")}</div>
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

      <!-- Today's Status Card -->
      <div class="azCard" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div class="azCardTitle">Today's Status</div>
          <span style="background:rgba(22,163,74,.12);color:#166534;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:900;">Active</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
          <div style="padding:12px;background:rgba(2,6,23,.03);border-radius:12px;border:1px solid rgba(229,234,242,.95);">
            <div style="font-size:11px;color:rgba(2,6,23,.55);font-weight:900;margin-bottom:4px;">PUNCHES TODAY</div>
            <div style="font-size:20px;font-weight:1000;color:rgba(2,6,23,.85);">${punchesCount}</div>
          </div>
          <div style="padding:12px;background:rgba(2,6,23,.03);border-radius:12px;border:1px solid rgba(229,234,242,.95);">
            <div style="font-size:11px;color:rgba(2,6,23,.55);font-weight:900;margin-bottom:4px;">HOURS SCHEDULED</div>
            <div style="font-size:20px;font-weight:1000;color:rgba(2,6,23,.85);">${Math.floor(scheduledMin/60)}h ${String(scheduledMin%60).padStart(2,'0')}m</div>
          </div>
        </div>
        ${punchesCount > 0 ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(229,234,242,.95);">
            <div style="font-size:12px;color:rgba(2,6,23,.60);font-weight:900;">
              Last: ${escapeHtml(safe(recordData?.lastClockedIn, "—"))}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Hours Progress -->
      <div class="azCard" style="margin-bottom:10px;">
        <div class="azCardTitle">Weekly Hours Progress</div>
        <div class="azCardSub" style="margin-top:8px;">
          ${escapeHtml(Math.floor(scheduledMin / 60))}h ${escapeHtml(String(scheduledMin % 60).padStart(2,"0"))}m of ${escapeHtml(String(maxHours))}h scheduled
          <span style="float:right;font-weight:1000;color:rgba(29,78,216,1);">${pct.toFixed(0)}%</span>
        </div>
        <div class="azBar" style="margin-top:10px;"><div style="width:${pct.toFixed(0)}%;background:linear-gradient(90deg,rgba(29,78,216,.7),rgba(22,163,74,.7));"></div></div>
        <div style="margin-top:10px;display:flex;justify-content:space-between;font-size:11px;color:rgba(2,6,23,.55);font-weight:900;">
          <span>${escapeHtml(Math.floor(remainingMin / 60))}h ${escapeHtml(String(remainingMin % 60).padStart(2,"0"))}m remaining</span>
          <span>Resets ${fmtDate(new Date(Date.now() + 7*24*60*60*1000))}</span>
        </div>
      </div>

      <!-- Quick Access Row -->
      <div class="azRow2" style="margin-bottom:10px;">
        ${azCard(
          "Find shifts",
          safe(recordData?.findShiftsText, "No shifts available at the moment"),
          "View more",
          "#schedule-findshifts"
        )}
        ${azCard(
          "VTO",
          safe(recordData?.vtoText, "No VTO available at the moment"),
          "Check status",
          "#schedule"
        )}
      </div>

      <!-- Time Off Card -->
      <div class="azCard" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div class="azCardTitle">Time off & leave</div>
            <div class="azCardSub">Manage your requests and balance</div>
          </div>
          <a class="azIconBtn" href="#timeoff" style="width:44px;height:44px;border-radius:16px;">
            ${azIcon("chevR")}
          </a>
        </div>
      </div>

      <!-- Messages Preview -->
      <div class="azCard" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div class="azCardTitle">Recent Messages</div>
          <a href="#messages" style="font-size:12px;color:rgba(29,78,216,1);font-weight:1000;text-decoration:none;">View all</a>
        </div>
        <div id="homeMessagesPreview" style="min-height:60px;">
          <div class="muted" style="line-height:1.45;">Loading messages...</div>
        </div>
      </div>

      <!-- Training & Development -->
      <div class="azCard" style="margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(245,158,11,.10);display:flex;align-items:center;justify-content:center;color:#92400e;">
            ${azIcon("star")}
          </div>
          <div style="flex:1;">
            <div class="azCardTitle">Training & Development</div>
            <div class="azCardSub">Complete required training modules</div>
          </div>
          <div class="azIconBtn" style="width:44px;height:44px;border-radius:16px;">
            ${azIcon("chevR")}
          </div>
        </div>
      </div>

      <div style="height:8px"></div>
    `
  );

  // Load recent messages for preview
  loadHomeMessagesPreview(ctx?.empId);
}

// Load recent messages for home preview
async function loadHomeMessagesPreview(empId) {
  if (!isFirebaseConfigured() || !empId) {
    const preview = document.getElementById("homeMessagesPreview");
    if (preview) preview.innerHTML = `<div class="muted" style="line-height:1.45;">No messages yet</div>`;
    return;
  }

  try {
    const q = query(
      CHAT_COL(),
      where("employeeId", "==", empId),
      orderBy("timestamp", "desc"),
      limit(2)
    );
    
    const snapshot = await getDocs(q);
    const preview = document.getElementById("homeMessagesPreview");
    
    if (!preview) return;
    
    if (snapshot.empty) {
      preview.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(2,6,23,.02);border-radius:12px;border:1px solid rgba(229,234,242,.95);">
          <div style="width:36px;height:36px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);">
            ${azIcon("chat")}
          </div>
          <div>
            <div style="font-weight:1000;font-size:13px;">Start a conversation</div>
            <div style="font-size:12px;color:rgba(2,6,23,.55);font-weight:900;">Message HR directly</div>
          </div>
        </div>
      `;
      return;
    }

    const messages = [];
    snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
    
    preview.innerHTML = messages.map(msg => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:rgba(2,6,23,.02);border-radius:12px;border:1px solid rgba(229,234,242,.95);margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:999px;background:${msg.isAdmin ? 'rgba(22,163,74,.10)' : 'rgba(29,78,216,.10)'};display:flex;align-items:center;justify-content:center;color:${msg.isAdmin ? '#166534' : 'rgba(29,78,216,1)'};flex-shrink:0;">
          ${azIcon(msg.isAdmin ? "briefcase" : "user")}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <span style="font-weight:1000;font-size:12px;">${escapeHtml(msg.isAdmin ? 'HR Team' : 'You')}</span>
            <span style="font-size:10px;color:rgba(2,6,23,.45);font-weight:900;">${msg.timestamp ? fmtDateTime(msg.timestamp) : ''}</span>
          </div>
          <div style="font-size:12px;color:rgba(2,6,23,.70);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escapeHtml(msg.text || '')}
          </div>
          ${msg.replyText ? `
            <div style="margin-top:6px;padding:8px;background:rgba(22,163,74,.06);border-radius:8px;border-left:3px solid rgba(22,163,74,.5);">
              <div style="font-size:10px;color:#166534;font-weight:900;margin-bottom:2px;">HR Response:</div>
              <div style="font-size:11px;color:rgba(2,6,23,.70);line-height:1.4;">${escapeHtml(msg.replyText)}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
    
  } catch (e) {
    console.error("Error loading messages:", e);
  }
}

// ===============================
// MESSAGES / CHAT SYSTEM
// ===============================
function renderMessages(userData, ctx) {
  const empId = ctx?.empId;
  
  setPage(
    "Messages",
    "Chat with HR and Admin",
    `
      <div class="azCard" style="display:flex;flex-direction:column;height:calc(100vh - 200px);min-height:400px;">
        ${sectionHeader("Conversation with HR")}
        
        <div id="chatMessages" style="flex:1;overflow-y:auto;padding:10px;background:rgba(2,6,23,.02);border-radius:12px;border:1px solid rgba(229,234,242,.95);margin-bottom:12px;">
          <div class="muted" style="text-align:center;padding:20px;">Loading messages...</div>
        </div>
        
        <div style="display:flex;gap:10px;">
          <input 
            type="text" 
            id="chatInput" 
            class="inp" 
            placeholder="Type your message..." 
            style="flex:1;border-radius:999px;padding:12px 16px;"
            maxlength="500"
          />
          <button 
            id="chatSendBtn" 
            class="btn primary" 
            style="border-radius:999px;padding:12px 20px;display:flex;align-items:center;gap:6px;"
          >
            ${azIcon("send")}
            <span>Send</span>
          </button>
        </div>
        
        <div class="small muted" style="margin-top:10px;text-align:center;line-height:1.35;">
          Messages are monitored and typically answered within 24 hours during business days.
        </div>
      </div>
    `
  );

  // Setup real-time listener for messages
  setupChatListener(empId);
  
  // Setup send button
  const sendBtn = document.getElementById("chatSendBtn");
  const input = document.getElementById("chatInput");
  
  if (sendBtn && input) {
    sendBtn.onclick = () => sendChatMessage(empId, userData);
    input.onkeypress = (e) => {
      if (e.key === 'Enter') sendChatMessage(empId, userData);
    };
  }
}

// Real-time chat listener
let chatUnsubscribe = null;

function setupChatListener(empId) {
  if (!isFirebaseConfigured() || !empId) {
    const container = document.getElementById("chatMessages");
    if (container) {
      container.innerHTML = `<div class="muted" style="text-align:center;padding:20px;">Preview mode: Chat not available</div>`;
    }
    return;
  }

  // Unsubscribe from previous listener
  if (chatUnsubscribe) chatUnsubscribe();

  const q = query(
    CHAT_COL(),
    where("employeeId", "==", empId),
    orderBy("timestamp", "asc")
  );

  chatUnsubscribe = onSnapshot(q, (snapshot) => {
    const container = document.getElementById("chatMessages");
    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px 20px;text-align:center;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(29,78,216,.10);display:flex;align-items:center;justify-content:center;color:rgba(29,78,216,1);margin-bottom:16px;">
            ${azIcon("chat")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">No messages yet</div>
          <div style="font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;max-width:280px;">
            Start a conversation with HR. Ask about your schedule, payroll, or any questions you have.
          </div>
        </div>
      `;
      return;
    }

    const messages = [];
    snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
    
    container.innerHTML = messages.map(msg => renderChatMessage(msg)).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }, (error) => {
    console.error("Chat listener error:", error);
    const container = document.getElementById("chatMessages");
    if (container) {
      container.innerHTML = `<div class="muted" style="text-align:center;padding:20px;color:#ef4444;">Error loading messages. Please refresh.</div>`;
    }
  });
}

function renderChatMessage(msg) {
  const isAdmin = msg.isAdmin === true;
  const hasReply = msg.replyText && msg.replyText.trim() !== '';
  
  return `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;${isAdmin ? 'align-items:flex-start;' : 'align-items:flex-end;'}">
      <!-- Main Message -->
      <div style="max-width:80%;display:flex;flex-direction:column;gap:4px;${isAdmin ? 'align-items:flex-start;' : 'align-items:flex-end;'}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span style="font-weight:1000;font-size:11px;color:rgba(2,6,23,.70);">${escapeHtml(isAdmin ? 'HR Team' : 'You')}</span>
          <span style="font-size:10px;color:rgba(2,6,23,.45);font-weight:900;">${msg.timestamp ? fmtDateTime(msg.timestamp) : ''}</span>
        </div>
        <div style="padding:12px 16px;border-radius:16px;font-size:13px;line-height:1.5;${isAdmin ? 'background:#fff;border:1px solid rgba(229,234,242,.95);color:rgba(2,6,23,.85);border-top-left-radius:4px;' : 'background:rgba(29,78,216,1);color:#fff;border-top-right-radius:4px;'}">
          ${escapeHtml(msg.text || '')}
        </div>
      </div>
      
      <!-- Admin Reply (if exists) -->
      ${hasReply ? `
        <div style="max-width:80%;display:flex;flex-direction:column;gap:4px;align-items:flex-start;margin-left:${isAdmin ? '0' : '20px'};margin-top:4px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="font-weight:1000;font-size:11px;color:#166534;">HR Response</span>
            <span style="font-size:10px;color:rgba(2,6,23,.45);font-weight:900;">${msg.replyTimestamp ? fmtDateTime(msg.replyTimestamp) : ''}</span>
          </div>
          <div style="padding:12px 16px;border-radius:16px;font-size:13px;line-height:1.5;background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.20);color:rgba(2,6,23,.85);border-top-left-radius:4px;">
            ${escapeHtml(msg.replyText)}
          </div>
        </div>
      ` : ''}
      
      <!-- Status indicators -->
      ${!isAdmin && !hasReply ? `
        <div style="font-size:10px;color:rgba(2,6,23,.45);font-weight:900;display:flex;align-items:center;gap:4px;">
          ${msg.read ? `
            <span style="color:rgba(22,163,74,1);display:flex;align-items:center;gap:2px;">${azIcon("check")} Seen</span>
          ` : `
            <span>Sent</span>
          `}
        </div>
      ` : ''}
    </div>
  `;
}

async function sendChatMessage(empId, userData) {
  const input = document.getElementById("chatInput");
  const text = input?.value?.trim();
  
  if (!text) return;
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: Message not sent");
    return;
  }
  
  try {
    await addDoc(CHAT_COL(), {
      text: text,
      employeeId: empId,
      employeeName: userData?.fullName || empId,
      timestamp: serverTimestamp(),
      isAdmin: false,
      read: false,
      replied: false
    });
    
    input.value = "";
    uiToast("Message sent");
    
  } catch (e) {
    console.error("Error sending message:", e);
    uiToast("Failed to send message. Please try again.");
  }
}

// ===============================
// SCHEDULE: Tabs + Calendar + Detail section
// ===============================
function scheduleSubtabFromRoute(r) {
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
  const idx = new Map();
  for (const ev of events) {
    const key = ymd(ev?.date);
    if (!key) continue;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(ev);
  }
  return idx;
}

function renderCalendarMonth(recordData, state) {
  const y = state.y;
  const m = state.m;
  const selected = state.selectedYmd;

  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const prevDays = startDow;
  const totalCells = 42;
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
      const d = prevMonthDays + dayNum;
      cellDate = new Date(y, m - 1, d);
      label = d;
      muted = true;
    } else if (dayNum > daysInMonth) {
      const d = dayNum - daysInMonth;
      cellDate = new Date(y, m + 1, d);
      label = d;
      muted = true;
    } else {
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
// ENHANCED PROGRESS PAGE (MOVED TO MORE)
// ===============================
function renderProgress(userData, recordData) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const appt = recordData?.appointment || userData?.appointment || {};
  
  // Filter out application step for display
  const displaySteps = steps.filter(s => s.id !== "application");
  const completedSteps = displaySteps.filter(s => s.done);
  const pendingSteps = displaySteps.filter(s => !s.done);
  const nextStep = pendingSteps[0];
  const progressPercent = Math.round((completedSteps.length / displaySteps.length) * 100);
  
  // Find current step index for sequential logic
  const currentStepIndex = displaySteps.findIndex(s => !s.done);

  const stepsTimeline = displaySteps.map((s, index) => {
    const isCompleted = s.done;
    const isCurrent = index === currentStepIndex;
    const isLocked = index > currentStepIndex;
    
    const statusText = isCompleted ? "Completed" : isCurrent ? "In Progress" : "Locked";
    const iconSvg = isCompleted ? azIcon("check") : isCurrent ? azIcon("unlock") : azIcon("lock");
    
    // Warehouse-specific descriptions
    const descriptions = {
      shift_selection: "Select your preferred shift and position for warehouse operations",
      footwear: "Purchase required safety footwear before your first day",
      i9: "Prepare original documents for I-9 verification on day 1",
      documents: "Complete remaining paperwork with HR on site",
      firstday: "Final preparation for your first day at the facility"
    };
    
    const metaInfo = isCompleted ? "Done" : isCurrent ? "Action required" : `Complete ${displaySteps[index-1]?.label || 'previous step'} first`;

    return `
      <div class="progress-item ${isCompleted ? 'completed' : isCurrent ? 'current' : 'locked'}">
        <div class="progress-item-icon">${iconSvg}</div>
        <div class="progress-item-card">
          <div class="progress-item-header">
            <div class="progress-item-title">${escapeHtml(s.label)}</div>
            <div class="progress-item-status">${statusText}</div>
          </div>
          <div class="progress-item-desc">${descriptions[s.id] || ''}</div>
          <div class="progress-item-meta">
            <span>${azIcon(isCompleted ? "checkCircle" : isCurrent ? "info" : "lock")} ${metaInfo}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  setPage(
    "Progress",
    "Your onboarding journey",
    `
      <div class="progress-hero">
        <div class="progress-hero-icon">
          ${azIcon("briefcase")}
        </div>
        <div class="progress-hero-title">${progressPercent}% Complete</div>
        <div class="progress-hero-sub">
          ${nextStep ? `Next up: ${nextStep.label}. Complete all steps to finish onboarding.` : 'All steps completed! Ready for your first day.'}
        </div>
        <div class="progress-stats">
          <div class="progress-stat">
            <div class="progress-stat-number">${completedSteps.length}</div>
            <div class="progress-stat-label">Done</div>
          </div>
          <div class="progress-stat">
            <div class="progress-stat-number">${pendingSteps.length}</div>
            <div class="progress-stat-label">Pending</div>
          </div>
          <div class="progress-stat">
            <div class="progress-stat-number">${displaySteps.length}</div>
            <div class="progress-stat-label">Total</div>
          </div>
        </div>
      </div>

      <div class="azCard">
        ${sectionHeader("Onboarding Steps")}
        <div class="progress-timeline">
          ${stepsTimeline}
        </div>
      </div>

      <div class="progress-warehouse-info">
        <div class="progress-warehouse-title">
          ${azIcon("info")} Warehouse Onboarding Info
        </div>
        <div class="progress-warehouse-grid">
          <div class="progress-warehouse-item">
            <div class="progress-warehouse-item-label">Facility</div>
            <div class="progress-warehouse-item-value">SunPowerC Solar Assembly</div>
          </div>
          <div class="progress-warehouse-item">
            <div class="progress-warehouse-item-label">Shift Start</div>
            <div class="progress-warehouse-item-value">${safe(appt.time, "TBD")}</div>
          </div>
          <div class="progress-warehouse-item">
            <div class="progress-warehouse-item-label">Location</div>
            <div class="progress-warehouse-item-value">${safe(appt.address, "To be assigned")}</div>
          </div>
          <div class="progress-warehouse-item">
            <div class="progress-warehouse-item-label">Contact</div>
            <div class="progress-warehouse-item-value">HR Onboarding Team</div>
          </div>
        </div>
      </div>

      ${nextStep ? `
        <div style="height:20px"></div>
        <a class="btn primary" href="#${nextStep.id === 'shift_selection' ? 'shift' : nextStep.id}" style="display:block;width:100%;text-align:center;border-radius:16px;padding:14px;">
          Continue to ${escapeHtml(nextStep.label)}
        </a>
      ` : ''}
    `
  );
}

// ===============================
// SEQUENTIAL ONBOARDING WITH CONFETTI
// ===============================

function getStepStatus(stepId, userData) {
  const steps = userData?.steps || [];
  const stepIndex = steps.findIndex(s => s.id === stepId);
  const prevStep = steps[stepIndex - 1];
  
  // Check if previous step is done (for sequential flow)
  const isPrevDone = !prevStep || prevStep.done;
  const isCurrentDone = steps.find(s => s.id === stepId)?.done;
  
  return {
    isDone: isCurrentDone,
    isAvailable: isPrevDone,
    isLocked: !isPrevDone
  };
}

function renderShiftSelection(userData, saveUserPatch) {
  const status = getStepStatus("shift_selection", userData);
  
  // If already completed, show success view
  if (status.isDone) {
    setPage(
      "Shift Selection",
      "Completed",
      `
        <div class="confirmation-banner" style="text-align:center;padding:40px 24px;">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:18px;color:rgba(2,6,23,.85);margin-bottom:8px;">Shift Selected Successfully</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            You have completed this step. Your preferences have been saved and sent to HR for confirmation.
          </div>
          <div class="azCard" style="margin-bottom:20px;">
            <div class="azCardTitle">Your Selection</div>
            <div class="azCardSub" style="margin-top:8px;">
              Position: ${escapeHtml(userData?.shift?.position || 'Not selected')}<br>
              Shift: ${escapeHtml(userData?.shift?.shift || 'Not selected')}
            </div>
          </div>
          <a class="btn primary" href="#footwear" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Continue to Safety Footwear
          </a>
        </div>
      `
    );
    return;
  }

  const shift = userData?.shift || {};
  const pos = shift.position || "";
  const sh = shift.shift || "";

  setPage(
    "Shift Selection",
    "Choose your preferences (HR will confirm).",
    `
      <div class="azCard">
        ${sectionHeader("Position Preference")}
        <div class="shift-options">
          ${posCard("assembler","Solar Panel Assembler","Hands-on assembly of solar panels.","$18–$23/hr",pos)}
          ${posCard("material","Material Handler / Warehouse","Moves materials, inventory support.","$18–$22/hr",pos)}
          ${posCard("qc","Quality Control / Inspection","Inspect panels for quality and safety.","$19–$23/hr",pos)}
        </div>

        <div class="section-spacer"></div>

        ${sectionHeader("Shift Preference")}
        <div class="shift-options">
          ${shiftCard("early","Early Shift","6:00 AM – 2:30 PM",sh)}
          ${shiftCard("mid","Mid Shift","2:00 PM – 10:30 PM",sh)}
          ${shiftCard("late","Late Shift","10:00 PM – 6:30 AM",sh)}
        </div>

        <div class="section-spacer"></div>

        <button class="btn primary" id="btnShiftSave" type="button" style="margin-top:14px;width:100%;border-radius:16px;">
          Save Preferences
        </button>

        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          Preferences only — final assignment is confirmed by HR.
        </div>
      </div>
    `
  );

  function posCard(key, title, desc, pay, selectedKey) {
    const selected = selectedKey === key;
    return `
      <label class="azCard shift-card ${selected ? 'selected' : ''}" style="cursor:pointer;">
        <div class="shift-card-inner" style="display:flex;gap:12px;">
          <input type="radio" name="pos" value="${escapeHtml(key)}" ${selected ? "checked" : ""} style="margin-top:4px;"/>
          <div class="shift-card-content" style="flex:1;">
            <div class="azCardTitle">${escapeHtml(title)}</div>
            <div class="azCardSub">${escapeHtml(desc)}</div>
            <div style="margin-top:8px;font-size:12px;font-weight:900;color:rgba(29,78,216,1);">${escapeHtml(pay)}</div>
          </div>
        </div>
      </label>
    `;
  }

  function shiftCard(key, title, hours, selectedKey) {
    const selected = selectedKey === key;
    return `
      <label class="azCard shift-card ${selected ? 'selected' : ''}" style="cursor:pointer;">
        <div class="shift-card-inner" style="display:flex;gap:12px;">
          <input type="radio" name="shift" value="${escapeHtml(key)}" ${selected ? "checked" : ""} style="margin-top:4px;"/>
          <div class="shift-card-content" style="flex:1;">
            <div class="azCardTitle">${escapeHtml(title)}</div>
            <div class="azCardSub">${escapeHtml(hours)}</div>
          </div>
        </div>
      </label>
    `;
  }

  document.getElementById("btnShiftSave").onclick = async () => {
    const position = document.querySelector("input[name=pos]:checked")?.value || "";
    const shiftKey = document.querySelector("input[name=shift]:checked")?.value || "";
    if (!position || !shiftKey) return uiToast("Please select 1 position and 1 shift.");

    const steps = (userData.steps || []).map(s =>
      s.id === "shift_selection" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ shift: { position, shift: shiftKey }, steps, stage: "footwear" });
    triggerConfetti();
    uiToast("Preferences saved successfully!");
    location.hash = "#shift";
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const status = getStepStatus("footwear", userData);
  
  // Check if previous step is done
  if (status.isLocked) {
    setPage(
      "Safety Footwear",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Shift Selection before accessing this step.
          </div>
          <a class="btn primary" href="#shift" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Shift Selection
          </a>
        </div>
      `
    );
    return;
  }
  
  // If already completed, show success view
  if (status.isDone) {
    setPage(
      "Safety Footwear",
      "Completed",
      `
        <div class="confirmation-banner" style="text-align:center;padding:40px 24px;">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:18px;color:rgba(2,6,23,.85);margin-bottom:8px;">Safety Footwear Completed</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            You have acknowledged the safety footwear requirements. Remember to purchase before your first day.
          </div>
          <a class="btn primary" href="#i9" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Continue to I-9 Documents
          </a>
        </div>
      `
    );
    return;
  }

  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const fw = userData?.footwear || {};
  const steps = userData?.steps || [];

  function ackRow(id, checked, text) {
    return `
      <label class="checkrow" style="
        display:flex;gap:10px;align-items:flex-start;
        padding:12px;border:1px solid rgba(229,234,242,.95);
        border-radius:16px;margin-top:10px;
        background:#fff;cursor:pointer;
      ">
        <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked" : ""} style="margin-top:2px;"/>
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
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Required Acknowledgements")}
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

      </div>
    `
  );

  const btn = document.getElementById("btnFootwearComplete");
  
  const syncBtn = () => {
    const a1 = document.getElementById("fwAck1")?.checked;
    const a2 = document.getElementById("fwAck2")?.checked;
    const a3 = document.getElementById("fwAck3")?.checked;
    const a4 = document.getElementById("fwAck4")?.checked;
    const a5 = document.getElementById("fwAck5")?.checked;

    const allAcks = !!(a1 && a2 && a3 && a4 && a5);

    if (btn) {
      btn.disabled = !allAcks;
      btn.style.opacity = allAcks ? "1" : ".6";
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

      const newSteps = (steps || []).map(s =>
        s.id === "footwear" ? ({ ...s, done: true }) : s
      );

      await saveUserPatch({
        footwear: { ack1:a1, ack2:a2, ack3:a3, ack4:a4, ack5:a5 },
        steps: newSteps,
        stage: "i9"
      });

      triggerConfetti();
      uiToast("Footwear requirement completed!");
      location.hash = "#footwear";
    };
  }
}

function renderI9(userData, saveUserPatch) {
  const status = getStepStatus("i9", userData);
  
  // Check if previous step is done
  if (status.isLocked) {
    setPage(
      "I-9 Documents",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Safety Footwear before accessing this step.
          </div>
          <a class="btn primary" href="#footwear" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Safety Footwear
          </a>
        </div>
      `
    );
    return;
  }
  
  // If already completed, show success view
  if (status.isDone) {
    setPage(
      "I-9 Documents",
      "Completed",
      `
        <div class="confirmation-banner" style="text-align:center;padding:40px 24px;">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:18px;color:rgba(2,6,23,.85);margin-bottom:8px;">I-9 Acknowledged</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            You have confirmed you will bring original documents on your first day. HR will verify these in person.
          </div>
          <a class="btn primary" href="#documents" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Continue to Documents
          </a>
        </div>
      `
    );
    return;
  }

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

        <div style="margin-top:16px;padding:16px;background:rgba(2,6,23,.03);border-radius:12px;border:1px solid rgba(229,234,242,.95);">
          <div style="font-weight:1000;font-size:13px;margin-bottom:8px;">Accepted Documents:</div>
          <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;color:rgba(2,6,23,.70);">
            <li>Passport OR</li>
            <li>Driver's License + Social Security Card OR</li>
            <li>State ID + Birth Certificate</li>
          </ul>
        </div>

        <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px;background:#fff;border:1px solid rgba(229,234,242,.95);border-radius:16px;cursor:pointer;">
          <input type="checkbox" id="i9Ack" ${i9.ack ? "checked" : ""} style="margin-top:2px;"/>
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
    triggerConfetti();
    uiToast("I-9 confirmed successfully!");
    location.hash = "#i9";
  };
}

function renderDocumentsLocked(userData) {
  const status = getStepStatus("documents", userData);
  
  // Check if previous step is done
  if (status.isLocked) {
    setPage(
      "Documents",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete I-9 Documents before accessing this step.
          </div>
          <a class="btn primary" href="#i9" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to I-9 Documents
          </a>
        </div>
      `
    );
    return;
  }
  
  // If already completed, show success view
  if (status.isDone) {
    setPage(
      "Documents",
      "Completed",
      `
        <div class="confirmation-banner" style="text-align:center;padding:40px 24px;">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:18px;color:rgba(2,6,23,.85);margin-bottom:8px;">Documents Completed</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            You have completed all in-person documentation with HR.
          </div>
          <a class="btn primary" href="#firstday" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Continue to First Day
          </a>
        </div>
      `
    );
    return;
  }

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
        
        <div style="height:20px"></div>
        
        <button class="btn primary" id="btnDocsComplete" type="button" style="width:100%;border-radius:16px;padding:14px;">
          Mark as Complete
        </button>
        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          Only click this after HR has confirmed your documents are complete.
        </div>
      </div>
    `
  );
  
  document.getElementById("btnDocsComplete").onclick = async () => {
    const steps = (userData.steps || []).map(s =>
      s.id === "documents" ? ({ ...s, done: true }) : s
    );
    await saveUserPatch({ steps });
    triggerConfetti();
    uiToast("Documents step completed!");
    location.hash = "#documents";
  };
}

function renderFirstDayLocked(userData, recordData) {
  const status = getStepStatus("firstday", userData);
  
  // Check if previous step is done
  if (status.isLocked) {
    setPage(
      "First Day",
      "Locked",
      `
        <div class="azCard" style="text-align:center;padding:40px 24px;">
          <div style="width:64px;height:64px;border-radius:999px;background:rgba(2,6,23,.06);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:rgba(2,6,23,.40);">
            ${azIcon("lock")}
          </div>
          <div style="font-weight:1000;font-size:16px;color:rgba(2,6,23,.85);margin-bottom:8px;">Step Locked</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Please complete Documents before accessing this step.
          </div>
          <a class="btn primary" href="#documents" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Documents
          </a>
        </div>
      `
    );
    return;
  }
  
  // If already completed, show success view
  if (status.isDone) {
    setPage(
      "First Day",
      "Completed",
      `
        <div class="confirmation-banner" style="text-align:center;padding:40px 24px;">
          <div style="width:80px;height:80px;border-radius:999px;background:rgba(22,163,74,.10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:rgba(22,163,74,1);">
            ${azIcon("checkCircle")}
          </div>
          <div style="font-weight:1000;font-size:18px;color:rgba(2,6,23,.85);margin-bottom:8px;">Onboarding Complete!</div>
          <div style="font-weight:900;font-size:13px;color:rgba(2,6,23,.60);line-height:1.5;margin-bottom:20px;">
            Congratulations! You have completed all onboarding steps. Welcome to the team!
          </div>
          <a class="btn primary" href="#home" style="display:block;width:100%;border-radius:16px;padding:14px;">
            Go to Home
          </a>
        </div>
      `
    );
    return;
  }

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
        
        <div style="height:20px"></div>
        
        <button class="btn primary" id="btnFirstDayComplete" type="button" style="width:100%;border-radius:16px;padding:14px;">
          Complete Onboarding
        </button>
        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          Only click this after completing your first day with HR.
        </div>
      </div>
    `
  );
  
  document.getElementById("btnFirstDayComplete").onclick = async () => {
    const steps = (userData.steps || []).map(s =>
      s.id === "firstday" ? ({ ...s, done: true }) : s
    );
    await saveUserPatch({ steps, status: "active" });
    triggerConfetti();
    uiToast("Onboarding completed! Welcome to SunPowerC!");
    location.hash = "#firstday";
  };
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
        ${sectionHeader("We're here to help.")}
        <div class="muted" style="line-height:1.45;">
          Choose the option below and we'll get you taken care of.
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
          Describe the issue and we'll follow up as soon as possible.
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

  switch (r) {
    case "home":              return renderHome(publicData, recordData, userData, ctx);
    case "schedule":          return renderMySchedule(recordData);
    case "schedule-timecard": return renderTimecard(recordData);
    case "schedule-findshifts": return renderFindShifts(recordData);
    case "progress":          return renderProgress(userData, recordData);
    case "shift":
    case "shift_selection":   return renderShiftSelection(userData, saveUserPatch);
    case "footwear":          return renderFootwear(userData, saveUserPatch, publicData);
    case "i9":                return renderI9(userData, saveUserPatch);
    case "documents":
    case "docs":              return renderDocumentsLocked(userData);
    case "firstday":
    case "first_day":         return renderFirstDayLocked(userData, recordData);
    case "hours":             return renderHours(recordData);
    case "payroll":           return renderPayroll(recordData);
    case "timeoff":           return renderTimeOff(recordData);
    case "deposit":           return renderDeposit(recordData);
    case "messages":          return renderMessages(userData, ctx);
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
      availableShifts: [],
      unreadMessages: 0,
      upcomingShifts: 2,
      pendingRequests: 0
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
      let currentRecordData = {};
      const ctx = { empId, user };

      const rerender = () => {
        if (!currentUserData) return;
        ensureChromeOnce();
        applyChromeVisibility();
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
        setActiveTabsAndSidebar();
      };

      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists()
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        rerender();
      });

      onSnapshot(recordRef, async (snap) => {
        currentRecordData = snap.exists() ? (snap.data() || {}) : {};

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

      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() || {};
        const base = defaultUserDoc(user);

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
          notifications: Array.isArray(d.notifications) ? d.notifications : base.notifications,
          shiftChangeRequests: Array.isArray(d.shiftChangeRequests) ? d.shiftChangeRequests : []
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

// iOS fix: scroll in #azMoreSheet should not trigger tap
(function () {
  let scrolled = false;
  let ignoreClicksUntil = 0;

  document.addEventListener("scroll", (e) => {
    const sheet = document.getElementById("azMoreSheet");
    if (!sheet) return;
    if (e.target === sheet) scrolled = true;
  }, true);

  document.addEventListener("touchstart", (e) => {
    if (!e.target.closest("#azMoreSheet")) return;
    scrolled = false;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!e.target.closest("#azMoreSheet")) return;
    if (scrolled) ignoreClicksUntil = Date.now() + 500;
    scrolled = false;
  }, { passive: true });

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
