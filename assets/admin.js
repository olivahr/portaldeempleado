import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let targetUid = null;
let targetData = null;

function q$(id) { return document.getElementById(id); }

// ---------- Admin guard ----------
async function ensureAdmin(user) {
  if (!isFirebaseConfigured()) return true; // preview
  if (!user?.uid) return false;

  const ref = doc(db, "admins", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const d = snap.data() || {};
  return d.role === "admin" || d.isAdmin === true;
}

// ---------- Employee ID normalize (same idea as employee.js) ----------
function normalizeEmpId(input) {
  let v = (input || "").trim().toUpperCase();
  v = v.replace(/\s+/g, "");
  v = v.replace(/SP[-_]?/g, "SP");
  const m = v.match(/^SP(\d{1,6})$/);
  if (!m) return v;
  return `SP${m[1]}`;
}

// ---------- Default user doc (admin-created placeholder) ----------
function defaultUserDocForId(empId) {
  return {
    email: "",
    fullName: "",
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

    employeeId: empId,
    notifications: [],
    contacts: {},

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

// ---------- Target helpers ----------
async function loadUserByEmployeeId(empId) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("employeeId", "==", empId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { uid: d.id, data: d.data() };
}

async function updateTarget(patch) {
  if (!targetUid) throw new Error("No employee loaded. Search an ID first.");
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving (Firebase off).");
    return;
  }
  const ref = doc(db, "users", targetUid);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

// ---------- UI helpers ----------
function setText(id, v) {
  const el = q$(id);
  if (!el) return;
  uiSetText(el, v ?? "");
}

function uidKey(prefix = "k") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ---------- Appointment ----------
function fillAppointment(d) {
  q$("aDate").value  = d?.appointment?.date || "";
  q$("aTime").value  = d?.appointment?.time || "";
  q$("aAddr").value  = d?.appointment?.address || "";
  q$("aNotes").value = d?.appointment?.notes || "";
}

// ---------- Notifications ----------
function normalizeNotifs(d) {
  const arr = Array.isArray(d?.notifications) ? d.notifications : [];
  return arr.map(n => ({
    id: n?.id || uidKey("n"),
    title: n?.title || "",
    body: n?.body || "",
    route: n?.route || "progress",
    action: n?.action || "Open",
    createdAt: n?.createdAt || null
  }));
}

function renderNotifs() {
  const el = q$("notifList");
  if (!el) return;
  el.innerHTML = "";

  const list = normalizeNotifs(targetData);

  if (!list.length) {
    el.innerHTML = `<div class="small muted">No notifications yet.</div>`;
    return;
  }

  list.forEach((n) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <div class="li-title">${escapeHtml(n.title || "—")}</div>
        <div class="li-sub muted">${escapeHtml(n.body || "")}</div>
        <div class="small muted">Route: ${escapeHtml(n.route || "progress")}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").addEventListener("click", async () => {
      try {
        const next = normalizeNotifs(targetData).filter(x => x.id !== n.id);
        await updateTarget({ notifications: next });
        targetData.notifications = next;
        uiToast("Notification removed.");
        renderNotifs();
      } catch (e) {
        uiToast(e?.message || String(e));
      }
    });

    el.appendChild(row);
  });
}

// ---------- Team contacts ----------
function normalizeContacts(d) {
  const obj = (d && typeof d.contacts === "object" && d.contacts) ? d.contacts : {};
  return obj;
}

