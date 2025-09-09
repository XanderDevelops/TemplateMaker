import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. API KEY AUTHENTICATION (Correct)
        const apiKey = req.headers.authorization?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'Authorization header missing.' });
        }
        const { data: apiKeyRecord, error: keyError } = await supabase
            .from('api_keys').select('user_id').eq('api_key', apiKey).single();
        if (keyError || !apiKeyRecord) {
            return res.status(403).json({ error: 'Forbidden. Invalid API Key.' });
        }

        // 2. GET DATA FROM REQUEST (Correct)
        const { templateId, data: dynamicData } = req.body;
        if (!templateId || !dynamicData) {
            return res.status(400).json({ error: 'Missing templateId or data in request body.' });
        }

        // 3. FETCH THE TEMPLATE CONTENT FROM THE DATABASE (Correct)
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data')
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission.' });
        }
        
        if (!templateRecord.template_data) {
            return res.status(500).json({ error: 'Template data is missing from the database record.' });
        }

        // 4. *** THE FIX: CONVERT TEMPLATE DATA TO A BUFFER ***
        // We will assume the data is a Base64 encoded string, which is standard for this use case.
        let pdfBuffer;
        try {
            // The template_data from jsonb is treated as a string.
            // We create a Buffer from this string, telling Node.js it's Base64 encoded.
            const base64Data = templateRecord.template_data;
            pdfBuffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
            console.error("Failed to decode Base64 template data:", e);
            return res.status(500).json({ error: 'Template data is corrupt or not in Base64 format.' });
        }
        
        // 5. LOAD THE PDF AND FILL THE FORM (This part remains the same)
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const form = pdfDoc.getForm();
        
        Object.keys(dynamicData).forEach(key => {
            try {
                const field = form.getTextField(key);
                field.setText(String(dynamicData[key]));
            } catch (e) {
                console.warn(`PDF template does not have a field named: ${key}`);
            }
        });
        
        form.flatten();
        const pdfBytes = await pdfDoc.save();

        // 6. SEND THE COMPLETED PDF (Correct)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');
        // IMPORTANT: In Vercel/serverless environments, it's more robust to send the final Buffer directly
        return res.status(200).send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}