// Global variables
let map, trackingMarker, signaturePad, socket;
let chatOpen = false;
let mapsLoaded = false;
// Persist session ID across page reloads
let chatSessionId = localStorage.getItem('chatSessionId');
if (!chatSessionId) {
    chatSessionId = 'user_' + Date.now();
    localStorage.setItem('chatSessionId', chatSessionId);
}

// Initialize Google Maps
function initMaps() {
    mapsLoaded = true;
}

// Single Socket.IO init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    updateAnalytics();
    setInterval(updateAnalytics, 30000);

    if (typeof io !== 'undefined') {
        socket = io();

        socket.on('connect', () => {
            socket.emit('userOnline', { sessionId: chatSessionId });
            const messagesDiv = document.getElementById('chatMessages');
            if (messagesDiv && localChatHistory.length > 0) {
                messagesDiv.innerHTML = '';
                localChatHistory.forEach(m => renderChatMessage(m.message, m.sender));
            }
        });

        socket.on('locationUpdate', (location) => updateTrackingMap(location));
        socket.on('statusUpdate', (data) => {
            const currentInput = document.getElementById('trackingInput')?.value.trim();
            if (currentInput === data.trackingId) trackPackage();
        });
        // displayTrackingResult from features.js is superseded by showShipmentResult in script.js
        socket.on('chatResponse', (data) => addChatMessage(data.message, 'bot'));
        socket.on('adminReply', (data) => addChatMessage(data.message, 'bot'));

        // Poll server every 3 seconds for admin replies
        let lastAdminMsgCount = 0;
        setInterval(async () => {
            try {
                const res = await fetch(`/api/chat/messages/${chatSessionId}`);
                const msgs = await res.json();
                const adminMsgs = msgs.filter(m => m.sender === 'admin');
                if (adminMsgs.length > lastAdminMsgCount) {
                    const newMsgs = adminMsgs.slice(lastAdminMsgCount);
                    newMsgs.forEach(m => addChatMessage(m.message, 'bot'));
                    lastAdminMsgCount = adminMsgs.length;
                }
            } catch (e) {}
        }, 3000);
    }

    // Auto-track if URL has tracking parameter
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const trackingId = urlParams.get('id');
    if (trackingId) {
        document.getElementById('trackingInput').value = trackingId;
        setTimeout(() => trackPackage(), 1000);
    }
});

// Enhanced Geolocation Detection with error handling
function detectLocation(type) {
    const targetField = type === 'pickup' ? 'pickupAddress' : 'deliveryAddress';
    const button = event.target;
    const originalText = button.innerHTML;
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
    button.disabled = true;
    
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by this browser.');
        button.innerHTML = originalText;
        button.disabled = false;
        return;
    }
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000, // 15 seconds
        maximumAge: 60000 // 1 minute
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Use Google Maps Geocoding if available
            if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
                const geocoder = new google.maps.Geocoder();
                const latlng = { lat: lat, lng: lng };
                
                geocoder.geocode({ location: latlng }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        const address = results[0].formatted_address;
                        document.getElementById(targetField).value = address;
                        
                        button.innerHTML = '<i class="fas fa-check"></i> Located!';
                        button.style.background = '#4caf50';
                        
                        setTimeout(() => {
                            button.innerHTML = originalText;
                            button.style.background = '#ffc107';
                            button.disabled = false;
                        }, 2000);
                    } else {
                        // Fallback to coordinates
                        const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                        document.getElementById(targetField).value = address;
                        
                        button.innerHTML = '<i class="fas fa-check"></i> Coordinates Set';
                        button.style.background = '#ff9800';
                        
                        setTimeout(() => {
                            button.innerHTML = originalText;
                            button.style.background = '#ffc107';
                            button.disabled = false;
                        }, 2000);
                    }
                });
            } else {
                // Fallback: use coordinates directly
                const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                document.getElementById(targetField).value = address;
                
                button.innerHTML = '<i class="fas fa-check"></i> Coordinates Set';
                button.style.background = '#ff9800';
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.background = '#ffc107';
                    button.disabled = false;
                }, 2000);
            }
        },
        (error) => {
            let errorMessage = 'Location detection failed';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied. Please enable location permissions and try again.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable. Please check your GPS/network.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out. Please try again or enter address manually.';
                    break;
            }
            
            alert(errorMessage);
            button.innerHTML = '<i class="fas fa-times"></i> Failed';
            button.style.background = '#f44336';
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.background = '#ffc107';
                button.disabled = false;
            }, 2000);
        },
        options
    );
}



