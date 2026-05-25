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
        const userId = options.userId || session?.user?.id || null;
        const payload = {
            user_id: userId,
            event_name: String(eventName).trim(),
            page_path: window.location.pathname || '/',
            page_url: window.location.href || null,
            referrer: document.referrer || null,
            user_agent: navigator.userAgent || null,
            anonymous_session_id: getAnonymousSessionId(),
            metadata: normalizeActivityMetadata(metadata)
        };

        const { error } = await supabase
            .from('activity_logs')
            .insert(payload);

        if (error) {
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
