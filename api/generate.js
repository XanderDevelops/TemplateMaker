import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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

        // 3. FETCH THE JSON TEMPLATE INSTRUCTIONS FROM THE DATABASE (Correct)
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data')
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id)
            .single();

        if (dbError || !templateRecord) {
            return res.status(404).json({ error: 'Template not found or you do not have permission.' });
        }
        
        const templateJson = templateRecord.template_data;
        if (!templateJson || !Array.isArray(templateJson.elements)) {
            return res.status(500).json({ error: 'Template data is invalid or missing an "elements" array.' });
        }

        // 4. *** BUILD THE PDF FROM THE JSON INSTRUCTIONS ***
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage(); // Assuming a single-page template for now
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Process each element from the JSON template
        for (const element of templateJson.elements) {
            if (element.type === 'text') {
                // Find and replace all placeholders like {{key}} in the text content
                let processedText = element.content.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
                    // If the key exists in dynamicData, return the value, otherwise return the original placeholder
                    return dynamicData[key] !== undefined ? dynamicData[key] : match;
                });
                
                // Draw the processed text onto the page
                page.drawText(processedText, {
                    x: element.x || 50,
                    y: element.y || 750,
                    font: font,
                    size: element.fontSize || 12,
                    color: rgb(0, 0, 0), // You could make color dynamic too
                });
            }
            // Add other element types like 'image' here if needed
        }
        
        const pdfBytes = await pdfDoc.save();

        // 5. SEND THE COMPLETED PDF (Correct)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated-document.pdf"');
        return res.status(200).send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}