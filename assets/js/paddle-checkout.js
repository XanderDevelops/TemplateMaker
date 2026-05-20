import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Step 1: Initialize Lemon Squeezy ---
    // Make sure you have included the Lemon.js script in your HTML file:
    // <script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
    
    // This function must be called before any other Lemon Squeezy functions.
    window.createLemonSqueezy();

    // The Setup function is primarily for handling events like checkout success.
    LemonSqueezy.Setup({
        eventHandler: (event) => {
            // You can use this callback to handle successful purchases
            if (event.event === 'Checkout.Success') {
                console.log('Checkout completed!', event.data);
                // The primary way to grant access is via webhooks on your server.
                // This client-side event can be used for UI updates, like showing a thank you message
                // or redirecting the user.
                // window.location.href = '/dashboard.html?upgraded=true';
            }
        }
    });

    // --- Step 2: Add Event Listeners to Checkout Buttons ---
    const checkoutButtons = document.querySelectorAll('.lemonsqueezy-button'); // Use a different class for clarity

    checkoutButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault(); // Always prevent the default link behavior
            
            // For Lemon Squeezy, you often use the variant ID.
            const variantId = e.currentTarget.dataset.variantId;
            if (!variantId) {
                // This handles a free "Starter" plan button which doesn't need a checkout
                window.location.href = '/tool.html';
                return;
            }

            // --- Step 3: Check if User is Logged In ---
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // --- User is logged in: Get checkout URL from the server and open it ---
                button.disabled = true;
                button.textContent = 'Processing...';

                try {
                    // Call a Supabase Edge Function to create a checkout link.
                    // This is more secure as it keeps your API keys on the server.
                    const { data, error } = await supabase.functions.invoke('lemonsqueezy-checkout', {
                        body: { 
                            variant_id: variantId, 
                            user_email: user.email,
                            // You can pass other metadata here if needed
                            user_id: user.id 
                        },
                    });

                    if (error) throw error;
                    if (!data?.url) throw new Error('No checkout URL returned from the server.');

                    // Use LemonSqueezy's method to open the checkout overlay.
                    LemonSqueezy.Url.Open(data.url);

                } catch (err) {
                    console.error('Error creating checkout session:', err);
                    alert(`Error: ${err.message}`);
                } finally {
                    button.disabled = false;
                    button.textContent = 'Upgrade'; // Reset button text
                }

            } else {
                // --- User is NOT logged in: Redirect them to the login page ---
                alert('Please log in or sign up to upgrade your plan.');
                window.location.href = '/login.html';
            }
        });
    });
});