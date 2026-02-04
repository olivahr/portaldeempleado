// ===============================
// Employee Portal (SUNPOWER STYLE, NO EMOJIS)
// ✅ Bottom Tab Bar mobile: Home / Schedule / Benefits / More (4 tabs)
// ✅ Desktop keeps sidebar
// ✅ No "amazon a to z" text anywhere
// ✅ No "Ask A to Z" button anywhere
// ✅ iPhone/Android tap fix: buttons + JS navigation + safe-area padding (CSS in app.css)
// ✅ Schedule tabs + real calendar month grid
// ✅ Uses employeeRecords/{SP###} + portal/public + users/{uid}
// ✅ Employee ID gate allowedEmployees/{SP###} + optional range auto-allow
// ✅ Employee STATUS visibility rules (APPLICANT → FULLY ACTIVE)
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

// ===============================
// EMPLOYEE STATUS + VISIBILITY
// ===============================
const EMPLOYEE_STATUS = {
  APPLICANT: "APPLICANT",
  PRE_ONBOARDING: "PRE-ONBOARDING",
  FIRST_DAY_SCHEDULED: "FIRST DAY SCHEDULED",
  ACTIVE_EMPLOYEE: "ACTIVE EMPLOYEE",
  PAYROLL_ACTIVE: "PAYROLL ACTIVE",
  FULLY_ACTIVE: "FULLY ACTIVE"
};

const STATUS_ORDER = [
  EMPLOYEE_STATUS.APPLICANT,
  EMPLOYEE_STATUS.PRE_ONBOARDING,
  EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED,
  EMPLOYEE_STATUS.ACTIVE_EMPLOYEE,
  EMPLOYEE_STATUS.PAYROLL_ACTIVE,
  EMPLOYEE_STATUS.FULLY_ACTIVE
];

function normalizeStatus(s) {
  const v = String(s || "").trim().toUpperCase();
  return STATUS_ORDER.find(x => x.toUpperCase() === v) || EMPLOYEE_STATUS.APPLICANT;
}
function statusAtLeast(current, required) {
  const a = STATUS_ORDER.indexOf(normalizeStatus(current));
  const b = STATUS_ORDER.indexOf(normalizeStatus(required));
  return a >= b;
}

// Route access rules
function canAccessRoute(route, status) {
  const s = normalizeStatus(status);

  if (route === "home") return true;

  if (s === EMPLOYEE_STATUS.APPLICANT) {
    return ["home", "notifications", "help"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) {
    return ["home","progress","shift","shift_selection","firstdayinfo","help","notifications","company"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) {
    return [
      "home","progress","shift","shift_selection",
      "firstday","firstdayinfo","i9",
      "footwear","footwearshop","footwearpolicy",
      "help","notifications","company"
    ].includes(route);
  }

  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) {
    return [
      "home","progress","policies","footwearpolicy","legal","company",
      "schedule","schedule-timecard","schedule-findshifts",
      "hours","timeoff","deposit",
      "help","notifications",
      "footwear","footwearshop","i9","firstday","firstdayinfo",
      "documents"
    ].includes(route);
  }

  if (s === EMPLOYEE_STATUS.PAYROLL_ACTIVE) return true;
  if (s === EMPLOYEE_STATUS.FULLY_ACTIVE) return true;

  return true;
}

function routeGuardRedirect(route, status) {
  if (canAccessRoute(route, status)) return null;

  const s = normalizeStatus(status);
  if (s === EMPLOYEE_STATUS.APPLICANT) return "#home";
  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) return "#progress";
  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) return "#firstdayinfo";
  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) return "#policies";
  return "#home";
}