// Enhanced Package Tracking with Real-time Map
function displayTrackingResult(shipment) {
    const resultDiv = document.getElementById('trackingResult');
    const statusClass = getStatusClass(shipment.status);
    
    // Generate QR Code
    generateQRCode(shipment.id);
    
    // Initialize map with real-time tracking
    initTrackingMap(shipment);
    
    // Join real-time tracking room
    if (socket) {
        socket.emit('trackPackage', shipment.id);
    }
    
    const timeline = shipment.updates?.map(update => {
        const info = STATUS_INFO[update.status] || { location: update.location || 'Processing Center', description: '' };
        return `
        <div class="timeline-item">
            <div class="timeline-icon">
                <i class="fas fa-circle"></i>
            </div>
            <div class="timeline-content">
                <h5>${update.status}</h5>
                <p><strong>${info.location}</strong> — ${info.description}</p>
                <small>${new Date(update.timestamp).toLocaleString()}</small>
                ${update.signedBy ? `<small><i class="fas fa-signature"></i> Signed by: ${update.signedBy}</small>` : ''}
            </div>
        </div>`;
    }).join('') || '<p>No tracking updates available</p>';
    
    resultDiv.innerHTML = `
        <div class="tracking-info fade-in">
            <div class="tracking-header">
                <div class="tracking-id">
                    <span class="live-indicator"></span>Tracking ID: ${shipment.id}
                </div>
                <div class="tracking-status ${statusClass}">${shipment.status}</div>
            </div>
            <div class="tracking-details">
                <div class="detail-group">
                    <h4><i class="fas fa-user"></i> Sender Information</h4>
                    <p><strong>Name:</strong> ${shipment.senderName}</p>
                    <p><strong>Phone:</strong> ${shipment.senderPhone}</p>
                    <p><strong>Address:</strong> ${shipment.pickupAddress}</p>
                </div>
                <div class="detail-group">
                    <h4><i class="fas fa-user-check"></i> Recipient Information</h4>
                    <p><strong>Name:</strong> ${shipment.recipientName}</p>
                    <p><strong>Phone:</strong> ${shipment.recipientPhone}</p>
                    <p><strong>Address:</strong> ${shipment.deliveryAddress}</p>
                </div>
            </div>
            <div class="detail-group">
                <h4><i class="fas fa-box"></i> Package Details</h4>
                <p><strong>Type:</strong> ${shipment.packageType}</p>
                <p><strong>Weight:</strong> ${shipment.weight} kg</p>
                <p><strong>Cost:</strong> $${shipment.cost}</p>
                <p><strong>Created:</strong> ${new Date(shipment.createdAt).toLocaleString()}</p>
                ${shipment.estimatedDelivery ? `<p><strong>Est. Delivery:</strong> ${new Date(shipment.estimatedDelivery).toLocaleString()}</p>` : ''}
            </div>
            <div class="tracking-timeline">
                <h4><i class="fas fa-history"></i> Tracking Timeline</h4>
                ${timeline}
            </div>
            ${shipment.status !== 'Delivered' ? `
                <button onclick="openSignatureModal('${shipment.id}')" class="btn btn-primary">
                    <i class="fas fa-signature"></i> Add Delivery Signature
                </button>
            ` : ''}
            ${shipment.signature ? `
                <div class="signature-display">
                    <h4><i class="fas fa-check-circle"></i> Delivery Confirmed</h4>
                    <p>Signed by: ${shipment.signedBy} on ${new Date(shipment.signedAt).toLocaleString()}</p>
                    <img src="${shipment.signature}" alt="Delivery Signature" style="max-width: 200px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('trackingMap').style.display = 'block';
    document.getElementById('qrCodeSection').style.display = 'block';
}

