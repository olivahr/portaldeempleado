// assets/employee.js
// ===============================
// Employee Portal (SUNPOWER STYLE, NO EMOJIS)
// ✅ Matches YOUR employee.html routes EXACTLY
// ✅ Renders into: #pageTitle, #pageSub, #pageBody, #stagebar, #userBadge
// ✅ NO CSS injected / NO duplicate nav bars
// ✅ Firestore: portal/public + employeeRecords/{SP###} + users/{uid}
// ✅ Tickets: supportTickets
// ===============================

import {
  uiSetText,
  uiToast,
  escapeHtml,
  uiShow,
  uiEmptyState,
  uiSetLoading
} from "./ui.js";

import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, onSnapshot,
  serverTimestamp, collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Firestore refs ----------
const PUBLIC_DOC = () => doc(db, "portal", "public");
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);
const USER_DOC = (uid) => doc(db, "users", uid);
const TICKETS_COL = () => collection(db, "supportTickets");

// ✅ Range auto-allow (avoid adding 180 IDs by hand)
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ===============================
// STATUS + VISIBILITY (kept)
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

// Routes MUST match your HTML data-route/href exactly
const ROUTES = [
  "home","progress","shift","footwear","i9","documents","firstday",
  "schedule","hours","payroll","timeoff","deposit",
  "notifications","help","more"
];

function canAccessRoute(route, status) {
  const r = String(route || "").toLowerCase();
  const s = normalizeStatus(status);

  if (!ROUTES.includes(r)) return true;
  if (r === "home") return true;

  // Applicant sees only basic pages
  if (s === EMPLOYEE_STATUS.APPLICANT) {
    return ["home","notifications","help","more"].includes(r);
  }

  // Pre onboarding: can do progress + shift + info pages
  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) {
    return ["home","progress","shift","footwear","i9","documents","firstday","help","notifications","more","schedule"].includes(r);
  }

  // First day scheduled
  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) {
    return [
      "home","progress","shift","footwear","i9","documents","firstday",
      "schedule","help","notifications","more"
    ].includes(r);
  }

  // Active employee: most modules except payroll may still be restricted by HR
  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) {
    return [
      "home","progress","shift","footwear","i9","documents","firstday",
      "schedule","hours","timeoff","deposit",
      "help","notifications","more"
    ].includes(r);
  }

  // Payroll active / fully active see all
  if (s === EMPLOYEE_STATUS.PAYROLL_ACTIVE) return true;
  if (s === EMPLOYEE_STATUS.FULLY_ACTIVE) return true;

  return true;
}

function routeGuardRedirect(route, status) {
  const r = String(route || "home").toLowerCase();
  if (canAccessRoute(r, status)) return null;

  const s = normalizeStatus(status);
  if (s === EMPLOYEE_STATUS.APPLICANT) return "#home";
  if (s === EMPLOYEE_STATUS.PRE_ONBOARDING) return "#progress";
  if (s === EMPLOYEE_STATUS.FIRST_DAY_SCHEDULED) return "#progress";
  if (s === EMPLOYEE_STATUS.ACTIVE_EMPLOYEE) return "#home";
  return "#home";
}

