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

// ---------- Default user doc ----------
function defaultUserDocForId(empId){
  return {
    email:"",
    fullName:"",
    role:"employee",
    status:"active",
    stage:"shift_selection",

    appointment:{ date:"",time:"",address:"",notes:"" },

    steps:[
      {id:"application",label:"Application",done:true},
      {id:"shift_selection",label:"Shift Selection",done:false},
      {id:"docs",label:"Complete Onboarding Documents",done:false},
      {id:"first_day",label:"First Day Preparation",done:false}
    ],

    shift:{choice:"",confirmed:false},

    employeeId:empId,
    notifications:[],
    contacts:{},

    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };
}

// ---------- Load by employeeId ----------
async function loadUserByEmployeeId(empId){
  const usersRef = collection(db,"users");
  const q = query(usersRef,where("employeeId","==",empId),limit(1));
  const snap = await getDocs(q);

  if(snap.empty) return null;
  const d = snap.docs[0];
  return {uid:d.id,data:d.data()};
}

// ---------- Update target ----------
async function updateTarget(patch){
  if(!targetUid) throw new Error("Load an Employee ID first.");
  if(!isFirebaseConfigured()) return;

  const ref = doc(db,"users",targetUid);
  await updateDoc(ref,{...patch,updatedAt:serverTimestamp()});
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
  q$("aDate").value=d?.appointment?.date||"";
  q$("aTime").value=d?.appointment?.time||"";
  q$("aAddr").value=d?.appointment?.address||"";
  q$("aNotes").value=d?.appointment?.notes||"";
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
        <div class="li-title">${escapeHtml(n.title)}</div>
        <div class="li-sub muted">${escapeHtml(n.body)}</div>
      </div>
      <button class="btn sm ghost">Remove</button>
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

// ---------- Team ----------
function normalizeContacts(d){
  return (d&&typeof d.contacts==="object")?d.contacts:{};
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
      <div>${escapeHtml(c.name||"")}</div>
      <button class="btn sm ghost">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      const next={...contacts};
      delete next[k];
      await updateTarget({contacts:next});
      targetData.contacts=next;
      renderTeam();
    };

    el.appendChild(row);
  });
}

// ---------- Allowed IDs ----------
async function addAllowedId(empId,name){
  const clean=normalizeEmpId(empId);
  if(!clean) throw new Error("Invalid ID format (SP###)");

  const allowedRef=doc(db,"allowedEmployees",clean);
  await setDoc(allowedRef,{
    active:true,
    name:(name||"").trim(),
    createdAt:serverTimestamp()
  },{merge:true});

  const existing=await loadUserByEmployeeId(clean);

  if(!existing){
    const usersRef=collection(db,"users");
    const newRef=doc(usersRef);
    await setDoc(newRef,defaultUserDocForId(clean));
  }
}

async function removeAllowedId(empId){
  const clean=normalizeEmpId(empId);
  const ref=doc(db,"allowedEmployees",clean);
  await deleteDoc(ref);
}

async function loadAllowedIds(){
  const el=q$("allowedList");
  if(!el) return;
  el.innerHTML="";

  const snap=await getDocs(collection(db,"allowedEmployees"));

  if(snap.empty){
    el.innerHTML=`<div class="small muted">No IDs yet.</div>`;
    return;
  }

  snap.forEach(d=>{
    const id=d.id;
    const row=document.createElement("div");
    row.className="list-item";
    row.innerHTML=`
      <div>${escapeHtml(id)}</div>
      <button class="btn sm ghost">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      await removeAllowedId(id);
      await loadAllowedIds();
    };

    el.appendChild(row);
  });
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
    const raw=q$("searchEmail").value;
    const empId=normalizeEmpId(raw);

    if(!empId){
      setText("searchMsg","Invalid ID format (SP###)");
      return;
    }

    const allowedSnap=await getDoc(doc(db,"allowedEmployees",empId));
    if(!allowedSnap.exists()){
      setText("searchMsg","ID not registered");
      return;
    }

    let found=await loadUserByEmployeeId(empId);

    if(!found){
      const usersRef=collection(db,"users");
      const newRef=doc(usersRef);
      await setDoc(newRef,defaultUserDocForId(empId));
      found=await loadUserByEmployeeId(empId);
    }

    targetUid=found.uid;
    targetData=found.data;

    fillAppointment(targetData);
    renderNotifs();
    renderTeam();

    setText("searchMsg","Loaded "+empId);
  };

  // SAVE APPOINTMENT
  q$("btnSaveAppointment").onclick=async()=>{
    if(!targetUid){
      uiToast("Load ID first");
      return;
    }

    const appt={
      date:q$("aDate").value,
      time:q$("aTime").value,
      address:q$("aAddr").value,
      notes:q$("aNotes").value
    };

    await updateTarget({appointment:appt});
    targetData.appointment=appt;

    uiToast("Appointment saved");
  };

  // ADD ID
  q$("btnAddAllowed").onclick=async()=>{
    const id=q$("newEmpId").value;
    const name=q$("newEmpName").value;
    await addAllowedId(id,name);
    await loadAllowedIds();
  };
}
