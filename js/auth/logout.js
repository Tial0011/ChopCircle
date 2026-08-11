// ChopCircle — Logout helper
import { auth } from "../firebase/firebase-init.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export async function logout() {
  await signOut(auth);
  window.location.href = "/index.html";
}
