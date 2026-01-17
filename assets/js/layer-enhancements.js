// Layer Enhancements: Drag-Drop Reordering + Multi-Select
// Add this file to tool.html: <script src="assets/js/layer-enhancements.js"></script>

// Enhanced renderLayers function with drag-drop and multi-select
window.renderLayersEnhanced = function (e) {
    const list = document.getElementById('layersList');
    if (!list) return;
    list.innerHTML = '';

    const activeObjects = canvas.getActiveObjects();
    const objects = canvas.getObjects().filter(o => o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine);

    if (objects.length === 0) {
        list.innerHTML = '<p class="muted" style="text-align: center; padding: 24px 0; font-size: 13px;">Add an object to the canvas.</p>';
        return;
    }

    // Reverse to show top items first
    objects.slice().reverse().forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.dataset.locked = !!obj.locked;
        item.dataset.oid = obj.oid;
        item.draggable = !obj.locked;

        if (activeObjects.includes(obj)) item.classList.add('active');

        // ===================
        // DRAG AND DROP HANDLERS
        // ===================
        item.addEventListener('dragstart', (e) => {
            if (obj.locked) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', obj.oid);
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragging = list.querySelector('.dragging');
            if (dragging && dragging !== item) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            const draggedOid = e.dataTransfer.getData('text/plain');
            const draggedObj = canvas.getObjects().find(o => o.oid === draggedOid);

            if (!draggedObj || draggedObj === obj) return;

            // Get current indices
            const allObjects = canvas.getObjects();
            const fromIndex = allObjects.indexOf(draggedObj);
            const toIndex = allObjects.indexOf(obj);

            // Move object in z-order
            canvas.moveTo(draggedObj, toIndex);
            canvas.renderAll();
            window.renderLayersEnhanced();
            requestSaveState();
        });

        // ===================
        // MULTI-SELECT WITH CTRL/SHIFT
        // ===================
        item.onclick = (e) => {
            if (obj.locked) return;

            // Multi-select with Shift/Ctrl/Cmd
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                const currentActive = canvas.getActiveObjects();

                if (currentActive.includes(obj)) {
                    // Deselect this object
                    const remaining = currentActive.filter(o => o !== obj);
                    if (remaining.length === 0) {
                        canvas.discardActiveObject();
                    } else if (remaining.length === 1) {
                        canvas.setActiveObject(remaining[0]);
                    } else {
                        canvas.setActiveObject(new fabric.ActiveSelection(remaining, { canvas }));
                    }
                } else {
                    // Add to selection
                    const newSelection = [...currentActive, obj];
                    if (newSelection.length === 1) {
                        canvas.setActiveObject(newSelection[0]);
                    } else {
                        canvas.setActiveObject(new fabric.ActiveSelection(newSelection, { canvas }));
                    }
                }
            } else {
                // Normal single select
                canvas.setActiveObject(obj);
            }
            canvas.renderAll();
        };

        // Layer name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = obj.name || obj.type;

        // Double-click to rename
        nameSpan.ondblclick = (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = obj.name || obj.type;
            input.style.cssText = 'width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--accent); padding: 2px 4px; border-radius: 4px;';
            input.onblur = input.onkeydown = (ev) => {
                if (ev.type === 'keydown' && ev.key !== 'Enter') return;
                obj.name = input.value || obj.type;
                window.renderLayersEnhanced();
                requestSaveState();
            };
            nameSpan.replaceWith(input);
            input.focus();
            input.select();
        };

        // Action buttons
        item.innerHTML = `
            <div class="layer-actions">
                <button title="Lock/Unlock" class="btn ghost btn-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${obj.locked ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'}</svg></button>
                <button title="Bring Forward" class="btn ghost btn-fwd"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg></button>
                <button title="Send Backward" class="btn ghost btn-bwd"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
                <button title="Bring to Front" class="btn ghost btn-front"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5l6 6m-6-6l-6 6M12 19V5M5 19h14"/></svg></button>
                <button title="Send to Back" class="btn ghost btn-back"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19l-6-6m6 6l6-6M12 5v14M5 5h14"/></svg></button>
            </div>`;
        item.prepend(nameSpan);

        // Button event handlers
        item.querySelector('.btn-lock').onclick = (e) => {
            e.stopPropagation();
            toggleLock(obj);
        };
        item.querySelector('.btn-front').onclick = (e) => {
            e.stopPropagation();
            canvas.bringToFront(obj);
            window.renderLayersEnhanced();
            requestSaveState();
        };
        item.querySelector('.btn-back').onclick = (e) => {
            e.stopPropagation();
            canvas.sendToBack(obj);
            keepPageRectAtBack();
            window.renderLayersEnhanced();
            requestSaveState();
        };
        item.querySelector('.btn-fwd').onclick = (e) => {
            e.stopPropagation();
            canvas.bringForward(obj);
            window.renderLayersEnhanced();
            requestSaveState();
        };
        item.querySelector('.btn-bwd').onclick = (e) => {
            e.stopPropagation();
            canvas.sendBackwards(obj);
            window.renderLayersEnhanced();
            requestSaveState();
        };

        list.appendChild(item);
    });
};

// Override the original renderLayers function
// Use a small delay to ensure everything is loaded
setTimeout(() => {
    if (typeof window.renderLayers !== 'undefined') {
        // Save original for fallback
        window.renderLayersOriginal = window.renderLayers;
    }

    // Replace with enhanced version
    window.renderLayers = window.renderLayersEnhanced;

    console.log('✅ Layer enhancements loaded: Drag-drop reordering + Multi-select (Ctrl/Shift)');

    // Force a re-render if layers tab is active and canvas exists
    if (typeof canvas !== 'undefined' && canvas && canvas.getObjects) {
        window.renderLayers();
    }
}, 500); // Increased timeout to 500ms to ensure canvas is ready
