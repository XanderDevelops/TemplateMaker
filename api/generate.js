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
            .select('template_data') // This column contains the PDF content
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission.' });
        }
        
        if (!templateRecord.template_data) {
            return res.status(500).json({
                error: 'Template data is missing.',
                detail: 'The "template_data" column for the requested template is empty.'
            });
        }

        // 4. *** FIX: LOAD THE PDF DIRECTLY FROM THE DATABASE RECORD ***
        // Since the PDF content is stored in a JSONB field, it's likely stored as a serialized Buffer.
        // It looks like: { type: "Buffer", data: [7, 3, 1, ...] }
        // We need to reconstruct the Buffer from this object.
        let pdfBuffer;
        if (templateRecord.template_data.type === 'Buffer' && Array.isArray(templateRecord.template_data.data)) {
            pdfBuffer = Buffer.from(templateRecord.template_data.data);
        } else {
            // Add a fallback for other potential formats if needed, otherwise error
            return res.status(500).json({ error: 'Template data is not in the expected format (serialized Buffer).' });
        }
        
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const form = pdfDoc.getForm();
        
        // 5. FILL THE PDF FORM (Correct)
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
        return res.status(200).send(pdfBytes);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}