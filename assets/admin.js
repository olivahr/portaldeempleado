import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ rango para NO entrar 1x1
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ✅ guardamos por EmployeeID aquí (doc fijo)
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);

let targetEmpId = null;
let targetData = null;

function q$(id){ return document.getElementById(id); }

// ---------- Admin guard ----------
async function ensureAdmin(user){
  if(!isFirebaseConfigured()) return true;
  if(!user?.uid) return false;

  const ref = doc(db,"admins",user.uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return false;

  const d = snap.data()||{};
  return d.role==="admin" || d.isAdmin===true;
}

// ---------- Normalize Employee ID ----------
function normalizeEmpId(input){
  if(!input) return "";
  let v = input.trim().toUpperCase();
  v = v.replace(/\s+/g,"");
  v = v.replace(/SP[-_]?/g,"SP");

  const m = v.match(/^SP(\d{1,6})$/);
  if(!m) return "";
  return `SP${m[1]}`;
}

function empIdToNumber(empId){
  const m = String(empId||"").toUpperCase().match(/^SP(\d{1,6})$/);
  if(!m) return null;
  return Number(m[1]);
}

// ---------- Default employee record (keyed by empId) ----------
function defaultEmployeeRecord(empId){
  return {
    employeeId: empId,

    appointment: { date:"", time:"", address:"", notes:"" },

    notifications: [],
    contacts: {},

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

// ---------- (Compatibility) Load a user doc by employeeId (if exists) ----------
async function loadUserByEmployeeId(empId){
  const usersRef = collection(db,"users");
  const q = query(usersRef,where("employeeId","==",empId),limit(1));
  const snap = await getDocs(q);

  if(snap.empty) return null;
  const d = snap.docs[0];
  return {uid:d.id,data:d.data()};
}

// ---------- UI helpers ----------
function setText(id,v){
  const el=q$(id);
  if(el) uiSetText(el,v??"");
}

function uidKey(p="k"){
  return `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ---------- Appointment ----------
function fillAppointment(d){
  q$("aDate").value  = d?.appointment?.date || "";
  q$("aTime").value  = d?.appointment?.time || "";
  q$("aAddr").value  = d?.appointment?.address || "";
  q$("aNotes").value = d?.appointment?.notes || "";
}

// ---------- Notifications ----------
function normalizeNotifs(d){
  const arr=Array.isArray(d?.notifications)?d.notifications:[];
  return arr.map(n=>({
    id:n?.id||uidKey("n"),
    title:n?.title||"",
    body:n?.body||"",
    route:n?.route||"progress",
    action:n?.action||"Open",
    createdAt:n?.createdAt||null
  }));
}

function renderNotifs(){
  const el=q$("notifList");
  if(!el) return;
  el.innerHTML="";

  const list=normalizeNotifs(targetData);

  if(!list.length){
    el.innerHTML=`<div class="small muted">No notifications yet.</div>`;
    return;
  }

  list.forEach(n=>{
    const row=document.createElement("div");
    row.className="list-item";
    row.innerHTML=`
      <div>
        <div class="li-title">${escapeHtml(n.title || "—")}</div>
        <div class="li-sub muted">${escapeHtml(n.body || "")}</div>
        <div class="small muted">Route: ${escapeHtml(n.route || "progress")}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      try{
        const next = normalizeNotifs(targetData).filter(x=>x.id!==n.id);
        await updateEmployeeRecord({ notifications: next });
        targetData.notifications = next;
        uiToast("Notification removed.");
        renderNotifs();
      }catch(e){
        uiToast(e?.message || String(e));
      }
    };

    el.appendChild(row);
  });
}

// ---------- Team ----------
function normalizeContacts(d){
  const c = (d && typeof d.contacts === "object" && d.contacts) ? d.contacts : {};
  return c;
}

