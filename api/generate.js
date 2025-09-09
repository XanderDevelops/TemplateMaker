import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Initialize Supabase
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
    // 1. API Key Authentication
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

    // 2. Fetch Template
    const { templateId, data } = req.body; // <-- include customer/product data
    if (!templateId) {
      return res.status(400).json({ error: 'Missing templateId in request body.' });
    }

    const { data: templateRecord, error: dbError } = await supabase
      .from('templates')
      .select('template_data')
      .eq('id', templateId)
      .eq('user_id', apiKeyRecord.user_id)
      .single();

    if (dbError || !templateRecord) {
      return res.status(404).json({ error: 'Template not found or you do not have permission.' });
    }

    // 3. Create PDF dynamically
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { customerName, product } = data || {};

    page.drawText("Purchase Receipt", {
      x: 50, y: 350,
      size: 20, font, color: rgb(0, 0, 0),
    });

    page.drawText(`Customer: ${customerName || "N/A"}`, {
      x: 50, y: 300,
      size: 14, font
    });

    page.drawText(`Product: ${product || "N/A"}`, {
      x: 50, y: 270,
      size: 14, font
    });

    page.drawText(`Template Used: ${templateId}`, {
      x: 50, y: 240,
      size: 12, font, color: rgb(0.3, 0.3, 0.3)
    });

    const pdfBytes = await pdfDoc.save();

    // 4. Return PDF response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=receipt.pdf");
    return res.status(200).send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}