function renderTeam() {
  const el = q$("teamList");
  if (!el) return;
  el.innerHTML = "";

  const contacts = normalizeContacts(targetData);
  const keys = Object.keys(contacts);

  if (!keys.length) {
    el.innerHTML = `<div class="small muted">No team contacts yet.</div>`;
    return;
  }

  keys.forEach((k) => {
    const c = contacts[k] || {};
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <div class="li-title">${escapeHtml(c.name || "—")}${c.role ? ` <span class="muted">• ${escapeHtml(c.role)}</span>` : ""}</div>
        <div class="li-sub muted">
          ${escapeHtml(c.email || "")}${c.phone ? ` • ${escapeHtml(c.phone)}` : ""}
        </div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").addEventListener("click", async () => {
      try {
        const next = { ...normalizeContacts(targetData) };
        delete next[k];
        await updateTarget({ contacts: next });
        targetData.contacts = next;
        uiToast("Team contact removed.");
        renderTeam();
      } catch (e) {
        uiToast(e?.message || String(e));
      }
    });

    el.appendChild(row);
  });
}

// ---------- Allowed IDs ----------
async function addAllowedId(empId, name) {
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving.");
    return;
  }
  const clean = normalizeEmpId(empId);
  if (!clean) throw new Error("Employee ID required.");

  // 1) allowedEmployees/{id}
  const allowedRef = doc(db, "allowedEmployees", clean);
  await setDoc(allowedRef, {
    active: true,
    name: (name || "").trim(),
    createdAt: serverTimestamp()
  }, { merge: true });

  // 2) ensure a user doc exists for this employeeId (so admin can load by ID)
  const existing = await loadUserByEmployeeId(clean);
  if (!existing) {
    const usersRef = collection(db, "users");
    const newRef = doc(usersRef); // auto id
    await setDoc(newRef, defaultUserDocForId(clean), { merge: true });
  }
}

async function removeAllowedId(empId) {
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving.");
    return;
  }

  const clean = normalizeEmpId(empId);
  const ref = doc(db, "allowedEmployees", clean);
  await deleteDoc(ref);
}

async function loadAllowedIds() {
  const el = q$("allowedList");
  if (!el) return;
  el.innerHTML = "";

  if (!isFirebaseConfigured()) {
    el.innerHTML = `<div class="small muted">Preview mode: Allowed IDs not loaded.</div>`;
    return;
  }

  const ref = collection(db, "allowedEmployees");
  const snap = await getDocs(ref);

  if (snap.empty) {
    el.innerHTML = `<div class="small muted">No allowed IDs yet.</div>`;
    return;
  }

  snap.forEach((d) => {
    const x = d.data() || {};
    const id = d.id;

    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <div class="li-title">${escapeHtml(id)}</div>
        <div class="li-sub muted">${escapeHtml(x.name || "")} ${x.active === false ? "• inactive" : ""}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").addEventListener("click", async () => {
      try {
        await removeAllowedId(id);
        uiToast("Removed.");
        await loadAllowedIds();
      } catch (e) {
        uiToast(e?.message || String(e));
      }
    });

    el.appendChild(row);
  });
}

