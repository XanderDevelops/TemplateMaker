import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- Get references to DOM elements ---
    const templateGrid = document.getElementById('template-grid');
    const categoryList = document.getElementById('category-list');
    const previewModal = document.getElementById('preview-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalCanvasEl = document.getElementById('modal-canvas');
    
    // --- Configuration and State Variables ---
    const PADDLE_CLIENT_TOKEN = 'test_3d5ff71e58015d190b1a3b42991'; // Your public client-side token
    let allTemplates = [];
    let purchasedTemplateIds = new Set();
    let modalCanvas;
    let activePurchaseDetails = null; 

    // --- Initialize Paddle.js ---
    // Now this code will run only after the Paddle script is available.
    try {
        Paddle.Environment.set('sandbox');
        Paddle.Initialize({
            token: PADDLE_CLIENT_TOKEN,
            eventCallback: async function(data) { // Make this function async
                console.log('Paddle event:', data);
                if (data.name === 'checkout.completed') {
                    console.log('Transaction completed:', data.data);
                    
                    // If we have details from an active purchase, grant access
                    if (activePurchaseDetails) {
                        await grantTemplateAccess(activePurchaseDetails.userId, activePurchaseDetails.templateId);
                        activePurchaseDetails = null; // Clear it out after use
                    }
                    
                    // Now reload the store data. It will find the new purchase.
                    await loadStoreData(); 
                }
            }
        });
    } catch (e) {
        console.error("Failed to initialize Paddle. Make sure the Paddle.js script is included in your HTML.", e);
        alert("There was a problem setting up the payment system.");
    }

    const grantTemplateAccess = async (userId, templateId) => {
        try {
            const { error } = await supabase
                .from('purchased_templates')
                .insert({ user_id: userId, template_id: templateId });

            if (error) {
                throw error;
            }
            console.log(`Successfully granted access for user ${userId} to template ${templateId}`);
        } catch (error) {
            console.error('Error granting template access:', error);
            // Optionally alert the user that there was an issue and to contact support
            alert('Your payment was successful, but there was an error granting access automatically. Please contact support.');
        }
    };

    // --- Render Templates in the Grid ---
    const renderTemplates = (templatesToRender) => {
        templateGrid.innerHTML = '';
        if (templatesToRender.length === 0) {
            templateGrid.innerHTML = '<p>No templates found for this category.</p>';
            return;
        }

        templatesToRender.forEach(template => {
            const isPurchased = purchasedTemplateIds.has(template.id);
            const isFree = !template.price || parseFloat(template.price) === 0;

            const card = document.createElement('div');
            card.className = 'template-card';
            card.dataset.templateId = template.id;

            let buttonHtml = '';
            if (isPurchased || isFree) {
                buttonHtml = `<button class="btn use-template-btn" data-template-id="${template.id}">Use This Template</button>`;
            } else {
                buttonHtml = `<button class="btn buy-template-btn" data-template-id="${template.id}">$${template.price}</button>`;
            }
            
            card.innerHTML = `
                <div class="preview">
                    <canvas id="preview-${template.id}"></canvas>
                </div>
                <div class="info">
                    <h4>${template.title}</h4>
                    <p style="color:#aaa; font-size: 0.9em; min-height: 2.7em;">${template.description || ''}</p>
                </div>
                <div class="actions">
                    <div class="button-group">
                        ${buttonHtml}
                    </div>
                </div>
            `;
            templateGrid.appendChild(card);
            renderCardPreview(template);
        });
    };

    // --- Render the Small Preview on a Card ---
    const renderCardPreview = (template) => {
        const canvasEl = document.getElementById(`preview-${template.id}`);
        if (!canvasEl) return;
        
        const staticCanvas = new fabric.StaticCanvas(canvasEl.id, {
            width: canvasEl.parentElement.clientWidth,
            height: canvasEl.parentElement.clientHeight,
        });

        if (template.preview_url) {
            staticCanvas.loadFromJSON(template.preview_url, () => {
                const group = new fabric.Group(staticCanvas.getObjects());
                const scale = Math.min(staticCanvas.width / group.width, staticCanvas.height / group.height) * 0.9;
                staticCanvas.setViewportTransform([scale, 0, 0, scale, (staticCanvas.width - group.width * scale) / 2, (staticCanvas.height - group.height * scale) / 2]);
                group.destroy();
                staticCanvas.renderAll();
            });
        }
    };

    // --- Modal Logic ---
    const openPreviewModal = (template) => {
        previewModal.style.display = 'flex';
        if (!modalCanvas) {
            modalCanvas = new fabric.StaticCanvas('modal-canvas');
        }

        const modalBody = modalCanvasEl.parentElement;
        modalCanvas.setWidth(modalBody.clientWidth);
        modalCanvas.setHeight(modalBody.clientHeight);
        
        if (template.preview_url) {
            modalCanvas.loadFromJSON(template.preview_url, () => {
                const group = new fabric.Group(modalCanvas.getObjects());
                const scale = Math.min(modalCanvas.width / group.width, modalCanvas.height / group.height) * 0.95;
                modalCanvas.setViewportTransform([scale, 0, 0, scale, (modalCanvas.width - group.width * scale) / 2, (modalCanvas.height - group.height * scale) / 2]);
                group.destroy();
                modalCanvas.renderAll();
            });
        }
    };

    closeModalBtn.addEventListener('click', () => {
        previewModal.style.display = 'none';
        if (modalCanvas) modalCanvas.clear();
    });

    // --- Category Filtering Logic ---
    categoryList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            document.querySelector('#category-list li.active').classList.remove('active');
            e.target.classList.add('active');
            
            const category = e.target.dataset.category;
            if (category === 'all') {
                renderTemplates(allTemplates);
            } else {
                const filtered = allTemplates.filter(t => t.category === category);
                renderTemplates(filtered);
            }
        }
    });

    // --- Unified Action Logic ---
    templateGrid.addEventListener('click', async (e) => {
        const buyButton = e.target.closest('.buy-template-btn');
        if (buyButton) {
            e.preventDefault();
            e.stopPropagation();

            buyButton.disabled = true;
            buyButton.textContent = 'Processing...';

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = '/login.html';
                return;
            }

            const templateId = buyButton.dataset.templateId;
            const templateData = allTemplates.find(t => t.id === templateId);
            if (!templateData || !templateData.paddle_price_id) {
                alert('This product is not configured for sale.');
                buyButton.disabled = false;
                buyButton.textContent = `$${templateData?.price || '0'}`;
                return;
            }

            try {
                activePurchaseDetails = {
                    userId: user.id,
                    templateId: templateId
                };

                const { data, error } = await supabase.functions.invoke('paddle-wrapper', {
                    body: { price_id: templateData.paddle_price_id, user_email: user.email, template_id: templateId, user_id: user.id },
                });

                if (error) throw error;
                if (!data?.url) throw new Error('No checkout URL returned from the server.');

                // ===================================================================
                // === THIS IS THE FINAL FIX FOR URL PARSING ===
                // The server is returning a redirect URL like:
                // "https://.../store.html?_ptxn=txn_123"
                // We need to parse the '_ptxn' query parameter.

                const checkoutUrl = new URL(data.url);
                const transactionId = checkoutUrl.searchParams.get('_ptxn'); 

                if (!transactionId || !transactionId.startsWith('txn_')) {
                    // This is the error message you were seeing.
                    throw new Error('Transaction ID not found in the URL from the server.');
                }
                // ===================================================================

                // This will now work correctly
                Paddle.Checkout.open({ transactionId: transactionId });
                
                buyButton.disabled = false;
                buyButton.textContent = `$${templateData.price}`;

            } catch (error) {
                // --- CLEAR THE DETAILS IF THE PROCESS FAILS ---
                activePurchaseDetails = null; 
                alert(`Error: ${error.message}`);
                console.error(error);
                buyButton.disabled = false;
                buyButton.textContent = `${templateData.price}`;
            }
            return;
        }
        
        const useButton = e.target.closest('.use-template-btn');
        if (useButton) {
            e.preventDefault();
            e.stopPropagation();

            useButton.disabled = true;
            useButton.textContent = 'Preparing...';

            const templateId = useButton.dataset.templateId;
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = '/login.html';
                return;
            }

            const { data: storeTemplate, error } = await supabase.from('store_templates').select('title, template_data').eq('id', templateId).single();

            if (error) {
                alert('Error fetching template details.');
                console.error(error);
                return;
            }

            const { data: newTemplate, error: insertError } = await supabase.from('templates').insert({ user_id: user.id, title: storeTemplate.title, template_data: storeTemplate.template_data, preview_url: storeTemplate.template_data.canvas }).select('id').single();

            if (insertError) {
                alert('Could not create your copy of the template.');
                console.error(insertError);
            } else {
                window.location.href = `/tool.html?id=${newTemplate.id}`;
            }
            return;
        }

        const card = e.target.closest('.template-card');
        if (card) {
            const clickedId = card.dataset.templateId;
            const templateData = allTemplates.find(t => t.id === clickedId);
            if (templateData) openPreviewModal(templateData);
        }
    });

    // --- Initial Data Loading ---
    const loadStoreData = async () => {
        const { data: storeData, error: storeError } = await supabase.from('store_templates').select('*').order('title');

        if (storeError) {
            templateGrid.innerHTML = '<p>Could not load the store. Please try again later.</p>';
            console.error(storeError);
            return;
        }
        allTemplates = storeData;
        
        const { data: { user } } = await supabase.auth.getUser();
        purchasedTemplateIds.clear(); // Clear old data before loading new
        if (user) {
            const { data: purchasedData, error: purchasedError } = await supabase.from('purchased_templates').select('template_id').eq('user_id', user.id);
            if (!purchasedError) {
                purchasedData.forEach(item => purchasedTemplateIds.add(item.template_id));
            }
        }
        renderTemplates(allTemplates);
    };

    // --- Start the application ---
    loadStoreData();

});
// --- [END] Main execution logic ---