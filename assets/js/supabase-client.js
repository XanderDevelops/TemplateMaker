import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- IMPORTANT ---
// Replace with your actual Supabase URL and Anon Key
const supabaseUrl = 'https://mzdhdmfjwdpolrxraqtv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16ZGhkbWZqd2Rwb2xyeHJhcXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2NTY2OTgsImV4cCI6MjA3MTIzMjY5OH0.Re6kyyBIfHQfSHV21TMedxn3huugVpiWFt-7LTiOA-g';
// -----------------

export const supabase = createClient(supabaseUrl, supabaseKey);

const CSVLINK_ANONYMOUS_SESSION_KEY = 'csvlink-anonymous-session-id';
const CSVLINK_PENDING_LOGIN_METHOD_KEY = 'csvlink-pending-login-method';

function getAnonymousSessionId() {
    if (typeof window === 'undefined') return null;

    try {
        let sessionId = localStorage.getItem(CSVLINK_ANONYMOUS_SESSION_KEY);
        if (!sessionId) {
            sessionId = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            localStorage.setItem(CSVLINK_ANONYMOUS_SESSION_KEY, sessionId);
        }
        return sessionId;
    } catch (error) {
        return null;
    }
}

function normalizeActivityMetadata(metadata = {}) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

    try {
        return JSON.parse(JSON.stringify(metadata, (_key, value) => {
            if (typeof value === 'undefined') return null;
            if (value instanceof File) {
                return {
                    name: value.name,
                    size: value.size,
                    type: value.type || null
                };
            }
            return value;
        }));
    } catch (error) {
        return { note: 'metadata_not_serializable' };
    }
}

function normalizeActivityStatus(status, eventName = '') {
    const raw = String(status || '').trim().toLowerCase();
    if (['info', 'success', 'error', 'pending'].includes(raw)) return raw;

    const event = String(eventName || '').toLowerCase();
    if (/\b(failed|failure|error|denied)\b/.test(event)) return 'error';
    if (/\b(success|logged_in|downloaded|created|imported)\b/.test(event)) return 'success';
    return 'info';
}

function normalizeActivityText(value, maxLength = 500) {
    if (value === null || typeof value === 'undefined') return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function getUserFullName(user) {
    const metadata = user?.user_metadata || {};
    return normalizeActivityText(
        metadata.full_name || metadata.name || metadata.display_name || metadata.user_name,
        180
    );
}

function getActivityErrorCode(errorLike) {
    if (!errorLike || typeof errorLike !== 'object') return null;
    return normalizeActivityText(errorLike.code || errorLike.error_code || errorLike.status || errorLike.name, 120);
}

function getActivityErrorMessage(errorLike) {
    if (!errorLike) return null;
    if (typeof errorLike === 'string') return normalizeActivityText(errorLike, 500);
    return normalizeActivityText(errorLike.message || errorLike.msg || errorLike.error_description || String(errorLike), 500);
}

function isActivityLogSchemaError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return error?.code === 'PGRST204'
        || message.includes('schema cache')
        || message.includes('could not find')
        || message.includes('event_status')
        || message.includes('error_message')
        || message.includes('full_name');
}

async function insertActivityLog(payload) {
    const { error } = await supabase
        .from('activity_logs')
        .insert(payload);

    return error;
}

export function setPendingLoginMethod(method = 'unknown') {
    try {
        localStorage.setItem(CSVLINK_PENDING_LOGIN_METHOD_KEY, String(method || 'unknown'));
    } catch (error) {
        // Ignore storage failures so auth still works.
    }
}

export function clearPendingLoginMethod() {
    try {
        localStorage.removeItem(CSVLINK_PENDING_LOGIN_METHOD_KEY);
    } catch (error) {
        // Ignore storage failures so auth still works.
    }
}

export async function logActivity(eventName, metadata = {}, options = {}) {
    if (!eventName || typeof window === 'undefined') return null;

    try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        const user = session?.user || null;
        const userId = options.userId || user?.id || null;
        const eventStatus = normalizeActivityStatus(options.status || metadata.event_status || metadata.status, eventName);
        const errorCode = normalizeActivityText(
            options.errorCode || metadata.error_code || getActivityErrorCode(options.error),
            120
        );
        const errorMessage = normalizeActivityText(
            options.errorMessage || metadata.error_message || getActivityErrorMessage(options.error),
            500
        );
        const email = normalizeActivityText(options.email || metadata.email || user?.email, 320);
        const fullName = normalizeActivityText(options.fullName || metadata.full_name || getUserFullName(user), 180);
        const payload = {
            user_id: userId,
            event_name: String(eventName).trim(),
            event_status: eventStatus,
            error_code: errorCode,
            error_message: errorMessage,
            email,
            full_name: fullName,
            page_path: window.location.pathname || '/',
            page_url: window.location.href || null,
            referrer: document.referrer || null,
            user_agent: navigator.userAgent || null,
            anonymous_session_id: getAnonymousSessionId(),
            metadata: normalizeActivityMetadata(metadata)
        };

        const error = await insertActivityLog(payload);

        if (error) {
            if (isActivityLogSchemaError(error)) {
                const fallbackPayload = {
                    ...payload,
                    metadata: normalizeActivityMetadata({
                        ...metadata,
                        event_status: eventStatus,
                        error_code: errorCode,
                        error_message: errorMessage,
                        email,
                        full_name: fullName,
                        activity_log_schema_fallback: true
                    })
                };
                delete fallbackPayload.event_status;
                delete fallbackPayload.error_code;
                delete fallbackPayload.error_message;
                delete fallbackPayload.email;
                delete fallbackPayload.full_name;

                const fallbackError = await insertActivityLog(fallbackPayload);
                if (!fallbackError) return { ok: true, fallback: true };
            }

            console.warn('CSVLink activity log was not saved:', error.message || error);
            return null;
        }

        return { ok: true };
    } catch (error) {
        console.warn('CSVLink activity log failed:', error);
        return null;
    }
}

async function logInitialActivity() {
    if (typeof window === 'undefined' || window.__csvlinkInitialActivityLogged) return;
    window.__csvlinkInitialActivityLogged = true;

    await logActivity('accessed_site', {
        page_title: document.title || null
    });

    try {
        const pendingLoginMethod = localStorage.getItem(CSVLINK_PENDING_LOGIN_METHOD_KEY);
        if (!pendingLoginMethod) return;

        const { data: { session } = {} } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        await logActivity('logged_in', {
            method: pendingLoginMethod
        }, {
            status: 'success',
            userId: session.user.id
        });
        clearPendingLoginMethod();
    } catch (error) {
        // Do not block the app if the login event cannot be logged.
    }
}

if (typeof window !== 'undefined') {
    window.csvlinkLogActivity = logActivity;
    window.csvlinkSetPendingLoginMethod = setPendingLoginMethod;
    window.csvlinkClearPendingLoginMethod = clearPendingLoginMethod;
    queueMicrotask(logInitialActivity);
}
