// ===============================
// Employee Portal (READY)
// - Realtime sync users/{uid}
// - Global company content from portal/public (admin edits -> everyone sees)
// - Require Employee ID from allowedEmployees/{id}
// - Show Employee ID in top badge (userBadge)
// - Hide Admin button unless user is admin
// - Mobile hamburger opens/closes sidebar (safe, no double listeners)
// - Pro stagebar: completed green + locks
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Global company content doc (admin updates -> all employees see)
const PUBLIC_DOC = () => doc(db, "portal", "public");

// ---------- Helpers ----------
function routeName() {
  return (location.hash || "#progress").replace("#", "");
}

function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  document.getElementById("pageBody").innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function fmtShiftLabel(key) {
  if (key === "early") return "Early Shift (6:00 AM – 2:30 PM)";
  if (key === "mid") return "Mid Shift (2:00 PM – 10:30 PM)";
  if (key === "late") return "Late Shift (10:00 PM – 6:30 AM)";
  return "—";
}

function normalizeEmpId(input) {
  let v = (input || "").trim().toUpperCase();
  v = v.replace(/\s+/g, "");
  // Accept SP-023, SP023, sp 023
  v = v.replace(/SP[-_]?/g, "SP");
  // Keep only SP + digits
  const m = v.match(/^SP(\d{1,6})$/);
  if (!m) return v; // return as typed; whitelist decides
  return `SP${m[1]}`;
}

// ---------- Default user doc (if missing) ----------
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
      { id: "docs", label: "Complete Onboarding Documents", done: false },
      { id: "first_day", label: "First Day Preparation", done: false }
    ],

    shift: { choice: "", confirmed: false },
    employeeId: "",

    // Optional per-user notifications
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

  if (!snap.exists()) {
    await setDoc(ref, defaultUserDoc(user), { merge: true });
  } else {
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
  }
}

// ---------- Admin check ----------
async function isAdminUser(user) {
  if (!isFirebaseConfigured()) return false;
  try {
    const ref = doc(db, "admins", user.uid);
    const snap = await getDoc(ref);
    return snap.exists() && snap.data()?.role === "admin";
  } catch {
    return false;
  }
}

// ---------- Employee ID Gate ----------
async function ensureEmployeeId(user) {
  if (!isFirebaseConfigured()) return "PREVIEW";

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  if (data?.employeeId) return data.employeeId;

  let empId = prompt("Enter your Employee ID (example: SP023):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required.");

  // Validate against whitelist: allowedEmployees/{empId}
  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  if (!allowedSnap.exists() || allowedSnap.data()?.active !== true) {
    throw new Error("Invalid Employee ID. Contact HR.");
  }

  await updateDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() });
  return empId;
}

// ---------- Mobile Menu (SAFE) ----------
function wireMobileMenuOnce() {
  const btnMenu = document.getElementById("btnMenu");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawerOverlay");

  if (!btnMenu || !sidebar || !overlay) return;

  // prevent double-wiring (if HTML also wires)
  if (btnMenu.dataset.wired === "1") return;
  btnMenu.dataset.wired = "1";

  const open = () => {
    sidebar.classList.add("open");
    overlay.classList.add("show");
  };
  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  };

  btnMenu.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });

  overlay.addEventListener("click", close);

  document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 920px)").matches) close();
    });
  });

  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 920px)").matches) close();
  });
}

// ---------- Stagebar ----------
function renderStagebar(userData) {
  const el = document.getElementById("stagebar");
  if (!el) return;

  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  if (!steps.length) {
    el.innerHTML = "";
    return;
  }

  const firstPendingIndex = steps.findIndex(s => !s.done);
  const currentIndex = firstPendingIndex === -1 ? steps.length - 1 : firstPendingIndex;

  const chips = steps.map((s, i) => {
    const done = !!s.done;
    const locked = i > currentIndex; // lock future steps
    const cls = done ? "sb-chip ok" : locked ? "sb-chip lock" : "sb-chip warn";
    const icon = done ? "✓" : locked ? "🔒" : "•";
    return `
      <div class="${cls}">
        <span class="sb-ico">${icon}</span>
        <span class="sb-lbl">${escapeHtml(s.label || "")}</span>
      </div>
    `;
  }).join("");

  // minimal CSS inline (so it works with your app.css without adding more)
  el.innerHTML = `
    <style>
      .sb{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;}
      .sb-chip{display:flex;align-items:center;gap:8px;border:1px solid var(--line);
        background:#fff;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;}
      .sb-chip.ok{border-color:rgba(22,163,74,.25);background:rgba(22,163,74,.08);color:var(--good);}
      .sb-chip.warn{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.08);color:#92400e;}
      .sb-chip.lock{opacity:.65}
      .sb-ico{width:18px;display:inline-flex;justify-content:center;}
    </style>
    <div class="sb">${chips}</div>
  `;
}

