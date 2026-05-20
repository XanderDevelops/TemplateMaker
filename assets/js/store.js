import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- Get references to DOM elements ---
    const templateGrid = document.getElementById('template-grid');
    const categoryList = document.getElementById('category-list');
    const templateSearch = document.getElementById('template-search');
    const styleFilterList = document.getElementById('style-filter-list');
    const previewModal = document.getElementById('preview-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalCanvasEl = document.getElementById('modal-canvas');
    const modalTitle = document.getElementById('modal-title');
    const modalTemplateTitle = document.getElementById('modal-template-title');
    const modalTemplateTags = document.getElementById('modal-template-tags');
    const modalTemplateDescription = document.getElementById('modal-template-description');
    const modalTemplatePrice = document.getElementById('modal-template-price');
    const modalTemplateAction = document.getElementById('modal-template-action');
    
    // --- Configuration and State Variables ---
    let allTemplates = [];
    let purchasedTemplateIds = new Set();
    let modalCanvas;
    let activeCategory = 'all';
    let activeSearch = '';
    let activeStyleFilters = new Set();

    // --- Initialize Lemon Squeezy ---
    // Make sure you have included the Lemon.js script in your HTML file:
    // <script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
    window.createLemonSqueezy();
    LemonSqueezy.Setup({
        eventHandler: async (event) => {
            console.log('Lemon Squeezy event:', event);
            if (event.event === 'Checkout.Success') {
                console.log('Checkout completed:', event.data);
                // The webhook is the primary way to grant access,
                // but we can also optimistically update the UI here.
                await loadStoreData();
            }
        }
    });

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

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const normalizeTags = (tags) => {
        if (Array.isArray(tags)) return tags.map(tag => String(tag).trim()).filter(Boolean);
        if (typeof tags === 'string') {
            return tags
                .split(',')
                .map(tag => tag.trim())
                .filter(Boolean);
        }
        return [];
    };

    const getTemplateSearchText = (template) => {
        const tags = normalizeTags(template.tags).join(' ');
        return [
            template.title,
            template.description,
            template.category,
            tags
        ].filter(Boolean).join(' ').toLowerCase();
    };

    const getFilteredTemplates = () => {
        const searchTerms = activeSearch
            .toLowerCase()
            .split(/[\s,]+/)
            .map(term => term.trim())
            .filter(Boolean);

        return allTemplates.filter(template => {
            const categoryMatches = activeCategory === 'all' || template.category === activeCategory;
            if (!categoryMatches) return false;

            const searchText = getTemplateSearchText(template);
            const searchMatches = searchTerms.every(term => searchText.includes(term));
            const styleMatches = [...activeStyleFilters].every(filter => searchText.includes(filter));
            return searchMatches && styleMatches;
        });
    };

    const applyFilters = () => {
        renderTemplates(getFilteredTemplates());
    };

    const fitCanvasToObjects = (canvas, scaleMultiplier, options = {}) => {
        const objects = canvas.getObjects();
        if (objects.length === 0) {
            canvas.renderAll();
            return;
        }

        const group = new fabric.Group(objects);
        if (group.width && group.height) {
            const containScale = Math.min(canvas.width / group.width, canvas.height / group.height);
            const heightScale = canvas.height / group.height;
            const baseScale = options.fillHeight ? Math.min(heightScale, containScale) : containScale;
            const scale = baseScale * scaleMultiplier;
            canvas.setViewportTransform([
                scale,
                0,
                0,
                scale,
                (canvas.width - group.width * scale) / 2,
                (canvas.height - group.height * scale) / 2
            ]);
            group.destroy();
        }
        canvas.renderAll();
    };

    // --- Render Templates in the Grid ---
    const renderTemplates = (templatesToRender) => {
        templateGrid.innerHTML = '';
        if (templatesToRender.length === 0) {
            templateGrid.innerHTML = '<p class="empty-state">No templates found. Try a different category, name, or tag.</p>';
            return;
        }

        templatesToRender.forEach(template => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.dataset.templateId = template.id;
            card.title = template.title || 'Template preview';
            
            card.innerHTML = `
                <div class="preview">
                    <div class="preview-canvas-wrap">
                        <canvas id="preview-${template.id}"></canvas>
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
                fitCanvasToObjects(staticCanvas, 0.96);
            });
        }
    };

    // --- Modal Logic ---
    const openPreviewModal = (template) => {
        previewModal.style.display = 'flex';
        modalTitle.textContent = 'Template Details';
        modalTemplateTitle.textContent = template.title || 'Untitled Template';
        modalTemplateDescription.textContent = template.description || 'No description available.';

        const tags = normalizeTags(template.tags);
        if (tags.length === 0 && template.category) tags.push(template.category);
        modalTemplateTags.innerHTML = tags
            .slice(0, 8)
            .map(tag => `<span class="template-tag">${escapeHtml(tag)}</span>`)
            .join('');

        const isPurchased = purchasedTemplateIds.has(template.id);
        const isFree = !template.price || parseFloat(template.price) === 0;
        modalTemplatePrice.textContent = isPurchased || isFree ? 'Available in your library' : `$${template.price}`;
        modalTemplateAction.innerHTML = isPurchased || isFree
            ? `<button class="btn use-template-btn" data-template-id="${template.id}">Use This Template</button>`
            : `<button class="btn buy-template-btn" data-template-id="${template.id}">Buy Template - $${escapeHtml(template.price)}</button>`;

        if (!modalCanvas) {
            modalCanvas = new fabric.StaticCanvas('modal-canvas');
        }

        const modalPanel = modalCanvasEl.parentElement;
        modalCanvas.clear();
        modalCanvas.setWidth(modalPanel.clientWidth);
        modalCanvas.setHeight(modalPanel.clientHeight);
        
        if (template.preview_url) {
            modalCanvas.loadFromJSON(template.preview_url, () => {
                fitCanvasToObjects(modalCanvas, 1, { fillHeight: true });
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
            
            activeCategory = e.target.dataset.category;
            applyFilters();
        }
    });

    templateSearch.addEventListener('input', () => {
        activeSearch = templateSearch.value;
        applyFilters();
    });

    styleFilterList.addEventListener('click', (e) => {
        const filterButton = e.target.closest('.style-filter');
        if (!filterButton) return;

        const filter = filterButton.dataset.filter;
        if (!filter) return;

        filterButton.classList.toggle('active');
        filterButton.setAttribute('aria-pressed', filterButton.classList.contains('active') ? 'true' : 'false');

        if (activeStyleFilters.has(filter)) {
            activeStyleFilters.delete(filter);
        } else {
            activeStyleFilters.add(filter);
        }

        applyFilters();
    });

    const handleBuyTemplate = async (buyButton) => {
        buyButton.disabled = true;
        buyButton.textContent = 'Processing...';

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        const templateId = buyButton.dataset.templateId;
        const templateData = allTemplates.find(t => t.id.toString() === templateId);

        if (!templateData || !templateData.lemonsqueezy_variant_id) {
            alert('This product is not configured for sale.');
            buyButton.disabled = false;
            buyButton.textContent = `Buy Template - $${templateData?.price || '0'}`;
            return;
        }

        try {
            const { data, error } = await supabase.functions.invoke('lemonsqueezy-checkout', {
                body: { 
                    template_id: templateId
                },
            });

            if (error) {
                let detail = error.message;
                try {
                    if (error.context) {
                        const responseText = await error.context.clone().text();
                        if (responseText) detail = responseText;
                    }
                } catch (detailError) {
                    console.warn('Could not read checkout error details:', detailError);
                }
                throw new Error(detail);
            }
            if (!data?.url) throw new Error('No checkout URL returned from the server.');

            LemonSqueezy.Url.Open(data.url);
            
            buyButton.disabled = false;
            buyButton.textContent = `Buy Template - $${templateData.price}`;

        } catch (error) {
            alert(`Error: ${error.message}`);
            console.error(error);
            buyButton.disabled = false;
            buyButton.textContent = `Buy Template - $${templateData.price}`;
        }
    };

    const handleUseTemplate = async (useButton) => {
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
            useButton.disabled = false;
            useButton.textContent = 'Use This Template';
            return;
        }

        const { data: newTemplate, error: insertError } = await supabase.from('templates').insert({ user_id: user.id, title: storeTemplate.title, template_data: storeTemplate.template_data, preview_url: storeTemplate.template_data.canvas }).select('id').single();

        if (insertError) {
            alert('Could not create your copy of the template.');
            console.error(insertError);
            useButton.disabled = false;
            useButton.textContent = 'Use This Template';
        } else {
            window.location.href = `/tool.html?id=${newTemplate.id}`;
        }
    };

    previewModal.addEventListener('click', async (e) => {
        const buyButton = e.target.closest('.buy-template-btn');
        if (buyButton) {
            e.preventDefault();
            await handleBuyTemplate(buyButton);
            return;
        }

        const useButton = e.target.closest('.use-template-btn');
        if (useButton) {
            e.preventDefault();
            await handleUseTemplate(useButton);
        }
    });

    // --- Unified Action Logic ---
    templateGrid.addEventListener('click', async (e) => {
        const card = e.target.closest('.template-card');
        if (card) {
            const clickedId = card.dataset.templateId;
            const templateData = allTemplates.find(t => t.id.toString() === clickedId);
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
        applyFilters();
    };

    // --- Start the application ---
    loadStoreData();

});
// --- [END] Main execution logic ---