// ===============================
// OFFICIAL CONTENT (REAL, NON-BLANK)
// ===============================
const OFFICIAL_CONTENT = {
  home: {
    title: "Welcome to the Employee Portal",
    body: [
      "This portal is the official workplace communication system between the employee and the company.",
      "Important information related to employment, safety, pay, and site rules is published here.",
      "This portal is part of the employee’s work record.",
      "Information displayed may be used for administrative, legal, and operational purposes."
    ],
    responsibilityTitle: "Employee responsibility",
    responsibility: [
      "Review the portal regularly",
      "Read safety notices",
      "Confirm schedules",
      "Report pay errors",
      "Keep information up to date",
      "Not reviewing the portal does not remove responsibility."
    ],
    confidentialityTitle: "Confidentiality",
    confidentiality: [
      "Do not share access",
      "Do not disclose salary information",
      "Do not access other accounts",
      "Violations may result in discipline."
    ]
  },

  policies: {
    title: "General Warehouse Policies",
    sections: [
      { h: "Conduct on site", p: ["Respect supervisors and co-workers","Use professional language","Follow site rules","Zero violence or threats","Zero harassment"] },
      { h: "Cell phone use", p: ["In many operational areas, phone use is limited or prohibited","Use only during breaks","No use while operating equipment"] },
      { h: "Dress code", p: ["Wear safe, comfortable work clothing","No loose clothing that creates hazards","Tie back long hair","Use PPE where required"] },
      { h: "Attendance and punctuality", p: ["Punctuality is critical in warehouse operations","Arrive before your scheduled shift","Late arrivals may result in warnings","Absences without notice may result in discipline","Call-outs: notify before your shift starts"] }
    ]
  },

  firstDay: {
    title: "First Day",
    purpose: "Ensure a legal, safe, and organized start.",
    bring: ["Valid ID","I-9 documents","Approved safety footwear","Appropriate work clothing"],
    flow: ["Arrive 15–20 minutes early","HR check-in","Identity confirmation","I-9 verification","Safety video","Risk overview","Evacuation routes","Restricted areas","Supervisor introduction","Guided first tasks"],
    evaluation: ["Punctuality","Safety attention","Attitude","Ability to follow instructions"]
  },

  i9: {
    title: "I-9 Employment Verification",
    purpose: "Federal requirement.",
    accepted: ["U.S. Passport","Permanent Resident Card (Green Card)","Driver’s License + Social Security card"],
    rules: ["Originals only","Unexpired","No copies","Without a valid I-9 you cannot work"]
  },

  footwear: {
    title: "Safety Footwear Program",
    purpose: ["Reduce foot injuries from pallets","Mobile equipment","Heavy boxes","Slips and falls"],
    required: ["Required from Day 1","No approved footwear = no work on the operational floor"],
    whereBuy: ["Purchase only through company-authorized store","Footwear from non-authorized stores is not accepted"],
    specs: ["Steel/composite toe","Slip-resistant","Certified","Good condition"],
    reimbursement: ["Employee buys approved footwear","Employee submits receipt","Safety validates","Reimbursement included in first payroll"],
    reimbursementRules: ["One-time only","First payroll only","Receipt required","Must be purchased through authorized store"],
    inspections: ["Safety may inspect at any time","Damaged footwear must be replaced"]
  },

  payroll: {
    title: "Payroll",
    how: ["Pay is based on recorded hours","Cycle: Work → Time recorded → Supervisor approval → Processing → Direct deposit"],
    firstPay: ["First pay occurs after completing the payroll cycle","It may take 1–2 weeks depending on the start date and cycle cutoff"],
    errors: ["Report pay errors within 48 hours"],
    payStubs: { title: "Pay Stubs", include: ["Hours","Rate","Deductions","Net pay"], note: "Available after the first payroll is processed." }
  },

  benefits: {
    title: "Benefits",
    note: "Benefits depend on the company and hours worked. May include:",
    list: ["PTO (if applicable)","Holiday pay (if applicable)","On-site training","Promotion opportunities","Workplace safety programs"]
  },

  help: {
    title: "Help & Support",
    body: ["Contact HR for pay, schedules, safety, and documents.","Use Support Tickets for formal requests (creates a record)."]
  },

  legal: {
    title: "Legal",
    bullets: ["Policies may change.","Safety compliance is mandatory.","Benefits do not guarantee continued employment.","Employment may be at-will per state law."]
  },

  company: {
    title: "Company Information",
    name: "SunPower Corporation",
    cityState: "Louisville, KY",
    address: "13051 Plantside Dr, Louisville, KY 40299",
    hrPhone: "(502) 306-5521",
    hrEmail: "hr@sunpowerc.energy",
    hrHours: "Mon–Fri 8:00 AM–5:00 PM",
    payDay: "Weekly Friday",
    firstDayArrival: "9:30 AM",
    footwearShop: "https://shop.sunpowerc.energy",
    footwearReimbursementCap: "$100",
    shifts: [
      { label: "Morning", hours: "6:00 AM – 2:30 PM" },
      { label: "Afternoon", hours: "2:00 PM – 10:30 PM" },
      { label: "Night", hours: "10:00 PM – 6:30 AM" }
    ]
  }
};

