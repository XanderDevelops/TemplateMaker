import { createClient } from '@supabase/supabase-js';
import { fabric } from 'fabric/node';
import { jsPDF } from 'jspdf';
import nodemailer from 'nodemailer';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// The main function Vercel will run
export default async function handler(req, res) {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // --- 1. API KEY AUTHENTICATION ---
        // Get the key from the 'Authorization: Bearer YOUR_KEY' header
        const apiKey = req.headers.authorization?.split(' ')[1];

        if (!apiKey) {
            return res.status(401).json({ error: 'Authorization header is missing. Please provide an API Key.' });
        }

        // Check if the API key is valid by looking it up in your database
        // NOTE: In a high-security setup, you would store and check a HASH of the API key.
        const { data: apiKeyRecord, error: keyError } = await supabase
            .from('api_keys') // Your table for storing API keys
            .select('user_id, usage_count') // Select any columns you might need
            .eq('api_key', apiKey)          // Look for a direct match
            .single();

        if (keyError || !apiKeyRecord) {
            // If the key doesn't exist, deny access
            return res.status(403).json({ error: 'Forbidden. The provided API Key is not valid.' });
        }
        // --- AUTHENTICATION SUCCESSFUL ---


        // 2. PROCEED WITH DOCUMENT GENERATION
        const { templateId, data, delivery } = req.body;

        if (!templateId || !data) {
            return res.status(400).json({ error: 'Missing templateId or data' });
        }

        // Fetch the template belonging to the authenticated user to ensure they have access
        const { data: templateRecord, error: dbError } = await supabase
            .from('templates')
            .select('template_data')
            .eq('id', templateId)
            .eq('user_id', apiKeyRecord.user_id) // SECURITY: Ensure the template belongs to the user making the request
            .single();

        if (dbError || !templateRecord) {
            console.error('Supabase error:', dbError);
            return res.status(404).json({ error: 'Template not found or you do not have permission to access it.' });
        }
        
        const templateJSON = templateRecord.template_data;
        const pageConfig = templateJSON.page || { width: 768, height: 1024 };

        // 3. GENERATE DOCUMENT
        console.log('Generating PDF...');
        const canvas = new fabric.StaticCanvas(null, { width: pageConfig.width, height: pageConfig.height });

        const loadCanvas = () => new Promise(resolve => {
            canvas.loadFromJSON(templateJSON.canvas, resolve);
        });
        await loadCanvas();

        const bindings = new Map(templateJSON.bindings);
        canvas.getObjects().forEach(obj => {
            const objectId = obj.get('oid');
            if (objectId && bindings.has(objectId)) {
                const bindingInfo = bindings.get(objectId);
                const dataValue = data[bindingInfo.column];
                if (dataValue !== undefined) {
                    obj.set(bindingInfo.property, dataValue.toString());
                }
            }
        });
        canvas.renderAll();

        const dataUrl = canvas.toDataURL({ format: 'png' });
        const pdf = new jsPDF({
            orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, canvas.width, canvas.height);
        const pdfBuffer = pdf.output('arraybuffer');
        console.log('PDF generated successfully.');

        // 4. DELIVER THE DOCUMENT
        if (delivery && delivery.method === 'email') {
            const transporter = nodemailer.createTransport({
                 host: process.env.EMAIL_HOST, port: 587,
                 auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });
            await transporter.sendMail({
                from: '"Your App Name" <no-reply@yourapp.com>',
                to: delivery.to,
                subject: delivery.subject,
                text: delivery.body || "Please find your document attached.",
                attachments: [{
                    filename: `${templateId}.pdf`,
                    content: Buffer.from(pdfBuffer),
                    contentType: 'application/pdf'
                }]
             });
            return res.status(200).json({ success: true, message: 'Document sent.' });
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=output.pdf`);
            return res.send(Buffer.from(pdfBuffer));
        }

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Failed to generate document.' });
    }
}