// ---------- Main init ----------
export async function initAdminApp(user) {
  const ok = await ensureAdmin(user);
  if (!ok) {
    alert("Not authorized (not admin).");
    window.location.href = "./employee.html";
    return;
  }

  // allowed IDs list always loads
  await loadAllowedIds();

  // Wire: Search employee BY EMPLOYEE ID (input id is still 'searchEmail' in your HTML)
  q$("btnSearch")?.addEventListener("click", async () => {
    const raw = q$("searchEmail")?.value?.trim() || "";
    const empId = normalizeEmpId(raw);

    setText("searchMsg", "");
    if (!empId) return setText("searchMsg", "Enter an Employee ID (ex: SP024).");

    try {
      // Must exist in allowedEmployees and be active
      const allowedRef = doc(db, "allowedEmployees", empId);
      const allowedSnap = await getDoc(allowedRef);
      if (!allowedSnap.exists() || allowedSnap.data()?.active !== true) {
        targetUid = null;
        targetData = null;
        setText("searchMsg", "ID not allowed / not active.");
        uiToast("ID not allowed.");
        return;
      }

      // Load from users by employeeId; if missing, auto-create
      let found = await loadUserByEmployeeId(empId);
      if (!found) {
        const usersRef = collection(db, "users");
        const newRef = doc(usersRef);
        await setDoc(newRef, defaultUserDocForId(empId), { merge: true });
        found = await loadUserByEmployeeId(empId);
      }

      if (!found) {
        targetUid = null;
        targetData = null;
        setText("searchMsg", "Not found.");
        uiToast("Employee not found.");
        return;
      }

      targetUid = found.uid;
      targetData = found.data || {};

      fillAppointment(targetData);
      renderNotifs();
      renderTeam();

      setText("searchMsg", `Loaded: ${empId}`);
      uiToast("Employee loaded.");
    } catch (e) {
      setText("searchMsg", e?.message || String(e));
    }
  });

  // Wire: Save appointment (THIS is what makes it persist after logout)
  q$("btnSaveAppointment")?.addEventListener("click", async () => {
    setText("apptMsg", "");
    try {
      if (!targetUid) throw new Error("Load an Employee ID first.");

      const patch = {
        appointment: {
          date:  q$("aDate")?.value?.trim() || "",
          time:  q$("aTime")?.value?.trim() || "",
          address: q$("aAddr")?.value?.trim() || "",
          notes: q$("aNotes")?.value?.trim() || ""
        }
      };

      await updateTarget(patch);

      // keep local
      targetData = targetData || {};
      targetData.appointment = patch.appointment;

      uiToast("Appointment saved.");
      setText("apptMsg", "Saved.");
    } catch (e) {
      setText("apptMsg", e?.message || String(e));
    }
  });

  // Wire: Add notification
  q$("btnAddNotif")?.addEventListener("click", async () => {
    try {
      if (!targetUid) throw new Error("Load an employee first.");

      const title = q$("nTitle")?.value?.trim() || "";
      const body  = q$("nBody")?.value?.trim() || "";
      const route = q$("nRoute")?.value || "progress";

      if (!title || !body) throw new Error("Enter title and message.");

      const next = normalizeNotifs(targetData);
      next.unshift({
        id: uidKey("n"),
        title,
        body,
        route,
        action: "Open",
        createdAt: Date.now()
      });

      await updateTarget({ notifications: next });

      targetData.notifications = next;

      q$("nTitle").value = "";
      q$("nBody").value = "";
      q$("nRoute").value = "progress";

      uiToast("Notification added.");
      renderNotifs();
    } catch (e) {
      uiToast(e?.message || String(e));
    }
  });

  // Wire: Add team contact
  q$("btnAddTeam")?.addEventListener("click", async () => {
    try {
      if (!targetUid) throw new Error("Load an employee first.");

      const name = q$("tName")?.value?.trim() || "";
      const role = q$("tRole")?.value?.trim() || "";
      const email = q$("tEmail")?.value?.trim() || "";
      const phone = q$("tPhone")?.value?.trim() || "";

      if (!name) throw new Error("Enter a name.");

      const contacts = { ...normalizeContacts(targetData) };
      const key = uidKey("c");

      contacts[key] = { name, role, email, phone };

      await updateTarget({ contacts });

      targetData.contacts = contacts;

      q$("tName").value = "";
      q$("tRole").value = "";
      q$("tEmail").value = "";
      q$("tPhone").value = "";

      uiToast("Team contact added.");
      renderTeam();
    } catch (e) {
      uiToast(e?.message || String(e));
    }
  });

  // Wire: Add allowed ID (+ auto user create)
  q$("btnAddAllowed")?.addEventListener("click", async () => {
    try {
      const empId = q$("newEmpId")?.value?.trim() || "";
      const name  = q$("newEmpName")?.value?.trim() || "";

      await addAllowedId(empId, name);

      q$("newEmpId").value = "";
      q$("newEmpName").value = "";

      uiToast("Allowed ID added.");
      await loadAllowedIds();
    } catch (e) {
      uiToast(e?.message || String(e));
    }
  });
}
