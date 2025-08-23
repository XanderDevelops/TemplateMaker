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
templateGrid.addEventListener("click", async (e) => {
  const buyButton = e.target.closest(".buy-template-btn");
  if (!buyButton) return;

  e.preventDefault();
  e.stopPropagation();

  buyButton.disabled = true;
  buyButton.textContent = "Processing...";

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const templateId = buyButton.dataset.templateId;
  const templateData = allTemplates.find(t => t.id === templateId);

  if (!templateData?.paddle_price_id) {
    alert("This product is not configured for sale.");
    buyButton.disabled = false;
    buyButton.textContent = `$${templateData?.price || 0}`;
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke("paddle-wrapper", {
      body: {
        price_id: templateData.paddle_price_id,
        user_email: user.email,
        template_id: templateId,
      },
    });

    if (error) throw error;

    if (!data?.url) throw new Error("Checkout URL not returned by Paddle.");

    // Redirect user to Paddle checkout
    window.location.href = data.url;

  } catch (err) {
    alert(`Error: ${err.message}`);
    console.error(err);
    buyButton.disabled = false;
    buyButton.textContent = `$${templateData.price}`;
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