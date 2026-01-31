import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

/**
 * Firestore lazy loader (NO crashea si Firebase no está listo)
 */
let __fs = null;
async function getFirestoreFns() {
  if (__fs) return __fs;
  // Solo intenta cargar Firestore si Firebase está configurado
  if (!isFirebaseConfigured()) return null;

  const m = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  __fs = {
    doc: m.doc,
    getDoc: m.getDoc,
    updateDoc: m.updateDoc,
    serverTimestamp: m.serverTimestamp,
  };
  return __fs;
}

// UI-only fallback data (cuando Firebase no está configurado o no hay sesión)
function demoUser() {
  return {
    fullName: "Employee (Preview)",
    email: "preview@local",
    phone: "",
    status: "active",
    stage: "shift_selection",
    appointment: {
      date: "2026-02-03",
      time: "10:30",
      address: "4299 ... Louisville, KY",
      notes: "Bring ID"
    },
    steps: [
      { id: "application", label: "Application", done: true },
      { id: "shift_selection", label: "Shift Selection", done: false },
      { id: "docs", label: "Complete Onboarding Documents", done: false },
      { id: "first_day", label: "First Day Preparation", done: false }
    ],
    shift: { choice: "", confirmed: false },
    contacts: {
      siteManager: { name:"Site Manager", phone:"(555) 123-4567", email:"manager@example.com" },
      shiftLead: { name:"Shift Lead", phone:"(555) 987-6543", email:"lead@example.com" },
      hr: { name:"HR", phone:"(555) 456-7890", email:"hr@example.com" },
      safety: { name:"Safety", phone:"(555) 321-0009", email:"safety@example.com" }
    },
    notifications: [
      { id:"n1", title:"Bring your I-9 documents on your first day", body:"Bring acceptable ID documents for I-9 verification.", action:"View I-9 Readiness", route:"i9" },
      { id:"n2", title:"Please Confirm Your Work Shift", body:"Select your work schedule to confirm your shift.", action:"Go to Shift Selection", route:"shift" }
    ]
  };
}

const STAGES = [
  { id: "application", label: "Application" },
  { id: "shift_selection", label: "Shift Selection" },
  { id: "onboarding", label: "Onboarding" },
  { id: "start_working", label: "Start Working" }
];

function stageIndex(stage) {
  const idx = STAGES.findIndex(s => s.id === stage);
  return idx >= 0 ? idx : 0;
}

function renderStagebar(user) {
  const el = document.getElementById("stagebar");
  if (!el) return;

  const idx = stageIndex(user.stage);
  el.innerHTML = "";

  STAGES.forEach((s, i) => {
    const done = i < idx;
    const active = i === idx;

    const node = document.createElement("div");
    node.className = "stage";

    const top = document.createElement("div");
    top.className = "stage-top";

    const dot = document.createElement("div");
    dot.className = "stage-dot " + (done ? "done" : active ? "active" : "");
    top.appendChild(dot);

    if (i < STAGES.length - 1) {
      const line = document.createElement("div");
      line.className = "stage-line " + (done ? "done" : "");
      top.appendChild(line);
    }

    const label = document.createElement("div");
    label.className = "stage-label " + (active ? "active" : "");
    label.textContent = s.label;

    node.appendChild(top);
    node.appendChild(label);
    el.appendChild(node);
  });
}

async function loadUserDoc(uid) {
  if (!isFirebaseConfigured()) return demoUser();

  const fs = await getFirestoreFns();
  if (!fs) return demoUser();

  const ref = fs.doc(db, "users", uid);
  const snap = await fs.getDoc(ref);
  return snap.exists() ? snap.data() : demoUser();
}

async function saveUserDoc(uid, patch) {
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving (Firebase later).");
    return;
  }

  const fs = await getFirestoreFns();
  if (!fs) {
    uiToast("Firebase not ready yet.");
    return;
  }

  const ref = fs.doc(db, "users", uid);
  await fs.updateDoc(ref, { ...patch, updatedAt: fs.serverTimestamp() });
}

function setPageMeta(title, sub) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
}

function routeName() {
  return (location.hash || "#progress").replace("#", "");
}

