// ===============================
// Employee Portal Router (SAFE)
// UI-only now, Firebase later
// ===============================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";

// ---------- Helpers ----------
function routeName() {
  return (location.hash || "#progress").replace("#", "");
}

function setPage(title, sub, html) {
  uiSetText(document.getElementById("pageTitle"), title);
  uiSetText(document.getElementById("pageSub"), sub);
  document.getElementById("pageBody").innerHTML = html;
}

// ---------- Demo user (preview mode) ----------
function demoUser() {
  return {
    stage: "shift",
    appointment: {
      date: "Pending",
      time: "Pending",
      address: "4299 Louisville, KY"
    }
  };
}

// ---------- Renderers ----------
function renderProgress(user) {
  setPage(
    "Progress",
    "Track your progress and complete pending steps.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Steps</h3>
        <div class="alert ok">Application — Completed</div>
        <div class="alert warn">Shift Selection — Pending</div>
        <div class="alert warn">Documents — Pending</div>
        <div class="alert warn">First Day — Pending</div>
      </div>

      <div class="card">
        <h3 class="h3">Appointment</h3>
        <div class="kv">
          <div class="k">Date</div><div class="v">${escapeHtml(user.appointment.date)}</div>
          <div class="k">Time</div><div class="v">${escapeHtml(user.appointment.time)}</div>
          <div class="k">Address</div><div class="v">${escapeHtml(user.appointment.address)}</div>
        </div>
      </div>
    </div>
    `
  );
}

function renderRoles() {
  setPage(
    "Roles & Scheduling",
    "View role details and work schedule.",
    `
    <div class="grid2">
      <div class="card">
        <h3 class="h3">Role</h3>
        <div class="kv">
          <div class="k">Position</div><div class="v">Warehouse Associate</div>
          <div class="k">Status</div><div class="v">Active</div>
        </div>
      </div>

      <div class="card">
        <h3 class="h3">Schedule</h3>
        <div class="kv">
          <div class="k">Shift</div><div class="v">Not confirmed</div>
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

function renderShift() {
  setPage(
    "Shift Selection",
    "Select your preferred work shift.",
    `
    <div class="card">
      <label class="radio-row">
        <input type="radio" name="shift"/>
        <div><b>Early Shift</b><div class="muted">6:00 AM – 2:30 PM</div></div>
      </label>
      <label class="radio-row">
        <input type="radio" name="shift" checked/>
        <div><b>Mid Shift</b><div class="muted">2:00 PM – 10:30 PM</div></div>
      </label>
      <label class="radio-row">
        <input type="radio" name="shift"/>
        <div><b>Late Shift</b><div class="muted">10:00 PM – 6:30 AM</div></div>
      </label>

      <button class="btn primary mt" id="confirmShift">Confirm Shift</button>
    </div>
    `
  );

  document.getElementById("confirmShift").onclick = () => {
    uiToast("Shift confirmed (preview).");
    location.hash = "#progress";
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

function renderFirstDay() {
  setPage(
    "First Day",
    "What to bring and where to go.",
    `
    <div class="card">
      <ul class="ul">
        <li>Government ID</li>
        <li>Comfortable work clothes</li>
        <li>Safety footwear</li>
      </ul>
    </div>
    `
  );
}

function renderTeam() {
  setPage(
    "Team",
    "Your site contacts.",
    `
    <div class="card">
      <div class="list-item"><b>Site Manager</b><span class="muted">(555) 123-4567</span></div>
      <div class="list-item"><b>Shift Lead</b><span class="muted">(555) 987-6543</span></div>
      <div class="list-item"><b>HR</b><span class="muted">(555) 456-7890</span></div>
    </div>
    `
  );
}

function renderNotifications() {
  setPage(
    "Notifications",
    "Updates and reminders.",
    `
    <div class="card">
      <div class="note">
        <b>Bring your I-9 documents</b>
        <div class="muted">Required for your first day.</div>
        <a href="#i9" class="btn sm ghost mt">View I-9</a>
      </div>
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
function renderRoute(user) {
  switch (routeName()) {
    case "progress": return renderProgress(user);
    case "roles": return renderRoles();
    case "documents": return renderDocuments();
    case "i9": return renderI9();
    case "shift": return renderShift();
    case "footwear": return renderFootwear();
    case "firstday": return renderFirstDay();
    case "team": return renderTeam();
    case "notifications": return renderNotifications();
    case "help": return renderHelp();
    default:
      location.hash = "#progress";
  }
}

// ---------- Init ----------
export async function initEmployeeApp() {
  const user = demoUser();
  renderRoute(user);

  window.addEventListener("hashchange", () => {
    renderRoute(user);
  });
}
