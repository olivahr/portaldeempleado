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
    stage: "chip_selection",

    appointment: { date: "", time: "", address: "", notes: "" },

    // ✅ UPDATED steps (adds Safety Footwear + I-9; keeps Docs/First Day locked in person)
    steps: [
      { id: "application", label: "Application", done: true },
      { id: "chip_selection", label: "Chip Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Documents", done: false },
      { id: "docs", label: "Complete Onboarding Documents", done: false }, // 🔒 in person
      { id: "first_day", label: "First Day Preparation", done: false }      // 🔒 in person
    ],

    // preferences
    chip: {
      position: "",   // assembler | material | qc
      shift: ""       // early | mid | late
    },

    footwear: {
      ack1: false,
      ack2: false,
      ack3: false,
      ack4: false
    },

    i9: {
      ack: false
    },

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
    // ✅ merge true keeps future fields safe
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

  // lock logic: everything after first incomplete looks locked
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
    // Keep roles in case you still show them somewhere
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
      shopUrl: "https://example.com" // replace in admin later
    },
    help: {
      phone: "",
      email: "hr@company.com",
      text:
        "For help with onboarding, documents, scheduling, or safety requirements, contact HR or your site manager."
    },
    globalNotifications: []
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

// ✅ This route can stay for compatibility; you said you're removing it from the menu anyway.
// I’m not deleting it to avoid breaking anything.
function renderRoles(userData) {
  setPage(
    "Calendar",
    "Not available yet.",
    `
      <div class="card">
        <div class="alert warn" style="margin-top:0;">
          🔒 Calendar is not enabled at this time. It will be available after your first day.
        </div>
        <div class="muted" style="line-height:1.45;">
          Your schedule and calendar access will be provided once you begin work.
        </div>
      </div>
    `
  );
}

