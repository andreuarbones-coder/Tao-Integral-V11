import { DataService, AuthService } from './data-service.js';

// === ESTADO GLOBAL ===
const State = {
    user: null,
    username: localStorage.getItem('jardin_username') || '',
    branch: localStorage.getItem('tao_branch') || 'centro',
    view: 'tasks',
    wakeLock: null,
    listeners: {}, // Para guardar los unsubscribe de Firebase
    stockList: []  // Lista en memoria
};

// === UI MANAGER ===
export const UI = {
    init() {
        this.setBranch(State.branch);
        this.nav('tasks');
        
        const dateEl = document.getElementById('currentDate');
        if(dateEl) dateEl.innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
        
        // Modal de nombre si no existe
        if (!State.username) {
            setTimeout(() => document.getElementById('modal-username')?.classList.remove('hidden'), 500);
        }

        // Listener de Autenticación
        AuthService.init((user) => {
            const ind = document.getElementById('connectionStatus');
            if (user) {
                State.user = user;
                if(ind) ind.innerText = "Conectado";
                document.getElementById('loadingIndicator')?.classList.remove('hidden');
                this.startDataListeners();
                
                // Carga inicial de Stock (Optimizado: Una sola vez)
                this.loadStock();
                
                setTimeout(() => document.getElementById('loadingIndicator')?.classList.add('hidden'), 1000);
            } else {
                if(ind) ind.innerText = "Desconectado";
                // Intento de login anónimo o con token se maneja en AuthService
                AuthService.signIn(); 
            }
        });

        this.setupEventListeners();
    },

    setupEventListeners() {
        // Sidebar y Navegación
        document.getElementById('branchToggleBtn').onclick = () => this.toggleBranch();
        document.getElementById('sidebarOverlay').onclick = () => this.toggleSidebar(false);
        
        // Modales (Cierre)
        document.querySelectorAll('.modal-close').forEach(b => b.onclick = () => this.closeModal());
        const overlay = document.getElementById('modalOverlay');
        if(overlay) overlay.onclick = (e) => { if(e.target === overlay) this.closeModal(); };

        // FAB
        document.getElementById('mainFab').onclick = () => this.handleFab();

        // Buscadores
        const stdSearch = document.getElementById('stdSearch');
        if(stdSearch) stdSearch.oninput = (e) => this.filterStandards(e.target.value);
        
        const stockSearch = document.getElementById('stockSearchInput');
        if(stockSearch) stockSearch.oninput = (e) => this.renderStockList(e.target.value);

        // Wake Lock
        document.getElementById('wakeLockBtn').onclick = () => this.toggleWakeLock();

        // Guardar Nombre
        document.getElementById('saveUsernameBtn').onclick = () => {
            const name = document.getElementById('usernameInput').value.trim();
            if(name) {
                localStorage.setItem('jardin_username', name);
                State.username = name;
                document.getElementById('modal-username').classList.add('hidden');
                this.toast(`Bienvenido, ${name}`);
            }
        };

        // === ACCIONES DE GUARDADO (CRUD) ===
        
        // Guardar Tarea
        document.getElementById('saveTaskBtn').onclick = () => this.saveTask();
        // Eliminar Tarea (desde el modal)
        document.getElementById('deleteTaskBtn').onclick = () => {
             const id = document.getElementById('taskId').value;
             if(id) window.delTask(id);
        };

        // Guardar Pedido
        document.getElementById('saveOrderBtn').onclick = () => this.saveOrder();

        // Guardar Reparto
        document.getElementById('saveDelBtn').onclick = () => this.saveDelivery();

        // Otros botones de guardado (Notas, Scripts, etc) pueden agregarse aquí siguiendo el mismo patrón
        // Por ahora nos enfocamos en los solicitados.
    },

    // --- LOGICA DE GUARDADO ---

    async saveTask() {
        const id = document.getElementById('taskId').value;
        const text = document.getElementById('taskInput').value.trim();
        const assignee = document.getElementById('taskAssignee').value.trim();
        const priority = document.getElementById('taskPriority').value;
        const cycle = document.getElementById('taskCycle').value;

        if (!text) return this.toast("Escribe una descripción", "error");

        const data = {
            text,
            assignee: assignee || 'Equipo',
            priority,
            cycle,
            branch: State.branch,
            // Si es nueva, status pending. Si es edit, mantenemos el status que tenía o reseteamos según lógica. 
            // Para simplificar, updates no cambian status a menos que se especifique.
            // Aquí asumimos que editar propiedades no completa la tarea.
        };

        // Si es creación nueva
        if (!id) {
            data.status = 'pending';
            data.createdBy = State.username;
        }

        try {
            if (id) {
                await DataService.update('tasks', id, data);
                this.toast("Tarea actualizada");
            } else {
                await DataService.add('tasks', data);
                this.toast("Tarea creada");
            }
            this.closeModal();
        } catch (e) {
            console.error(e);
            this.toast("Error al guardar", "error");
        }
    },

    async saveOrder() {
        const requester = document.getElementById('orderRequester').value.trim();
        const notes = document.getElementById('orderNotes').value.trim();
        
        // Recopilar items
        const items = [];
        const container = document.getElementById('orderItemsContainer');
        container.querySelectorAll('.order-row').forEach(row => {
            const name = row.querySelector('.order-item').value.trim();
            const amount = row.querySelector('.order-amount').value.trim();
            if(name) items.push({ name, amount });
        });

        if (items.length === 0) return this.toast("Agrega al menos un producto", "error");
        if (!requester) return this.toast("Indica quién solicita", "error");

        const data = {
            requester,
            notes,
            items,
            status: 'pending',
            branch: State.branch, // Ojo: Los pedidos suelen ser globales, pero marcamos origen
            createdAt: new Date() // El serverTimestamp se pone en DataService, esto es por si acaso
        };

        try {
            await DataService.add('orders', data);
            this.toast("Pedido enviado");
            this.closeModal();
        } catch (e) {
            this.toast("Error al enviar pedido", "error");
        }
    },

    async saveDelivery() {
        const id = document.getElementById('delId').value;
        const client = document.getElementById('delClient').value.trim();
        const phone = document.getElementById('delPhone').value.trim();
        const when = document.getElementById('delWhen').value.trim();
        const where = document.getElementById('delWhere').value.trim();
        const notes = document.getElementById('delNotes').value.trim();

        // Recopilar items (Reutiliza lógica similar a orders)
        const items = [];
        const container = document.getElementById('delItemsContainer');
        container.querySelectorAll('.order-row').forEach(row => {
            const name = row.querySelector('.order-item').value.trim();
            const amount = row.querySelector('.order-amount').value.trim();
            if(name) items.push({ name, amount });
        });

        if (!client || !where) return this.toast("Faltan datos del cliente o dirección", "error");

        const data = {
            client, phone, when, where, notes, items,
            branch: State.branch,
            status: 'pending' // pending, delivered, cancelled
        };

        try {
            if (id) {
                await DataService.update('deliveries', id, data);
                this.toast("Reparto actualizado");
            } else {
                await DataService.add('deliveries', data);
                this.toast("Reparto agendado");
            }
            this.closeModal();
        } catch (e) {
            this.toast("Error al guardar reparto", "error");
        }
    },

    // --- NAVEGACIÓN Y APARIENCIA ---

    setBranch(branch) {
        State.branch = branch;
        localStorage.setItem('tao_branch', branch);
        const body = document.getElementById('appBody');
        const label = document.getElementById('sidebarBranchName');
        
        if (branch === 'centro') {
            body.className = 'branch-centro transition-colors duration-500 font-sans text-slate-800';
            label.innerText = 'Centro Tao';
        } else {
            body.className = 'branch-ejemplares transition-colors duration-500 font-sans text-slate-800';
            label.innerText = 'Ejemplares Tao';
        }
        
        if(State.user) this.startDataListeners(); // Recargar datos de la sucursal
        this.toast(`Cambiado a ${label.innerText}`);
    },

    toggleBranch() { this.setBranch(State.branch === 'centro' ? 'ejemplares' : 'centro'); },

    toggleSidebar(show) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (show) {
            overlay.classList.remove('hidden');
            void overlay.offsetWidth; 
            overlay.classList.remove('opacity-0');
            sidebar.classList.remove('-translate-x-full');
        } else {
            overlay.classList.add('opacity-0');
            sidebar.classList.add('-translate-x-full');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    },

    async toggleWakeLock() {
        const btn = document.getElementById('wakeLockBtn');
        try {
            if (State.wakeLock) {
                await State.wakeLock.release();
                State.wakeLock = null;
                btn.classList.remove('bg-emerald-100', 'text-emerald-700');
                btn.classList.add('bg-slate-100', 'text-slate-500');
                btn.innerHTML = '<i class="far fa-moon"></i> <span>Pantalla: Automática</span>';
                this.toast("Ahorro de energía activado");
            } else {
                State.wakeLock = await navigator.wakeLock.request('screen');
                btn.classList.remove('bg-slate-100', 'text-slate-500');
                btn.classList.add('bg-emerald-100', 'text-emerald-700');
                btn.innerHTML = '<i class="fas fa-sun"></i> <span>Mantener Pantalla: ON</span>';
                this.toast("Pantalla se mantendrá encendida");
            }
        } catch(e) { this.toast("No soportado en este dispositivo", "error"); }
    },

    nav(view) {
        State.view = view;
        this.toggleSidebar(false);
        
        // Actualizar menú activo
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active-nav', 'bg-slate-50', 'border-slate-500');
            if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(view)) {
                el.classList.add('bg-slate-50', 'border-slate-500');
                const icon = el.querySelector('i');
                if(icon) icon.style.color = 'var(--primary)';
            } else {
                const icon = el.querySelector('i');
                if(icon) icon.style.color = '';
            }
        });

        // Cambiar vista
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const activeView = document.getElementById(`view-${view}`);
        if(activeView) activeView.classList.remove('hidden');
        
        const titles = { 
            tasks: 'Tareas', orders: 'Pedidos', delivery: 'Repartos', 
            notes: 'Notas', procedures: 'Procesos', stock: 'Inventario', 
            chat: 'Radio Frecuencia', scripts: 'Scripts Venta', standards: 'Catálogo Maestro' 
        };
        document.getElementById('pageTitle').innerText = titles[view] || 'Jardín OS';
        
        if(view === 'stock' && State.stockList.length === 0) this.loadStock(); 
    },

    // --- DATA LISTENERS ---
    
    startDataListeners() {
        // Limpiar listeners anteriores
        Object.values(State.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        
        // Tareas
        State.listeners.tasks = DataService.subscribeToCollection('tasks', (items) => {
            const filtered = items.filter(i => i.branch === State.branch);
            const pVal = {critical:0, high:1, medium:2, low:3};
            filtered.sort((a,b) => { 
                if(pVal[a.priority] !== pVal[b.priority]) return pVal[a.priority] - pVal[b.priority]; 
                return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0); 
            });
            this.renderTasks(filtered);
        });

        // NOTA: Se eliminó el listener del Chat para optimizar y poner en mantenimiento.
        
        // Notas
        State.listeners.notes = DataService.subscribeToCollection('notes', (items) => {
            const filtered = items.filter(i => i.branch === State.branch);
            this.renderNotes(filtered);
        });

        // Pedidos y Repartos (Globales o compartidos)
        State.listeners.orders = DataService.subscribeToCollection('orders', (items) => this.renderOrders(items));
        State.listeners.delivery = DataService.subscribeToCollection('deliveries', (items) => this.renderDeliveries(items));
        
        // Estándares y Procedimientos (Globales)
        State.listeners.standards = DataService.subscribeToCollection('standards', (items) => this.renderStandards(items));
        State.listeners.procedures = DataService.subscribeToCollection('procedures', (items) => this.renderProcedures(items));
        State.listeners.scripts = DataService.subscribeToCollection('scripts', (items) => this.renderScripts(items));
    },

    async loadStock() {
        try {
            const list = await DataService.fetchStockList();
            State.stockList = list;
            const countEl = document.getElementById('stockTotalCount');
            if(countEl) countEl.innerText = `Total en base de datos: ${list.length} items`;
            this.renderStockList(document.getElementById('stockSearchInput')?.value || '');
            this.updateAutocomplete();
        } catch (error) {
            console.error("Error cargando stock", error);
            this.toast("Error al cargar inventario", "error");
        }
    },

    // --- RENDERERS ---

    renderTasks(tasks) {
        const list = document.getElementById('taskList');
        list.innerHTML = '';
        if(tasks.length === 0) { list.innerHTML = this.emptyState('relax', 'Todo listo por hoy'); return; }

        const prioColor = { critical: 'border-l-red-500', high: 'border-l-orange-500', medium: 'border-l-blue-500', low: 'border-l-emerald-500' };
        const prioText = { critical: 'URGENTE', high: 'ALTA', medium: 'MEDIA', low: 'BAJA' };
        const today = new Date().toDateString();

        tasks.forEach(t => {
            let isDone = false;
            if (t.cycle && t.cycle !== 'none') {
                if (t.lastDone) {
                   const doneDate = new Date(t.lastDone.seconds * 1000).toDateString();
                   isDone = (doneDate === today); 
                }
            } else {
                isDone = t.status === 'done';
            }
            const isPartial = t.status === 'partial';

            const div = document.createElement('div');
            div.className = `bg-white rounded-xl p-4 shadow-sm border-l-4 ${prioColor[t.priority] || 'border-l-slate-300'} flex gap-3 transition-all ${isDone ? 'opacity-50' : ''}`;
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = "flex flex-col gap-2 pt-1 border-l border-slate-100 pl-3";
            
            if (!isDone) {
                actionsDiv.innerHTML = `
                    <button onclick="window.updateTaskStatus('${t.id}', 'done', '${t.cycle}')" class="w-8 h-8 rounded-full bg-slate-100 text-slate-300 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-all shadow-sm active:scale-90"><i class="fas fa-check"></i></button>
                    ${!isPartial ? `<button onclick="window.updateTaskStatus('${t.id}', 'partial', '${t.cycle}')" class="w-8 h-8 rounded-full bg-slate-50 text-slate-300 hover:bg-amber-400 hover:text-white flex items-center justify-center transition-all active:scale-90"><i class="fas fa-hourglass-half text-xs"></i></button>` : ''}
                `;
            } else {
                actionsDiv.innerHTML = `<button onclick="window.updateTaskStatus('${t.id}', 'pending', '${t.cycle}')" class="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md active:scale-90"><i class="fas fa-undo"></i></button>`;
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = "flex-grow";
            
            const metaDiv = document.createElement('div');
            metaDiv.className = "flex items-center gap-2 mb-1";
            metaDiv.innerHTML = `<span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">${prioText[t.priority] || 'NORMAL'}</span>`;
            if (t.cycle && t.cycle !== 'none') {
                metaDiv.innerHTML += `<span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><i class="fas fa-sync-alt text-[8px]"></i> ${t.cycle}</span>`;
            }
            if (isPartial) metaDiv.innerHTML += '<span class="text-[10px] bg-amber-100 text-amber-600 px-2 rounded-full font-bold">INCOMPLETO</span>';

            const title = document.createElement('h3');
            title.className = `text-slate-800 font-medium leading-tight ${isDone ? 'line-through text-slate-400' : ''}`;
            title.textContent = t.text; 

            const footer = document.createElement('div');
            footer.className = "flex items-center justify-between mt-2";
            footer.innerHTML = `<span class="text-xs text-slate-400 flex items-center gap-1"><i class="fas fa-user-circle"></i> ${t.assignee || 'Sin asignar'}</span>`;
            
            const editBtn = document.createElement('button');
            editBtn.className = "text-slate-300 hover:text-slate-500 px-2";
            editBtn.innerHTML = '<i class="fas fa-ellipsis-h"></i>';
            editBtn.onclick = () => window.editTask(t);
            footer.appendChild(editBtn);

            contentDiv.appendChild(metaDiv);
            contentDiv.appendChild(title);
            contentDiv.appendChild(footer);

            div.appendChild(contentDiv);
            div.appendChild(actionsDiv);
            list.appendChild(div);
        });
    },

    renderNotes(notes) {
        const list = document.getElementById('notesList');
        list.innerHTML = '';
        notes.forEach(n => {
            const isMoney = n.type === 'billing';
            const div = document.createElement('div');
            div.className = `p-4 rounded-xl shadow-sm border relative ${isMoney ? 'bg-amber-50 border-amber-200' : 'bg-yellow-50 border-yellow-200'}`;
            
            if (isMoney) {
                const badge = document.createElement('span');
                badge.className = "absolute -top-2 left-4 bg-amber-500 text-white text-[10px] px-2 rounded";
                badge.textContent = "COBRAR";
                div.appendChild(badge);
            }

            const p = document.createElement('p');
            p.className = "whitespace-pre-wrap text-slate-800 leading-relaxed font-sans";
            p.textContent = n.content; 
            div.appendChild(p);

            const btn = document.createElement('button');
            btn.className = "absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50";
            btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            btn.onclick = () => window.delItem('notes', n.id);
            div.appendChild(btn);

            list.appendChild(div);
        });
    },

    renderStockList(query) {
        const container = document.getElementById('stockListContainer');
        container.innerHTML = '';
        
        const term = query.toLowerCase();
        const filtered = State.stockList.filter(item => item.toLowerCase().includes(term));
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-slate-400"><i class="fas fa-boxes text-4xl mb-2 opacity-50"></i><p>Sin resultados</p></div>';
            return;
        }

        filtered.slice(0, 50).forEach(item => { 
            const div = document.createElement('div');
            div.className = "p-3 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-50 last:border-0";
            div.textContent = item;
            container.appendChild(div);
        });
    },
    
    updateAutocomplete() {
        const datalist = document.getElementById('stockItemsList');
        if(!datalist) return;
        datalist.innerHTML = '';
        State.stockList.slice(0, 2000).forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            datalist.appendChild(option);
        });
    },

    renderOrders(orders) {
        const list = document.getElementById('ordersList');
        list.innerHTML = '';
        const pending = orders.filter(o => o.status !== 'received').length;
        document.getElementById('badgeOrders')?.classList.toggle('hidden', pending === 0);
        
        if(orders.length === 0) { list.innerHTML = this.emptyState('shopping-basket', 'Sin pedidos'); return; }
        
        orders.forEach(o => {
           const div = document.createElement('div');
           div.className = "bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-2 relative overflow-hidden";
           
           // Listar items
           let itemsHtml = '<ul class="text-sm text-slate-600 mt-2 space-y-1">';
           o.items.forEach(i => itemsHtml += `<li><b>${i.amount}</b> ${i.name}</li>`);
           itemsHtml += '</ul>';

           div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-slate-800">${o.requester} <span class="text-xs font-normal text-slate-400">solicita:</span></div>
                        ${o.notes ? `<div class="text-xs text-slate-400 italic my-1">"${o.notes}"</div>` : ''}
                    </div>
                    <button onclick="window.delShared('orders', '${o.id}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash-alt"></i></button>
                </div>
                ${itemsHtml}
                <div class="text-[10px] text-right text-slate-300 mt-2">${o.createdAt ? new Date(o.createdAt.seconds*1000).toLocaleDateString() : ''}</div>
           `; 
           list.appendChild(div);
        });
    },
    
    renderDeliveries(items) { 
        const list = document.getElementById('deliveryList');
        list.innerHTML = '';
        const pending = items.filter(i => i.status === 'pending').length;
        document.getElementById('badgeDelivery')?.classList.toggle('hidden', pending === 0);

        if(items.length === 0) { list.innerHTML = this.emptyState('truck', 'Sin repartos pendientes'); return; }

        items.forEach(d => {
            const div = document.createElement('div');
            div.className = "bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-3 relative";
            
            // Items Preview
            const itemsText = d.items ? d.items.map(i => `${i.amount} ${i.name}`).join(', ') : 'Sin detalle';

            div.innerHTML = `
                <div class="flex items-start justify-between mb-2">
                    <div>
                         <h3 class="font-bold text-slate-800 text-lg">${d.client}</h3>
                         <div class="text-sm text-emerald-600 font-bold"><i class="fas fa-map-marker-alt"></i> ${d.where}</div>
                    </div>
                    <button onclick="window.editDelivery(null)" class="hidden text-slate-400"><i class="fas fa-pen"></i></button> 
                    <button onclick="window.delShared('deliveries', '${d.id}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash-alt"></i></button>
                </div>
                
                <div class="bg-slate-50 p-2 rounded-lg text-sm text-slate-600 mb-2 border border-slate-100">
                    ${itemsText}
                </div>

                <div class="flex items-center justify-between text-xs text-slate-500">
                    <div class="flex gap-3">
                        ${d.when ? `<span><i class="far fa-clock"></i> ${d.when}</span>` : ''}
                        ${d.phone ? `<a href="tel:${d.phone}" class="text-blue-500 hover:underline"><i class="fas fa-phone"></i> ${d.phone}</a>` : ''}
                    </div>
                </div>
                ${d.notes ? `<div class="mt-2 text-xs text-amber-600 bg-amber-50 p-1 px-2 rounded inline-block"><i class="fas fa-sticky-note"></i> ${d.notes}</div>` : ''}
            `;
            
            // Hack para pasar el objeto al onclick sin problemas de comillas
            const editBtn = div.querySelector('button.hidden');
            if(editBtn) {
                 editBtn.classList.remove('hidden');
                 editBtn.onclick = () => window.editDelivery(d);
            }

            list.appendChild(div);
        });
    },
    
    renderStandards(items) {
        const list = document.getElementById('standardsList');
        list.innerHTML = items.length ? '' : this.emptyState('ruler-combined', 'Catálogo vacío');
        items.forEach(s => {
             const div = document.createElement('div');
             div.className = "bg-white p-4 rounded-xl shadow-sm flex gap-4 items-center";
             div.innerHTML = `
                <div class="w-16 h-16 bg-slate-100 rounded-lg flex-none bg-cover bg-center" style="background-image: url('${s.photo || ''}');">
                    ${!s.photo ? '<i class="fas fa-image text-slate-300 flex items-center justify-center h-full w-full"></i>' : ''}
                </div>
                <div class="flex-grow">
                    <h3 class="font-bold text-slate-800">${s.species}</h3>
                    <div class="text-xs text-slate-500 flex gap-2 mt-1">
                        <span class="bg-slate-100 px-2 py-0.5 rounded font-bold">${s.size}</span>
                        <span>${s.height || '-'}</span>
                    </div>
                </div>
             `;
             list.appendChild(div);
        });
    },
    
    renderProcedures(items) {
         const list = document.getElementById('proceduresList');
         list.innerHTML = '';
         items.forEach(p => {
             const color = p.color || 'blue';
             const colors = { blue: 'bg-blue-50 border-blue-200 text-blue-800', green: 'bg-emerald-50 border-emerald-200 text-emerald-800', red: 'bg-red-50 border-red-200 text-red-800', purple: 'bg-purple-50 border-purple-200 text-purple-800', pink: 'bg-pink-50 border-pink-200 text-pink-800', teal: 'bg-teal-50 border-teal-200 text-teal-800', slate: 'bg-slate-50 border-slate-200 text-slate-800' };
             
             const div = document.createElement('div');
             div.className = `p-4 rounded-xl border ${colors[color] || colors.blue} mb-3 shadow-sm`;
             div.innerHTML = `
                <h3 class="font-bold mb-2 text-lg">${p.title}</h3>
                <div class="whitespace-pre-wrap text-sm opacity-90">${p.steps}</div>
             `;
             list.appendChild(div);
         });
    },
    
    renderScripts(items) {
         const list = document.getElementById('scriptsList');
         list.innerHTML = '';
         items.forEach(s => {
             const div = document.createElement('div');
             div.className = "p-4 bg-white rounded-xl shadow-sm border border-slate-100 mb-3";
             div.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <h3 class="font-bold text-slate-700">${s.title}</h3>
                    <button onclick="window.copyScript(this.getAttribute('data-content'))" data-content="${s.content}" class="text-purple-600 text-xs font-bold bg-purple-50 px-2 py-1 rounded hover:bg-purple-100">COPIAR</button>
                </div>
                <div class="text-sm text-slate-500 font-mono bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">${s.content}</div>
             `;
             list.appendChild(div);
         });
    },

    // --- MODALES Y UTILIDADES ---

    openModal(id, data = null) {
        const modal = document.getElementById(id);
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('translate-y-full');
            if(window.innerWidth >= 640) modal.classList.remove('sm:translate-y-full');
        });

        if (id === 'modal-tasks') {
            if (data) {
                document.getElementById('taskId').value = data.id;
                document.getElementById('taskInput').value = data.text;
                document.getElementById('taskAssignee').value = data.assignee || '';
                document.getElementById('taskPriority').value = data.priority || 'medium';
                document.getElementById('taskCycle').value = data.cycle || 'none';
                document.getElementById('deleteTaskBtn').classList.remove('hidden');
                document.getElementById('taskModalTitle').innerText = "Editar Tarea";
            } else {
                document.getElementById('taskId').value = '';
                document.getElementById('taskInput').value = '';
                document.getElementById('taskAssignee').value = State.username || '';
                document.getElementById('taskPriority').value = 'medium';
                document.getElementById('taskCycle').value = 'none';
                document.getElementById('deleteTaskBtn').classList.add('hidden');
                document.getElementById('taskModalTitle').innerText = "Nueva Tarea";
            }
        }
        
        if (id === 'modal-delivery') {
            const container = document.getElementById('delItemsContainer');
            container.innerHTML = '';
            
            if (data) {
                document.getElementById('delModalTitle').innerText = "Editar Reparto";
                document.getElementById('delId').value = data.id;
                document.getElementById('delClient').value = data.client || '';
                document.getElementById('delPhone').value = data.phone || '';
                document.getElementById('delWhen').value = data.when || '';
                document.getElementById('delWhere').value = data.where || '';
                document.getElementById('delNotes').value = data.notes || '';
                if(data.items) data.items.forEach(i => window.addOrderRow('delItemsContainer', i.name, i.amount));
            } else {
                document.getElementById('delModalTitle').innerText = "Nuevo Reparto";
                document.getElementById('delId').value = '';
                document.getElementById('delClient').value = '';
                document.getElementById('delPhone').value = '';
                document.getElementById('delWhen').value = '';
                document.getElementById('delWhere').value = '';
                document.getElementById('delNotes').value = '';
                window.addOrderRow('delItemsContainer');
            }
        }
        
        if (id === 'modal-orders') {
            const container = document.getElementById('orderItemsContainer');
            container.innerHTML = '';
            window.addOrderRow('orderItemsContainer');
            document.getElementById('orderRequester').value = State.username || '';
            document.getElementById('orderNotes').value = '';
        }
    },

    closeModal() {
        const overlay = document.getElementById('modalOverlay');
        const openModals = document.querySelectorAll('#modalOverlay > div:not(.hidden)');
        openModals.forEach(m => {
            m.classList.add('translate-y-full');
            if(window.innerWidth >= 640) m.classList.add('sm:translate-y-full');
        });
        setTimeout(() => {
            overlay.classList.add('hidden');
            openModals.forEach(m => m.classList.add('hidden'));
        }, 300);
    },

    handleFab() {
        const map = { tasks: 'modal-tasks', orders: 'modal-orders', delivery: 'modal-delivery', notes: 'modal-notes', procedures: 'modal-procedures', scripts: 'modal-scripts', standards: 'modal-standards' };
        if (map[State.view]) this.openModal(map[State.view]);
    },

    toast(msg, type='info') {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const el = document.createElement('div');
        const colors = { info: 'text-blue-400', success: 'text-emerald-400', error: 'text-red-400' };
        const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
        el.className = 'toast';
        el.innerHTML = `<i class="fas ${icon} ${colors[type]}"></i> <span>${msg}</span>`;
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    },

    scrollToBottom(id) {
        const el = document.getElementById(id);
        if(el) el.scrollTop = el.scrollHeight;
    },
    
    emptyState(icon, text) {
        return `<div class="flex flex-col items-center justify-center py-10 opacity-40 gap-3"><i class="fas fa-${icon} text-4xl"></i><p>${text}</p></div>`;
    }
};

