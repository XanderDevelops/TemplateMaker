# Layer Enhancements - Installation Instructions

## ✅ Files Created:
- `assets/js/layer-enhancements.js` - Drag-drop + Multi-select code

## 📝 Installation Steps:

### Step 1: Add JavaScript File
Add this line in `tool.html` **before the closing `</body>` tag**:

```html
<script src="assets/js/layer-enhancements.js"></script>
```

**Location**: Find `</body>` at the very end of the file and add the script tag right before it.

---

### Step 2: Add CSS for Drag States
In `tool.html`, find the `.layers-list .layer-item` CSS (around line 243) and update it to:

```css
.layers-list .layer-item { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    padding: 8px; 
    border-radius: 6px; 
    border: 1px solid var(--border); 
    background: var(--panel-2); 
    font-size: 12px; 
    cursor: grab; 
    transition: opacity .2s, border-color .2s; 
}
.layers-list .layer-item.active { 
    border-color: var(--accent); 
    background: #2a2a2a; 
}
.layers-list .layer-item.dragging { 
    opacity: 0.4; 
    cursor: grabbing; 
}
.layers-list .layer-item.drag-over { 
    border: 2px solid var(--accent); 
    background: rgba(255,255,255,0.05); 
}
```

---

## 🎯 Features Added:

### 1. **Drag-and-Drop Layer Reordering (#9)**
   - Grab any layer item and drag it up/down
   - Visual feedback while dragging (opacity + border)
   - Drop to reorder z-index
   - Locked layers cannot be dragged

### 2. **Layer Multi-Select (#10)**
   - **Ctrl + Click** or **Shift + Click** to select multiple layers
   - Click again while holding Ctrl/Shift to deselect
   - Works just like Figma/Photoshop

---

## ✨ Usage:

**Drag-Drop:**
1. Click and hold a layer item
2. Drag it up or down
3. Release to drop in new position

**Multi-Select:**
1. Hold **Ctrl** (or **Cmd** on Mac)
2. Click multiple layers to select them
3. Or hold **Shift** and click

---

## 🎉 Result:
**14/15 features complete!** Only table cell editing (#8) remains.
