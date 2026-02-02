import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let targetUid=null;
let targetData=null;

const q$=id=>document.getElementById(id);

//
// 🔹 NORMALIZE ID
//
function normalizeEmpId(v){
  if(!v) return "";
  v=v.toUpperCase().trim();
  v=v.replace(/\s+/g,"");
  v=v.replace(/SP[-_]?/,"SP");
  const m=v.match(/^SP(\d+)$/);
  return m?`SP${m[1]}`:"";
}

//
// 🔹 ADMIN GUARD
//
async function ensureAdmin(user){
  if(!isFirebaseConfigured()) return true;
  if(!user?.uid) return false;

  const snap=await getDoc(doc(db,"admins",user.uid));
  return snap.exists();
}

//
// 🔹 FIND USER BY EMPLOYEE ID
//
async function findUser(empId){
  empId=normalizeEmpId(empId);
  if(!empId) return null;

  const q=query(
    collection(db,"users"),
    where("employeeId","==",empId),
    limit(1)
  );

  const snap=await getDocs(q);
  if(snap.empty) return null;

  const d=snap.docs[0];
  return { uid:d.id, data:d.data() };
}

//
// 🔹 UPDATE TARGET
//
async function updateTarget(patch){
  if(!targetUid) throw new Error("Search employee first");

  await updateDoc(doc(db,"users",targetUid),{
    ...patch,
    updatedAt:serverTimestamp()
  });
}

//
// 🔹 APPOINTMENT
//
function fillAppointment(d){
  q$("aDate").value=d?.appointment?.date||"";
  q$("aTime").value=d?.appointment?.time||"";
  q$("aAddr").value=d?.appointment?.address||"";
  q$("aNotes").value=d?.appointment?.notes||"";
}

//
// 🔹 NOTIFICATIONS
//
function renderNotifs(){
  const el=q$("notifList");
  if(!el) return;
  el.innerHTML="";

  const list=Array.isArray(targetData?.notifications)?targetData.notifications:[];

  if(!list.length){
    el.innerHTML="<div class='muted'>No notifications</div>";
    return;
  }

  list.forEach((n,i)=>{
    const row=document.createElement("div");
    row.className="list-item";

    row.innerHTML=`
      <div>
        <b>${escapeHtml(n.title||"")}</b>
        <div>${escapeHtml(n.body||"")}</div>
      </div>
      <button class="btn sm ghost">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      const next=list.filter((_,x)=>x!==i);
      await updateTarget({notifications:next});
      targetData.notifications=next;
      renderNotifs();
    };

    el.appendChild(row);
  });
}

//
// 🔹 TEAM
//
function renderTeam(){
  const el=q$("teamList");
  if(!el) return;
  el.innerHTML="";

  const contacts=targetData?.contacts||{};

  Object.keys(contacts).forEach(k=>{
    const c=contacts[k];

    const row=document.createElement("div");
    row.className="list-item";

    row.innerHTML=`
      <div>
        <b>${escapeHtml(c.name)}</b>
        <div>${escapeHtml(c.email||"")}</div>
      </div>
      <button class="btn sm ghost">Remove</button>
    `;

    row.querySelector("button").onclick=async()=>{
      delete contacts[k];
      await updateTarget({contacts});
      targetData.contacts=contacts;
      renderTeam();
    };

    el.appendChild(row);
  });
}

//
// 🔹 ALLOWED IDS
//
async function addAllowed(empId,name){
  empId=normalizeEmpId(empId);
  if(!empId) return uiToast("Invalid ID");

  await setDoc(doc(db,"allowedEmployees",empId),{
    active:true,
    name:name||"",
    createdAt:serverTimestamp()
  });

  uiToast("Allowed ID saved");
}

//
// 🔹 INIT
//
export async function initAdminApp(user){

  if(!await ensureAdmin(user)){
    alert("Not admin");
    location.href="./employee.html";
    return;
  }

  //
  // SEARCH
  //
  q$("btnSearch").onclick=async()=>{
    const empId=q$("searchEmpId").value;
    const found=await findUser(empId);

    if(!found) return uiToast("Not found");

    targetUid=found.uid;
    targetData=found.data;

    fillAppointment(targetData);
    renderNotifs();
    renderTeam();

    uiToast("Employee loaded");
  };

  //
  // SAVE APPOINTMENT
  //
  q$("btnSaveAppointment").onclick=async()=>{
    if(!targetUid) return uiToast("Search employee first");

    const appt={
      date:q$("aDate").value||"",
      time:q$("aTime").value||"",
      address:q$("aAddr").value||"",
      notes:q$("aNotes").value||""
    };

    await updateTarget({appointment:appt});
    targetData.appointment=appt;

    uiToast("Appointment saved ✅");
  };

  //
  // ADD NOTIF
  //
  q$("btnAddNotif").onclick=async()=>{
    const t=q$("nTitle").value;
    const b=q$("nBody").value;
    if(!t||!b) return;

    const list=targetData.notifications||[];
    list.unshift({title:t,body:b});

    await updateTarget({notifications:list});
    targetData.notifications=list;

    renderNotifs();
  };

  //
  // ADD TEAM
  //
  q$("btnAddTeam").onclick=async()=>{
    const name=q$("tName").value;
    if(!name) return;

    const contacts=targetData.contacts||{};
    const key="c"+Date.now();

    contacts[key]={name,email:q$("tEmail").value||""};

    await updateTarget({contacts});
    targetData.contacts=contacts;

    renderTeam();
  };

  //
  // ADD ALLOWED ID
  //
  q$("btnAddAllowed").onclick=async()=>{
    await addAllowed(
      q$("newEmpId").value,
      q$("newEmpName").value
    );
  };
}