// ===============================
// OFFICIAL CONTENT (filled)
// NOTE: If you want even more text later, you can expand these blocks.
// ===============================
const OFFICIAL_CONTENT = {
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
  },

  home: {
    title: "Welcome to the Employee Portal",
    paragraphs: [
      "This portal is the official communication system between the employee and the company.",
      "Important information related to employment, safety, schedules, pay, and site rules is published here.",
      "Your portal activity may be used for administrative, legal, and operational purposes.",
      "Review this portal regularly. Not reviewing posted information does not remove employee responsibility."
    ],
    responsibilities: [
      "Confirm your schedule and arrival time",
      "Review safety and policy updates",
      "Complete required onboarding steps on time",
      "Report pay issues promptly through Support Tickets",
      "Keep your contact information accurate"
    ],
    confidentiality: [
      "Do not share your portal access with anyone",
      "Do not attempt to access another employee account",
      "Do not disclose restricted operational information",
      "Violations may result in corrective action up to termination"
    ]
  },

  footwear: {
    title: "Safety Footwear Program",
    purpose: [
      "Reduce foot injuries from pallets, carts, and heavy materials",
      "Prevent slips on smooth concrete and wet surfaces",
      "Meet site safety requirements for warehouse operations"
    ],
    required: [
      "Required from Day 1 on the operational floor",
      "If footwear is not approved, you may be restricted from working in production areas"
    ],
    specs: [
      "Steel or composite toe (safety rated)",
      "Slip-resistant outsole",
      "Closed-heel, supportive work boot/shoe",
      "Good condition (no exposed toe, no major damage)"
    ],
    purchaseRules: [
      "Purchase only through the company-authorized store",
      "Footwear from non-authorized sources may not be accepted for reimbursement or site approval"
    ],
    reimbursement: [
      "Purchase approved footwear through the authorized store",
      "Submit receipt (or proof of purchase) if requested",
      "Safety/HR validates compliance",
      "Reimbursement is included in the first payroll after you begin work"
    ],
    reimbursementRules: [
      "One-time reimbursement only",
      "First payroll only",
      "Receipt required if requested",
      "Must be an approved purchase through the authorized store"
    ]
  },

  i9: {
    title: "I-9 Employment Verification",
    purpose: "Federal requirement for employment eligibility.",
    accepted: [
      "U.S. Passport",
      "Permanent Resident Card (Green Card)",
      "Driver’s License + Social Security card (or other valid combination)"
    ],
    rules: [
      "Original documents only (no photos, no copies)",
      "Documents must be unexpired",
      "I-9 must be completed before you can begin work"
    ]
  },

  firstDay: {
    title: "First Day Instructions",
    purpose: "Ensure a legal, safe, and organized start.",
    bring: [
      "Valid identification (for I-9)",
      "I-9 documents required by HR",
      "Approved safety footwear",
      "Work-appropriate clothing (warehouse safe)"
    ],
    flow: [
      "Arrive 15–20 minutes early for check-in",
      "HR check-in and identity verification",
      "I-9 verification and onboarding confirmation",
      "Safety orientation (PPE, walkways, restricted areas)",
      "Site rules, emergency exits, evacuation routes",
      "Supervisor introduction and first task assignment"
    ]
  },

  benefits: {
    title: "Benefits & Time Off",
    note: [
      "Benefits depend on company policy and eligibility (hours worked and employment status).",
      "Some items may require a waiting period or HR activation.",
      "Always confirm eligibility details with HR if you are unsure."
    ],
    list: [
      "Time Off / PTO (if applicable)",
      "Holiday pay (if applicable)",
      "Workplace safety programs and training",
      "Opportunities for growth and promotion based on performance and attendance"
    ],
    timeOffRules: [
      "Time Off requests are reviewed based on staffing and operational needs",
      "Submit requests as early as possible",
      "Repeated no-call/no-show may result in corrective action"
    ]
  },

  payroll: {
    title: "Payroll",
    overview: [
      "Payroll information is posted by payroll/HR once your status is eligible.",
      "Pay day is weekly on Friday (subject to banking processing times).",
      "If you believe your pay is incorrect, submit a Support Ticket as soon as possible."
    ],
    stubs: [
      "Pay stubs are provided when payroll is active",
      "Direct deposit changes must be completed with HR unless otherwise approved"
    ],
    issues: [
      "Submit pay issues within 48 hours when possible",
      "Include dates, shift, and a short description of the issue"
    ]
  },

  help: {
    title: "Help & Support",
    body: [
      "Contact HR for schedules, onboarding, footwear, pay, and documents.",
      "Support Tickets create a formal record and help HR respond faster."
    ]
  },

  policies: {
    title: "General Warehouse Policies",
    sections: [
      { h: "Conduct on site", p: ["Respect supervisors and co-workers","Use professional language","Zero violence or threats","Zero harassment","Follow site rules and posted instructions"] },
      { h: "Cell phone use", p: ["Phone use may be limited or prohibited in operational areas","Use only during breaks","No phone use while operating equipment"] },
      { h: "Dress code", p: ["Wear safe, comfortable work clothing","No loose clothing that creates hazards","Tie back long hair","Use PPE where required"] },
      { h: "Attendance and punctuality", p: ["Arrive before your scheduled shift","Late arrivals may result in warnings","Absences without notice may result in discipline","Notify before your shift starts if you must call out"] }
    ]
  },

  legal: {
    title: "Legal",
    bullets: [
      "Policies may change at any time.",
      "Safety compliance is mandatory.",
      "Benefits do not guarantee continued employment.",
      "Employment may be at-will per state law."
    ]
  }
};

