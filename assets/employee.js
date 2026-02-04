// ===============================
// Employee Portal (SUNPOWER STYLE, NO EMOJIS)
// ✅ Uses YOUR app.css + YOUR HTML (NO CSS injected here)
// ✅ NO duplicate tab bars / NO injected bottom bars
// ✅ Works with existing .nav-item + bottomnav in HTML
// ✅ iPhone/Android taps: real click wiring for nav items
// ✅ Schedule calendar month grid + tabs
// ✅ Uses employeeRecords/{SP###} + portal/public + users/{uid}
// ✅ Employee ID gate allowedEmployees/{SP###} + optional range auto-allow
// ✅ Employee STATUS visibility rules (APPLICANT → FULLY ACTIVE)
// ✅ Shift selection => approved + step done
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, onSnapshot,
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

function canAccessRoute(route, status) {
  const s = normalizeStatus(status);

  if (route === "home") return true;

  if (s === EMPLOYEE_STATUS.APPLICANT) {
    return ["home", "notifications", "help"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) {
    return ["home","progress","shift_selection","firstdayinfo","help","notifications","company"].includes(route);
  }

  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) {
    return [
      "home","progress","shift_selection",
      "firstday","firstdayinfo","i9",
      "footwear","footwearpolicy",
      "help","notifications","company",
      "documents"
    ].includes(route);
  }

  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) {
    return [
      "home","progress","policies","footwearpolicy","legal","company",
      "schedule","schedule-timecard","schedule-findshifts",
      "hours","timeoff","deposit",
      "help","notifications",
      "footwear","i9","firstday","firstdayinfo",
      "documents",
      "shift_selection"
    ].includes(route);
  }

  // payroll + fully active can see all
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
    flow: ["Arrive 15–20 minutes early","HR check-in","Identity confirmation","I-9 verification","Safety video","Risk overview","Evacuation routes","Restricted areas","Supervisor introduction","Guided first tasks"]
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
    reimbursementRules: ["One-time only","First payroll only","Receipt required","Must be purchased through authorized store"]
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

// ===============================
// HELPERS / DOM SAFE
// ===============================
function qs(id){ return document.getElementById(id); }

function setPage(title, sub, html) {
  // Support multiple HTML variants (if you renamed IDs)
  const t = qs("pageTitle") || document.querySelector(".page-head h1") || qs("title");
  const s = qs("pageSub") || document.querySelector(".page-head .subhead") || qs("subhead");
  const b = qs("pageBody") || document.querySelector(".content") || qs("body");

  if (t) uiSetText(t, title);
  if (s) uiSetText(s, sub || "");
  if (b) b.innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function routeName() {
  const h = (location.hash || "#home").replace("#", "").trim().toLowerCase();
  return h || "home";
}

function navTo(hash) {
  const h = (hash || "#home").startsWith("#") ? hash : `#${hash}`;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
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

function ul(items){
  const list = Array.isArray(items) ? items : [];
  if(!list.length) return "";
  return `<ul class="ul" style="margin-top:8px;">${list.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

// ===============================
// DEFAULT DOCS
// ===============================
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
// NAV / HEADER SYNC (NO NEW BARS)
// ===============================
function wireExistingNav() {
  // Makes any .nav-item clickable by route
  const items = Array.from(document.querySelectorAll(".nav-item"));
  items.forEach(a => {
    const r = (a.getAttribute("data-route") || "").trim();
    if (!r) return;

    // Ensure href exists so mobile taps are consistent
    if (!a.getAttribute("href")) a.setAttribute("href", `#${r}`);

    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      navTo(`#${r}`);
    });
  });
}

function setActiveNav(statusForGate) {
  const r = routeName();
  document.querySelectorAll(".nav-item").forEach(a => {
    const rr = (a.getAttribute("data-route") || "").toLowerCase();
    a.classList.toggle("active", rr === r);

    // hide items that user cannot access (prevents “tap does nothing”)
    if (statusForGate) {
      const ok = canAccessRoute(rr, statusForGate);
      a.style.display = ok ? "" : "none";
    }
  });
}