// === EXPOSICIÓN GLOBAL ===

window.UI = UI;

window.updateTaskStatus = async (id, status, cycle) => {
    // Si es cíclica y se marca done, actualizar lastDone
    const updateData = { status };
    if (status === 'done' && cycle && cycle !== 'none') {
        updateData.lastDone = new Date(); // serverTimestamp mejor, pero Date local funciona para UI inmediata
    }
    await DataService.update('tasks', id, updateData);
};

window.editTask = (task) => UI.openModal('modal-tasks', task);
window.editDelivery = (d) => UI.openModal('modal-delivery', d);

window.delTask = async (id) => { 
    if(confirm('¿Eliminar esta tarea?')) { 
        UI.closeModal(); 
        await DataService.delete('tasks', id); 
        UI.toast("Tarea eliminada"); 
    } 
};

window.delItem = async (col, id) => { if(confirm('¿Eliminar nota?')) await DataService.delete(col, id); };
window.delShared = async (col, id) => { if(confirm('¿Eliminar elemento compartido?')) await DataService.delete(col, id); };

window.copyScript = (text) => {
    navigator.clipboard.writeText(text).then(() => UI.toast("Copiado al portapapeles", "success"));
};

window.handleStockImport = async (input) => {
    // Lógica simplificada de importación
    if(!input.files || !input.files[0]) return;
    UI.toast("Procesando archivo...");
    // ... Implementación real requeriría parser CSV
};
