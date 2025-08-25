import { supabase } from './supabase-client.js';

const navLinksContainer = document.getElementById('nav-links');
const loginForm = document.getElementById('login-form');
const googleLoginBtn = document.getElementById('google-login-btn');
const toggleSignupLink = document.getElementById('toggle-signup');
const authError = document.getElementById('auth-error');

let isSignup = false;

// --- Render Nav Links based on Auth State ---
const renderNav = (user) => {
    if (!navLinksContainer) return;
    navLinksContainer.innerHTML = '';
    
    // MODIFICATION: Added the pricing link here
    let linksHtml = `
        <a href="/#pricing">Pricing</a>
        <a href="/store.html">Store</a>
    `;

    if (user) {
        linksHtml += `
            <a href="/dashboard.html">Dashboard</a>
            <a href="#" id="logout-btn">Logout</a>
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
            window.location.href = '/dashboard.html';
        }
    });
}

// --- Handle Google Auth ---
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
        });
        if (error) {
            authError.textContent = error.message;
        }
    });
}


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
        window.location.href = '/dashboard.html';
    }
    
    return user;
};

// Check user on initial load
checkUser();

// Listen for auth state changes
supabase.auth.onAuthStateChange((_event, session) => {
    renderNav(session?.user);
});