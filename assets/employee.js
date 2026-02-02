// =====================================================
// EMPLOYEE PORTAL — FULL PRODUCTION BUILD
// =====================================================

import { uiSetText, uiToast, escapeHtml } from "./ui.js";
import { db, isFirebaseConfigured } from "./firebase.js";
import { onAuth } from "./auth.js";

import {
 doc,getDoc,setDoc,updateDoc,onSnapshot,serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ------------------------------------------------
// HELPERS
// ------------------------------------------------

const t = id => document.getElementById(id);

function route(){
 return (location.hash||"#progress").replace("#","");
}

function setPage(title,sub,html){
 uiSetText(t("pageTitle"),title);
 uiSetText(t("pageSub"),sub);
 t("pageBody").innerHTML=html;
}

function safe(v,f="—"){
 return (!v&&v!==0)?f:v;
}

// ------------------------------------------------
// EMPLOYEE ID NORMALIZER
// ------------------------------------------------

function normalizeEmpId(x){
 if(!x) return "";
 x=x.toUpperCase().replace(/\s+/g,"");
 x=x.replace(/SP[-_]?/,"SP");
 const m=x.match(/^SP(\d+)$/);
 return m?`SP${m[1]}`:x;
}

// ------------------------------------------------
// DEFAULT USER DOC
// ------------------------------------------------

function defaultUser(u){
 return{
  email:u.email||"",
  fullName:u.displayName||"",
  employeeId:"",

  appointment:{date:"",time:"",address:"",notes:""},

  position:"",
  shift:"",

  steps:[
   {id:"application",label:"Application",done:true},
   {id:"preferences",label:"Shift & Position Preferences",done:false},
   {id:"footwear",label:"Safety Footwear",done:false},
   {id:"i9",label:"I-9 Verification",done:false},
   {id:"docs",label:"Onboarding Documents",done:false,locked:true},
   {id:"firstday",label:"First Day Preparation",done:false,locked:true}
  ],

  createdAt:serverTimestamp(),
  updatedAt:serverTimestamp()
 };
}

// ------------------------------------------------
// STAGEBAR
// ------------------------------------------------

function stagebar(d){
 const el=t("stagebar");
 if(!el) return;

 el.innerHTML=d.steps.map(s=>{
  let ic="•";
  if(s.done) ic="✓";
  if(s.locked) ic="🔒";

  return `<span style="
   padding:8px 14px;
   border-radius:20px;
   border:1px solid #ddd;
   margin:4px;
   display:inline-block;
   font-weight:800;">
   ${ic} ${s.label}
  </span>`;
 }).join("");
}

// ------------------------------------------------
// PROGRESS
// ------------------------------------------------

function progress(d){
 const a=d.appointment||{};

 setPage("Progress","Your onboarding status",`

<div class="card">

<h3>Appointment Details</h3>

<b>Date:</b> ${safe(a.date,"Pending")}<br>
<b>Time:</b> ${safe(a.time,"Pending")}<br>
<b>Address:</b> ${safe(a.address,"Pending")}<br>
<b>Notes:</b> ${safe(a.notes,"")}

</div>
`);
}

// ------------------------------------------------
// SHIFT + POSITION PREFERENCES
// ------------------------------------------------

function preferences(d,save){
 setPage("Shift & Position Preferences","Select preferences",`

<div class="card">

<p>
Candidates may select preferred positions and shifts below.
Selections are considered preferences only.
Final assignments are determined by HR based on availability and business needs.
</p>

<h3>Select Position Preference</h3>

<label><input type="radio" name="pos" value="assembler">
Solar Panel Assembler — $18–$23/hr</label><br>

<label><input type="radio" name="pos" value="handler">
Material Handler — $18–$22/hr</label><br>

<label><input type="radio" name="pos" value="qc">
Quality Control — $19–$23/hr</label>

<hr>

<h3>Select Shift Preference</h3>

<label><input type="radio" name="shift" value="early">
Early Shift 6:00 AM – 2:30 PM</label><br>

<label><input type="radio" name="shift" value="mid">
Mid Shift 2:00 PM – 10:30 PM</label><br>

<label><input type="radio" name="shift" value="late">
Late Shift 10:00 PM – 6:30 AM</label>

<br><br>

<small>
Shift and position selections are preferences only.
HR will confirm your assignment.
</small>

<br><br>

<button id="savePref" class="btn primary">Save Preferences</button>

</div>
`);

t("savePref").onclick=async()=>{
 const p=document.querySelector("input[name=pos]:checked")?.value;
 const s=document.querySelector("input[name=shift]:checked")?.value;

 if(!p||!s) return uiToast("Select position and shift");

 const steps=d.steps.map(x=>{
  if(x.id==="preferences") return {...x,done:true};
  return x;
 });

 await save({position:p,shift:s,steps});
 uiToast("Saved");
};
}

// ------------------------------------------------
// SAFETY FOOTWEAR
// ------------------------------------------------

function footwear(d,save){
 setPage("Safety Footwear Program","Required for work",`

<div class="card">

<h3>Safety Footwear Program</h3>

<p>
Approved protective footwear is required for all warehouse and production employees.
Safety shoes must be worn at all times on the work floor.
Employees without approved footwear will not be permitted to begin work.
</p>

<b>Reimbursement Policy</b>
<ul>
<li>Processed after first day</li>
<li>Receipt required</li>
<li>One payroll cycle</li>
<li>Not immediate cash</li>
</ul>

<b>Requirements</b>
<ul>
<li>Steel/composite toe</li>
<li>Slip-resistant sole</li>
<li>No sneakers/sandals</li>
</ul>

<label><input type="checkbox" id="f1"> I understand footwear is required</label><br>
<label><input type="checkbox" id="f2"> I will purchase approved footwear</label><br>
<label><input type="checkbox" id="f3"> I understand reimbursement policy</label>

<br><br>

<button id="fwbtn" class="btn primary">Confirm</button>

</div>
`);

t("fwbtn").onclick=async()=>{
 if(!f1.checked||!f2.checked||!f3.checked)
  return uiToast("Confirm all");

 const steps=d.steps.map(s=>{
  if(s.id==="footwear") return {...s,done:true};
  return s;
 });

 await save({steps});
 uiToast("Saved");
};
}

// ------------------------------------------------
// I-9 PAGE
// ------------------------------------------------

function i9(d,save){
 setPage("Form I-9 Verification","Federal requirement",`

<div class="card">

<p>
All employees hired in the United States must complete Form I-9.
Bring original unexpired documents.
Copies or photos not accepted.
</p>

<b>List A</b>
<ul>
<li>U.S. Passport</li>
<li>Green Card</li>
<li>EAD</li>
</ul>

<b>List B</b>
<ul>
<li>Driver’s License</li>
<li>State ID</li>
<li>School ID</li>
<li>Military ID</li>
</ul>

<b>List C</b>
<ul>
<li>Social Security Card</li>
<li>Birth Certificate</li>
<li>Naturalization Certificate</li>
</ul>

<label>
<input type="checkbox" id="i9c">
I will bring valid original documents.
</label>

<br><br>

<button id="i9btn" class="btn primary">Confirm</button>

</div>
`);

t("i9btn").onclick=async()=>{
 if(!i9c.checked) return uiToast("Confirm first");

 const steps=d.steps.map(s=>{
  if(s.id==="i9") return {...s,done:true};
  return s;
 });

 await save({steps});
 uiToast("Confirmed");
};
}

// ------------------------------------------------
// LOCKED STEPS
// ------------------------------------------------

function locked(){
 setPage("In-Person Step","Locked",`
 <div class="card">
 This step is completed in person at the warehouse.
 </div>
`);
}

// ------------------------------------------------
// ROUTER
// ------------------------------------------------

function router(d,save){
 stagebar(d);

 switch(route()){
  case"progress":progress(d);break;
  case"preferences":preferences(d,save);break;
  case"footwear":footwear(d,save);break;
  case"i9":i9(d,save);break;
  case"docs":locked();break;
  case"firstday":locked();break;
  default:location.hash="#progress";
 }
}

// ------------------------------------------------
// INIT
// ------------------------------------------------

export async function initEmployeeApp(){

 if(!isFirebaseConfigured()){
  uiToast("Firebase not connected");
  return;
 }

 onAuth(async user=>{
  if(!user) location.href="./index.html";

  const ref=doc(db,"users",user.uid);
  const snap=await getDoc(ref);

  if(!snap.exists())
   await setDoc(ref,defaultUser(user));

  const save=p=>updateDoc(ref,{...p,updatedAt:serverTimestamp()});

  onSnapshot(ref,s=>{
   router(s.data(),save);
  });
 });
}
