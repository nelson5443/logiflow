async function manualUpdateStatus() {
    const trackingId = document.getElementById('manualTrackingId').value.trim();
    const status = document.getElementById('manualStatus').value;
    const resultDiv = document.getElementById('manualUpdateResult');

    if (!trackingId) {
        resultDiv.innerHTML = '<p style="color:#f44336;">⚠️ Please enter a Tracking ID.</p>';
        return;
    }

    const token = localStorage.getItem('adminToken');
    try {
        const response = await fetch(`/api/admin/shipments/${trackingId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        if (result.success) {
            resultDiv.innerHTML = `<p style="color:#4caf50;">✅ <strong>${trackingId}</strong> updated to <strong>${status}</strong></p>`;
            document.getElementById('manualTrackingId').value = '';
            loadShipments();
        } else {
            resultDiv.innerHTML = `<p style="color:#f44336;">❌ Failed: ${result.error || 'Unknown error'}</p>`;
        }
    } catch (e) {
        resultDiv.innerHTML = '<p style="color:#f44336;">❌ Network error. Please try again.</p>';
    }
}

// Load shipments on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    loadShipments();
    initAdminChat();
});

function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        showLoginForm();
        return false;
    }
    return true;
}

function showLoginForm() {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5;">
            <div style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px;">
                <h2 style="text-align: center; margin-bottom: 1.5rem;">Admin Login</h2>
                <form id="loginForm">
                    <input type="email" id="email" placeholder="Email" required style="width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                    <input type="password" id="password" placeholder="Password" required style="width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 4px;">
                    <button type="submit" style="width: 100%; padding: 0.75rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Login</button>
                </form>
                <p style="text-align: center; margin-top: 1rem; font-size: 0.9rem; color: #666;">Default: admin@logiflow.com / admin123</p>
            </div>
        </div>
    `;
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const result = await response.json();
            
            if (result.token && result.user.role === 'admin') {
                localStorage.setItem('adminToken', result.token);
                localStorage.setItem('adminUser', JSON.stringify(result.user));
                location.reload();
            } else {
                alert('Invalid credentials or not an admin user');
            }
        } catch (error) {
            alert('Login failed. Please try again.');
        }
    });
}

async function loadShipments() {
    if (!checkAuth()) return;
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/admin/shipments', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            showLoginForm();
            return;
        }
        
        const shipments = await response.json();
        updateStats(shipments);
        displayShipments(shipments);
    } catch (error) {
        console.error('Error loading shipments:', error);
    }
}

const STATUSES = ['Pending', 'Shipped', 'In Transit', 'On Hold', 'Out for Delivery', 'Delivered'];

function updateStats(shipments) {
    const stats = {
        total: shipments.length,
        pending: shipments.filter(s => s.status === 'Pending').length,
        inTransit: shipments.filter(s => ['Shipped', 'In Transit', 'Out for Delivery'].includes(s.status)).length,
        delivered: shipments.filter(s => s.status === 'Delivered').length
    };
    
    document.getElementById('totalShipments').textContent = stats.total;
    document.getElementById('pendingShipments').textContent = stats.pending;
    document.getElementById('inTransitShipments').textContent = stats.inTransit;
    document.getElementById('deliveredShipments').textContent = stats.delivered;
}