// ---------- Route helpers ----------
function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}
function navTo(hash) {
  const h = (hash || "#home").startsWith("#") ? hash : `#${hash}`;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  const body = document.getElementById("pageBody");
  if (body) body.innerHTML = html;
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
  } catch { return String(d || ""); }
}
function fmtMonthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  } catch { return ""; }
}
function clamp(n, a, b) {
  n = Number(n);
  if (isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

// ---------- Default docs ----------
function defaultPublicContent() {
  return {
    brand: { name: "SunPower", logoText: "sunpower", accent: "#2563eb" },
    company: {
      name: OFFICIAL_CONTENT.company.name,
      cityState: OFFICIAL_CONTENT.company.cityState,
      address: OFFICIAL_CONTENT.company.address,
      payDay: OFFICIAL_CONTENT.company.payDay,
      firstDayArrival: OFFICIAL_CONTENT.company.firstDayArrival,
      shifts: OFFICIAL_CONTENT.company.shifts
    },
    help: {
      phone: OFFICIAL_CONTENT.company.hrPhone,
      email: OFFICIAL_CONTENT.company.hrEmail,
      hours: OFFICIAL_CONTENT.company.hrHours,
      text: "Choose an option below and we’ll get you taken care of."
    },
    home: {
      welcomeShort: "This portal is the official workplace communication system. Review it regularly for safety, schedules, and pay updates.",
      news: [{ title: "SunPower Updates", subtitle: "Company announcements and HR updates", linkText: "All notifications", route: "notifications" }]
    },
    footwear: {
      programTitle: OFFICIAL_CONTENT.footwear.title,
      shopUrl: OFFICIAL_CONTENT.company.footwearShop,
      reimbursementCap: OFFICIAL_CONTENT.company.footwearReimbursementCap
    },
    globalNotifications: []
  };
}

function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: EMPLOYEE_STATUS.APPLICANT,
    stage: "application",
    appointment: { date: "", time: "", address: "", notes: "" },
    steps: [
      { id: "application", label: "Application", done: true },
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Documents", done: false },
      { id: "documents", label: "Complete Onboarding Documents", done: false },
      { id: "firstday", label: "First Day Preparation", done: false }
    ],
    shift: { position: "", shift: "", approved: false },
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
    await setDoc(ref, { ...defaultUserDoc(user), ...patch, role: "employee", createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(ref, patch, { merge: true });
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
// ICONS (NO AMAZON TEXT ANYWHERE)
// ===============================
function azIcon(name) {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    home: `<svg ${common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
    schedule: `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M8 2v4M16 2v4"/><path d="M3 10h18"/></svg>`,
    benefits: `<svg ${common}><path d="M12 22s7-4 7-10V6l-7-3-7 3v6c0 6 7 10 7 10Z"/></svg>`,
    more: `<svg ${common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    bell: `<svg ${common}><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
    chat: `<svg ${common}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
    chevR: `<svg ${common}><path d="M9 18l6-6-6-6"/></svg>`,
    chevL: `<svg ${common}><path d="M15 18l-6-6 6-6"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`
  };
  return icons[name] || icons.more;
}

// ===============================
// MOBILE TABS + MORE SHEET (JS ONLY)
// ===============================
function isMobile() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function killOldDuplicateBars() {
  // remove old injected style bars or template bars
  ["azTabs","azMoreOverlay","azMoreSheet","spTabs","spMoreOverlay","spMoreSheet","bottomNav","bottomTabs","mobileTabs","tabbar","footerNav"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  document.querySelectorAll(".bottom-nav,.bottom-tabs,.mobile-tabs,.tabbar,.footer-nav").forEach(el=>el.remove());
}

function ensureChromeOnce() {
  killOldDuplicateBars();

  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) btnMenu.style.display = "none";

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (document.getElementById("spTabs")) return;

  // Bottom tabs container
  const tabs = document.createElement("div");
  tabs.id = "spTabs";
  tabs.innerHTML = `
    <div class="spTabsWrap">
      <button class="spTab" data-route="home" type="button">
        <div class="spIco">${azIcon("home")}</div>
        <div class="spLbl">Home</div>
      </button>

      <button class="spTab" data-route="schedule" type="button">
        <div class="spIco">${azIcon("schedule")}</div>
        <div class="spLbl">Schedule</div>
      </button>

      <button class="spTab" data-route="timeoff" type="button">
        <div class="spIco">${azIcon("benefits")}</div>
        <div class="spLbl">Benefits</div>
      </button>

      <button class="spTab" id="spMoreBtn" data-route="more" type="button">
        <div class="spIco">${azIcon("more")}</div>
        <div class="spLbl">More</div>
      </button>
    </div>
  `;
  document.body.appendChild(tabs);

  // More overlay + sheet
  const overlay = document.createElement("div");
  overlay.id = "spMoreOverlay";
  overlay.style.display = "none";
  document.body.appendChild(overlay);

  const sheet = document.createElement("div");
  sheet.id = "spMoreSheet";
  sheet.className = "spMoreSheet";
  sheet.innerHTML = `
    <div class="spMoreHead">
      <div>
        <div class="spMoreTitle">More</div>
        <div class="spMoreSub">All portal modules</div>
      </div>
      <button class="spMoreClose" id="spMoreClose" type="button">Close</button>
    </div>

    <div class="spMoreGrid">
      ${moreItem("progress","Progress","Onboarding checklist")}
      ${moreItem("company","Company","Site and HR info")}
      ${moreItem("policies","Policies","Warehouse rules")}
      ${moreItem("firstdayinfo","First Day Info","Arrival and requirements")}
      ${moreItem("shift_selection","Shift Selection","Choose your preference")}
      ${moreItem("footwearpolicy","Footwear Policy","Rules and reimbursement")}
      ${moreItem("footwear","Safety Footwear","Program acknowledgement")}
      ${moreItem("i9","I-9","Bring original documents")}
      ${moreItem("documents","Documents","Completed on first day")}
      ${moreItem("firstday","First Day","Check-in details")}
      ${moreItem("hours","My Hours","Weekly summary")}
      ${moreItem("deposit","Direct Deposit","View only")}
      ${moreItem("notifications","Notifications","Company and HR")}
      ${moreItem("legal","Legal","At-will and policies")}
      ${moreItem("help","Help & Support","Call, email, or ticket")}
    </div>
  `;
  document.body.appendChild(sheet);

  function moreItem(route, title, sub) {
    return `
      <button class="spMoreItem" type="button" data-route="${escapeHtml(route)}">
        <div>
          <div class="spMoreItemTitle">${escapeHtml(title)}</div>
          <div class="spMoreItemSub">${escapeHtml(sub)}</div>
        </div>
        <div class="spMoreArrow">${azIcon("chevR")}</div>
      </button>
    `;
  }

  const openMore = () => {
    overlay.style.display = "block";
    sheet.classList.add("open");
  };
  const closeMore = () => {
    overlay.style.display = "none";
    sheet.classList.remove("open");
  };

  document.getElementById("spMoreBtn").addEventListener("click", openMore);
  document.getElementById("spMoreClose").addEventListener("click", closeMore);
  overlay.addEventListener("click", closeMore);

  // Bottom tabs tap wiring (iPhone/Android safe)
  tabs.querySelectorAll("button.spTab").forEach(btn => {
    const r = btn.getAttribute("data-route");
    if (!r) return;
    if (r === "more") return;
    btn.addEventListener("click", () => navTo(`#${r}`), { passive: true });
  });

  // More sheet items wiring
  sheet.querySelectorAll("button[data-route]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-route") || "home";
      closeMore();
      navTo(`#${r}`);
    }, { passive: true });
  });

  applyChromeVisibility();
  window.addEventListener("resize", applyChromeVisibility);
}

function applyChromeVisibility() {
  const tabs = document.getElementById("spTabs");
  if (!tabs) return;

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (isMobile()) {
    tabs.style.display = "block";
    document.body.classList.add("has-tabs");
  } else {
    tabs.style.display = "none";
    document.body.classList.remove("has-tabs");
    const overlay = document.getElementById("spMoreOverlay");
    const sheet = document.getElementById("spMoreSheet");
    if (overlay) overlay.style.display = "none";
    if (sheet) sheet.classList.remove("open");
  }
}

function applyMoreVisibility(status) {
  const s = normalizeStatus(status);
  const sheet = document.getElementById("spMoreSheet");
  if (!sheet) return;

  sheet.querySelectorAll("[data-route]").forEach(btn => {
    const r = (btn.getAttribute("data-route") || "").trim().toLowerCase();
    const ok = canAccessRoute(r, s);
    btn.style.display = ok ? "" : "none";
  });
}

