 // ===============================
// Employee Portal (SUNPOWER STYLE, NO EMOJIS)
// ✅ Bottom Tab Bar mobile: Home / Schedule / Benefits / More (4 tabs)
// ✅ Desktop keeps sidebar
// ✅ No "amazon a to z" text anywhere
// ✅ No "Ask A to Z" button anywhere
// ✅ iPhone/Android tap fix: buttons + JS navigation + safe-area padding
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

// Route access rules (per your spec)
function canAccessRoute(route, status) {
  const s = normalizeStatus(status);

  if (route === "home") return true;

  if (s === EMPLOYEE_STATUS.APPLICANT) {
    return ["home", "notifications", "help"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) {
    return ["home", "progress", "shift", "shift_selection", "firstdayinfo", "help", "notifications", "company"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) {
    return [
      "home", "progress", "shift", "shift_selection",
      "firstday", "firstdayinfo", "i9",
      "footwear", "footwearshop", "footwearpolicy",
      "help", "notifications", "company"
    ].includes(route);
  }

  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) {
    return [
      "home", "progress", "policies", "footwearpolicy", "legal", "company",
      "schedule", "schedule-timecard", "schedule-findshifts",
      "hours", "timeoff", "deposit",
      "help", "notifications",
      "footwear", "footwearshop", "i9", "firstday", "firstdayinfo"
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
      {
        h: "Conduct on site",
        p: [
          "Respect supervisors and co-workers",
          "Use professional language",
          "Follow site rules",
          "Zero violence or threats",
          "Zero harassment"
        ]
      },
      {
        h: "Cell phone use",
        p: [
          "In many operational areas, phone use is limited or prohibited",
          "Use only during breaks",
          "No use while operating equipment"
        ]
      },
      {
        h: "Dress code",
        p: [
          "Wear safe, comfortable work clothing",
          "No loose clothing that creates hazards",
          "Tie back long hair",
          "Use PPE where required"
        ]
      },
      {
        h: "Attendance and punctuality",
        p: [
          "Punctuality is critical in warehouse operations",
          "Arrive before your scheduled shift",
          "Late arrivals may result in warnings",
          "Absences without notice may result in discipline",
          "Call-outs: notify before your shift starts"
        ]
      }
    ]
  },

  firstDay: {
    title: "First Day",
    purpose: "Ensure a legal, safe, and organized start.",
    bring: [
      "Valid ID",
      "I-9 documents",
      "Approved safety footwear",
      "Appropriate work clothing"
    ],
    flow: [
      "Arrive 15–20 minutes early",
      "HR check-in",
      "Identity confirmation",
      "I-9 verification",
      "Safety video",
      "Risk overview",
      "Evacuation routes",
      "Restricted areas",
      "Supervisor introduction",
      "Guided first tasks"
    ],
    evaluation: [
      "Punctuality",
      "Safety attention",
      "Attitude",
      "Ability to follow instructions"
    ]
  },

  i9: {
    title: "I-9 Employment Verification",
    purpose: "Federal requirement.",
    accepted: [
      "U.S. Passport",
      "Permanent Resident Card (Green Card)",
      "Driver’s License + Social Security card"
    ],
    rules: [
      "Originals only",
      "Unexpired",
      "No copies",
      "Without a valid I-9 you cannot work"
    ]
  },

  footwear: {
    title: "Safety Footwear Program",
    purpose: [
      "Reduce foot injuries from pallets",
      "Mobile equipment",
      "Heavy boxes",
      "Slips and falls"
    ],
    required: [
      "Required from Day 1",
      "No approved footwear = no work on the operational floor"
    ],
    whereBuy: [
      "Purchase only through company-authorized store",
      "Footwear from non-authorized stores is not accepted"
    ],
    specs: [
      "Steel/composite toe",
      "Slip-resistant",
      "Certified",
      "Good condition"
    ],
    reimbursement: [
      "Employee buys approved footwear",
      "Employee submits receipt",
      "Safety validates",
      "Reimbursement included in first payroll"
    ],
    reimbursementRules: [
      "One-time only",
      "First payroll only",
      "Receipt required",
      "Must be purchased through authorized store"
    ],
    inspections: [
      "Safety may inspect at any time",
      "Damaged footwear must be replaced"
    ]
  },

  payroll: {
    title: "Payroll",
    how: [
      "Pay is based on recorded hours",
      "Cycle: Work → Time recorded → Supervisor approval → Processing → Direct deposit"
    ],
    firstPay: [
      "First pay occurs after completing the payroll cycle",
      "It may take 1–2 weeks depending on the start date and cycle cutoff"
    ],
    errors: [
      "Report pay errors within 48 hours"
    ],
    payStubs: {
      title: "Pay Stubs",
      include: ["Hours", "Rate", "Deductions", "Net pay"],
      note: "Available after the first payroll is processed."
    }
  },

  benefits: {
    title: "Benefits",
    note: "Benefits depend on the company and hours worked. May include:",
    list: [
      "PTO (if applicable)",
      "Holiday pay (if applicable)",
      "On-site training",
      "Promotion opportunities",
      "Workplace safety programs"
    ]
  },

  help: {
    title: "Help & Support",
    body: [
      "Contact HR for pay, schedules, safety, and documents.",
      "Use Support Tickets for formal requests (creates a record)."
    ]
  },

  emergency: {
    title: "Safety & Emergencies",
    body: [
      "In an emergency call 911.",
      "Then report to your supervisor."
    ]
  },

  legal: {
    title: "Legal",
    bullets: [
      "Policies may change.",
      "Safety compliance is mandatory.",
      "Benefits do not guarantee continued employment.",
      "Employment may be at-will per state law."
    ]
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
    ],
    safetyOrSupervisorPhoneNote: "Provided by your supervisor at check-in."
  }
};

