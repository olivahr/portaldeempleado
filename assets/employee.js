// ===============================
// Employee Portal (Firebase READY)
// - Realtime sync users/{uid}
// - Require Employee ID from allowedEmployees/{id}
// - Show Employee ID in top badge (userBadge)
// - Hide Admin button unless user is admin
// - Mobile hamburger opens/closes sidebar
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
  const t = document.getElementById("pageTitle");
  const s = document.getElementById("pageSub");
  const b = document.getElementById("pageBody");
  if (t) uiSetText(t, title);
  if (s) uiSetText(s, sub);
  if (b) b.innerHTML = html;
}

function safe(v, fallback = "—") {
  return (v === undefined || v === null || v === "") ? fallback : v;
}

// normalize IDs so you can accept "SP-024", "sp024", "SP 024"
function normalizeEmpId(raw) {
  let x = String(raw || "").trim().toUpperCase();
  x = x.replaceAll(" ", "").replaceAll("-", "");
  // If someone writes "SP024" keep it.
  // If someone writes "024" we can force SP prefix (optional):
  if (/^\d+$/.test(x)) x = "SP" + x;
  // Keep only letters+numbers
  x = x.replace(/[^A-Z0-9]/g, "");
  return x;
}

// ---------- Default user doc ----------
function defaultUserDoc(user) {
  return {
    email: user?.email || "",
    fullName: user?.displayName || "",
    role: "employee",
    status: "active",

    // stage your UI expects
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

    // optional later
    contacts: {
      siteManager: { name: "Site Manager", phone: "", email: "" },
      shiftLead:   { name: "Shift Supervisor / Lead", phone: "", email: "" },
      hr:          { name: "HR / People Operations", phone: "", email: "" },
      safety:      { name: "Safety Officer", phone: "", email: "" }
    },

    notifications: [
      { id:"n1", title:"Reminder: Bring your I-9 documents on your first day", body:"Make sure to bring acceptable documents for the I-9 form.", action:"View I-9 Readiness", route:"i9" },
      { id:"n2", title:"Please Confirm Your Work Shift", body:"Select your preferred work schedule to confirm your shift.", action:"Go to Shift Selection", route:"shift" }
    ],

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

  let empId = prompt("Enter your Employee ID (example: SP024):");
  empId = normalizeEmpId(empId);

  if (!empId) throw new Error("Employee ID required.");

  // Validate whitelist: allowedEmployees/{empId} with { active:true }
  const allowedRef = doc(db, "allowedEmployees", empId);
  const allowedSnap = await getDoc(allowedRef);

  if (!allowedSnap.exists() || allowedSnap.data()?.active !== true) {
    throw new Error("Invalid Employee ID. Contact HR.");
  }

  await updateDoc(userRef, { employeeId: empId, updatedAt: serverTimestamp() });
  return empId;
}

// ---------- Mobile menu wiring (uses YOUR HTML ids) ----------
function wireMobileMenu() {
  const btnMenu = document.getElementById("btnMenu");       // ✅ employee.html
  const sidebar = document.getElementById("sidebar");       // ✅ employee.html
  const overlay = document.getElementById("drawerOverlay"); // ✅ employee.html

  if (!btnMenu || !sidebar || !overlay) return;

  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  };

  btnMenu.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });

  overlay.addEventListener("click", close);

  // close after click nav on mobile
  document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 920px)").matches) close();
    });
  });

  // if resized to desktop, close drawer
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 920px)").matches) close();
  });
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
  const list = Object.values(c).map(x => `
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
      <div class="list">${list || `<div class="muted">No contacts yet</div>`}</div>
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
  // Wire menu first (so it always works)
  wireMobileMenu();

  const badge = document.getElementById("userBadge");
  const statusChip = document.getElementById("statusChip");
  const adminBtn = document.getElementById("btnAdminGo");

  // Preview mode
  if (!isFirebaseConfigured()) {
    if (badge) uiSetText(badge, "Preview mode");
    if (statusChip) uiSetText(statusChip, "offline");
    if (adminBtn) adminBtn.style.display = "none";

    const demo = {
      appointment: { date:"Pending", time:"Pending", address:"4299 Louisville, KY", notes:"" },
      steps: []
    };
    renderRoute(demo, async () => {});
    window.addEventListener("hashchange", () => renderRoute(demo, async () => {}));
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

      // ensure doc exists
      await ensureUserDocExists(user);

      // require employeeId (whitelist)
      const empId = await ensureEmployeeId(user);

      // show employeeId in header
      if (badge) uiSetText(badge, empId);

      const userRef = doc(db, "users", user.uid);

      const saveUserPatch = async (patch) => {
        await updateDoc(userRef, { ...patch, updatedAt: serverTimestamp() });
      };

      let currentData = null;

      onSnapshot(userRef, (snap) => {
        if (!snap.exists()) return;
        currentData = snap.data();
        renderRoute(currentData, saveUserPatch);
      });

      window.addEventListener("hashchange", () => {
        if (!currentData) return;
        renderRoute(currentData, saveUserPatch);
      });

    } catch (e) {
      console.error(e);
      uiToast(e?.message || String(e));
    }
  });
}
