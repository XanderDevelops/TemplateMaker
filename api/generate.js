import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib"; // pdf-lib works on Vercel, no native deps

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const apiKey = req.headers.authorization?.split(" ")[1];
    if (!apiKey) return res.status(401).json({ error: "Authorization header missing." });

    // Validate API key
    const { data: apiKeyRecord } = await supabase
      .from("api_keys")
      .select("user_id")
      .eq("api_key", apiKey)
      .single();

    if (!apiKeyRecord) {
      return res.status(403).json({ error: "Forbidden. Invalid API Key." });
    }

    const { templateId, customer } = req.body;
    if (!templateId || !customer) {
      return res.status(400).json({ error: "Missing templateId or customer data" });
    }

    // Fetch template JSON (even if we don’t use it fully yet)
    const { data: templateRecord } = await supabase
      .from("templates")
      .select("template_data")
      .eq("id", templateId)
      .eq("user_id", apiKeyRecord.user_id)
      .single();

    if (!templateRecord) {
      return res.status(404).json({ error: "Template not found" });
    }

    // --- Generate simple PDF ---
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(`Invoice for ${customer.name}`, { x: 50, y: 350, size: 20 });
    page.drawText(`Product: ${customer.product}`, { x: 50, y: 300 });
    page.drawText(`Price: $${customer.price}`, { x: 50, y: 280 });

    const pdfBytes = await pdfDoc.save();

    // --- Upload to Supabase Storage ---
    const fileName = `invoices/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, pdfBytes, { contentType: "application/pdf" });

    if (uploadError) throw uploadError;

    // --- Get public URL ---
    const { data: publicUrl } = supabase.storage.from("documents").getPublicUrl(fileName);

    return res.status(200).json({
      success: true,
      url: publicUrl.publicUrl,
    });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
