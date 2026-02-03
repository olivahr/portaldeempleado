// ===============================
// Employee Portal (AMAZON A to Z STYLE)
// ✅ Stagebar only on #progress
// ✅ Clean router (no duplicate switches)
// ✅ Read employeeRecords/{SP###} for appointment/contacts/notifications + modules
// ✅ Keep users/{uid} for onboarding progress (shift/footwear/i9/steps)
// ✅ Global company content from portal/public
// ✅ Require Employee ID from allowedEmployees/{id} (range auto-allow optional)
// ✅ Show Employee ID in top badge (userBadge)
// ✅ Hide Admin button unless user is admin
// ✅ Mobile hamburger opens/closes sidebar (safe, no double listeners)
// ✅ Help & Support (big actions + ticket)
// ✅ Safety Footwear (5 checks + embedded shop route)
// ✅ Schedule list (A to Z feel)
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Global company content doc (admin updates -> all employees see)
const PUBLIC_DOC = () => doc(db, "portal", "public");

// Employee record keyed by empId (admin sets data before user registers)
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);

// Tickets collection
const TICKETS_COL = () => collection(db, "supportTickets");

// ✅ Range auto-allow (so you don't add 180 IDs by hand)
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ---------- Helpers ----------
function routeName() {
  return (location.hash || "#progress").replace("#", "").trim().toLowerCase();
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

function fmtDate(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return d;
    return x.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
  } catch { return d; }
}

// ✅ Build safe tel: link from "(502) 555-0148" etc
function telLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "tel:0";
}

// ---------- Default user doc (UI defaults only; we DO NOT overwrite) ----------
function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",
    stage: "shift_selection",

    // compat only (real appt source = employeeRecords)
    appointment: { date: "", time: "", address: "", notes: "" },

    // ✅ Use route-aligned step ids (documents / firstday)
    steps: [
      { id: "application", label: "Application", done: true },
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "footwear", label: "Safety Footwear", done: false },
      { id: "i9", label: "I-9 Documents", done: false },
      { id: "documents", label: "Complete Onboarding Documents", done: false }, // 🔒 in person
      { id: "firstday", label: "First Day Preparation", done: false }           // 🔒 in person
    ],

    shift: { position: "", shift: "" },

    // ✅ footwear now 5 acks
    footwear: { ack1:false, ack2:false, ack3:false, ack4:false, ack5:false },

    i9: { ack:false },

    employeeId: "",
    notifications: [],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

