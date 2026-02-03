// ===============================
// Employee Portal (FULL FIXED)
// - Fix router so pages don't fallback to Progress
// - Read employeeRecords/{SP###} for appointment/contacts/notifications + future modules
// - Keep users/{uid} for onboarding progress (shift/footwear/i9/steps)
// - Global company content from portal/public
// - Require Employee ID from allowedEmployees/{id}
// - Show Employee ID in top badge (userBadge)
// - Hide Admin button unless user is admin
// - Mobile hamburger opens/closes sidebar (safe, no double listeners)
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Global company content doc (admin updates -> all employees see)
const PUBLIC_DOC = () => doc(db, "portal", "public");

// Employee record (admin sets data by empId so it exists BEFORE user registers)
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);

// ✅ Range auto-allow (so you don't add 180 IDs by hand)
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ✅ When “real modules” should start showing as active
const START_WORK_DATE = "2026-03-02"; // March 2
function isAfterStartWork() {
  const d = new Date(START_WORK_DATE + "T00:00:00");
  return Date.now() >= d.getTime();
}

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

function normalizeEmpId(input){
  if(!input) return "";
  let v = input.toString().toUpperCase().trim();
  v = v.replace(/[\s-_]/g,"");
  if(!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if(!/^\d+$/.test(nums)) return "";
  return "SP" + nums;
}

function empIdToNumber(empId) {
  const m = String(empId || "").toUpperCase().match(/^SP(\d{1,6})$/);
  if (!m) return null;
  return Number(m[1]);
}

// ---------- Default user doc (for UI defaults only; we DO NOT overwrite) ----------
function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",

    appointment: { date: "", time: "", address: "", notes: "" },

    // ✅ UPDATED steps (adds Safety Footwear + I-9; keeps Docs/First Day locked in person)
    steps: [
      { id: "application", label: "Application", done: true },
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Documents", done: false },
      { id: "docs", label: "Complete Onboarding Documents", done: false }, // 🔒 in person
      { id: "first_day", label: "First Day Preparation", done: false }      // 🔒 in person
    ],

    shift: { position: "", shift: "" },
    footwear: { ack1:false, ack2:false, ack3:false, ack4:false },
    i9: { ack:false },

    employeeId: "",
    notifications: [],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

/**
 * ✅ FIX CRÍTICO:
 * NO pisa appointment/steps/etc.
 * Only ensures doc exists + updates login stamps.
 */
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
    await setDoc(ref, {
      ...patch,
      role: "employee",
      status: "active",
      createdAt: serverTimestamp()
    }, { merge: true });
  } else {
    await setDoc(ref, patch, { merge: true });
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

  let ok = false;

  if (allowedSnap.exists()) {
    ok = (allowedSnap.data()?.active === true);
  } else {
    // ✅ RANGE fallback so you don't add 180 IDs by hand
    const n = empIdToNumber(empId);
    if (n !== null && n >= EMP_ID_RANGE.min && n <= EMP_ID_RANGE.max) {
      ok = true;

      // auto-create allowedEmployees record so admin panel sees it
      if (AUTO_CREATE_ALLOWED_ID) {
        await setDoc(allowedRef, { active: true, createdAt: serverTimestamp() }, { merge: true });
      }
    }
  }

  if (!ok) throw new Error("Invalid Employee ID. Contact HR.");

  await setDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() }, { merge: true });
  return empId;
}