function renderProgress(user) {
  setPageMeta("Progress", "Track your progress and complete pending steps.");

  const appt = user.appointment || {};
  const apptBox = `
    <div class="card">
      <h3 class="h3">Your Appointment</h3>
      <div class="kv">
        <div class="k">Date</div><div class="v">${escapeHtml(appt.date || "Pending")}</div>
        <div class="k">Time</div><div class="v">${escapeHtml(appt.time || "Pending")}</div>
        <div class="k">Address</div><div class="v">${escapeHtml(appt.address || "Pending")}</div>
        <div class="k">Notes</div><div class="v">${escapeHtml(appt.notes || "—")}</div>
      </div>
    </div>
  `;

  const stepsHtml = (user.steps || []).map(s => `
    <label class="checkrow">
      <input type="checkbox" data-step="${escapeHtml(s.id)}" ${s.done ? "checked" : ""}/>
      <span>${escapeHtml(s.label)}</span>
      <span class="chip ${s.done ? "ok" : "warn"}">${s.done ? "Done" : "Pending"}</span>
    </label>
  `).join("");

  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Steps</h3>
        <div class="muted small">Check items as you complete them.</div>
        <div style="height:10px"></div>
        <div class="stack">${stepsHtml || `<div class="muted">No steps</div>`}</div>
        <button class="btn primary" id="btnSaveSteps">Save</button>
        <div class="small muted" id="saveStepsMsg"></div>
      </div>
      ${apptBox}
    </div>
  `;

  document.getElementById("btnSaveSteps").addEventListener("click", async () => {
    const boxes = Array.from(document.querySelectorAll("input[type=checkbox][data-step]"));
    const stepMap = new Map(boxes.map(b => [b.getAttribute("data-step"), b.checked]));
    const nextSteps = (user.steps || []).map(s => ({ ...s, done: !!stepMap.get(s.id) }));

    // auto-stage simple (si falta algo, pone stage al primer pendiente)
    const nextPending = nextSteps.find(s => !s.done);
    const stage = nextPending ? nextPending.id : "start_working";

    await window.__EMP_save({ steps: nextSteps, stage });
    uiToast("Saved.");
    await window.__EMP_reload();
  });
}

function renderRoles(user) {
  setPageMeta("Roles & Scheduling", "View role details and work schedule.");

  const shift = user.shift || {};
  const shiftText = shift.confirmed
    ? `Confirmed: ${escapeHtml(shift.choice || "—")}`
    : "Not confirmed";

  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Role</h3>
        <div class="kv">
          <div class="k">Position</div><div class="v">Warehouse Associate</div>
          <div class="k">Site</div><div class="v">Local Facility</div>
          <div class="k">Status</div><div class="v">${escapeHtml(user.status || "—")}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="h3">Work Schedule</h3>
        <div class="kv">
          <div class="k">Shift</div><div class="v">${shiftText}</div>
          <div class="k">Overtime</div><div class="v">As available</div>
        </div>
        <a class="btn ghost" href="#shift">Go to Shift Selection</a>
      </div>
    </div>
  `;
}

function renderDocuments(user) {
  setPageMeta("Documents", "Upload and review your onboarding documents.");

  document.getElementById("pageBody").innerHTML = `
    <div class="card">
      <h3 class="h3">Document Checklist</h3>
      <div class="muted small">UI is ready. Later we can connect uploads (Storage) if you want.</div>

      <div style="height:10px"></div>

      <div class="list">
        <div class="list-item">
          <div>
            <div class="li-title">Government ID</div>
            <div class="li-sub muted">Upload a valid ID.</div>
          </div>
          <button class="btn sm ghost" disabled>Upload</button>
        </div>
        <div class="list-item">
          <div>
            <div class="li-title">Direct Deposit</div>
            <div class="li-sub muted">Bank info form.</div>
          </div>
          <button class="btn sm ghost" disabled>Open</button>
        </div>
        <div class="list-item">
          <div>
            <div class="li-title">Policies & Acknowledgements</div>
            <div class="li-sub muted">Read and sign.</div>
          </div>
          <button class="btn sm ghost" disabled>Review</button>
        </div>
      </div>
    </div>
  `;
}