// Enhanced Tracking Map with Real-time Updates
function initTrackingMap(shipment) {
    const mapDiv = document.getElementById('trackingMap');
    
    // Always show a map-like interface
    mapDiv.innerHTML = `
        <div style="background: linear-gradient(45deg, #e3f2fd, #bbdefb); border: 2px solid #2196f3; border-radius: 10px; padding: 20px; text-align: center; min-height: 300px; display: flex; flex-direction: column; justify-content: center;">
            <div style="background: white; border-radius: 50%; width: 80px; height: 80px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <i class="fas fa-truck" style="font-size: 2.5rem; color: #1a237e;"></i>
            </div>
            <h3 style="color: #1a237e; margin-bottom: 15px;">Package ${shipment.id}</h3>
            <div style="background: rgba(255,255,255,0.9); border-radius: 8px; padding: 15px; margin: 10px 0;">
                <p style="margin: 5px 0; font-weight: bold; color: #1a237e;">Status: ${shipment.status}</p>
                <p style="margin: 5px 0;">Current Location: ${(STATUS_INFO[shipment.status] || {}).location || (shipment.updates && shipment.updates.length ? shipment.updates[shipment.updates.length - 1]?.location : null) || 'Processing Center'}</p>
                <p style="margin: 5px 0;">Destination: ${shipment.deliveryAddress}</p>
                <p style="margin: 5px 0; font-size: 0.9rem; color: #666;">Last Update: ${new Date().toLocaleString()}</p>
            </div>
            <div style="margin-top: 15px;">
                <span style="display: inline-block; background: #4caf50; color: white; padding: 5px 15px; border-radius: 20px; font-size: 0.9rem;">
                    <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; animation: pulse 2s infinite;"></i>
                    Live Tracking Active
                </span>
            </div>
        </div>
    `;
    
    // Try to load Google Maps if available
    if (typeof google !== 'undefined' && google.maps) {
        try {
            const defaultLocation = shipment.currentLocation ? 
                { lat: shipment.currentLocation.lat, lng: shipment.currentLocation.lng } :
                { lat: 40.7128, lng: -74.0060 };
            
            map = new google.maps.Map(mapDiv, {
                zoom: 12,
                center: defaultLocation,
                mapTypeControl: true,
                streetViewControl: true,
                fullscreenControl: true
            });
            
            trackingMarker = new google.maps.Marker({
                position: defaultLocation,
                map: map,
                title: `Package ${shipment.id}`,
                icon: {
                    url: 'https://maps.google.com/mapfiles/ms/icons/truck.png',
                    scaledSize: new google.maps.Size(40, 40)
                }
            });
            
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="padding: 10px; min-width: 200px;">
                        <h4 style="margin: 0 0 10px 0; color: #1a237e;">Package ${shipment.id}</h4>
                        <p style="margin: 5px 0;"><strong>Status:</strong> ${shipment.status}</p>
                        <p style="margin: 5px 0;"><strong>Destination:</strong> ${shipment.deliveryAddress}</p>
                    </div>
                `
            });
            
            trackingMarker.addListener('click', () => {
                infoWindow.open(map, trackingMarker);
            });
            
            infoWindow.open(map, trackingMarker);
        } catch (error) {
            console.log('Google Maps not available, using fallback display');
        }
    }
}

// Update tracking map with real-time location
function updateTrackingMap(location) {
    if (trackingMarker && map) {
        const newPosition = { lat: location.lat, lng: location.lng };
        
        // Smooth marker movement
        trackingMarker.setPosition(newPosition);
        map.panTo(newPosition);
        
        // Update info window
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 10px;">
                    <h4><span class="live-indicator"></span>Live Tracking</h4>
                    <p><strong>Status:</strong> ${location.status}</p>
                    <p><strong>Last Update:</strong> ${new Date(location.timestamp).toLocaleString()}</p>
                    <p><strong>Coordinates:</strong> ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}</p>
                </div>
            `
        });
        
        // Show updated info briefly
        infoWindow.open(map, trackingMarker);
        setTimeout(() => infoWindow.close(), 3000);
    }
}

// Enhanced QR Code Generation with styling
function generateQRCode(trackingId) {
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = ''; // Clear previous QR code
    
    const trackingUrl = `${window.location.origin}#tracking?id=${trackingId}`;
    
    QRCode.toCanvas(qrDiv, trackingUrl, {
        width: 200,
        height: 200,
        colorDark: '#1a237e',
        colorLight: '#ffffff',
        margin: 2,
        errorCorrectionLevel: 'M'
    }, (error) => {
        if (error) {
            console.error('QR Code generation error:', error);
            qrDiv.innerHTML = '<p style="color: #f44336;">QR Code generation failed</p>';
        } else {
            // Add download button
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-secondary';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download QR Code';
            downloadBtn.onclick = () => downloadQRCode(trackingId);
            qrDiv.appendChild(downloadBtn);
        }
    });
}

