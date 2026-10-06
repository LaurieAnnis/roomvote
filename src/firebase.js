import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDA9pX_-XeQFNnwgZo1PkHVFQTSBngSpcM",
    authDomain: "roomvote-2026.firebaseapp.com",
    projectId: "roomvote-2026",
    storageBucket: "roomvote-2026.firebasestorage.app",
    messagingSenderId: "765109732605",
    appId: "1:765109732605:web:4f288ac54ca4735358ea94"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();