// ✅ Chip Selection = Position + Shift in ONE page (your spec)
function renderChipSelection(userData, saveUserPatch) {
  const chip = userData?.chip || {};
  const pos = chip.position || "";
  const sh = chip.shift || "";

  setPage(
    "Shift & Position Preferences",
    "Select your preferences below.",
    `
    <div class="card">
      <div class="muted" style="line-height:1.45;">
        Candidates may select preferred positions and shifts below.<br/>
        Selections are considered preferences only.<br/>
        Final assignments are determined by HR based on availability and business needs.
      </div>

      <div style="height:14px"></div>
      <h3 class="h3">Select Position Preference</h3>

      <div style="display:flex;flex-direction:column;gap:10px;">
        ${posCard("assembler",
          "Solar Panel Assembler",
          "Hands-on assembly of solar panels in a production environment. Includes frame assembly, connectors, basic wiring, and quality checks.",
          "$18–$23 per hour",
          "Select Solar Panel Assembler",
          pos
        )}
        ${posCard("material",
          "Material Handler / Warehouse Associate",
          "Moves and organizes materials, supports production lines, handles inventory, and assists with loading/unloading.",
          "$18–$22 per hour",
          "Select Material Handler",
          pos
        )}
        ${posCard("qc",
          "Quality Control / Inspection Associate",
          "Inspects solar panels for quality and safety standards. Includes visual checks and documentation.",
          "$19–$23 per hour",
          "Select Quality Control",
          pos
        )}
      </div>

      <div style="height:16px"></div>
      <h3 class="h3">Select Shift Preference</h3>

      <div style="display:flex;flex-direction:column;gap:10px;">
        ${shiftCard("early","Early Shift","6:00 AM – 2:30 PM","Choose Early Shift", sh)}
        ${shiftCard("mid","Mid Shift","2:00 PM – 10:30 PM","Choose Mid Shift", sh)}
        ${shiftCard("late","Late Shift","10:00 PM – 6:30 AM","Choose Late Shift", sh)}
      </div>

      <div style="height:14px"></div>
      <div class="muted small" style="line-height:1.35;">
        Shift and position selections are preferences only.<br/>
        Final placement depends on availability and operational needs.<br/>
        HR will confirm your assignment.
      </div>

      <div style="height:14px"></div>
      <button class="btn primary" id="btnChipSave" type="button">Save Preferences</button>
    </div>
    `
  );

  function posCard(key, title, desc, pay, btnLabel, selectedKey){
    const selected = selectedKey === key;
    return `
      <label class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;background:${selected ? "rgba(22,163,74,.06)" : "#fff"};cursor:pointer;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="radio" name="pos" value="${escapeHtml(key)}" ${selected ? "checked":""} style="margin-top:3px;"/>
          <div style="flex:1;">
            <div style="font-weight:900;">${escapeHtml(title)}</div>
            <div class="muted" style="margin-top:6px;line-height:1.4;">${escapeHtml(desc)}</div>
            <div class="muted small" style="margin-top:8px;font-weight:900;">Pay Range: ${escapeHtml(pay)}</div>
            <div style="height:10px"></div>
            <div class="btn ghost" style="display:inline-flex;pointer-events:none;">${escapeHtml(btnLabel)}</div>
          </div>
        </div>
      </label>
    `;
  }

  function shiftCard(key, title, hours, btnLabel, selectedKey){
    const selected = selectedKey === key;
    return `
      <label class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;background:${selected ? "rgba(22,163,74,.06)" : "#fff"};cursor:pointer;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="radio" name="shift" value="${escapeHtml(key)}" ${selected ? "checked":""} style="margin-top:3px;"/>
          <div style="flex:1;">
            <div style="font-weight:900;">${escapeHtml(title)}</div>
            <div class="muted" style="margin-top:6px;">${escapeHtml(hours)}</div>
            <div style="height:10px"></div>
            <div class="btn ghost" style="display:inline-flex;pointer-events:none;">${escapeHtml(btnLabel)}</div>
          </div>
        </div>
      </label>
    `;
  }

  document.getElementById("btnChipSave").onclick = async () => {
    const position = document.querySelector("input[name=pos]:checked")?.value || "";
    const shift = document.querySelector("input[name=shift]:checked")?.value || "";

    if (!position || !shift) return uiToast("Please select 1 position and 1 shift.");

    // mark chip_selection done
    const steps = (userData.steps || []).map(s =>
      s.id === "chip_selection" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({
      chip: { position, shift },
      steps,
      stage: "footwear"
    });

    uiToast("Preferences saved.");
    location.hash = "#footwear";
  };
}

function renderI9(userData, saveUserPatch) {
  const i9 = userData?.i9 || {};
  const done = !!(userData?.steps || []).find(s => s.id === "i9")?.done;

  setPage(
    "Form I-9 Employment Eligibility Verification",
    "Identity and work authorization requirements.",
    `
    <div class="card">
      <div class="muted" style="line-height:1.45;">
        All employees hired in the United States must complete Form I-9 as required by federal law.
        This form verifies your identity and authorization to work in the U.S.
        <br/><br/>
        Completion of the I-9 is mandatory and must be finalized no later than your first day of work.
      </div>

      <div style="height:12px"></div>

      <div class="alert info" style="margin-top:0;">
        You must present original, unexpired documents.<br/>
        Copies, photos, or scans are not accepted.<br/>
        Documents must be reviewed in person on your first day.
      </div>

      <div class="muted" style="margin-top:10px;line-height:1.45;">
        You may present <b>ONE</b> document from List A OR a combination of <b>ONE</b> from List B and <b>ONE</b> from List C.
      </div>

      <div style="height:12px"></div>

      <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;">
        <div style="font-weight:900;">List A (Identity + Work Authorization)</div>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>U.S. Passport or U.S. Passport Card</li>
          <li>Permanent Resident Card (Green Card)</li>
          <li>Employment Authorization Document (EAD Card)</li>
        </ul>
      </div>

      <div style="height:10px"></div>

      <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;">
        <div style="font-weight:900;">List B (Identity Only)</div>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>State-issued Driver’s License</li>
          <li>State ID Card</li>
          <li>School ID with photo</li>
          <li>Military ID Card</li>
        </ul>
      </div>

      <div style="height:10px"></div>

      <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;">
        <div style="font-weight:900;">List C (Work Authorization Only)</div>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Social Security Card (not laminated, no restrictions)</li>
          <li>U.S. Birth Certificate</li>
          <li>Certificate of Naturalization</li>
        </ul>
      </div>

      <div style="height:14px"></div>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;">
        <input type="checkbox" id="i9Ack" ${i9.ack ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">
          I understand I must bring valid original documents on my first day of work to complete the I-9 verification.
        </span>
      </label>

      <div style="height:12px"></div>
      <button class="btn primary" id="btnI9Save" type="button">${done ? "Saved" : "Confirm"}</button>
    </div>
    `
  );

  document.getElementById("btnI9Save").onclick = async () => {
    const ack = document.getElementById("i9Ack").checked;
    if (!ack) return uiToast("Please acknowledge to continue.");

    const steps = (userData.steps || []).map(s =>
      s.id === "i9" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({
      i9: { ack: true },
      steps,
      updatedAt: serverTimestamp()
    });

    uiToast("I-9 confirmed.");
    location.hash = "#progress";
  };
}

function renderFootwear(userData, saveUserPatch, publicData) {
  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const fw = userData?.footwear || {};
  const steps = userData?.steps || [];
  const done = !!steps.find(s => s.id === "footwear")?.done;

  setPage(
    "Safety Footwear Program",
    "Safety footwear is required for warehouse and production roles.",
    `
    <div class="card">
      <div class="muted" style="line-height:1.45;">
        <b>Overview</b><br/>
        For safety and compliance, approved protective footwear is required for all warehouse and production employees.
        Safety shoes must be worn at all times while on the work floor.<br/><br/>
        <b>Employees without approved footwear will not be permitted to begin work.</b>
      </div>

      <div style="height:12px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Purchase Requirement</b><br/>
        All new hires must purchase approved safety footwear through the company’s designated vendor/store.
        This ensures footwear meets safety standards and qualifies for reimbursement.
        Footwear purchased outside the approved store may not qualify.
      </div>

      <div style="height:12px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Reimbursement Policy</b><br/>
        Employees are eligible for a reimbursement after their first day of work, once:
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>The employee reports to work as scheduled</li>
          <li>Footwear compliance is verified</li>
          <li>The receipt is submitted</li>
          <li>The employee remains in good standing</li>
        </ul>
        Reimbursements are processed through payroll according to company policy.
      </div>

      <div style="height:12px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Important Notes</b>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Reimbursement applies only to approved models</li>
          <li>Maximum reimbursement limit may apply</li>
          <li>Reimbursement is not immediate cash</li>
          <li>Processing may take one payroll cycle</li>
        </ul>
      </div>

      <div style="height:12px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Footwear Requirements</b><br/>
        Approved footwear must:
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Be steel toe or composite toe</li>
          <li>Have slip-resistant soles</li>
          <li>Fully cover the foot</li>
          <li>Be in good condition</li>
          <li>Meet warehouse safety standards</li>
        </ul>
        Not allowed:
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Sneakers</li>
          <li>Sandals</li>
          <li>Open-toe shoes</li>
          <li>Soft-toe shoes</li>
        </ul>
      </div>

      <div style="height:12px"></div>

      <div class="muted" style="line-height:1.45;">
        <b>Employee Responsibility</b><br/>
        Employees must obtain approved footwear before their scheduled start date.<br/>
        Failure to arrive with proper footwear may result in:
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Delayed start date</li>
          <li>Rescheduled orientation</li>
          <li>Shift reassignment</li>
        </ul>
      </div>

      <div style="height:12px"></div>

      <a class="btn ghost" href="${escapeHtml(fwPublic.shopUrl || "#")}" target="_blank" rel="noreferrer">
        Shop Approved Safety Footwear
      </a>

      <div style="height:14px"></div>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;">
        <input type="checkbox" id="fwAck1" ${fw.ack1 ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">I understand safety footwear is required for my role</span>
      </label>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <input type="checkbox" id="fwAck2" ${fw.ack2 ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">I will purchase approved footwear from the designated store</span>
      </label>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <input type="checkbox" id="fwAck3" ${fw.ack3 ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">I understand reimbursement is processed after verification</span>
      </label>

      <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:10px;">
        <input type="checkbox" id="fwAck4" ${fw.ack4 ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">I agree to comply with the footwear policy</span>
      </label>

      <div style="height:12px"></div>
      <button class="btn primary" id="btnFwSave" type="button">${done ? "Saved" : "Continue"}</button>
    </div>
    `
  );

  document.getElementById("btnFwSave").onclick = async () => {
    const a1 = document.getElementById("fwAck1").checked;
    const a2 = document.getElementById("fwAck2").checked;
    const a3 = document.getElementById("fwAck3").checked;
    const a4 = document.getElementById("fwAck4").checked;

    if (!a1 || !a2 || !a3 || !a4) return uiToast("Please confirm all items to continue.");

    const newSteps = (steps || []).map(s =>
      s.id === "footwear" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({
      footwear: { ack1: a1, ack2: a2, ack3: a3, ack4: a4 },
      steps: newSteps,
      stage: "i9"
    });

    uiToast("Safety footwear saved.");
    location.hash = "#i9";
  };
}

// 🔒 Locked (in person) — no completion buttons
function renderDocumentsLocked() {
  setPage(
    "Complete Onboarding Documents",
    "This step is completed in person.",
    `
      <div class="card">
        <div class="alert warn" style="margin-top:0;">
          🔒 This step is completed in person on your first day.
        </div>
        <div class="muted" style="line-height:1.45;">
          HR will review and finalize onboarding documents at the warehouse.
        </div>
      </div>
    `
  );
}

// 🔒 Locked (in person) — no completion buttons
function renderFirstDayLocked(userData) {
  const appt = userData?.appointment || {};
  setPage(
    "First Day Instructions",
    "Information to help you prepare.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Check-In Information</h3>
        <div class="kv">
          <div class="k">Start Date</div><div class="v">${escapeHtml(safe(appt.date, "To be provided by HR"))}</div>
          <div class="k">Check-In Time</div><div class="v">${escapeHtml(safe(appt.time, "To be provided by HR"))}</div>
          <div class="k">Facility Location</div><div class="v">${escapeHtml(safe(appt.address, "To be provided by HR"))}</div>
          <div class="k">Supervisor Contact</div><div class="v">${escapeHtml("To be provided by HR")}</div>
        </div>
        <div style="height:12px"></div>
        <div class="alert warn" style="margin-top:0;">
          🔒 First Day Preparation is completed in person.
        </div>
      </div>

      <div class="card">
        <h3 class="h3">What to Bring on Your First Day</h3>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Valid I-9 employment documents (originals only)</li>
          <li>Government-issued photo ID</li>
          <li>Approved safety footwear</li>
          <li>Comfortable work clothes suitable for a warehouse environment</li>
          <li>Any onboarding documents requested by HR</li>
        </ul>

        <div style="height:12px"></div>
        <h3 class="h3">Dress Code & Safety Reminder</h3>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Closed-toe safety footwear is required</li>
          <li>No sandals or open-toe shoes</li>
          <li>Avoid loose clothing</li>
          <li>Minimal jewelry is recommended</li>
          <li>Follow all posted safety rules</li>
        </ul>

        <div style="height:12px"></div>
        <h3 class="h3">Arrival Instructions</h3>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Arrive 10–15 minutes early</li>
          <li>Check in at the front office or security desk</li>
          <li>Inform staff you are a new hire</li>
          <li>Wait for a supervisor or HR representative</li>
        </ul>

        <div style="height:12px"></div>
        <h3 class="h3">Important Reminders</h3>
        <ul class="ul" style="margin:8px 0 0 18px;line-height:1.5;">
          <li>Bring all required documents</li>
          <li>Arrive on time</li>
          <li>Follow safety guidelines</li>
          <li>Be prepared for a warehouse environment (standing, walking, lifting)</li>
        </ul>

        <div style="height:12px"></div>
        <div class="muted" style="line-height:1.45;">
          We look forward to welcoming you to the team and helping you get started.<br/>
          If you have questions, please contact HR before your start date.
        </div>
      </div>
    </div>
    `
  );
}

function renderNotifications(userData, publicData) {
  const personal = Array.isArray(userData?.notifications) ? userData.notifications : [];
  const globalN = Array.isArray(publicData?.globalNotifications) ? publicData.globalNotifications : [];

  const merged = [
    ...globalN.map(x => ({ ...x, _scope: "global" })),
    ...personal.map(x => ({ ...x, _scope: "you" }))
  ];

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
  renderStagebar(userData);

  const build = document.getElementById("build");
  if (build) build.textContent = "";

  switch (routeName()) {
    case "progress": return renderProgress(userData);

    // keep old route (you'll remove from menu)
    case "roles": return renderRoles(userData, publicData);

    // ✅ Chip Selection
    case "shift": return renderChipSelection(userData, saveUserPatch);
    case "chip_selection": return renderChipSelection(userData, saveUserPatch);

    // ✅ new steps
    case "footwear": return renderFootwear(userData, saveUserPatch, publicData);
    case "i9": return renderI9(userData, saveUserPatch);

    // 🔒 locked
    case "documents": return renderDocumentsLocked();
    case "firstday": return renderFirstDayLocked(userData);

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

  wireMobileMenuOnce();

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

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      let currentUserData = null;
      let currentPublicData = defaultPublicContent();

      const rerender = () => {
        if (!currentUserData) return;
        renderRoute(currentUserData, saveUserPatch, currentPublicData);
      };

      const publicRef = PUBLIC_DOC();
      onSnapshot(publicRef, (snap) => {
        if (snap.exists()) {
          currentPublicData = { ...defaultPublicContent(), ...snap.data() };
        } else {
          currentPublicData = defaultPublicContent();
        }
        rerender();
      });

      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        // if old users don't have new step ids, merge defaults safely
        // (NO destructive overwrite)
        const d = currentUserData;
        if (!Array.isArray(d.steps) || d.steps.length < 6) {
          // keep any existing step done flags where possible
          const base = defaultUserDoc(user);
          const old = Array.isArray(d.steps) ? d.steps : [];
          const mergedSteps = base.steps.map(s => {
            const o = old.find(x => x.id === s.id);
            return o ? { ...s, done: !!o.done, label: s.label } : s;
          });
          currentUserData = { ...base, ...d, steps: mergedSteps };
        }
        rerender();
      });

      window.addEventListener("hashchange", rerender);

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}
