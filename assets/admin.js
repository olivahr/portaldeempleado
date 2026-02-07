// SunPower Admin Portal - Complete Administration System
import { db, isFirebaseConfigured } from "./firebase.js";
import { uiToast } from "./ui.js";
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, query, where, getDocs, onSnapshot,
    serverTimestamp, orderBy, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ==================== CONFIGURATION ====================
const EMP_ID_RANGE = { min: 23, max: 200 };
const AUTO_CREATE_ALLOWED = true;

// ==================== STATE ====================
let currentAdmin = null;
let currentSection = 'dashboard';
let selectedChatEmployee = null;

// ==================== UTILITIES ====================
function normalizeEmpId(input) {
    if (!input) return "";
    let v = input.toString().toUpperCase().trim();
    v = v.replace(/[\\s-_]/g, "");
    if (!v.startsWith("SP")) return "";
    const nums = v.slice(2);
    if (!/^\\d+$/.test(nums)) return "";
    return "SP" + nums.padStart(3, '0');
}

function empIdToNumber(empId) {
    const m = String(empId || "").toUpperCase().match(/^SP(\\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ==================== NAVIGATION ====================
function initNavigation() {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            showSection(section);
            
            document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${sectionId}`).classList.remove('hidden');
    currentSection = sectionId;
    
    // Load section data
    if (sectionId === 'employees') loadEmployeeList();
    if (sectionId === 'chat') loadChatEmployees();
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'notifications') loadNotificationHistory();
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    if (!isFirebaseConfigured()) return;
    
    try {
        const allowedSnap = await getDocs(collection(db, "allowedEmployees"));
        const total = allowedSnap.size;
        let active = 0;
        
        allowedSnap.forEach(doc => {
            if (doc.data().active !== false) active++;
        });
        
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-active').textContent = active;
        document.getElementById('stat-pending').textContent = Math.max(0, total - active);
    } catch (e) {
        console.error("Dashboard error:", e);
    }
}

// ==================== EMPLOYEE ID MANAGEMENT ====================
async function loadEmployeeList() {
    const container = document.getElementById('employeeList');
    container.innerHTML = '<div style="color: #6b7280;">Loading...</div>';
    
    if (!isFirebaseConfigured()) {
        container.innerHTML = '<div style="color: #6b7280;">Preview mode - Firebase not connected</div>';
        return;
    }
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snap.forEach(doc => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        
        employees.sort((a, b) => empIdToNumber(a.id) - empIdToNumber(b.id));
        
        if (employees.length === 0) {
            container.innerHTML = '<div style="color: #6b7280; padding: 20px;">No employees registered yet</div>';
            return;
        }
        
        container.innerHTML = employees.map(emp => `
            <div class="employee-item">
                <div class="employee-info">
                    <div class="employee-id">${emp.id}</div>
                    <div class="employee-name">${emp.name || 'No name set'}</div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="status-badge ${emp.active !== false ? 'status-active' : 'status-inactive'}">
                        ${emp.active !== false ? 'Active' : 'Inactive'}
                    </span>
                    <button class="btn-danger" onclick="toggleEmployeeStatus('${emp.id}', ${emp.active !== false})">
                        ${emp.active !== false ? 'Deactivate' : 'Activate'}
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (e) {
        container.innerHTML = `<div style="color: #dc2626;">Error: ${e.message}</div>`;
    }
}

async function addEmployee() {
    const idInput = document.getElementById('newEmpId');
    const nameInput = document.getElementById('newEmpName');
    
    const empId = normalizeEmpId(idInput.value);
    const name = nameInput.value.trim();
    
    if (!empId) {
        uiToast('Invalid Employee ID format. Use SP### format');
        return;
    }
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Firebase not connected');
        return;
    }
    
    try {
        const empRef = doc(db, "allowedEmployees", empId);
        const existing = await getDoc(empRef);
        
        if (existing.exists()) {
            uiToast('Employee ID already exists');
            return;
        }
        
        await setDoc(empRef, {
            active: true,
            name: name,
            createdAt: serverTimestamp(),
            createdBy: currentAdmin?.uid || 'admin'
        });
        
        // Create empty employee record
        const recordRef = doc(db, "employeeRecords", empId);
        await setDoc(recordRef, {
            employeeId: empId,
            createdAt: serverTimestamp(),
            appointment: {},
            profile: {},
            notifications: [],
            payroll: [],
            hours: [],
            timeOffRequests: [],
            deposit: {},
            contacts: {}
        });
        
        uiToast(`Employee ${empId} added successfully`);
        idInput.value = '';
        nameInput.value = '';
        loadEmployeeList();
        
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

window.toggleEmployeeStatus = async function(empId, currentActive) {
    if (!isFirebaseConfigured()) return;
    
    try {
        const ref = doc(db, "allowedEmployees", empId);
        await updateDoc(ref, {
            active: !currentActive,
            updatedAt: serverTimestamp()
        });
        
        uiToast(`Employee ${empId} ${!currentActive ? 'activated' : 'deactivated'}`);
        loadEmployeeList();
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
};

// ==================== EMPLOYEE PROFILES ====================
let currentProfileEmpId = null;

async function loadProfile() {
    const empId = normalizeEmpId(document.getElementById('searchProfileId').value);
    
    if (!empId) {
        uiToast('Invalid Employee ID');
        return;
    }
    
    currentProfileEmpId = empId;
    
    if (!isFirebaseConfigured()) {
        document.getElementById('profileEditor').classList.remove('hidden');
        return;
    }
    
    try {
        const recordRef = doc(db, "employeeRecords", empId);
        const snap = await getDoc(recordRef);
        
        const data = snap.exists() ? snap.data() : {};
        const profile = data.profile || {};
        
        document.getElementById('profileFirstName').value = profile.firstName || '';
        document.getElementById('profileLastName').value = profile.lastName || '';
        document.getElementById('profileDOB').value = profile.dob || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileAddress').value = profile.address || '';
        document.getElementById('profileCity').value = profile.city || '';
        document.getElementById('profileStateZip').value = profile.stateZip || '';
        document.getElementById('profileEmergencyName').value = profile.emergencyName || '';
        document.getElementById('profileEmergencyPhone').value = profile.emergencyPhone || '';
        
        document.getElementById('profileEditor').classList.remove('hidden');
        
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

async function saveProfile() {
    if (!currentProfileEmpId) return;
    
    const profile = {
        firstName: document.getElementById('profileFirstName').value.trim(),
        lastName: document.getElementById('profileLastName').value.trim(),
        dob: document.getElementById('profileDOB').value,
        phone: document.getElementById('profilePhone').value.trim(),
        address: document.getElementById('profileAddress').value.trim(),
        city: document.getElementById('profileCity').value.trim(),
        stateZip: document.getElementById('profileStateZip').value.trim(),
        emergencyName: document.getElementById('profileEmergencyName').value.trim(),
        emergencyPhone: document.getElementById('profileEmergencyPhone').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Profile not saved');
        return;
    }
    
    try {
        const ref = doc(db, "employeeRecords", currentProfileEmpId);
        await updateDoc(ref, { profile });
        
        // Also update in users collection if exists
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentProfileEmpId));
        const userSnap = await getDocs(usersQuery);
        
        userSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                fullName: `${profile.firstName} ${profile.lastName}`.trim(),
                updatedAt: serverTimestamp()
            });
        });
        
        uiToast('Profile saved successfully');
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

// ==================== APPOINTMENTS ====================
let currentApptEmpId = null;

async function loadAppointment() {
    const empId = normalizeEmpId(document.getElementById('apptEmpId').value);
    
    if (!empId) {
        uiToast('Invalid Employee ID');
        return;
    }
    
    currentApptEmpId = empId;
    
    if (!isFirebaseConfigured()) {
        document.getElementById('apptEditor').classList.remove('hidden');
        return;
    }
    
    try {
        const ref = doc(db, "employeeRecords", empId);
        const snap = await getDoc(ref);
        
        const data = snap.exists() ? snap.data() : {};
        const appt = data.appointment || {};
        
        document.getElementById('apptDate').value = appt.date || '';
        document.getElementById('apptTime').value = appt.time || '';
        document.getElementById('apptAddress').value = appt.address || '';
        document.getElementById('apptNotes').value = appt.notes || '';
        
        document.getElementById('apptEditor').classList.remove('hidden');
        
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

async function saveAppointment() {
    if (!currentApptEmpId) return;
    
    const appointment = {
        date: document.getElementById('apptDate').value,
        time: document.getElementById('apptTime').value,
        address: document.getElementById('apptAddress').value.trim(),
        notes: document.getElementById('apptNotes').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Appointment not saved');
        return;
    }
    
    try {
        // Save to employeeRecords
        const recordRef = doc(db, "employeeRecords", currentApptEmpId);
        await updateDoc(recordRef, { appointment });
        
        // Also save to user's document for display
        const usersQuery = query(collection(db, "users"), where("employeeId", "==", currentApptEmpId));
        const userSnap = await getDocs(usersQuery);
        
        userSnap.forEach(async (userDoc) => {
            await updateDoc(doc(db, "users", userDoc.id), {
                appointment,
                updatedAt: serverTimestamp()
            });
        });
        
        uiToast('Appointment saved successfully');
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

// ==================== NOTIFICATIONS ====================
async function sendNotification() {
    const target = document.getElementById('notifTarget').value.trim().toUpperCase();
    const type = document.getElementById('notifType').value;
    const title = document.getElementById('notifTitle').value.trim();
    const body = document.getElementById('notifBody').value.trim();
    const action = document.getElementById('notifAction').value.trim() || 'View Details';
    const route = document.getElementById('notifRoute').value.trim() || 'home';
    
    if (!title || !body) {
        uiToast('Title and message are required');
        return;
    }
    
    const notification = {
        id: generateId(),
        type,
        title,
        body,
        action,
        route,
        createdAt: serverTimestamp(),
        read: false,
        sentBy: currentAdmin?.uid || 'admin'
    };
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Notification not sent');
        return;
    }
    
    try {
        if (target === 'ALL') {
            // Send to all employees
            const employeesSnap = await getDocs(collection(db, "allowedEmployees"));
            const batch = [];
            
            employeesSnap.forEach(empDoc => {
                if (empDoc.data().active !== false) {
                    const empId = empDoc.id;
                    const recordRef = doc(db, "employeeRecords", empId);
                    batch.push(updateDoc(recordRef, {
                        notifications: arrayUnion(notification)
                    }));
                }
            });
            
            await Promise.all(batch);
            uiToast(`Notification sent to all employees`);
            
        } else {
            // Send to specific employee
            const empId = normalizeEmpId(target);
            if (!empId) {
                uiToast('Invalid Employee ID');
                return;
            }
            
            const recordRef = doc(db, "employeeRecords", empId);
            await updateDoc(recordRef, {
                notifications: arrayUnion(notification)
            });
            
            uiToast(`Notification sent to ${empId}`);
        }
        
        // Clear form
        document.getElementById('notifTitle').value = '';
        document.getElementById('notifBody').value = '';
        loadNotificationHistory();
        
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

// Helper for arrayUnion
function arrayUnion(...elements) {
    return { operation: 'arrayUnion', elements };
}

async function loadNotificationHistory() {
    const container = document.getElementById('notifHistory');
    
    if (!isFirebaseConfigured()) {
        container.innerHTML = '<div style="color: #6b7280;">Preview mode</div>';
        return;
    }
    
    try {
        // Get recent notifications from all employees (limited)
        container.innerHTML = '<div style="color: #6b7280;">Loading history...</div>';
    } catch (e) {
        container.innerHTML = `<div style="color: #dc2626;">Error loading history</div>`;
    }
}

// ==================== CHAT SYSTEM ====================
async function loadChatEmployees() {
    const select = document.getElementById('chatEmployeeSelect');
    select.innerHTML = '<option value="">Choose employee...</option>';
    
    if (!isFirebaseConfigured()) return;
    
    try {
        const snap = await getDocs(collection(db, "allowedEmployees"));
        const employees = [];
        
        snap.forEach(doc => {
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
        
    } catch (e) {
        console.error("Error loading chat employees:", e);
    }
}

function initChat() {
    const select = document.getElementById('chatEmployeeSelect');
    const messagesDiv = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('btnSendChat');
    
    select.addEventListener('change', async (e) => {
        const empId = e.target.value;
        if (!empId) {
            messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">Select an employee to view conversation</div>';
            selectedChatEmployee = null;
            return;
        }
        
        selectedChatEmployee = empId;
        loadChatMessages(empId);
    });
    
    sendBtn.addEventListener('click', sendChatMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

async function loadChatMessages(empId) {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af;">Loading messages...</div>';
    
    if (!isFirebaseConfigured()) {
        messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af;">Preview mode - Chat not available</div>';
        return;
    }
    
    try {
        const chatRef = doc(db, "chats", empId);
        const snap = await getDoc(chatRef);
        
        const messages = snap.exists() ? (snap.data().messages || []) : [];
        
        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">No messages yet. Start the conversation!</div>';
            return;
        }
        
        messagesDiv.innerHTML = messages.map(msg => `
            <div class="message ${msg.sender === 'admin' ? 'message-admin' : 'message-employee'}">
                <div style="font-size: 12px; opacity: 0.8; margin-bottom: 4px;">
                    ${msg.sender === 'admin' ? 'You' : 'Employee'} • ${new Date(msg.timestamp?.toDate?.() || msg.timestamp).toLocaleString()}
                </div>
                <div>${escapeHtml(msg.text)}</div>
            </div>
        `).join('');
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
    } catch (e) {
        messagesDiv.innerHTML = `<div style="color: #dc2626;">Error loading messages</div>`;
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text || !selectedChatEmployee) return;
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Message not sent');
        return;
    }
    
    try {
        const chatRef = doc(db, "chats", selectedChatEmployee);
        const snap = await getDoc(chatRef);
        
        const newMessage = {
            sender: 'admin',
            text,
            timestamp: serverTimestamp()
        };
        
        if (snap.exists()) {
            await updateDoc(chatRef, {
                messages: [...(snap.data().messages || []), newMessage],
                updatedAt: serverTimestamp()
            });
        } else {
            await setDoc(chatRef, {
                messages: [newMessage],
                employeeId: selectedChatEmployee,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        input.value = '';
        loadChatMessages(selectedChatEmployee);
        
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== COMPANY SETTINGS ====================
async function saveCompanySettings() {
    const settings = {
        hrEmail: document.getElementById('settingHrEmail').value.trim(),
        hrPhone: document.getElementById('settingHrPhone').value.trim(),
        managerPhone: document.getElementById('settingManagerPhone').value.trim(),
        supervisorPhone: document.getElementById('settingSupervisorPhone').value.trim(),
        safetyPhone: document.getElementById('settingSafetyPhone').value.trim(),
        shopUrl: document.getElementById('settingShopUrl').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    if (!isFirebaseConfigured()) {
        uiToast('Preview mode - Settings not saved');
        return;
    }
    
    try {
        const ref = doc(db, "portal", "public");
        await setDoc(ref, {
            help: {
                phone: settings.hrPhone,
                email: settings.hrEmail,
                text: "We're here to help. Choose an option below and we'll get you taken care of."
            },
            site: {
                managerPhone: settings.managerPhone,
                safetyPhone: settings.safetyPhone,
                supervisorPhone: settings.supervisorPhone,
                address: ""
            },
            footwear: {
                programTitle: "Safety Footwear Program",
                shopUrl: settings.shopUrl
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        uiToast('Company settings saved');
    } catch (e) {
        uiToast(`Error: ${e.message}`);
    }
}

// ==================== INITIALIZATION ====================
export function initAdminApp() {
    // Initialize navigation
    initNavigation();
    initChat();
    
    // Wire up buttons
    document.getElementById('btnAddEmployee')?.addEventListener('click', addEmployee);
    document.getElementById('btnLoadProfile')?.addEventListener('click', loadProfile);
    document.getElementById('btnSaveProfile')?.addEventListener('click', saveProfile);
    document.getElementById('btnLoadAppt')?.addEventListener('click', loadAppointment);
    document.getElementById('btnSaveAppt')?.addEventListener('click', saveAppointment);
    document.getElementById('btnSendNotif')?.addEventListener('click', sendNotification);
    document.getElementById('btnSaveSettings')?.addEventListener('click', saveCompanySettings);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        window.location.href = './index.html';
    });
    
    // Load initial data
    loadDashboard();
    
    console.log('✅ SunPower Admin Portal initialized');
}'''

