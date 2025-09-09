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
        res.setHeader('Access-control-allow-headers', 'Content-Type, Authorization');
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. API KEY AUTHENTICATION (Remains the same)
        const apiKey = req.headers.authorization?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'Authorization header missing.' });
        }
        const { data: apiKeyRecord, error: keyError } = await supabase
            .from('api_keys').select('user_id').eq('api_key', apiKey).single();
        if (keyError || !apiKeyRecord) {
            return res.status(403).json({ error: 'Forbidden. Invalid API Key.' });
        }

        // 2. GET DATA FROM REQUEST (Remains the same)
        const { templateId, data: dynamicData } = req.body;
        if (!templateId || !dynamicData) {
            return res.status(400).json({ error: 'Missing templateId or data in request body.' });
        }

        // 3. FETCH TEMPLATE METADATA FROM DATABASE
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data')
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template metadata not found or you do not have permission.' });
        }

        // 4. *** NEW: VALIDATE THE FILE PATH ***
        // This is the crucial fix. We check if the path exists before using it.
        if (!templateRecord.template_data) {
            return res.status(500).json({
                error: 'Template record is missing the file path. Check your database.',
                detail: 'The "template_data" column is likely empty or named incorrectly for this template ID.'
            });
        }

        // 5. FETCH THE TEMPLATE FILE FROM STORAGE
        const { data: fileData, error: fileError } = await supabase
            .storage
            .from('templates') // Assuming your bucket is named 'templates'
            .download(templateRecord.template_data); // Now this is guaranteed to be a valid string

        if (fileError || !fileData) {
            console.error('Supabase Storage Error:', fileError);
            return res.status(500).json({ error: 'Could not fetch the template file from storage.', detail: fileError.message });
        }

        // 6. LOAD AND FILL THE PDF (Remains the same)
        const pdfBuffer = await fileData.arrayBuffer();
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

        // 7. SEND THE COMPLETED PDF (Remains the same)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');
        return res.status(200).send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}