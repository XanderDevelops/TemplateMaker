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
        card.dataset.templateId = template.id; // For modal click

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
                <p style="color:#aaa; font-size: 0.9em;">${template.description || ''}</p>
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

    staticCanvas.loadFromJSON(template.preview_url, () => {
        const group = new fabric.Group(staticCanvas.getObjects());
        const scale = Math.min(
            staticCanvas.width / group.width,
            staticCanvas.height / group.height
        ) * 0.9;
        staticCanvas.setViewportTransform([scale, 0, 0, scale, 
            (staticCanvas.width - group.width * scale) / 2, 
            (staticCanvas.height - group.height * scale) / 2
        ]);
        group.destroy();
        staticCanvas.renderAll();
    });
};

// --- Modal Logic ---
const openPreviewModal = (template) => {
    previewModal.style.display = 'flex';
    if (!modalCanvas) {
        modalCanvas = new fabric.StaticCanvas('modal-canvas');
    }

    // Resize canvas to fit modal body
    const modalBody = modalCanvasEl.parentElement;
    modalCanvas.setWidth(modalBody.clientWidth);
    modalCanvas.setHeight(modalBody.clientHeight);
    
    modalCanvas.loadFromJSON(template.preview_url, () => {
        const group = new fabric.Group(modalCanvas.getObjects());
        const scale = Math.min(
            modalCanvas.width / group.width,
            modalCanvas.height / group.height
        ) * 0.95;
         modalCanvas.setViewportTransform([scale, 0, 0, scale, 
            (modalCanvas.width - group.width * scale) / 2, 
            (modalCanvas.height - group.height * scale) / 2
        ]);
        group.destroy();
        modalCanvas.renderAll();
    });
};

closeModalBtn.addEventListener('click', () => {
    previewModal.style.display = 'none';
    modalCanvas.clear();
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

// --- Action Button Logic (Buy, Use) ---
templateGrid.addEventListener('click', async (e) => {
    const templateId = e.target.dataset.templateId;
    if (!templateId) return;

    if (e.target.classList.contains('buy-template-btn')) {
        // --- MONEI PAYMENT INTEGRATION (Placeholder) ---
        // This is where you would call the Monei API.
        // It requires a server-side component (e.g., a Supabase Edge Function)
        // to securely create a payment session.
        alert(`Redirecting to payment for template ${templateId}. This is a placeholder.`);
        // Example: const { data, error } = await supabase.functions.invoke('create-monei-checkout', { body: { templateId } });
        // if (data) window.location.href = data.redirectUrl;
        
    } else if (e.target.classList.contains('use-template-btn')) {
        e.target.disabled = true;
        e.target.textContent = 'Preparing...';

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        // 1. Get the full template data from the store
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

        // 2. Create a copy in the user's personal `templates` table
        const { data: newTemplate, error: insertError } = await supabase
            .from('templates')
            .insert({
                user_id: user.id,
                title: storeTemplate.title,
                template_data: storeTemplate.template_data,
                // The preview is inside the main data, so we extract it
                preview_url: storeTemplate.template_data.canvas, 
            })
            .select('id')
            .single();

        if (insertError) {
             alert('Could not create your copy of the template.');
             console.error(insertError);
        } else {
            // 3. Redirect the user to the tool with the ID of their new copy
            window.location.href = `/tool.html?id=${newTemplate.id}`;
        }
    } else if (e.target.closest('.template-card')) {
        // Handle click on card itself to open modal
        const card = e.target.closest('.template-card');
        const clickedId = card.dataset.templateId;
        const templateData = allTemplates.find(t => t.id === clickedId);
        if (templateData) openPreviewModal(templateData);
    }
});


// --- Initial Data Loading ---
const loadStoreData = async () => {
    // 1. Fetch all store templates
    const { data: storeData, error: storeError } = await supabase
        .from('store_templates')
        .select('*')
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