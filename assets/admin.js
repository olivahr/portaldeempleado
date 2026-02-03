import { db, isFirebaseConfigured } from "./firebase.js";
import { uiSetText, uiToast, escapeHtml } from "./ui.js";

import {
  collection, query, where, limit, getDocs,
  doc, getDoc, setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Storage for pay stub uploads
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

function q$(id){ return document.getElementById(id); }
function setText(id,v){ const el=q$(id); if(el) uiSetText(el, v ?? ""); }

function uidKey(p="k"){
  return `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function empIdToNumber(empId){
  if(!empId) return null;
  const m = empId.toUpperCase().match(/^SP(\d+)$/);
  return m ? parseInt(m[1],10) : null;
}

// ✅ rango para NO entrar 1x1
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED_ID = true;

// ✅ guardamos por EmployeeID aquí (doc fijo)
const RECORD_DOC = (empId) => doc(db, "employeeRecords", empId);

// ✅ global company content
const PUBLIC_DOC = () => doc(db, "portal", "public");

// ✅ storage folder for paystubs
const PAYSTUB_PATH = (empId, stubId, filename) =>
  `paystubs/${empId}/${stubId}_${filename || "paystub.pdf"}`;

let targetEmpId = null;
let targetData = null;

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
  let v = input.toString().toUpperCase().trim();
  v = v.replace(/[\s-_]/g,"");
  if(!v.startsWith("SP")) return "";
  const nums = v.slice(2);
  if(!/^\d+$/.test(nums)) return "";
  return "SP" + nums;
}

// ---------- Default employee record (keyed by empId) ----------
function defaultEmployeeRecord(empId){
  return {
    employeeId: empId,

    appointment: { date:"", time:"", address:"", notes:"" },
    notifications: [],
    contacts: {},

    // ✅ modules aligned with employee.js
    scheduleEvents: [],
    schedule: {
      monday:   { start:"", end:"", type:"work" },
      tuesday:  { start:"", end:"", type:"work" },
      wednesday:{ start:"", end:"", type:"work" },
      thursday: { start:"", end:"", type:"work" },
      friday:   { start:"", end:"", type:"work" },
      saturday: { start:"", end:"", type:"off" },
      sunday:   { start:"", end:"", type:"off" }
    },
    deposit: { bankName:"", last4Account:"" },
    hours: [],
    payroll: [],
    timeOffRequests: [],

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

// ---------- (Compatibility) Load a user doc by employeeId (if exists) ----------
async function loadUserByEmployeeId(empId){
  const usersRef = collection(db,"users");
  const q = query(usersRef, where("employeeId","==",empId), limit(1));
  const snap = await getDocs(q);
  if(snap.empty) return null;
  const d = snap.docs[0];
  return { uid:d.id, data:d.data() };
}

// ---------- Allowed IDs (range-friendly) ----------
async function ensureAllowed(empId, name=""){
  const n = empIdToNumber(empId);
  const inRange = (n !== null && n >= EMP_ID_RANGE.min && n <= EMP_ID_RANGE.max);

  const allowedRef = doc(db,"allowedEmployees",empId);
  const snap = await getDoc(allowedRef);

  if(snap.exists()){
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

  // Sort by numeric part if possible
  const rows = snap.docs.map(d => ({ id:d.id, data:d.data()||{} }))
    .sort((a,b)=>{
      const an = empIdToNumber(a.id); const bn = empIdToNumber(b.id);
      if(an===null && bn===null) return a.id.localeCompare(b.id);
      if(an===null) return 1;
      if(bn===null) return -1;
      return an - bn;
    });

  rows.forEach(({id, data:x})=>{
    const row=document.createElement("div");
    row.className="list-item";

    const inactive = x.active === false;
    row.innerHTML=`
      <div>
        <div class="li-title">${escapeHtml(id)}</div>
        <div class="li-sub muted">
          ${escapeHtml(x.name||"")}
          ${inactive ? " • inactive" : ""}
        </div>
      </div>
      <button class="btn sm ghost" type="button">${inactive ? "Inactive" : "Remove"}</button>
    `;

    const btn = row.querySelector("button");
    btn.disabled = inactive;

    btn.onclick=async()=>{
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
  await setDoc(ref, defaultEmployeeRecord(empId), { merge:true });
}

async function updateEmployeeRecord(patch){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");
  if(!isFirebaseConfigured()) return;

  const ref = RECORD_DOC(targetEmpId);
  await setDoc(ref, { ...patch, updatedAt: serverTimestamp() }, { merge:true });

  // ✅ Compatibility: also sync appointment into users/{uid} if it exists
  if(patch?.appointment){
    const found = await loadUserByEmployeeId(targetEmpId);
    if(found?.uid){
      const userRef = doc(db,"users",found.uid);
      await setDoc(userRef, { appointment: patch.appointment, updatedAt: serverTimestamp() }, { merge:true });
    }
  }
}

// ---------- Appointment ----------
function fillAppointment(d){
  if(q$("aDate"))  q$("aDate").value  = d?.appointment?.date || "";
  if(q$("aTime"))  q$("aTime").value  = d?.appointment?.time || "";
  if(q$("aAddr"))  q$("aAddr").value  = d?.appointment?.address || "";
  if(q$("aNotes")) q$("aNotes").value = d?.appointment?.notes || "";
}

// ---------- Schedule ----------
function fillSchedule(d){
  const sch = d?.schedule || {};
  const g = (day) => sch?.[day] || {};
  const set = (id, v) => { const el=q$(id); if(el) el.value = v || ""; };

  set("sch_mon_start", g("monday").start);
  set("sch_mon_end",   g("monday").end);
  if(q$("sch_mon_type")) q$("sch_mon_type").value = g("monday").type || "work";

  set("sch_tue_start", g("tuesday").start);
  set("sch_tue_end",   g("tuesday").end);
  if(q$("sch_tue_type")) q$("sch_tue_type").value = g("tuesday").type || "work";

  set("sch_wed_start", g("wednesday").start);
  set("sch_wed_end",   g("wednesday").end);
  if(q$("sch_wed_type")) q$("sch_wed_type").value = g("wednesday").type || "work";

  set("sch_thu_start", g("thursday").start);
  set("sch_thu_end",   g("thursday").end);
  if(q$("sch_thu_type")) q$("sch_thu_type").value = g("thursday").type || "work";

  set("sch_fri_start", g("friday").start);
  set("sch_fri_end",   g("friday").end);
  if(q$("sch_fri_type")) q$("sch_fri_type").value = g("friday").type || "work";

  set("sch_sat_start", g("saturday").start);
  set("sch_sat_end",   g("saturday").end);
  if(q$("sch_sat_type")) q$("sch_sat_type").value = g("saturday").type || "off";

  set("sch_sun_start", g("sunday").start);
  set("sch_sun_end",   g("sunday").end);
  if(q$("sch_sun_type")) q$("sch_sun_type").value = g("sunday").type || "off";
}

async function saveSchedule(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const v = (id) => (q$(id)?.value || "").trim();

  const schedule = {
    monday:    { start:v("sch_mon_start"), end:v("sch_mon_end"), type:v("sch_mon_type") || "work" },
    tuesday:   { start:v("sch_tue_start"), end:v("sch_tue_end"), type:v("sch_tue_type") || "work" },
    wednesday: { start:v("sch_wed_start"), end:v("sch_wed_end"), type:v("sch_wed_type") || "work" },
    thursday:  { start:v("sch_thu_start"), end:v("sch_thu_end"), type:v("sch_thu_type") || "work" },
    friday:    { start:v("sch_fri_start"), end:v("sch_fri_end"), type:v("sch_fri_type") || "work" },
    saturday:  { start:v("sch_sat_start"), end:v("sch_sat_end"), type:v("sch_sat_type") || "off" },
    sunday:    { start:v("sch_sun_start"), end:v("sch_sun_end"), type:v("sch_sun_type") || "off" }
  };

  await updateEmployeeRecord({ schedule });
  targetData.schedule = schedule;
  uiToast("Schedule saved.");
  setText("scheduleMsg","Saved.");
}

// ---------- Deposit ----------
function fillDeposit(d){
  const dep = d?.deposit || {};
  if(q$("dep_bankName")) q$("dep_bankName").value = dep.bankName || "";
  if(q$("dep_last4")) q$("dep_last4").value = dep.last4Account || "";
}

async function saveDeposit(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const bankName = (q$("dep_bankName")?.value || "").trim();
  const last4 = (q$("dep_last4")?.value || "").trim();

  if(last4 && !/^\d{4}$/.test(last4)) throw new Error("Last 4 must be 4 digits (e.g. 1234).");

  const deposit = { bankName, last4Account: last4 };
  await updateEmployeeRecord({ deposit });
  targetData.deposit = deposit;

  uiToast("Deposit info saved.");
  setText("depositMsg","Saved.");
}

// ---------- Hours ----------
function normalizeHoursArr(d){
  const arr = Array.isArray(d?.hours) ? d.hours : [];
  return [...arr].sort((a,b)=> String(b.weekStart||"").localeCompare(String(a.weekStart||"")));
}

function renderHours(){
  const el = q$("hoursList");
  if(!el) return;
  el.innerHTML = "";

  const list = normalizeHoursArr(targetData);
  if(!list.length){
    el.innerHTML = `<div class="small muted">No hours posted yet.</div>`;
    return;
  }

  list.forEach(h=>{
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <div class="li-title">Week of ${escapeHtml(h.weekStart || "—")}</div>
        <div class="li-sub muted">Total: ${escapeHtml(String(h.totalHours ?? "—"))} • OT: ${escapeHtml(String(h.overtime ?? "—"))}</div>
      </div>
      <button class="btn sm ghost" type="button">Remove</button>
    `;

    row.querySelector("button").onclick = async () => {
      try{
        const next = normalizeHoursArr(targetData).filter(x => x.weekStart !== h.weekStart);
        await updateEmployeeRecord({ hours: next });
        targetData.hours = next;
        uiToast("Hours removed.");
        renderHours();
      }catch(e){
        uiToast(e?.message || String(e));
      }
    };

    el.appendChild(row);
  });
}

