import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- IMPORTANT ---
// Replace with your actual Supabase URL and Anon Key
const supabaseUrl = 'https://mzdhdmfjwdpolrxraqtv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16ZGhkbWZqd2Rwb2xyeHJhcXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2NTY2OTgsImV4cCI6MjA3MTIzMjY5OH0.Re6kyyBIfHQfSHV21TMedxn3huugVpiWFt-7LTiOA-g';
// -----------------

export const supabase = createClient(supabaseUrl, supabaseKey);