function syncTopbar(empId, userData) {
  // Supports multiple possible IDs in your HTML (so you don’t have to rename)
  const status = normalizeStatus(userData?.status);

  const empEls = [
    qs("empId"),
    qs("empIdLabel"),
    qs("topEmpId"),
    qs("employeeIdTop"),
    document.querySelector("[data-bind='empId']")
  ].filter(Boolean);

  empEls.forEach(el => uiSetText(el, empId ? `Employee ID: ${empId}` : ""));

  const statusEls = [
    qs("statusChip"),
    qs("statusLabel"),
    document.querySelector("[data-bind='status']")
  ].filter(Boolean);

  statusEls.forEach(el => uiSetText(el, status));
}

// ===============================
// PROGRESS (CHECKLIST)
// ===============================
function setStepDoneLocal(userData, stepId, done) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const idx = steps.findIndex(x => x.id === stepId);
  if (idx >= 0) steps[idx].done = !!done;
  return steps;
}

// ===============================
// SCHEDULE / CALENDAR
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
          <button class="azCalBtn" id="calPrev" type="button" aria-label="Previous">&#x2039;</button>
          <button class="azCalBtn" id="calNext" type="button" aria-label="Next">&#x203A;</button>
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
    <div class="card" style="margin-top:12px;">
      <div class="card-title">Selected day</div>
      <div class="card-sub">${escapeHtml(fmtDate(selKey))}</div>

      ${hasAppt && apptKey === selKey ? `
        <div class="divider"></div>
        <div class="card-title">First day appointment</div>
        <div class="card-sub">
          Time: ${escapeHtml(safe(appt?.time, OFFICIAL_CONTENT.company.firstDayArrival))}<br/>
          Address: ${escapeHtml(safe(appt?.address, OFFICIAL_CONTENT.company.address))}
        </div>
      ` : ""}

      <div class="divider"></div>
      <div class="card-title">Shift information</div>
      <div class="card-sub">
        ${shifts.map(s => `<div style="margin-top:6px;">${escapeHtml(s.label)}: ${escapeHtml(s.hours)}</div>`).join("")}
      </div>

      <div class="divider"></div>
      <div class="card-title">Events</div>
      ${selEvents.length ? `
        <div class="card-sub">
          ${selEvents.map(e => `
            <div style="margin-top:10px;">
              <div style="font-weight:1000;">${escapeHtml(e.title || "Event")}</div>
              <div class="small muted" style="margin-top:3px;font-weight:900;">${escapeHtml(safe(e.time,""))} ${escapeHtml(safe(e.location,""))}</div>
              ${e.note ? `<div class="small" style="margin-top:4px;font-weight:900;color:rgba(2,6,23,.65);">${escapeHtml(e.note)}</div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : `<div class="card-sub">No events for this day.</div>`}
    </div>
  `;

  return cal + details;
}

function renderSchedule(recordData, publicData) {
  setPage("Schedule","",`
    <div class="card">
      ${renderScheduleTabs("schedule")}
      ${renderScheduleCalendar(recordData, publicData)}
    </div>
  `);

  const prev = qs("calPrev");
  const next = qs("calNext");

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
    });
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
    <div class="card">
      ${renderScheduleTabs("schedule-timecard")}
      <div class="card-title">Time Card</div>
      <div class="card-sub">Today’s punches (recorded by the system).</div>

      <div class="stack">
        ${rows.map(r => `
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(r.type || "")}</div>
              <div class="li-sub">${escapeHtml(r.time || "—")}</div>
            </div>
            <div class="small muted" style="font-weight:900;">${escapeHtml(safe(r.note,""))}</div>
          </div>
        `).join("")}
      </div>

      <div class="alert info">If you believe your time is incorrect, submit a ticket within 48 hours.</div>
      <a class="tile-link" href="#help">Open support</a>
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
    <div class="card">
      ${renderScheduleTabs("schedule-findshifts")}
      <div class="card-title">Find Shifts</div>
      <div class="card-sub">Available shifts depend on operational needs.</div>

      <div class="stack">
        ${open.map(s => `
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(fmtDate(s.date))} • ${escapeHtml(s.shift)}</div>
              <div class="li-sub">${escapeHtml(s.hours)} • ${escapeHtml(String(s.spots || 0))} spots</div>
            </div>
            <button class="btn sm" type="button" data-claim="${escapeHtml(s.date)}|${escapeHtml(s.shift)}">Request</button>
          </div>
        `).join("")}
      </div>

      <div class="alert info">Requests are reviewed by supervision based on staffing needs.</div>
    </div>
  `);

  document.querySelectorAll("[data-claim]").forEach(btn => {
    btn.addEventListener("click", () => uiToast("Request submitted."));
  });
}

// ===============================
// PAGES
// ===============================
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
    <div class="dash-grid">
      <div class="card">
        <div class="card-title">${escapeHtml(news?.[0]?.title || "SunPower Updates")}</div>
        <div class="card-sub">${escapeHtml(news?.[0]?.subtitle || "Company announcements and HR updates")}</div>

        <div class="divider"></div>

        <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.home.title)}</div>
        <div class="card-sub" style="line-height:1.45;">${escapeHtml(statusBannerText(userStatus))}</div>

        <div class="stack">
          ${OFFICIAL_CONTENT.home.body.map(x => `<div class="card-sub" style="margin-top:6px;line-height:1.45;">${escapeHtml(x)}</div>`).join("")}
        </div>

        <div class="divider"></div>

        <div class="tile-grid">
          <a class="tile" href="#progress">
            <div class="tile-title">Checklist</div>
            <div class="tile-sub">Onboarding progress</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#firstdayinfo">
            <div class="tile-title">First day info</div>
            <div class="tile-sub">Arrival time, address, what to bring</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#footwearpolicy">
            <div class="tile-title">Safety footwear</div>
            <div class="tile-sub">Required Day 1 • Reimbursement rules</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#schedule">
            <div class="tile-title">Schedule</div>
            <div class="tile-sub">Calendar and time card</div>
            <div class="tile-link">Open</div>
          </a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Quick status</div>
        <div class="card-sub">Operational metrics (view only).</div>

        <div class="divider"></div>

        <div class="kpi-grid">
          <div class="kpi">
            <div class="kpi-top">
              <div class="kpi-title">Max hours</div>
            </div>
            <div class="kpi-val">${escapeHtml(String(maxHours))}h</div>
            <div class="kpi-sub">Company policy cap</div>
          </div>

          <div class="kpi">
            <div class="kpi-top">
              <div class="kpi-title">Scheduled</div>
            </div>
            <div class="kpi-val">${escapeHtml(String(Math.floor(scheduledMin/60)))}h</div>
            <div class="kpi-sub">${escapeHtml(String(scheduledMin%60).padStart(2,"0"))}m minutes</div>
          </div>

          <div class="kpi">
            <div class="kpi-top">
              <div class="kpi-title">Remaining</div>
            </div>
            <div class="kpi-val">${escapeHtml(String(Math.floor(remainingMin/60)))}h</div>
            <div class="kpi-sub">${escapeHtml(String(remainingMin%60).padStart(2,"0"))}m minutes</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="card-title">Progress</div>
        <div class="progress" style="margin-top:10px;">
          <span style="width:${pct.toFixed(0)}%"></span>
        </div>

        <div class="divider"></div>

        <div class="card-title">${escapeHtml(String(punchesCount))} punches today</div>
        <div class="card-sub">Last clocked in at ${escapeHtml(safe(recordData?.lastClockedIn, "—"))}</div>
        <a class="tile-link" href="#schedule-timecard">Open timecard</a>
      </div>
    </div>
  `);
}