function renderI9(user) {
  setPageMeta("I-9", "Prepare acceptable documents for I-9 verification.");

  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">What to bring</h3>
        <div class="muted small">Examples (not legal advice):</div>
        <ul class="ul">
          <li>Passport (List A)</li>
          <li>OR Driver’s License + Social Security card (Lists B + C)</li>
        </ul>
        <div class="alert info">Bring original documents on your first day.</div>
      </div>

      <div class="card">
        <h3 class="h3">Ready check</h3>
        <label class="checkrow">
          <input type="checkbox" id="i9Ready"/>
          <span>I have my documents ready</span>
          <span class="chip warn" id="i9Chip">Pending</span>
        </label>
        <button class="btn primary" id="btnSaveI9">Save</button>
      </div>
    </div>
  `;

  document.getElementById("btnSaveI9").addEventListener("click", async () => {
    const ready = document.getElementById("i9Ready").checked;
    const chip = document.getElementById("i9Chip");
    if (chip) {
      chip.textContent = ready ? "Done" : "Pending";
      chip.className = "chip " + (ready ? "ok" : "warn");
    }

    // Opcional: marcar docs como done si ready
    const steps = (user.steps || []).map(s => (s.id === "docs" ? { ...s, done: ready } : s));
    await window.__EMP_save({ steps });
    uiToast("Saved.");
    await window.__EMP_reload();
  });
}

function renderShift(user) {
  setPageMeta("Shift Selection", "Select your preferred work shift and confirm.");

  const shift = user.shift || {};
  const selected = shift.choice || "";
  const confirmed = !!shift.confirmed;

  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Choose your shift</h3>

        <div class="radio">
          <label class="radio-row">
            <input type="radio" name="shift" value="early" ${selected==="early" ? "checked" : ""}/>
            <div>
              <div class="li-title">Early Shift</div>
              <div class="li-sub muted">Example: 6:00 AM – 2:30 PM</div>
            </div>
          </label>

          <label class="radio-row">
            <input type="radio" name="shift" value="mid" ${selected==="mid" ? "checked" : ""}/>
            <div>
              <div class="li-title">Mid Shift</div>
              <div class="li-sub muted">Example: 2:00 PM – 10:30 PM</div>
            </div>
          </label>

          <label class="radio-row">
            <input type="radio" name="shift" value="late" ${selected==="late" ? "checked" : ""}/>
            <div>
              <div class="li-title">Late Shift</div>
              <div class="li-sub muted">Example: 10:00 PM – 6:30 AM</div>
            </div>
          </label>
        </div>

        <div style="height:10px"></div>

        <button class="btn primary" id="btnSaveShift">Save</button>
        <button class="btn ghost" id="btnConfirmShift" ${!selected ? "disabled" : ""}>Confirm Shift</button>

        <div class="alert ${confirmed ? "ok" : "warn"}" style="margin-top:12px;">
          ${confirmed ? `Shift confirmed: <b>${escapeHtml(selected)}</b>` : "Shift not confirmed."}
        </div>
      </div>

      <div class="card">
        <h3 class="h3">Next</h3>
        <div class="muted small">After confirming your shift, continue onboarding steps.</div>
        <a class="btn ghost" href="#progress">Go to Progress</a>
      </div>
    </div>
  `;

  document.getElementById("btnSaveShift").addEventListener("click", async () => {
    const choice = document.querySelector("input[name=shift]:checked")?.value || "";
    await window.__EMP_save({ shift: { choice, confirmed: false } });
    uiToast("Saved.");
    await window.__EMP_reload();
  });

  document.getElementById("btnConfirmShift").addEventListener("click", async () => {
    const choice = document.querySelector("input[name=shift]:checked")?.value || "";
    if (!choice) return;

    const steps = (user.steps || []).map(s => (s.id === "shift_selection" ? { ...s, done: true } : s));
    await window.__EMP_save({ shift: { choice, confirmed: true }, steps, stage: "onboarding" });
    uiToast("Shift confirmed.");
    await window.__EMP_reload();
  });
}

function renderFootwear(user) {
  setPageMeta("Safety Footwear", "Order or prepare safety footwear.");

  document.getElementById("pageBody").innerHTML = `
    <div class="card">
      <h3 class="h3">Safety footwear requirement</h3>
      <div class="muted small">Steel-toe or composite-toe may be required depending on site policy.</div>

      <div class="alert info">Bring appropriate footwear on your first day.</div>

      <div class="list">
        <div class="list-item">
          <div>
            <div class="li-title">Footwear size</div>
            <div class="li-sub muted">We can collect this later (optional).</div>
          </div>
          <button class="btn sm ghost" disabled>Edit</button>
        </div>
      </div>
    </div>
  `;
}

