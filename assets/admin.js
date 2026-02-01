import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * IMPORTANT:
 * - This admin panel assumes admin users exist in Firestore:
 *   admins/{uid}  -> { role: "admin" }
 * - Employee records are stored in:
 *   users/{uid}   -> { email, fullName, appointment, steps, shift, stage, status, ... }
 */

let targetUid = null;
let targetData = null;

function q$(id) { return document.getElementById(id); }

/** Hard fail with readable message instead of blank screen */
function mustEl(id) {
  const el = q$(id);
  if (!el) throw new Error(`Missing element id="${id}" in admin.html`);
  return el;
}

function demoEmployees() {
  return [
    { uid:"preview1", email:"alex@preview", fullName:"Alex Preview", phone:"", status:"active", stage:"shift_selection" },
    { uid:"preview2", email:"maria@preview", fullName:"Maria Preview", phone:"", status:"in_review", stage:"application" }
  ];
}

function renderStepsEditor(steps) {
  const el = mustEl("stepsEditor");
  el.innerHTML = "";

  (steps || []).forEach((s, i) => {
    const row = document.createElement("label");
    row.className = "checkrow";
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" ${s.done ? "checked" : ""}/>
      <span>${escapeHtml(s.label)}</span>
      <span class="chip ${s.done ? "ok" : "warn"}">${s.done ? "Done" : "Pending"}</span>
    `;
    el.appendChild(row);
  });
}

/** OPTIONAL: If you have these summary fields in HTML, we fill them. If not, ignore. */
function safeSet(id, value) {
  const el = q$(id);
  if (el) uiSetText(el, value ?? "—");
}

function fillSummary(uid, d) {
  // If these IDs don't exist in your HTML, it won't crash.
  safeSet("vUid", uid || "—");
  safeSet("vName", d?.fullName || "—");
  safeSet("vEmail", d?.email || "—");
  safeSet("vPhone", d?.phone || "—");
  safeSet("vStage", d?.stage || "—");
  safeSet("vStatus", d?.status || "—");

  // Stage fields (match admin.html)
  const stageSelect = q$("stageSelect");
  if (stageSelect) stageSelect.value = d?.stage || "application";

  const stageConfirmed = q$("stageConfirmed");
  if (stageConfirmed) stageConfirmed.value = String(!!d?.stageConfirmed);

  // Shift fields (match your HTML)
  mustEl("shiftChoice").value = d?.shift?.choice || "";
  mustEl("shiftConfirmed").value = String(!!d?.shift?.confirmed);

  // Appointment fields (if they exist in HTML)
  const aDate = q$("aDate");
  const aTime = q$("aTime");
  const aAddr = q$("aAddr");
  const aNotes = q$("aNotes");
  if (aDate)  aDate.value  = d?.appointment?.date || "";
  if (aTime)  aTime.value  = d?.appointment?.time || "";
  if (aAddr)  aAddr.value  = d?.appointment?.address || "";
  if (aNotes) aNotes.value = d?.appointment?.notes || "";

  renderStepsEditor(d?.steps || []);
}

async function requireAdmin(user) {
  if (!isFirebaseConfigured()) return true; // preview mode
  if (!user?.uid) return false;
  const ref = doc(db, "admins", user.uid);
  const snap = await getDoc(ref);
  return snap.exists() && snap.data()?.role === "admin";
}

async function findUserByEmail(email) {
  if (!isFirebaseConfigured()) {
    const demo = demoEmployees().find(x => x.email === email) || demoEmployees()[0];
    return {
      uid: demo.uid,
      data: {
        email: demo.email,
        fullName: demo.fullName,
        phone: demo.phone,
        status: demo.status,
        stage: demo.stage,
        appointment: { date:"2026-02-03", time:"10:30", address:"4299 ... Louisville, KY", notes:"Bring ID" },
        steps: [
          { id:"application", label:"Application", done: true },
          { id:"shift_selection", label:"Shift Selection", done: false },
          { id:"docs", label:"Complete Onboarding Documents", done: false },
          { id:"first_day", label:"First Day Preparation", done: false }
        ],
        shift: { choice:"", confirmed:false }
      }
    };
  }

  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return { uid: docSnap.id, data: docSnap.data() };
}

async function updateTarget(patch) {
  if (!targetUid) throw new Error("No employee selected.");
  if (!isFirebaseConfigured()) {
    uiToast("Preview mode: not saving (Firebase later).");
    return;
  }
  const ref = doc(db, "users", targetUid);
  await updateDoc(ref, patch);
}

async function loadQuickList() {
  const el = mustEl("quickList");
  el.innerHTML = "";

  if (!isFirebaseConfigured()) {
    demoEmployees().forEach(u => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div>
          <div class="li-title">${escapeHtml(u.fullName)}</div>
          <div class="li-sub muted">${escapeHtml(u.email)} • stage: ${escapeHtml(u.stage)}</div>
        </div>
        <button class="btn sm ghost" disabled>Open</button>
      `;
      el.appendChild(item);
    });
    return;
  }

  // If you don't have indexes yet, keep it simple:
  el.innerHTML = `<div class="muted small">Quick list will populate after you create some users.</div>`;
}