// ---------- Defaults for global company content ----------
function defaultPublicContent() {
  return {
    roles: [
      {
        title: "Role 1: Solar Panel Assembler",
        pay: "$18–$23 per hour",
        body:
          "Hands-on assembly of solar panels and related components in a production-based warehouse environment. " +
          "Responsibilities include assembling panel frames, installing electrical connectors, basic wiring tasks, " +
          "operating approved hand tools, and ensuring products meet established quality, safety, and production standards."
      },
      {
        title: "Role 2: Material Handler / Warehouse Associate",
        pay: "$18–$22 per hour",
        body:
          "Supports daily warehouse operations by receiving, staging, moving, and organizing materials and finished products. " +
          "Includes inventory handling, labeling/scanning, supplying production lines, assisting with loading/unloading, and maintaining safe work areas."
      },
      {
        title: "Role 3: Quality Control / Inspection Associate",
        pay: "$19–$23 per hour",
        body:
          "Responsible for inspecting assembled solar panels to ensure compliance with quality, safety, and performance standards. " +
          "May include visual inspections, basic measurements/testing, documentation of findings, and coordination with production teams."
      }
    ],
    footwear: {
      programTitle: "Safety Footwear Program",
      shopUrl: "https://example.com", // YOU will replace in admin later
      allowanceText:
        "An approved footwear allowance or discount may be applied at checkout through the company’s designated program. " +
        "If the total cost exceeds the allowance amount, the remaining balance is the employee’s responsibility.",
      responsibilityText:
        "Employees must obtain approved safety footwear prior to their scheduled start date. " +
        "Failure to arrive with required footwear may delay assignment or reschedule the start date."
    },
    firstDay: {
      summary:
        "Report to your scheduled check-in time, bring required documents, and arrive prepared for a warehouse environment.",
      bring: [
        "Valid work authorization documents (I-9)",
        "Approved safety footwear",
        "Comfortable work clothes",
        "Any required onboarding documents"
      ]
    },
    team: {
      // map keys ok
      hr: { name: "HR Desk", email: "hr@company.com", phone: "" },
      manager: { name: "Site Manager", email: "manager@company.com", phone: "" }
    },
    help: {
      phone: "",
      email: "hr@company.com",
      text:
        "For help with onboarding, documents, scheduling, or safety requirements, contact HR or your site manager."
    },
    globalNotifications: [
      // { title, body, route, action }
    ]
  };
}

