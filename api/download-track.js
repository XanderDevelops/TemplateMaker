import { createClient } from '@supabase/supabase-js';

const DISCOVERY_SOURCES = new Set([
    'youtube',
    'google_search',
    'instagram',
    'friend',
    'linkedin',
    'reddit',
    'prefer_not_to_say'
]);

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    return createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

function cleanText(value, maxLength = 500) {
    if (value === null || typeof value === 'undefined') return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, maxLength);
}

async function getAnonymousDownload(supabase, downloadId, anonymousSessionId) {
    if (!downloadId || !anonymousSessionId) return null;

    const { data, error } = await supabase
        .from('downloads')
        .select('id')
        .eq('id', downloadId)
        .is('user_id', null)
        .eq('anonymous_session_id', anonymousSessionId)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabase = getSupabaseAdmin();
    if (!supabase) {
        return res.status(503).json({ error: 'Download tracking is not configured.' });
    }

    let body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof req.body === 'string') {
        try {
            body = JSON.parse(req.body);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid JSON body.' });
        }
    }
    const action = cleanText(body.action, 40) || 'create';
    const anonymousSessionId = cleanText(body.anonymous_session_id, 180);

    try {
        if (action === 'create') {
            if (!anonymousSessionId) {
                return res.status(400).json({ error: 'Anonymous session id is required.' });
            }

            const title = cleanText(body.title, 300) || 'Untitled_Template';
            const templateData = body.template_data && typeof body.template_data === 'object'
                ? body.template_data
                : {};

            const { data, error } = await supabase
                .from('downloads')
                .insert({
                    user_id: null,
                    anonymous_session_id: anonymousSessionId,
                    title,
                    template_data: templateData,
                    preview_url: null
                })
                .select('id, title, created_at')
                .single();

            if (error) throw error;
            return res.status(200).json({ download: data });
        }

        if (action === 'feedback') {
            const download = await getAnonymousDownload(
                supabase,
                cleanText(body.download_id, 80),
                anonymousSessionId
            );
            if (!download) return res.status(404).json({ error: 'Download record not found.' });

            const rating = Number(body.feedback_rating);
            if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Feedback rating must be between 1 and 5.' });
            }

            const { error } = await supabase
                .from('downloads')
                .update({
                    feedback_rating: rating,
                    feedback_text: cleanText(body.feedback_text, 4000),
                    feedback_submitted_at: new Date().toISOString()
                })
                .eq('id', download.id);

            if (error) throw error;
            return res.status(200).json({ ok: true });
        }

        if (action === 'discovery') {
            const download = await getAnonymousDownload(
                supabase,
                cleanText(body.download_id, 80),
                anonymousSessionId
            );
            if (!download) return res.status(404).json({ error: 'Download record not found.' });

            const source = cleanText(body.source, 80);
            if (!source || !DISCOVERY_SOURCES.has(source)) {
                return res.status(400).json({ error: 'Invalid discovery source.' });
            }

            const { error } = await supabase
                .from('surveys')
                .insert({
                    user_id: null,
                    download_id: download.id,
                    source
                });

            if (error) throw error;
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown tracking action.' });
    } catch (error) {
        console.error('Anonymous download tracking failed:', error);
        return res.status(500).json({ error: 'Could not save download tracking.' });
    }
}
