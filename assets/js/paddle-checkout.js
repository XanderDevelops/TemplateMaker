import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- Step 1: Initialize Paddle with your Client-side Token ---
    // IMPORTANT: Replace 'YOUR_CLIENT_SIDE_TOKEN' with your token from the Paddle dashboard.
    // It looks like 'test_...' for sandbox or 'live_...' for production.
    try {
        const { data, error } = await Paddle.Initialize({ 
            token: 'YOUR_CLIENT_SIDE_TOKEN', // <-- Replace with your Client-side Token
            environment: 'sandbox', // Use 'sandbox' for testing, 'production' for live
            eventCallback: function(data) {
                // You can use this callback to handle successful purchases
                if (data.name === "checkout.completed") {
                    console.log('Checkout completed!', data.data);
                    // Here you would typically redirect the user to a "thank you" page
                    // or update their subscription status in your database.
                    // window.location.href = '/dashboard.html?upgraded=true';
                }
            }
        });

        if (error) {
            console.error('Paddle initialization failed:', error);
            return;
        }

    } catch (err) {
        console.error('An error occurred during Paddle initialization:', err);
        return;
    }

    // --- Step 2: Add Event Listeners to Checkout Buttons ---
    const checkoutButtons = document.querySelectorAll('.paddle_button');

    checkoutButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault(); // Always prevent the default link behavior

            const priceId = e.currentTarget.dataset.priceId;
            if (!priceId) {
                // This handles the "Starter" plan button which doesn't have a price ID
                window.location.href = '/tool.html';
                return;
            }

            // --- Step 3: Check if User is Logged In ---
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;

            if (user) {
                // --- User is logged in: Open the overlay checkout ---
                Paddle.Checkout.open({
                    items: [{
                        priceId: priceId,
                        quantity: 1
                    }],
                    customer: {
                        email: user.email // Pre-fills the user's email in the checkout
                    }
                });
            } else {
                // --- User is NOT logged in: Redirect them to the login page ---
                alert('Please log in or sign up to upgrade your plan.');
                window.location.href = '/login.html';
            }
        });
    });
});