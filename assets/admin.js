import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let targetUid = null;
let targetData = null;

function q$(id){ return document.getElementById(id); }

// ---------------- ADMIN GUARD ----------------
async function ensureAdmin(user){
  if(!isFirebaseConfigured()) return true;
  if(!user?.uid) return false;

  const snap = await getDoc(doc(db,"admins",user.uid));
  return snap.exists();
}

// ---------------- SEARCH BY SP ID ----------------
async function findUserByEmployeeId(empId){
  const q = query(
    collection(db,"users"),
    where("employeeId","==",empId.toUpperCase()),
    limit(1)
  );

  const snap = await getDocs(q);
  if(snap.empty) return null;

  const d = snap.docs[0];
  return { uid:d.id, data:d.data() };
}

// ---------------- UPDATE TARGET ----------------
async function updateTarget(patch){
  if(!targetUid) throw new Error("No employee loaded.");

  const ref = doc(db,"users",targetUid);

  await updateDoc(ref,{
    ...patch,
    updatedAt: serverTimestamp()
  });
}

// ---------------- APPOINTMENT ----------------
function fillAppointment(d){
  q$("aDate").value  = d?.appointment?.date || "";
  q$("aTime").value  = d?.appointment?.time || "";
  q$("aAddr").value  = d?.appointment?.address || "";
  q$("aNotes").value = d?.appointment?.notes || "";
}

// ---------------- NOTIFICATIONS ----------------
function normalizeNotifs(d){
  return Array.isArray(d?.notifications)? d.notifications : [];
}

function renderNotifs(){
  const el = q$("notifList");
  if(!el) return;
  el.innerHTML="";

  const list = normalizeNotifs(targetData);

  list.forEach(n=>{
    const row=document.createElement("div");
    row.innerHTML=`
      <div>
        <b>${escapeHtml(n.title)}</b>
        <div>${escapeHtml(n.body)}</div>
      </div>
      <button>Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      const next=list.filter(x=>x.id!==n.id);
      await updateTarget({notifications:next});
      targetData.notifications=next;
      renderNotifs();
    };

    el.appendChild(row);
  });
}

// ---------------- TEAM ----------------
function renderTeam(){
  const el=q$("teamList");
  if(!el) return;
  el.innerHTML="";

  const c=targetData?.contacts||{};

  Object.keys(c).forEach(k=>{
    const x=c[k];
    const row=document.createElement("div");

    row.innerHTML=`
      <div>${escapeHtml(x.name)}</div>
      <button>Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      const next={...c};
      delete next[k];
      await updateTarget({contacts:next});
      targetData.contacts=next;
      renderTeam();
    };

    el.appendChild(row);
  });
}

// ---------------- ALLOWED IDS ----------------
async function addAllowedId(id){
  const clean=id.trim().toUpperCase();

  await setDoc(doc(db,"allowedEmployees",clean),{
    active:true,
    createdAt:serverTimestamp()
  });
}

async function loadAllowedIds(){
  const el=q$("allowedList");
  if(!el) return;
  el.innerHTML="";

  const snap=await getDocs(collection(db,"allowedEmployees"));

  snap.forEach(d=>{
    const row=document.createElement("div");
    row.innerHTML=`
      ${d.id}
      <button>X</button>
    `;

    row.querySelector("button").onclick=async()=>{
      await deleteDoc(doc(db,"allowedEmployees",d.id));
      loadAllowedIds();
    };

    el.appendChild(row);
  });
}

// ---------------- INIT ----------------
export async function initAdminApp(user){

  if(!(await ensureAdmin(user))){
    alert("Not admin");
    location.href="employee.html";
    return;
  }

  await loadAllowedIds();

  // SEARCH BY SP ID
  q$("btnSearch").onclick=async()=>{
    const id=q$("searchId").value.trim().toUpperCase();

    const found=await findUserByEmployeeId(id);

    if(!found){
      uiToast("Not found");
      return;
    }

    targetUid=found.uid;
    targetData=found.data;

    fillAppointment(targetData);
    renderNotifs();
    renderTeam();

    uiToast("Loaded");
  };

  // SAVE APPOINTMENT (PERSISTENT)
  q$("btnSaveAppointment").onclick=async()=>{
    const appointment={
      date:q$("aDate").value,
      time:q$("aTime").value,
      address:q$("aAddr").value,
      notes:q$("aNotes").value
    };

    await updateTarget({appointment});

    targetData.appointment=appointment;

    uiToast("Saved permanent");
  };

  // ADD NOTIF
  q$("btnAddNotif").onclick=async()=>{
    const next=normalizeNotifs(targetData);

    next.unshift({
      id:Date.now(),
      title:q$("nTitle").value,
      body:q$("nBody").value,
      route:"progress"
    });

    await updateTarget({notifications:next});
    targetData.notifications=next;
    renderNotifs();
  };

  // ADD TEAM
  q$("btnAddTeam").onclick=async()=>{
    const c=targetData.contacts||{};
    const k="c"+Date.now();

    c[k]={
      name:q$("tName").value,
      role:q$("tRole").value
    };

    await updateTarget({contacts:c});
    targetData.contacts=c;
    renderTeam();
  };

  // ADD ALLOWED ID
  q$("btnAddAllowed").onclick=async()=>{
    await addAllowedId(q$("newEmpId").value);
    loadAllowedIds();
  };
}
