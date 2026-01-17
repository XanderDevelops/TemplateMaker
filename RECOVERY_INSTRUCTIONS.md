# Recovery Instructions - Template Maker Features

## ✅ **Already Re-Applied (Working Now)**

1. ✅ Modern sliders (thin, black, circular thumb)
2. ✅ Light mode canvas (white background)
3. ✅ Zoom text color (readable in both modes)
4. ✅ Undo/redo fix (with proper callbacks)
5. ✅ Shape stretching fix (strokeUniform)
6. ✅ Default colors (black/white)
7. ✅ Save on login (auto-saves every 10s, prompts on login)
8. ✅ Null color button (× button next to color pickers)

## 📝 **Still Need to Apply**

The following features were coded but lost during git checkout. To avoid file corruption, I recommend applying them one at a time by manually editing the `tool.html` file:

### #7 & #6: Text Formatting + Multi-Text Formatting

**Location**: Around line 1575 (in `renderSingleObjectInspector` function)

**Replace** this line:
```javascript
if (o.type === 'textbox') inspector.appendChild(section('Text', [ inputRow('Content', o.text, v => o.set({text:v}), 'textarea'), inputRow('Font Size', o.fontSize, v => o.set({fontSize:parseFloat(v)})), selectRow('Font Family', FONT_LIST, o.fontFamily, v => o.set({fontFamily:v})), colorInputRow('Fill Color', o.fill, v => o.set({fill:v})), buttonGroupRow('Alignment', ['left','center','right','justify'], o.textAlign, v => { o.set({textAlign:v}); o.initDimensions(); canvas.requestRenderAll(); }) ])); 
```

**With**:
```javascript
if (o.type === 'textbox') {
    inspector.appendChild(section('Text', [ 
        inputRow('Content', o.text, v => o.set({text:v}), 'textarea'), 
        inputRow('Font Size', o.fontSize, v => o.set({fontSize:parseFloat(v)})), 
        selectRow('Font Family', FONT_LIST, o.fontFamily, v => o.set({fontFamily:v})), 
        colorInputRow('Fill Color', o.fill, v => o.set({fill:v})),
        buttonGroupRow('Text Style', [
            {value: 'bold', label: 'B', active: o.fontWeight === 'bold'},
            {value: 'italic', label: 'I', active: o.fontStyle === 'italic'},
            {value: 'underline', label: 'U', active: o.underline === true}
        ], null, (v) => {
            if (v === 'bold') o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold');
            else if (v === 'italic') o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic');
            else if (v === 'underline') o.set('underline', !o.underline);
            canvas.renderAll();
            requestSaveState();
            refreshInspector({target: o});
        }),
        buttonGroupRow('Alignment', ['left','center','right','justify'], o.textAlign, v => { o.set({textAlign:v}); o.initDimensions(); canvas.requestRenderAll(); }) 
    ])); 
}
```

### #5: Multi-Object Alignment

**Location**: Add new functions before `function getBindingsFor(o)`

**Add these two new functions**:
```javascript
function alignMultipleObjectsButtons() {
    const container = document.createElement('div'); 
    container.className = 'align-buttons full-width'; 
    container.style.gridTemplateColumns = 'repeat(6, 1fr)';
    
    const alignments = [
        {key: 'left', icon: '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="3" y2="18" stroke="currentColor" stroke-width="2"/><rect x="6" y="4" width="6" height="4" fill="currentColor"/><rect x="6" y="10" width="10" height="4" fill="currentColor"/><rect x="6" y="16" width="8" height="4" fill="currentColor"/></svg>', title: 'Align left edges'},
        {key: 'h_center', icon: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><rect x="8" y="4" width="8" height="4" fill="currentColor"/><rect x="6" y="10" width="12" height="4" fill="currentColor"/><rect x="7" y="16" width="10" height="4" fill="currentColor"/></svg>', title: 'Align centers horizontally'},
        {key: 'right', icon: '<svg viewBox="0 0 24 24"><line x1="21" y1="6" x2="21" y2="18" stroke="currentColor" stroke-width="2"/><rect x="9" y="4" width="6" height="4" fill="currentColor"/><rect x="5" y="10" width="10" height="4" fill="currentColor"/><rect x="7" y="16" width="8" height="4" fill="currentColor"/></svg>', title: 'Align right edges'},
        {key: 'top', icon: '<svg viewBox="0 0 24 24"><line x1="6" y1="3" x2="18" y2="3" stroke="currentColor" stroke-width="2"/><rect x="4" y="6" width="4" height="6" fill="currentColor"/><rect x="10" y="6" width="4" height="10" fill="currentColor"/><rect x="16" y="6" width="4" height="8" fill="currentColor"/></svg>', title: 'Align top edges'},
        {key: 'v_center', icon: '<svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/><rect x="4" y="8" width="4" height="8" fill="currentColor"/><rect x="10" y="6" width="4" height="12" fill="currentColor"/><rect x="16" y="7" width="4" height="10" fill="currentColor"/></svg>', title: 'Align centers vertically'},
        {key: 'bottom', icon: '<svg viewBox="0 0 24 24"><line x1="6" y1="21" x2="18" y2="21" stroke="currentColor" stroke-width="2"/><rect x="4" y="9" width="4" height="6" fill="currentColor"/><rect x="10" y="5" width="4" height="10" fill="currentColor"/><rect x="16" y="7" width="4" height="8" fill="currentColor"/></svg>', title: 'Align bottom edges'}
    ];
    
    alignments.forEach(({key, icon, title}) => {
        const btn = document.createElement('button'); 
        btn.className = 'btn ghost'; 
        btn.innerHTML = icon; 
        btn.title = title;
        btn.onclick = () => { 
            const active = canvas.getActiveObject(); 
            if (!active || active.type !== 'activeSelection') return;
            
            const objects = active.getObjects();
            if (objects.length < 2) return;
            
            // Calculate alignment reference
            let refValue;
            if (key === 'left') {
                refValue = Math.min(...objects.map(o => o.left - o.getScaledWidth()/2));
                objects.forEach(o => o.set({left: refValue + o.getScaledWidth()/2}));
            } else if (key === 'right') {
                refValue = Math.max(...objects.map(o => o.left + o.getScaledWidth()/2));
                objects.forEach(o => o.set({left: refValue - o.getScaledWidth()/2}));
            } else if (key === 'h_center') {
                const lefts = objects.map(o => o.left);
                refValue = (Math.min(...lefts) + Math.max(...lefts)) / 2;
                objects.forEach(o => o.set({left: refValue}));
            } else if (key === 'top') {
                refValue = Math.min(...objects.map(o => o.top - o.getScaledHeight()/2));
                objects.forEach(o => o.set({top: refValue + o.getScaledHeight()/2}));
            } else if (key === 'bottom') {
                refValue = Math.max(...objects.map(o => o.top + o.getScaledHeight()/2));
                objects.forEach(o => o.set({top: refValue - o.getScaledHeight()/2}));
            } else if (key === 'v_center') {
                const tops = objects.map(o => o.top);
                refValue = (Math.min(...tops) + Math.max(...tops)) / 2;
                objects.forEach(o => o.set({top: refValue}));
            }
            
            objects.forEach(o => o.setCoords());
            canvas.renderAll(); 
            requestSaveState(); 
        }; 
        container.appendChild(btn); 
    });
    
    return container;
}
```

