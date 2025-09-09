import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib'; // Crucially, we only need PDFDocument to load/manipulate

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        // Handle CORS preflight
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
        // 1. API KEY AUTHENTICATION (Your code is correct)
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

        // 2. FETCH THE PDF TEMPLATE AND DYNAMIC DATA
        const { templateId, data: dynamicData } = req.body;
        if (!templateId || !dynamicData) {
            return res.status(400).json({ error: 'Missing templateId or data in request body.' });
        }

        // 3. FETCH THE ACTUAL PDF TEMPLATE FILE FROM SUPABASE STORAGE
        //    It's better practice to store files in Storage and keep a reference in the database.
        //    Let's assume 'template_path' is a column in your 'templates' table.
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data') // e.g., 'public/invoice-template.pdf'
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template metadata not found or you do not have permission.' });
        }
        
        const { data: fileData, error: fileError } = await supabase
            .storage
            .from('templates') // Assuming your bucket is named 'templates'
            .download(templateRecord.template_path);
            
        if(fileError || !fileData) {
             return res.status(500).json({ error: 'Could not fetch the template file from storage.' });
        }

        // 4. *** LOAD THE PDF AND FILL ITS FORM FIELDS ***
        const pdfBuffer = await fileData.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const form = pdfDoc.getForm();

        // Iterate through the data provided by the user and fill the form fields
        // The keys in `dynamicData` should match the names of the fields in your PDF template
        Object.keys(dynamicData).forEach(key => {
            const fieldName = key;
            const fieldValue = dynamicData[key];

            try {
                // Get the field and set its value
                const field = form.getTextField(fieldName);
                field.setText(String(fieldValue));
            } catch (e) {
                // This allows you to pass extra data without the API failing
                console.warn(`PDF template does not have a field named: ${fieldName}`);
            }
        });
        
        // Flatten the form fields to make them non-editable in the final PDF
        form.flatten();

        // 5. *** SAVE AND SEND THE COMPLETED PDF ***
        const pdfBytes = await pdfDoc.save();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');
        return res.status(200).send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}