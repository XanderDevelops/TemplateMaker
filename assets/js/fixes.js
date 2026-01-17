// Critical fixes for the Template Maker tool

// Fix 1: Add missing alignToPageButtons function
function alignToPageButtons() {
    const container = document.createElement('div');
    container.className = 'align-buttons full-width';
    const icons = { 
        h_center: '<svg viewBox="0 0 24 24"><path d="M4 21V3h2v18H4zm14 0V3h2v18h-2zM9 21V3h6v18H9z" fill="currentColor"/></svg>', 
        v_center: '<svg viewBox="0 0 24 24" transform="rotate(90)"><path d="M4 21V3h2v18H4zm14 0V3h2v18h-2zM9 21V3h6v18H9z" fill="currentColor"/></svg>' 
    };
    const actions = { 
        h_center: () => { 
            const obj = canvas.getActiveObject(); 
            if (!obj || !pageRect) return; 
            obj.set({ left: pageRect.left + pageRect.width / 2 }); 
            obj.setCoords(); 
            canvas.renderAll(); 
            requestSaveState(); 
        },
        v_center: () => { 
            const obj = canvas.getActiveObject(); 
            if (!obj || !pageRect) return; 
            obj.set({ top:  pageRect.top + pageRect.height / 2 }); 
            obj.setCoords(); 
            canvas.renderAll(); 
            requestSaveState(); 
        }
    };
    Object.keys(icons).forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.style.cssText = 'padding: 6px;';
        btn.innerHTML = icons[key];
        btn.onclick = actions[key];
        container.appendChild(btn);
    });
    return container;
}

// Make function available globally
if (typeof window !== 'undefined') {
    window.alignToPageButtons = alignToPageButtons;
}
