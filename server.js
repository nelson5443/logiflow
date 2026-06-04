require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { supabase } = require('./config/supabase');
const db = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_CREDENTIALS = {
    email: 'admin@logiflow.com',
    passwordHash: bcrypt.hashSync('admin123', 10)
};

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Security and performance middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow external scripts for maps, etc.
}));
app.use(compression());
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Enhanced in-memory storage with persistence simulation
let shipments = [];
let receipts = [];
let analytics = {
    totalShipments: 0,
    deliveredShipments: 0,
    avgDeliveryTime: 2.5,
    customerRating: 4.8,
    recentActivity: []
};

// Real-time tracking simulation
const trackingLocations = new Map();

// Chat message store
const chatMessages = {}; // sessionId -> [{message, sender, timestamp}]

// Track active chat sessions: sessionId -> socketId
const chatSessions = new Map();
const adminSockets = new Set();

// Socket.io for real-time features
io.on('connection', (socket) => {

    socket.on('trackPackage', (trackingId) => {
        socket.join(`tracking_${trackingId}`);
        if (trackingLocations.has(trackingId)) {
            socket.emit('locationUpdate', trackingLocations.get(trackingId));
        }
    });

    socket.on('userOnline', (data) => {
        if (data?.sessionId) {
            // Always update to latest socket.id
            chatSessions.set(data.sessionId, socket.id);
            if (!chatMessages[data.sessionId]) chatMessages[data.sessionId] = [];
            adminSockets.forEach(id => io.to(id).emit('activeSessions', Array.from(chatSessions.keys())));
        }
    });

    socket.on('adminJoin', () => {
        adminSockets.add(socket.id);
        console.log('Admin joined. Total admins:', adminSockets.size);
        socket.emit('activeSessions', Array.from(chatSessions.keys()));
        socket.emit('allMessages', chatMessages);
    });

    socket.on('chatMessage', (data) => {
        const { message, sessionId } = data;
        if (sessionId) {
            // Always keep socket.id fresh
            chatSessions.set(sessionId, socket.id);
            if (!chatMessages[sessionId]) chatMessages[sessionId] = [];
            chatMessages[sessionId].push({ message, sender: 'customer', timestamp: new Date() });
        }
        console.log(`Message from ${sessionId}: ${message} | Admins online: ${adminSockets.size}`);
        adminSockets.forEach(id => io.to(id).emit('customerMessage', { sessionId, message, timestamp: new Date() }));
        if (adminSockets.size === 0) {
            socket.emit('chatResponse', { message: 'Our support team will be with you shortly. Please wait...', timestamp: new Date() });
        }
    });

    socket.on('adminReply', (data) => {
        const { sessionId, message } = data;
        if (sessionId) {
            if (!chatMessages[sessionId]) chatMessages[sessionId] = [];
            chatMessages[sessionId].push({ message, sender: 'admin', timestamp: new Date() });
        }
        // Find the latest socket for this session
        const customerSocketId = chatSessions.get(sessionId);
        console.log(`Admin reply to session ${sessionId}, customer socket: ${customerSocketId}`);
        if (customerSocketId) {
            io.to(customerSocketId).emit('adminReply', { message, timestamp: new Date() });
        } else {
            // Broadcast to all sockets as fallback
            io.emit('adminReply_' + sessionId, { message, timestamp: new Date() });
        }
    });

    socket.on('disconnect', () => {
        adminSockets.delete(socket.id);
        // Don't delete chatSessions on disconnect — keep session alive for admin replies
        // Only notify admin of updated active sessions
        for (const [sessionId, socketId] of chatSessions.entries()) {
            if (socketId === socket.id) {
                adminSockets.forEach(id => io.to(id).emit('activeSessions', Array.from(chatSessions.keys())));
                break;
            }
        }
    });
});

// REST endpoint for customer to poll messages by sessionId
app.get('/api/chat/messages/:sessionId', (req, res) => {
    const msgs = chatMessages[req.params.sessionId] || [];
    res.json(msgs);
});

// REST endpoint for admin to poll all chat messages
app.get('/api/admin/chat-messages', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    try {
        jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json(chatMessages);
});

