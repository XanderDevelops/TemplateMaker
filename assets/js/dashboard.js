import { supabase } from './supabase-client.js';

const templateGrid = document.getElementById('template-grid');
const tabs = document.querySelectorAll('.tab');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const selectBtn = document.getElementById('select-btn');
const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
const templateCounterEl = document.getElementById('template-counter');
const GUEST_TEMPLATE_KEY = 'csvlink-guest-template';

let currentTab = 'created';
let selectedTemplates = new Set();
let selectionMode = false;

const hasRenderableObjects = (canvasState) => {
    const objects = canvasState?.objects || [];
    return objects.some(o => o && o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine);
};

const hasTemplateContent = (templateData) => {
    if (!templateData || typeof templateData !== 'object') return false;
    if (Array.isArray(templateData.pages) && templateData.pages.length > 0) {
        return templateData.pages.some(page => hasRenderableObjects(page?.canvas));
    }
    return hasRenderableObjects(templateData.canvas);
};

const tryRestoreGuestTemplateToDashboard = async () => {
    const rawGuestTemplate = localStorage.getItem(GUEST_TEMPLATE_KEY);
    if (!rawGuestTemplate) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    let guestTemplate;
    try {
        guestTemplate = JSON.parse(rawGuestTemplate);
    } catch (parseError) {
        console.error('Failed to parse guest template:', parseError);
        localStorage.removeItem(GUEST_TEMPLATE_KEY);
        return false;
    }

    if (!hasTemplateContent(guestTemplate)) {
        localStorage.removeItem(GUEST_TEMPLATE_KEY);
        return false;
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.error('Error fetching profile for guest restore:', profileError);
        return false;
    }

    const isPro = profile && (profile.role === 'pro' || profile.role === 'admin');
    if (!isPro) {
        const { count, error: countError } = await supabase
            .from('templates')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (countError) {
            console.error('Error checking template limit for guest restore:', countError);
            return false;
        }

        if ((count || 0) >= 5) {
            return false;
        }
    }

    const title = guestTemplate.title || guestTemplate.page?.title || 'Untitled_Template';
    const templateData = { ...guestTemplate };
    if (!templateData.page || typeof templateData.page !== 'object') {
        templateData.page = { title };
    } else if (!templateData.page.title) {
        templateData.page.title = title;
    }
    delete templateData.title;

    const { error: insertError } = await supabase
        .from('templates')
        .insert({
            user_id: user.id,
            title,
            template_data: templateData
        });

    if (insertError) {
        console.error('Error saving guest template to dashboard:', insertError);
        return false;
    }

    localStorage.removeItem(GUEST_TEMPLATE_KEY);
    return true;
};

const enterSelectionMode = () => {
    selectionMode = true;
    templateGrid.classList.add('selection-active');
    selectBtn.style.display = 'none';
    cancelSelectionBtn.style.display = 'block';
    updateSelectionUI();
};

const exitSelectionMode = () => {
    selectionMode = false;
    templateGrid.classList.remove('selection-active');
    selectBtn.style.display = 'block';
    cancelSelectionBtn.style.display = 'none';

    selectedTemplates.clear();
    updateSelectionUI();
};