// ===============================
// DOM helpers
// ===============================
function qs(id){ return document.getElementById(id); }

function setPage(title, sub, html) {
  const t = qs("pageTitle");
  const s = qs("pageSub");
  const b = qs("pageBody");

  if (t) uiSetText(t, title);
  if (s) uiSetText(s, sub || "");
  if (b) b.innerHTML = html;
}

function setStagebar(html = "", show = false){
  const el = qs("stagebar");
  if (!el) return;
  el.innerHTML = html || "";
  uiShow(el, !!show);
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

function ul(items){
  const list = Array.isArray(items) ? items : [];
  if(!list.length) return "";
  return `<ul class="ul" style="margin-top:8px;">${list.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
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

// ===============================
// Default docs
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

    // MUST match your steps/routes
    steps: [
      { id: "application", label: "Application", done: true, lock: false },
      { id: "shift", label: "Shift Selection", done: false, lock: false },
      { id: "footwear", label: "Safety Footwear", done: false, lock: false },
      { id: "i9", label: "I-9 Documents", done: false, lock: false },

      // Per your requirement: Documents + First Day appear locked and completed in person
      { id: "documents", label: "Documents (In person)", done: false, lock: true },
      { id: "firstday", label: "First Day (In person)", done: false, lock: true }
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

  const ref = USER_DOC(user.uid);
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

  const userRef = USER_DOC(user.uid);
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
// NAV sync (no duplicates)
// ===============================
function setActiveNav(statusForGate) {
  const r = routeName();
  document.querySelectorAll(".nav-item").forEach(a => {
    const rr = (a.getAttribute("data-route") || "").trim().toLowerCase();

    // ensure href for consistent tap behavior
    if (rr && !a.getAttribute("href")) a.setAttribute("href", `#${rr}`);

    a.classList.toggle("active", rr === r);

    if (statusForGate) {
      const ok = canAccessRoute(rr, statusForGate);
      // keep available, hide restricted so user doesn’t tap into blank
      a.style.display = ok ? "" : "none";
    }
  });
}

function syncTopbar(empId, userData) {
  const badge = qs("userBadge");
  const status = normalizeStatus(userData?.status);

  const name = safe(userData?.fullName, "");
  const label = empId ? empId : "—";
  const s = status ? ` • ${status}` : "";

  uiSetText(badge, name ? `${name} • ${label}${s}` : `${label}${s}`);
}

