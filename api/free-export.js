import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const FREE_EXPORT_LIMIT = 10;
const DEVICE_COOKIE_NAME = 'csvlink_free_device';
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const LIMIT_DIMENSIONS = new Set(['rows', 'pages', 'documents']);

function firstHeader(value) {
    return Array.isArray(value) ? value[0] : (value || '');
}

function getHashSecret() {
    return process.env.FREE_EXPORT_HASH_SECRET || process.env.SUPABASE_SECRET_KEY || '';
}

function hmac(value, secret) {
    return createHmac('sha256', secret).update(String(value || '')).digest('hex');
}

function parseCookies(req) {
    const raw = String(firstHeader(req.headers.cookie) || '');
    return raw.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index < 0) return cookies;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signDeviceToken(token, secret) {
    return hmac(`cookie:${token}`, secret);
}

function readSignedDeviceToken(req, secret) {
    const cookieValue = parseCookies(req)[DEVICE_COOKIE_NAME];
    if (!cookieValue) return null;
    const separator = cookieValue.lastIndexOf('.');
    if (separator <= 0) return null;
    const token = cookieValue.slice(0, separator);
    const signature = cookieValue.slice(separator + 1);
    if (!/^[a-f0-9]{48}$/i.test(token)) return null;
    return safeEqual(signature, signDeviceToken(token, secret)) ? token : null;
}

function setDeviceCookie(res, token, secret) {
    const signedValue = `${token}.${signDeviceToken(token, secret)}`;
    res.setHeader('Set-Cookie', [
        `${DEVICE_COOKIE_NAME}=${encodeURIComponent(signedValue)}`,
        'Path=/',
        `Max-Age=${DEVICE_COOKIE_MAX_AGE}`,
        'HttpOnly',
        'Secure',
        'SameSite=Lax'
    ].join('; '));
}

function getClientIp(req) {
    const forwarded = String(firstHeader(req.headers['x-forwarded-for']) || '').split(',')[0].trim();
    return forwarded
        || String(firstHeader(req.headers['x-real-ip']) || '').trim()
        || String(req.socket?.remoteAddress || '').trim()
        || 'unknown';
}

function normalizeText(value, maxLength = 500) {
    return String(value || '').trim().slice(0, maxLength);
}

function getNextUtcDayIso() {
    const now = new Date();
    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
    )).toISOString();
}

