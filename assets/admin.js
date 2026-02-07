// SunPower Admin Portal - 100% Funcional
import { db } from "./firebase.js";
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, getDocs, onSnapshot,
    serverTimestamp, arrayUnion, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==================== VARIABLES GLOBALES ====================
let currentEmpId = null;
let chatUnsubscribe = null;

// ==================== UTILIDADES ====================
function $(id) { return document.getElementById(id); }

function normalizeEmpId(input) {
    if (!input) return "";
    let v = input.toString().toUpperCase().trim().replace(/[\\s-_]/g, "");
    if (!v.startsWith("SP")) return "";
    const nums = v.slice(2);
    if (!/^\\d+$/.test(nums)) return "";
    return "SP" + nums.padStart(3, '0');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function showToast(message, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== EMPLEADO ACTUAL ====================
async function loadCurrentEmployee() {
    const input = $('currentEmpId');
    const empId = normalizeEmpId(input.value);
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    try {
        // Verificar que existe
        const empDoc = await getDoc(doc(db, "allowedEmployees", empId));
        if (!empDoc.exists()) {
            showToast(`Employee ${empId} not found`, 'error');
            return;
        }
        
        currentEmpId = empId;
        
        // Actualizar UI
        $('currentEmpBadge').textContent = `Working with: ${empId}`;
        $('currentEmpBadge').classList.add('active');
        input.value = empId;
        
        // Cargar datos en todas las secciones
        await loadProfileData();
        await loadAppointmentData();
        await loadShiftData();
        await initChat();
        
        showToast(`Loaded ${empId} successfully!`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== PERFIL ====================
async function loadProfileData() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const profile = data.profile || {};
        
        $('profFirstName').value = profile.firstName || '';
        $('profLastName').value = profile.lastName || '';
        $('profDOB').value = profile.dob || '';
        $('profPhone').value = profile.phone || '';
        $('profAddress').value = profile.address || '';
        $('profCity').value = profile.city || '';
        $('profStateZip').value = profile.stateZip || '';
        $('profEmergencyName').value = profile.emergencyName || '';
        $('profEmergencyPhone').value = profile.emergencyPhone || '';
        
    } catch (error) {
        console.error("Profile load error:", error);
    }
}

async function saveProfile() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const profile = {
        firstName: $('profFirstName').value.trim(),
        lastName: $('profLastName').value.trim(),
        dob: $('profDOB').value,
        phone: $('profPhone').value.trim(),
        address: $('profAddress').value.trim(),
        city: $('profCity').value.trim(),
        stateZip: $('profStateZip').value.trim(),
        emergencyName: $('profEmergencyName').value.trim(),
        emergencyPhone: $('profEmergencyPhone').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    try {
        // Actualizar perfil
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { profile });
        
        // Actualizar nombre en allowedEmployees
        await updateDoc(doc(db, "allowedEmployees", currentEmpId), {
            name: `${profile.firstName} ${profile.lastName}`.trim(),
            updatedAt: serverTimestamp()
        });
        
        // Actualizar en users si existe
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        usersSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                fullName: `${profile.firstName} ${profile.lastName}`.trim()
            });
        });
        
        showToast('Profile saved!', 'success');
        loadAllEmployees(); // Refresh list
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== CITA ====================
async function loadAppointmentData() {
    if (!currentEmpId) return;
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const appt = data.appointment || {};
        
        $('apptDate').value = appt.date || '';
        $('apptTime').value = appt.time || '';
        $('apptAddress').value = appt.address || '';
        $('apptNotes').value = appt.notes || '';
        $('apptSuccess').style.display = 'none';
        
    } catch (error) {
        console.error("Appointment load error:", error);
    }
}

