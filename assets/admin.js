// SunPower Admin Portal - Complete JavaScript
import { db } from "./firebase.js";
import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, getDocs, onSnapshot,
    serverTimestamp, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

function empIdToNumber(empId) {
    const m = String(empId || "").match(/^SP(\\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== NAVEGACIÓN ====================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.dataset.section;
            
            // Update nav active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Show target section
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetSection) {
                    section.classList.add('active');
                }
            });
            
            // Load section data
            if (targetSection === 'dashboard') loadDashboard();
            if (targetSection === 'employees') loadEmployees();
            if (targetSection === 'chat') loadChatEmployees();
        });
    });
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        const snapshot = await getDocs(collection(db, "allowedEmployees"));
        let total = 0, active = 0, pending = 0;
        
        snapshot.forEach(doc => {
            total++;
            const data = doc.data();
            if (data.active !== false) active++;
            if (!data.onboardingComplete) pending++;
        });
        
        $('statTotal').textContent = total;
        $('statActive').textContent = active;
        $('statPending').textContent = pending;
    } catch (error) {
        console.error("Dashboard error:", error);
        showToast('Error loading dashboard', 'error');
    }
}

// ==================== EMPLOYEES ====================
async function loadEmployees() {
    const container = $('employeeListContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
    
    try {
        const snapshot = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snapshot.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        employees.sort((a, b) => empIdToNumber(a.id) - empIdToNumber(b.id));
        
        if (employees.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No employees registered yet</p></div>';
            return;
        }
        
        container.innerHTML = '<div class="employee-list" id="employeeList"></div>';
        const list = $('employeeList');
        
        employees.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'employee-item';
            item.innerHTML = `
                <div class="employee-info">
                    <div class="employee-id">${emp.id}</div>
                    <div class="employee-name">${escapeHtml(emp.name || 'No name')}</div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="status-badge ${emp.active !== false ? 'status-active' : 'status-inactive'}">
                        ${emp.active !== false ? 'Active' : 'Inactive'}
                    </span>
                    <button class="btn ${emp.active !== false ? 'btn-danger' : 'btn-success'} toggle-status" data-id="${emp.id}" data-active="${emp.active !== false}">
                        ${emp.active !== false ? 'Deactivate' : 'Activate'}
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
        
        // Add event listeners to toggle buttons
        list.querySelectorAll('.toggle-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const empId = e.target.dataset.id;
                const isActive = e.target.dataset.active === 'true';
                toggleEmployeeStatus(empId, isActive);
            });
        });
        
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Error: ${error.message}</div>`;
    }
}

async function addEmployee() {
    const idInput = $('inputEmpId');
    const nameInput = $('inputEmpName');
    const emailInput = $('inputEmpEmail');
    
    const empId = normalizeEmpId(idInput.value);
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    
    if (!empId) {
        showToast('Invalid Employee ID. Use format: SP001', 'error');
        return;
    }
    
    if (!name) {
        showToast('Please enter employee name', 'error');
        return;
    }
    
    try {
        // Check if exists
        const empRef = doc(db, "allowedEmployees", empId);
        const existing = await getDoc(empRef);
        
        if (existing.exists()) {
            showToast('Employee ID already exists', 'error');
            return;
        }
        
        // Add to allowed employees
        await setDoc(empRef, {
            active: true,
            name: name,
            email: email,
            createdAt: serverTimestamp(),
            onboardingComplete: false
        });
        
        // Create employee record
        await setDoc(doc(db, "employeeRecords", empId), {
            employeeId: empId,
            name: name,
            email: email,
            createdAt: serverTimestamp(),
            profile: {},
            appointment: {},
            notifications: [],
            shift: {},
            footwear: {},
            i9: {},
            badge: {},
            firstday: {}
        });
        
        showToast(`Employee ${empId} added successfully!`, 'success');
        idInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        loadEmployees();
        loadDashboard();
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function toggleEmployeeStatus(empId, currentActive) {
    try {
        const ref = doc(db, "allowedEmployees", empId);
        await updateDoc(ref, {
            active: !currentActive,
            updatedAt: serverTimestamp()
        });
        
        showToast(`Employee ${empId} ${!currentActive ? 'activated' : 'deactivated'}`, 'success');
        loadEmployees();
        loadDashboard();
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== PROFILES ====================
async function loadProfile() {
    const searchInput = $('searchProfileId');
    if (!searchInput) return;
    
    const empId = normalizeEmpId(searchInput.value);
    if (!empId) {
        showToast('Invalid Employee ID', 'error');
        return;
    }
    
    try {
        const recordRef = doc(db, "employeeRecords", empId);
        const snap = await getDoc(recordRef);
        
        if (!snap.exists()) {
            showToast('Employee not found', 'error');
            return;
        }
        
        const data = snap.data();
        const profile = data.profile || {};
        
        $('profileFirstName').value = profile.firstName || '';
        $('profileLastName').value = profile.lastName || '';
        $('profileDOB').value = profile.dob || '';
        $('profilePhone').value = profile.phone || '';
        $('profileAddress').value = profile.address || '';
        $('profileCity').value = profile.city || '';
        $('profileStateZip').value = profile.stateZip || '';
        $('profileEmergencyName').value = profile.emergencyName || '';
        $('profileEmergencyPhone').value = profile.emergencyPhone || '';
        
        $('profileEditor').style.display = 'block';
        $('profileEditor').dataset.empId = empId;
        
        showToast(`Profile loaded for ${empId}`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function saveProfile() {
    const editor = $('profileEditor');
    const empId = editor.dataset.empId;
    
    if (!empId) {
        showToast('No employee selected', 'error');
        return;
    }
    
    const profile = {
        firstName: $('profileFirstName').value.trim(),
        lastName: $('profileLastName').value.trim(),
        dob: $('profileDOB').value,
        phone: $('profilePhone').value.trim(),
        address: $('profileAddress').value.trim(),
        city: $('profileCity').value.trim(),
        stateZip: $('profileStateZip').value.trim(),
        emergencyName: $('profileEmergencyName').value.trim(),
        emergencyPhone: $('profileEmergencyPhone').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    try {
        // Update employee record
        await updateDoc(doc(db, "employeeRecords", empId), { profile });
        
        // Update name in allowed employees
        await updateDoc(doc(db, "allowedEmployees", empId), {
            name: `${profile.firstName} ${profile.lastName}`.trim(),
            updatedAt: serverTimestamp()
        });
        
        // Update in users collection if exists
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", empId));
        const userSnap = await getDocs(usersQuery);
        
        userSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                fullName: `${profile.firstName} ${profile.lastName}`.trim(),
                updatedAt: serverTimestamp()
            });
        });
        
        showToast('Profile saved successfully!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== APPOINTMENTS ====================
async function loadAppointment() {
    const searchInput = $('apptEmpId');
    if (!searchInput) return;
    
    const empId = normalizeEmpId(searchInput.value);
    if (!empId) {
        showToast('Invalid Employee ID', 'error');
        return;
    }
    
    try {
        const recordRef = doc(db, "employeeRecords", empId);
        const snap = await getDoc(recordRef);
        
        if (!snap.exists()) {
            showToast('Employee not found', 'error');
            return;
        }
        
        const data = snap.data();
        const appt = data.appointment || {};
        
        $('apptDate').value = appt.date || '';
        $('apptTime').value = appt.time || '';
        $('apptAddress').value = appt.address || '';
        $('apptNotes').value = appt.notes || '';
        
        $('apptEditor').style.display = 'block';
        $('apptEditor').dataset.empId = empId;
        $('apptSuccess').style.display = 'none';
        
        showToast(`Appointment data loaded for ${empId}`, 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function saveAppointment() {
    const editor = $('apptEditor');
    const empId = editor.dataset.empId;
    
    if (!empId) {
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
        // Save to employeeRecords
        await updateDoc(doc(db, "employeeRecords", empId), { appointment });
        
        // Save to user document
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", empId));
        const userSnap = await getDocs(usersQuery);
        
        userSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                appointment,
                updatedAt: serverTimestamp()
            });
        });
        
        $('apptSuccess').style.display = 'flex';
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

// ==================== NOTIFICATIONS ====================
async function loadNotificationTargets() {
    const select = $('notifTarget');
    if (!select) return;
    
    // Keep ALL option, add employees
    select.innerHTML = '<option value="ALL">All Employees</option>';
    
    try {
        const snapshot = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snapshot.forEach(doc => {
            if (doc.data().active !== false) {
                employees.push({ id: doc.id, name: doc.data().name || doc.id });
            }
        });
        
        employees.sort((a, b) => empIdToNumber(a.id) - empIdToNumber(b.id));
        
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.id} - ${emp.name}`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error("Error loading targets:", error);
    }
}

async function sendNotification() {
    const target = $('notifTarget').value;
    const type = $('notifType').value;
    const title = $('notifTitle').value.trim();
    const body = $('notifBody').value.trim();
    
    if (!title || !body) {
        showToast('Title and message are required', 'error');
        return;
    }
    
    const notification = {
        id: generateId(),
        type,
        title,
        body,
        createdAt: serverTimestamp(),
        read: false
    };
    
    try {
        if (target === 'ALL') {
            // Send to all active employees
            const snapshot = await getDocs(collection(db, "allowedEmployees"));
            let count = 0;
            
            for (const empDoc of snapshot.docs) {
                if (empDoc.data().active !== false) {
                    await updateDoc(doc(db, "employeeRecords", empDoc.id), {
                        notifications: arrayUnion(notification)
                    });
                    count++;
                }
            }
            
            showToast(`Notification sent to ${count} employees`, 'success');
            
        } else {
            // Send to specific employee
            await updateDoc(doc(db, "employeeRecords", target), {
                notifications: arrayUnion(notification)
            });
            
            showToast(`Notification sent to ${target}`, 'success');
        }
        
        // Clear form
        $('notifTitle').value = '';
        $('notifBody').value = '';
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== CHAT ====================
async function loadChatEmployees() {
    const select = $('chatEmployeeSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Choose an employee --</option>';
    
    try {
        const snapshot = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snapshot.forEach(doc => {
            if (doc.data().active !== false) {
                employees.push({ id: doc.id, name: doc.data().name || doc.id });
            }
        });
        
        employees.sort((a, b) => empIdToNumber(a.id) - empIdToNumber(b.id));
        
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.id} - ${emp.name}`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error("Error loading chat employees:", error);
    }
}

let currentChatEmpId = null;
let chatUnsubscribe = null;

function initChat() {
    const select = $('chatEmployeeSelect');
    const input = $('chatInput');
    const sendBtn = $('btnSendChat');
    
    if (select) {
        select.addEventListener('change', (e) => {
            const empId = e.target.value;
            if (empId) {
                startChat(empId);
            } else {
                endChat();
            }
        });
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendChatMessage);
    }
    
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }
}

async function startChat(empId) {
    currentChatEmpId = empId;
    
    // Get employee info
    try {
        const empDoc = await getDoc(doc(db, "allowedEmployees", empId));
        const empData = empDoc.exists() ? empDoc.data() : {};
        
        $('chatAvatar').textContent = (empData.name || empId).charAt(0).toUpperCase();
        $('chatEmployeeName').textContent = empData.name || empId;
        $('chatStatus').textContent = 'Online';
        
        $('chatInput').disabled = false;
        $('btnSendChat').disabled = false;
        
        // Listen for messages
        if (chatUnsubscribe) chatUnsubscribe();
        
        chatUnsubscribe = onSnapshot(doc(db, "chats", empId), (snap) => {
            renderMessages(snap.exists() ? snap.data().messages || [] : []);
        });
        
    } catch (error) {
        showToast('Error starting chat', 'error');
    }
}

function endChat() {
    currentChatEmpId = null;
    if (chatUnsubscribe) {
        chatUnsubscribe();
        chatUnsubscribe = null;
    }
    
    $('chatAvatar').textContent = '?';
    $('chatEmployeeName').textContent = 'Select an employee';
    $('chatStatus').textContent = 'No conversation selected';
    $('chatInput').disabled = true;
    $('btnSendChat').disabled = true;
    $('chatMessages').innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">💬</div>
            <p>Select an employee from the dropdown to start chatting</p>
        </div>
    `;
}

function renderMessages(messages) {
    const container = $('chatMessages');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender === 'admin' ? 'admin' : 'employee'}">
            <div>${escapeHtml(msg.text)}</div>
            <div class="message-time">${new Date(msg.timestamp?.toDate?.() || msg.timestamp).toLocaleTimeString()}</div>
        </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = $('chatInput');
    const text = input.value.trim();
    
    if (!text || !currentChatEmpId) return;
    
    const message = {
        sender: 'admin',
        text,
        timestamp: serverTimestamp()
    };
    
    try {
        const chatRef = doc(db, "chats", currentChatEmpId);
        const snap = await getDoc(chatRef);
        
        if (snap.exists()) {
            await updateDoc(chatRef, {
                messages: arrayUnion(message),
                updatedAt: serverTimestamp()
            });
        } else {
            await setDoc(chatRef, {
                messages: [message],
                employeeId: currentChatEmpId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        input.value = '';
        
    } catch (error) {
        showToast('Error sending message', 'error');
    }
}

// ==================== SETTINGS ====================
async function saveSettings() {
    const settings = {
        hrEmail: $('settingHrEmail').value.trim(),
        hrPhone: $('settingHrPhone').value.trim(),
        managerPhone: $('settingManagerPhone').value.trim(),
        supervisorPhone: $('settingSupervisorPhone').value.trim(),
        safetyPhone: $('settingSafetyPhone').value.trim(),
        shopUrl: $('settingShopUrl').value.trim()
    };
    
    try {
        await setDoc(doc(db, "portal", "public"), {
            help: {
                email: settings.hrEmail,
                phone: settings.hrPhone,
                text: "We're here to help. Choose an option below and we'll get you taken care of."
            },
            site: {
                managerPhone: settings.managerPhone,
                supervisorPhone: settings.supervisorPhone,
                safetyPhone: settings.safetyPhone
            },
            footwear: {
                shopUrl: settings.shopUrl
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        showToast('Settings saved successfully!', 'success');
        
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ==================== INICIALIZACIÓN ====================
export function initAdminApp() {
    console.log('🚀 Initializing Admin Portal...');
    
    // Navigation
    initNavigation();
    
    // Dashboard
    loadDashboard();
    
    // Employee Management
    $('btnAddEmployee')?.addEventListener('click', addEmployee);
    
    // Profiles
    $('btnLoadProfile')?.addEventListener('click', loadProfile);
    $('btnSaveProfile')?.addEventListener('click', saveProfile);
    
    // Appointments
    $('btnLoadAppt')?.addEventListener('click', loadAppointment);
    $('btnSaveAppt')?.addEventListener('click', saveAppointment);
    $('btnClearAppt')?.addEventListener('click', clearAppointment);
    
    // Notifications
    loadNotificationTargets();
    $('btnSendNotif')?.addEventListener('click', sendNotification);
    
    // Chat
    initChat();
    
    // Settings
    $('btnSaveSettings')?.addEventListener('click', saveSettings);
    
    // Logout
    $('btnLogout')?.addEventListener('click', () => {
        window.location.href = './index.html';
    });
    
    console.log('✅ Admin Portal initialized');
}