function renderCompany(){
  setPage("Company","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.company.name)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.company.cityState)}</div>
      <div class="divider"></div>
      <div class="kv">
        <div class="k">Address</div><div class="v">${escapeHtml(OFFICIAL_CONTENT.company.address)}</div>
        <div class="k">HR Phone</div><div class="v">${escapeHtml(OFFICIAL_CONTENT.company.hrPhone)}</div>
        <div class="k">HR Email</div><div class="v">${escapeHtml(OFFICIAL_CONTENT.company.hrEmail)}</div>
        <div class="k">Hours</div><div class="v">${escapeHtml(OFFICIAL_CONTENT.company.hrHours)}</div>
        <div class="k">Pay day</div><div class="v">${escapeHtml(OFFICIAL_CONTENT.company.payDay)}</div>
      </div>
    </div>
  `);
}

function renderPolicies(){
  setPage("Policies","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.policies.title)}</div>
      ${OFFICIAL_CONTENT.policies.sections.map(s=>`
        <div class="divider"></div>
        <div class="card-title">${escapeHtml(s.h)}</div>
        ${ul(s.p)}
      `).join("")}
    </div>
  `);
}

function renderFirstDayInfo(recordData){
  const appt = recordData?.appointment || {};
  setPage("First Day Info","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.firstDay.title)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.firstDay.purpose)}</div>

      <div class="divider"></div>
      <div class="card-title">Arrival</div>
      <div class="card-sub">
        Time: ${escapeHtml(safe(appt?.time, OFFICIAL_CONTENT.company.firstDayArrival))}<br/>
        Address: ${escapeHtml(safe(appt?.address, OFFICIAL_CONTENT.company.address))}
      </div>

      <div class="divider"></div>
      <div class="card-title">Bring</div>
      ${ul(OFFICIAL_CONTENT.firstDay.bring)}

      <div class="divider"></div>
      <div class="card-title">Day 1 flow</div>
      ${ul(OFFICIAL_CONTENT.firstDay.flow)}
    </div>
  `);
}

function renderI9(){
  setPage("I-9","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.i9.title)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.i9.purpose)}</div>

      <div class="divider"></div>
      <div class="card-title">Accepted documents</div>
      ${ul(OFFICIAL_CONTENT.i9.accepted)}

      <div class="divider"></div>
      <div class="card-title">Rules</div>
      ${ul(OFFICIAL_CONTENT.i9.rules)}
    </div>
  `);
}

