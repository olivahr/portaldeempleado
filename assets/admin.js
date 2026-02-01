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
  // admins/{uid} -> { role:"admin" }
  if (!isFirebaseConfigured()) return true;
  if (!user?.uid) return false;

  const ref = doc(db, "admins", user.uid);
  const snap = await getDoc(ref);
  return snap.exists() && (snap.data()?.role === "admin" || snap.data()?.isAdmin === true);
}

// ---------- Find employee by email ----------
async function findUserByEmail(email) {
  if (!isFirebaseConfigured()) {
    // preview mode
    return {
      uid: "preview1",
      data: {
        email,
        appointment: { date: "2026-02-03", time: "10:30", address: "4299 Louisville, KY", notes: "Bring ID" },
        notifications: [],
        contacts: {}
      }
    };
  }

  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { uid: d.id, data: d.data() };
}

// ---------- Save patch to target user ----------
async function updateTarget(patch) {
  if (!targetUid) throw new Error("No employee loaded. Search an email first.");
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving (Firebase off).");
    return;
  }
  const ref = doc(db, "users", targetUid);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

// ---------- Render helpers ----------
function setText(id, v) {
  const el = q$(id);
  if (!el) return;
  uiSetText(el, v ?? "");
}

function uidKey(prefix = "k") {
  // safe key (no crypto requirement)
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
  // ensure objects
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
      <button class="btn sm ghost">Remove</button>
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
        <div class="li-title">${escapeHtml(c.name || "—")} ${c.role ? `<span class="muted">• ${escapeHtml(c.role)}</span>` : ""}</div>
        <div class="li-sub muted">
          ${escapeHtml(c.email || "")}${c.phone ? ` • ${escapeHtml(c.phone)}` : ""}
        </div>
      </div>
      <button class="btn sm ghost">Remove</button>
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
  if (!empId) throw new Error("Employee ID required.");

  const clean = empId.trim().toUpperCase(); // SP023
  const ref = doc(db, "allowedEmployees", clean);

  await setDoc(ref, {
    active: true,
    name: name || "",
    createdAt: serverTimestamp()
  }, { merge: true });
}

async function removeAllowedId(empId) {
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving.");
    return;
  }
  const ref = doc(db, "allowedEmployees", empId);
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
      <button class="btn sm ghost">Remove</button>
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

  // Wire: Search employee
  q$("btnSearch")?.addEventListener("click", async () => {
    const email = q$("searchEmail")?.value?.trim() || "";
    setText("searchMsg", "");
    if (!email) return setText("searchMsg", "Enter an email.");

    try {
      const found = await findUserByEmail(email);
      if (!found) {
        targetUid = null;
        targetData = null;
        setText("searchMsg", "Not found.");
        uiToast("Employee not found.");
        return;
      }

      targetUid = found.uid;
      targetData = found.data || {};

      // fill UI
      fillAppointment(targetData);
      renderNotifs();
      renderTeam();

      setText("searchMsg", "Loaded.");
      uiToast("Employee loaded.");
    } catch (e) {
      setText("searchMsg", e?.message || String(e));
    }
  });

  // Wire: Save appointment
  q$("btnSaveAppointment")?.addEventListener("click", async () => {
    setText("apptMsg", "");
    try {
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

      // clear inputs
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

      // clear
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

  // Wire: Add allowed ID
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