async function saveAppointment() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const appointment = {
        date: $('apptDate').value,
        time: $('apptTime').value,
        address: $('apptAddress').value.trim(),
        notes: $('apptNotes').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    try {
        // Guardar en employeeRecords
        await updateDoc(doc(db, "employeeRecords", currentEmpId), { appointment });
        
        // Guardar en user document para que lo vea el empleado
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        
        if (usersSnap.empty) {
            // Crear user document si no existe
            await setDoc(doc(db, "users", currentEmpId), {
                employeeId: currentEmpId,
                appointment,
                createdAt: serverTimestamp()
            });
        } else {
            usersSnap.forEach(async (userDoc) => {
                await updateDoc(doc(db, "users", userDoc.id), { appointment });
            });
        }
        
        $('apptSuccess').style.display = 'block';
        showToast('Appointment saved!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function clearAppointment() {
    $('apptDate').value = '';
    $('apptTime').value = '';
    $('apptAddress').value = '';
    $('apptNotes').value = '';
    $('apptSuccess').style.display = 'none';
}

// ==================== SHIFT APPROVAL ====================
async function loadShiftData() {
    if (!currentEmpId) {
        $('shiftPending').style.display = 'none';
        $('shiftApproved').style.display = 'none';
        $('shiftNone').style.display = 'block';
        return;
    }
    
    try {
        const snap = await getDoc(doc(db, "employeeRecords", currentEmpId));
        const data = snap.exists() ? snap.data() : {};
        const shift = data.shift || {};
        
        if (!shift.position) {
            $('shiftPending').style.display = 'none';
            $('shiftApproved').style.display = 'none';
            $('shiftNone').style.display = 'block';
            return;
        }
        
        // Mostrar datos del shift
        $('shiftPosition').textContent = shift.position || 'Not selected';
        $('shiftTime').textContent = shift.shift || 'Not selected';
        $('shiftDate').textContent = shift.selectedAt ? 
            new Date(shift.selectedAt.toDate()).toLocaleDateString() : 'Unknown';
        
        if (shift.approved) {
            $('shiftPending').style.display = 'none';
            $('shiftApproved').style.display = 'block';
            $('shiftNone').style.display = 'none';
        } else {
            $('shiftPending').style.display = 'block';
            $('shiftApproved').style.display = 'none';
            $('shiftNone').style.display = 'none';
        }
        
    } catch (error) {
        console.error("Shift load error:", error);
    }
}

async function approveShift() {
    if (!currentEmpId) return;
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            'shift.approved': true,
            'shift.approvedAt': serverTimestamp(),
            'shift.approvedBy': 'admin'
        });
        
        // También actualizar en users
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        usersSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                'shift.approved': true
            });
        });
        
        showToast('Shift approved!', 'success');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function rejectShift() {
    if (!currentEmpId) return;
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            'shift': deleteField(),
            shiftRejected: true,
            shiftRejectedAt: serverTimestamp()
        });
        
        showToast('Shift rejected. Employee must select again.', 'info');
        loadShiftData();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== NOTIFICACIONES ====================
