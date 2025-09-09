import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb } from 'pdf-lib';

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

        // 2. GET TEMPLATE AND DYNAMIC DATA FROM REQUEST
        const { templateId, data: dynamicData } = req.body;
        if (!templateId || !dynamicData) {
            return res.status(400).json({ error: 'Missing templateId or data in request body.' });
        }

        // NOTE: The front-end is sending `customerName` and `product` inside a `data` object.
        const { customerName, product } = dynamicData;


        // 3. FETCH THE TEMPLATE (This part is conceptually the same)
        // In a real scenario, 'template_data' would contain instructions for placing text, etc.
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data') // Assuming template_data might contain font, layout info etc.
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or permission denied.' });
        }

        // 4. *** NEW: GENERATE THE PDF ***
        // This is a simple example. You would expand this logic based on your 'template_data'.
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        
        page.drawText(`Customer: ${customerName}`, {
            x: 50,
            y: 750,
            size: 24,
            color: rgb(0, 0, 0),
        });
        
        page.drawText(`Product: ${product}`, {
            x: 50,
            y: 700,
            size: 24,
            color: rgb(0, 0, 0),
        });

        // Serialize the PDFDocument to bytes (a Uint8Array)
        const pdfBytes = await pdfDoc.save();

        // 5. *** NEW: SEND THE PDF AS A RESPONSE ***
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${customerName}-${product}.pdf"`);
        return res.status(200).send(Buffer.from(pdfBytes)); // Send buffer

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}