function renderTeam(){
  const el=q$("teamList");
  if(!el) return;
  el.innerHTML="";

  const contacts=normalizeContacts(targetData);
  const keys=Object.keys(contacts);

  if(!keys.length){
    el.innerHTML=`<div class="small muted">No team contacts yet.</div>`;
    return;
  }

  keys.forEach(k=>{
    const c=contacts[k]||{};
    const row=document.createElement("div");
    row.className="list-item";
    row.innerHTML=`
      <div>
        <div class="li-title">${escapeHtml(c.name||"—")}${c.role?` <span class="muted">• ${escapeHtml(c.role)}</span>`:""}</div>
        <div class="li-sub muted">${escapeHtml(c.email||"")}${c.phone?` • ${escapeHtml(c.phone)}`:""}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      try{
        const next={...normalizeContacts(targetData)};
        delete next[k];
        await updateEmployeeRecord({ contacts: next });
        targetData.contacts = next;
        uiToast("Team contact removed.");
        renderTeam();
      }catch(e){
        uiToast(e?.message || String(e));
      }
    };

    el.appendChild(row);
  });
}

// ---------- Allowed IDs (range-friendly) ----------
async function ensureAllowed(empId, name=""){
  const n = empIdToNumber(empId);
  const inRange = (n !== null && n >= EMP_ID_RANGE.min && n <= EMP_ID_RANGE.max);

  const allowedRef = doc(db,"allowedEmployees",empId);
  const snap = await getDoc(allowedRef);

  if(snap.exists()){
    // if exists, must be active
    const active = snap.data()?.active === true;
    if(!active) throw new Error("ID exists but is inactive.");
    return true;
  }

  if(!inRange) throw new Error("ID not registered (and not in allowed range).");

  if(AUTO_CREATE_ALLOWED_ID){
    await setDoc(allowedRef,{
      active:true,
      name:(name||"").trim(),
      createdAt:serverTimestamp()
    },{merge:true});
    return true;
  }

  throw new Error("ID not registered.");
}

async function addAllowedId(empId,name){
  const clean=normalizeEmpId(empId);
  if(!clean) throw new Error("Invalid ID format (SP###)");

  const allowedRef=doc(db,"allowedEmployees",clean);
  await setDoc(allowedRef,{
    active:true,
    name:(name||"").trim(),
    createdAt:serverTimestamp()
  },{merge:true});
}

async function removeAllowedId(empId){
  const clean=normalizeEmpId(empId);
  if(!clean) return;

  // Mejor que borrar: dejar inactive (para auditoría)
  const ref=doc(db,"allowedEmployees",clean);
  await setDoc(ref,{ active:false, updatedAt:serverTimestamp() },{merge:true});
}

async function loadAllowedIds(){
  const el=q$("allowedList");
  if(!el) return;
  el.innerHTML="";

  if(!isFirebaseConfigured()){
    el.innerHTML=`<div class="small muted">Preview mode: Allowed IDs not loaded.</div>`;
    return;
  }

  const snap=await getDocs(collection(db,"allowedEmployees"));

  if(snap.empty){
    el.innerHTML=`<div class="small muted">No IDs yet.</div>`;
    return;
  }

  snap.forEach(d=>{
    const x = d.data() || {};
    const id=d.id;

    const row=document.createElement("div");
    row.className="list-item";
    row.innerHTML=`
      <div>
        <div class="li-title">${escapeHtml(id)}</div>
        <div class="li-sub muted">${escapeHtml(x.name||"")} ${x.active===false?"• inactive":""}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      try{
        await removeAllowedId(id);
        uiToast("Set inactive.");
        await loadAllowedIds();
      }catch(e){
        uiToast(e?.message || String(e));
      }
    };

    el.appendChild(row);
  });
}

// ---------- EmployeeRecord CRUD ----------
async function loadEmployeeRecord(empId){
  const ref = RECORD_DOC(empId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return null;
  return snap.data() || null;
}

async function ensureEmployeeRecordExists(empId){
  const ref = RECORD_DOC(empId);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, defaultEmployeeRecord(empId), { merge:true });
  }
}

async function updateEmployeeRecord(patch){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");
  if(!isFirebaseConfigured()) return;

  const ref = RECORD_DOC(targetEmpId);
  await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge:true });

  // ✅ Compatibility: if a real users/{uid} exists with this employeeId, write appointment there too
  if(patch?.appointment){
    const found = await loadUserByEmployeeId(targetEmpId);
    if(found?.uid){
      const userRef = doc(db,"users",found.uid);
      await setDoc(userRef, { appointment: patch.appointment, updatedAt: serverTimestamp() }, { merge:true });
    }
  }
}

// ---------- INIT ----------
export async function initAdminApp(user){
  if(!await ensureAdmin(user)){
    alert("Not admin");
    return;
  }

  await loadAllowedIds();

  // SEARCH BY ID
  q$("btnSearch").onclick=async()=>{
    try{
      const raw=q$("searchEmail")?.value || "";
      const empId=normalizeEmpId(raw);

      setText("searchMsg","");

      if(!empId){
        setText("searchMsg","Invalid ID format (SP###)");
        return;
      }

      // ✅ allow if exists OR in range (auto create allowed)
      await ensureAllowed(empId);

      // ✅ ensure record doc exists
      await ensureEmployeeRecordExists(empId);

      const rec = await loadEmployeeRecord(empId) || defaultEmployeeRecord(empId);

      targetEmpId = empId;
      targetData = rec;

      fillAppointment(targetData);
      renderNotifs();
      renderTeam();

      setText("searchMsg","Loaded "+empId);
      uiToast("Employee loaded.");
    }catch(e){
      targetEmpId = null;
      targetData = null;
      setText("searchMsg", e?.message || String(e));
      uiToast(e?.message || String(e));
    }
  };

  // SAVE APPOINTMENT
  q$("btnSaveAppointment").onclick=async()=>{
    try{
      if(!targetEmpId){
        uiToast("Load ID first");
        return;
      }

      const appt={
        date:(q$("aDate")?.value || "").trim(),
        time:(q$("aTime")?.value || "").trim(),
        address:(q$("aAddr")?.value || "").trim(),
        notes:(q$("aNotes")?.value || "").trim()
      };

      await updateEmployeeRecord({ appointment: appt });

      // local cache
      targetData = targetData || {};
      targetData.appointment = appt;

      uiToast("Appointment saved");
      setText("apptMsg","Saved.");
    }catch(e){
      uiToast(e?.message || String(e));
      setText("apptMsg", e?.message || String(e));
    }
  };

  // ADD ID (manual, still works)
  q$("btnAddAllowed").onclick=async()=>{
    try{
      const id=(q$("newEmpId")?.value || "").trim();
      const name=(q$("newEmpName")?.value || "").trim();

      await addAllowedId(id,name);

      if(q$("newEmpId")) q$("newEmpId").value = "";
      if(q$("newEmpName")) q$("newEmpName").value = "";

      uiToast("Allowed ID added.");
      await loadAllowedIds();
    }catch(e){
      uiToast(e?.message || String(e));
    }
  };
}