function renderFootwearPolicy(){
  setPage("Footwear Policy","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.footwear.title)}</div>

      <div class="divider"></div>
      <div class="card-title">Purpose</div>
      ${ul(OFFICIAL_CONTENT.footwear.purpose)}

      <div class="divider"></div>
      <div class="card-title">Required</div>
      ${ul(OFFICIAL_CONTENT.footwear.required)}

      <div class="divider"></div>
      <div class="card-title">Specifications</div>
      ${ul(OFFICIAL_CONTENT.footwear.specs)}

      <div class="divider"></div>
      <div class="card-title">Reimbursement</div>
      ${ul(OFFICIAL_CONTENT.footwear.reimbursement)}
      <div class="card-sub" style="margin-top:10px;">
        Cap: ${escapeHtml(OFFICIAL_CONTENT.company.footwearReimbursementCap)} • Shop: ${escapeHtml(OFFICIAL_CONTENT.company.footwearShop)}
      </div>
    </div>
  `);
}

function renderDocuments(){
  setPage("Documents","",`
    <div class="card">
      <div class="card-title">Documents</div>
      <div class="card-sub" style="line-height:1.45;">
        Onboarding documents are completed on the first day in person with HR.
      </div>
    </div>
  `);
}

function renderFirstDay(){
  setPage("First Day","",`
    <div class="card">
      <div class="card-title">First Day</div>
      <div class="card-sub" style="line-height:1.45;">
        Your first day will be completed on site. Follow your supervisor and HR instructions.
      </div>
    </div>
  `);
}

function renderTimeOff(){
  setPage("Benefits","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.benefits.title)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.benefits.note)}</div>
      ${ul(OFFICIAL_CONTENT.benefits.list)}
    </div>
  `);
}

function renderHours(recordData){
  const wk = Array.isArray(recordData?.weeklyHours) ? recordData.weeklyHours : [];
  setPage("My Hours","",`
    <div class="card">
      <div class="card-title">Weekly summary</div>
      <div class="card-sub">Recorded hours (view only).</div>

      <div class="stack">
        ${wk.length ? wk.map(x=>`
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(safe(x.week,"Week"))}</div>
              <div class="li-sub">${escapeHtml(String(safe(x.hours,0)))} hours</div>
            </div>
          </div>
        `).join("") : `<div class="empty">No hours posted yet.</div>`}
      </div>
    </div>
  `);
}

function renderDeposit(){
  setPage("Direct Deposit","",`
    <div class="card">
      <div class="card-title">Direct Deposit</div>
      <div class="card-sub">View only. Changes are completed with HR.</div>
    </div>
  `);
}