async function recordDownloadLimitAttempt(supabase, payload) {
    if (!payload || payload.requested_output_count <= FREE_EXPORT_LIMIT) return null;

    try {
        const { data, error } = await supabase
            .from('download_limit_attempts')
            .insert(payload)
            .select('id')
            .single();

        if (error) {
            // Tracking must never block a legitimate export if the migration has not
            // been applied yet or Supabase analytics is temporarily unavailable.
            console.error('Could not record download limit attempt:', error);
            return null;
        }
        return data?.id || null;
    } catch (error) {
        console.error('Could not record download limit attempt:', error);
        return null;
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    const hashSecret = getHashSecret();
    if (!supabaseUrl || !serviceKey || !hashSecret) {
        return res.status(503).json({
            allowed: false,
            reason: 'configuration_missing',
            error: 'Free export verification is not configured.'
        });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    let user = null;
    const authorization = String(firstHeader(req.headers.authorization) || '');
    if (authorization.startsWith('Bearer ')) {
        const token = authorization.slice(7).trim();
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) {
            return res.status(401).json({
                allowed: false,
                reason: 'invalid_session',
                error: 'Your session expired. Please log in again.'
            });
        }
        user = data.user;
    }

    if (user?.id) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        const role = String(profile?.role || 'free').toLowerCase();
        if (role === 'pro' || role === 'admin') {
            return res.status(200).json({ allowed: true, paid: true, limit: null });
        }
    }

    const outputCount = Number.parseInt(req.body?.outputCount, 10);
    if (!Number.isFinite(outputCount) || outputCount < 1 || outputCount > FREE_EXPORT_LIMIT) {
        return res.status(400).json({
            allowed: false,
            reason: 'invalid_output_count',
            error: `Free exports are limited to ${FREE_EXPORT_LIMIT} documents.`
        });
    }

    const parsedRequestedOutputCount = Number.parseInt(req.body?.requestedOutputCount, 10);
    const requestedOutputCount = Number.isFinite(parsedRequestedOutputCount)
        ? Math.max(outputCount, Math.min(parsedRequestedOutputCount, 1000000))
        : outputCount;
    const limitDimensionRaw = normalizeText(req.body?.limitDimension || 'documents', 40).toLowerCase();
    const limitDimension = LIMIT_DIMENSIONS.has(limitDimensionRaw) ? limitDimensionRaw : 'documents';

    let deviceToken = readSignedDeviceToken(req, hashSecret);
    if (!deviceToken) {
        deviceToken = randomBytes(24).toString('hex');
        setDeviceCookie(res, deviceToken, hashSecret);
    }

    const browserId = normalizeText(req.body?.browserId, 200);
    const fingerprint = normalizeText(req.body?.fingerprint, 1200);
    const ip = getClientIp(req);
    const effectiveBrowserId = browserId.length >= 12 ? browserId : `cookie:${deviceToken}`;
    const effectiveFingerprint = fingerprint.length >= 20 ? fingerprint : `browser:${effectiveBrowserId}`;

    const identity = {
        user_id: user?.id || null,
        anonymous_session_id: browserId.length >= 12 ? browserId : null,
        device_hash: hmac(`device:${deviceToken}`, hashSecret),
        browser_hash: hmac(`browser:${effectiveBrowserId}`, hashSecret),
        fingerprint_hash: hmac(`fingerprint:${effectiveFingerprint}`, hashSecret),
        ip_hash: hmac(`ip:${ip}`, hashSecret),
        fingerprint_ip_hash: hmac(`fingerprint-ip:${effectiveFingerprint}|${ip}`, hashSecret)
    };

    const exportType = normalizeText(req.body?.exportType || 'document_export', 80) || 'document_export';
    const templateTitle = normalizeText(req.body?.templateTitle || 'Untitled_Template', 300) || 'Untitled_Template';

    const claim = {
        user_id: identity.user_id,
        device_hash: identity.device_hash,
        browser_hash: identity.browser_hash,
        fingerprint_hash: identity.fingerprint_hash,
        ip_hash: identity.ip_hash,
        fingerprint_ip_hash: identity.fingerprint_ip_hash,
        export_type: exportType,
        output_count: outputCount
    };

    const limitAttemptBase = requestedOutputCount > FREE_EXPORT_LIMIT
        ? {
            ...identity,
            template_title: templateTitle,
            export_type: exportType,
            limit_dimension: limitDimension,
            requested_output_count: requestedOutputCount,
            free_limit: FREE_EXPORT_LIMIT,
            blocked_output_count: Math.max(0, requestedOutputCount - outputCount)
        }
        : null;

    const { error } = await supabase.from('free_export_claims').insert(claim);
    if (error) {
        if (error.code === '23505') {
            const limitAttemptId = await recordDownloadLimitAttempt(supabase, limitAttemptBase && {
                ...limitAttemptBase,
                allowed_output_count: 0,
                blocked_output_count: requestedOutputCount,
                outcome: 'daily_limit_reached'
            });

            return res.status(429).json({
                allowed: false,
                reason: 'daily_limit_reached',
                limit: FREE_EXPORT_LIMIT,
                limitAttemptId,
                nextAvailableAt: getNextUtcDayIso()
            });
        }

        const limitAttemptId = await recordDownloadLimitAttempt(supabase, limitAttemptBase && {
            ...limitAttemptBase,
            allowed_output_count: 0,
            blocked_output_count: requestedOutputCount,
            outcome: 'claim_failed'
        });

        console.error('Could not record free export claim:', error);
        return res.status(503).json({
            allowed: false,
            reason: 'claim_failed',
            limitAttemptId,
            error: 'CSVLink could not verify today\'s free export. Please try again.'
        });
    }

    const limitAttemptId = await recordDownloadLimitAttempt(supabase, limitAttemptBase && {
        ...limitAttemptBase,
        allowed_output_count: outputCount,
        outcome: 'partial_export_granted'
    });

    return res.status(200).json({
        allowed: true,
        paid: false,
        limit: FREE_EXPORT_LIMIT,
        limitAttemptId,
        remainingToday: 0,
        nextAvailableAt: getNextUtcDayIso()
    });
}
