import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// === SERVICIO DE AUTENTICACIÓN ===
export const AuthService = {
    init(callback) {
        onAuthStateChanged(auth, (user) => {
            callback(user);
        });
    },

    async signIn() {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Error en Auth:", error);
        }
    }
};

// === SERVICIO DE DATOS (CRUD) ===
export const DataService = {
    
    // Escuchar cambios en tiempo real (Live Listeners)
    subscribeToCollection(collName, callback) {
        const q = query(collection(db, collName), orderBy('createdAt', 'desc')); // Orden por defecto
        
        // Retorna la función 'unsubscribe' para detener la escucha cuando sea necesario
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(items);
        }, (error) => {
            console.error(`Error escuchando ${collName}:`, error);
        });
    },

    // Agregar documento
    async add(collName, data) {
        try {
            const docRef = await addDoc(collection(db, collName), {
                ...data,
                createdAt: new Date() // Timestamp automático
            });
            return docRef.id;
        } catch (error) {
            console.error(`Error agregando a ${collName}:`, error);
            throw error;
        }
    },

    // Actualizar documento
    async update(collName, id, data) {
        try {
            const docRef = doc(db, collName, id);
            await updateDoc(docRef, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error(`Error actualizando ${id} en ${collName}:`, error);
            throw error;
        }
    },

    // Eliminar documento
    async delete(collName, id) {
        try {
            await deleteDoc(doc(db, collName, id));
        } catch (error) {
            console.error(`Error eliminando ${id} de ${collName}:`, error);
            throw error;
        }
    },

    // === UTILIDADES ===

    // Obtener lista de Stock (Simulado o desde archivo)
    async fetchStockList() {
        // Intentamos cargar un archivo local stock.json si existe, o devolvemos una lista básica
        try {
            const response = await fetch('./stock.json');
            if (response.ok) {
                const data = await response.json();
                return data.items || []; // Asumiendo estructura { items: [...] }
            }
        } catch (e) {
            console.warn("No se encontró stock.json, usando lista vacía.");
        }
        
        // Fallback: Lista vacía o básica si no hay archivo
        return [];
    },

    // Generar Backup de todas las colecciones
    async generateBackupJSON() {
        const collections = ['tasks', 'notes', 'orders', 'deliveries', 'procedures', 'scripts'];
        const backup = {};

        for (const col of collections) {
            try {
                const snapshot = await getDocs(collection(db, col));
                backup[col] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (e) {
                console.error(`Error backup ${col}:`, e);
                backup[col] = [];
            }
        }

        return backup;
    }
};
