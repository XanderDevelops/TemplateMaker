import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    
    if (req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. API KEY AUTHENTICATION
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

        // 2. FETCH THE TEMPLATE AND PDF PATH
        const { templateId } = req.body;
        if (!templateId) {
            return res.status(400).json({ error: 'Missing templateId in request body.' });
        }

        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('pdf_storage_path') // Assuming you store a path to the PDF in your table
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission to access it.' });
        }
        
        // 3. DOWNLOAD THE PDF FROM SUPABASE STORAGE
        const { data: pdfData, error: storageError } = await supabase
            .storage
            .from('your-bucket-name') // Replace with your bucket name
            .download(templateRecord.pdf_storage_path);

        if (storageError) {
            console.error('Storage Error:', storageError);
            return res.status(500).json({ error: 'Could not retrieve PDF from storage.' });
        }

        // 4. SEND THE PDF AS THE RESPONSE
        const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());

        res.setHeader('Content-Type', 'application/pdf'); [1, 4]
        res.setHeader('Content-Disposition', 'attachment; filename="template.pdf"'); // Optional: suggests a filename for download [3, 5]
        res.setHeader('Content-Length', pdfBuffer.length);

        return res.status(200).send(pdfBuffer); [1]

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}