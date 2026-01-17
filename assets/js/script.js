import { supabase } from './supabase-client.js';

const navLinksContainer = document.getElementById('nav-links');
const loginForm = document.getElementById('login-form');
const googleLoginBtn = document.getElementById('google-login-btn');
const toggleSignupLink = document.getElementById('toggle-signup');
const authError = document.getElementById('auth-error');
const params = new URLSearchParams(window.location.search);
const redirectTo = params.get("redirect") || "/dashboard.html";

let isSignup = false;

// --- Render Nav Links based on Auth State ---
const renderNav = (user) => {
    if (!navLinksContainer) return;
    navLinksContainer.innerHTML = '';

    let linksHtml = `
        <a href="/store.html" title="Store" class="btn ghost icon-only"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg></a>
    `;

    if (user) {
        linksHtml += `
            <a href="/dashboard.html" title="Dashboard"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></a>
            <a href="#" id="logout-btn" title="Logout"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></a>
        `;
    } else {
        linksHtml += `
            <a href="/login.html" class="btn">Login</a>
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
        authError.textContent = '';
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        let response;
        if (isSignup) {
            response = await supabase.auth.signUp({ email, password });
        } else {
            response = await supabase.auth.signInWithPassword({ email, password });
        }

        if (response.error) {
            authError.textContent = response.error.message;
        } else {
            window.location.href = redirectTo;
        }
    });
}

// --- Handle Google Auth ---if (googleLoginBtn) {
googleLoginBtn.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/login.html?redirect=' + encodeURIComponent(redirectTo)
        }
    });
    if (error) {
        authError.textContent = error.message;
    }
});


// --- Toggle between Login and Signup view ---
if (toggleSignupLink) {
    toggleSignupLink.addEventListener('click', () => {
        isSignup = !isSignup;
        const formContainer = document.querySelector('.form-container');
        const h1 = formContainer.querySelector('h1');
        const submitBtn = formContainer.querySelector('button[type="submit"]');

        if (isSignup) {
            h1.textContent = 'Sign Up';
            submitBtn.textContent = 'Sign Up';
            toggleSignupLink.textContent = 'Log in';
            formContainer.querySelector('p:last-of-type').childNodes[0].nodeValue = 'Already have an account? ';
        } else {
            h1.textContent = 'Log in';
            submitBtn.textContent = 'Log in';
            toggleSignupLink.textContent = 'Sign up';
            formContainer.querySelector('p:last-of-type').childNodes[0].nodeValue = "Don't have an account? ";
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
    if (user && window.location.pathname.includes('login.html')) {
        window.location.href = redirectTo;
    }

    return user;
};

// Check user on initial load
checkUser();

// Listen for auth state changes
supabase.auth.onAuthStateChange((_event, session) => {
    renderNav(session?.user);
});