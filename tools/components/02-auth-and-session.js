// --- AUTH & DATA LOADING ---
async function initializeEditor() {
    applyTheme(localStorage.getItem('csvlink-theme') || 'light');
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user;

    const navLinks = $('#nav-links');
    if (currentUser) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
        if (profile) userRole = profile.role || 'free';
        // 6. Add "Become Pro" button
        if (userRole === 'free' && !navLinks.querySelector('a[href="/#pricing"]')) {
            const proButton = document.createElement('a');
            proButton.href = '/#pricing';
            proButton.className = 'btn ghost';
            proButton.innerHTML = '★ Pricing';
            navLinks.insertBefore(proButton, navLinks.firstChild);
        }
    } else {
        if (!navLinks.querySelector('a[href="/#pricing"]')) {
            const proButton = document.createElement('a');
            proButton.href = '/#pricing';
            proButton.className = 'btn ghost';
            proButton.innerHTML = '★ Pricing';
            navLinks.insertBefore(proButton, navLinks.firstChild);
        }
    }
    updateExportUI();

    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('id');

    initializeCanvas();
    updateHistoryButtons();
    initializeVisualCropper();
    renderPageInspector();
    await loadCachedData();

    const guestTemplate = localStorage.getItem('csvlink-guest-template');

    /* 1) PRIORITY: Template ID from URL always wins */
    if (templateId) {
        await loadTemplateFromDB(templateId);
        centerAndFitPage();
    }

    /* 2) User logged in â†’ try restore guest work */
    else if (currentUser && guestTemplate) {
        try {
            const template = JSON.parse(guestTemplate);
            $('#titleInput').value = template.title || template.page?.title || 'Untitled_Template';
            if (template.data) {
                headers = template.data.headers || [];
                dataRows = template.data.rows || [];
            }
            await setDocumentPagesFromTemplate(template, { fitView: true });
            historyStack = [];
            historyIndex = -1;
            lastHistorySig = null;
            renderCsvView();
            updateExportUI();
            pendingGuestTemplateRestore = true;
            requestSaveState();
            saveStatusEl.textContent = 'Restored from guest session. Saving...';
        } catch (err) {
            console.error('Failed to restore guest template:', err);
        }
    }

    /* 3) Guest user with no templateId â†’ autosave guest mode */
    else if (!currentUser) {
        showGuestWarning();
        centerAndFitPage();
        setInterval(saveGuestTemplate, 10000);
    }

    /* 4) Logged in user, blank editor */
    else {
        centerAndFitPage();
    }

    /* Other UI initialization */
    if (!localStorage.getItem('hasSeenTour')) startTour();
    initializeLeftPanelTabs();

    // Bind Load Template buttons
    const bindLoader = (id) => on(id, 'click', (e) => toggleTemplateLoader(e.currentTarget));
    bindLoader('#loadTemplateBtnPage');
    bindLoader('#openLoaderFromSidebar');
    bindLoader('#toolbarLoadTemplateBtn');
}

function showGuestWarning() { saveStatusEl.textContent = "Log in to save your work."; saveStatusEl.style.color = '#ff9800'; }

function saveGuestTemplate() {
    if (currentUser) return; // Only save if guest
    const payload = buildTemplatePayload();
    const hasAnyContent = payload.pages.some(page => pageHasRenderableObjects(page));
    if (!hasAnyContent) return;

    const guestTemplate = {
        title: $('#titleInput').value,
        ...payload
    };

    try {
        localStorage.setItem('csvlink-guest-template', JSON.stringify(guestTemplate));
        saveStatusEl.textContent = "Guest work auto-saved locally. Log in to save to cloud.";
    } catch (err) {
        console.error('Failed to save guest template:', err);
    }
}
async function loadTemplateFromDB(templateId, options = {}) {
    saveStatusEl.textContent = 'Loading...';
    const isPublic = options.public;
    let data = null;

    if (isPublic) {
        const { data: publicData, error: publicError } = await supabase.from('public_templates').select('id, title, template_data').eq('id', templateId).single();
        if (publicError) { console.error('Error loading public template:', publicError); return; }
        data = publicData;
        currentTemplateId = null;
    } else {
        if (!currentUser) { return; }
        const sourceTable = options.purchased ? 'purchased_templates' : 'templates';
        const query = options.purchased
            ? supabase.from(sourceTable).select('store_templates(id, title, template_data)').eq('user_id', currentUser.id).eq('template_id', templateId).single()
            : supabase.from(sourceTable).select('id, title, template_data').eq('id', templateId).eq('user_id', currentUser.id).single();

        const { data: privateData, error: privateError } = await query;

        if (privateError) { console.error('Error or template not found:', privateError); return; }
        data = options.purchased ? privateData.store_templates : privateData;
        currentTemplateId = options.purchased ? null : data.id;
    }

    if (data && data.template_data) {
        const template = data.template_data;
        if (template.data) {
            headers = template.data.headers || [];
            dataRows = template.data.rows || [];
            identifierColumn = template.data.identifierColumn || '';
            refreshIdentifierDropdown();
        }
        $('#titleInput').value = isPublic || options.purchased
            ? `Copy of ${data.title}`
            : (data.title || template.page?.title || 'Untitled Template');
        await setDocumentPagesFromTemplate(template, { fitView: true, selectedIndex: template.currentPageIndex });
        bindings = new Map(documentPages[currentPageIndex]?.bindings || template.bindings || []);
        historyStack = [];
        historyIndex = -1;
        lastHistorySig = null;
        requestSaveState();
        renderCsvView();
        updateExportUI();
        if (headers.length > 0) {
            $('#fileName').textContent = 'Saved Data';
            $('#unloadDataBtn').style.display = 'inline';
        }
        saveStatusEl.textContent = 'Template loaded.';
    }
}


