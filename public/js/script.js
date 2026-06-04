// Mobile Navigation
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        // Skip if this is not actually an anchor link (like admin.html)
        if (!this.getAttribute('href').startsWith('#')) {
            return;
        }
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Booking Form
const bookingForm = document.getElementById('bookingForm');
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(bookingForm);
        const data = Object.fromEntries(formData);
        
        // Show loading state
        const submitBtn = bookingForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch('/api/shipments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showBookingSuccess(result.trackingId, result.receiptId, result.cost, result.receiptData);
                bookingForm.reset();
            } else {
                alert('Booking failed. Please try again.');
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Network error. Please check your connection and try again.');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// Helper function to create receipt data from form
function createReceiptData(formData, trackingId, receiptId) {
    const subtotal = 15.99;
    const tax = 1.28;
    const total = 17.27;
    
    return {
        receiptId: receiptId,
        trackingId: trackingId,
        date: new Date().toISOString(),
        from: formData.pickupAddress || 'Pickup Address',
        to: formData.deliveryAddress || 'Delivery Address',
        senderName: formData.senderName || 'Sender',
        senderPhone: formData.senderPhone || 'N/A',
        recipientName: formData.recipientName || 'Recipient',
        recipientPhone: formData.recipientPhone || 'N/A',
        service: formData.packageType || 'Standard',
        status: 'In Transit',
        items: [{
            description: `Package Shipping (${formData.packageType || 'Standard'})`,
            weight: `${formData.weight || '1'} kg`,
            rate: 5.50,
            amount: subtotal
        }],
        subtotal: subtotal,
        tax: tax,
        total: total,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    };
}

// Status location & description map
const STATUS_INFO = {
    'Pending':           { location: 'Origin Facility',       description: 'Package is pending processing' },
    'Shipped':           { location: 'Shipping Facility',     description: 'Package has been shipped and is awaiting processing' },
    'In Transit':        { location: 'Distribution Center',   description: 'Package is moving through the network' },
    'On Hold':           { location: 'Distribution Center',   description: 'Package is temporarily on hold pending additional information' },
    'Out for Delivery':  { location: 'Local Facility',        description: 'Package is out for delivery today' },
    'Delivered':         { location: 'Destination',           description: 'Package delivered to recipient' }
};

// Package Tracking
async function trackPackage() {
    const trackingId = document.getElementById('trackingInput').value.trim();
    const resultDiv = document.getElementById('trackingResult');

    if (!trackingId) {
        alert('Please enter a tracking ID');
        return;
    }

    resultDiv.innerHTML = '<p style="text-align:center;padding:20px;background:#f0f0f0;border-radius:8px;">🔍 Tracking package...</p>';

    let response, shipment;
    try {
        response = await fetch('/api/tracking/' + trackingId);
        shipment = await response.json();
    } catch (err) {
        resultDiv.innerHTML = '<p style="text-align:center;padding:20px;color:#f44336;">❌ Could not reach the server. Please check your connection.</p>';
        return;
    }

    if (!response.ok || shipment.error) {
        resultDiv.innerHTML = '<p style="text-align:center;padding:20px;color:#f44336;">❌ No shipment found for <strong>' + trackingId + '</strong>. Please check the ID and try again.</p>';
        return;
    }

    showShipmentResult(shipment);
}

function showShipmentResult(shipment) {
    const resultDiv = document.getElementById('trackingResult');
    const statusColors = {
        'Pending': '#ff9800', 'Shipped': '#2196f3', 'In Transit': '#2196f3',
        'On Hold': '#f44336', 'Out for Delivery': '#9c27b0', 'Delivered': '#4caf50'
    };
    const color = statusColors[shipment.status] || '#607d8b';

    const timeline = (shipment.updates && shipment.updates.length)
        ? shipment.updates.slice().reverse().map(u => `
            <div style="display:flex;gap:12px;margin-bottom:12px;">
                <div style="width:12px;height:12px;border-radius:50%;background:${color};margin-top:4px;flex-shrink:0;"></div>
                <div>
                    <strong>${u.status}</strong><br>
                    <span style="color:#555;font-size:0.9rem;">${u.location || ''}</span><br>
                    <small style="color:#999;">${new Date(u.timestamp).toLocaleString()}</small>
                </div>
            </div>`).join('')
        : '<p style="color:#999;">No updates yet</p>';

    resultDiv.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
                <h3 style="margin:0;color:#1a237e;">Tracking ID: ${shipment.id}</h3>
                <span style="background:${color};color:white;padding:6px 16px;border-radius:20px;font-weight:bold;">${shipment.status}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                <div style="background:#f8f9fa;padding:14px;border-radius:8px;">
                    <strong style="color:#1a237e;">Sender</strong><br>
                    ${shipment.senderName}<br>
                    <small>${shipment.senderPhone}</small><br>
                    <small style="color:#666;">${shipment.pickupAddress}</small>
                </div>
                <div style="background:#f8f9fa;padding:14px;border-radius:8px;">
                    <strong style="color:#1a237e;">Recipient</strong><br>
                    ${shipment.recipientName}<br>
                    <small>${shipment.recipientPhone}</small><br>
                    <small style="color:#666;">${shipment.deliveryAddress}</small>
                </div>
            </div>
            <div style="background:#f8f9fa;padding:14px;border-radius:8px;margin-bottom:20px;">
                <strong style="color:#1a237e;">Package Details</strong><br>
                Type: ${shipment.packageType} &nbsp;|&nbsp; Weight: ${shipment.weight} kg &nbsp;|&nbsp; Cost: $${Number(shipment.cost).toFixed(2)}<br>
                <small style="color:#666;">Booked: ${new Date(shipment.createdAt).toLocaleString()}</small>
                ${shipment.estimatedDelivery ? '<br><small style="color:#666;">Est. Delivery: ' + new Date(shipment.estimatedDelivery).toLocaleString() + '</small>' : ''}
            </div>
            <div>
                <strong style="color:#1a237e;">Tracking Timeline</strong>
                <div style="margin-top:12px;">${timeline}</div>
            </div>
        </div>`;
}

// Create mock shipment data for any tracking ID
function createMockShipment(trackingId) {
    const locations = [
        { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
        { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
        { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
        { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 }
    ];
    
    const currentLocation = locations[Math.floor(Math.random() * locations.length)];
    
    return {
        id: trackingId,
        senderName: 'John Sender',
        senderPhone: '+1 (555) 123-4567',
        pickupAddress: '123 Main St, New York, NY 10001',
        recipientName: 'Jane Recipient',
        recipientPhone: '+1 (555) 987-6543',
        deliveryAddress: '456 Oak Ave, Los Angeles, CA 90210',
        packageType: 'Standard Package',
        weight: '2.5',
        cost: 17.27,
        status: 'In Transit',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        currentLocation: {
            city: currentLocation.city,
            state: currentLocation.state,
            address: `${currentLocation.city} Distribution Center, ${currentLocation.state}`,
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            timestamp: new Date().toISOString()
        },
        updates: [
            {
                status: 'Package Received',
                location: 'New York Distribution Center',
                timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                status: 'In Transit',
                location: `${currentLocation.city} Hub, ${currentLocation.state}`,
                timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
            },
            {
                status: 'In Transit',
                location: `${currentLocation.city} Distribution Center`,
                timestamp: new Date().toISOString()
            }
        ]
    };
}



function getStatusClass(status) {
    const statusMap = {
        'Pending':          'status-pending',
        'Shipped':          'status-shipped',
        'In Transit':       'status-transit',
        'On Hold':          'status-hold',
        'Out for Delivery': 'status-delivery',
        'Delivered':        'status-delivered'
    };
    return statusMap[status] || 'status-pending';
}

// Contact Form
const contactForm = document.getElementById('contactForm');
contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(contactForm);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Message sent successfully! We will get back to you soon.');
            contactForm.reset();
        } else {
            alert('Error sending message. Please try again.');
        }
    } catch (error) {
        alert('Error sending message. Please try again.');
    }
});

// Enter key for tracking
document.getElementById('trackingInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        trackPackage();
    }
});

// Show booking success with receipt option
function showBookingSuccess(trackingId, receiptId, cost, receiptData) {
    console.log('showBookingSuccess called with:', { trackingId, receiptId, cost, receiptData });
    
    // Create comprehensive receipt data if not provided
    if (!receiptData) {
        receiptData = {
            receiptId: receiptId,
            trackingId: trackingId,
            date: new Date().toISOString(),
            from: 'Pickup Address',
            to: 'Delivery Address',
            service: 'Standard',
            status: 'In Transit',
            items: [{
                description: 'Package Shipping (Standard)',
                weight: '1 kg',
                rate: 15.99,
                amount: 15.99
            }],
            subtotal: 15.99,
            tax: 1.28,
            total: cost,
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        };
    }
    
    // Store receipt data for immediate access
    console.log('Storing receipt data:', receiptData);
    localStorage.setItem(`receipt_${receiptId}`, JSON.stringify(receiptData));
    localStorage.setItem(`receipt_${trackingId}`, JSON.stringify(receiptData));
    console.log('Stored in localStorage with keys:', `receipt_${receiptId}`, `receipt_${trackingId}`);
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; text-align: center; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="color: #4caf50; font-size: 4rem; margin-bottom: 20px;">✅</div>
            <h3 style="color: #1a237e; margin-bottom: 20px; font-size: 1.5rem;">Booking Successful!</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Tracking ID:</strong> ${trackingId}</p>
                <p style="margin: 5px 0;"><strong>Receipt ID:</strong> ${receiptId}</p>
                <p style="margin: 5px 0;"><strong>Total Cost:</strong> $${cost.toFixed(2)}</p>
            </div>
            <div style="margin: 25px 0;">
                <button id="viewReceiptBtn" 
                        style="background: #1a237e; color: white; border: none; padding: 12px 25px; 
                               border-radius: 8px; margin: 5px; cursor: pointer; font-size: 1rem;">📄 View Receipt</button>
                <button id="downloadPdfBtn" 
                        style="background: #dc3545; color: white; border: none; padding: 12px 25px; 
                               border-radius: 8px; margin: 5px; cursor: pointer; font-size: 1rem;">📥 Download PDF</button>
                <button onclick="document.getElementById('trackingInput').value='${trackingId}'; trackPackage(); this.parentElement.parentElement.parentElement.remove();" 
                        style="background: #ffc107; color: #1a237e; border: none; padding: 12px 25px; 
                               border-radius: 8px; margin: 5px; cursor: pointer; font-size: 1rem;">📍 Track Package</button>
            </div>
            <div style="margin: 15px 0; padding: 10px; background: #e3f2fd; border-radius: 5px; font-size: 0.9rem;">
                <strong>Direct Receipt Link:</strong><br>
                <a href="receipt.html?receiptId=${receiptId}" target="_blank" style="color: #1976d2; text-decoration: underline;">receipt.html?receiptId=${receiptId}</a>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: #6c757d; color: white; border: none; padding: 10px 20px; 
                           border-radius: 8px; cursor: pointer;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener for the View Receipt button
    const viewReceiptBtn = modal.querySelector('#viewReceiptBtn');
    viewReceiptBtn.addEventListener('click', function() {
        console.log('View Receipt button clicked');
        modal.remove(); // Close success modal
        showReceiptModal(receiptData); // Show receipt directly
    });
    
    // Add event listener for the Download PDF button
    const downloadPdfBtn = modal.querySelector('#downloadPdfBtn');
    downloadPdfBtn.addEventListener('click', function() {
        console.log('Download PDF button clicked - showing full receipt');
        modal.remove(); // Close success modal
        showReceiptModal(receiptData); // Show full receipt
    });
}

// Function to open receipt in modal
function openReceiptInModal(receiptId) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 3000; overflow-y: auto;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 0; border-radius: 15px; max-width: 600px; width: 90%; max-height: 90%; overflow-y: auto; position: relative;">
            <div style="position: sticky; top: 0; background: white; padding: 15px; border-bottom: 1px solid #eee; border-radius: 15px 15px 0 0;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #1a237e;">📄 Receipt Details</h3>
                    <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" 
                            style="background: #f44336; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 1.2rem;">×</button>
                </div>
            </div>
            <iframe src="receipt.html?receiptId=${receiptId}" style="width: 100%; height: 500px; border: none;"></iframe>
            <div style="padding: 15px; text-align: center; border-top: 1px solid #eee;">
                <button onclick="window.open('receipt.html?receiptId=${receiptId}', '_blank')" 
                        style="background: #1a237e; color: white; border: none; padding: 10px 20px; border-radius: 8px; margin: 5px; cursor: pointer;">🖨️ Print Receipt</button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 8px; margin: 5px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Show receipt in modal
function showReceiptModal(receiptData) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 3000; overflow-y: auto;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 600px; width: 90%; max-height: 90%; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #1a237e;">📄 Shipping Receipt</h3>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: #f44336; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer;">×</button>
            </div>
            
            <div style="text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px;">
                <div style="font-size: 28px; font-weight: bold; color: #007bff;">LogiFlow</div>
                <div style="color: #666; font-size: 14px;">Professional Logistics Solutions</div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>Receipt #:</strong> <span>${receiptData.receiptId}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>Tracking ID:</strong> <span>${receiptData.trackingId}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>Date:</strong> <span>${new Date(receiptData.date).toLocaleDateString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong>Status:</strong> <span style="color: #007bff; font-weight: bold;">${receiptData.status || 'In Transit'}</span>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #333; margin-bottom: 10px;">Sender Information</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Name:</span> <span>${receiptData.senderName || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Phone:</span> <span>${receiptData.senderPhone || 'N/A'}</span>
                </div>
                <div style="margin-bottom: 5px;">
                    <span><strong>Address:</strong></span><br>
                    <span style="color: #666;">${receiptData.from || 'Pickup Address'}</span>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #333; margin-bottom: 10px;">Recipient Information</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Name:</span> <span>${receiptData.recipientName || 'N/A'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Phone:</span> <span>${receiptData.recipientPhone || 'N/A'}</span>
                </div>
                <div style="margin-bottom: 5px;">
                    <span><strong>Address:</strong></span><br>
                    <span style="color: #666;">${receiptData.to || 'Delivery Address'}</span>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #333; margin-bottom: 10px;">Package Details</h4>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Service Type:</span> <span>${receiptData.service || 'Standard'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Weight:</span> <span>${receiptData.items && receiptData.items[0] ? receiptData.items[0].weight : '1 kg'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Estimated Delivery:</span> <span>${receiptData.estimatedDelivery ? new Date(receiptData.estimatedDelivery).toLocaleDateString() : 'TBD'}</span>
                </div>
            </div>
            
            <div style="border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Subtotal:</span> <span>$${(receiptData.subtotal || 15.99).toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Tax:</span> <span>$${(receiptData.tax || 1.28).toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; color: #007bff; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">
                    <span>Total:</span> <span>$${(receiptData.total || 17.27).toFixed(2)}</span>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="window.print()" style="background: #1a237e; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">🖨️ Print</button>
                <button onclick="openReceiptForPDF()" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">📥 Save as PDF</button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}
// Download receipt as PDF
function downloadReceiptPDF() {
    try {
        // Get the receipt content
        const receiptElement = document.querySelector('[style*="background: white; padding: 30px"]');
        
        if (!receiptElement) {
            alert('No receipt found to download');
            return false;
        }
        
        // Create a clean version for PDF
        const pdfContent = document.createElement('div');
        pdfContent.innerHTML = receiptElement.innerHTML;
        
        // Remove buttons from PDF version
        const buttons = pdfContent.querySelectorAll('button');
        buttons.forEach(btn => btn.remove());
        
        // Style for PDF
        pdfContent.style.cssText = `
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: white;
        `;
        
        // Use html2pdf if available
        if (typeof html2pdf !== 'undefined') {
            const opt = {
                margin: 0.5,
                filename: `LogiFlow-Receipt-${Date.now()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
            };
            html2pdf().set(opt).from(pdfContent).save();
        } else {
            // Fallback: create a simple download
            const blob = new Blob([`
                <html>
                    <head><title>LogiFlow Receipt</title></head>
                    <body style="font-family: Arial, sans-serif; margin: 20px;">
                        ${pdfContent.innerHTML}
                    </body>
                </html>
            `], { type: 'text/html' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `LogiFlow-Receipt-${Date.now()}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        return false;
    } catch (error) {
        console.error('PDF download error:', error);
        alert('Error downloading PDF. Please try again.');
        return false;
    }
}
// Open clean receipt window for PDF
function openReceiptForPDF() {
    const receiptModal = document.querySelector('[style*="background: white; padding: 30px; border-radius: 15px"]');
    if (!receiptModal) {
        alert('No receipt found');
        return;
    }
    
    // Get receipt content without buttons
    const receiptContent = receiptModal.cloneNode(true);
    const buttons = receiptContent.querySelectorAll('button');
    buttons.forEach(btn => btn.remove());
    
    // Open new window with clean receipt
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>LogiFlow Receipt</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0; 
                    padding: 20px; 
                    background: white;
                }
                @media print {
                    body { margin: 0; padding: 10px; }
                    .no-print { display: none; }
                }
                .receipt-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                }
            </style>
        </head>
        <body>
            <div class="receipt-container">
                ${receiptContent.innerHTML}
            </div>
            <div class="no-print" style="text-align: center; margin: 20px 0;">
                <button onclick="window.print()" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">📥 Save as PDF</button>
                <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin: 5px; cursor: pointer;">Close</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}