/**
 * ✅ CRITICAL:
 * Does NOT overwrite steps/appointment/etc.
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
    const d = snap.exists() ? (snap.data() || {}) : {};
    return snap.exists() && (d.role === "admin" || d.isAdmin === true);
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

// ---------- Mobile Menu (SAFE) ----------
function wireMobileMenuOnce() {
  const btnMenu = document.getElementById("btnMenu");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("drawerOverlay");

  if (!btnMenu || !sidebar || !overlay) return;
  if (btnMenu.dataset.wired === "1") return;
  btnMenu.dataset.wired = "1";

  const open = () => { sidebar.classList.add("open"); overlay.classList.add("show"); };
  const close = () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); };

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

// ---------- Stagebar (ONLY Progress) ----------
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
      .sb-chip.lock{opacity:.6}
      .sb-ico{width:18px;display:inline-flex;justify-content:center;}
    </style>
    <div class="sb-wrap">${shift}</div>
  `;
}

// ---------- Defaults for global company content ----------
function defaultPublicContent() {
  return {
    footwear: {
      programTitle: "Safety Footwear Program",
      shopUrl: "https://example.com"
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
    globalNotifications: []
  };
}

// ===============================
// RENDERERS (APP FEEL)
// ===============================
function sectionHeader(title, right = "") {
  return `
    <div style="
      display:flex;justify-content:space-between;align-items:center;
      gap:10px; flex-wrap:wrap; margin-bottom:10px;
    ">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">
        ${escapeHtml(title)}
      </div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
}

function bigActionButton(href, label, sub, emoji = "🟦") {
  return `
    <a class="btn ghost" href="${escapeHtml(href)}"
      style="
        display:flex;justify-content:space-between;align-items:center;
        width:100%; padding:14px 14px;
        border-radius:16px;
        border:1px solid var(--line);
        box-shadow: 0 10px 24px rgba(15,23,42,.06);
        margin-top:10px;
      ">
      <div style="display:flex;gap:12px;align-items:center;">
        <div style="
          width:38px;height:38px;border-radius:14px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(29,78,216,.10);
          font-size:18px;
        ">${emoji}</div>
        <div>
          <div style="font-weight:1000;font-size:14px;">${escapeHtml(label)}</div>
          <div class="small muted" style="margin-top:4px;line-height:1.25;">${escapeHtml(sub || "")}</div>
        </div>
      </div>
      <div class="small muted" style="font-weight:1000;">›</div>
    </a>
  `;
}

function renderProgress(userData, recordData) {
  const steps = Array.isArray(userData?.steps) ? userData.steps : [];
  const appt = recordData?.appointment || userData?.appointment || {};

  const next = steps.find(s => !s.done);
  const nextLabel = next?.label ? `Next: ${next.label}` : "All steps completed";

  const stepsHtml = steps.map(s => `
    <div class="card" style="
      border:1px solid var(--line);
      border-radius:16px;
      padding:12px;
      margin-top:10px;
      box-shadow: 0 10px 24px rgba(15,23,42,.05);
    ">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <div style="font-weight:1000;">${escapeHtml(s.label || "")}</div>
        <div class="small muted" style="font-weight:1000;">
          ${s.done ? "Completed ✓" : "Pending •"}
        </div>
      </div>
    </div>
  `).join("");

  setPage(
    "Progress",
    nextLabel,
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Your checklist")}
        ${stepsHtml || `<div class="muted">No steps yet.</div>`}
      </div>

      <div style="height:12px"></div>

      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
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
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Position Preference")}
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${posCard("assembler","Solar Panel Assembler","Hands-on assembly of solar panels.","$18–$23/hr",pos)}
          ${posCard("material","Material Handler / Warehouse","Moves materials, inventory support.","$18–$22/hr",pos)}
          ${posCard("qc","Quality Control / Inspection","Inspect panels for quality and safety.","$19–$23/hr",pos)}
        </div>

        <div style="height:14px"></div>

        ${sectionHeader("Shift Preference")}
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${shiftCard("early","Early Shift","6:00 AM – 2:30 PM",sh)}
          ${shiftCard("mid","Mid Shift","2:00 PM – 10:30 PM",sh)}
          ${shiftCard("late","Late Shift","10:00 PM – 6:30 AM",sh)}
        </div>

        <button class="btn primary" id="btnShiftSave" type="button" style="margin-top:14px;width:100%;border-radius:16px;">
          Save Preferences
        </button>

        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          Preferences only — final assignment is confirmed by HR.
        </div>
      </div>
    `
  );

  function posCard(key, title, desc, pay, selectedKey){
    const selected = selectedKey === key;
    return `
      <label class="card" style="
        border:1px solid ${selected ? "rgba(22,163,74,.35)" : "var(--line)"};
        border-radius:16px;padding:12px;
        background:${selected ? "rgba(22,163,74,.06)" : "#fff"};
        cursor:pointer;
        box-shadow: 0 10px 24px rgba(15,23,42,.05);
      ">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="radio" name="pos" value="${escapeHtml(key)}" ${selected ? "checked":""} style="margin-top:3px;"/>
          <div style="flex:1;">
            <div style="font-weight:1000;">${escapeHtml(title)}</div>
            <div class="muted" style="margin-top:6px;line-height:1.4;">${escapeHtml(desc)}</div>
            <div class="small muted" style="margin-top:8px;font-weight:1000;">Pay Range: ${escapeHtml(pay)}</div>
          </div>
        </div>
      </label>
    `;
  }

  function shiftCard(key, title, hours, selectedKey){
    const selected = selectedKey === key;
    return `
      <label class="card" style="
        border:1px solid ${selected ? "rgba(22,163,74,.35)" : "var(--line)"};
        border-radius:16px;padding:12px;
        background:${selected ? "rgba(22,163,74,.06)" : "#fff"};
        cursor:pointer;
        box-shadow: 0 10px 24px rgba(15,23,42,.05);
      ">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="radio" name="shift" value="${escapeHtml(key)}" ${selected ? "checked":""} style="margin-top:3px;"/>
          <div style="flex:1;">
            <div style="font-weight:1000;">${escapeHtml(title)}</div>
            <div class="muted" style="margin-top:6px;">${escapeHtml(hours)}</div>
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
    uiToast("Preferences saved.");
    location.hash = "#footwear";
  };
}

function renderI9(userData, saveUserPatch) {
  const i9 = userData?.i9 || {};
  const done = !!(userData?.steps || []).find(s => s.id === "i9")?.done;

  setPage(
    "I-9 Documents",
    "Bring original, unexpired documents on your first day.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        <div class="alert info" style="margin-top:0;">
          You must bring original, unexpired documents on your first day.
        </div>

        <label class="checkrow" style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;">
          <input type="checkbox" id="i9Ack" ${i9.ack ? "checked":""}/>
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
    location.hash = "#progress";
  };
}

// ---- Safety Footwear (Amazon-level + 5 checks + embedded shop route) ----
function renderFootwear(userData, saveUserPatch, publicData) {
  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const fw = userData?.footwear || {};
  const steps = userData?.steps || [];
  const done = !!steps.find(s => s.id === "footwear")?.done;

  setPage(
    fwPublic.programTitle || "Safety Footwear Program",
    "Safety footwear is required for warehouse and production roles.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Policy & Requirements")}
        <div class="muted" style="line-height:1.5;">
          Approved protective footwear is mandatory for all warehouse and production employees.
          Footwear must be:
          <ul class="ul" style="margin-top:8px;">
            <li>Closed-toe / closed-heel</li>
            <li>Slip-resistant soles</li>
            <li>Toe protection if required</li>
            <li>Maintained in good condition</li>
          </ul>
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Reimbursement")}
        <div class="muted" style="line-height:1.5;">
          SunPowerC supports workplace safety through a footwear reimbursement program.
          Reimbursement is processed after verification and will be included in your first paycheck after approval.
          Purchases must be made through the designated store to qualify.
        </div>

        <div style="height:12px"></div>

        ${sectionHeader("Employee Responsibilities")}
        <div class="muted" style="line-height:1.5;">
          Employees must arrive with approved footwear before being allowed on the production floor.
          Non-compliance may delay start date or site access.
        </div>

        <div style="height:14px"></div>

        <a class="btn primary" href="#footwearshop"
           style="display:block;width:100%;text-align:center;border-radius:16px;padding:14px;">
          Shop Approved Safety Footwear
        </a>

        <div style="height:14px"></div>

        ${sectionHeader("Acknowledgements")}
        ${ackRow("fwAck1", fw.ack1, "I understand safety footwear is required for my role.")}
        ${ackRow("fwAck2", fw.ack2, "I will purchase approved footwear before my first shift.")}
        ${ackRow("fwAck3", fw.ack3, "I understand purchases must be made through the designated store to qualify.")}
        ${ackRow("fwAck4", fw.ack4, "I understand reimbursement is processed after verification.")}
        ${ackRow("fwAck5", fw.ack5, "I understand reimbursement will be included in my first paycheck after approval.")}

        <button class="btn primary" id="btnFwSave" type="button"
          style="margin-top:14px;width:100%;border-radius:16px;opacity:.75;"
          disabled>
          ${done ? "Saved" : "Continue"}
        </button>

        <div class="small muted" style="margin-top:10px;line-height:1.35;">
          Security note: Do not share your Employee ID or personal info by text message.
        </div>
      </div>
    `
  );

  function ackRow(id, checked, text) {
    return `
      <label class="checkrow" style="
        display:flex;gap:10px;align-items:flex-start;
        padding:12px;border:1px solid var(--line);
        border-radius:16px;margin-top:10px;
        background:#fff;
        box-shadow: 0 10px 24px rgba(15,23,42,.04);
      ">
        <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked":""}/>
        <span style="font-size:13px;line-height:1.35;">${escapeHtml(text)}</span>
      </label>
    `;
  }

  const btn = document.getElementById("btnFwSave");

  const syncBtn = () => {
    const a1 = document.getElementById("fwAck1")?.checked;
    const a2 = document.getElementById("fwAck2")?.checked;
    const a3 = document.getElementById("fwAck3")?.checked;
    const a4 = document.getElementById("fwAck4")?.checked;
    const a5 = document.getElementById("fwAck5")?.checked;
    const all = !!(a1 && a2 && a3 && a4 && a5);
    if (btn) {
      btn.disabled = !all;
      btn.style.opacity = all ? "1" : ".75";
    }
  };

  ["fwAck1","fwAck2","fwAck3","fwAck4","fwAck5"].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.addEventListener("change", syncBtn);
  });

  syncBtn();

  btn.onclick = async () => {
    const a1 = document.getElementById("fwAck1").checked;
    const a2 = document.getElementById("fwAck2").checked;
    const a3 = document.getElementById("fwAck3").checked;
    const a4 = document.getElementById("fwAck4").checked;
    const a5 = document.getElementById("fwAck5").checked;
    if (!a1 || !a2 || !a3 || !a4 || !a5) return uiToast("Please confirm all items to continue.");

    const newSteps = (steps || []).map(s =>
      s.id === "footwear" ? ({ ...s, done: true }) : s
    );

    await saveUserPatch({
      footwear: { ack1:a1, ack2:a2, ack3:a3, ack4:a4, ack5:a5 },
      steps: newSteps,
      stage: "i9"
    });

    uiToast("Safety footwear saved.");
    location.hash = "#i9";
  };
}

function renderFootwearShop(publicData) {
  const fwPublic = publicData?.footwear || defaultPublicContent().footwear;
  const url = fwPublic.shopUrl || "";

  setPage(
    "Safety Footwear Shop",
    "In-app store view.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Shop Approved Footwear", "Secure")}
        <div class="muted" style="line-height:1.45;">
          If the in-app view is blocked by the store’s security settings, use “Open in Browser”.
        </div>

        <div style="height:12px"></div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a class="btn ghost" href="#footwear" style="border-radius:14px;">← Back</a>
          ${url ? `
            <a class="btn primary" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="border-radius:14px;">
              Open in Browser
            </a>
          ` : ""}
        </div>

        <div style="height:12px"></div>

        ${url ? `
          <div style="
            border:1px solid var(--line);
            border-radius:18px;
            overflow:hidden;
            height:70vh;
            box-shadow: 0 14px 30px rgba(15,23,42,.06);
            background:#fff;
          ">
            <iframe
              src="${escapeHtml(url)}"
              style="width:100%;height:100%;border:0;"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer"
            ></iframe>
          </div>
        ` : `
          <div class="alert warn" style="margin-top:0;">Shop URL is not set by admin yet.</div>
        `}
      </div>
    `
  );
}

function renderDocumentsLocked() {
  setPage(
    "Documents",
    "Completed in person on your first day.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
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
    "First Day",
    "Check-in details and instructions.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Check-In Information")}
        <div class="kv" style="margin-top:0;">
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

// ---------- WORK MODULES (A to Z FEEL) ----------
function renderSchedule(recordData) {
  const events = Array.isArray(recordData?.scheduleEvents) ? recordData.scheduleEvents : [];
  const weekly = recordData?.schedule || {};

  const listEvents = events.map(ev => {
    const date = ev.date || "";
    const start = ev.start || "";
    const end = ev.end || "";
    const role = ev.role || "";
    const loc = ev.location || "";
    const status = ev.status || "Scheduled";

    return `
      <div class="card" style="
        border-radius:18px; padding:14px;
        border:1px solid var(--line);
        box-shadow: 0 14px 30px rgba(15,23,42,.06);
        margin-top:12px;
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-weight:1100;font-size:14px;">${escapeHtml(fmtDate(date) || "Upcoming Shift")}</div>
            <div class="muted" style="margin-top:6px;font-size:13px;">
              ${escapeHtml((start && end) ? `${start} – ${end}` : "Time pending")}
              ${role ? " • " + escapeHtml(role) : ""}
            </div>
            ${loc ? `<div class="small muted" style="margin-top:8px;font-weight:900;">${escapeHtml(loc)}</div>` : ""}
          </div>

          <div class="small muted" style="
            font-weight:1100;
            padding:8px 10px;border-radius:999px;
            border:1px solid var(--line);
            background:rgba(29,78,216,.06);
          ">
            ${escapeHtml(status)}
          </div>
        </div>
      </div>
    `;
  }).join("");

  const weekRow = (dayKey, label) => {
    const d = weekly?.[dayKey] || {};
    const type = d.type || "";
    const start = d.start || "";
    const end = d.end || "";

    const badge =
      type === "work" ? "Work" :
      type === "holiday" ? "Holiday" :
      type === "off" ? "Day Off" :
      "Pending";

    const line =
      (start && end) ? `${start} – ${end}` :
      (type === "off") ? "Day Off" :
      "Pending";

    return `
      <div style="
        display:flex;justify-content:space-between;gap:10px;
        padding:12px;border-radius:16px;
        border:1px solid var(--line);
        background:#fff;
        box-shadow: 0 10px 24px rgba(15,23,42,.04);
        margin-top:10px;
      ">
        <div>
          <div style="font-weight:1100;">${escapeHtml(label)}</div>
          <div class="muted" style="margin-top:6px;">${escapeHtml(line)}</div>
        </div>
        <div class="small muted" style="font-weight:1100;">${escapeHtml(badge)}</div>
      </div>
    `;
  };

  setPage(
    "Schedule",
    "Your upcoming shifts and weekly overview.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Upcoming Shifts")}
        <div class="muted" style="line-height:1.45;">
          This is your official schedule once assigned by HR.
        </div>
        ${listEvents || `<div style="margin-top:12px;" class="muted">No scheduled shifts yet.</div>`}
      </div>

      <div style="height:12px"></div>

      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Weekly Overview")}
        ${weekRow("monday","Monday")}
        ${weekRow("tuesday","Tuesday")}
        ${weekRow("wednesday","Wednesday")}
        ${weekRow("thursday","Thursday")}
        ${weekRow("friday","Friday")}
        ${weekRow("saturday","Saturday")}
        ${weekRow("sunday","Sunday")}
      </div>
    `
  );
}

function renderPayroll(recordData) {
  const items = Array.isArray(recordData?.payroll) ? recordData.payroll : [];

  const list = items.map(p => `
    <div class="card" style="
      border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:12px;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    ">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:1100;">Pay Date: ${escapeHtml(p.payDate || "—")}</div>
        <div class="small muted" style="font-weight:1100;">${escapeHtml(p.status || "stub")}</div>
      </div>
      <div class="muted" style="margin-top:8px;">
        Period: ${escapeHtml((p.periodStart||"—") + " → " + (p.periodEnd||"—"))}
      </div>

      <button class="btn ghost" type="button" disabled
        style="margin-top:12px;width:100%;border-radius:16px;">
        View Pay Stub (enabled by HR)
      </button>
    </div>
  `).join("");

  setPage(
    "Payroll",
    "Pay stubs and pay periods.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Pay Stubs")}
        <div class="muted" style="line-height:1.45;">
          Pay stubs will appear here once uploaded by payroll.
        </div>
        ${list || `<div style="margin-top:12px;" class="muted">No pay stubs yet.</div>`}
      </div>
    `
  );
}

function renderTimeOff(recordData) {
  const reqs = Array.isArray(recordData?.timeOffRequests) ? recordData.timeOffRequests : [];

  const list = reqs.map(r => `
    <div class="card" style="
      border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:12px;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    ">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:1100;">${escapeHtml(r.type || "Time Off")}</div>
        <div class="small muted" style="font-weight:1100;">${escapeHtml(r.status || "pending")}</div>
      </div>
      <div class="muted" style="margin-top:8px;">
        ${escapeHtml((r.startDate||"—") + " → " + (r.endDate||"—"))}
      </div>
      ${r.reason ? `<div class="small muted" style="margin-top:8px;line-height:1.35;">${escapeHtml(r.reason)}</div>` : ""}
    </div>
  `).join("");

  setPage(
    "Time Off",
    "Requests and approvals.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Your Requests")}
        <div class="muted" style="line-height:1.45;">
          Requests will appear here with status (pending/approved/denied).
        </div>
        ${list || `<div style="margin-top:12px;" class="muted">No requests yet.</div>`}
      </div>
    `
  );
}

function renderHours(recordData) {
  const items = Array.isArray(recordData?.hours) ? recordData.hours : [];

  const list = items.map(h => `
    <div class="card" style="
      border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:12px;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    ">
      <div style="font-weight:1100;">Week of ${escapeHtml(h.weekStart || "—")}</div>
      <div class="muted" style="margin-top:8px;">
        Total: ${escapeHtml(String(h.totalHours ?? "—"))}
        • Overtime: ${escapeHtml(String(h.overtime ?? "—"))}
      </div>
    </div>
  `).join("");

  setPage(
    "My Hours",
    "Weekly summary.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Weekly Hours")}
        <div class="muted" style="line-height:1.45;">
          Your posted hours will appear here.
        </div>
        ${list || `<div style="margin-top:12px;" class="muted">No hours posted yet.</div>`}
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
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
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

function renderTeam(recordData) {
  const contacts = (recordData?.contacts && typeof recordData.contacts === "object") ? recordData.contacts : {};
  const keys = Object.keys(contacts);

  const list = keys.map(k => {
    const c = contacts[k] || {};
    return `
      <div class="card" style="
        border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:12px;
        box-shadow: 0 14px 30px rgba(15,23,42,.06);
      ">
        <div style="font-weight:1100;">${escapeHtml(c.name || "—")}</div>
        <div class="muted" style="margin-top:8px;">
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
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Contacts")}
        ${list || `<div class="muted">No contacts assigned yet.</div>`}
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

  const list = merged.map(n => `
    <div class="card" style="
      border:1px solid var(--line);
      border-radius:18px;
      padding:14px;
      margin-top:12px;
      box-shadow: 0 14px 30px rgba(15,23,42,.06);
    ">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:1100;">${escapeHtml(n.title || "")}</div>
        <div class="small muted" style="font-weight:1100;">
          ${n._scope === "company" ? "Company" : n._scope === "hr" ? "HR" : "You"}
        </div>
      </div>
      <div class="muted" style="margin-top:10px;line-height:1.45;">${escapeHtml(n.body || "")}</div>
      <div style="margin-top:12px;">
        <a class="btn ghost" href="#${escapeHtml(n.route || "progress")}"
          style="border-radius:16px; width:100%; text-align:center;">
          ${escapeHtml(n.action || "Open")}
        </a>
      </div>
    </div>
  `).join("");

  setPage(
    "Notifications",
    "Updates and reminders.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Inbox")}
        ${list || `<div class="muted">No notifications</div>`}
      </div>
    `
  );
}

// ✅ Help & Support (FULL corporate)
function renderHelp(publicData, empId, user) {
  const h = publicData?.help || defaultPublicContent().help;
  const site = publicData?.site || defaultPublicContent().site;

  setPage(
    "Help & Support",
    "Get assistance fast.",
    `
      <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("We’re here to help.")}
        <div class="muted" style="line-height:1.45;">
          Choose the option below and we’ll get you taken care of.
        </div>

        ${bigActionButton(telLink(h.phone || "(502) 555-0148"), "Call HR", `${escapeHtml(h.phone || "(502) 555-0148")} • Mon–Fri 8:00 AM – 5:00 PM (ET)`, "📞")}
        ${bigActionButton(`mailto:${(h.email || "hr@sunpowerc.energy")}?subject=${encodeURIComponent("Employee Portal Help")}`, "Email HR", `${escapeHtml(h.email || "hr@sunpowerc.energy")} • Response within 24 business hours`, "✉️")}
        ${bigActionButton(`#help-ticket`, "Open a Support Ticket", "Submit a request directly inside the portal", "🛟")}
        ${bigActionButton(`#help-safety`, "Report an Emergency / Safety Issue", "Emergency: 911 • On-site contacts available", "🚨")}
        ${bigActionButton(`#help-faq`, "FAQ / Common Issues", "Login, First Day, Footwear, Documents, Payroll, Schedule", "❓")}

        <div style="height:12px"></div>

        <div class="alert info" style="margin-top:0;">
          Do not share your Employee ID or personal information by text message.
          Messages are monitored during business hours.
        </div>
      </div>

      <!-- Ticket -->
      <div id="help-ticket" class="card" style="margin-top:12px;border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
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

      <!-- Safety -->
      <div id="help-safety" class="card" style="margin-top:12px;border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Emergencies / Safety")}
        <div class="alert warn" style="margin-top:0;">
          For immediate danger or medical emergencies, call 911.
        </div>

        ${bigActionButton("tel:911", "Emergency", "Call 911 immediately", "🚑")}
        ${bigActionButton(telLink(site.safetyPhone || "(502) 555-0172"), "Safety / Supervisor", `${escapeHtml(site.safetyPhone || "(502) 555-0172")}`, "🦺")}
        ${bigActionButton(telLink(site.managerPhone || "(502) 555-0122"), "Site Manager", `${escapeHtml(site.managerPhone || "(502) 555-0122")}`, "🏭")}

        ${site.address ? `
          <div style="margin-top:12px;" class="muted">
            <span style="font-weight:1000;">Site Address:</span> ${escapeHtml(site.address)}
          </div>
        ` : ""}
      </div>

      <!-- FAQ -->
      <div id="help-faq" class="card" style="margin-top:12px;border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
        ${sectionHeader("Common Help Topics")}
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
          ${faqRow("Can’t log in / wrong Employee ID", "Confirm your Employee ID is SP###. If you still can’t access, open a ticket.")}
          ${faqRow("First Day instructions", "Go to First Day for check-in details. If missing, HR will update your appointment.")}
          ${faqRow("Safety Footwear / reimbursement", "Complete the Safety Footwear step and shop through the designated store.")}
          ${faqRow("I-9 / Documents", "I-9 and Documents are completed in person on your first day.")}
          ${faqRow("Schedule / Payroll / PTO", "These sections update when HR posts data to your profile.")}
          ${faqRow("Direct Deposit help", "For banking changes, contact HR directly.")}
        </div>
      </div>
    `
  );

  function faqRow(title, body) {
    return `
      <div style="
        border:1px solid var(--line);
        border-radius:16px;
        padding:12px;
        background:#fff;
        box-shadow: 0 10px 24px rgba(15,23,42,.04);
      ">
        <div style="font-weight:1100;">${escapeHtml(title)}</div>
        <div class="muted" style="margin-top:8px;line-height:1.45;">${escapeHtml(body)}</div>
      </div>
    `;
  }

  // Wire ticket submit
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

// ---------- Router (CLEAN + FIXED) ----------
function renderRoute(userData, saveUserPatch, publicData, recordData, ctx) {
  const sb = document.getElementById("stagebar");
  if (sb) sb.innerHTML = "";

  const r = routeName();

  if (r === "progress") renderStagebar(userData);

  switch (r) {
    // onboarding
    case "progress":          return renderProgress(userData, recordData);

    case "shift":
    case "shift_selection":   return renderShiftSelection(userData, saveUserPatch);

    case "footwear":          return renderFootwear(userData, saveUserPatch, publicData);
    case "footwearshop":      return renderFootwearShop(publicData);

    case "i9":                return renderI9(userData, saveUserPatch);

    // ✅ aliases (old + new)
    case "documents":
    case "docs":              return renderDocumentsLocked();

    case "firstday":
    case "first_day":         return renderFirstDayLocked(userData, recordData);

    // work modules
    case "schedule":          return renderSchedule(recordData);
    case "hours":             return renderHours(recordData);
    case "payroll":           return renderPayroll(recordData);
    case "timeoff":           return renderTimeOff(recordData);
    case "deposit":           return renderDeposit(recordData);

    // other
    case "team":              return renderTeam(recordData);
    case "notifications":     return renderNotifications(userData, recordData, publicData);
    case "help":              return renderHelp(publicData, ctx?.empId, ctx?.user);

    default:
      location.hash = "#progress";
      return;
  }
}

// ---------- Init ----------
export async function initEmployeeApp() {
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusShift"); // ✅ matches your HTML
  const adminBtn = document.getElementById("btnAdminGo");

  wireMobileMenuOnce();

  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview mode");
    if (statusChip) uiSetText(statusChip, "offline");
    if (adminBtn) adminBtn.style.display = "none";

    const demoUser = defaultUserDoc({ email: "preview@demo", displayName: "Preview" });
    const demoPublic = defaultPublicContent();
    const demoRecord = {};
    const ctx = { empId: "PREVIEW", user: { uid:"preview", email:"preview@demo" } };

    renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx);
    window.addEventListener("hashchange", () => renderRoute(demoUser, async () => {}, demoPublic, demoRecord, ctx));
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
        renderRoute(currentUserData, saveUserPatch, currentPublicData, currentRecordData, ctx);
      };

      // portal/public (company content)
      onSnapshot(publicRef, (snap) => {
        currentPublicData = snap.exists()
          ? { ...defaultPublicContent(), ...snap.data() }
          : defaultPublicContent();
        rerender();
      });

      // employeeRecords/{SP###} (admin data)
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

      // users/{uid} (onboarding progress)
      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() || {};
        const base = defaultUserDoc(user);

        // ✅ steps merge (keep progress, upgrade older ids if needed)
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

        // footwear merge (supports old 4-ack docs too)
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

        rerender();
      });

      window.addEventListener("hashchange", rerender);

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}