// ===============================
// SCHEDULE calendar (clean)
// ===============================
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

  const appt = recordData?.appointment || {};
  const apptKey = ymd(appt?.date || "");

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

  const cal = `
    <div class="cal">
      <div class="cal-head">
        <div class="cal-title">${escapeHtml(fmtMonthTitle(state.y, state.m))}</div>
        <div class="cal-actions">
          <button class="btn sm ghost" id="calPrev" type="button">Prev</button>
          <button class="btn sm ghost" id="calNext" type="button">Next</button>
        </div>
      </div>

      <div class="cal-grid">
        ${dow.map(x => `<div class="cal-dow">${escapeHtml(x)}</div>`).join("")}
        ${cells.map(c => {
          const d = new Date(c.y, c.m, c.d);
          const key = ymd(d);
          const isToday = key === todayKey;
          const hasDot = !!eventMap[key]?.length || (apptKey && key === apptKey);

          const cls = [
            "cal-day",
            c.muted ? "is-off" : "",
            isToday ? "is-today" : ""
          ].join(" ").trim();

          return `
            <div class="${cls}" data-date="${escapeHtml(key)}">
              <div class="d">${escapeHtml(String(c.d))}</div>
              <div class="m">${hasDot ? "Update" : ""}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="card-title">Selected day</div>
      <div class="card-sub">${escapeHtml(fmtDate(selKey))}</div>

      ${apptKey && apptKey === selKey ? `
        <div class="divider"></div>
        <div class="card-title">First day appointment</div>
        <div class="card-sub">
          Time: ${escapeHtml(safe(appt?.time, OFFICIAL_CONTENT.company.firstDayArrival))}<br/>
          Address: ${escapeHtml(safe(appt?.address, OFFICIAL_CONTENT.company.address))}
        </div>
      ` : ""}

      <div class="divider"></div>
      <div class="card-title">Events</div>
      ${selEvents.length ? `
        <div class="card-sub">
          ${selEvents.map(e => `
            <div style="margin-top:10px;">
              <div style="font-weight:1000;">${escapeHtml(e.title || "Event")}</div>
              <div class="small muted" style="margin-top:3px;font-weight:900;">
                ${escapeHtml(safe(e.time,""))} ${escapeHtml(safe(e.location,""))}
              </div>
              ${e.note ? `<div class="small" style="margin-top:4px;font-weight:900;color:rgba(2,6,23,.65);">${escapeHtml(e.note)}</div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : `<div class="card-sub">No events for this day.</div>`}
    </div>
  `;
  return cal;
}

// ===============================
// PAGES (match HTML routes)
// ===============================
function renderHome(publicData, recordData, userData){
  const status = normalizeStatus(userData?.status);
  const company = OFFICIAL_CONTENT.company;

  setStagebar("", false);

  setPage("Home","Quick access to your schedule, time, pay, and support.",`
    <div class="dash-grid">
      <div class="card">
        <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.home.title)}</div>
        <div class="card-sub" style="line-height:1.45;">
          Status: ${escapeHtml(status)} • Pay day: ${escapeHtml(company.payDay)} • HR: ${escapeHtml(company.hrPhone)}
        </div>

        <div class="divider"></div>
        ${OFFICIAL_CONTENT.home.paragraphs.map(p=>`<div class="card-sub" style="margin-top:8px;line-height:1.45;">${escapeHtml(p)}</div>`).join("")}

        <div class="divider"></div>
        <div class="grid2">
          <div>
            <div class="card-title">Employee responsibility</div>
            ${ul(OFFICIAL_CONTENT.home.responsibilities)}
          </div>
          <div>
            <div class="card-title">Confidentiality</div>
            ${ul(OFFICIAL_CONTENT.home.confidentiality)}
          </div>
        </div>

        <div class="divider"></div>

        <div class="tile-grid">
          <a class="tile" href="#progress" data-route="progress">
            <div class="tile-title">Progress</div>
            <div class="tile-sub">Onboarding checklist</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#schedule" data-route="schedule">
            <div class="tile-title">Schedule</div>
            <div class="tile-sub">Calendar and events</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#payroll" data-route="payroll">
            <div class="tile-title">Payroll</div>
            <div class="tile-sub">Pay information and support</div>
            <div class="tile-link">Open</div>
          </a>

          <a class="tile" href="#help" data-route="help">
            <div class="tile-title">Help</div>
            <div class="tile-sub">HR contact and support tickets</div>
            <div class="tile-link">Open</div>
          </a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Company</div>
        <div class="card-sub">${escapeHtml(company.name)} • ${escapeHtml(company.cityState)}</div>

        <div class="divider"></div>
        <div class="kv">
          <div class="k">Address</div><div class="v">${escapeHtml(company.address)}</div>
          <div class="k">HR Phone</div><div class="v">${escapeHtml(company.hrPhone)}</div>
          <div class="k">HR Email</div><div class="v">${escapeHtml(company.hrEmail)}</div>
          <div class="k">Hours</div><div class="v">${escapeHtml(company.hrHours)}</div>
          <div class="k">First day arrival</div><div class="v">${escapeHtml(company.firstDayArrival)}</div>
        </div>

        <div class="divider"></div>
        <div class="card-title">Shifts</div>
        <div class="card-sub">
          ${company.shifts.map(s=>`<div style="margin-top:8px;"><b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.hours)}</div>`).join("")}
        </div>

        <div class="divider"></div>
        <div class="alert info">
          Keep your portal up to date. If you need help, use Support Tickets so HR has a record.
        </div>
      </div>
    </div>
  `);
}