// Download QR Code functionality
function downloadQRCode(trackingId) {
    const canvas = document.querySelector('#qrcode canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `tracking-${trackingId}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }
}

// Enhanced Barcode Scanner with better error handling
function startBarcodeScanner() {
    const scannerDiv = document.getElementById('barcodeScanner');
    const scannerContainer = document.getElementById('scanner');
    
    scannerDiv.style.display = 'block';
    scannerContainer.innerHTML = '<p>Initializing camera...</p>';
    
    // Check for camera permissions
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => {
            Quagga.init({
                inputStream: {
                    name: "Live",
                    type: "LiveStream",
                    target: scannerContainer,
                    constraints: {
                        width: 400,
                        height: 300,
                        facingMode: "environment" // Use back camera on mobile
                    }
                },
                decoder: {
                    readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader", "code_93_reader"]
                },
                locate: true
            }, (err) => {
                if (err) {
                    console.error('Quagga initialization error:', err);
                    scannerContainer.innerHTML = '<p style="color: #f44336;">Camera initialization failed</p>';
                    return;
                }
                Quagga.start();
                scannerContainer.innerHTML = ''; // Clear initialization message
            });
            
            Quagga.onDetected((data) => {
                const code = data.codeResult.code;
                document.getElementById('trackingInput').value = code;
                stopBarcodeScanner();
                
                // Show success feedback
                const feedback = document.createElement('div');
                feedback.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #4caf50; color: white; padding: 20px; border-radius: 10px; z-index: 3000;';
                feedback.innerHTML = '<i class="fas fa-check"></i> Barcode scanned successfully!';
                document.body.appendChild(feedback);
                
                setTimeout(() => {
                    document.body.removeChild(feedback);
                    trackPackage();
                }, 1500);
            });
        })
        .catch((error) => {
            console.error('Camera access error:', error);
            scannerContainer.innerHTML = '<p style="color: #f44336;">Camera access denied or not available</p>';
        });
}

function stopBarcodeScanner() {
    try {
        Quagga.stop();
    } catch (error) {
        console.error('Error stopping scanner:', error);
    }
    document.getElementById('barcodeScanner').style.display = 'none';
}

// Enhanced Live Chat System with Socket.IO
function toggleChat() {
    const chatWidget = document.getElementById('chatWidget');
    const chatBody = document.getElementById('chatBody');
    const chatToggle = document.getElementById('chatToggle');

    chatOpen = !chatOpen;

    if (chatOpen) {
        chatBody.style.cssText = 'display:flex; flex-direction:column; height:400px; overflow:hidden; border-radius:0 0 15px 15px;';
        chatToggle.style.transform = 'rotate(180deg)';
        chatWidget.style.borderRadius = '15px 15px 0 0';
    } else {
        chatBody.style.cssText = 'display:none;';
        chatToggle.style.transform = 'rotate(0deg)';
        chatWidget.style.borderRadius = '15px';
    }
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addChatMessage(message, 'user');
    if (socket) {
        socket.emit('chatMessage', { message, sessionId: chatSessionId, timestamp: new Date() });
    }
}

// Customer chat local history
const localChatHistory = [];

function addChatMessage(message, sender) {
    localChatHistory.push({ message, sender });
    renderChatMessage(message, sender);
}

