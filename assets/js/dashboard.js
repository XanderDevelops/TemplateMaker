import { supabase } from './supabase-client.js';

const templateGrid = document.getElementById('template-grid');
const tabs = document.querySelectorAll('.tab');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
let currentTab = 'created';
let selectedTemplates = new Set();


// --- NEW FUNCTION to manage selection state ---
const updateSelectionUI = () => {
    // Toggle delete button visibility
    if (selectedTemplates.size > 0) {
        deleteSelectedBtn.style.display = 'block';
        deleteSelectedBtn.textContent = `Delete (${selectedTemplates.size}) Selected`;
    } else {
        deleteSelectedBtn.style.display = 'none';
    }

    // Toggle .selected class on cards
    document.querySelectorAll('.template-card').forEach(card => {
        const id = card.dataset.id;
        if (selectedTemplates.has(id)) {
            card.classList.add('selected');
            card.querySelector('.selection-checkbox').checked = true;
        } else {
            card.classList.remove('selected');
            card.querySelector('.selection-checkbox').checked = false;
        }
    });
};


const renderTemplates = (templates) => {
    templateGrid.innerHTML = '';
    if (!templates || templates.length === 0) {
        templateGrid.innerHTML = `<p>No templates found.</p>`;
        return;
    }

    templates.forEach(template => {
        try {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.dataset.id = template.id; // --- ADDED data-id for selection
            const canvasId = `preview-canvas-${template.id}`;

            // --- MODIFIED HTML STRUCTURE ---
            card.innerHTML = `
                ${currentTab === 'created' ? `<input type="checkbox" class="selection-checkbox" data-id="${template.id}">` : ''}
                <a href="/tool.html?id=${template.id}" class="card-link"></a>
                
                <div class="preview">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div class="info">
                    <h4>${template.title || 'Untitled Template'}</h4>
                </div>
                <div class="actions">
                    <!-- New container for buttons -->
                    <div class="button-group">
                        ${currentTab === 'created' ? `
                            <button class="icon-btn duplicate-btn" title="Duplicate" data-id="${template.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <button class="icon-btn delete-btn" title="Delete" data-id="${template.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
            templateGrid.appendChild(card);

            // The preview rendering logic remains the same
            if (template.preview_url && typeof template.preview_url === 'object' && template.preview_url.objects) {
                // ... (the existing canvas rendering logic from the previous step)
                const previewCanvasEl = document.getElementById(canvasId);
                const previewContainer = previewCanvasEl.parentElement;
                
                const staticCanvas = new fabric.StaticCanvas(canvasId, {
                    width: previewContainer.clientWidth,
                    height: previewContainer.clientHeight,
                });

                staticCanvas.loadFromJSON(template.preview_url, () => {
                    const objects = staticCanvas.getObjects();
                    if (objects.length === 0) {
                        staticCanvas.renderAll();
                        return;
                    }
                    const group = new fabric.Group(objects);
                    
                    const scaleX = staticCanvas.width / group.width;
                    const scaleY = staticCanvas.height / group.height;
                    const scale = Math.min(scaleX, scaleY) * 0.95; 

                    staticCanvas.setViewportTransform([scale, 0, 0, scale, 
                        (staticCanvas.width - group.width * scale) / 2, 
                        (staticCanvas.height - group.height * scale) / 2
                    ]);
                    
                    group.setPositionByOrigin(new fabric.Point(group.width / 2, group.height / 2), 'center', 'center');
                    group.destroy();
                    staticCanvas.renderAll();
                });
            } else {
                const previewContainer = document.getElementById(canvasId).parentElement;
                previewContainer.innerHTML = '<span>No preview available</span>';
            }
        } catch (error) {
            console.error("Failed to render template card:", template.title, error);
        }
    });

    // Attach listeners for all actions
    attachActionListeners();
    updateSelectionUI(); // Ensure UI is correct on render
};

// --- MODIFIED and COMBINED LISTENER FUNCTION ---
const attachActionListeners = () => {
    // --- NEW: Selection Checkbox Logic ---
    document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card link from firing
            const id = e.target.dataset.id;
            if (e.target.checked) {
                selectedTemplates.add(id);
            } else {
                selectedTemplates.delete(id);
            }
            updateSelectionUI();
        });
    });

    // Delete Button Logic
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const id = e.target.closest('button').dataset.id;
            const confirmed = await showConfirm('Are you sure you want to delete this template? This action cannot be undone.');

            if (confirmed) {
                const { error } = await supabase.from('templates').delete().eq('id', id);
                if (error) {
                    alert('Could not delete template.');
                    console.error(error);
                } else {
                    selectedTemplates.delete(id); // --- Remove from selection if deleted
                    loadTemplates(currentTab);
                }
            }
        });
    });

    // Duplicate Button Logic - THIS IS NOW FULLY IMPLEMENTED
    document.querySelectorAll('.duplicate-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const buttonEl = e.target.closest('button');
            buttonEl.disabled = true; // Prevent multiple clicks

            const id = buttonEl.dataset.id;
            
            // 1. Fetch the original template data
            const { data: originalTemplate, error } = await supabase
                .from('templates')
                .select('title, template_data, preview_url')
                .eq('id', id)
                .single();

            if (error || !originalTemplate) {
                alert('Could not find original template to duplicate.');
                console.error(error);
                buttonEl.disabled = false;
                return;
            }

            // 2. Insert a new record with the copied data
            const newTitle = `${originalTemplate.title} (Copy)`;
            const newTemplateData = originalTemplate.template_data;

            // This is the critical fix: update the title inside the main JSON object
            newTemplateData.page.title = newTitle; 

            // 3. Insert the new record with the fully updated data
            const { data: { user } } = await supabase.auth.getUser();
            const { error: insertError } = await supabase
                .from('templates')
                .insert({
                    user_id: user.id,
                    title: newTitle, // The main column title
                    template_data: newTemplateData, // The updated JSON object
                    preview_url: originalTemplate.preview_url, // The preview can be copied directly
                });
            
            if (insertError) {
                alert('Failed to duplicate template.');
                console.error(insertError);
            } else {
                // Refresh the list to show the new copy
                loadTemplates(currentTab);
            }

            // Re-enable the button regardless of outcome
            buttonEl.disabled = false;
        });
    });
};

