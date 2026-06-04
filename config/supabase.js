const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase not configured - using in-memory storage');
    module.exports = { supabase: null };
} else {
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false
        }
    });
    console.log('Supabase connected successfully');
    module.exports = { supabase };
}