async function saveHours(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const weekStart = (q$("hrs_weekStart")?.value || "").trim();
  const totalStr = (q$("hrs_total")?.value || "").trim();
  const otStr = (q$("hrs_ot")?.value || "").trim();

  if(!weekStart) throw new Error("Week Start is required.");
  const totalHours = totalStr === "" ? null : Number(totalStr);
  const overtime = otStr === "" ? null : Number(otStr);

  if(totalHours !== null && (Number.isNaN(totalHours) || totalHours < 0)) throw new Error("Total Hours invalid.");
  if(overtime !== null && (Number.isNaN(overtime) || overtime < 0)) throw new Error("Overtime invalid.");

  const existing = normalizeHoursArr(targetData);
  const idx = existing.findIndex(x => x.weekStart === weekStart);

  const item = {
    weekStart,
    totalHours: totalHours ?? 0,
    overtime: overtime ?? 0,
    updatedAt: new Date().toISOString()
  };

  let next;
  if(idx >= 0){
    next = [...existing];
    next[idx] = { ...next[idx], ...item };
  } else {
    next = [ item, ...existing ];
  }

  await updateEmployeeRecord({ hours: next });
  targetData.hours = next;

  uiToast("Hours saved.");
  setText("hoursMsg","Saved.");
  renderHours();
}