function renderFirstDay(user) {
  setPageMeta("First Day", "Your location, what to bring, and check-in instructions.");

  const appt = user.appointment || {};
  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Check-in details</h3>
        <div class="kv">
          <div class="k">Date</div><div class="v">${escapeHtml(appt.date || "Pending")}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(appt.time || "Pending")}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(appt.address || "Pending")}</div>
        </div>
        <div class="alert info">Arrive 10–15 minutes early.</div>
      </div>

      <div class="card">
        <h3 class="h3">What to bring</h3>
        <ul class="ul">
          <li>Government ID (I-9)</li>
          <li>Any required documents</li>
          <li>Comfortable work clothes</li>
        </ul>
        <button class="btn primary" id="btnFirstDayDone">Mark as ready</button>
      </div>
    </div>
  `;

  document.getElementById("btnFirstDayDone").addEventListener("click", async () => {
    const steps = (user.steps || []).map(s => (s.id === "first_day" ? { ...s, done: true } : s));
    await window.__EMP_save({ steps, stage: "start_working" });
    uiToast("Saved.");
    await window.__EMP_reload();
  });
}

function renderTeam(user) {
  setPageMeta("Team", "Your key contacts.");

  const c = user.contacts || {};
  const rows = Object.values(c).map(x => `
    <div class="list-item">
      <div>
        <div class="li-title">${escapeHtml(x.name || "—")}</div>
        <div class="li-sub muted">${escapeHtml(x.email || "")}${x.phone ? " • " + escapeHtml(x.phone) : ""}</div>
      </div>
      <button class="btn sm ghost" disabled>Message</button>
    </div>
  `).join("");

  document.getElementById("pageBody").innerHTML = `
    <div class="card">
      <h3 class="h3">Contacts</h3>
      <div class="list">${rows || `<div class="muted">No contacts yet</div>`}</div>
    </div>
  `;
}

function renderNotifications(user) {
  setPageMeta("Notifications", "Updates and reminders.");

  const list = (user.notifications || []).map(n => `
    <div class="note">
      <div class="note-title">${escapeHtml(n.title || "")}</div>
      <div class="note-body muted">${escapeHtml(n.body || "")}</div>
      <div class="note-actions">
        <button class="btn sm ghost" data-goto="${escapeHtml(n.route || "progress")}">${escapeHtml(n.action || "Open")}</button>
      </div>
    </div>
  `).join("");

  document.getElementById("pageBody").innerHTML = `
    <div class="card">
      <h3 class="h3">Inbox</h3>
      <div class="stack">${list || `<div class="muted">No notifications</div>`}</div>
    </div>
  `;

  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-goto") || "progress";
      location.hash = "#" + r;
    });
  });
}

function renderHelp(user) {
  setPageMeta("Help", "Get support.");

  document.getElementById("pageBody").innerHTML = `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Support</h3>
        <div class="muted small">If you have questions, contact your HR representative.</div>
        <div class="alert info">This section can be wired to email/phone later.</div>
        <button class="btn ghost" disabled>Contact Support</button>
      </div>

      <div class="card">
        <h3 class="h3">Common topics</h3>
        <ul class="ul">
          <li>Reset password</li>
          <li>Updating personal information</li>
          <li>First day instructions</li>
        </ul>
      </div>
    </div>
  `;
}

function renderRoute(user) {
  renderStagebar(user);
  const r = routeName();

  switch (r) {
    case "progress": return renderProgress(user);
    case "roles": return renderRoles(user);
    case "documents": return renderDocuments(user);
    case "i9": return renderI9(user);
    case "shift": return renderShift(user);
    case "footwear": return renderFootwear(user);
    case "firstday": return renderFirstDay(user);
    case "team": return renderTeam(user);
    case "notifications": return renderNotifications(user);
    case "help": return renderHelp(user);
    default:
      location.hash = "#progress";
      return;
  }
}

export async function initEmployeeApp() {
  const statusChip = document.getElementById("statusChip");

  let uid = null;
  let userObj = demoUser();

  async function reload() {
    if (uid) userObj = await loadUserDoc(uid);
    renderRoute(userObj);
  }

  async function save(patch) {
    if (!uid) {
      uiToast("Preview mode: sign in later to save.");
      return;
    }
    await saveUserDoc(uid, patch);
  }

  // Expose helpers
  window.__EMP_reload = reload;
  window.__EMP_save = save;

  // Wait auth once, load doc if signed in
  await new Promise((resolve) => {
    onAuth(async (user) => {
      if (user && isFirebaseConfigured()) {
        uid = user.uid;
        if (statusChip) {
          statusChip.classList.add("ok");
          statusChip.textContent = "online";
        }
      } else {
        uid = null;
        if (statusChip) {
          statusChip.classList.remove("ok");
          statusChip.textContent = "offline";
        }
      }
      await reload();
      resolve();
    });
  });

  // Handle navigation
  window.addEventListener("hashchange", async () => {
    await reload();
  });

  // First paint
  await reload();
}