function renderChatMessage(message, sender) {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender === 'user' ? 'user' : 'bot'}-message`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.innerHTML = `<span>${message}</span><small style="display:block;margin-top:5px;opacity:0.7;font-size:0.8em;">${timestamp}</small>`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function generateBotResponse(userMessage) {
    const responses = {
        'track': 'You can track your package by entering the tracking ID in the tracking section. Our real-time map shows exact location! 📍',
        'cost': 'Shipping costs depend on weight, distance, and package type. Use our booking form for an instant estimate with our smart calculator. 💰',
        'time': 'Delivery times typically range from 1-5 business days. Our AI estimates delivery time based on distance and traffic. ⏰',
        'signature': 'We offer digital signature capture for secure deliveries. You can sign directly on your device! ✍️',
        'qr': 'Every shipment gets a unique QR code for instant tracking. Just scan and track! 📱',
        'language': 'We support English, Spanish, and French. Use the language selector at the top. 🌍',
        'map': 'Our interactive map shows real-time package location with live updates every few seconds. 🗺️',
        'barcode': 'Use our barcode scanner to quickly input tracking numbers with your camera! 📷',
        'analytics': 'Check out our analytics section for delivery statistics and performance metrics. 📊',
        'help': 'I can help you with tracking packages, shipping costs, delivery times, signatures, QR codes, and general questions. How can I assist you? 🤖',
        'hello': 'Hello! Welcome to LogiFlow! I\'m here to help with all your logistics needs. 👋',
        'thanks': 'You\'re welcome! Is there anything else I can help you with today? 😊',
        'default': 'Thank you for your message. Our AI-powered support is here to help! How can I assist you today? 🚀'
    };
    
    const lowerMessage = userMessage.toLowerCase();
    
    for (const [key, response] of Object.entries(responses)) {
        if (lowerMessage.includes(key)) {
            return response;
        }
    }
    
    return responses.default;
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Enhanced Digital Signature with validation
function openSignatureModal(trackingId) {
    const modal = document.getElementById('signatureModal');
    modal.style.display = 'flex';
    modal.setAttribute('data-tracking-id', trackingId || '');
    
    const canvas = document.getElementById('signaturePad');
    
    // Resize canvas for better quality
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    
    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255, 255, 255, 0)',
        penColor: 'rgb(0, 0, 0)',
        minWidth: 1,
        maxWidth: 3,
        throttle: 16,
        minDistance: 5
    });
    
    // Add recipient name input
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent.querySelector('#recipientNameInput')) {
        const nameInput = document.createElement('div');
        nameInput.innerHTML = `
            <label for="recipientNameInput" style="display: block; margin: 10px 0 5px 0; font-weight: bold;">Recipient Name:</label>
            <input type="text" id="recipientNameInput" placeholder="Enter recipient name" 
                   style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 5px; margin-bottom: 10px;">
        `;
        modalContent.insertBefore(nameInput, canvas);
    }
}

function closeSignatureModal() {
    document.getElementById('signatureModal').style.display = 'none';
    
    // Clean up
    const nameInput = document.getElementById('recipientNameInput');
    if (nameInput) {
        nameInput.parentElement.remove();
    }
}

function clearSignature() {
    if (signaturePad) {
        signaturePad.clear();
    }
}

function saveSignature() {
    if (!signaturePad || signaturePad.isEmpty()) {
        alert('Please provide a signature first.');
        return;
    }
    
    const recipientName = document.getElementById('recipientNameInput')?.value.trim();
    if (!recipientName) {
        alert('Please enter the recipient name.');
        return;
    }
    
    const modal = document.getElementById('signatureModal');
    const trackingId = modal.getAttribute('data-tracking-id');
    
    if (!trackingId) {
        alert('No tracking ID found. Please try again.');
        return;
    }
    
    const dataURL = signaturePad.toDataURL('image/png');
    
    // Show loading state
    const saveBtn = event.target;
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    // Send signature to server
    fetch(`/api/signature/${trackingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            signature: dataURL,
            recipientName: recipientName
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('Signature saved successfully! Package marked as delivered.');
            closeSignatureModal();
            
            // Refresh tracking info
            setTimeout(() => {
                trackPackage();
            }, 1000);
        } else {
            alert('Error saving signature: ' + (result.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Signature save error:', error);
        alert('Error saving signature. Please try again.');
    })
    .finally(() => {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    });
}

// Enhanced Analytics with real-time updates
function updateAnalytics() {
    fetch('/api/analytics')
        .then(response => response.json())
        .then(analytics => {
            // Animate number changes
            animateNumber('totalShipments', analytics.totalShipments);
            document.getElementById('avgDeliveryTime').textContent = analytics.avgDeliveryTime;
            document.getElementById('successRate').textContent = analytics.successRate;
            document.getElementById('customerRating').textContent = analytics.customerRating;
        })
        .catch(error => {
            console.error('Analytics update error:', error);
            // Fallback to simulated data
            const analytics = {
                totalShipments: Math.floor(Math.random() * 10000) + 5000,
                avgDeliveryTime: (Math.random() * 2 + 1.5).toFixed(1) + ' days',
                successRate: (Math.random() * 5 + 95).toFixed(1) + '%',
                customerRating: (Math.random() * 0.5 + 4.5).toFixed(1) + '/5'
            };
            
            animateNumber('totalShipments', analytics.totalShipments);
            document.getElementById('avgDeliveryTime').textContent = analytics.avgDeliveryTime;
            document.getElementById('successRate').textContent = analytics.successRate;
            document.getElementById('customerRating').textContent = analytics.customerRating;
        });
}

// Animate number changes
function animateNumber(elementId, targetNumber) {
    const element = document.getElementById(elementId);
    const currentNumber = parseInt(element.textContent) || 0;
    const increment = (targetNumber - currentNumber) / 20;
    let current = currentNumber;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= targetNumber) || (increment < 0 && current <= targetNumber)) {
            current = targetNumber;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 50);
}

// Initialize features on page load — socket init moved to top DOMContentLoaded block above