function setActiveTabsAndSidebar(statusForGate = EMPLOYEE_STATUS.FULLY_ACTIVE) {
  const r = routeName();
  const tabKey =
    (r === "home" || r === "progress") ? "home" :
    (r.startsWith("schedule")) ? "schedule" :
    (r === "timeoff") ? "timeoff" :
    "more";

  document.querySelectorAll("#spTabs .spTab").forEach(el => {
    const key = el.getAttribute("data-route");
    if (!key) return;
    el.classList.toggle("active", key === tabKey);
  });

  document.querySelectorAll(".nav-item").forEach(a => {
    const rr = (a.getAttribute("data-route") || "").toLowerCase();
    a.classList.toggle("active", rr === r);
  });

  applyMoreVisibility(statusForGate);
}

// ===============================
// PROGRESS (CHECKLIST)
// ===============================
function stepDone(userData, stepId) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const s = steps.find(x => x.id === stepId);
  return !!s?.done;
}
function setStepDoneLocal(userData, stepId, done) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const idx = steps.findIndex(x => x.id === stepId);
  if (idx >= 0) steps[idx].done = !!done;
  return steps;
}

// ===============================
// SCHEDULE / CALENDAR + MODULES
// ===============================
function renderScheduleTabs(active) {
  const tabs = [
    { id: "schedule", label: "Calendar", href: "#schedule" },
    { id: "schedule-timecard", label: "Time Card", href: "#schedule-timecard" },
    { id: "schedule-findshifts", label: "Find Shifts", href: "#schedule-findshifts" }
  ];
  return `
    <div class="azTabsTop">
      ${tabs.map(t => `<a href="${t.href}" class="${active === t.id ? "active" : ""}">${escapeHtml(t.label)}</a>`).join("")}
    </div>
  `;
}

function buildCalendarMatrix(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year, monthIndex, 0).getDate();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum <= 0) cells.push({ y: year, m: monthIndex - 1, d: prevDays + dayNum, muted: true });
    else if (dayNum > daysInMonth) cells.push({ y: year, m: monthIndex + 1, d: dayNum - daysInMonth, muted: true });
    else cells.push({ y: year, m: monthIndex, d: dayNum, muted: false });
  }
  return cells;
}