const updateSelectionUI = () => {
    if (selectedTemplates.size > 0 && selectionMode) {
        deleteSelectedBtn.style.display = 'block';
        deleteSelectedBtn.textContent = `Delete (${selectedTemplates.size}) Selected`;
    } else {
        deleteSelectedBtn.style.display = 'none';
    }

    document.querySelectorAll('.template-card').forEach(card => {
        const id = card.dataset.id;
        if (selectedTemplates.has(id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
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
            card.dataset.id = template.id;
            const canvasId = `preview-canvas-${template.id}`;

            card.innerHTML = `
                <div class="selection-indicator"></div>
                <a href="/tool.html?id=${template.id}" class="card-link"></a>
                
                <div class="preview">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div class="info">
                    <h4>${template.title || 'Untitled Template'}</h4>
                </div>
                <div class="actions">
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

            // Determine which data to use for preview
            let canvasData = null;
            if (template.template_data && template.template_data.canvas) {
                canvasData = template.template_data.canvas;
            } else if (template.preview_url && typeof template.preview_url === 'object' && template.preview_url.objects) {
                canvasData = template.preview_url;
            }

            if (canvasData) {
                const previewCanvasEl = document.getElementById(canvasId);
                const previewContainer = previewCanvasEl.parentElement;

                const staticCanvas = new fabric.StaticCanvas(canvasId, {
                    width: previewContainer.clientWidth,
                    height: previewContainer.clientHeight,
                });

                staticCanvas.loadFromJSON(canvasData, () => {
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

    attachActionListeners();
    updateSelectionUI();
};

const attachActionListeners = () => {
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (selectionMode) {
                e.preventDefault();
                const id = card.dataset.id;

                if (selectedTemplates.has(id)) {
                    selectedTemplates.delete(id);
                } else {
                    selectedTemplates.add(id);
                }
                updateSelectionUI();
            }
        });
    });

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
                    selectedTemplates.delete(id);
                    loadTemplates(currentTab);
                }
            }
        });
    });

    document.querySelectorAll('.duplicate-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const buttonEl = e.target.closest('button');
            buttonEl.disabled = true;

            const id = buttonEl.dataset.id;

            // Limit Check
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            const isPro = profile && (profile.role === 'pro' || profile.role === 'admin');

            if (!isPro) {
                const { count } = await supabase.from('templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
                if (count >= 5) {
                    showLimitModal();
                    buttonEl.disabled = false;
                    return;
                }
            }

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

            const newTitle = `${originalTemplate.title} (Copy)`;
            const newTemplateData = originalTemplate.template_data;
            newTemplateData.page.title = newTitle;

            const { error: insertError } = await supabase
                .from('templates')
                .insert({
                    user_id: user.id,
                    title: newTitle,
                    template_data: newTemplateData,
                    preview_url: originalTemplate.preview_url,
                });

            if (insertError) {
                alert('Failed to duplicate template.');
                console.error(insertError);
            } else {
                loadTemplates(currentTab);
            }
            buttonEl.disabled = false;
        });
    });
};

selectBtn.addEventListener('click', enterSelectionMode);
cancelSelectionBtn.addEventListener('click', exitSelectionMode);

deleteSelectedBtn.addEventListener('click', async () => {
    const count = selectedTemplates.size;
    const confirmed = await showConfirm(`Are you sure you want to delete ${count} selected templates? This action cannot be undone.`);

    if (confirmed) {
        const idsToDelete = Array.from(selectedTemplates);
        const { error } = await supabase
            .from('templates')
            .delete()
            .in('id', idsToDelete);

        if (error) {
            alert(`Could not delete selected templates.`);
            console.error(error);
        } else {
            exitSelectionMode();
            loadTemplates(currentTab);
        }
    }
});

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
        btnGroup.style.justifyContent = 'flex-end';

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
        selectBtn.style.display = 'block';
        const { data, error } = await supabase
            .from('templates')
            .select('id, title, template_data, preview_url')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
        if (error) {
            console.error('Error fetching created templates:', error);
        } else {
            templates = data;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const isPro = profile && (profile.role === 'pro' || profile.role === 'admin');
        const limit = isPro ? 'Unlimited' : 5;
        const count = templates.length;

        if (templateCounterEl) {
            templateCounterEl.textContent = `Templates: ${count} / ${limit}`;
            templateCounterEl.style.display = 'inline-block';
        }

    } else if (tab === 'purchased') {
        selectBtn.style.display = 'none';
        if (templateCounterEl) {
            templateCounterEl.style.display = 'none';
        }

        const { data, error } = await supabase
            .from('purchased_templates')
            .select(`store_templates ( id, title, description, preview_url )`)
            .eq('user_id', user.id);

        if (error) console.error('Error fetching purchased templates:', error);
        else templates = data.map(item => item.store_templates);
    }

    renderTemplates(templates);
};

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;

        exitSelectionMode();
        loadTemplates(currentTab);
    });
});

const initializeDashboard = async () => {
    await tryRestoreGuestTemplateToDashboard();
    await loadTemplates(currentTab);
};

initializeDashboard();

const createBtn = document.querySelector('a[href="/tool.html"]');
if (createBtn) {
    createBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/tool.html';
            return;
        }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        const isPro = profile && (profile.role === 'pro' || profile.role === 'admin');

        if (!isPro) {
            const { count } = await supabase.from('templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
            if (count >= 5) {
                showLimitModal();
                return;
            }
        }

        window.location.href = '/tool.html';
    });
}

function showLimitModal() {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:100;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--panel); padding:24px; border-radius:12px; max-width:400px; text-align:center; border:1px solid var(--border); box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

    const icon = document.createElement('div');
    icon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    icon.style.marginBottom = '16px';

    const title = document.createElement('h3');
    title.textContent = 'Limit Reached';
    title.style.marginBottom = '8px';
    title.style.color = 'var(--fg)';

    const msg = document.createElement('p');
    msg.textContent = 'You have reached the limit of 5 templates for the free plan. Upgrade to Pro to create unlimited templates.';
    msg.style.marginBottom = '24px';
    msg.style.color = 'var(--muted)';
    msg.style.lineHeight = '1.5';

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '12px';
    btnGroup.style.justifyContent = 'center';

    const btnUpgrade = document.createElement('a');
    btnUpgrade.href = '/#pricing';
    btnUpgrade.textContent = 'Upgrade to Pro';
    btnUpgrade.className = 'btn primary';
    btnUpgrade.style.textDecoration = 'none';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Close';
    btnCancel.className = 'btn ghost';

    btnGroup.append(btnCancel, btnUpgrade);
    modal.append(icon, title, msg, btnGroup);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    btnCancel.onclick = () => {
        document.body.removeChild(backdrop);
    };

    // Close on backdrop click
    backdrop.onclick = (e) => {
        if (e.target === backdrop) document.body.removeChild(backdrop);
    };
}
