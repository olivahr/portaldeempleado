import { db, isFirebaseConfigured } from "./firebase.js";
import { uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let targetUid = null;
let targetData = null;

const q$ = id => document.getElementById(id);

//////////////////////////////
// HELPERS
//////////////////////////////

function normalizeId(v){
  return (v||"").trim().toUpperCase().replace(/\s+/g,"");
}

//////////////////////////////
// ADMIN CHECK
//////////////////////////////

async function ensureAdmin(user){
  const snap = await getDoc(doc(db,"admins",user.uid));
  return snap.exists();
}

//////////////////////////////
// FIND USER BY EMPLOYEE ID
//////////////////////////////

async function findUserByEmployeeId(empId){
  const q = query(
    collection(db,"users"),
    where("employeeId","==",empId),
    limit(1)
  );

  const snap = await getDocs(q);
  if(snap.empty) return null;

  return {
    uid: snap.docs[0].id,
    data: snap.docs[0].data()
  };
}

//////////////////////////////
// UPDATE USER
//////////////////////////////

async function updateTarget(patch){
  if(!targetUid) return uiToast("Load employee first");

  await updateDoc(
    doc(db,"users",targetUid),
    {
      ...patch,
      updatedAt:serverTimestamp()
    }
  );
}

//////////////////////////////
// FILL APPOINTMENT
//////////////////////////////

function fillAppointment(d){
  q$("aDate").value  = d?.appointment?.date || "";
  q$("aTime").value  = d?.appointment?.time || "";
  q$("aAddr").value  = d?.appointment?.address || "";
  q$("aNotes").value = d?.appointment?.notes || "";
}

//////////////////////////////
// LOAD ALLOWED IDS LIST
//////////////////////////////

async function loadAllowedIds(){

  const el = q$("allowedList");
  el.innerHTML="";

  const snap = await getDocs(collection(db,"allowedEmployees"));

  if(snap.empty){
    el.innerHTML="<div class='small muted'>No IDs yet</div>";
    return;
  }

  snap.forEach(d=>{

    const id = d.id;

    const row=document.createElement("div");
    row.className="list-item";
    row.style.display="flex";
    row.style.justifyContent="space-between";
    row.style.marginBottom="8px";

    row.innerHTML=`
      <b>${escapeHtml(id)}</b>
      <button class="btn sm ghost">Delete</button>
    `;

    row.querySelector("button").onclick=async()=>{
      await deleteDoc(doc(db,"allowedEmployees",id));
      uiToast("Deleted");
      loadAllowedIds();
    };

    el.appendChild(row);
  });
}

//////////////////////////////
// INIT ADMIN
//////////////////////////////

export async function initAdminApp(user){

  const ok = await ensureAdmin(user);
  if(!ok){
    alert("Not authorized");
    location.href="./employee.html";
    return;
  }

  // Load IDs list at start
  loadAllowedIds();

  ////////////////////////
  // SEARCH BY ID
  ////////////////////////

  q$("btnSearch").onclick = async()=>{

    const empId = normalizeId(q$("searchEmpId").value);

    if(!empId) return uiToast("Enter ID");

    const found = await findUserByEmployeeId(empId);

    if(!found){
      uiToast("Employee not found");
      return;
    }

    targetUid = found.uid;
    targetData = found.data;

    fillAppointment(targetData);

    uiToast("Employee loaded");
  };

  ////////////////////////
  // SAVE APPOINTMENT
  ////////////////////////

  q$("btnSaveAppointment").onclick = async()=>{

    const patch = {
      appointment:{
        date:q$("aDate").value,
        time:q$("aTime").value,
        address:q$("aAddr").value,
        notes:q$("aNotes").value
      }
    };

    await updateTarget(patch);

    uiToast("Appointment saved");
  };

  ////////////////////////
  // ADD ALLOWED ID
  ////////////////////////

  q$("btnAddAllowed").onclick = async()=>{

    const id = normalizeId(q$("newEmpId").value);

    if(!id) return uiToast("Enter ID");

    await setDoc(
      doc(db,"allowedEmployees",id),
      {
        active:true,
        createdAt:serverTimestamp()
      },
      {merge:true}
    );

    q$("newEmpId").value="";

    uiToast("ID added");

    loadAllowedIds();
  };
}