function wireButton(id, handler) {
  const el = q$(id);
  if (!el) return; // allow HTML variations
  el.addEventListener("click", handler);
}

export async function initAdminApp(user) {
  // 1) Guard: only admin can stay here
  const ok = await requireAdmin(user);
  if (!ok) {
    window.location.href = "./employee.html";
    return;
  }

  // 2) Load quick list (never crashes now)
  await loadQuickList();

  // 3) Search/load employee by email (optional UI)
  wireButton("btnSearch", async () => {
    const emailInput = q$("searchEmail");
    const searchMsg  = q$("searchMsg");
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (searchMsg) uiSetText(searchMsg, "");
    if (!email) {
      if (searchMsg) uiSetText(searchMsg, "Enter an email.");
      return;
    }

    const found = await findUserByEmail(email);
    if (!found) {
      targetUid = null;
      targetData = null;
      if (searchMsg) uiSetText(searchMsg, "Not found.");
      fillSummary(null, null);
      return;
    }

    targetUid = found.uid;
    targetData = found.data;
    fillSummary(targetUid, targetData);
    if (searchMsg) uiSetText(searchMsg, "Loaded.");
  });

  // 4) Save stage/shift (matches your HTML ids)
  wireButton("btnSaveStageShift", async () => {
    const stageMsg = q$("stageMsg");
    if (stageMsg) uiSetText(stageMsg, "");
    try {
      const stage = mustEl("stageSelect").value;
      const stageConfirmed = mustEl("stageConfirmed").value === "true";

      const choice = mustEl("shiftChoice").value;
      const confirmed = mustEl("shiftConfirmed").value === "true";

      await updateTarget({
        stage,
        stageConfirmed,
        shift: { choice, confirmed }
      });

      uiToast("Stage/shift saved.");
      if (stageMsg) uiSetText(stageMsg, "Saved.");
    } catch (e) {
      if (stageMsg) uiSetText(stageMsg, e?.message || String(e));
      else throw e;
    }
  });

  // 5) Save steps
  wireButton("btnSaveSteps", async () => {
    const stepsMsg = q$("stepsMsg");
    if (stepsMsg) uiSetText(stepsMsg, "");
    try {
      if (!targetData?.steps) throw new Error("No steps loaded. Search an employee email first.");
      const boxes = Array.from(document.querySelectorAll('#stepsEditor input[type="checkbox"][data-i]'));
      const steps = targetData.steps.map((s, i) => ({ ...s, done: !!boxes[i]?.checked }));

      await updateTarget({ steps });
      uiToast("Steps saved.");
      if (stepsMsg) uiSetText(stepsMsg, "Saved.");
    } catch (e) {
      if (stepsMsg) uiSetText(stepsMsg, e?.message || String(e));
      else throw e;
    }
  });

  // 6) Appointment saving (only if those fields exist in your admin.html)
  wireButton("btnSaveAppointment", async () => {
    const apptMsg = q$("apptMsg");
    if (apptMsg) uiSetText(apptMsg, "");
    try {
      const aDate  = q$("aDate")?.value?.trim() ?? "";
      const aTime  = q$("aTime")?.value?.trim() ?? "";
      const aAddr  = q$("aAddr")?.value?.trim() ?? "";
      const aNotes = q$("aNotes")?.value?.trim() ?? "";

      await updateTarget({
        appointment: { date: aDate, time: aTime, address: aAddr, notes: aNotes }
      });

      uiToast("Appointment saved.");
      if (apptMsg) uiSetText(apptMsg, "Saved.");
    } catch (e) {
      if (apptMsg) uiSetText(apptMsg, e?.message || String(e));
      else throw e;
    }
  });
}