// ---------- Payroll ----------
function normalizePayroll(d){
  const arr = Array.isArray(d?.payroll) ? d.payroll : [];
  return [...arr].sort((a,b)=> String(b.uploadedAt||"").localeCompare(String(a.uploadedAt||"")));
}

function renderPayroll(){
  const el = q$("payrollList");
  if(!el) return;
  el.innerHTML = "";

  const list = normalizePayroll(targetData);
  if(!list.length){
    el.innerHTML = `<div class="small muted">No pay stubs uploaded yet.</div>`;
    return;
  }

  list.forEach(p=>{
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <div class="li-title">Pay Date: ${escapeHtml(p.payDate || "—")}</div>
        <div class="li-sub muted">Period: ${escapeHtml((p.periodStart||"—") + " → " + (p.periodEnd||"—"))}</div>
        <div class="small muted">${escapeHtml(p.fileName || "paystub.pdf")} ${p.fileUrl ? "• uploaded" : "• metadata only"}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${p.fileUrl ? `<a class="btn sm ghost" href="${escapeHtml(p.fileUrl)}" target="_blank" rel="noreferrer">Open</a>` : ``}
        <button class="btn sm ghost" type="button">Remove</button>
      </div>
    `;

    const btnRemove = row.querySelector("button");
    btnRemove.onclick = async () => {
      try{
        const next = normalizePayroll(targetData).filter(x => x.id !== p.id);
        await updateEmployeeRecord({ payroll: next });
        targetData.payroll = next;
        uiToast("Pay stub removed.");
        renderPayroll();
      }catch(e){
        uiToast(e?.message || String(e));
      }
    };

    el.appendChild(row);
  });
}

async function uploadPayStub(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const payDate = (q$("pay_payDate")?.value || "").trim();
  const periodStart = (q$("pay_periodStart")?.value || "").trim();
  const periodEnd = (q$("pay_periodEnd")?.value || "").trim();
  const fileInput = q$("pay_pdf");
  const file = fileInput?.files?.[0] || null;

  if(!payDate) throw new Error("Pay Date is required.");
  if(!periodStart || !periodEnd) throw new Error("Pay period start/end is required.");
  if(!file) throw new Error("Select a PDF file.");
  if(file.type !== "application/pdf") throw new Error("File must be a PDF.");

  if(!isFirebaseConfigured()){
    uiToast("Preview mode: upload skipped.");
    setText("payrollMsg","Preview mode: not uploaded.");
    return;
  }

  const storage = getStorage();
  const stubId = uidKey("stub");
  const path = PAYSTUB_PATH(targetEmpId, stubId, file.name);
  const ref = sRef(storage, path);

  setText("payrollMsg","Uploading…");

  await uploadBytes(ref, file, { contentType: "application/pdf" });
  const url = await getDownloadURL(ref);

  const item = {
    id: stubId,
    payDate,
    periodStart,
    periodEnd,
    fileUrl: url,
    fileName: file.name || "paystub.pdf",
    uploadedAt: new Date().toISOString(),
    status: "stub"
  };

  const next = [ item, ...normalizePayroll(targetData) ];
  await updateEmployeeRecord({ payroll: next });
  targetData.payroll = next;

  if(q$("pay_pdf")) q$("pay_pdf").value = "";
  uiToast("Pay stub uploaded.");
  setText("payrollMsg","Uploaded.");
  renderPayroll();
}

// ---------- Time Off ----------
function normalizeTimeOff(d){
  const arr = Array.isArray(d?.timeOffRequests) ? d.timeOffRequests : [];
  return [...arr].sort((a,b)=> String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}

function renderTimeOff(){
  const el = q$("timeoffList");
  if(!el) return;
  el.innerHTML = "";

  const list = normalizeTimeOff(targetData);
  if(!list.length){
    el.innerHTML = `<div class="small muted">No time off requests.</div>`;
    return;
  }

  list.forEach(r=>{
    const status = (r.status || "pending").toLowerCase();
    const row = document.createElement("div");
    row.className = "card";
    row.style.borderRadius = "18px";
    row.style.boxShadow = "0 14px 30px rgba(15,23,42,.06)";
    row.style.marginTop = "12px";
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:1100;">${escapeHtml(r.type || "Time Off")}</div>
        <div class="small muted" style="font-weight:1100;">${escapeHtml(status)}</div>
      </div>
      <div class="muted" style="margin-top:8px;">
        ${escapeHtml((r.startDate||"—") + " → " + (r.endDate||"—"))}
      </div>
      ${r.reason ? `<div class="small muted" style="margin-top:8px;line-height:1.35;">${escapeHtml(r.reason)}</div>` : ""}
      <div style="display:flex;gap:10px;margin-top:12px;">
        <button class="btn sm primary" type="button" ${status==="approved" ? "disabled":""}>Approve</button>
        <button class="btn sm ghost" type="button" ${status==="denied" ? "disabled":""}>Deny</button>
        <button class="btn sm ghost" type="button">Remove</button>
      </div>
    `;

    const [btnApprove, btnDeny, btnRemove] = row.querySelectorAll("button");

    btnApprove.onclick = async () => {
      try{
        const next = normalizeTimeOff(targetData).map(x => x.id === r.id
          ? ({ ...x, status:"approved", updatedAt:new Date().toISOString() })
          : x
        );
        await updateEmployeeRecord({ timeOffRequests: next });
        targetData.timeOffRequests = next;
        uiToast("Approved.");
        renderTimeOff();
      }catch(e){ uiToast(e?.message || String(e)); }
    };

    btnDeny.onclick = async () => {
      try{
        const next = normalizeTimeOff(targetData).map(x => x.id === r.id
          ? ({ ...x, status:"denied", updatedAt:new Date().toISOString() })
          : x
        );
        await updateEmployeeRecord({ timeOffRequests: next });
        targetData.timeOffRequests = next;
        uiToast("Denied.");
        renderTimeOff();
      }catch(e){ uiToast(e?.message || String(e)); }
    };

    btnRemove.onclick = async () => {
      try{
        const next = normalizeTimeOff(targetData).filter(x => x.id !== r.id);
        await updateEmployeeRecord({ timeOffRequests: next });
        targetData.timeOffRequests = next;
        uiToast("Removed.");
        renderTimeOff();
      }catch(e){ uiToast(e?.message || String(e)); }
    };

    el.appendChild(row);
  });
}