// ---------- Renderers ----------
function renderProgress(userData) {
  const steps = userData?.steps || [];
  const appt = userData?.appointment || {};

  const stepsHtml = steps.map(s => `
    <div class="alert ${s.done ? "ok" : "warn"}">
      ${escapeHtml(s.label)} — ${s.done ? "Completed" : "Pending"}
    </div>
  `).join("");

  setPage(
    "Progress",
    "Track your progress and complete pending steps.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Steps</h3>
        ${stepsHtml || `<div class="muted small">No steps yet.</div>`}
      </div>

      <div class="card">
        <h3 class="h3">Appointment</h3>
        <div class="kv">
          <div class="k">Date</div><div class="v">${escapeHtml(safe(appt.date, "Pending"))}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(safe(appt.time, "Pending"))}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(safe(appt.address, "Pending"))}</div>
          <div class="k">Notes</div><div class="v">${escapeHtml(safe(appt.notes, "—"))}</div>
        </div>
      </div>
    </div>
    `
  );
}

function renderRoles(userData, publicData) {
  const roles = publicData?.roles || defaultPublicContent().roles;

  const cards = roles.map(r => `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:900;">${escapeHtml(r.title || "")}</div>
        <div class="muted small" style="font-weight:900;">${escapeHtml(r.pay || "")}</div>
      </div>
      <div class="muted" style="margin-top:8px;font-size:13px;line-height:1.45;">
        ${escapeHtml(r.body || "")}
      </div>
    </div>
  `).join("");

  setPage(
    "Roles & Scheduling",
    "Review available roles and confirm your schedule.",
    `
      ${cards}
      <div class="card">
        <h3 class="h3">Your Schedule</h3>
        <div class="kv">
          <div class="k">Shift</div><div class="v">${escapeHtml(fmtShiftLabel(userData?.shift?.choice))}</div>
          <div class="k">Confirmed</div><div class="v">${userData?.shift?.confirmed ? "Yes" : "No"}</div>
        </div>
        <div style="height:10px"></div>
        <a class="btn ghost" href="#shift">Go to Shift Selection</a>
      </div>
    `
  );
}

function renderDocuments(userData, saveUserPatch) {
  // This is “Complete Onboarding Documents”
  const steps = userData?.steps || [];
  const docsStep = steps.find(s => s.id === "docs");
  const done = !!docsStep?.done;

  setPage(
    "Documents",
    "Complete onboarding documents and confirm you understand the requirements.",
    `
      <div class="card">
        <div class="alert info" style="margin-top:0;">
          Upload wiring can be added later (Storage). For now, confirm requirements and continue.
        </div>

        <div class="list-item" style="display:flex;justify-content:space-between;align-items:center;">
          <b>Government ID (I-9)</b>
          <span class="chip ${done ? "ok" : "warn"}" style="border:1px solid var(--line);padding:6px 10px;border-radius:999px;font-weight:900;">
            ${done ? "Completed" : "Pending"}
          </span>
        </div>

        <div style="height:10px"></div>

        <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" id="docAck" ${done ? "checked" : ""}/>
          <span style="font-size:13px;line-height:1.35;">
            I understand I must bring valid work authorization documents and complete required onboarding steps.
          </span>
        </label>

        <div style="height:12px"></div>
        <button class="btn primary" id="btnDocsContinue" type="button">${done ? "Saved" : "Continue"}</button>
      </div>
    `
  );

  document.getElementById("btnDocsContinue").onclick = async () => {
    const ack = document.getElementById("docAck").checked;
    if (!ack) return uiToast("Please acknowledge to continue.");

    const newSteps = (steps || []).map(s =>
      s.id === "docs" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ steps: newSteps, stage: "first_day" });
    uiToast("Documents step saved.");
  };
}

function renderI9() {
  setPage(
    "I-9",
    "Bring original documents for employment verification.",
    `
    <div class="card">
      <div class="alert info" style="margin-top:0;">
        Bring originals on your first day. Copies or photos may not be accepted.
      </div>
      <ul class="ul" style="margin:10px 0 0 18px;line-height:1.5;">
        <li>Passport</li>
        <li>Driver’s License + Social Security</li>
        <li>Other acceptable work authorization documents</li>
      </ul>
    </div>
    `
  );
}

function renderShift(userData, saveUserPatch) {
  const shift = userData?.shift || {};
  const selected = shift.choice || "";
  const confirmed = !!shift.confirmed;

  setPage(
    "Shift Selection",
    "Select your preferred work shift.",
    `
    <div class="card">
      <label class="radio-row" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
        <input type="radio" name="shift" value="early" ${selected==="early" ? "checked":""}/>
        <div><b>Early Shift</b><div class="muted">6:00 AM – 2:30 PM</div></div>
      </label>
      <label class="radio-row" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
        <input type="radio" name="shift" value="mid" ${selected==="mid" ? "checked":""}/>
        <div><b>Mid Shift</b><div class="muted">2:00 PM – 10:30 PM</div></div>
      </label>
      <label class="radio-row" style="display:flex;gap:10px;align-items:flex-start;">
        <input type="radio" name="shift" value="late" ${selected==="late" ? "checked":""}/>
        <div><b>Late Shift</b><div class="muted">10:00 PM – 6:30 AM</div></div>
      </label>

      <div style="height:12px"></div>
      <button class="btn primary" id="btnSaveShift" type="button">Save</button>
      <button class="btn ghost" id="btnConfirmShift" type="button" ${!selected ? "disabled":""}>Confirm Shift</button>

      <div class="alert ${confirmed ? "ok" : "warn"}" style="margin-top:12px;">
        ${confirmed ? `Shift confirmed: <b>${escapeHtml(selected)}</b>` : "Shift not confirmed."}
      </div>
    </div>
    `
  );

  document.getElementById("btnSaveShift").onclick = async () => {
    const choice = document.querySelector("input[name=shift]:checked")?.value || "";
    await saveUserPatch({ shift: { choice, confirmed: false } });
    uiToast("Saved.");
  };

  document.getElementById("btnConfirmShift").onclick = async () => {
    const choice = document.querySelector("input[name=shift]:checked")?.value || "";
    if (!choice) return;

    const steps = (userData.steps || []).map(s =>
      s.id === "shift_selection" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({
      shift: { choice, confirmed: true },
      steps,
      stage: "docs"
    });

    uiToast("Shift confirmed.");
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const fw = publicData?.footwear || defaultPublicContent().footwear;
  const steps = userData?.steps || [];

  setPage(
    "Safety Footwear",
    "Approved protective footwear is required for all warehouse and production roles.",
    `
    <div class="card">
      <h3 class="h3">${escapeHtml(fw.programTitle || "Safety Footwear Program")}</h3>

      <div class="muted" style="line-height:1.45;">
        <b>Overview</b><br/>
        For safety and compliance, approved protective footwear is required prior to your start date.
      </div>

      <div style="height:10px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>How the allowance works</b><br/>
        ${escapeHtml(fw.allowanceText || "")}
      </div>

      <div style="height:10px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Employee responsibility</b><br/>
        ${escapeHtml(fw.responsibilityText || "")}
      </div>

      <div style="height:12px"></div>

      <a class="btn ghost" href="${escapeHtml(fw.shopUrl || "#")}" target="_blank" rel="noreferrer">
        Shop Approved Safety Footwear
      </a>

      <div style="height:14px"></div>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;">
        <input type="checkbox" id="fwAck1"/>
        <span style="font-size:13px;line-height:1.35;">
          I acknowledge that approved safety footwear is required for my role.
        </span>
      </label>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <input type="checkbox" id="fwAck2"/>
        <span style="font-size:13px;line-height:1.35;">
          I understand how the footwear program works and will obtain approved footwear prior to my start date.
        </span>
      </label>

      <div style="height:12px"></div>
      <button class="btn primary" id="btnFwContinue" type="button">Continue</button>
    </div>
    `
  );

  document.getElementById("btnFwContinue").onclick = async () => {
    const a1 = document.getElementById("fwAck1").checked;
    const a2 = document.getElementById("fwAck2").checked;
    if (!a1 || !a2) return uiToast("Please acknowledge both items to continue.");

    // (Optional) mark docs step done too if you want
    const newSteps = (steps || []).map(s => {
      if (s.id === "docs") return { ...s, done: true };
      return s;
    });

    await saveUserPatch({
      steps: newSteps,
      stage: "first_day"
    });

    uiToast("Saved.");
    location.hash = "#firstday";
  };
}

function renderFirstDay(userData, saveUserPatch, publicData) {
  const appt = userData?.appointment || {};
  const fd = publicData?.firstDay || defaultPublicContent().firstDay;

  setPage(
    "First Day",
    "Check-in details and what to bring.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Check-in details</h3>
        <div class="kv">
          <div class="k">Date</div><div class="v">${escapeHtml(safe(appt.date, "Pending"))}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(safe(appt.time, "Pending"))}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(safe(appt.address, "Pending"))}</div>
          <div class="k">Notes</div><div class="v">${escapeHtml(safe(appt.notes, "—"))}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="h3">First Day Instructions</h3>
        <div class="muted" style="line-height:1.45;">
          ${escapeHtml(fd.summary || "")}
        </div>
        <div style="height:10px"></div>
        <b>What to bring</b>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          ${(fd.bring || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}
        </ul>

        <div style="height:12px"></div>
        <label style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" id="fdAck"/>
          <span style="font-size:13px;line-height:1.35;">
            I understand and acknowledge these first-day requirements.
          </span>
        </label>

        <div style="height:12px"></div>
        <button class="btn primary" id="btnFirstDayReady" type="button">Continue</button>
      </div>
    </div>
    `
  );

  document.getElementById("btnFirstDayReady").onclick = async () => {
    const ack = document.getElementById("fdAck").checked;
    if (!ack) return uiToast("Please acknowledge to continue.");

    const steps = (userData.steps || []).map(s =>
      s.id === "first_day" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ steps, stage: "done" });
    uiToast("Saved.");
  };
}

