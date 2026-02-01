// ===============================
// Employee Portal (Firebase READY)
// - Realtime sync users/{uid}
// - Require Employee ID from allowedEmployees/{id}
// - Show Employee ID in top badge (userBadge)
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

// ---------- Default user doc (if missing) ----------
function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",

    // stages your UI expects
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
    // update last login timestamp (optional)
    await updateDoc(ref, { lastLoginAt: serverTimestamp() });
  }
}

// ---------- Employee ID Gate ----------
async function ensureEmployeeId(user) {
  if (!isFirebaseConfigured()) return "PREVIEW";

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};

  if (data?.employeeId) return data.employeeId;

  // Ask for ID (simple prompt; no HTML changes needed)
  let empId = prompt("Enter your Employee ID (example: SP025):");
  empId = (empId || "").trim();

  if (!empId) throw new Error("Employee ID required.");

  // Validate against whitelist: allowedEmployees/{empId}
  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  if (!allowedSnap.exists() || allowedSnap.data()?.active !== true) {
    throw new Error("Invalid Employee ID. Contact HR.");
  }

  // Save employeeId to user doc
  await updateDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() });

  return empId;
}

// ---------- Renderers (now use real Firestore data) ----------
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

function renderRoles(userData) {
  const shift = userData?.shift || {};
  const shiftText = shift.confirmed ? `Confirmed: ${safe(shift.choice, "—")}` : "Not confirmed";

  setPage(
    "Roles & Scheduling",
    "View role details and work schedule.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Role</h3>
        <div class="kv">
          <div class="k">Position</div><div class="v">Warehouse Associate</div>
          <div class="k">Status</div><div class="v">${escapeHtml(safe(userData?.status, "—"))}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="h3">Schedule</h3>
        <div class="kv">
          <div class="k">Shift</div><div class="v">${escapeHtml(shiftText)}</div>
        </div>
        <a class="btn ghost" href="#shift">Go to Shift Selection</a>
      </div>
    </div>
    `
  );
}

function renderDocuments() {
  setPage(
    "Documents",
    "Complete onboarding documents.",
    `
    <div class="card">
      <div class="list-item"><b>Government ID</b><span class="chip warn">Pending</span></div>
      <div class="list-item"><b>Direct Deposit</b><span class="chip warn">Pending</span></div>
      <div class="list-item"><b>Policies</b><span class="chip warn">Pending</span></div>
      <div class="small muted" style="margin-top:10px;">Uploads can be wired later (Storage).</div>
    </div>
    `
  );
}

function renderI9() {
  setPage(
    "I-9",
    "Prepare documents for employment verification.",
    `
    <div class="card">
      <ul class="ul">
        <li>Passport</li>
        <li>Driver’s License + Social Security</li>
      </ul>
      <div class="alert info">Bring originals on your first day.</div>
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
      <label class="radio-row">
        <input type="radio" name="shift" value="early" ${selected==="early" ? "checked":""}/>
        <div><b>Early Shift</b><div class="muted">6:00 AM – 2:30 PM</div></div>
      </label>
      <label class="radio-row">
        <input type="radio" name="shift" value="mid" ${selected==="mid" ? "checked":""}/>
        <div><b>Mid Shift</b><div class="muted">2:00 PM – 10:30 PM</div></div>
      </label>
      <label class="radio-row">
        <input type="radio" name="shift" value="late" ${selected==="late" ? "checked":""}/>
        <div><b>Late Shift</b><div class="muted">10:00 PM – 6:30 AM</div></div>
      </label>

      <div style="height:10px"></div>
      <button class="btn primary" id="btnSaveShift">Save</button>
      <button class="btn ghost" id="btnConfirmShift" ${!selected ? "disabled":""}>Confirm Shift</button>

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
      stage: "onboarding"
    });

    uiToast("Shift confirmed.");
  };
}

function renderFootwear() {
  setPage(
    "Safety Footwear",
    "Prepare required safety footwear.",
    `
    <div class="card">
      <div class="alert info">
        Steel-toe or composite-toe footwear required.
      </div>
    </div>
    `
  );
}

