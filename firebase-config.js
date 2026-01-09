import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// === CONFIGURACIÓN ===
// Claves de acceso públicas de Firebase.
const manualConfig = {
    apiKey: "AIzaSyBzPiBCgiHoHSp24U7739fj9-htyTA8KiU",
    authDomain: "app-jardin-v4.firebaseapp.com",
    projectId: "app-jardin-v4",
    storageBucket: "app-jardin-v4.firebasestorage.app",
    messagingSenderId: "413324369604",
    appId: "1:413324369604:web:f78e3f459725dd824e3391"
};

let firebaseConfig = manualConfig;

// Intento de carga automática (para entornos de despliegue que inyectan la config)
try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        firebaseConfig = JSON.parse(__firebase_config);
    }
} catch (e) {
    console.warn("Usando configuración manual de Firebase.");
}

// === INICIALIZACIÓN ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Identificador de la colección raíz (para no perder tus datos actuales)
const APP_COLLECTION_ID = 'jardin-os-v8';

// Exportamos las herramientas para usarlas en otros archivos
export { app, auth, db, storage, APP_COLLECTION_ID };