function renderTeam(publicData) {
  const c = publicData?.team || defaultPublicContent().team;

  const rows = Object.entries(c).map(([key, x]) => `
    <div class="list-item" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div>
        <div class="li-title" style="font-weight:900;">${escapeHtml(x?.name || "—")}</div>
        <div class="li-sub muted" style="font-size:13px;">
          ${escapeHtml(x?.email || "")}${x?.phone ? " • " + escapeHtml(x.phone) : ""}
        </div>
      </div>
      <button class="btn sm ghost" disabled type="button">Message</button>
    </div>
  `).join("");

  setPage(
    "Team",
    "Your site contacts.",
    `
    <div class="card">
      <h3 class="h3">Contacts</h3>
      <div class="list" style="display:flex;flex-direction:column;gap:10px;">
        ${rows || `<div class="muted">No contacts yet</div>`}
      </div>
    </div>
    `
  );
}

function renderNotifications(userData, publicData) {
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const globalN = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];

  // newest first (if have createdAt)
  const merged = [...globalN.map(x => ({ ...x, _scope: "global" })), ...personal.map(x => ({ ...x, _scope: "you" }))];

  const list = merged.map(n => `
    <div class="note" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div class="note-title" style="font-weight:900;">
          ${escapeHtml(n.title || "")}
        </div>
        <div class="small muted" style="font-weight:900;">
          ${n._scope === "global" ? "Company" : "You"}
        </div>
      </div>
      <div class="note-body muted" style="margin-top:6px;line-height:1.4;">
        ${escapeHtml(n.body || "")}
      </div>
      <div class="note-actions" style="margin-top:10px;">
        <a class="btn sm ghost" href="#${escapeHtml(n.route || "progress")}">
          ${escapeHtml(n.action || "Open")}
        </a>
      </div>
    </div>
  `).join("");

  setPage(
    "Notifications",
    "Updates and reminders.",
    `
    <div class="card">
      <h3 class="h3">Inbox</h3>
      <div class="stack">
        ${list || `<div class="muted">No notifications</div>`}
      </div>
    </div>
    `
  );
}