function renderFirstDay(userData, saveUserPatch) {
  const appt = userData?.appointment || {};
  setPage(
    "First Day",
    "What to bring and where to go.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Check-in details</h3>
        <div class="kv">
          <div class="k">Date</div><div class="v">${escapeHtml(safe(appt.date, "Pending"))}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(safe(appt.time, "Pending"))}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(safe(appt.address, "Pending"))}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="h3">What to bring</h3>
        <ul class="ul">
          <li>Government ID (I-9)</li>
          <li>Any required documents</li>
          <li>Comfortable work clothes</li>
        </ul>
        <button class="btn primary" id="btnFirstDayReady">Mark as ready</button>
      </div>
    </div>
    `
  );

  document.getElementById("btnFirstDayReady").onclick = async () => {
    const steps = (userData.steps || []).map(s =>
      s.id === "first_day" ? ({ ...s, done: true }) : s
    );
    await saveUserPatch({ steps, stage: "start_working" });
    uiToast("Saved.");
  };
}

function renderTeam(userData) {
  const c = userData?.contacts || {};
  const rows = Object.values(c).map(x => `
    <div class="list-item">
      <div>
        <div class="li-title">${escapeHtml(x.name || "—")}</div>
        <div class="li-sub muted">${escapeHtml(x.email || "")} ${x.phone ? "• " + escapeHtml(x.phone) : ""}</div>
      </div>
      <button class="btn sm ghost" disabled>Message</button>
    </div>
  `).join("");

  setPage(
    "Team",
    "Your site contacts.",
    `
    <div class="card">
      <h3 class="h3">Contacts</h3>
      <div class="list">${rows || `<div class="muted">No contacts yet</div>`}</div>
    </div>
    `
  );
}

function renderNotifications(userData) {
  const list = (userData?.notifications || []).map(n => `
    <div class="note">
      <div class="note-title">${escapeHtml(n.title || "")}</div>
      <div class="note-body muted">${escapeHtml(n.body || "")}</div>
      <div class="note-actions">
        <a class="btn sm ghost" href="#${escapeHtml(n.route || "progress")}">${escapeHtml(n.action || "Open")}</a>
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

function renderHelp() {
  setPage(
    "Help",
    "Get assistance.",
    `
    <div class="card">
      <div class="alert info">
        Contact HR or your site manager for help.
      </div>
    </div>
    `
  );
}

// ---------- Router ----------
function renderRoute(userData, saveUserPatch) {
  switch (routeName()) {
    case "progress": return renderProgress(userData);
    case "roles": return renderRoles(userData);
    case "documents": return renderDocuments();
    case "i9": return renderI9();
    case "shift": return renderShift(userData, saveUserPatch);
    case "footwear": return renderFootwear();
    case "firstday": return renderFirstDay(userData, saveUserPatch);
    case "team": return renderTeam(userData);
    case "notifications": return renderNotifications(userData);
    case "help": return renderHelp();
    default:
      location.hash = "#progress";
      return;
  }
}

// ---------- Init ----------
export async function initEmployeeApp() {
  // UI elements from your employee.html
  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusChip");

  // If Firebase not configured, keep preview mode
  if (!isFirebaseConfigured()) {
    uiSetText(badge, "Preview mode");
    if (statusChip) uiSetText(statusChip, "offline");
    const demo = { appointment: { date:"Pending", time:"Pending", address:"4299 Louisville, KY", notes:"" }, steps: [] };
    renderRoute(demo, async () => {});
    window.addEventListener("hashchange", () => renderRoute(demo, async () => {}));
    return;
  }

  onAuth(async (user) => {
    try {
      if (!user) {
        // not signed in -> back to login
        window.location.href = "./index.html";
        return;
      }

      // online badge
      if (statusChip) {
        uiSetText(statusChip, "online");
        statusChip.classList.add("ok");
      }

      // Ensure Firestore user doc exists
      await ensureUserDocExists(user);

      // Require Employee ID (whitelist)
      const empId = await ensureEmployeeId(user);

      // Show Employee ID in header badge (NOT email)
      uiSetText(badge, empId);

      // Realtime sync user doc
      const userRef = doc(db, "users", user.uid);

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      let currentData = null;

      const unsub = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentData = snap.data();
        renderRoute(currentData, saveUserPatch);
      });

      // Re-render on navigation
      window.addEventListener("hashchange", () => {
        if (!currentData) return;
        renderRoute(currentData, saveUserPatch);
      });

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
      // If ID invalid, kick them out (optional)
      // window.location.href = "./index.html";
    }
  });
}
