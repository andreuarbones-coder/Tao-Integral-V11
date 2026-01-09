import { db, storage, auth, APP_COLLECTION_ID } from './firebase-config.js';
import { 
    collection, doc, addDoc, updateDoc, deleteDoc, 
    onSnapshot, getDocs, query, orderBy, 
    serverTimestamp, writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// === UTILIDADES INTERNAS ===
const getColRef = (colName) => collection(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', colName);
const getDocRef = (colName, docId) => doc(db, 'artifacts', APP_COLLECTION_ID, 'public', 'data', colName, docId);

// === AUTENTICACIÓN ===
export const AuthService = {
    init(onUserChange) {
        onAuthStateChanged(auth, (user) => onUserChange(user));
    },
    async signIn(token) {
        if (token) return await signInWithCustomToken(auth, token);
        return await signInAnonymously(auth);
    },
    getCurrentUser() {
        return auth.currentUser;
    }
};

// === GESTIÓN DE DATOS (CRUD) ===
export const DataService = {
    
    // --- LECTURAS (TIEMPO REAL) ---
    // Devuelven una función 'unsubscribe' que debe llamarse al salir
    
    subscribeToCollection(colName, callback) {
        // Por defecto ordenamos por creación descendente (lo más nuevo arriba)
        // Nota: Para filtros complejos por sucursal, lo haremos en memoria (cliente) 
        // para evitar crear índices compuestos en esta fase de refactorización.
        const q = query(getColRef(colName), orderBy('createdAt', 'desc')); // Requiere que los docs tengan createdAt
        
        // Fallback para colecciones sin createdAt consistente o lógica mixta:
        // Si falla el ordenamiento, podríamos usar solo getColRef(colName), 
        // pero asumiremos que mantendremos createdAt en las escrituras nuevas.
        
        return onSnapshot(q, (snapshot) => {
            const items = [];
            snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
            callback(items);
        });
    },

    // --- LECTURAS (OPTIMIZADAS / UNA VEZ) ---
    
    // Recupera el stock una sola vez. Ahorra lecturas masivas.
    async fetchStockList() {
        // Ordenamos alfabéticamente por nombre
        const q = query(getColRef('stock'), orderBy('name'));
        const snapshot = await getDocs(q);
        const items = [];
        snapshot.forEach(doc => items.push(doc.data().name));
        return items;
    },

    // --- ESCRITURAS ---

    async add(colName, data) {
        return await addDoc(getColRef(colName), {
            ...data,
            createdAt: serverTimestamp()
        });
    },

    async update(colName, docId, data) {
        return await updateDoc(getDocRef(colName, docId), {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    async delete(colName, docId) {
        return await deleteDoc(getDocRef(colName, docId));
    },

    // --- OPERACIONES ESPECIALES ---

    // Subida de Archivos (Imágenes)
    async uploadFile(folder, file) {
        const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
        const snap = await uploadBytes(storageRef, file);
        return await getDownloadURL(snap.ref);
    },

    // Importación Masiva de Stock (Batch)
    async batchInsertStock(itemsNameList) {
        const BATCH_SIZE = 400; // Firebase límite: 500 ops por batch
        const colRef = getColRef('stock');

        for (let i = 0; i < itemsNameList.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = itemsNameList.slice(i, i + BATCH_SIZE);
            
            chunk.forEach(name => {
                const docRef = doc(colRef); // ID automático
                batch.set(docRef, { name, createdAt: serverTimestamp() });
            });
            
            await batch.commit();
        }
    },

    // Borrado Masivo de Stock (Reset)
    async batchDeleteAllStock() {
        const colRef = getColRef('stock');
        const snapshot = await getDocs(colRef);
        
        const BATCH_SIZE = 400;
        const docs = snapshot.docs;
        
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    },
    
    // Backup de Datos (Descarga JSON)
    async generateBackupJSON() {
        const collections = ['tasks', 'notes', 'chat', 'orders', 'deliveries', 'procedures', 'scripts', 'standards'];
        const backup = {};
        
        for (const col of collections) {
            const snap = await getDocs(getColRef(col));
            backup[col] = [];
            snap.forEach(d => backup[col].push({id: d.id, ...d.data()}));
        }
        return backup;
    }
};