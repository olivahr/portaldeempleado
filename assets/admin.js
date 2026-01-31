import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, updateDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let targetUid = null;
let targetData = null;

function q$(id) { return document.getElementById(id); }

function demoEmployees() {
  return [
    { uid:"preview1", email:"alex@preview", fullName:"Alex Preview", phone:"", status:"active", stage:"shift_selection" },
    { uid:"preview2", email:"maria@preview", fullName:"Maria Preview", phone:"", status:"in_review", stage:"application" }
  ];
}

function renderStepsEditor(steps) {
  const el = q$("stepsEditor");
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

function fillSummary(uid, d) {
  uiSetText(q$("vUid"), uid || "—");
  uiSetText(q$("vName"), d?.fullName || "—");
  uiSetText(q$("vEmail"), d?.email || "—");
  uiSetText(q$("vPhone"), d?.phone || "—");
  uiSetText(q$("vStage"), d?.stage || "—");
  uiSetText(q$("vStatus"), d?.status || "—");

  q$("stageSel").value = d?.stage || "application";
  q$("statusSel").value = d?.status || "in_review";

  q$("shiftChoice").value = d?.shift?.choice || "";
  q$("shiftConfirmed").value = String(!!d?.shift?.confirmed);

  q$("aDate").value = d?.appointment?.date || "";
  q$("aTime").value = d?.appointment?.time || "";
  q$("aAddr").value = d?.appointment?.address || "";
  q$("aNotes").value = d?.appointment?.notes || "";

  renderStepsEditor(d?.steps || []);
}

async function findUserByEmail(email) {
  if (!isFirebaseConfigured()) {
    // preview only
    const demo = demoEmployees().find(x => x.email === email) || demoEmployees()[0];
    return { uid: demo.uid, data: {
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
    }};
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
  const el = q$("quickList");
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

  // Optional: if you later add "createdAt" index, you can orderBy it.
  // For now, do nothing if you don't want extra indexes.
  el.innerHTML = <div class="muted small">Quick list will populate after you create some users.</div>;
}
export async function initAdminApp() {
  await loadQuickList();

  q$("btnSearch").addEventListener("click", async () => {
    const email = q$("searchEmail").value.trim();
    uiSetText(q$("searchMsg"), "");
    if (!email) return uiSetText(q$("searchMsg"), "Enter an email.");

    const found = await findUserByEmail(email);
    if (!found) {
      targetUid = null;
      targetData = null;
      uiSetText(q$("searchMsg"), "Not found.");
      fillSummary(null, null);
      return;
    }

    targetUid = found.uid;
    targetData = found.data;
    fillSummary(targetUid, targetData);
    uiSetText(q$("searchMsg"), "Loaded.");
  });

  q$("btnSaveAppointment").addEventListener("click", async () => {
    uiSetText(q$("apptMsg"), "");
    try {
      await updateTarget({
        appointment: {
          date: q$("aDate").value.trim(),
          time: q$("aTime").value.trim(),
          address: q$("aAddr").value.trim(),
          notes: q$("aNotes").value.trim()
        }
      });
      uiToast("Appointment saved.");
      uiSetText(q$("apptMsg"), "Saved.");
    } catch (e) {
      uiSetText(q$("apptMsg"), e?.message || String(e));
    }
  });

  q$("btnSaveStageShift").addEventListener("click", async () => {
    uiSetText(q$("stageMsg"), "");
    try {
      const stage = q$("stageSel").value;
      const status = q$("statusSel").value;
      const choice = q$("shiftChoice").value;
      const confirmed = q$("shiftConfirmed").value === "true";

      await updateTarget({
        stage,
        status,
        shift: { choice, confirmed }
      });

      uiToast("Stage/shift saved.");
      uiSetText(q$("stageMsg"), "Saved.");
    } catch (e) {
      uiSetText(q$("stageMsg"), e?.message || String(e));
    }
  });

  q$("btnSaveSteps").addEventListener("click", async () => {
    uiSetText(q$("stepsMsg"), "");
    try {
      if (!targetData?.steps) throw new Error("No steps loaded.");
      const boxes = Array.from(document.querySelectorAll("#stepsEditor input[type=checkbox][data-i]"));
      const steps = targetData.steps.map((s, i) => ({ ...s, done: boxes[i]?.checked || false }));

      await updateTarget({ steps });
      uiToast("Steps saved.");
      uiSetText(q$("stepsMsg"), "Saved.");
    } catch (e) {
      uiSetText(q$("stepsMsg"), e?.message || String(e));
    }
  });
}