function renderHelp(publicData) {
  const h = publicData?.help || defaultPublicContent().help;

  setPage(
    "Help",
    "Get assistance.",
    `
    <div class="card">
      <div class="alert info" style="margin-top:0;">
        ${escapeHtml(h.text || "Contact HR or your site manager for help.")}
      </div>

      <div class="kv">
        <div class="k">Email</div><div class="v">${escapeHtml(h.email || "—")}</div>
        <div class="k">Phone</div><div class="v">${escapeHtml(h.phone || "—")}</div>
      </div>
    </div>
    `
  );
}

// ---------- Router ----------
function renderRoute(userData, saveUserPatch, publicData) {
  // Stagebar always
  renderStagebar(userData);

  // Kill the “Firebase Connected” text if present
  const build = document.getElementById("build");
  if (build) build.textContent = "";

  switch (routeName()) {
    case "progress": return renderProgress(userData);
    case "roles": return renderRoles(userData, publicData);
    case "documents": return renderDocuments(userData, saveUserPatch);
    case "i9": return renderI9();
    case "shift": return renderShift(userData, saveUserPatch);
    case "footwear": return renderFootwear(userData, saveUserPatch, publicData);
    case "firstday": return renderFirstDay(userData, saveUserPatch, publicData);
    case "team": return renderTeam(publicData);
    case "notifications": return renderNotifications(userData, publicData);
    case "help": return renderHelp(publicData);
    default:
      location.hash = "#progress";
      return;
  }
}

// ---------- Init ----------
export async function initEmployeeApp() {
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusChip");
  const adminBtn = document.getElementById("btnAdminGo");

  // Wire menu once (safe)
  wireMobileMenuOnce();

  // Preview mode
  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview mode");
    if (statusChip) uiSetText(statusChip, "offline");
    if (adminBtn) adminBtn.style.display = "none";

    const demoUser = defaultUserDoc({ email: "preview@demo", displayName: "Preview" });
    const demoPublic = defaultPublicContent();

    renderRoute(demoUser, async () => {}, demoPublic);
    window.addEventListener("hashchange", () => renderRoute(demoUser, async () => {}, demoPublic));
    return;
  }

  onAuth(async (user) => {
    try {
      if (!user) {
        window.location.href = "./index.html";
        return;
      }

      // online badge
      if (statusChip) {
        uiSetText(statusChip, "online");
        statusChip.classList.add("ok");
      }

      // show/hide Admin button
      const admin = await isAdminUser(user);
      if (adminBtn) adminBtn.style.display = admin ? "" : "none";

      // Ensure user doc exists
      await ensureUserDocExists(user);

      // Require Employee ID (whitelist)
      const empId = await ensureEmployeeId(user);
      uiSetText(badge, empId);

      const userRef = doc(db, "users", user.uid);

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      // ----- realtime state -----
      let currentUserData = null;
      let currentPublicData = defaultPublicContent();

      const rerender = () => {
        if (!currentUserData) return;
        renderRoute(currentUserData, saveUserPatch, currentPublicData);
      };

      // Public content realtime
      const publicRef = PUBLIC_DOC();
      const unsubPublic = onSnapshot(publicRef, (snap) => {
        if (snap.exists()) {
          currentPublicData = { ...defaultPublicContent(), ...snap.data() };
        } else {
          currentPublicData = defaultPublicContent();
        }
        rerender();
      });

      // User realtime
      const unsubUser = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        rerender();
      });

      // Re-render on hash change
      window.addEventListener("hashchange", rerender);

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}