// ---------- Notifications ----------
function normalizeNotifs(d){
  const arr = Array.isArray(d?.notifications) ? d.notifications : [];
  return arr.map(n=>({
    id: n?.id || uidKey("n"),
    title: n?.title || "",
    body: n?.body || "",
    route: n?.route || "progress",
    action: n?.action || "Open",
    createdAt: n?.createdAt || null
  }));
}

function renderNotifs(){
  const el=q$("notifList");
  if(!el) return;
  el.innerHTML="";

  const list = normalizeNotifs(targetData);

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

async function addNotification(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const title = (q$("nTitle")?.value || "").trim();
  const body  = (q$("nBody")?.value || "").trim();
  const route = (q$("nRoute")?.value || "progress").trim();

  if(!title || !body) throw new Error("Title and message are required.");

  const item = {
    id: uidKey("n"),
    title,
    body,
    route,
    action: "Open",
    createdAt: new Date().toISOString()
  };

  const next = [...normalizeNotifs(targetData), item];
  await updateEmployeeRecord({ notifications: next });
  targetData.notifications = next;

  if(q$("nTitle")) q$("nTitle").value = "";
  if(q$("nBody")) q$("nBody").value = "";
  if(q$("nRoute")) q$("nRoute").value = "progress";

  uiToast("Notification added.");
  renderNotifs();
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

async function addTeamMember(){
  if(!targetEmpId) throw new Error("Load an Employee ID first.");

  const name  = (q$("tName")?.value || "").trim();
  const role  = (q$("tRole")?.value || "").trim();
  const email = (q$("tEmail")?.value || "").trim();
  const phone = (q$("tPhone")?.value || "").trim();

  if(!name) throw new Error("Name is required.");

  const key = uidKey("t");
  const next = { ...normalizeContacts(targetData) };
  next[key] = { name, role, email, phone, createdAt: new Date().toISOString() };

  await updateEmployeeRecord({ contacts: next });
  targetData.contacts = next;

  if(q$("tName")) q$("tName").value = "";
  if(q$("tRole")) q$("tRole").value = "";
  if(q$("tEmail")) q$("tEmail").value = "";
  if(q$("tPhone")) q$("tPhone").value = "";

  uiToast("Team member added.");
  renderTeam();
}

// ---------- Company Settings (uses YOUR admin.html ids) ----------
async function saveCompanySettingsIfPresent(){
  const hasAny =
    q$("c_shopUrl") ||
    q$("c_helpPhone") || q$("c_helpEmail") || q$("c_helpText");

  if(!hasAny) return;

  const patch = {
    footwear: {
      shopUrl: (q$("c_shopUrl")?.value || "").trim()
    },
    help: {
      phone: (q$("c_helpPhone")?.value || "").trim(),
      email: (q$("c_helpEmail")?.value || "").trim(),
      text: (q$("c_helpText")?.value || "").trim()
    },
    updatedAt: serverTimestamp()
  };

  if(!isFirebaseConfigured()){
    uiToast("Preview mode: company settings not saved.");
    return;
  }

  await setDoc(PUBLIC_DOC(), patch, { merge:true });
  uiToast("Company settings saved.");
  setText("companyMsg","Saved.");
}

// ---------- Optional: show active employee in Admin UI ----------
function setActiveEmployeeUI(empId){
  // These are OPTIONAL. If you don't have them in HTML, nothing breaks.
  const pill = q$("activeEmpPill");
  const txt  = q$("activeEmpText");
  const box  = q$("secActiveEmp");

  if(box) box.style.display = empId ? "" : "none";
  if(pill) pill.textContent = empId ? "Active" : "—";
  if(txt) txt.textContent  = empId ? empId : "";
}

// ---------- INIT ----------
export async function initAdminApp(user){
  if(!await ensureAdmin(user)){
    alert("Not admin");
    return;
  }

  // Preview: still wire UI, but don’t fetch collections
  if(isFirebaseConfigured()){
    await loadAllowedIds();
  }else{
    const el=q$("allowedList");
    if(el) el.innerHTML=`<div class="small muted">Preview mode: connect Firebase to manage Allowed IDs.</div>`;
  }

  setActiveEmployeeUI("");

  // SEARCH BY ID
  q$("btnSearch").onclick = async () => {
    try{
      const raw = q$("searchEmpId")?.value || "";
      const empId = normalizeEmpId(raw);

      setText("searchMsg","");
      setText("apptMsg","");
      setText("scheduleMsg","");
      setText("payrollMsg","");
      setText("hoursMsg","");
      setText("depositMsg","");

      if(!empId){
        setText("searchMsg","Invalid ID format (SP###)");
        return;
      }

      // allow if exists OR in range (auto create allowed)
      if(isFirebaseConfigured()){
        await ensureAllowed(empId);
        await ensureEmployeeRecordExists(empId);
      }

      const rec = (isFirebaseConfigured()
        ? (await loadEmployeeRecord(empId))
        : null) || defaultEmployeeRecord(empId);

      targetEmpId = empId;
      targetData = rec;

      setActiveEmployeeUI(empId);

      // fill UI
      fillAppointment(targetData);
      fillSchedule(targetData);
      fillDeposit(targetData);

      renderNotifs();
      renderTeam();
      renderPayroll();
      renderTimeOff();
      renderHours();

      setText("searchMsg","Loaded " + empId);
      uiToast("Employee loaded.");

      // refresh allowed list after auto-create
      if(isFirebaseConfigured()){
        await loadAllowedIds();
      }
    }catch(e){
      targetEmpId = null;
      targetData = null;
      setActiveEmployeeUI("");
      setText("searchMsg", e?.message || String(e));
      uiToast(e?.message || String(e));
    }
  };

  // SAVE APPOINTMENT
  q$("btnSaveAppointment").onclick = async () => {
    try{
      if(!targetEmpId){ uiToast("Load ID first"); return; }

      const appt = {
        date:(q$("aDate")?.value || "").trim(),
        time:(q$("aTime")?.value || "").trim(),
        address:(q$("aAddr")?.value || "").trim(),
        notes:(q$("aNotes")?.value || "").trim()
      };

      await updateEmployeeRecord({ appointment: appt });

      targetData = targetData || {};
      targetData.appointment = appt;

      uiToast("Appointment saved");
      setText("apptMsg","Saved.");
    }catch(e){
      uiToast(e?.message || String(e));
      setText("apptMsg", e?.message || String(e));
    }
  };

  // SAVE SCHEDULE
  if(q$("btnSaveSchedule")){
    q$("btnSaveSchedule").onclick = async () => {
      try{ await saveSchedule(); }
      catch(e){ uiToast(e?.message || String(e)); setText("scheduleMsg", e?.message || String(e)); }
    };
  }

  // UPLOAD PAYSTUB
  if(q$("btnUploadPayStub")){
    q$("btnUploadPayStub").onclick = async () => {
      try{ await uploadPayStub(); }
      catch(e){ uiToast(e?.message || String(e)); setText("payrollMsg", e?.message || String(e)); }
    };
  }

  // SAVE HOURS
  if(q$("btnSaveHours")){
    q$("btnSaveHours").onclick = async () => {
      try{ await saveHours(); }
      catch(e){ uiToast(e?.message || String(e)); setText("hoursMsg", e?.message || String(e)); }
    };
  }

  // SAVE DEPOSIT
  if(q$("btnSaveDeposit")){
    q$("btnSaveDeposit").onclick = async () => {
      try{ await saveDeposit(); }
      catch(e){ uiToast(e?.message || String(e)); setText("depositMsg", e?.message || String(e)); }
    };
  }

  // ADD NOTIF
  if(q$("btnAddNotif")){
    q$("btnAddNotif").onclick = async () => {
      try { await addNotification(); }
      catch(e){ uiToast(e?.message || String(e)); }
    };
  }

  // ADD TEAM
  if(q$("btnAddTeam")){
    q$("btnAddTeam").onclick = async () => {
      try { await addTeamMember(); }
      catch(e){ uiToast(e?.message || String(e)); }
    };
  }

  // ADD ID (manual)
  if(q$("btnAddAllowed")){
    q$("btnAddAllowed").onclick = async () => {
      try{
        const id = (q$("newEmpId")?.value || "").trim();
        const name = (q$("newEmpName")?.value || "").trim();

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

  // COMPANY SETTINGS
  if(q$("btnSaveCompany")){
    q$("btnSaveCompany").onclick = async () => {
      try{ await saveCompanySettingsIfPresent(); }
      catch(e){ uiToast(e?.message || String(e)); }
    };
  }
}