// --- NEW EVENT LISTENER for the "Delete Selected" button ---
deleteSelectedBtn.addEventListener('click', async () => {
    const count = selectedTemplates.size;
    const confirmed = await showConfirm(`Are you sure you want to delete ${count} selected templates? This action cannot be undone.`);

    if (confirmed) {
        // Convert the Set to an array for the Supabase query
        const idsToDelete = Array.from(selectedTemplates);
        
        const { error } = await supabase
            .from('templates')
            .delete()
            .in('id', idsToDelete);

        if (error) {
            alert(`Could not delete selected templates.`);
            console.error(error);
        } else {
            selectedTemplates.clear(); // Clear the selection
            loadTemplates(currentTab); // Refresh the list
        }
    }
});


// REPLACE your existing showConfirm function with this one
function showConfirm(message) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:100;';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--panel); padding:24px; border-radius:12px; max-width:400px; text-align:center; border:1px solid var(--border);';
    
    const msg = document.createElement('p');
    msg.textContent = message;
    msg.style.marginBottom = '24px';
    
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '8px';
    btnGroup.style.justifyContent = 'flex-end'; // THIS IS THE FIX for alignment

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = 'Delete';
    btnConfirm.className = 'btn';
    btnConfirm.style.backgroundColor = '#e53e3e';
    btnConfirm.style.color = '#fff';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.className = 'btn ghost';

    btnGroup.append(btnCancel, btnConfirm);
    modal.append(msg, btnGroup);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    btnConfirm.onclick = () => {
      document.body.removeChild(backdrop);
      resolve(true);
    };

    btnCancel.onclick = () => {
      document.body.removeChild(backdrop);
      resolve(false);
    };
  });
}

const loadTemplates = async (tab) => {
    templateGrid.innerHTML = '<p>Loading templates...</p>';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    let templates = [];
    if (tab === 'created') {
        const { data, error } = await supabase
            .from('templates')
            .select('id, title, preview_url')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
        if (error) console.error('Error fetching created templates:', error);
        else templates = data;

    } else if (tab === 'purchased') {
        const { data, error } = await supabase
            .from('purchased_templates')
            .select(`store_templates ( id, title, description, preview_url )`)
            .eq('user_id', user.id);
        
        if (error) console.error('Error fetching purchased templates:', error);
        else templates = data.map(item => item.store_templates);
    }
    
    renderTemplates(templates);
};

// --- MODIFIED Tab switching logic ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        
        // Clear selection when switching tabs
        selectedTemplates.clear();
        updateSelectionUI();

        loadTemplates(currentTab);
    });
});

// Initial load
loadTemplates(currentTab);