-- Logistics Platform Database Setup
CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    sender_name VARCHAR(100) NOT NULL,
    sender_phone VARCHAR(20),
    recipient_name VARCHAR(100) NOT NULL,
    recipient_phone VARCHAR(20),
    pickup_address TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    package_type VARCHAR(50) NOT NULL,
    weight DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'Pending Pickup',
    cost DECIMAL(10,2),
    estimated_delivery TIMESTAMP,
    updates JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(200),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'online',
    payment_status VARCHAR(50) DEFAULT 'completed',
    receipt_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed)
CREATE POLICY "Allow public read access on shipments" ON shipments FOR SELECT USING (true);
CREATE POLICY "Allow public insert on shipments" ON shipments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on shipments" ON shipments FOR UPDATE USING (true);

CREATE POLICY "Allow public insert on contacts" ON contacts FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access on receipts" ON receipts FOR SELECT USING (true);
CREATE POLICY "Allow public insert on receipts" ON receipts FOR INSERT WITH CHECK (true);