// ---------- Route helpers ----------
function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}
function navTo(hash) {
  const h = (hash || "#home").startsWith("#") ? hash : `#${hash}`;
  if (location.hash === h) {
    // force rerender if needed
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = h;
  }
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
  } catch { return String(d || ""); }
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
  } catch { return ""; }
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
    site: {
      managerPhone: "",
      safetyPhone: "",
      address: OFFICIAL_CONTENT.company.address
    },
    home: {
      welcomeShort:
        "This portal is the official workplace communication system. Review it regularly for safety, schedules, and pay updates.",
      news: [
        {
          title: "SunPower Updates",
          subtitle: "Company announcements and HR updates",
          linkText: "All notifications",
          route: "notifications"
        }
      ]
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
    await setDoc(ref, { ...defaultUserDoc(user), ...patch, role: "employee", createdAt: serverTimestamp() }, { merge: true });
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
  } catch { return false; }
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
// ICONS
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
    dots: `<svg ${common}><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>`,
    search: `<svg ${common}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    clock: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>`
  };
  return icons[name] || icons.dots;
}

// ===============================
// MOBILE TABS + MORE SHEET (FIXED)
// ===============================
function ensureChromeOnce() {
  const btnMenu = document.getElementById("btnMenu");
  if (btnMenu) btnMenu.style.display = "none";

  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.display = isMobile() ? "none" : "";

  if (document.getElementById("azTabs")) return;

  const style = document.createElement("style");
  style.id = "azStyle";
  style.textContent = `
    body.portal.has-tabs .content{
      padding-bottom: calc(130px + env(safe-area-inset-bottom)) !important;
    }

    #azTabs{
      position:fixed; left:0; right:0; bottom:0;
      z-index:5000;
      background: rgba(255,255,255,.98);
      border-top:1px solid rgba(229,234,242,.95);
      display:none;
      padding-bottom: env(safe-area-inset-bottom);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 -10px 30px rgba(15,23,42,.08);
    }

    /* FLEX: no empty holes */
    #azTabs .az-wrap{
      max-width:980px;
      margin:0 auto;
      height: 84px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:12px 12px;
    }

    .az-tab{
      flex:1;
      min-width:0;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:6px;
      border-radius:14px;
      padding:10px 6px;
      border:1px solid transparent;
      user-select:none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      color: rgba(11,18,32,.85);
      font-weight:900;
      font-size:11px;
      background:transparent;
      cursor:pointer;
    }
    .az-ico{
      width:30px;height:30px;
      border-radius:999px;
      display:flex;align-items:center;justify-content:center;
      background: rgba(2,6,23,.04);
      color: rgba(2,6,23,.78);
    }
    .az-ico svg{ width:18px; height:18px; }
    .az-tab.active{ color: rgba(29,78,216,1); }
    .az-tab.active .az-ico{
      background: rgba(29,78,216,.10);
      color: rgba(29,78,216,1);
    }

    #azMoreOverlay{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; z-index:6000; }
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
      -webkit-overflow-scrolling: touch;
    }
    #azMoreSheet.open{ transform: translateY(0); }

    .azMoreHead{
      padding:14px 14px 10px;
      display:flex;align-items:center;justify-content:space-between;
      gap:10px;
      border-bottom:1px solid rgba(229,234,242,.95);
      position:sticky; top:0; background:rgba(255,255,255,.98);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
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
      cursor:pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .azMoreItem .sub{ font-size:12px; font-weight:800; color: var(--muted); margin-top:4px; }
    .azMoreArrow{ display:flex; align-items:center; justify-content:center; width:18px; height:18px; color: rgba(2,6,23,.45); }
    .azMoreArrow svg{ width:18px; height:18px; }

    .azTopRow{
      display:flex; align-items:center; justify-content:space-between;
      gap:10px; margin-bottom:10px;
    }
    .azTopIcons{ display:flex; gap:10px; }
    .azIconBtn{
      width:34px; height:34px;
      border-radius:999px;
      border:1px solid rgba(229,234,242,.95);
      background:#fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow: 0 10px 22px rgba(15,23,42,.05);
      color: rgba(2,6,23,.70);
    }
    .azIconBtn svg{ width:18px; height:18px; }

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

    .azWide{ margin-top:10px; }
    .azBar{
      height:10px; border-radius:999px;
      background: rgba(2,6,23,.08);
      overflow:hidden;
      border:1px solid rgba(229,234,242,.95);
      margin-top:10px;
    }
    .azBar > div{
      height:100%;
      background: rgba(29,78,216,.45);
      width:0%;
    }

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
      cursor:pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
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
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
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

  // Bottom tabs (4)
  const tabs = document.createElement("div");
  tabs.id = "azTabs";
  tabs.innerHTML = `
    <div class="az-wrap">
      <button class="az-tab" data-route="home" type="button">
        <div class="az-ico">${azIcon("home")}</div>
        <div>Home</div>
      </button>

      <button class="az-tab" data-route="schedule" type="button">
        <div class="az-ico">${azIcon("schedule")}</div>
        <div>Schedule</div>
      </button>

      <button class="az-tab" data-route="timeoff" type="button">
        <div class="az-ico">${azIcon("benefits")}</div>
        <div>Benefits</div>
      </button>

      <button class="az-tab" id="azMoreBtn" data-route="more" type="button">
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
      ${moreItem("progress","Progress","Onboarding checklist")}
      ${moreItem("company","Company","Site and HR info")}
      ${moreItem("policies","Policies","Warehouse rules")}
      ${moreItem("firstdayinfo","First Day Info","Arrival and requirements")}
      ${moreItem("shift","Shift Selection","Choose your preference")}
      ${moreItem("footwear","Safety Footwear","Program acknowledgement")}
      ${moreItem("footwearpolicy","Footwear Policy","Rules and reimbursement")}
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
      <button class="azMoreItem" type="button" data-route="${escapeHtml(route)}">
        <div>
          <div>${escapeHtml(title)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
        </div>
        <div class="azMoreArrow">${azIcon("chevR")}</div>
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

  document.getElementById("azMoreBtn").addEventListener("click", openMore);
  document.getElementById("azMoreClose").addEventListener("click", closeMore);
  overlay.addEventListener("click", closeMore);

  // Wire bottom tabs (tap fix)
  tabs.querySelectorAll("button.az-tab").forEach(btn => {
    const r = btn.getAttribute("data-route");
    if (!r) return;
    if (r === "more") return;
    btn.addEventListener("click", () => navTo(`#${r}`));
  });

  // Wire More sheet items
  sheet.querySelectorAll("button[data-route]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-route") || "home";
      closeMore();
      navTo(`#${r}`);
    });
  });

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
    if (overlay) overlay.style.display = "none";
    if (sheet) sheet.classList.remove("open");
  }
}

