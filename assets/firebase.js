// Firebase core
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

// Auth
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Firestore
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Firebase configuration (TU PROYECTO REAL)
 */
const firebaseConfig = {
  apiKey: "AIzaSyApT665GcwJDJYWj1peFN9DlltPIaMW9K",
  authDomain: "portal-empleado-df279.firebaseapp.com",
  projectId: "portal-empleado-df279",
  storageBucket: "portal-empleado-df279.appspot.com",
  messagingSenderId: "641787761578",
  appId: "1:641787761578:web:1c3668f8d49bbb00695d13"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Helper: usado por tu app para saber si Firebase está activo
export function isFirebaseConfigured() {
  return true;
}