async function sendNotification() {
    if (!currentEmpId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const title = $('notifTitle').value.trim();
    const body = $('notifBody').value.trim();
    const type = $('notifType').value;
    
    if (!title || !body) {
        showToast('Title and message required', 'error');
        return;
    }
    
    const notification = {
        id: generateId(),
        type,
        title,
        body,
        createdAt: serverTimestamp(),
        read: false,
        from: 'admin'
    };
    
    try {
        await updateDoc(doc(db, "employeeRecords", currentEmpId), {
            notifications: arrayUnion(notification)
        });
        
        // También añadir a user document
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentEmpId));
        const usersSnap = await getDocs(usersQuery);
        usersSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                notifications: arrayUnion(notification)
            });
        });
        
        $('notifTitle').value = '';
        $('notifBody').value = '';
        showToast('Notification sent!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== CHAT ====================
async function initChat() {
    if (!currentEmpId) {
        $('chatHeader').textContent = 'Select an employee to start chatting';
        $('chatMessages').innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">Load an employee to view conversation</div>';
        $('chatInput').disabled = true;
        $('btnSendChat').disabled = true;
        return;
    }
    
    // Cancelar suscripción anterior
    if (chatUnsubscribe) {
        chatUnsubscribe();
    }
    
    // Cargar info del empleado
    const empDoc = await getDoc(doc(db, "allowedEmployees", currentEmpId));
    const empData = empDoc.exists() ? empDoc.data() : {};
    
    $('chatHeader').textContent = `Chat with: ${empData.name || currentEmpId}`;
    $('chatInput').disabled = false;
    $('btnSendChat').disabled = false;
    $('chatInput').focus();
    
    // Escuchar mensajes en tiempo real
    chatUnsubscribe = onSnapshot(doc(db, "chats", currentEmpId), (snap) => {
        const messages = snap.exists() ? (snap.data().messages || []) : [];
        renderMessages(messages);
    });
}

function renderMessages(messages) {
    const container = $('chatMessages');
    
    if (messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">No messages yet. Start the conversation!</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender === 'admin' ? 'admin' : 'employee'}">
            <div>${msg.text}</div>
            <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
                ${new Date(msg.timestamp?.toDate?.() || msg.timestamp).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = $('chatInput');
    const text = input.value.trim();
    
    if (!text || !currentEmpId) return;
    
    const message = {
        sender: 'admin',
        text,
        timestamp: serverTimestamp()
    };
    
    try {
        const chatRef = doc(db, "chats", currentEmpId);
        const snap = await getDoc(chatRef);
        
        if (snap.exists()) {
            await updateDoc(chatRef, {
                messages: arrayUnion(message),
                updatedAt: serverTimestamp()
            });
        } else {
            await setDoc(chatRef, {
                messages: [message],
                employeeId: currentEmpId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        input.value = '';
        
    } catch (error) {
        showToast('Error sending message', 'error');
    }
}

// ==================== GESTIÓN DE IDs ====================
async function loadAllEmployees() {
    const container = $('allEmployeesList');
    container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 20px;">Loading...</div>';
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snap.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        // Ordenar por número de ID
        employees.sort((a, b) => {
            const numA = parseInt(a.id.replace('SP', ''));
            const numB = parseInt(b.id.replace('SP', ''));
            return numA - numB;
        });
        
        if (employees.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 40px;">No employees registered yet</div>';
            return;
        }
        
        container.innerHTML = '<div class="employee-list"></div>';
        const list = container.querySelector('.employee-list');
        
        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'employee-item';
            item.innerHTML = `
                <div class="employee-info">
                    <div class="employee-id">${emp.id}</div>
                    <div class="employee-name">${emp.name || 'No name'}</div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="status-badge ${emp.active !== false ? 'status-active' : 'status-inactive'}">
                        ${emp.active !== false ? 'Active' : 'Inactive'}
                    </span>
                    <button class="btn btn-secondary" onclick="loadEmpFromList('${emp.id}')" style="padding: 8px 16px; font-size: 12px;">
                        Load
                    </button>
                    <button class="btn btn-danger" onclick="deleteEmployee('${emp.id}')" style="padding: 8px 16px; font-size: 12px;">
                        Delete
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
        
    } catch (error) {
        container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Error: ${error.message}</div>`;
    }
}

async function addNewEmployee() {
    const idInput = $('newEmpId');
    const nameInput = $('newEmpName');
    const emailInput = $('newEmpEmail');
    
    const empId = normalizeEmpId(idInput.value);
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    
    if (!empId) {
        showToast('Invalid ID format. Use: SP001', 'error');
        return;
    }
    
    if (!name) {
        showToast('Name is required', 'error');
        return;
    }
    
    try {
        // Verificar si existe
        const existing = await getDoc(doc(db, "allowedEmployees", empId));
        if (existing.exists()) {
            showToast('Employee ID already exists', 'error');
            return;
        }
        
        // Crear en allowedEmployees
        await setDoc(doc(db, "allowedEmployees", empId), {
            active: true,
            name: name,
            email: email,
            createdAt: serverTimestamp(),
            onboardingComplete: false
        });
        
        // Crear employeeRecord
        await setDoc(doc(db, "employeeRecords", empId), {
            employeeId: empId,
            name: name,
            email: email,
            createdAt: serverTimestamp(),
            profile: {},
            appointment: {},
            notifications: [],
            shift: {},
            steps: [
                { id: "shift_selection", label: "Shift Selection", done: false },
                { id: "footwear", label: "Safety Footwear", done: false },
                { id: "i9", label: "I-9 Documents", done: false },
                { id: "badge", label: "Photo Badge", done: false },
                { id: "firstday", label: "First Day Preparation", done: false }
            ]
        });
        
        showToast(`Employee ${empId} created!`, 'success');
        idInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        loadAllEmployees();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// Funciones globales para onclick
window.loadEmpFromList = function(empId) {
    $('currentEmpId').value = empId;
    loadCurrentEmployee();
    // Cambiar a primera pestaña
    document.querySelector('[data-tab="profile"]').click();
};

window.deleteEmployee = async function(empId) {
    if (!confirm(`Are you sure you want to delete ${empId}?`)) return;
    
    try {
        await deleteDoc(doc(db, "allowedEmployees", empId));
        await deleteDoc(doc(db, "employeeRecords", empId));
        await deleteDoc(doc(db, "chats", empId));
        
        if (currentEmpId === empId) {
            currentEmpId = null;
            $('currentEmpBadge').classList.remove('active');
            $('currentEmpBadge').textContent = 'None selected';
        }
        
        showToast(`Employee ${empId} deleted`, 'success');
        loadAllEmployees();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
};

// ==================== NAVEGACIÓN ====================
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            // Actualizar tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Mostrar sección
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            $(`tab-${tabId}`).classList.add('active');
            
            // Cargar datos específicos
            if (tabId === 'manage') loadAllEmployees();
            if (tabId === 'shift') loadShiftData();
        });
    });
}

// ==================== INICIALIZACIÓN ====================
export function initAdminApp() {
    console.log('🚀 Admin Portal Initializing...');
    
    // Tabs
    initTabs();
    
    // Employee selector
    $('btnLoadEmp')?.addEventListener('click', loadCurrentEmployee);
    $('currentEmpId')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadCurrentEmployee();
    });
    
    // Profile
    $('btnSaveProfile')?.addEventListener('click', saveProfile);
    
    // Appointment
    $('btnSaveAppt')?.addEventListener('click', saveAppointment);
    $('btnClearAppt')?.addEventListener('click', clearAppointment);
    
    // Shift
    $('btnApproveShift')?.addEventListener('click', approveShift);
    $('btnRejectShift')?.addEventListener('click', rejectShift);
    
    // Notifications
    $('btnSendNotif')?.addEventListener('click', sendNotification);
    
    // Chat
    $('btnSendChat')?.addEventListener('click', sendChatMessage);
    $('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Manage
    $('btnAddEmp')?.addEventListener('click', addNewEmployee);
    
    // Logout
    $('btnLogout')?.addEventListener('click', () => {
        window.location.href = './index.html';
    });
    
    // Cargar lista inicial
    loadAllEmployees();
    
    console.log('✅ Admin Portal Ready');
}