function applyMoreVisibility(status) {
  const s = normalizeStatus(status);
  const sheet = document.getElementById("azMoreSheet");
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

  document.querySelectorAll("#azTabs .az-tab").forEach(el => {
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
    const icon = done ? "✓" : "•";
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
// UI blocks
// ===============================
function sectionHeader(title, right = "") {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
}
function ul(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";
  return `<ul class="ul" style="margin-top:8px;">${list.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}
function azCard(title, sub, linkText, href) {
  return `
    <div class="azCard">
      <div class="azCardTitle">${escapeHtml(title)}</div>
      <div class="azCardSub">${escapeHtml(sub)}</div>
      ${href ? `
        <a class="azCardLink" href="${escapeHtml(href)}">
          <span>${escapeHtml(linkText || "Open")}</span>
          ${azIcon("chevR")}
        </a>
      ` : `
        <div class="azCardSub" style="margin-top:10px;">${escapeHtml(linkText || "")}</div>
      `}
    </div>
  `;
}

// ===============================
// HOME
// ===============================
function statusBannerText(status) {
  const s = normalizeStatus(status);
  if (s === EMPLOYEE_STATUS.APPLICANT) {
    return "Status: Applicant. Review the portal for next steps. HR will contact you if additional information is needed.";
  }
  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) {
    return "Status: Pre-onboarding. Confirm your shift preference and review first day requirements.";
  }
  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) {
    return "Status: First day scheduled. Review arrival instructions, I-9 requirements, and safety footwear policy.";
  }
  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) {
    return "Status: Active employee. Review site policies, safety information, and HR support options.";
  }
  if (s === EMPLOYEE_STATUS.PAYROLL_ACTIVE) {
    return "Status: Payroll active. Pay and pay stubs are available when posted by payroll.";
  }
  if (s === EMPLOYEE_STATUS.FULLY_ACTIVE) {
    return "Status: Fully active. Full access to portal modules.";
  }
  return "Status: Active.";
}

function renderHome(publicData, recordData, userData) {
  const news = Array.isArray(publicData?.home?.news) ? publicData.home.news : defaultPublicContent().home.news;

  const punches = Array.isArray(recordData?.punchesToday) ? recordData.punchesToday : [];
  const punchesCount = punches.length;

  const maxHours = clamp(recordData?.maxHours?.max || 60, 1, 120);
  const scheduledMin = clamp(recordData?.maxHours?.scheduledMinutes || 0, 0, 100000);
  const remainingMin = Math.max(0, (maxHours * 60) - scheduledMin);
  const pct = clamp((scheduledMin / (maxHours * 60)) * 100, 0, 100);

  const userStatus = normalizeStatus(userData?.status);

  setPage(
    "Home",
    "",
    `
      <div class="azTopRow">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="font-weight:1000;color:rgba(2,6,23,.75);">SunPower Portal</div>
        </div>
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
            <a class="azPill" href="#notifications">
              <span>${escapeHtml(news?.[0]?.linkText || "All notifications")}</span>
              ${azIcon("chevR")}
            </a>
            <a class="azPill" href="#company"><span>Company</span>${azIcon("chevR")}</a>
            <a class="azPill" href="#policies"><span>Policies</span>${azIcon("chevR")}</a>
          </div>
        </div>
      </div>

      <div style="height:10px"></div>

      <div class="azCard">
        <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.title)}</div>
        <div class="azCardSub" style="line-height:1.45;">
          ${escapeHtml(statusBannerText(userStatus))}
        </div>
        <div class="azCardSub" style="margin-top:10px;line-height:1.45;">
          ${OFFICIAL_CONTENT.home.body.map(x => `<div style="margin-top:6px;">${escapeHtml(x)}</div>`).join("")}
        </div>
        <a class="azCardLink" href="#progress">
          <span>View checklist</span>
          ${azIcon("chevR")}
        </a>
      </div>

      <div class="azWide">
        <div class="azRow2">
          ${azCard(
            "First day info",
            "Arrival time, address, what to bring, and day 1 flow.",
            "Open",
            "#firstdayinfo"
          )}
          ${azCard(
            "Safety footwear",
            "Required from Day 1. Shop approved footwear and review reimbursement rules.",
            "Open",
            "#footwearpolicy"
          )}
        </div>
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">${escapeHtml(String(maxHours))}h max</div>
          <div class="azCardSub">
            ${escapeHtml(Math.floor(scheduledMin / 60))}h ${escapeHtml(String(scheduledMin % 60).padStart(2,"0"))}m scheduled
            &nbsp;&nbsp;•&nbsp;&nbsp;
            ${escapeHtml(Math.floor(remainingMin / 60))}h ${escapeHtml(String(remainingMin % 60).padStart(2,"0"))}m remaining
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
        <div class="azCard">
          <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.responsibilityTitle)}</div>
          ${ul(OFFICIAL_CONTENT.home.responsibility)}
        </div>
      </div>

      <div class="azWide">
        <div class="azCard">
          <div class="azCardTitle">${escapeHtml(OFFICIAL_CONTENT.home.confidentialityTitle)}</div>
          ${ul(OFFICIAL_CONTENT.home.confidentiality)}
        </div>
      </div>

      <div style="height:8px"></div>
    `
  );
}