function renderLegal(){
  setPage("Legal","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.legal.title)}</div>
      ${ul(OFFICIAL_CONTENT.legal.bullets)}
    </div>
  `);
}

function renderHelp(publicData){
  const phone = publicData?.help?.phone || OFFICIAL_CONTENT.company.hrPhone;
  const email = publicData?.help?.email || OFFICIAL_CONTENT.company.hrEmail;

  setPage("Help","",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.help.title)}</div>
      ${ul(OFFICIAL_CONTENT.help.body)}

      <div class="divider"></div>
      <div class="kv">
        <div class="k">Phone</div><div class="v">${escapeHtml(phone)}</div>
        <div class="k">Email</div><div class="v">${escapeHtml(email)}</div>
      </div>

      <div class="divider"></div>
      <div class="card-title">Support Ticket</div>
      <div class="card-sub">Creates a formal record.</div>
      <textarea id="ticketText" class="inp" rows="4" placeholder="Describe your request..."></textarea>
      <button class="btn" id="btnTicket" type="button">Submit ticket</button>
    </div>
  `);
}

function renderNotifications(publicData, userData){
  const global = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const all = [...personal, ...global].slice(0, 50);

  setPage("Notifications","",`
    <div class="card">
      <div class="card-title">Notifications</div>
      <div class="stack">
        ${all.length ? all.map(n=>`
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(safe(n.title,"Update"))}</div>
              <div class="li-sub">${escapeHtml(safe(n.body,""))}</div>
            </div>
          </div>
        `).join("") : `<div class="empty">No notifications.</div>`}
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
    <div class="card">
      <div class="card-title">Choose your shift</div>
      <div class="card-sub">Selecting a shift marks it as approved in your profile.</div>

      <div class="stack">
        ${OFFICIAL_CONTENT.company.shifts.map(s=>`
          <button class="btn" type="button" data-shift="${escapeHtml(s.label)}" style="width:100%;">
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
    <div class="card">
      <div class="card-title">Onboarding checklist</div>
      <div class="card-sub">${escapeHtml(String(pct))}% complete</div>

      <div class="progress" style="margin-top:12px;"><span style="width:${pct}%"></span></div>

      <div class="divider"></div>

      <div class="stack">
        ${steps.map(s=>`
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(s.label || "")}</div>
              <div class="li-sub">${s.done ? "Completed" : "Pending"}</div>
            </div>
            <div>
              ${s.id === "shift_selection" ? `<a class="tile-link" href="#shift_selection">Open</a>` : ""}
              ${s.id === "footwear" ? `<a class="tile-link" href="#footwearpolicy">Open</a>` : ""}
              ${s.id === "i9" ? `<a class="tile-link" href="#i9">Open</a>` : ""}
              ${s.id === "documents" ? `<a class="tile-link" href="#documents">Info</a>` : ""}
              ${s.id === "firstday" ? `<a class="tile-link" href="#firstdayinfo">Open</a>` : ""}
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
    setPage("Sign in","",`<div class="card"><div class="card-title">Please sign in.</div><div class="card-sub">Use the login screen to access the portal.</div></div>`);
    return;
  }

  try{
    wireExistingNav();
    await ensureUserDocExists(user);

    const empId = await ensureEmployeeId(user);

    const userRef = doc(db,"users",user.uid);
    const pubRef = PUBLIC_DOC();
    const recRef = RECORD_DOC(empId);

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

      // Make nav visible + active + gated
      setActiveNav(status);
      syncTopbar(empId, userData);

      routeRender(requested, publicData, recordData, userData, user, empId);

      // help ticket wiring
      const btn = qs("btnTicket");
      if(btn){
        btn.onclick = async ()=>{
          const txt = (qs("ticketText")?.value || "").trim();
          if(!txt) return uiToast("Write your request.");
          await addDoc(TICKETS_COL(), {
            uid: user.uid,
            empId,
            text: txt,
            createdAt: serverTimestamp()
          });
          uiToast("Ticket submitted.");
          const ta = qs("ticketText");
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
    setPage("Error","",`
      <div class="card">
        <div class="card-title">Access error</div>
        <div class="card-sub">${escapeHtml(String(e?.message||e))}</div>
      </div>
    `);
  }
});
