// ChopCircle — Firebase project configuration
// Replace the placeholder values with your Firebase project's config
// (Project Settings → General → Your apps → SDK setup and configuration).
// Never commit real API keys for a project with sensitive data to a public
// repo without restricting them in the Firebase/Google Cloud console —
// Firebase web API keys are safe to expose publicly ONLY when paired with
// properly configured Firestore/Storage Security Rules (see firebase/firestore.rules).

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyADSxtX0bNk8PKOMcVmAqWOgIXk6f5vNsI",
  authDomain: "mbbs-financial.firebaseapp.com",
  databaseURL:
    "https://mbbs-financial-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mbbs-financial",
  storageBucket: "mbbs-financial.firebasestorage.app",
  messagingSenderId: "670206142011",
  appId: "1:670206142011:web:1c7bb906ae45707d8dde1e",
  measurementId: "G-TQSV6S6TJX",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