function displayShipments(shipments) {
    const tbody = document.querySelector('#shipmentsTable tbody');
    
    tbody.innerHTML = shipments.map(shipment => `
        <tr id="row-${shipment.id}">
            <td>${shipment.id}</td>
            <td>${shipment.sender_name}</td>
            <td>${shipment.recipient_name}</td>
            <td><span class="tracking-status ${getStatusClass(shipment.status)}" id="status-badge-${shipment.id}">${shipment.status}</span></td>
            <td>${new Date(shipment.created_at).toLocaleDateString()}</td>
            <td>
                <div class="status-update-group">
                    <select id="status-select-${shipment.id}" class="status-select">
                        ${STATUSES.map(s => `<option value="${s}" ${s === shipment.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <button onclick="updateStatus('${shipment.id}')" class="btn btn-small btn-primary">
                        <i class="fas fa-save"></i> Update
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function updateStatus(shipmentId) {
    const select = document.getElementById(`status-select-${shipmentId}`);
    const newStatus = select.value;
    const token = localStorage.getItem('adminToken');

    try {
        const response = await fetch(`/api/admin/shipments/${shipmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await response.json();

        if (result.success) {
            const badge = document.getElementById(`status-badge-${shipmentId}`);
            badge.textContent = newStatus;
            badge.className = `tracking-status ${getStatusClass(newStatus)}`;
            showToast(`Status updated to "${newStatus}"`, 'success');
            loadShipments();
        } else {
            showToast('Failed to update status', 'error');
        }
    } catch (error) {
        console.error('Update error:', error);
        showToast('Error updating status', 'error');
    }
}

function showToast(message, type) {
    const existing = document.getElementById('adminToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.style.cssText = `position:fixed;top:80px;right:20px;padding:12px 20px;border-radius:8px;color:white;font-weight:bold;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);background:${type === 'success' ? '#4caf50' : '#f44336'};`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function getStatusClass(status) {
    const statusMap = {
        'Pending': 'status-pending',
        'Shipped': 'status-shipped',
        'In Transit': 'status-transit',
        'On Hold': 'status-hold',
        'Out for Delivery': 'status-delivery',
        'Delivered': 'status-delivered'
    };
    return statusMap[status] || 'status-pending';
}

// Logout function
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    location.reload();
}

// ── Admin Live Chat ──────────────────────────────────────────
let adminSocket = null;
let activeSessionId = null;
const chatHistory = {};
let unreadCount = 0;

function initAdminChat() {
    if (typeof io === 'undefined') return;

    adminSocket = io(window.location.origin, { forceNew: true });

    adminSocket.on('connect', () => {
        adminSocket.emit('adminJoin');
    });

    // Load all existing messages when admin joins
    adminSocket.on('allMessages', (allMsgs) => {
        Object.keys(allMsgs).forEach(sessionId => {
            chatHistory[sessionId] = allMsgs[sessionId].map(m => ({
                message: m.message,
                sender: m.sender,
                time: new Date(m.timestamp),
                read: false
            }));
        });
        renderSessionsList();
    });

    adminSocket.on('activeSessions', (sessions) => {
        sessions.forEach(id => {
            if (!chatHistory[id]) chatHistory[id] = [];
        });
        renderSessionsList();
    });

    adminSocket.on('customerMessage', (data) => {
        const { sessionId, message, timestamp } = data;
        if (!chatHistory[sessionId]) chatHistory[sessionId] = [];
        chatHistory[sessionId].push({ message, sender: 'customer', time: new Date(timestamp), read: false });
        renderSessionsList();
        if (sessionId === activeSessionId) {
            renderAdminChat(sessionId);
        } else {
            unreadCount++;
            updateUnreadBadge();
        }
    });

    // Poll every 3 seconds as fallback
    setInterval(pollMessages, 3000);
}

async function pollMessages() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
        const res = await fetch('/api/admin/chat-messages', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const allMsgs = await res.json();
        let updated = false;
        Object.keys(allMsgs).forEach(sessionId => {
            const serverMsgs = allMsgs[sessionId];
            const localMsgs = chatHistory[sessionId] || [];
            if (serverMsgs.length > localMsgs.length) {
                chatHistory[sessionId] = serverMsgs.map(m => ({
                    message: m.message,
                    sender: m.sender,
                    time: new Date(m.timestamp),
                    read: sessionId === activeSessionId
                }));
                updated = true;
                if (sessionId !== activeSessionId) {
                    unreadCount++;
                    updateUnreadBadge();
                }
            }
        });
        if (updated) {
            renderSessionsList();
            if (activeSessionId) renderAdminChat(activeSessionId);
        }
    } catch (e) {}
}

function renderSessionsList() {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    const sessions = Object.keys(chatHistory);
    if (!sessions.length) {
        list.innerHTML = '<p style="color:#999;font-size:0.9rem;">No active chats</p>';
        return;
    }
    list.innerHTML = sessions.map((id, index) => {
        const msgs = chatHistory[id];
        const last = msgs[msgs.length - 1];
        const isActive = id === activeSessionId;
        const hasUnread = msgs.some(m => m.sender === 'customer' && !m.read);
        return `<div onclick="selectSession('${id}')" style="padding:10px;border-radius:6px;cursor:pointer;margin-bottom:6px;background:${isActive ? '#1a237e' : 'white'};color:${isActive ? 'white' : '#333'};border:1px solid ${hasUnread && !isActive ? '#f44336' : '#ddd'};">  
            <div style="font-weight:bold;font-size:0.85rem;">&#128100; Customer ${index + 1} ${hasUnread && !isActive ? '<span style="background:#f44336;color:white;border-radius:50%;padding:1px 6px;font-size:0.75rem;margin-left:4px;">New</span>' : ''}</div>
            <div style="font-size:0.8rem;opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${last ? last.message : 'No messages yet'}</div>
        </div>`;
    }).join('');
}

function selectSession(sessionId) {
    activeSessionId = sessionId;
    // Mark messages as read
    if (chatHistory[sessionId]) {
        chatHistory[sessionId].forEach(m => m.read = true);
    }
    document.getElementById('adminChatHeader').textContent = 'Live Chat - Customer';
    document.getElementById('adminChatInput').disabled = false;
    document.getElementById('adminSendBtn').disabled = false;
    renderAdminChat(sessionId);
    renderSessionsList();
    unreadCount = 0;
    updateUnreadBadge();
}

function renderAdminChat(sessionId) {
    const msgs = chatHistory[sessionId] || [];
    const container = document.getElementById('adminChatMessages');
    if (!container) return;
    container.innerHTML = msgs.length ? msgs.map(m => `
        <div style="margin-bottom:10px;display:flex;justify-content:${m.sender === 'admin' ? 'flex-end' : 'flex-start'};">
            <div style="max-width:75%;padding:10px 14px;border-radius:15px;background:${m.sender === 'admin' ? '#1a237e' : '#e3f2fd'};color:${m.sender === 'admin' ? 'white' : '#333'};">
                <div style="font-size:0.75rem;opacity:0.7;margin-bottom:4px;">${m.sender === 'admin' ? 'You' : 'Customer'}</div>
                <div>${m.message}</div>
                <div style="font-size:0.7rem;opacity:0.6;margin-top:4px;">${m.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
            </div>
        </div>
    `).join('') : '<p style="color:#999;text-align:center;margin-top:20px;">No messages yet</p>';
    container.scrollTop = container.scrollHeight;
}

function sendAdminReply() {
    const input = document.getElementById('adminChatInput');
    const message = input.value.trim();
    if (!message || !activeSessionId || !adminSocket) return;
    adminSocket.emit('adminReply', { sessionId: activeSessionId, message });
    if (!chatHistory[activeSessionId]) chatHistory[activeSessionId] = [];
    chatHistory[activeSessionId].push({ message, sender: 'admin', time: new Date(), read: true });
    input.value = '';
    renderAdminChat(activeSessionId);
}

function handleAdminChatKey(e) {
    if (e.key === 'Enter') sendAdminReply();
}

function updateUnreadBadge() {
    const badge = document.getElementById('unreadBadge');
    if (!badge) return;
    if (unreadCount > 0) {
        badge.style.display = 'inline';
        badge.textContent = unreadCount;
    } else {
        badge.style.display = 'none';
    }
}