function renderScheduleCalendar(recordData, publicData) {
  const now = new Date();
  const state = window.__calState || { y: now.getFullYear(), m: now.getMonth(), sel: ymd(now) };
  window.__calState = state;

  const cells = buildCalendarMatrix(state.y, state.m);
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const shifts = Array.isArray(publicData?.company?.shifts) ? publicData.company.shifts : OFFICIAL_CONTENT.company.shifts;
  const appt = recordData?.appointment || {};

  const events = Array.isArray(recordData?.scheduleEvents) ? recordData.scheduleEvents : [];
  const eventMap = {};
  events.forEach(ev => {
    const k = ymd(ev?.date);
    if (!k) return;
    if (!eventMap[k]) eventMap[k] = [];
    eventMap[k].push(ev);
  });

  const todayKey = ymd(new Date());
  const selKey = state.sel || todayKey;
  const selEvents = eventMap[selKey] || [];

  const apptKey = ymd(appt?.date || "");
  const hasAppt = !!apptKey;

  const cal = `
    <div class="azCalWrap">
      <div class="azCalHead">
        <div class="azCalMonth">${escapeHtml(fmtMonthTitle(state.y, state.m))}</div>
        <div class="azCalNav">
          <button class="azCalBtn" id="calPrev" type="button" aria-label="Previous">${azIcon("chevL")}</button>
          <button class="azCalBtn" id="calNext" type="button" aria-label="Next">${azIcon("chevR")}</button>
        </div>
      </div>

      <div class="azCalGrid">
        ${dow.map(x => `<div class="azCalDow">${escapeHtml(x)}</div>`).join("")}
        ${cells.map(c => {
          const d = new Date(c.y, c.m, c.d);
          const key = ymd(d);
          const isToday = key === todayKey;
          const isSel = key === selKey;
          const hasDot = !!eventMap[key]?.length || (hasAppt && key === apptKey);

          const cls = [
            "azDay",
            c.muted ? "muted" : "",
            isToday ? "today" : "",
            isSel ? "sel" : ""
          ].join(" ").trim();

          return `
            <div class="${cls}" data-date="${escapeHtml(key)}">
              ${escapeHtml(String(c.d))}
              ${hasDot ? `<span class="dot"></span>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  const details = `
    <div class="azCard" style="margin-top:12px;">
      <div class="azCardTitle">Selected day</div>
      <div class="azCardSub">${escapeHtml(fmtDate(selKey))}</div>

      ${hasAppt && apptKey === selKey ? `
        <div style="margin-top:12px;border-top:1px solid rgba(229,234,242,.95);padding-top:12px;">
          <div class="azCardTitle">First day appointment</div>
          <div class="azCardSub">
            Time: ${escapeHtml(safe(appt?.time, OFFICIAL_CONTENT.company.firstDayArrival))}<br/>
            Address: ${escapeHtml(safe(appt?.address, OFFICIAL_CONTENT.company.address))}
          </div>
          ${appt?.notes ? `<div class="azCardSub" style="margin-top:8px;">${escapeHtml(appt.notes)}</div>` : ""}
        </div>
      ` : ""}

      <div style="margin-top:12px;border-top:1px solid rgba(229,234,242,.95);padding-top:12px;">
        <div class="azCardTitle">Shift information</div>
        <div class="azCardSub">
          ${shifts.map(s => `<div style="margin-top:6px;">${escapeHtml(s.label)}: ${escapeHtml(s.hours)}</div>`).join("")}
        </div>
      </div>

      <div style="margin-top:12px;border-top:1px solid rgba(229,234,242,.95);padding-top:12px;">
        <div class="azCardTitle">Events</div>
        ${selEvents.length ? `
          <div class="azCardSub">
            ${selEvents.map(e => `
              <div style="margin-top:10px;">
                <div style="font-weight:1000;">${escapeHtml(e.title || "Event")}</div>
                <div class="muted small" style="margin-top:3px;font-weight:900;">${escapeHtml(safe(e.time,""))} ${escapeHtml(safe(e.location,""))}</div>
                ${e.note ? `<div class="small" style="margin-top:4px;font-weight:900;color:rgba(2,6,23,.65);">${escapeHtml(e.note)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="azCardSub">No events for this day.</div>`}
      </div>
    </div>
  `;

  return cal + details;
}

function renderSchedule(recordData, publicData) {
  setPage("Schedule","",`${renderScheduleTabs("schedule")}${renderScheduleCalendar(recordData, publicData)}`);

  const prev = document.getElementById("calPrev");
  const next = document.getElementById("calNext");
  if (prev) prev.onclick = () => {
    const st = window.__calState;
    let y = st.y, m = st.m - 1;
    if (m < 0) { m = 11; y -= 1; }
    window.__calState = { ...st, y, m };
    navTo("#schedule");
  };
  if (next) next.onclick = () => {
    const st = window.__calState;
    let y = st.y, m = st.m + 1;
    if (m > 11) { m = 0; y += 1; }
    window.__calState = { ...st, y, m };
    navTo("#schedule");
  };

  document.querySelectorAll(".azDay[data-date]").forEach(el => {
    el.addEventListener("click", () => {
      const date = el.getAttribute("data-date");
      if (!date) return;
      window.__calState = { ...(window.__calState || {}), sel: date };
      navTo("#schedule");
    }, { passive: true });
  });
}

function renderTimecard(recordData) {
  const punches = Array.isArray(recordData?.timecard) ? recordData.timecard : [];
  const rows = punches.length ? punches : [
    { type: "Clock In", time: "—" },
    { type: "Meal Out", time: "—" },
    { type: "Meal In", time: "—" },
    { type: "Clock Out", time: "—" }
  ];

  setPage("Schedule","",`
    ${renderScheduleTabs("schedule-timecard")}
    <div class="azCard">
      <div class="azCardTitle">Time Card</div>
      <div class="azCardSub">Today’s punches (recorded by the system).</div>
      <div style="margin-top:12px;">
        ${rows.map(r => `
          <div class="azPunchRow">
            <div class="azPunchLeft">
              <div class="azPunchType">${escapeHtml(r.type || "")}</div>
              <div class="azPunchTime">${escapeHtml(r.time || "—")}</div>
            </div>
            <div class="muted small" style="font-weight:900;">${escapeHtml(safe(r.note,""))}</div>
          </div>
        `).join("")}
      </div>
      <div class="azCardSub" style="margin-top:12px;">If you believe your time is incorrect, submit a ticket within 48 hours.</div>
      <a class="azCardLink" href="#help"><span>Open support</span>${azIcon("chevR")}</a>
    </div>
  `);
}

function renderFindShifts(recordData) {
  const open = Array.isArray(recordData?.openShifts) ? recordData.openShifts : [
    { date: nowISODate(), shift: "Morning", hours: "6:00 AM – 2:30 PM", spots: 6 },
    { date: nowISODate(), shift: "Afternoon", hours: "2:00 PM – 10:30 PM", spots: 4 },
    { date: nowISODate(), shift: "Night", hours: "10:00 PM – 6:30 AM", spots: 2 }
  ];

  setPage("Schedule","",`
    ${renderScheduleTabs("schedule-findshifts")}
    <div class="azCard">
      <div class="azCardTitle">Find Shifts</div>
      <div class="azCardSub">Available shifts depend on operational needs.</div>
      <div style="margin-top:12px;">
        ${open.map(s => `
          <div class="azPunchRow">
            <div class="azPunchLeft">
              <div class="azPunchType">${escapeHtml(fmtDate(s.date))}</div>
              <div class="azPunchTime">${escapeHtml(s.shift)} • ${escapeHtml(s.hours)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="muted small" style="font-weight:900;">${escapeHtml(String(s.spots || 0))} spots</div>
              <button class="btn sm" type="button" data-claim="${escapeHtml(s.date)}|${escapeHtml(s.shift)}">Request</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="azCardSub" style="margin-top:12px;">Requests are reviewed by supervision based on staffing needs.</div>
    </div>
  `);

  document.querySelectorAll("[data-claim]").forEach(btn => {
    btn.addEventListener("click", () => uiToast("Request submitted."), { passive: true });
  });
}

// ===============================
// BASIC RENDERS (no locks, just "completed on first day")
// ===============================
function ul(items){
  const list = Array.isArray(items) ? items : [];
  if(!list.length) return "";
  return `<ul class="ul" style="margin-top:8px;">${list.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function statusBannerText(status) {
  const s = normalizeStatus(status);
  if (s === EMPLOYEE_STATUS.APPLICANT) return "Status: Applicant. Review the portal for next steps. HR will contact you if additional information is needed.";
  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) return "Status: Pre-onboarding. Confirm your shift preference and review first day requirements.";
  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) return "Status: First day scheduled. Review arrival instructions, I-9 requirements, and safety footwear policy.";
  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) return "Status: Active employee. Review site policies, safety information, and HR support options.";
  if (s === EMPLOYEE_STATUS.PAYROLL_ACTIVE) return "Status: Payroll active. Pay and pay stubs are available when posted by payroll.";
  if (s === EMPLOYEE_STATUS.FULLY_ACTIVE) return "Status: Fully active. Full access to portal modules.";
  return "Status: Active.";
}

function renderHome(publicData, recordData, userData){
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;

  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);
  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);

  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;

  const userStatus = normalizeStatus(userData?.status);

  setPage("Home","",`
    <div class="azTopRow">
      <div style="font-weight:1000;color:rgba(2,6,23,.75);">SunPower Portal</div>
      <div class="azTopIcons">
        <a class="azIconBtn" href="#help" aria-label="Help">${azIcon("chat")}</a>
        <a class="azIconBtn" href="#notifications" aria-label="Notifications">${azIcon("bell")}</a>
      </div>
    </div>

    <div class="azHero">
      <div class="azHeroInner">
        <div class="azHeroTitle">${escapeHtml(news?.[0]?.title || "SunPower Updates")}</div>
        <div class="azHeroSub">${escapeHtml(news?.[0]?.subtitle || "Company announcements and HR updates")}</div>
        <div class="azHeroPills">
          <a class="azPill" href="#notifications"><span>${escapeHtml(news?.[0]?.linkText || "All notifications")}</span>${azIcon("chevR")}</a>
          <a class="azPill" href="#company"><span>Company</span>${azIcon("chevR")}</a>
          <a class="azPill" href="#policies"><span>Policies</span>${azIcon("chevR")}</a>
        </div>
      </div>
    </div>

    <div class="azCard" style="margin-top:10px;">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.title)}</div>
      <div class="azCardSub" style="line-height:1.45;">${escapeHtml(statusBannerText(userStatus))}</div>
      <div class="azCardSub" style="margin-top:10px;line-height:1.45;">
        ${OFFICIAL_CONTENT.home.body.map(x => `<div style="margin-top:6px;">${escapeHtml(x)}</div>`).join("")}
      </div>
      <a class="azCardLink" href="#progress"><span>View checklist</span>${azIcon("chevR")}</a>
    </div>

    <div class="azRow2" style="margin-top:10px;">
      <div class="azCard">
        <div class="azCardTitle">First day info</div>
        <div class="azCardSub">Arrival time, address, what to bring, and day 1 flow.</div>
        <a class="azCardLink" href="#firstdayinfo"><span>Open</span>${azIcon("chevR")}</a>
      </div>
      <div class="azCard">
        <div class="azCardTitle">Safety footwear</div>
        <div class="azCardSub">Required from Day 1. Review reimbursement rules.</div>
        <a class="azCardLink" href="#footwearpolicy"><span>Open</span>${azIcon("chevR")}</a>
      </div>
    </div>

    <div class="azCard" style="margin-top:10px;">
      <div class="azCardTitle">${escapeHtml(String(maxHours))}h max</div>
      <div class="azCardSub">
        ${escapeHtml(Math.floor(scheduledMin / 60))}h ${escapeHtml(String(scheduledMin % 60).padStart(2,"0"))}m scheduled
        &nbsp;&nbsp;•&nbsp;&nbsp;
        ${escapeHtml(Math.floor(remainingMin / 60))}h ${escapeHtml(String(remainingMin % 60).padStart(2,"0"))}m remaining
      </div>
      <div class="azBar"><div style="width:${pct.toFixed(0)}%"></div></div>
    </div>

    <div class="azCard" style="margin-top:10px;">
      <div class="azCardTitle">${escapeHtml(String(punchesCount))} punches today</div>
      <div class="azCardSub">Last clocked in at ${escapeHtml(safe(recordData?.lastClockedIn, "—"))}</div>
      <a class="azCardLink" href="#schedule-timecard"><span>Open timecard</span>${azIcon("chevR")}</a>
    </div>

    <div class="azCard" style="margin-top:10px;">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.responsibilityTitle)}</div>
      ${ul(OFFICIAL_CONTENT.home.responsibility)}
    </div>

    <div class="azCard" style="margin-top:10px;">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.confidentialityTitle)}</div>
      ${ul(OFFICIAL_CONTENT.home.confidentiality)}
    </div>
  `);
}

function renderCompany(){
  setPage("Company","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.company.name)}</div>
      <div class="azCardSub">${escapeHtml(OFFICIAL_CONTENT.company.cityState)}</div>
      <div class="azCardSub" style="margin-top:10px;">
        Address: ${escapeHtml(OFFICIAL_CONTENT.company.address)}<br/>
        HR: ${escapeHtml(OFFICIAL_CONTENT.company.hrPhone)}<br/>
        Email: ${escapeHtml(OFFICIAL_CONTENT.company.hrEmail)}<br/>
        Hours: ${escapeHtml(OFFICIAL_CONTENT.company.hrHours)}<br/>
        Pay day: ${escapeHtml(OFFICIAL_CONTENT.company.payDay)}
      </div>
    </div>
  `);
}