const debouncedSave = debounce(async () => {
    if (!currentUser || historyLocked) return;
    const fullTemplateData = buildTemplatePayload();
    if (!fullTemplateData.pages.some(page => pageHasRenderableObjects(page))) {
        saveStatusEl.textContent = 'Cannot save empty template.';
        return;
    }

    saveStatusEl.textContent = 'Saving...';

    if (currentTemplateId) {
        const { error } = await supabase.from('templates').update({ title: $('#titleInput').value, template_data: fullTemplateData }).eq('id', currentTemplateId);
        if (error) { saveStatusEl.textContent = 'Error saving.'; } else { saveStatusEl.textContent = 'All changes saved.'; }
    } else {
        if (userRole === 'free') { const { count } = await supabase.from('templates').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id); if (count >= 5) { saveStatusEl.textContent = 'Free account limit (5 templates) reached.'; return; } }
        const { data, error } = await supabase.from('templates').insert({ user_id: currentUser.id, title: $('#titleInput').value, template_data: fullTemplateData }).select('id').single();
        if (error) { saveStatusEl.textContent = 'Error creating template.'; }
        else {
            currentTemplateId = data.id;
            if (pendingGuestTemplateRestore) {
                localStorage.removeItem('csvlink-guest-template');
                pendingGuestTemplateRestore = false;
            }
            const newUrl = `${window.location.pathname}?id=${currentTemplateId}`;
            window.history.replaceState({ path: newUrl }, '', newUrl);
            saveStatusEl.textContent = 'Template saved to your account.';
        }
    }
});

function flushPendingSaves() {
    if (typeof requestSaveState.flush === 'function') requestSaveState.flush();
    if (currentUser && typeof debouncedSave.flush === 'function') debouncedSave.flush();
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    commitPendingLineEndpointEdits();
    flushPendingSaves();
});
window.addEventListener('pagehide', () => {
    commitPendingLineEndpointEdits();
    flushPendingSaves();
});