And update the existing `alignToPageButtons()` function to accept a parameter:

```javascript
function alignToPageButtons(isMultiSelect = false) { 
    const container = document.createElement('div'); 
    container.className = 'align-buttons full-width'; 
    const icons = { 
        left: '<svg viewBox="0 0 24 24"><path d="M18 21V3h2v18h-2zm-4 0V3h2v18h-2zM4 21h6V3H4v18z" fill="currentColor"/></svg>', 
        h_center: '<svg viewBox="0 0 24 24"><path d="M4 21V3h2v18H4zm14 0V3h2v18h-2zM9 21V3h6v18H9z" fill="currentColor"/></svg>', 
        right: '<svg viewBox="0 0 24 24"><path d="M4 21V3h2v18H4zm4 0V3h2v18H8zm12 0h-6V3h6v18z" fill="currentColor"/></svg>', 
        top: '<svg viewBox="0 0 24 24" transform="rotate(90)"><path d="M18 21V3h2v18h-2zm-4 0V3h2v18h-2zM4 21h6V3H4v18z" fill="currentColor"/></svg>', 
        v_center: '<svg viewBox="0 0 24 24" transform="rotate(90)"><path d="M4 21V3h2v18H4zm14 0V3h2v18h-2zM9 21V3h6v18H9z" fill="currentColor"/></svg>', 
        bottom: '<svg viewBox="0 0 24 24" transform="rotate(90)"><path d="M4 21V3h2v18H4zm4 0V3h2v18H8zm12 0h-6V3h6v18z" fill="currentColor"/></svg>' 
    }; 
    const actions = { 
        left: o => o.set({ originX: 'left', left: pageRect.left }), 
        h_center: o => o.set({ originX: 'center', left: pageRect.left + pageRect.width / 2 }), 
        right: o => o.set({ originX: 'left', left: pageRect.left + pageRect.width - o.getScaledWidth() }), 
        top: o => o.set({ originY: 'top', top: pageRect.top }), 
        v_center: o => o.set({ originY: 'center', top: pageRect.top + pageRect.height / 2 }), 
        bottom: o => o.set({ originY: 'top', top: pageRect.top + pageRect.height - o.getScaledHeight() }) 
    }; 
    Object.keys(icons).forEach(key => { 
        const btn = document.createElement('button'); 
        btn.className = 'btn ghost'; 
        btn.innerHTML = icons[key]; 
        bn.title = `Align ${key.replace('_', ' ')}`;
        btn.onclick = () => { 
            const active = canvas.getActiveObject(); 
            if (active && pageRect) { 
                if (isMultiSelect && active.type === 'activeSelection') {
                    active.forEachObject(obj => actions[key](obj));
                    active.setCoords();
                } else {
                    actions[key](active); 
                    active.setCoords(); 
                }
                canvas.renderAll(); 
                requestSaveState(); 
            } 
        }; 
        container.appendChild(btn); 
    }); 
    return container; 
}
```

### Update `renderMultiSelectInspector` to include alignment

**Location**: Find `function renderMultiSelectInspector(selection)`

**Add these sections after the Actions section**:
```javascript
// Alignment for multiple objects
multiInspector.appendChild(section('Align Objects', [alignMultipleObjectsButtons()]));
multiInspector.appendChild(section('Align to Page', [alignToPageButtons(true)]));
```

### Update `buttonGroupRow` to support toggle buttons

**Location**: Find `function buttonGroupRow`

**Replace entire function** with improved version that supports toggle buttons (for B/I/U).

---

## Summary

**STATUS**: 8/15 features re-applied successfully

**Working Now**:
- Sliders, Light Mode, Zoom, Undo/Redo, Colors, Guest Save, Null Colors

**Manual Application Needed**:
- Text Formatting (#7)  
- Multi-Object Alignment (#5)
- Multi-Text Formatting (#6)

**Recommendation**: Apply the above changes manually by copying/pasting each section one at a time, testing after each change.