function renderPolicies(){
  setPage("Policies","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.policies.title)}</div>
      ${OFFICIAL_CONTENT.policies.sections.map(s=>`
        <div style="margin-top:14px;">
          <div class="azCardTitle">${escapeHtml(s.h)}</div>
          ${ul(s.p)}
        </div>
      `).join("")}
    </div>
  `);
}

function renderFirstDayInfo(recordData){
  const appt = recordData?.appointment || {};
  setPage("First Day Info","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.firstDay.title)}</div>
      <div class="azCardSub">${escapeHtml(OFFICIAL_CONTENT.firstDay.purpose)}</div>

      <div style="margin-top:14px;">
        <div class="azCardTitle">Arrival</div>
        <div class="azCardSub">
          Time: ${escapeHtml(safe(appt?.time, OFFICIAL_CONTENT.company.firstDayArrival))}<br/>
          Address: ${escapeHtml(safe(appt?.address, OFFICIAL_CONTENT.company.address))}
        </div>
      </div>

      <div style="margin-top:14px;">
        <div class="azCardTitle">Bring</div>
        ${ul(OFFICIAL_CONTENT.firstDay.bring)}
      </div>

      <div style="margin-top:14px;">
        <div class="azCardTitle">Day 1 flow</div>
        ${ul(OFFICIAL_CONTENT.firstDay.flow)}
      </div>
    </div>
  `);
}

function renderI9(){
  setPage("I-9","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.i9.title)}</div>
      <div class="azCardSub">${escapeHtml(OFFICIAL_CONTENT.i9.purpose)}</div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Accepted documents</div>
        ${ul(OFFICIAL_CONTENT.i9.accepted)}
      </div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Rules</div>
        ${ul(OFFICIAL_CONTENT.i9.rules)}
      </div>
    </div>
  `);
}

function renderFootwearPolicy(){
  setPage("Footwear Policy","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.footwear.title)}</div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Purpose</div>
        ${ul(OFFICIAL_CONTENT.footwear.purpose)}
      </div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Required</div>
        ${ul(OFFICIAL_CONTENT.footwear.required)}
      </div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Specifications</div>
        ${ul(OFFICIAL_CONTENT.footwear.specs)}
      </div>
      <div style="margin-top:14px;">
        <div class="azCardTitle">Reimbursement</div>
        ${ul(OFFICIAL_CONTENT.footwear.reimbursement)}
        <div class="azCardSub" style="margin-top:10px;">
          Cap: ${escapeHtml(OFFICIAL_CONTENT.company.footwearReimbursementCap)} • Shop: ${escapeHtml(OFFICIAL_CONTENT.company.footwearShop)}
        </div>
      </div>
    </div>
  `);
}

