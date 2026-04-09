import { supabase } from './supabase-client.js';

const navLinksContainer = document.getElementById('nav-links');
const loginForm = document.getElementById('login-form');
const googleLoginBtn = document.getElementById('google-login-btn');
const toggleSignupLink = document.getElementById('toggle-signup');
const authError = document.getElementById('auth-error');
const forgotPasswordLink = document.getElementById('forgot-password');
const forgotPasswordContainer = document.getElementById('forgot-password-container');
const submitBtn = loginForm?.querySelector('button[type="submit"]');
const params = new URLSearchParams(window.location.search);
const redirectTo = params.get("redirect") || "/dashboard.html";

let isSignup = false;
let authBusy = false;

function pushDataLayerEvent(eventName, payload = {}) {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: eventName,
        ...payload
    });
}

async function trackSuccessfulSignup(method = 'email') {
    const payload = {
        signup_method: method,
        page_path: window.location.pathname,
        page_location: window.location.href
    };

    pushDataLayerEvent('signup_success', payload);

    const sendTo = typeof window !== 'undefined'
        ? String(window.CSVLINK_GOOGLE_ADS_SIGNUP_SEND_TO || '').trim()
        : '';

    if (typeof window.gtag !== 'function' || !sendTo || !sendTo.includes('/')) {
        return;
    }

    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        window.gtag('event', 'conversion', {
            send_to: sendTo,
            signup_method: method,
            event_callback: finish
        });

        // Fallback in case the callback never fires before redirect.
        window.setTimeout(finish, 1200);
    });
}

function setAuthBusy(isBusy) {
    authBusy = Boolean(isBusy);

    if (submitBtn) {
        submitBtn.disabled = authBusy;
        submitBtn.textContent = authBusy
            ? (isSignup ? 'Creating account...' : 'Logging in...')
            : (isSignup ? 'Sign Up' : 'Log in');
    }

    if (googleLoginBtn) {
        googleLoginBtn.disabled = authBusy;
    }

    if (toggleSignupLink) {
        toggleSignupLink.style.pointerEvents = authBusy ? 'none' : '';
        toggleSignupLink.style.opacity = authBusy ? '0.65' : '';
    }
}

// --- Render Nav Links based on Auth State ---
const renderNav = (user) => {
    if (!navLinksContainer) return;
    navLinksContainer.innerHTML = '';
    
    // MODIFICATION: Added the pricing link here
    let linksHtml = `
        <a href="/#pricing">Pricing</a>
        <a href="/store">Store</a>
    `;

    if (user) {
        linksHtml += `
            <a href="/dashboard">Dashboard</a>
            <a href="#" id="logout-btn">Logout</a>
        `;
    } else {
        linksHtml += `
            <a href="/login" class="btn">Login</a>
        `;
    }
    navLinksContainer.innerHTML = linksHtml;

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = '/';
        });
    }
};

// --- Handle Email/Password Auth ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (authBusy) return;
        authError.textContent = '';
        authError.style.color = 'var(--danger)';
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        setAuthBusy(true);

        try {
            let response;
            if (isSignup) {
                response = await supabase.auth.signUp({ email, password });
            } else {
                response = await supabase.auth.signInWithPassword({ email, password });
            }

            if (response.error) {
                const message = String(response.error.message || '').trim();
                if (isSignup && /rate limit/i.test(message)) {
                    authError.textContent = 'Too many signup emails were requested. Wait a bit, then try again, or log in if this account already exists.';
                } else {
                    authError.textContent = message || 'Authentication failed.';
                }
                return;
            }

            if (isSignup) {
                await trackSuccessfulSignup('email');

                if (!response.data?.session) {
                    authError.style.color = 'green';
                    authError.textContent = 'Account created. Check your email to confirm your account before logging in.';
                    return;
                }
            }

            window.location.href = '/dashboard';
        } finally {
            setAuthBusy(false);
        }
    });
}

// --- Handle Google Auth ---
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        if (authBusy) return;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/dashboard'
            }
        });
        if (error) {
            authError.textContent = error.message;
        }
    });
}

if (toggleSignupLink) {
    toggleSignupLink.addEventListener('click', () => {
        isSignup = !isSignup;
        const formContainer = document.querySelector('.form-container');
        const h1 = formContainer.querySelector('h1');

        if (isSignup) {
            h1.textContent = 'Sign Up';
            toggleSignupLink.textContent = 'Log in';
            formContainer.querySelector('p:last-of-type').childNodes[0].nodeValue = 'Already have an account? ';
            // Hide forgot password on signup
            if (forgotPasswordContainer) forgotPasswordContainer.style.display = 'none';
        } else {
            h1.textContent = 'Log in';
            toggleSignupLink.textContent = 'Sign up';
            formContainer.querySelector('p:last-of-type').childNodes[0].nodeValue = "Don't have an account? ";
            // Show forgot password on login
            if (forgotPasswordContainer) forgotPasswordContainer.style.display = 'block';
        }

        setAuthBusy(false);
    });
}

if (!isSignup && forgotPasswordContainer) {
    forgotPasswordContainer.style.display = 'block';
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        if (!email) {
            authError.textContent = 'Please enter your email above to reset password.';
            return;
        }

        // --- ADD THIS LINE FOR DEBUGGING ---
        const redirectToUrl = window.location.origin + '/reset-password';
        console.log("Generated Redirect URL:", redirectToUrl); // This will show the exact URL

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectToUrl
        });

        if (error) {
            authError.textContent = `Error: ${error.message}`;
        } else {
            authError.style.color = 'green';
            authError.textContent = 'Check your email for the password reset link!';
        }
    });
}

// --- Main Auth Flow ---
const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    // Render navigation based on user state
    renderNav(user);
    
    // Redirect if user is on login page but already logged in
    if (user && window.location.pathname.includes('login')) {
        window.location.href = '/dashboard';
    }
    
    return user;
};

// Check user on initial load
checkUser();

// Listen for auth state changes
supabase.auth.onAuthStateChange((_event, session) => {
    renderNav(session?.user);
});
