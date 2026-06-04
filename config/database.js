const { supabase } = require('./supabase');

// Database helper functions
const db = {
    // Shipments
    async createShipment(shipmentData) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('shipments')
            .insert([{
                tracking_number: shipmentData.id,
                sender_name: shipmentData.senderName,
                sender_phone: shipmentData.senderPhone,
                recipient_name: shipmentData.recipientName,
                recipient_phone: shipmentData.recipientPhone,
                pickup_address: shipmentData.pickupAddress,
                delivery_address: shipmentData.deliveryAddress,
                package_type: shipmentData.packageType,
                weight: parseFloat(shipmentData.weight),
                status: shipmentData.status,
                cost: shipmentData.cost,
                estimated_delivery: shipmentData.estimatedDelivery,
                updates: typeof shipmentData.updates === 'string' ? shipmentData.updates : JSON.stringify(shipmentData.updates || [])
            }])
            .select();
        
        if (error) {
            console.error('Error creating shipment:', error);
            return null;
        }
        
        return data[0];
    },

    async getShipment(trackingId) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('tracking_number', trackingId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching shipment:', error);
        }
        
        return data;
    },

    async updateShipmentStatus(trackingId, status) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('shipments')
            .update({ 
                status,
                updated_at: new Date().toISOString()
            })
            .eq('tracking_number', trackingId)
            .select();
        
        if (error) {
            console.error('Error updating shipment:', error);
            return null;
        }
        
        return data[0];
    },

    // Contacts
    async createContact(contactData) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('contacts')
            .insert([contactData])
            .select();
        
        if (error) {
            console.error('Error creating contact:', error);
            return null;
        }
        
        return data[0];
    },

    // Receipts
    async createReceipt(receiptData) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('receipts')
            .insert([{
                tracking_number: receiptData.trackingId,
                amount: receiptData.total,
                payment_method: 'online',
                payment_status: 'completed',
                receipt_data: receiptData
            }])
            .select();
        
        if (error) {
            console.error('Error creating receipt:', error);
            return null;
        }
        
        return data[0];
    },

    async getReceipt(receiptId) {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .or(`id.eq.${receiptId},tracking_number.eq.${receiptId}`)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching receipt:', error);
        }
        
        return data;
    },

    // Analytics
    async getAnalytics() {
        if (!supabase) return null;
        
        const { data, error } = await supabase
            .from('shipments')
            .select('status, created_at');
        
        if (error) {
            console.error('Error fetching analytics:', error);
            return null;
        }
        
        const total = data.length;
        const delivered = data.filter(s => s.status === 'Delivered').length;
        
        return {
            totalShipments: total,
            deliveredShipments: delivered,
            successRate: total > 0 ? ((delivered / total) * 100).toFixed(1) + '%' : '0%'
        };
    }
};

module.exports = db;