// ---------- Mobile Menu (SAFE) ----------
function wireMobileMenuOnce() {
  const btnMenu = document.getElementById("btnMenu");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawerOverlay");

  if (!btnMenu || !sidebar || !overlay) return;
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
  if (!steps.length) { el.innerHTML = ""; return; }

  const firstPendingIndex = steps.findIndex(s => !s.done);
  const currentIndex = firstPendingIndex === -1 ? steps.length - 1 : firstPendingIndex;

  const shift = steps.map((s, i) => {
    const done = !!s.done;
    const locked = i > currentIndex;
    const cls = done ? "sb-shift ok" : locked ? "sb-shift lock" : "sb-shift warn";
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
      .sb-shift{display:flex;align-items:center;gap:8px;border:1px solid var(--line);
        background:#fff;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;}
      .sb-shift.ok{border-color:rgba(22,163,74,.25);background:rgba(22,163,74,.08);color:var(--good);}
      .sb-shift.warn{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.08);color:#92400e;}
      .sb-shift.lock{opacity:.65}
      .sb-ico{width:18px;display:inline-flex;justify-content:center;}
    </style>
    <div class="sb">${shift}</div>
  `;
}

// ---------- Defaults for global company content ----------
function defaultPublicContent() {
  return {
    footwear: { programTitle: "Safety Footwear Program", shopUrl: "https://example.com" },
    help: { phone: "", email: "hr@company.com", text: "For help, contact HR or your site manager." },
    globalNotifications: []
  };
}

// ---------- Renderers (ONBOARDING) ----------
function renderProgress(userData, recordData) {
  const steps = userData?.steps || [];
  const appt = recordData?.appointment || userData?.appointment || {};

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

function renderRoles() {
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

function renderShiftSelection(userData, saveUserPatch) {
  const shift = userData?.shift || {};
  const pos = shift.position || "";
  const sh = shift.shift || "";

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
        ${posCard("assembler","Solar Panel Assembler","Hands-on assembly of solar panels in a production environment.","$18–$23 per hour","Select Solar Panel Assembler",pos)}
        ${posCard("material","Material Handler / Warehouse Associate","Moves and organizes materials, supports production lines, handles inventory.","$18–$22 per hour","Select Material Handler",pos)}
        ${posCard("qc","Quality Control / Inspection Associate","Inspects solar panels for quality and safety standards.","$19–$23 per hour","Select Quality Control",pos)}
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
        HR will confirm your assignment.
      </div>

      <div style="height:14px"></div>
      <button class="btn primary" id="btnShiftSave" type="button">Save Preferences</button>
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

  document.getElementById("btnShiftSave").onclick = async () => {
    const position = document.querySelector("input[name=pos]:checked")?.value || "";
    const shift = document.querySelector("input[name=shift]:checked")?.value || "";
    if (!position || !shift) return uiToast("Please select 1 position and 1 shift.");

    const steps = (userData.steps || []).map(s =>
      s.id === "shift_selection" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({ shift: { position, shift }, steps, stage: "footwear" });
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
      <div class="alert info" style="margin-top:0;">
        You must bring original, unexpired documents on your first day.
      </div>

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

    await saveUserPatch({ i9: { ack: true }, steps });
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
        Approved protective footwear is required for all warehouse and production employees.
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

    await saveUserPatch({ footwear: { ack1:a1, ack2:a2, ack3:a3, ack4:a4 }, steps: newSteps, stage: "i9" });
    uiToast("Safety footwear saved.");
    location.hash = "#i9";
  };
}

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

function renderFirstDayLocked(userData, recordData) {
  const appt = recordData?.appointment || userData?.appointment || {};
  setPage(
    "First Day Instructions",
    "Information to help you prepare.",
    `
    <div class="card">
      <h3 class="h3">Check-In Information</h3>
      <div class="kv">
        <div class="k">Start Date</div><div class="v">${escapeHtml(safe(appt.date, "To be provided by HR"))}</div>
        <div class="k">Check-In Time</div><div class="v">${escapeHtml(safe(appt.time, "To be provided by HR"))}</div>
        <div class="k">Facility Location</div><div class="v">${escapeHtml(safe(appt.address, "To be provided by HR"))}</div>
        <div class="k">Notes</div><div class="v">${escapeHtml(safe(appt.notes, "—"))}</div>
      </div>
      <div style="height:12px"></div>
      <div class="alert warn" style="margin-top:0;">
        🔒 First Day Preparation is completed in person.
      </div>
    </div>
    `
  );
}

// ---------- NEW MODULE PAGES (A to Z style, safe) ----------
function renderSchedule(recordData) {
  const locked = !isAfterStartWork();
  const schedule = recordData?.schedule || {};

  const dayRow = (dayKey, label) => {
    const d = schedule?.[dayKey] || {};
    const type = d.type || (locked ? "off" : "work");
    const start = d.start || "";
    const end = d.end || "";
    const badge = type === "work" ? "Work" : type === "holiday" ? "Holiday" : "Day Off";

    return `
      <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="font-weight:900;">${escapeHtml(label)}</div>
          <div class="small muted" style="font-weight:900;">${escapeHtml(badge)}</div>
        </div>
        <div class="muted" style="margin-top:6px;">
          ${escapeHtml(start && end ? `${start} – ${end}` : (locked ? "Pending" : "Not assigned"))}
        </div>
      </div>
    `;
  };

  setPage(
    "Schedule",
    "Weekly schedule overview.",
    `
      <div class="card">
        <div class="alert ${locked ? "warn" : "ok"}" style="margin-top:0;">
          ${locked ? "🔒 Schedule will be available starting March 2." : "✅ Schedule is active."}
        </div>
      </div>

      <div style="height:10px"></div>

      <div class="grid2">
        ${dayRow("monday","Monday")}
        ${dayRow("tuesday","Tuesday")}
        ${dayRow("wednesday","Wednesday")}
        ${dayRow("thursday","Thursday")}
        ${dayRow("friday","Friday")}
        ${dayRow("saturday","Saturday")}
        ${dayRow("sunday","Sunday")}
      </div>
    `
  );
}

function renderPayroll(recordData) {
  const locked = !isAfterStartWork();
  const items = Array.isArray(recordData?.payroll) ? recordData.payroll : [];

  const list = items.map(p => `
    <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:900;">Pay Date: ${escapeHtml(p.payDate || "—")}</div>
        <div class="small muted" style="font-weight:900;">${escapeHtml(p.status || "stub")}</div>
      </div>
      <div class="muted" style="margin-top:6px;">
        Period: ${escapeHtml((p.periodStart||"—") + " → " + (p.periodEnd||"—"))}
      </div>
      <div style="height:10px"></div>
      <button class="btn sm ghost" type="button" disabled>View Pay Stub</button>
    </div>
  `).join("");

  setPage(
    "Payroll",
    "Pay stubs and pay periods.",
    `
      <div class="card">
        <div class="alert ${locked ? "warn" : "ok"}" style="margin-top:0;">
          ${locked ? "🔒 Payroll will be available after you begin work (March 2)." : "✅ Payroll is active."}
        </div>
        <div class="muted" style="margin-top:10px;line-height:1.45;">
          You will be able to view your pay stubs here once payroll is active.
        </div>
      </div>

      <div style="height:12px"></div>
      ${list || `<div class="card"><div class="muted">No pay stubs yet.</div></div>`}
    `
  );
}

function renderTimeOff(recordData) {
  const locked = !isAfterStartWork();
  const reqs = Array.isArray(recordData?.timeOffRequests) ? recordData.timeOffRequests : [];

  const list = reqs.map(r => `
    <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:900;">${escapeHtml(r.type || "Request")}</div>
        <div class="small muted" style="font-weight:900;">${escapeHtml(r.status || "pending")}</div>
      </div>
      <div class="muted" style="margin-top:6px;">
        ${escapeHtml((r.startDate||"—") + " → " + (r.endDate||"—"))}
      </div>
      <div class="muted small" style="margin-top:6px;line-height:1.35;">
        ${escapeHtml(r.reason || "")}
      </div>
    </div>
  `).join("");

  setPage(
    "Time Off",
    "Request and track time off.",
    `
      <div class="card">
        <div class="alert ${locked ? "warn" : "ok"}" style="margin-top:0;">
          ${locked ? "🔒 Time Off requests will be enabled after March 2." : "✅ Time Off requests are enabled."}
        </div>
        <div class="muted" style="margin-top:10px;line-height:1.45;">
          Requests will appear here with status (pending/approved/denied).
        </div>
      </div>

      <div style="height:12px"></div>
      ${list || `<div class="card"><div class="muted">No requests yet.</div></div>`}
    `
  );
}

function renderHours(recordData) {
  const locked = !isAfterStartWork();
  const items = Array.isArray(recordData?.hours) ? recordData.hours : [];

  const list = items.map(h => `
    <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="font-weight:900;">Week of ${escapeHtml(h.weekStart || "—")}</div>
      <div class="muted" style="margin-top:6px;">
        Total: ${escapeHtml(String(h.totalHours ?? "—"))} • Overtime: ${escapeHtml(String(h.overtime ?? "—"))}
      </div>
    </div>
  `).join("");

  setPage(
    "My Hours",
    "Weekly hour summary.",
    `
      <div class="card">
        <div class="alert ${locked ? "warn" : "ok"}" style="margin-top:0;">
          ${locked ? "🔒 Hours will show after March 2." : "✅ Hours are available."}
        </div>
      </div>

      <div style="height:12px"></div>
      ${list || `<div class="card"><div class="muted">No hours yet.</div></div>`}
    `
  );
}

function renderDeposit(recordData) {
  const locked = !isAfterStartWork();
  const d = recordData?.deposit || {};
  setPage(
    "Direct Deposit",
    "Banking information (view only).",
    `
      <div class="card">
        <div class="alert ${locked ? "warn" : "info"}" style="margin-top:0;">
          Contact HR to update banking information.
        </div>

        <div class="kv" style="margin-top:10px;">
          <div class="k">Bank</div><div class="v">${escapeHtml(safe(d.bankName, "Pending"))}</div>
          <div class="k">Account</div><div class="v">${escapeHtml(safe(d.last4Account ? "****" + d.last4Account : "", "Pending"))}</div>
        </div>
      </div>
    `
  );
}

function renderTeam(recordData) {
  const contacts = (recordData?.contacts && typeof recordData.contacts === "object") ? recordData.contacts : {};
  const keys = Object.keys(contacts);

  const list = keys.map(k => {
    const c = contacts[k] || {};
    return `
      <div class="card" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
        <div style="font-weight:900;">${escapeHtml(c.name || "—")}</div>
        <div class="muted" style="margin-top:6px;">
          ${escapeHtml(c.role || "")}
          ${c.email ? " • " + escapeHtml(c.email) : ""}
          ${c.phone ? " • " + escapeHtml(c.phone) : ""}
        </div>
      </div>
    `;
  }).join("");

  setPage(
    "Team",
    "Your assigned contacts.",
    `
      ${list || `
        <div class="card">
          <div class="alert warn" style="margin-top:0;">🔒 Team contacts will be added by HR.</div>
          <div class="muted" style="line-height:1.45;">Once assigned, your supervisor and HR contact will appear here.</div>
        </div>
      `}
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

  const list = merged.map(n => `
    <div class="note" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div class="note-title" style="font-weight:900;">${escapeHtml(n.title || "")}</div>
        <div class="small muted" style="font-weight:900;">
          ${n._scope === "company" ? "Company" : n._scope === "hr" ? "HR" : "You"}
        </div>
      </div>
      <div class="note-body muted" style="margin-top:6px;line-height:1.4;">${escapeHtml(n.body || "")}</div>
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
      <div class="stack">${list || `<div class="muted">No notifications</div>`}</div>
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

// ---------- Router (FIXED) ----------
function renderRoute(userData, saveUserPatch, publicData, recordData) {
  renderStagebar(userData);

  switch (routeName()) {
    case "progress":      return renderProgress(userData, recordData);

    // keep old route (compat)
    case "roles":         return renderRoles();

    // onboarding
    case "shift":
    case "shift_selection": return renderShiftSelection(userData, saveUserPatch);
    case "footwear":      return renderFootwear(userData, saveUserPatch, publicData);
    case "i9":            return renderI9(userData, saveUserPatch);
    case "documents":     return renderDocumentsLocked();
    case "firstday":      return renderFirstDayLocked(userData, recordData);

    // modules
    case "schedule":      return renderSchedule(recordData);
    case "payroll":       return renderPayroll(recordData);
    case "timeoff":       return renderTimeOff(recordData);
    case "hours":         return renderHours(recordData);
    case "deposit":       return renderDeposit(recordData);

    // team + notifications + help
    case "team":          return renderTeam(recordData);
    case "notifications": return renderNotifications(userData, recordData, publicData);
    case "help":          return renderHelp(publicData);

    default:
      // ✅ DO NOT force progress silently if it's a valid hash typo;
      // but to keep it simple: go progress
      location.hash = "#progress";
      return;
  }
}

// ---------- Init ----------
export async function initEmployeeApp() {
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusChip"); // ✅ FIX: your HTML is statusChip
  const adminBtn = document.getElementById("btnAdminGo");

  wireMobileMenuOnce();

  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview mode");
    if (statusChip) uiSetText(statusChip, "offline");
    if (adminBtn) adminBtn.style.display = "none";

    const demoUser = defaultUserDoc({ email: "preview@demo", displayName: "Preview" });
    const demoPublic = defaultPublicContent();
    const demoRecord = {};

    renderRoute(demoUser, async () => {}, demoPublic, demoRecord);
    window.addEventListener("hashchange", () => renderRoute(demoUser, async () => {}, demoPublic, demoRecord));
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

      const rerender = () => {
        if (!currentUserData) return;
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData);
      };

      // portal/public (company content)
      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists()
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        rerender();
      });

      // employeeRecords/{SP###} (admin data that must exist BEFORE user)
      onSnapshot(recordRef, async (snap) => {
        currentRecordData = snap.exists() ? (snap.data() || {}) : {};

        // ✅ One-time “copy appointment to user doc” if user has none yet (no overwrite)
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

      // users/{uid} (onboarding progress)
      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() || {};

        // ✅ Safe defaults (NO destructive overwrite)
        const base = defaultUserDoc(user);

        // steps merge (keep progress)
        let mergedSteps = Array.isArray(d.steps) ? d.steps : [];
        if (!Array.isArray(d.steps) || d.steps.length < base.steps.length) {
          const old = Array.isArray(d.steps) ? d.steps : [];
          mergedSteps = base.steps.map(s => {
            const o = old.find(x => x.id === s.id);
            return o ? { ...s, done: !!o.done, label: s.label } : s;
          });
        }

        currentUserData = {
          ...base,
          ...d,
          steps: mergedSteps,
          appointment: (d.appointment && typeof d.appointment === "object") ? d.appointment : base.appointment,
          shift: (d.shift && typeof d.shift === "object") ? d.shift : base.shift,
          footwear: (d.footwear && typeof d.footwear === "object") ? d.footwear : base.footwear,
          i9: (d.i9 && typeof d.i9 === "object") ? d.i9 : base.i9,
          notifications: Array.isArray(d.notifications) ? d.notifications : base.notifications
        };

        rerender();
      });

      window.addEventListener("hashchange", rerender);

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}
