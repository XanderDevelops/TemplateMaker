import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const FREE_EXPORT_LIMIT = 10;
const DEVICE_COOKIE_NAME = 'csvlink_free_device';
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

    const claim = {
        user_id: user?.id || null,
        device_hash: hmac(`device:${deviceToken}`, hashSecret),
        browser_hash: hmac(`browser:${effectiveBrowserId}`, hashSecret),
        fingerprint_hash: hmac(`fingerprint:${effectiveFingerprint}`, hashSecret),
        ip_hash: hmac(`ip:${ip}`, hashSecret),
        fingerprint_ip_hash: hmac(`fingerprint-ip:${effectiveFingerprint}|${ip}`, hashSecret),
        export_type: normalizeText(req.body?.exportType || 'document_export', 80) || 'document_export',
        output_count: outputCount
    };

    const { error } = await supabase.from('free_export_claims').insert(claim);
    if (error) {
        if (error.code === '23505') {
            return res.status(429).json({
                allowed: false,
                reason: 'daily_limit_reached',
                limit: FREE_EXPORT_LIMIT,
                nextAvailableAt: getNextUtcDayIso()
            });
        }

        console.error('Could not record free export claim:', error);
        return res.status(503).json({
            allowed: false,
            reason: 'claim_failed',
            error: 'CSVLink could not verify today\'s free export. Please try again.'
        });
    }

    return res.status(200).json({
        allowed: true,
        paid: false,
        limit: FREE_EXPORT_LIMIT,
        remainingToday: 0,
        nextAvailableAt: getNextUtcDayIso()
    });
}
