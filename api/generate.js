import { createClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. AUTHENTICATE THE USER'S API KEY FROM THE INCOMING REQUEST
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
        if (!templateId || !dynamicData) {
            return res.status(400).json({ error: 'Missing templateId or data in request body.' });
        }

        // 3. FETCH THE SECRET TEMPLATE JSONB FROM SUPABASE
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data') // Your JSONB column
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id) // Security check
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission to access it.' });
        }

        // 4. ACT AS A PROXY: CALL THE EXTERNAL CSVLINK API FROM YOUR SERVER
        const csvLinkResponse = await fetch("https://www.csvlink.app/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Pass the user's API key along to CSVLink for authentication there
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                // IMPORTANT: Use the full 'template_data' from your database, NOT the templateId
                template: templateRecord.template_data,
                data: dynamicData, // The dynamic data for this specific row
                options: { format: "pdf", delivery: "download" }
            }),
        });

        // 5. HANDLE THE RESPONSE FROM CSVLINK
        if (!csvLinkResponse.ok) {
            // If CSVLink returned an error, send that error back to your user
            const errorBody = await csvLinkResponse.json();
            return res.status(csvLinkResponse.status).json(errorBody);
        }

        // 6. STREAM THE VALID PDF BACK TO THE FRONTEND
        // Set the correct headers to tell the browser it's receiving a PDF file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');

        // Efficiently pipe the PDF stream from CSVLink directly back to the original caller
        Readable.fromWeb(csvLinkResponse.body).pipe(res);

    } catch (error) {
        console.error('API Proxy Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}