function renderProgress(userData){
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const doneCount = steps.filter(s=>s.done).length;
  const pct = steps.length ? Math.round((doneCount/steps.length)*100) : 0;

  setStagebar(`
    <div class="pill blue">Checklist</div>
    <div class="pill">${escapeHtml(String(pct))}% complete</div>
    <div class="pill ok">${escapeHtml(String(doneCount))}/${escapeHtml(String(steps.length))} steps</div>
  `, true);

  setPage("Progress","Complete your onboarding steps before your first day.",`
    <div class="card">
      <div class="card-title">Onboarding checklist</div>
      <div class="card-sub">This checklist helps HR verify your readiness for work.</div>

      <div class="progress" style="margin-top:12px;"><span style="width:${pct}%"></span></div>

      <div class="divider"></div>

      <div class="stack">
        ${steps.map(s=>`
          <div class="list-item">
            <div>
              <div class="li-title">${escapeHtml(s.label || "")}</div>
              <div class="li-sub">
                ${s.lock ? "Locked (completed in person)" : (s.done ? "Completed" : "Pending")}
              </div>
            </div>
            <div class="small muted" style="font-weight:900;">
              ${!s.lock && s.id === "shift" ? `<a class="tile-link" href="#shift" data-route="shift">Open</a>` : ""}
              ${!s.lock && s.id === "footwear" ? `<a class="tile-link" href="#footwear" data-route="footwear">Open</a>` : ""}
              ${!s.lock && s.id === "i9" ? `<a class="tile-link" href="#i9" data-route="i9">Open</a>` : ""}
              ${s.lock && s.id === "documents" ? `In person` : ""}
              ${s.lock && s.id === "firstday" ? `In person` : ""}
            </div>
          </div>
        `).join("")}
      </div>

      <div class="alert warn">
        Documents and First Day items are completed on site with HR. They will be marked complete in person.
      </div>
    </div>
  `);
}

async function saveShiftSelection(user, empId, shiftLabel){
  if(!isFirebaseConfigured()) return;

  const userRef = USER_DOC(user.uid);
  const recRef = RECORD_DOC(empId);

  const userSnap = await getDoc(userRef);
  const u = userSnap.exists() ? userSnap.data() : {};
  const steps = Array.isArray(u?.steps) ? u.steps : [];

  const idx = steps.findIndex(x => x.id === "shift");
  if (idx >= 0) steps[idx].done = true;

  await setDoc(userRef, {
    shift: { ...(u.shift || {}), shift: shiftLabel, approved: true },
    steps,
    updatedAt: serverTimestamp()
  }, { merge:true });

  await setDoc(recRef, {
    shift: { shift: shiftLabel, approved: true, approvedAt: serverTimestamp() }
  }, { merge:true });

  uiToast("Shift saved.");
}

function renderShift(user, empId, userData){
  const current = safe(userData?.shift?.shift,"");

  setStagebar("", false);

  setPage("Shift Selection","Choose the shift you want HR to keep on file.",`
    <div class="card">
      <div class="card-title">Choose your shift</div>
      <div class="card-sub">Selecting a shift updates your profile. HR may adjust based on staffing needs.</div>

      <div class="stack">
        ${OFFICIAL_CONTENT.company.shifts.map(s=>`
          <button class="btn" type="button" data-shift="${escapeHtml(s.label)}" style="width:100%;">
            ${escapeHtml(s.label)} • ${escapeHtml(s.hours)} ${current===s.label ? "(Selected)" : ""}
          </button>
        `).join("")}
      </div>

      <div class="alert info">If you need a different schedule, submit a Support Ticket.</div>
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

function renderFootwear(){
  const c = OFFICIAL_CONTENT.company;

  setStagebar("", false);

  setPage("Safety Footwear","Required from Day 1 • Reimbursement on first payroll after you begin work.",`
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
      <div class="card-title">Where to purchase</div>
      ${ul(OFFICIAL_CONTENT.footwear.purchaseRules)}
      <div class="card-sub" style="margin-top:10px;">
        Authorized store: <b>${escapeHtml(c.footwearShop)}</b>
      </div>

      <div class="divider"></div>
      <div class="card-title">Reimbursement</div>
      ${ul(OFFICIAL_CONTENT.footwear.reimbursement)}
      <div class="divider"></div>
      <div class="card-title">Reimbursement rules</div>
      ${ul(OFFICIAL_CONTENT.footwear.reimbursementRules)}

      <div class="alert ok">
        Reimbursement cap: ${escapeHtml(c.footwearReimbursementCap)} • Reimbursement is included in the first payroll after you begin work (when eligible).
      </div>
    </div>
  `);
}

function renderI9(){
  setStagebar("", false);

  setPage("I-9","Employment verification is required before you can begin work.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.i9.title)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.i9.purpose)}</div>

      <div class="divider"></div>
      <div class="card-title">Accepted documents</div>
      ${ul(OFFICIAL_CONTENT.i9.accepted)}

      <div class="divider"></div>
      <div class="card-title">Rules</div>
      ${ul(OFFICIAL_CONTENT.i9.rules)}

      <div class="alert warn">
        Without valid I-9 verification, you cannot work on site.
      </div>
    </div>
  `);
}

