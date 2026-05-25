import { supabase } from './supabase-client.js?v=20260525b';

const LOGIN_RETURN_PATH = '/#pricing';

function buildCheckoutUrl(baseUrl, user, plan) {
    const url = new URL(baseUrl);
    url.searchParams.set('checkout[email]', user.email || '');
    url.searchParams.set('checkout[custom][user_id]', user.id);
    url.searchParams.set('checkout[custom][supabase_user_id]', user.id);
    url.searchParams.set('checkout[custom][user_email]', user.email || '');
    url.searchParams.set('checkout[custom][plan]', plan || 'pro');
    return url.toString();
}

function setButtonBusy(button, isBusy) {
    button.dataset.originalText ||= button.textContent;
    button.setAttribute('aria-busy', String(isBusy));
    button.style.pointerEvents = isBusy ? 'none' : '';
    button.textContent = isBusy ? 'Checking account...' : button.dataset.originalText;
}

document.addEventListener('DOMContentLoaded', () => {
    const checkoutButtons = document.querySelectorAll('a.lemonsqueezy-button[href]');

    checkoutButtons.forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();

            if (button.getAttribute('aria-busy') === 'true') return;

            setButtonBusy(button, true);

            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error) throw error;

                if (!user) {
                    const redirect = encodeURIComponent(LOGIN_RETURN_PATH);
                    window.location.href = `/login?redirect=${redirect}`;
                    return;
                }

                const plan = button.dataset.plan
                    || (button.textContent.toLowerCase().includes('annual') ? 'annual-pro' : 'monthly-pro');
                const checkoutUrl = buildCheckoutUrl(button.href, user, plan);

                if (window.LemonSqueezy?.Url?.Open) {
                    window.LemonSqueezy.Url.Open(checkoutUrl);
                } else {
                    window.location.href = checkoutUrl;
                }
            } catch (error) {
                console.error('Unable to open checkout:', error);
                const redirect = encodeURIComponent(LOGIN_RETURN_PATH);
                window.location.href = `/login?redirect=${redirect}`;
            } finally {
                setButtonBusy(button, false);
            }
        }, true);
    });
});
