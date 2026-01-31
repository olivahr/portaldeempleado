import { auth, db, isFirebaseConfigured } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const provider = new GoogleAuthProvider();

// For UI preview: if Firebase not configured, we still render screens
export async function authReady() {
  return isFirebaseConfigured();
}

export function onAuth(cb) {
  try {
    return onAuthStateChanged(auth, cb);
  } catch {
    // Firebase not configured; simulate "not signed in"
    cb(null);
    return () => {};
  }
}

async function ensureUserDoc(user) {
  if (!user || !isFirebaseConfigured()) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || "",
      fullName: user.displayName || "",
      phone: "",
      role: "employee",
      status: "active",

      stage: "shift_selection",

      appointment: { date: "", time: "", address: "", notes: "" },

      steps: [
        { id: "application", label: "Application", done: true },
        { id: "shift_selection", label: "Shift Selection", done: false },
        { id: "docs", label: "Complete Onboarding Documents", done: false },
        { id: "first_day", label: "First Day Preparation", done: false }
      ],

      shift: { choice: "", confirmed: false },

      contacts: {
        siteManager: { name: "Site Manager", phone: "", email: "" },
        shiftLead:   { name: "Shift Supervisor / Lead", phone: "", email: "" },
        hr:          { name: "HR / People Operations", phone: "", email: "" },
        safety:      { name: "Safety Officer", phone: "", email: "" }
      },

      notifications: [
        { id:"n1", title:"Reminder: Bring your I-9 documents on your first day", body:"Make sure to bring acceptable documents for the I-9 form.", action:"View I-9 Readiness", route:"i9" },
        { id:"n2", title:"Please Confirm Your Work Shift", body:"Select your preferred work schedule to confirm your shift.", action:"Go to Shift Selection", route:"shift" }
      ],

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
  } else {
    // Optional: update last login
  }
}

export async function signInEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet (paste config later).");
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function registerEmail(email, pass) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet (paste config later).");
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInGoogle() {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet (paste config later).");
  const cred = await signInWithPopup(auth, provider);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function resetPassword(email) {
  if (!isFirebaseConfigured()) throw new Error("Firebase not configured yet (paste config later).");
  await sendPasswordResetEmail(auth, email);
}

export async function signOutNow() {
  if (!isFirebaseConfigured()) return; // preview mode
  await signOut(auth);
}

export async function getCurrentUserEmail() {
  return auth?.currentUser?.email || "";
}
