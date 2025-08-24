// your-project/api/generate.js

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // This function is now just a secure data provider.
    // It returns the full template data, ready for client-side rendering.

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. API KEY AUTHENTICATION (Remains the same and is crucial)
        const apiKey = req.headers.authorization?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'Authorization header missing.' });
        }

        const { data: apiKeyRecord, error: keyError } = await supabase
            .from('api_keys')
            .select('user_id')
            .eq('api_key', apiKey)
            .single();

        if (keyError || !apiKeyRecord) {
            return res.status(403).json({ error: 'Forbidden. Invalid API Key.' });
        }

        // 2. FETCH THE TEMPLATE DATA
        const { templateId } = req.body;
        if (!templateId) {
            return res.status(400).json({ error: 'Missing templateId in request body.' });
        }

        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data')
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id) // Security check
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission to access it.' });
        }
        
        // 3. RETURN THE TEMPLATE JSON
        // The core change: we send the template data back to the client.
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({
            success: true,
            template: templateRecord.template_data
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}