function renderDocuments(){
  setStagebar("", false);

  setPage("Documents","Completed in person with HR on your first day.",`
    ${uiEmptyState({
      title: "Documents are completed in person",
      body: "Onboarding documents are completed on site with HR. This section will unlock once HR marks completion."
    })}
  `);
}

function renderFirstDay(recordData){
  setStagebar("", false);

  const appt = recordData?.appointment || {};
  const c = OFFICIAL_CONTENT.company;

  setPage("First Day","Arrive early and follow HR and supervisor instructions.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.firstDay.title)}</div>
      <div class="card-sub">${escapeHtml(OFFICIAL_CONTENT.firstDay.purpose)}</div>

      <div class="divider"></div>
      <div class="card-title">Arrival</div>
      <div class="card-sub">
        Time: <b>${escapeHtml(safe(appt?.time, c.firstDayArrival))}</b><br/>
        Address: <b>${escapeHtml(safe(appt?.address, c.address))}</b>
      </div>

      <div class="divider"></div>
      <div class="card-title">Bring</div>
      ${ul(OFFICIAL_CONTENT.firstDay.bring)}

      <div class="divider"></div>
      <div class="card-title">Day 1 flow</div>
      ${ul(OFFICIAL_CONTENT.firstDay.flow)}

      <div class="alert info">
        First Day and Documents are completed in person and will be marked complete by HR.
      </div>
    </div>
  `);
}

function renderSchedule(recordData, publicData){
  setStagebar("", false);
  setPage("Schedule","Calendar and site events posted by HR/supervision.",`
    <div class="card">
      <div class="card-title">Calendar</div>
      <div class="card-sub">Select a day to view details.</div>
    </div>
    ${renderScheduleCalendar(recordData, publicData)}
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

  document.querySelectorAll(".cal-day[data-date]").forEach(el => {
    el.addEventListener("click", () => {
      const date = el.getAttribute("data-date");
      if (!date) return;
      window.__calState = { ...(window.__calState || {}), sel: date };
      navTo("#schedule");
    });
  });
}

function renderHours(recordData){
  setStagebar("", false);

  const wk = Array.isArray(recordData?.weeklyHours) ? recordData.weeklyHours : [];
  setPage("My Hours","Recorded hours are view-only and posted by the system/HR.",`
    <div class="card">
      <div class="card-title">Weekly summary</div>
      <div class="card-sub">If you believe hours are incorrect, submit a Support Ticket.</div>

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

function renderPayroll(recordData, userData){
  setStagebar("", false);

  const status = normalizeStatus(userData?.status);
  const isActive = [EMPLOYEE_STATUS.PAYROLL_ACTIVE, EMPLOYEE_STATUS.FULLY_ACTIVE].includes(status);

  const stubs = Array.isArray(recordData?.payStubs) ? recordData.payStubs : [];

  setPage("Payroll","Pay day is weekly Friday. Pay stubs appear when payroll is active.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.payroll.title)}</div>

      <div class="divider"></div>
      ${OFFICIAL_CONTENT.payroll.overview.map(p=>`<div class="card-sub" style="margin-top:8px;line-height:1.45;">${escapeHtml(p)}</div>`).join("")}

      <div class="divider"></div>
      <div class="card-title">Pay stubs</div>
      ${ul(OFFICIAL_CONTENT.payroll.stubs)}

      <div class="divider"></div>
      <div class="card-title">Pay issues</div>
      ${ul(OFFICIAL_CONTENT.payroll.issues)}

      ${isActive ? `
        <div class="divider"></div>
        <div class="card-title">Latest stubs</div>
        <div class="stack">
          ${stubs.length ? stubs.slice(0,10).map(s=>`
            <div class="list-item">
              <div>
                <div class="li-title">${escapeHtml(safe(s.period,"Pay period"))}</div>
                <div class="li-sub">${escapeHtml(safe(s.amount,"—"))} • ${escapeHtml(safe(s.date,""))}</div>
              </div>
            </div>
          `).join("") : `<div class="empty">No pay stubs posted yet.</div>`}
        </div>
      ` : `
        <div class="alert warn">
          Payroll details unlock when HR marks payroll active for your profile.
        </div>
      `}
    </div>
  `);
}

function renderTimeOff(){
  setStagebar("", false);

  setPage("Benefits","Time Off / PTO and benefit information.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.benefits.title)}</div>
      ${OFFICIAL_CONTENT.benefits.note.map(p=>`<div class="card-sub" style="margin-top:8px;line-height:1.45;">${escapeHtml(p)}</div>`).join("")}

      <div class="divider"></div>
      <div class="card-title">May include</div>
      ${ul(OFFICIAL_CONTENT.benefits.list)}

      <div class="divider"></div>
      <div class="card-title">Time off guidance</div>
      ${ul(OFFICIAL_CONTENT.benefits.timeOffRules)}

      <div class="alert info">
        To request time off or ask eligibility questions, submit a Support Ticket.
      </div>
    </div>
  `);
}

function renderDeposit(){
  setStagebar("", false);

  setPage("Direct Deposit","View only. Changes are completed with HR unless otherwise approved.",`
    ${uiEmptyState({
      title: "Direct Deposit is managed by HR",
      body: "This module is view-only. To update direct deposit information, contact HR or submit a Support Ticket."
    })}
  `);
}

function renderNotifications(publicData, userData){
  setStagebar("", false);

  const global = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const all = [...personal, ...global].slice(0, 50);

  setPage("Notifications","Company announcements and HR updates.",`
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

function renderHelp(publicData, userData, user, empId){
  setStagebar("", false);

  const phone = publicData?.help?.phone || OFFICIAL_CONTENT.company.hrPhone;
  const email = publicData?.help?.email || OFFICIAL_CONTENT.company.hrEmail;
  const hours = publicData?.help?.hours || OFFICIAL_CONTENT.company.hrHours;

  setPage("Help","HR contact and support tickets.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.help.title)}</div>
      ${ul(OFFICIAL_CONTENT.help.body)}

      <div class="divider"></div>
      <div class="kv">
        <div class="k">Phone</div><div class="v">${escapeHtml(phone)}</div>
        <div class="k">Email</div><div class="v">${escapeHtml(email)}</div>
        <div class="k">Hours</div><div class="v">${escapeHtml(hours)}</div>
      </div>

      <div class="divider"></div>
      <div class="card-title">Support Ticket</div>
      <div class="card-sub">Creates a formal record for HR review.</div>

      <textarea id="ticketText" class="inp" rows="4" placeholder="Describe your request..."></textarea>
      <button class="btn" id="btnTicket" type="button">Submit ticket</button>

      <div class="alert info">
        Include dates, shift, and a short description so HR can resolve it faster.
      </div>
    </div>
  `);

  const btn = qs("btnTicket");
  if(btn){
    btn.onclick = async ()=>{
      const txt = (qs("ticketText")?.value || "").trim();
      if(!txt) return uiToast("Write your request.");
      if(!isFirebaseConfigured()) return uiToast("Firebase not configured.");

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
}

function renderMore(){
  setStagebar("", false);

  setPage("More","Policies, legal, and company information.",`
    <div class="card">
      <div class="card-title">More</div>
      <div class="card-sub">Additional workplace information.</div>

      <div class="divider"></div>

      <div class="tile-grid">
        <div class="tile" data-open="company">
          <div class="tile-title">Company</div>
          <div class="tile-sub">Address, HR contact, pay day, shifts</div>
          <div class="tile-link">Open</div>
        </div>

        <div class="tile" data-open="policies">
          <div class="tile-title">Policies</div>
          <div class="tile-sub">Warehouse conduct and safety rules</div>
          <div class="tile-link">Open</div>
        </div>

        <div class="tile" data-open="legal">
          <div class="tile-title">Legal</div>
          <div class="tile-sub">General employment notices</div>
          <div class="tile-link">Open</div>
        </div>
      </div>
    </div>
  `);

  // Inline modal-style pages (still no new routes in your nav)
  document.querySelectorAll("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const k = el.getAttribute("data-open");
      if (k === "company") return renderCompany();
      if (k === "policies") return renderPolicies();
      if (k === "legal") return renderLegal();
    });
  });
}

function renderCompany(){
  const c = OFFICIAL_CONTENT.company;
  setPage("Company","SunPower corporate contact information.",`
    <div class="card">
      <div class="card-title">${escapeHtml(c.name)}</div>
      <div class="card-sub">${escapeHtml(c.cityState)}</div>
      <div class="divider"></div>
      <div class="kv">
        <div class="k">Address</div><div class="v">${escapeHtml(c.address)}</div>
        <div class="k">HR Phone</div><div class="v">${escapeHtml(c.hrPhone)}</div>
        <div class="k">HR Email</div><div class="v">${escapeHtml(c.hrEmail)}</div>
        <div class="k">Hours</div><div class="v">${escapeHtml(c.hrHours)}</div>
        <div class="k">Pay day</div><div class="v">${escapeHtml(c.payDay)}</div>
        <div class="k">First day arrival</div><div class="v">${escapeHtml(c.firstDayArrival)}</div>
      </div>

      <div class="divider"></div>
      <div class="card-title">Shifts</div>
      <div class="card-sub">
        ${c.shifts.map(s=>`<div style="margin-top:8px;"><b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.hours)}</div>`).join("")}
      </div>

      <div class="divider"></div>
      <div class="card-title">Safety footwear store</div>
      <div class="card-sub">${escapeHtml(c.footwearShop)} • Cap: ${escapeHtml(c.footwearReimbursementCap)}</div>
    </div>
  `);
}

function renderPolicies(){
  setPage("Policies","General warehouse policies.",`
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

function renderLegal(){
  setPage("Legal","General notices.",`
    <div class="card">
      <div class="card-title">${escapeHtml(OFFICIAL_CONTENT.legal.title)}</div>
      ${ul(OFFICIAL_CONTENT.legal.bullets)}
    </div>
  `);
}

// ===============================
// ROUTER (MUST match HTML)
// ===============================
function routeRender(route, publicData, recordData, userData, user, empId){
  const r = String(route || "home").toLowerCase();

  if (r === "home") return renderHome(publicData, recordData, userData);
  if (r === "progress") return renderProgress(userData);
  if (r === "shift") return renderShift(user, empId, userData);
  if (r === "footwear") return renderFootwear();
  if (r === "i9") return renderI9();
  if (r === "documents") return renderDocuments();
  if (r === "firstday") return renderFirstDay(recordData);

  if (r === "schedule") return renderSchedule(recordData, publicData);
  if (r === "hours") return renderHours(recordData);
  if (r === "payroll") return renderPayroll(recordData, userData);
  if (r === "timeoff") return renderTimeOff();
  if (r === "deposit") return renderDeposit();

  if (r === "notifications") return renderNotifications(publicData, userData);
  if (r === "help") return renderHelp(publicData, userData, user, empId);
  if (r === "more") return renderMore();

  // fallback
  return renderHome(publicData, recordData, userData);
}

// ===============================
// APP START (exported for employee.html)
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

export async function initEmployeeApp(){
  // show skeleton immediately (prevents white screen feeling)
  const body = qs("pageBody");
  if (body) uiSetLoading(body, true, 4);

  onAuth(async (user)=>{
    cleanupSubs();

    if(!user){
      setStagebar("", false);
      setPage("Sign in","",`
        <div class="card">
          <div class="card-title">Please sign in.</div>
          <div class="card-sub">Use the login screen to access the portal.</div>
        </div>
      `);
      return;
    }

    try{
      await ensureUserDocExists(user);
      const empId = await ensureEmployeeId(user);

      const userRef = USER_DOC(user.uid);
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

        setActiveNav(status);
        syncTopbar(empId, userData);

        routeRender(requested, publicData, recordData, userData, user, empId);
      };

      window.addEventListener("hashchange", rerender);
      window.addEventListener("spData", rerender);

      // First render
      rerender();

    } catch(e){
      console.error(e);
      setStagebar("", false);
      setPage("Error","",`
        <div class="card">
          <div class="card-title">Access error</div>
          <div class="card-sub">${escapeHtml(String(e?.message||e))}</div>
        </div>
      `);
    }
  });
}
