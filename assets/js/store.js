import { supabase } from './supabase-client.js';

const templateGrid = document.getElementById('template-grid');
const categoryList = document.getElementById('category-list');
const previewModal = document.getElementById('preview-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalCanvasEl = document.getElementById('modal-canvas');

let allTemplates = [];
let purchasedTemplateIds = new Set();
let modalCanvas;

// --- Render Templates in the Grid ---
// This function remains the same.
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
// This function remains the same.
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
// This function remains the same.
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
// This function remains the same.
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


// --- [START] REPLACED AND UNIFIED ACTION LOGIC ---
// Add this event listener to your main template grid container
templateGrid.addEventListener('click', async (e) => {
    // --- (1) HANDLE "BUY" BUTTON CLICK ---
    const buyButton = e.target.closest('.buy-template-btn');
    if (buyButton) {
        e.preventDefault();
        e.stopPropagation();

        buyButton.disabled = true;
        buyButton.textContent = 'Processing...';

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            // Redirect to login if the user is not signed in
            window.location.href = '/login.html';
            return;
        }

        const templateId = buyButton.dataset.templateId;
        const templateData = allTemplates.find(t => t.id === templateId);

        // Verify that the template is configured for sale with a Paddle Price ID
        if (!templateData || !templateData.paddle_price_id) {
            alert('This product is not configured for sale.');
            buyButton.disabled = false;
            buyButton.textContent = `$${templateData?.price || '0'}`;
            return;
        }

        try {
            // **FIX APPLIED HERE**
            // Invoke a Supabase Edge Function to create a checkout session with Paddle
            const { data, error } = await supabase.functions.invoke('create-paddle-checkout', {
                body: {
                    priceId: templateData.paddle_price_id,
                    email: user.email // Pass the user's email here
                }
            });

            if (error) {
                // If the function call itself fails
                throw new Error(error.message);
            }

            // The function should return a checkout URL from the Paddle API
            if (data && data.checkoutUrl) {
                // Redirect the user to the Paddle checkout page
                window.location.href = data.checkoutUrl;
            } else {
                // If the function succeeded but didn't return a URL
                throw new Error('Could not retrieve a checkout URL.');
            }

        } catch (error) {
            console.error('Error creating Paddle checkout:', error);
            alert(`An error occurred while creating the payment page: ${error.message}`);
            // Re-enable the button so the user can try again
            buyButton.disabled = false;
            buyButton.textContent = `$${templateData?.price || '0'}`;
        }

        return; // Stop further execution
    }

    // --- (2) HANDLE "USE" BUTTON CLICK (No changes needed here) ---
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

        const { data: storeTemplate, error } = await supabase
            .from('store_templates')
            .select('title, template_data')
            .eq('id', templateId)
            .single();
        if (error) {
            alert('Error fetching template details.');
            console.error(error);
            return;
        }

        const { data: newTemplate, error: insertError } = await supabase
            .from('templates')
            .insert({
                user_id: user.id,
                title: storeTemplate.title,
                template_data: storeTemplate.template_data,
                preview_url: storeTemplate.template_data.canvas,
            })
            .select('id')
            .single();

        if (insertError) {
            alert('Could not create your copy of the template.');
            console.error(insertError);
        } else {
            window.location.href = `/tool.html?id=${newTemplate.id}`;
        }
        return; // Stop further execution
    }

    // --- (3) HANDLE MODAL PREVIEW (No changes needed here) ---
    const card = e.target.closest('.template-card');
    if (card) {
        const clickedId = card.dataset.templateId;
        const templateData = allTemplates.find(t => t.id === clickedId);
        if (templateData) openPreviewModal(templateData);
    }
});
// --- [END] REPLACED AND UNIFIED ACTION LOGIC ---

// --- Initial Data Loading ---
// This function remains the same.
const loadStoreData = async () => {
    // 1. Fetch all store templates, including the new paddle_price_id
    const { data: storeData, error: storeError } = await supabase
        .from('store_templates')
        .select('*') // select * gets all columns
        .order('title');

    if (storeError) {
        templateGrid.innerHTML = '<p>Could not load the store. Please try again later.</p>';
        console.error(storeError);
        return;
    }
    allTemplates = storeData;
    
    // 2. Check which templates the user has purchased
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: purchasedData, error: purchasedError } = await supabase
            .from('purchased_templates')
            .select('template_id')
            .eq('user_id', user.id);
        
        if (!purchasedError) {
            purchasedData.forEach(item => purchasedTemplateIds.add(item.template_id));
        }
    }

    // 3. Render everything
    renderTemplates(allTemplates);
};

loadStoreData();