function updateHistoryButtons() {
    const undoBtn = $('#undoBtn');
    const redoBtn = $('#redoBtn');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function undo() {
    if (historyLocked) return;
    if (typeof requestSaveState.flush === 'function') requestSaveState.flush();
    if (historyIndex <= 0 || historyLocked) return;
    if (typeof requestSaveState.clear === 'function') requestSaveState.clear();
    historyLocked = true;
    isRestoringHistory = true;
    historyIndex--;
    const state = historyStack[historyIndex];

    // Safety timeout to prevent lockup
    const lockTimeout = setTimeout(() => {
        historyLocked = false;
        isRestoringHistory = false;
    }, 3000);

    restoreFullState(state, () => {
        clearTimeout(lockTimeout);
        historyLocked = false;
        setTimeout(() => { isRestoringHistory = false; }, 0);
        updateHistoryButtons();
    });
}

function redo() {
    if (historyLocked) return;
    if (historyIndex >= historyStack.length - 1 || historyLocked) return;
    if (typeof requestSaveState.clear === 'function') requestSaveState.clear();
    historyLocked = true;
    isRestoringHistory = true;
    historyIndex++;
    const state = historyStack[historyIndex];

    // Safety timeout to prevent lockup
    const lockTimeout = setTimeout(() => {
        historyLocked = false;
        isRestoringHistory = false;
    }, 3000);

    restoreFullState(state, () => {
        clearTimeout(lockTimeout);
        historyLocked = false;
        setTimeout(() => { isRestoringHistory = false; }, 0);
        updateHistoryButtons();
    });
}

function restoreFullState(state, callback) {
    if (!state) {
        if (typeof callback === 'function') callback();
        return;
    }
    headers = [...(state.data?.headers || [])];
    dataRows = JSON.parse(JSON.stringify(state.data?.rows || []));
    identifierColumn = state.data?.identifierColumn || '';
    if (state.title !== undefined) $('#titleInput').value = state.title;

    const legacyState = {
        page: {
            title: state.title || $('#titleInput').value,
            width: state.page?.width || DEFAULT_PAGE_WIDTH,
            height: state.page?.height || DEFAULT_PAGE_HEIGHT
        },
        canvas: state.canvas,
        bindings: state.bindings || []
    };

    const payload = state.pages
        ? {
            page: legacyState.page,
            pages: state.pages,
            currentPageIndex: state.currentPageIndex || 0
        }
        : legacyState;

    setDocumentPagesFromTemplate(payload, {
        fitView: false,
        selectedIndex: state.currentPageIndex || 0
    }).then(() => {
        bindings = new Map(documentPages[currentPageIndex]?.bindings || state.bindings || []);
        renderLayers();
        renderCsvView();
        updateExportUI();

        lastHistorySig = JSON.stringify(state);
        if (typeof callback === 'function') callback();
    }).catch((error) => {
        console.error('Failed to restore history state:', error);
        if (typeof callback === 'function') callback();
    });
}

const requestSaveState = debounce(() => {
    if (historyLocked || isRestoringHistory) return;
    syncCurrentPageStateFromCanvas();
    if (!documentPages.length) return;

    const activePage = documentPages[currentPageIndex];
    const snap = {
        canvas: deepClone(activePage.canvas),
        data: {
            headers: [...headers],
            rows: JSON.parse(JSON.stringify(dataRows)),
            identifierColumn: identifierColumn || ''
        },
        bindings: deepClone(activePage.bindings || Array.from(bindings.entries())),
        pages: deepClone(documentPages),
        currentPageIndex,
        title: $('#titleInput').value,
        page: { width: activePage.width, height: activePage.height }
    };

    const sig = JSON.stringify(snap);
    if (sig === lastHistorySig) {
        updateHistoryButtons();
        return;
    }

    if (historyIndex < historyStack.length - 1) {
        historyStack.splice(historyIndex + 1);
    }

    lastHistorySig = sig;
    historyStack.push(snap);
    const MAX_HISTORY = 40;
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
    updateHistoryButtons();

    if (currentUser) {
        saveStatusEl.textContent = 'Unsaved changes...';
        debouncedSave();
    }

    // Persist data edits to localStorage for session persistence
    cacheLocalDataState();
}, 500);

function commitPendingLineEndpointEdits() {
    let hadPendingEndpointEdit = false;
    canvas.getObjects('line').forEach(line => {
        if (line && line._endpointDragDirty) {
            delete line._endpointDragDirty;
            hadPendingEndpointEdit = true;
        }
    });
    if (!hadPendingEndpointEdit) return;
    requestSaveState();
    if (typeof requestSaveState.flush === 'function') requestSaveState.flush();
    if (currentUser && typeof debouncedSave.flush === 'function') debouncedSave.flush();
}

const ROTATION_SNAP_DEGREES = 45;
const SELECTION_HANDLE_LENGTH = 20;
const SELECTION_HANDLE_THICKNESS = 6;
const SELECTION_ROTATE_HANDLE_SIZE = 20;
const SELECTION_BORDER_SCALE = 1;
const ROTATION_ICON_VIEWBOX = 24;
const ROTATION_ICON_STROKE_WIDTH = 1.5;
const ROTATION_ICON_PATH_DATA = 'M20.4898 14.9907C19.8414 16.831 18.6124 18.4108 16.9879 19.492C15.3635 20.5732 13.4316 21.0972 11.4835 20.9851C9.5353 20.873 7.67634 20.1308 6.18668 18.8704C4.69703 17.61 3.65738 15.8996 3.22438 13.997C2.79138 12.0944 2.98849 10.1026 3.78602 8.32177C4.58354 6.54091 5.93827 5.06746 7.64608 4.12343C9.35389 3.17941 11.3223 2.81593 13.2546 3.08779C16.5171 3.54676 18.6725 5.91142 21 8M21 8V2M21 8H15';
const ROTATION_ICON_PATH = typeof Path2D !== 'undefined' ? new Path2D(ROTATION_ICON_PATH_DATA) : null;

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function getControlRotationRadians(fabricObject) {
    let angleDeg = 0;
    if (fabricObject && typeof fabricObject.getTotalAngle === 'function') {
        angleDeg = fabricObject.getTotalAngle();
    } else if (fabricObject && Number.isFinite(fabricObject.angle)) {
        angleDeg = fabricObject.angle;
    }
    return fabric.util.degreesToRadians(Number.isFinite(angleDeg) ? angleDeg : 0);
}

function renderSelectionSideHandle(isHorizontal) {
    return function drawControl(ctx, left, top, styleOverride = {}, fabricObject) {
        const width = isHorizontal ? SELECTION_HANDLE_LENGTH : SELECTION_HANDLE_THICKNESS;
        const height = isHorizontal ? SELECTION_HANDLE_THICKNESS : SELECTION_HANDLE_LENGTH;
        const strokeColor = styleOverride.cornerColor || fabricObject?.borderColor || '#000000';

        ctx.save();
        ctx.translate(left, top);
        ctx.rotate(getControlRotationRadians(fabricObject));
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.25;
        drawRoundedRectPath(ctx, -width / 2, -height / 2, width, height, Math.min(width, height) / 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    };
}

function renderSelectionRotateHandle(ctx, left, top, styleOverride = {}, fabricObject) {
    const strokeColor = styleOverride.cornerColor || fabricObject?.borderColor || '#000000';

    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(getControlRotationRadians(fabricObject));
    ctx.strokeStyle = strokeColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (ROTATION_ICON_PATH) {
        const iconSize = SELECTION_ROTATE_HANDLE_SIZE;
        const scale = iconSize / ROTATION_ICON_VIEWBOX;
        ctx.translate(-iconSize / 2, -iconSize/2);
        ctx.scale(scale, scale);
        ctx.lineWidth = ROTATION_ICON_STROKE_WIDTH;
        ctx.stroke(ROTATION_ICON_PATH);
    } else {
        // Fallback for environments without Path2D support.
        ctx.fillStyle = strokeColor;
        ctx.font = `bold ${Math.round(SELECTION_ROTATE_HANDLE_SIZE * 0.7)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u21bb', 0, 0);
    }
    ctx.restore();
}

function configureSelectionControls() {
    const controls = fabric?.Object?.prototype?.controls;
    if (!controls) return;

    const setSideHandleStyle = (key, isHorizontal) => {
        const control = controls[key];
        if (!control) return;
        control.render = renderSelectionSideHandle(isHorizontal);
        control.sizeX = isHorizontal ? SELECTION_HANDLE_LENGTH : SELECTION_HANDLE_THICKNESS;
        control.sizeY = isHorizontal ? SELECTION_HANDLE_THICKNESS : SELECTION_HANDLE_LENGTH;
        control.touchSizeX = Math.max(control.sizeX, 18);
        control.touchSizeY = Math.max(control.sizeY, 18);
        control.withConnection = false;
    };

    setSideHandleStyle('mt', true);
    setSideHandleStyle('mb', true);
    setSideHandleStyle('ml', false);
    setSideHandleStyle('mr', false);

    const rotateControl = controls.mtr;
    if (rotateControl) {
        rotateControl.render = renderSelectionRotateHandle;
        rotateControl.sizeX = SELECTION_ROTATE_HANDLE_SIZE;
        rotateControl.sizeY = SELECTION_ROTATE_HANDLE_SIZE;
        rotateControl.touchSizeX = SELECTION_ROTATE_HANDLE_SIZE + 8;
        rotateControl.touchSizeY = SELECTION_ROTATE_HANDLE_SIZE + 8;
        rotateControl.offsetY = -30;
        rotateControl.withConnection = true;
    }
}

function snapAngleToNearestIncrement(angle, increment = ROTATION_SNAP_DEGREES) {
    if (!Number.isFinite(angle)) return angle;
    if (!Number.isFinite(increment) || increment <= 0) return angle;
    return Math.round(angle / increment) * increment;
}

function applyRotationSnapOnShift(options) {
    if (!options?.e?.shiftKey) return;
    const target = options?.target;
    if (!target || !Number.isFinite(target.angle)) return;
    const snappedAngle = snapAngleToNearestIncrement(target.angle);
    if (!Number.isFinite(snappedAngle) || Math.abs(snappedAngle - target.angle) < 0.0001) return;
    target.set('angle', snappedAngle);
    target.setCoords();
}

// --- CANVAS & PAGE SETUP ---
function initializeCanvas() {
    configureSelectionControls();
    fabric.Object.prototype.set({ transparentCorners: false, cornerStyle: 'circle', cornerColor: '#000000', cornerSize: 10, borderColor: '#000000', borderScaleFactor: SELECTION_BORDER_SCALE, padding: 0, strokeUniform: true });
    fabric.ActiveSelection.prototype.set({ cornerStyle: 'circle', cornerColor: '#000000', borderColor: 'black', borderScaleFactor: SELECTION_BORDER_SCALE, padding: 0 });
    const resizeCanvas = () => {
        const { width, height } = canvasWrapper.getBoundingClientRect();
        canvas.setWidth(width);
        canvas.setHeight(height);
        clampViewportTransform(canvas.viewportTransform);
        canvas.renderAll();
    };
    pageRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: DEFAULT_PAGE_WIDTH,
        height: DEFAULT_PAGE_HEIGHT,
        fill: '#fff',
        stroke: 'rgba(0,0,0,0.25)',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        oid: 'pageRect',
        isArtboard: true
    });
    canvas.add(pageRect);
    resizeCanvas();
    drawGrid();
    new ResizeObserver(resizeCanvas).observe(canvasWrapper);

    documentPages = [normalizePageState({
        id: createUid('page'),
        title: 'Page 1',
        width: DEFAULT_PAGE_WIDTH,
        height: DEFAULT_PAGE_HEIGHT,
        canvas: canvas.toJSON(SERIALIZE_PROPS),
        bindings: []
    }, 0)];
    currentPageIndex = 0;
    setCanvasPageSelection([0], { ensureCurrent: false });
    canvasSelectionAnchorIndex = 0;
    generalPageSize = getMostCommonPageSize();
    syncGeneralPageSizeInputs();
    refreshCanvasPageControls({ preserveScroll: false, ensureActiveVisible: true });
    isCanvasPagesPanelCollapsed = false;
    applyCanvasPagesPanelState();
    initPageActionToolbar();
    const toggleCanvasPagesPanel = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        isCanvasPagesPanelCollapsed = !isCanvasPagesPanelCollapsed;
        applyCanvasPagesPanelState();
    };
    if (toggleCanvasPagesPanelBtn) {
        toggleCanvasPagesPanelBtn.addEventListener('click', toggleCanvasPagesPanel);
    }
    if (hideCanvasPagesPanelBtn) {
        hideCanvasPagesPanelBtn.addEventListener('click', toggleCanvasPagesPanel);
    }
    if (canvasPagesHeaderRow) {
        canvasPagesHeaderRow.addEventListener('click', (event) => {
            if (event.target instanceof Element && event.target.closest('button')) return;
            toggleCanvasPagesPanel(event);
        });
    }

    canvas.on({
        'object:added': (e) => {
            if (isRenderingCanvasGhosts || isPageSwitching || !e?.target || e.target.isCanvasGhost) return;
            if (isPastingFromClipboard) return;
            requestSaveState();
            renderLayers();
            refreshCanvasPageControlsDebounced();
        },
        'object:removed': (e) => {
            if (isPageSwitching || isRenderingCanvasGhosts || !e?.target) return;
            if (e.target.isCanvasGhost) {
                // Ghost removals are persisted only on explicit user delete actions.
                return;
            }
            requestSaveState();
            renderLayers();
            refreshCanvasPageControlsDebounced();
        },
        'object:modified': async (e) => {
            if (isRenderingCanvasGhosts || !e?.target) return;
            isObjectInteractionActive = false;
            if (e.target.type === 'activeSelection' && typeof e.target.getObjects === 'function') {
                const members = e.target.getObjects();
                const hasGhostMembers = members.some(member => member?.isCanvasGhost);
                const hasNonGhostMembers = members.some(member => member && !member.isCanvasGhost);
                const lockGhostToSourcePage = hasGhostMembers && (hasNonGhostMembers || members.length > 1);
                let ghostChanged = false;
                let movedToCurrent = false;

                members.forEach(member => {
                    if (!member) return;
                    if (member.isCanvasGhost) {
                        const result = commitGhostObjectModification(member, { lockToSourcePage: lockGhostToSourcePage });
                        if (result.changed) {
                            ghostChanged = true;
                            if (result.moved && result.targetPageIndex === currentPageIndex) {
                                movedToCurrent = true;
                            }
                        }
                        return;
                    }
                    applyObjectMaskForPage(member, currentPageIndex);
                });

                if (movedToCurrent) {
                    await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
                    requestSaveState();
                    refreshCanvasPageControlsDebounced();
                    return;
                }
                if (!hasGhostMembers && await maybeReassignObjectToDominantPage(e.target)) return;
                if (ghostChanged) {
                    canvas.discardActiveObject();
                    updateFloatingLinker(null);
                    renderCanvasGhostPages();
                    renderLayers();
                    renderPageInspector();
                }
                scheduleOutsideObjectsCleanup();
                requestSaveState();
                refreshCanvasPageControlsDebounced();
                if (!ghostChanged && e.target) { refreshInspector({ target: e.target }); }
                return;
            }
            if (e.target.isCanvasGhost) {
                const result = commitGhostObjectModification(e.target);
                if (!result.changed) return;
                if (result.moved && result.targetPageIndex === currentPageIndex) {
                    await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
                    requestSaveState();
                    refreshCanvasPageControlsDebounced();
                    return;
                }
                canvas.discardActiveObject();
                updateFloatingLinker(null);
                renderCanvasGhostPages();
                renderLayers();
                renderPageInspector();
                refreshCanvasPageControlsDebounced();
                requestSaveState();
                return;
            }
            if (await maybeReassignObjectToDominantPage(e?.target)) return;
            applyObjectMaskForPage(e?.target, currentPageIndex);
            scheduleOutsideObjectsCleanup();
            requestSaveState();
            refreshCanvasPageControlsDebounced();
            if (e.target) { refreshInspector({ target: e.target }); }
        },
        'object:moving': (e) => {
            scheduleOutsideObjectsCleanup.clear();
            if (e?.transform?.action !== 'modifyLineEndpoint') handleSmartSnapping(e);
            updateFloatingLinkerPosition(e.target);
        },
        'object:scaling': (e) => {
            scheduleOutsideObjectsCleanup.clear();
            handleResizeSnapping(e);
            const obj = e.target;
            if (obj && obj.type === 'textbox') {
                const newFontSize = Math.round(obj.fontSize * obj.scaleX);
                const newWidth = obj.width * obj.scaleX;
                obj.set({
                    fontSize: newFontSize,
                    width: newWidth,
                    scaleX: 1,
                    scaleY: 1
                });
                refreshTextboxCurve(obj, { skipRender: true });
            }
            updateLiveInspector(e);
            updateFloatingLinkerPosition(e.target);
        },
        'object:rotating': (e) => {
            scheduleOutsideObjectsCleanup.clear();
            applyRotationSnapOnShift(e);
            updateLiveInspector(e);
            updateFloatingLinkerPosition(e.target);
        },
        'text:changed': (e) => {
            const target = e?.target;
            if (target && target.type === 'textbox') {
                refreshTextboxCurve(target, { skipRender: true });
            }
        },
        'mouse:up': () => {
            clearSnapLines();
            commitPendingLineEndpointEdits();
            scheduleOutsideObjectsCleanup();
        }, // 7. Clear guides on mouse up
        'after:render': () => { updatePageActionToolbarPosition(); }
    });
    styleActivePageRect();
    applyCanvasMaskToActivePageObjects();
    renderCanvasGhostPages();
    updatePageActionToolbarPosition();
    requestSaveState(); renderLayers();
    addWheelPanFix();

    onClick('#undoBtn', undo);
    onClick('#redoBtn', redo);
}

function keepPageRectAtBack() {
    if (!pageRect) return;
    canvas.sendToBack(pageRect);
}

window.addEventListener('paste', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; const items = e.clipboardData.items; if (!items) return;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) { e.preventDefault(); const blob = item.getAsFile(); const reader = new FileReader(); reader.onload = (event) => { const spawn = getDefaultSpawnPoint(); adders.image(spawn.x, spawn.y, event.target.result); }; reader.readAsDataURL(blob); break; }
        if (item.type.indexOf('text/plain') !== -1) { e.preventDefault(); item.getAsString((text) => { const spawn = getDefaultSpawnPoint(); adders.text(spawn.x, spawn.y, text); }); break; }
    }
});
const setPageDimensions = debounce(() => {
    if (!documentPages.length) return;
    const targetWidth = parsePositiveInt($('#pageWidth').value, generalPageSize.width || DEFAULT_PAGE_WIDTH);
    const targetHeight = parsePositiveInt($('#pageHeight').value, generalPageSize.height || DEFAULT_PAGE_HEIGHT);
    const priorWidth = parsePositiveInt(generalPageSize.width, DEFAULT_PAGE_WIDTH);
    const priorHeight = parsePositiveInt(generalPageSize.height, DEFAULT_PAGE_HEIGHT);

    syncCurrentPageStateFromCanvas();

    let changedAny = false;
    let currentChanged = false;
    let layoutAffectsCurrent = false;
    documentPages.forEach((page, index) => {
        if (!page) return;
        if (page.width === priorWidth && page.height === priorHeight) {
            page.width = targetWidth;
            page.height = targetHeight;
            ensurePageRectInCanvasState(page);
            changedAny = true;
            if (index === currentPageIndex) currentChanged = true;
            if (index < currentPageIndex) layoutAffectsCurrent = true;
        }
    });

    generalPageSize = { width: targetWidth, height: targetHeight };
    syncGeneralPageSizeInputs();

    if ((currentChanged || layoutAffectsCurrent) && pageRect) {
        if (currentChanged) {
            pageRect.set({ width: targetWidth, height: targetHeight });
            pageRect.setCoords();
        }
        relocateActiveCanvasToLayout();
        applyCanvasMaskToActivePageObjects();
        drawGrid();
        clampViewportTransform(canvas.viewportTransform);
        canvas.renderAll();
        syncCurrentPageStateFromCanvas();
    }

    if (changedAny) renderCanvasGhostPages();
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: false });
    if (changedAny) requestSaveState();
}, 300);
on('#titleInput', 'input', () => { requestSaveState(); }); on('#pageWidth', 'input', setPageDimensions); on('#pageHeight', 'input', setPageDimensions);
function drawGrid() { canvas.remove(...canvas.getObjects('line').filter(o => o.excludeFromExport && !o.isCanvasGhost)); if (!gridEnabled || !pageRect) { canvas.renderAll(); return; } const { width, height, left, top } = pageRect; const gridLines = []; const lineOption = { stroke: 'rgba(0,0,0,0.1)', selectable: false, evented: false, excludeFromExport: true }; const step = gridCellSize; for (let i = 1; i < (width / step); i++) gridLines.push(new fabric.Line([left + i * step, top, left + i * step, top + height], lineOption)); for (let i = 1; i < (height / step); i++) gridLines.push(new fabric.Line([left, top + i * step, left + width, top + i * step], lineOption)); canvas.add(...gridLines); gridLines.forEach(line => canvas.sendToBack(line)); canvas.sendToBack(pageRect); canvas.renderAll(); }
on('#toggleGridBtn', 'click', () => { gridEnabled = !gridEnabled; $('#toggleGridBtn').classList.toggle('active', gridEnabled); drawGrid(); });
on('#toggleSnapBtn', 'click', () => { snapEnabled = !snapEnabled; $('#toggleSnapBtn').classList.toggle('active', snapEnabled); });
const gridSizeInput = $('#gridSizeInput'); gridSizeInput.value = gridCellSize; gridSizeInput.addEventListener('input', (e) => { const newSize = Math.max(12, Math.min(64, parseInt(e.target.value, 10))); if (!isNaN(newSize) && gridCellSize !== newSize) { gridCellSize = newSize; drawGrid(); } });
on('#closeColumnSelectModal', 'click', () => $('#columnSelectModal').style.display = 'none');

// --- CANVAS PANNING & ZOOM ---
function getWorkspaceBounds() {
    const artboards = canvas.getObjects().filter(o => o && (o.isArtboard || o.oid === 'pageRect'));
    if (!artboards.length) {
        return { minX: 0, minY: 0, maxX: DEFAULT_PAGE_WIDTH, maxY: DEFAULT_PAGE_HEIGHT };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    artboards.forEach(board => {
        board.setCoords();
        const rect = board.getBoundingRect(true, true);
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.left + rect.width);
        maxY = Math.max(maxY, rect.top + rect.height);
    });

    return { minX, minY, maxX, maxY };
}

function clampViewportTransform(vpt = canvas.viewportTransform) {
    if (!vpt) return;
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const viewportW = wrapperRect.width || canvas.getWidth() || 1;
    const viewportH = wrapperRect.height || canvas.getHeight() || 1;
    const zoom = canvas.getZoom() || 1;
    const bounds = getWorkspaceBounds();
    const pageCount = Math.max(1, documentPages.length || 1);
    const widestPage = documentPages.reduce(
        (max, page) => Math.max(max, parsePositiveInt(page?.width, DEFAULT_PAGE_WIDTH)),
        DEFAULT_PAGE_WIDTH
    );
    const tallestPage = documentPages.reduce(
        (max, page) => Math.max(max, parsePositiveInt(page?.height, DEFAULT_PAGE_HEIGHT)),
        DEFAULT_PAGE_HEIGHT
    );
    const dynamicPaddingX = CAMERA_BOUND_PADDING + Math.max(0, pageCount - 1) * Math.max(220, Math.round(widestPage * 0.3));
    const dynamicPaddingY = CAMERA_BOUND_PADDING + Math.max(0, pageCount - 1) * Math.max(160, Math.round(tallestPage * 0.2));

    const minTx = viewportW - (bounds.maxX + dynamicPaddingX) * zoom;
    const maxTx = -((bounds.minX - dynamicPaddingX) * zoom);
    const minTy = viewportH - (bounds.maxY + dynamicPaddingY) * zoom;
    const maxTy = -((bounds.minY - dynamicPaddingY) * zoom);

    if (minTx <= maxTx) {
        vpt[4] = Math.min(maxTx, Math.max(minTx, vpt[4]));
    }

    if (minTy <= maxTy) {
        vpt[5] = Math.min(maxTy, Math.max(minTy, vpt[5]));
    }
}

function updateZoomLabel() {
    $('#zoomLevel').textContent = `Zoom: ${Math.round(canvas.getZoom() * 100)}%`;
}

function panViewportBy(dx, dy) {
    const vpt = canvas.viewportTransform;
    vpt[4] += dx;
    vpt[5] += dy;
    clampViewportTransform(vpt);
    canvas.setViewportTransform(vpt);
    canvas.requestRenderAll();
}

// Ensure wheel events are captured and do not scroll the page
try {
    canvas.upperCanvasEl.addEventListener('wheel', (ev) => { ev.preventDefault(); }, { passive: false });
} catch (e) { }

function refreshCanvasPointerOffset() {
    if (!canvas?.upperCanvasEl) return;
    canvas.calcOffset();
}

window.addEventListener('resize', refreshCanvasPointerOffset);
window.addEventListener('scroll', refreshCanvasPointerOffset, true);

let isPanning = false;
let isMiddleMousePanning = false;
let lastPosX = 0;
let lastPosY = 0;
let isSpaceDown = false;

function beginPan(clientX, clientY) {
    isPanning = true;
    canvas.selection = false;
    lastPosX = clientX;
    lastPosY = clientY;
    canvas.setCursor('grabbing');
}

function endPan() {
    if (!isPanning && !isMiddleMousePanning) return;
    isPanning = false;
    isMiddleMousePanning = false;
    canvas.selection = true;
    canvas.setViewportTransform(canvas.viewportTransform);
    if (isSpaceDown) canvas.setCursor('grab');
    else canvas.setCursor('default');
}

function addWheelPanFix() {
    const el = canvas.upperCanvasEl;
    if (!el) return;

    // Prevent browser swipe/back behavior while interacting in-canvas.
    el.style.overscrollBehavior = 'contain';

    el.addEventListener('mousedown', (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        isMiddleMousePanning = true;
        beginPan(e.clientX, e.clientY);
    }, true);

    window.addEventListener('mousemove', (e) => {
        if (!isMiddleMousePanning) return;
        e.preventDefault();
        panViewportBy(e.clientX - lastPosX, e.clientY - lastPosY);
        lastPosX = e.clientX;
        lastPosY = e.clientY;
    }, { passive: false });

    window.addEventListener('mouseup', (e) => {
        if (isMiddleMousePanning && e.button === 1) {
            e.preventDefault();
            endPan();
            return;
        }
        // Space+left drag can end outside the canvas, so recover selection globally.
        if (isPanning && !isMiddleMousePanning && e.button === 0) {
            endPan();
        }
    });
}

window.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    isSpaceDown = true;
    canvas.defaultCursor = 'grab';
    canvas.setCursor('grab');
});

window.addEventListener('keyup', e => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    isSpaceDown = false;
    canvas.defaultCursor = 'default';
    if (!isPanning && !isMiddleMousePanning) canvas.setCursor('default');
});

window.addEventListener('blur', () => {
    endPan();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) endPan();
});

canvas.on('mouse:wheel', function (opt) {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();
    refreshCanvasPointerOffset();

    let zoom = canvas.getZoom();
    zoom *= 0.999 ** e.deltaY;
    if (zoom > 20) zoom = 20;
    if (zoom < 0.05) zoom = 0.05;

    const pointer = canvas.getPointer(e);
    canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), zoom);
    clampViewportTransform(canvas.viewportTransform);
    canvas.setViewportTransform(canvas.viewportTransform);
    canvas.requestRenderAll();

    updateZoomLabel();
});

canvas.on('mouse:down', function (opt) {
    const e = opt.e;
    refreshCanvasPointerOffset();
    if (!isSpaceDown || e.button !== 0) return;
    beginPan(e.clientX, e.clientY);
    e.preventDefault();
});

canvas.on('mouse:move', function (opt) {
    if (!isPanning || isMiddleMousePanning) return;
    const e = opt.e;
    panViewportBy(e.clientX - lastPosX, e.clientY - lastPosY);
    lastPosX = e.clientX;
    lastPosY = e.clientY;
});

canvas.on('mouse:up', function () {
    if (!isMiddleMousePanning) endPan();
});


// --- DATA HANDLING ---
// 4. In-app notification
// 4. Modern Toast notification
function showNotification(message, type = 'info', duration = 3000) {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

async function cacheDataFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        localStorage.setItem('cachedFileName', file.name);
        localStorage.setItem('cachedFileData', e.target.result);
        cacheLocalDataState();
    };
    reader.readAsDataURL(file);
}

function cacheLocalDataState() {
    try {
        if (headers.length > 0) {
            localStorage.setItem('cachedHeaders', JSON.stringify(headers));
            localStorage.setItem('cachedDataRows', JSON.stringify(dataRows));
            if (identifierColumn) localStorage.setItem('cachedIdentifierColumn', identifierColumn);
            else localStorage.removeItem('cachedIdentifierColumn');
        } else {
            localStorage.removeItem('cachedHeaders');
            localStorage.removeItem('cachedDataRows');
            localStorage.removeItem('cachedIdentifierColumn');
        }
    } catch (e) {
        console.warn('Failed to cache data to localStorage:', e);
    }
}

function processFileData(arrayBuffer, fileName, opts = {}) {
    try {
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
        if (!json.length) { showNotification('No data found in the sheet.'); return; }
        // Ensure headers are extracted from the first row keys
        headers = Object.keys(json[0]);
        dataRows = json; // Keep the full array of objects
        console.log('Processed Data:', { headers, rowCount: dataRows.length, sample: dataRows[0] });
        $('#fileName').textContent = fileName;
        $('#unloadDataBtn').style.display = 'inline';
        showNotification(`Loaded "${sheetName}" with ${dataRows.length} rows.`);
        refreshInspector({ target: canvas.getActiveObject() });
        updateExportUI();
        updateFloatingLinker(canvas.getActiveObject());
        renderCsvView(); // Update view if open
        refreshIdentifierDropdown();
        requestSaveState(); // Trigger save with new data
        cacheLocalDataState(); // Persist to local storage

        // Show identifier column modal on fresh file load
        if (!opts.skipIdentifierModal) {
            showIdentifierColumnModal();
        }
    } catch (err) {
        showNotification('Error reading file.');
        unloadData();
    }
}
// 5. Unload data function
function unloadData() {
    workbook = null; worksheet = null; headers = []; dataRows = []; identifierColumn = '';
    $('#fileName').textContent = 'No file selected';
    $('#unloadDataBtn').style.display = 'none';
    localStorage.removeItem('cachedFileName');
    localStorage.removeItem('cachedFileData');
    localStorage.removeItem('cachedHeaders');
    localStorage.removeItem('cachedDataRows');
    localStorage.removeItem('cachedIdentifierColumn');
    $('#csvInput').value = '';
    $('#csvViewBtn').style.display = 'none';
    updateExportUI();
    updateFloatingLinker(null);
    showNotification('Data unloaded.');
}
on('#unloadDataBtn', 'click', unloadData);

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64.split(',')[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}
async function loadCachedData() {
    const cachedHeaders = localStorage.getItem('cachedHeaders');
    const cachedRows = localStorage.getItem('cachedDataRows');
    const cachedIdCol = localStorage.getItem('cachedIdentifierColumn');
    const fileName = localStorage.getItem('cachedFileName');

    if (cachedHeaders && cachedRows) {
        try {
            headers = JSON.parse(cachedHeaders);
            dataRows = JSON.parse(cachedRows);
            identifierColumn = cachedIdCol || '';
            $('#fileName').textContent = fileName || 'Restored Data';
            $('#unloadDataBtn').style.display = 'inline';
            $('#csvViewBtn').style.display = 'inline-flex';
            refreshIdentifierDropdown();
            renderCsvView();
            updateExportUI();
            updateFloatingLinker(canvas.getActiveObject());
            return;
        } catch (e) {
            console.error('Failed to parse cached data:', e);
        }
    }

    const fileData = localStorage.getItem('cachedFileData');
    if (fileName && fileData) {
        const arrayBuffer = base64ToArrayBuffer(fileData);
        processFileData(arrayBuffer, fileName, { skipIdentifierModal: true });
    }
}
on('#csvInput', 'change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) { unloadData(); return; }
    await cacheDataFile(file);
    const data = await file.arrayBuffer();
    processFileData(data, file.name);
});

// Font Loading
async function loadFont(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const fontName = file.name.split('.')[0];
            const fontFace = new FontFace(fontName, e.target.result);
            await fontFace.load();
            document.fonts.add(fontFace);
            addFontFamilyToRegistry(fontName);
            refreshInspector({ target: canvas.getActiveObject() });
            showNotification(`Font "${fontName}" loaded.`);
        } catch (err) {
            console.error(err);
            showNotification('Error loading font.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}
on('#fontUpload', 'change', (e) => loadFont(e.target.files[0]));


