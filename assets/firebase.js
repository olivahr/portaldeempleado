// Firebase wiring. For now leave placeholders.
// Later, paste your firebaseConfig + enable Auth/Firestore.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  // TODO: paste real config later
  apiKey: "PASTE_LATER",
  authDomain: "PASTE_LATER",
  projectId: "PASTE_LATER",
  appId: "PASTE_LATER"
};

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "PASTE_LATER" && firebaseConfig.projectId !== "PASTE_LATER";
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
