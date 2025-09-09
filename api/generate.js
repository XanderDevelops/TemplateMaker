import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Node.js stream utility to pipe the response
import { Readable } from 'stream';

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. AUTHENTICATE THE USER'S API KEY
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

        // 2. GET TEMPLATE ID AND DYNAMIC DATA FROM THE REQUEST BODY
        const { templateId, data: dynamicData } = req.body;
        if (!templateId) {
            return res.status(400).json({ error: 'Missing templateId in request body.' });
        }
        if (!dynamicData) {
            return res.status(400).json({ error: 'Missing data in request body.' });
        }

        // 3. FETCH THE TEMPLATE JSONB FROM SUPABASE
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data') // This should be your JSONB column
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id) // Security check
            .single();

        if (dbError || !templateRecord) {
            // This is the error you were seeing. It's a valid security check.
            return res.status(404).json({ error: 'Template not found or you do not have permission to access it.' });
        }

        // 4. CALL THE EXTERNAL CSVLINK API
        const csvLinkResponse = await fetch("https://www.csvlink.app/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Pass the user's API key along to CSVLink for authentication
                Authorization: `Bearer ${apiKey}`, 
            },
            body: JSON.stringify({
                // IMPORTANT: Use the template_data from your database
                template: templateRecord.template_data, 
                data: dynamicData,
                options: { format: "pdf", delivery: "download" }
            }),
        });

        // 5. CHECK IF THE CSVLINK CALL WAS SUCCESSFUL AND STREAM THE RESPONSE
        if (!csvLinkResponse.ok) {
            // If CSVLink returned an error, send that error back to the user
            const errorBody = await csvLinkResponse.json();
            return res.status(csvLinkResponse.status).json(errorBody);
        }

        // Set headers for the PDF response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="generated-document.pdf"`);
        
        Readable.fromWeb(csvLinkResponse.body).pipe(res);

    } catch (error) {
        console.error('API Proxy Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}