function renderDocuments(){
  setPage("Documents","",`
    <div class="azCard">
      <div class="azCardTitle">Documents</div>
      <div class="azCardSub" style="line-height:1.45;">
        Onboarding documents are completed on the first day in person with HR.
      </div>
    </div>
  `);
}

function renderFirstDay(){
  setPage("First Day","",`
    <div class="azCard">
      <div class="azCardTitle">First Day</div>
      <div class="azCardSub" style="line-height:1.45;">
        Your first day will be completed on site. Follow your supervisor and HR instructions.
      </div>
    </div>
  `);
}

function renderTimeOff(){
  setPage("Benefits","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.benefits.title)}</div>
      <div class="azCardSub">${escapeHtml(OFFICIAL_CONTENT.benefits.note)}</div>
      ${ul(OFFICIAL_CONTENT.benefits.list)}
    </div>
  `);
}

function renderHours(recordData){
  const wk = Array.isArray(recordData?.weeklyHours) ? recordData.weeklyHours : [];
  setPage("My Hours","",`
    <div class="azCard">
      <div class="azCardTitle">Weekly summary</div>
      <div class="azCardSub">Recorded hours (view only).</div>
      <div style="margin-top:12px;">
        ${wk.length ? wk.map(x=>`
          <div class="azPunchRow">
            <div class="azPunchLeft">
              <div class="azPunchType">${escapeHtml(safe(x.week,"Week"))}</div>
              <div class="azPunchTime">${escapeHtml(String(safe(x.hours,0)))} hours</div>
            </div>
          </div>
        `).join("") : `<div class="azCardSub">No hours posted yet.</div>`}
      </div>
    </div>
  `);
}

function renderDeposit(){
  setPage("Direct Deposit","",`
    <div class="azCard">
      <div class="azCardTitle">Direct Deposit</div>
      <div class="azCardSub">View only. Changes are completed with HR.</div>
    </div>
  `);
}

function renderLegal(){
  setPage("Legal","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.legal.title)}</div>
      ${ul(OFFICIAL_CONTENT.legal.bullets)}
    </div>
  `);
}

function renderHelp(publicData){
  const phone = publicData?.help?.phone || OFFICIAL_CONTENT.company.hrPhone;
  const email = publicData?.help?.email || OFFICIAL_CONTENT.company.hrEmail;
  setPage("Help","",`
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.help.title)}</div>
      ${ul(OFFICIAL_CONTENT.help.body)}
      <div class="azCardSub" style="margin-top:12px;">
        Phone: ${escapeHtml(phone)}<br/>
        Email: ${escapeHtml(email)}
      </div>

      <div style="margin-top:14px;">
        <div class="azCardTitle">Support Ticket</div>
        <div class="azCardSub">Creates a formal record.</div>
        <textarea id="ticketText" class="input" rows="4" placeholder="Describe your request..."></textarea>
        <button class="btn" id="btnTicket" type="button" style="margin-top:10px;">Submit ticket</button>
      </div>
    </div>
  `);
}

function renderNotifications(publicData, userData){
  const global = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const all = [...personal, ...global].slice(0, 50);

  setPage("Notifications","",`
    <div class="azCard">
      <div class="azCardTitle">Notifications</div>
      <div style="margin-top:12px;">
        ${all.length ? all.map(n=>`
          <div class="azPunchRow">
            <div class="azPunchLeft">
              <div class="azPunchType">${escapeHtml(safe(n.title,"Update"))}</div>
              <div class="azPunchTime">${escapeHtml(safe(n.body,""))}</div>
            </div>
          </div>
        `).join("") : `<div class="azCardSub">No notifications.</div>`}
      </div>
    </div>
  `);
}

// ===============================
// SHIFT SELECTION (choose -> approved -> step done)
// ===============================
async function saveShiftSelection(user, empId, shiftLabel){
  if(!isFirebaseConfigured()) return;

  const userRef = doc(db,"users",user.uid);
  const recRef = RECORD_DOC(empId);

  // mark approved + step done
  const userSnap = await getDoc(userRef);
  const u = userSnap.exists() ? userSnap.data() : {};
  const steps = setStepDoneLocal(u, "shift_selection", true);

  await setDoc(userRef, {
    shift: { ...(u.shift || {}), shift: shiftLabel, approved: true },
    steps,
    updatedAt: serverTimestamp()
  }, { merge:true });

  await setDoc(recRef, {
    shift: { shift: shiftLabel, approved: true, approvedAt: serverTimestamp() }
  }, { merge:true });

  uiToast("Shift approved.");
}

function renderShiftSelection(user, empId, userData){
  const current = safe(userData?.shift?.shift,"");
  setPage("Shift Selection","",`
    <div class="azCard">
      <div class="azCardTitle">Choose your shift</div>
      <div class="azCardSub">Selecting a shift marks it as approved in your profile.</div>

      <div style="margin-top:12px;">
        ${OFFICIAL_CONTENT.company.shifts.map(s=>`
          <button class="btn" type="button" data-shift="${escapeHtml(s.label)}" style="width:100%;margin-top:10px;">
            ${escapeHtml(s.label)} • ${escapeHtml(s.hours)} ${current===s.label ? "(Selected)" : ""}
          </button>
        `).join("")}
      </div>
    </div>
  `);

  document.querySelectorAll("[data-shift]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const label = btn.getAttribute("data-shift");
      if(!label) return;
      await saveShiftSelection(user, empId, label);
      navTo("#progress");
    });
  });
}

