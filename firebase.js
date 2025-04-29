import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getDatabase, set, ref as databaseRef, push, onValue, child, query, update, remove, get } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';

const firebaseConfig = {
apiKey: "AIzaSyB9a1vDGilEQtV3nUenZfPS6XOCApDqK4I",
authDomain: "box-to-bet.firebaseapp.com",
projectId: "box-to-bet",
storageBucket: "box-to-bet.firebasestorage.app",
messagingSenderId: "169985575207",
appId: "1:169985575207:web:fa58a2489fc727153ac102",
measurementId: "G-XXMD8HEYZ0"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

export { 
    auth,
    database,
    storage,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    updateProfile,
    signOut,
    set,
    get,
    child,
    databaseRef,
    push,
    onValue,
    query,
    update,
    remove,
    storageRef,
    uploadBytesResumable,
    getDownloadURL
};