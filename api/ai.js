const DEFAULT_MODEL = 'gemini-2.5-flash';
const GOOGLE_GENERATE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getGoogleAiApiKey() {
    return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getModelName(value) {
    const model = String(value || DEFAULT_MODEL).trim();
    return /^[a-zA-Z0-9._-]+$/.test(model) ? model : DEFAULT_MODEL;
}

async function readErrorMessage(response) {
    const data = await response.json().catch(() => null);
    return data?.error?.message || data?.message || `HTTP ${response.status}`;
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = getGoogleAiApiKey();
    if (!apiKey) {
        return res.status(500).json({
            error: 'Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel.'
        });
    }

    try {
        const { model, payload, stream = false } = req.body || {};
        if (!payload || typeof payload !== 'object') {
            return res.status(400).json({ error: 'Missing AI request payload.' });
        }

        const modelName = getModelName(model);
        const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
        const upstreamUrl = `${GOOGLE_GENERATE_BASE}/${modelName}:${action}`;

        const upstream = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!upstream.ok) {
            const message = await readErrorMessage(upstream);
            return res.status(upstream.status).json({ error: { message } });
        }

        if (stream) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');

            if (!upstream.body) {
                return res.end();
            }

            const reader = upstream.body.getReader();
            const pump = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
                res.end();
            };

            await pump();
            return;
        }

        const data = await upstream.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('AI proxy error:', error);
        return res.status(500).json({ error: { message: 'AI request failed.' } });
    }
}