// ===============================
// PROGRESS PAGE
// ===============================
function renderProgress(userData){
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const doneCount = steps.filter(s=>s.done).length;
  const pct = steps.length ? Math.round((doneCount/steps.length)*100) : 0;

  setPage("Progress","",`
    <div class="azCard">
      <div class="azCardTitle">Onboarding checklist</div>
      <div class="azCardSub">${escapeHtml(String(pct))}% complete</div>

      <div class="azBar" style="margin-top:12px;"><div style="width:${pct}%"></div></div>

      <div style="margin-top:14px;">
        ${steps.map(s=>`
          <div class="azPunchRow">
            <div class="azPunchLeft">
              <div class="azPunchType">${escapeHtml(s.label || "")}</div>
              <div class="azPunchTime">${s.done ? "Completed" : "Pending"}</div>
            </div>
            <div>
              ${s.id === "shift_selection" ? `<a class="azCardLink" href="#shift_selection"><span>Open</span>${azIcon("chevR")}</a>` : ""}
              ${s.id === "footwear" ? `<a class="azCardLink" href="#footwearpolicy"><span>Open</span>${azIcon("chevR")}</a>` : ""}
              ${s.id === "i9" ? `<a class="azCardLink" href="#i9"><span>Open</span>${azIcon("chevR")}</a>` : ""}
              ${s.id === "documents" ? `<a class="azCardLink" href="#documents"><span>Info</span>${azIcon("chevR")}</a>` : ""}
              ${s.id === "firstday" ? `<a class="azCardLink" href="#firstdayinfo"><span>Open</span>${azIcon("chevR")}</a>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `);
}

// ===============================
// ROUTER
// ===============================
function routeRender(route, publicData, recordData, userData, user, empId){
  if(route === "home") return renderHome(publicData, recordData, userData);
  if(route === "progress") return renderProgress(userData);
  if(route === "schedule") return renderSchedule(recordData, publicData);
  if(route === "schedule-timecard") return renderTimecard(recordData);
  if(route === "schedule-findshifts") return renderFindShifts(recordData);
  if(route === "timeoff") return renderTimeOff();
  if(route === "hours") return renderHours(recordData);
  if(route === "deposit") return renderDeposit();
  if(route === "company") return renderCompany();
  if(route === "policies") return renderPolicies();
  if(route === "firstdayinfo") return renderFirstDayInfo(recordData);
  if(route === "footwearpolicy") return renderFootwearPolicy();
  if(route === "footwear") return renderFootwearPolicy();
  if(route === "i9") return renderI9();
  if(route === "documents") return renderDocuments();
  if(route === "firstday") return renderFirstDay();
  if(route === "legal") return renderLegal();
  if(route === "notifications") return renderNotifications(publicData, userData);
  if(route === "help") return renderHelp(publicData);
  if(route === "shift_selection") return renderShiftSelection(user, empId, userData);

  // default
  return renderHome(publicData, recordData, userData);
}

// ===============================
// APP START
// ===============================
let unsubPublic = null;
let unsubRecord = null;
let unsubUser = null;

function cleanupSubs(){
  try { if(unsubPublic) unsubPublic(); } catch {}
  try { if(unsubRecord) unsubRecord(); } catch {}
  try { if(unsubUser) unsubUser(); } catch {}
  unsubPublic = unsubRecord = unsubUser = null;
}

onAuth(async (user)=>{
  cleanupSubs();

  if(!user){
    setPage("Sign in","",`<div class="azCard"><div class="azCardTitle">Please sign in.</div></div>`);
    return;
  }

  try{
    ensureChromeOnce();
    await ensureUserDocExists(user);

    const empId = await ensureEmployeeId(user);

    const userRef = doc(db,"users",user.uid);
    const pubRef = PUBLIC_DOC();
    const recRef = RECORD_DOC(empId);

    // live data
    unsubPublic = onSnapshot(pubRef, (snap)=>{
      window.__publicData = snap.exists() ? (snap.data()||{}) : defaultPublicContent();
      window.dispatchEvent(new Event("spData"));
    });

    unsubRecord = onSnapshot(recRef, (snap)=>{
      window.__recordData = snap.exists() ? (snap.data()||{}) : {};
      window.dispatchEvent(new Event("spData"));
    });

    unsubUser = onSnapshot(userRef, (snap)=>{
      window.__userData = snap.exists() ? (snap.data()||{}) : defaultUserDoc(user);
      window.dispatchEvent(new Event("spData"));
    });

    const rerender = ()=>{
      const publicData = window.__publicData || defaultPublicContent();
      const recordData = window.__recordData || {};
      const userData = window.__userData || defaultUserDoc(user);

      const status = normalizeStatus(userData?.status);
      const requested = routeName();
      const redirect = routeGuardRedirect(requested, status);
      if(redirect) return navTo(redirect);

      setActiveTabsAndSidebar(status);
      routeRender(requested, publicData, recordData, userData, user, empId);

      // help ticket wiring
      const btn = document.getElementById("btnTicket");
      if(btn){
        btn.onclick = async ()=>{
          const txt = (document.getElementById("ticketText")?.value || "").trim();
          if(!txt) return uiToast("Write your request.");
          await addDoc(TICKETS_COL(), {
            uid: user.uid,
            empId,
            text: txt,
            createdAt: serverTimestamp()
          });
          uiToast("Ticket submitted.");
          const ta = document.getElementById("ticketText");
          if(ta) ta.value = "";
        };
      }
    };

    window.addEventListener("hashchange", rerender);
    window.addEventListener("spData", rerender);

    // first render
    rerender();

  }catch(e){
    console.error(e);
    setPage("Error","",`<div class="azCard"><div class="azCardTitle">Access error</div><div class="azCardSub">${escapeHtml(String(e?.message||e))}</div></div>`);
  }
});