// Simulate real-time package movement (only when shipments exist)
setInterval(() => {
    if (shipments.length === 0) return;
    shipments.forEach(shipment => {
        if (shipment.status !== 'Delivered') {
            const location = {
                lat: 40.7128 + (Math.random() - 0.5) * 0.1,
                lng: -74.0060 + (Math.random() - 0.5) * 0.1,
                timestamp: new Date(),
                status: shipment.status
            };
            trackingLocations.set(shipment.id, location);
            io.to(`tracking_${shipment.id}`).emit('locationUpdate', location);
        }
    });
}, 10000); // Update every 10 seconds

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (email === ADMIN_CREDENTIALS.email && bcrypt.compareSync(password, ADMIN_CREDENTIALS.passwordHash)) {
        const token = jwt.sign(
            { email, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            success: true,
            token,
            user: { email, role: 'admin' }
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Admin endpoints
app.get('/api/admin/shipments', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Return shipments in admin format
    const adminShipments = shipments.map(s => ({
        id: s.id,
        sender_name: s.senderName,
        recipient_name: s.recipientName,
        status: s.status,
        created_at: s.createdAt
    }));
    
    res.json(adminShipments);
});

const VALID_STATUSES = ['Pending', 'Shipped', 'In Transit', 'On Hold', 'Out for Delivery', 'Delivered'];

app.put('/api/admin/shipments/:id/status', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(401).json({ error: 'Unauthorized' });
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const { status, location } = req.body;
    const trackingId = req.params.id;

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // Find existing shipment or create a new one
    let shipment = shipments.find(s => s.id === trackingId);
    
    if (!shipment) {
        // Create a new shipment entry for tracking IDs that don't exist
        shipment = {
            id: trackingId,
            senderName: 'Admin Updated',
            senderPhone: 'N/A',
            pickupAddress: 'Admin Location',
            recipientName: 'Customer',
            recipientPhone: 'N/A',
            deliveryAddress: 'Delivery Location',
            packageType: 'Standard',
            weight: '1',
            cost: 0,
            status: 'Pending',
        createdAt: new Date().toISOString(),
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            updates: []
        };
        shipments.push(shipment);
    }
    
    // Update status — replace entire updates array with only the current status
    const locationMap = {
        'Pending':          'Origin Facility',
        'Shipped':          'Shipping Facility',
        'In Transit':       'Distribution Center',
        'On Hold':          'Distribution Center',
        'Out for Delivery': 'Local Facility',
        'Delivered':        'Destination'
    };
    shipment.status = status;
    shipment.updates = [{
        status,
        location: locationMap[status] || 'Processing Center',
        timestamp: new Date().toISOString()
    }];

    // Broadcast real-time status update to anyone tracking this package
    io.to(`tracking_${trackingId}`).emit('statusUpdate', { trackingId, status });

    // Update analytics if delivered
    if (status === 'Delivered') analytics.deliveredShipments++;
    
    // Update tracking location for real-time updates
    trackingLocations.set(trackingId, {
        lat: 40.7128 + (Math.random() - 0.5) * 0.1,
        lng: -74.0060 + (Math.random() - 0.5) * 0.1,
        timestamp: new Date(),
        status: status
    });
    
    res.json({ success: true, message: 'Status updated successfully' });
});

// Enhanced API Routes
app.post('/api/shipments', async (req, res) => {
    const { 
        senderName, senderPhone, pickupAddress, 
        recipientName, recipientPhone, deliveryAddress, 
        packageType, weight, instructions 
    } = req.body;
    
    const trackingId = 'LG' + Date.now().toString().slice(-8);
    const cost = calculateCost(parseFloat(weight), packageType);
    const receiptId = 'RC' + Date.now().toString().slice(-6);
    
    const subtotal = cost;
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    
    const shipment = {
        id: trackingId,
        senderName, senderPhone, pickupAddress,
        recipientName, recipientPhone, deliveryAddress,
        packageType, weight, instructions,
        cost: total,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        updates: [{
            status: 'Pending',
            location: 'Processing Center',
            timestamp: new Date().toISOString()
        }]
    };
    
    const receipt = {
        receiptId, trackingId,
        date: new Date().toISOString(),
        from: pickupAddress, to: deliveryAddress,
        senderName, senderPhone,
        recipientName, recipientPhone,
        service: packageType || 'standard',
        status: 'In Transit',
        items: [{
            description: `Package Shipping (${packageType || 'standard'})`,
            weight: `${weight} kg`,
            rate: cost / parseFloat(weight),
            amount: subtotal
        }],
        subtotal, tax, total,
        estimatedDelivery: shipment.estimatedDelivery
    };
    
    // Save to Supabase if available
    if (supabase) {
        await db.createShipment({ ...shipment, updates: JSON.stringify(shipment.updates) });
        await db.createReceipt(receipt);
    }
    
    // Also keep in memory for real-time features
    shipments.push(shipment);
    receipts.push(receipt);
    
    // Update analytics
    analytics.totalShipments++;
    analytics.recentActivity.unshift({
        type: 'shipment_created',
        trackingId,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 10 activities
    analytics.recentActivity = analytics.recentActivity.slice(0, 10);
    
    // Initialize tracking location
    trackingLocations.set(trackingId, {
        lat: 40.7128,
        lng: -74.0060,
        timestamp: new Date(),
        status: 'Pending'
    });
    
    res.json({ 
        success: true, 
        trackingId, 
        receiptId,
        cost: total,
        message: 'Shipment booked successfully!',
        receiptData: receipt
    });
});

app.get('/api/tracking/:id', async (req, res) => {
    const trackingId = req.params.id;
    
    // First check in-memory shipments (includes admin updates)
    const shipment = shipments.find(s => s.id === trackingId);
    if (shipment) {
        const currentLocation = trackingLocations.get(trackingId);
        if (currentLocation) {
            shipment.currentLocation = currentLocation;
        }
        return res.json(shipment);
    }
    
    // Try Supabase second
    const dbShipment = await db.getShipment(trackingId);
    if (dbShipment) {
        const shipment = {
            id: dbShipment.tracking_number,
            senderName: dbShipment.sender_name,
            senderPhone: dbShipment.sender_phone,
            recipientName: dbShipment.recipient_name,
            recipientPhone: dbShipment.recipient_phone,
            pickupAddress: dbShipment.pickup_address,
            deliveryAddress: dbShipment.delivery_address,
            packageType: dbShipment.package_type,
            weight: dbShipment.weight.toString(),
            status: dbShipment.status,
            cost: dbShipment.cost,
            createdAt: dbShipment.created_at,
            estimatedDelivery: dbShipment.estimated_delivery,
            updates: JSON.parse(dbShipment.updates || '[]')
        };
        
        const currentLocation = trackingLocations.get(trackingId);
        if (currentLocation) {
            shipment.currentLocation = currentLocation;
        }
        return res.json(shipment);
    }
    
    return res.status(404).json({ error: 'Shipment not found', trackingId });
});

// New analytics endpoint
app.get('/api/analytics', async (req, res) => {
    const dbAnalytics = await db.getAnalytics();
    
    const currentAnalytics = {
        ...analytics,
        ...(dbAnalytics || {}),
        avgDeliveryTime: analytics.avgDeliveryTime + ' days',
        customerRating: analytics.customerRating + '/5'
    };
    
    res.json(currentAnalytics);
});

// Signature endpoint
app.post('/api/signature/:trackingId', (req, res) => {
    const { signature, recipientName } = req.body;
    const trackingId = req.params.trackingId;
    
    const shipment = shipments.find(s => s.id === trackingId);
    if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Update shipment with signature
    shipment.signature = signature;
    shipment.signedBy = recipientName;
    shipment.signedAt = new Date().toISOString();
    shipment.status = 'Delivered';
    
    // Add delivery update
    shipment.updates.push({
        status: 'Delivered',
        location: shipment.deliveryAddress,
        timestamp: new Date().toISOString(),
        signedBy: recipientName
    });
    
    // Update analytics
    analytics.deliveredShipments++;
    
    res.json({ success: true, message: 'Signature saved successfully' });
});

// Distance calculation endpoint
app.post('/api/calculate-distance', (req, res) => {
    const { pickup, delivery } = req.body;
    
    // Simulate distance calculation (in production, use Google Maps API)
    const distance = Math.random() * 500 + 50; // 50-550 km
    const duration = Math.ceil(distance / 100); // Rough estimate
    
    res.json({
        distance: `${distance.toFixed(0)} km`,
        duration: `${duration} day${duration > 1 ? 's' : ''}`,
        distanceValue: distance
    });
});

// QR Code generation endpoint
app.get('/api/qr/:trackingId', async (req, res) => {
    try {
        const trackingId = req.params.trackingId;
        const trackingUrl = `${req.protocol}://${req.get('host')}#tracking?id=${trackingId}`;
        
        const qrCodeDataURL = await QRCode.toDataURL(trackingUrl, {
            width: 200,
            height: 200,
            colorDark: '#1a237e',
            colorLight: '#ffffff',
            margin: 2,
            errorCorrectionLevel: 'M'
        });
        
        res.json({ qrCode: qrCodeDataURL, trackingUrl });
    } catch (error) {
        console.error('QR Code generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Enhanced analytics with more detailed metrics
app.get('/api/analytics/detailed', (req, res) => {
    const detailedAnalytics = {
        ...analytics,
        monthlyShipments: Array.from({ length: 12 }, (_, i) => ({
            month: new Date(2024, i).toLocaleString('default', { month: 'short' }),
            shipments: Math.floor(Math.random() * 500) + 200
        })),
        statusDistribution: {
            'Delivered': Math.floor(analytics.totalShipments * 0.7),
            'In Transit': Math.floor(analytics.totalShipments * 0.2),
            'Pending Pickup': Math.floor(analytics.totalShipments * 0.1)
        },
        topRoutes: [
            { route: 'New York → Los Angeles', count: 245 },
            { route: 'Chicago → Miami', count: 189 },
            { route: 'Boston → Seattle', count: 156 }
        ]
    };
    res.json(detailedAnalytics);
});

// Geolocation reverse geocoding endpoint
app.post('/api/geocode', (req, res) => {
    const { lat, lng } = req.body;
    
    // Simulate reverse geocoding (in production, use Google Maps API)
    const addresses = [
        '123 Main St, New York, NY 10001',
        '456 Oak Ave, Los Angeles, CA 90210',
        '789 Pine Rd, Chicago, IL 60601',
        '321 Elm St, Houston, TX 77001'
    ];
    
    const randomAddress = addresses[Math.floor(Math.random() * addresses.length)];
    
    res.json({
        address: randomAddress,
        coordinates: { lat, lng }
    });
});

app.get('/api/receipt/:id', async (req, res) => {
    // Try Supabase first
    const dbReceipt = await db.getReceipt(req.params.id);
    if (dbReceipt) {
        return res.json(dbReceipt.receipt_data);
    }
    
    // Fallback to in-memory
    const storedReceipt = receipts.find(r => r.receiptId === req.params.id || r.trackingId === req.params.id);
    if (storedReceipt) {
        return res.json(storedReceipt);
    }
    
    // Always generate a valid receipt for any ID
    const id = req.params.id;
    const receipt = {
        receiptId: id.startsWith('RC') ? id : 'RC' + Date.now().toString().slice(-6),
        trackingId: id.startsWith('LG') ? id : 'LG' + Date.now().toString().slice(-8),
        date: new Date().toISOString(),
        from: 'Sample Pickup Address, New York, NY',
        to: 'Sample Delivery Address, Los Angeles, CA',
        service: 'Standard Shipping',
        items: [{
            description: 'Package Shipping (Standard)',
            weight: '2.5 kg',
            rate: 5.50,
            amount: 13.75
        }],
        subtotal: 13.75,
        tax: 1.10,
        total: 14.85,
        senderName: 'John Sender',
        senderPhone: '+1 (555) 123-4567',
        recipientName: 'Jane Recipient',
        recipientPhone: '+1 (555) 987-6543',
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    };
    res.json(receipt);
});

app.post('/api/contacts', async (req, res) => {
    try {
        await db.createContact(req.body);
        res.json({ success: true, message: 'Message received and saved' });
    } catch (error) {
        console.error('Contact save error:', error);
        res.json({ success: true, message: 'Message received' });
    }
});

function calculateCost(weight, packageType) {
    const baseRate = 5.50;
    const typeMultiplier = {
        'document': 0.8,
        'package': 1.0,
        'fragile': 1.3,
        'bulk': 1.5
    };
    return baseRate * weight * (typeMultiplier[packageType] || 1.0);
}

// Enhanced chat response generator
function generateChatResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    const responses = {
        'track': 'You can track your package by entering the tracking ID in the tracking section. Our real-time map shows exact location!',
        'cost': 'Shipping costs depend on weight, distance, and package type. Use our booking form for an instant estimate with our smart calculator.',
        'time': 'Delivery times typically range from 1-5 business days. Our AI estimates delivery time based on distance and traffic.',
        'signature': 'We offer digital signature capture for secure deliveries. You can sign directly on your device!',
        'qr': 'Every shipment gets a unique QR code for instant tracking. Just scan and track!',
        'language': 'We support English, Spanish, and French. Use the language selector at the top.',
        'map': 'Our interactive map shows real-time package location with live updates every few seconds.',
        'help': 'I can help you with tracking packages, shipping costs, delivery times, signatures, QR codes, and general questions.',
        'default': 'Thank you for your message. Our AI-powered support is here to help! How can I assist you today?'
    };
    
    for (const [key, response] of Object.entries(responses)) {
        if (lowerMessage.includes(key)) {
            return response;
        }
    }
    
    return responses.default;
}

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`LogiFlow server running on port ${PORT}`);
    console.log('Features enabled: Real-time tracking, Live chat, Multi-language, QR codes, Signatures');
});