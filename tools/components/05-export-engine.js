// --- EXPORT ---
const exportFormatSelect = $('#exportFormatSelect');
const exportBtn = $('#exportBtn');
const exportSinglePdfBtn = $('#exportSinglePdfBtn');
const exportAllCanvasesBtn = $('#exportAllCanvasesBtn');
const exportPageSelectorWrap = $('#exportPageSelectorWrap');
const exportPageSelectorBtn = $('#exportPageSelectorBtn');
const exportPageSelectorMenu = $('#exportPageSelectorMenu');
const exportAllPagesToggle = $('#exportAllPagesToggle');
const exportPageCheckboxList = $('#exportPageCheckboxList');
const proLimitModal = $('#proLimitModal');
let exportSelectedPageIndexes = new Set([0]);

function setExportPageSelectorOpen(isOpen) {
    if (!exportPageSelectorMenu || !exportPageSelectorBtn) return;
    exportPageSelectorMenu.style.display = isOpen ? 'block' : 'none';
    exportPageSelectorBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function sanitizeExportPageSelections() {
    const next = new Set();
    exportSelectedPageIndexes.forEach(idx => {
        if (Number.isInteger(idx) && idx >= 0 && idx < documentPages.length) next.add(idx);
    });
    if (!next.size && documentPages.length) {
        const safeCurrent = Math.max(0, Math.min(documentPages.length - 1, currentPageIndex));
        next.add(safeCurrent);
    }
    exportSelectedPageIndexes = next;
}

function getSelectedExportPageIndexes() {
    if (!Array.isArray(documentPages) || !documentPages.length) return [];
    if (documentPages.length === 1) return [0];
    if (!exportAllPagesToggle || exportAllPagesToggle.checked) {
        return documentPages.map((_, idx) => idx);
    }
    sanitizeExportPageSelections();
    return Array.from(exportSelectedPageIndexes).sort((a, b) => a - b);
}

function syncExportPageSelectorUI() {
    const totalPages = Array.isArray(documentPages) ? documentPages.length : 0;
    const hasMultipleCanvases = totalPages > 1;

    if (exportPageSelectorWrap) exportPageSelectorWrap.style.display = hasMultipleCanvases ? 'inline-flex' : 'none';
    if (exportAllCanvasesBtn) exportAllCanvasesBtn.style.display = hasMultipleCanvases ? 'inline-flex' : 'none';

    if (!hasMultipleCanvases) {
        setExportPageSelectorOpen(false);
        return;
    }

    if (exportAllPagesToggle && !exportAllPagesToggle.checked) sanitizeExportPageSelections();

    const selectedIndexes = getSelectedExportPageIndexes();
    if (exportPageSelectorBtn) {
        exportPageSelectorBtn.textContent = selectedIndexes.length === totalPages
            ? 'Pages: All'
            : `Pages: ${selectedIndexes.map(idx => idx + 1).join(', ')}`;
    }

    if (!exportPageCheckboxList) return;
    exportPageCheckboxList.innerHTML = '';

    const lockSelection = !!exportAllPagesToggle?.checked;
    const selectedSet = new Set(selectedIndexes);

    documentPages.forEach((_, idx) => {
        const item = document.createElement('label');
        item.className = 'export-page-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = String(idx);
        checkbox.checked = lockSelection || selectedSet.has(idx);
        checkbox.disabled = lockSelection;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) exportSelectedPageIndexes.add(idx);
            else exportSelectedPageIndexes.delete(idx);

            if (!exportSelectedPageIndexes.size) {
                exportSelectedPageIndexes.add(idx);
                checkbox.checked = true;
            }
            syncExportPageSelectorUI();
        });

        const title = document.createElement('span');
        title.textContent = `Page ${idx + 1}`;

        item.append(checkbox, title);
        exportPageCheckboxList.appendChild(item);
    });
}

// Update the UI based on user role and data loaded
function updateExportUI() {
    let format = exportFormatSelect.value;
    const hasData = dataRows.length > 0;

    const isPro = userRole === 'pro' || userRole === 'admin';
    $('#exportFormatSelect option[value="png"]').disabled = !isPro;
    $('#exportFormatSelect option[value="jpg"]').disabled = !isPro;
    if (!isPro && (format === 'png' || format === 'jpg')) {
        exportFormatSelect.value = 'pdf';
        format = 'pdf';
    }

    if (hasData && format !== 'json') {
        exportBtn.textContent = 'Export as ZIP';
        exportSinglePdfBtn.style.display = 'inline-flex';
    } else {
        exportBtn.textContent = 'Export';
        exportSinglePdfBtn.style.display = 'none';
    }

    syncExportPageSelectorUI();
}

function ensureTextboxPathsCloneSafe(rootObject) {
    if (!rootObject) return;

    const stack = [rootObject];
    const visited = new Set();
    const curveEpsilon = (typeof TEXT_CURVE_EPSILON === 'number') ? TEXT_CURVE_EPSILON : 0.001;

    const clearInvalidTextboxPath = (textbox) => {
        textbox.set({
            path: null,
            pathAlign: 'baseline',
            pathSide: 'left',
            pathStartOffset: 0
        });
        if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
        if (typeof textbox.setCoords === 'function') textbox.setCoords();
    };

    while (stack.length) {
        const obj = stack.pop();
        if (!obj || visited.has(obj)) continue;
        visited.add(obj);

        if (obj.type === 'textbox') {
            const curveAmount = (typeof clampTextCurveAmount === 'function')
                ? clampTextCurveAmount(obj.curveAmount)
                : (parseFloat(obj.curveAmount) || 0);
            const hasCurve = Math.abs(curveAmount) > curveEpsilon;
            const hasPath = !!obj.path;
            const hasValidPathObject = hasPath && typeof obj.path.toObject === 'function';
            const missingCurvedPath = hasCurve && !hasPath;
            const invalidPathObject = hasPath && !hasValidPathObject;

            if (missingCurvedPath || invalidPathObject) {
                try {
                    if (hasCurve && typeof refreshTextboxCurve === 'function') {
                        refreshTextboxCurve(obj, { skipRender: true });
                    } else if (invalidPathObject) {
                        clearInvalidTextboxPath(obj);
                    }
                } catch (error) {
                    console.warn('Failed to normalize textbox path before clone:', error);
                    clearInvalidTextboxPath(obj);
                }
            }
        }

        if (typeof obj.getObjects === 'function') {
            const children = obj.getObjects();
            if (Array.isArray(children) && children.length) {
                children.forEach(child => stack.push(child));
            }
        }
    }
}

// 3. Restored High-Quality "Invisible Canvas" Rendering Engine
async function generateCanvasDataURL(format = 'jpeg', quality = 0.9) {
    if (!pageRect) return null;

    const { left: pageLeft, top: pageTop, width: pageW, height: pageH } = pageRect;

    // Use a higher multiplier for PNG for better quality, JPEG is fine at 2x
    const multiplier = format === 'png' ? 3 : 2;

    const tempCanvasEl = document.createElement('canvas');
    tempCanvasEl.width = pageW;
    tempCanvasEl.height = pageH;

    // Create a static canvas that won't be rendered to the screen
    const tempCanvas = new fabric.StaticCanvas(tempCanvasEl, {
        width: pageW,
        height: pageH,
        backgroundColor: pageRect.fill,
    });

    // Clone all objects except the page rectangle and guides
    const objectsToClone = canvas.getObjects().filter(obj => obj.oid !== 'pageRect' && !obj.excludeFromExport && !obj.isArtboard);
    objectsToClone.forEach(obj => ensureTextboxPathsCloneSafe(obj));
    const clonePromises = objectsToClone.map(obj => new Promise(resolve => obj.clone(resolve, SERIALIZE_PROPS)));
    const clonedObjects = await Promise.all(clonePromises);

    clonedObjects.forEach(clone => {
        ensureTextboxPathsCloneSafe(clone);
        if (clone?.type === 'textbox') {
            refreshTextboxCurve(clone, { skipRender: true });
        }
        // Position the clone relative to the page, not the entire canvas
        clone.set({
            left: clone.left - pageLeft,
            top: clone.top - pageTop
        });
        tempCanvas.add(clone);
    });

    // Ensure everything is rendered before exporting
    tempCanvas.renderAll();

    const dataURL = tempCanvas.toDataURL({
        format: format,
        quality: quality,
        multiplier: 3
    });

    // Clean up the temporary canvas
    tempCanvas.dispose();

    return dataURL;
}

async function generatePageDataURLFromPageState(pageState, format = 'jpeg', quality = 0.9) {
    const width = parsePositiveInt(pageState?.width, DEFAULT_PAGE_WIDTH);
    const height = parsePositiveInt(pageState?.height, DEFAULT_PAGE_HEIGHT);
    const safeCanvasState = sanitizeCanvasStateForEditor(pageState?.canvas, {
        pageWidth: width,
        pageHeight: height
    });

    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    const staticCanvas = new fabric.StaticCanvas(off, {
        width,
        height,
        renderOnAddRemove: false,
        selection: false,
        backgroundColor: '#ffffff'
    });

    return new Promise((resolve, reject) => {
        try {
            staticCanvas.loadFromJSON(safeCanvasState, () => {
                try {
                    const objects = staticCanvas.getObjects();
                    const artboard = objects.find(o => o && (o.oid === 'pageRect' || o.isArtboard));
                    if (artboard?.fill) staticCanvas.setBackgroundColor(artboard.fill, () => { });

                    objects.forEach(obj => {
                        if (!obj) return;
                        if (obj.oid === 'pageRect' || obj.isArtboard || obj.excludeFromExport || obj.isSnapLine || obj.isCanvasGhost) {
                            staticCanvas.remove(obj);
                            return;
                        }
                        if (obj.type === 'textbox') {
                            ensureTextboxPathsCloneSafe(obj);
                            refreshTextboxCurve(obj, { skipRender: true });
                        }
                    });

                    staticCanvas.renderAll();
                    const dataURL = staticCanvas.toDataURL({
                        format,
                        quality,
                        multiplier: format === 'png' ? 3 : 2
                    });
                    staticCanvas.dispose();
                    resolve(dataURL);
                } catch (error) {
                    staticCanvas.dispose();
                    reject(error);
                }
            });
        } catch (error) {
            staticCanvas.dispose();
            reject(error);
        }
    });
}

function bindingPropertyToObjectProp(property) {
    switch (property) {
        case 'Text Content': return 'text';
        case 'Font Family': return 'fontFamily';
        case 'Font Size': return 'fontSize';
        case 'Fill':
        case 'Fill Color': return 'fill';
        case 'Opacity': return 'opacity';
        case 'Border Color': return 'borderColor';
        case 'Border Width': return 'borderWidth';
        case 'Stroke Color': return 'stroke';
        case 'Stroke Width': return 'strokeWidth';
        case 'Corner Radius': return 'rx';
        default: return property ? property.toLowerCase().replace(/\s/g, '') : '';
    }
}

function getRowsForIdentifier(identValue) {
    if (!identifierColumn || !identValue) return [];
    return dataRows.filter(r => r[identifierColumn] === identValue);
}

function applyDataBindingsForRow(row) {
    const originalStates = new Map();
    if (!row) return originalStates;

    // If identifier column is set, gather all rows for this identifier
    const identValue = identifierColumn ? row[identifierColumn] : null;
    const identRows = identValue ? getRowsForIdentifier(identValue) : [row];

    canvas.getObjects().forEach(obj => {
        const objBindings = getBindingsFor(obj);
        if (objBindings.length === 0) return;

        const originalProps = {};
        objBindings.forEach(binding => {
            // Resolve which row to use: if binding has a rowIndex and identifier is set, use that row
            const bindingRowIndex = (identifierColumn && typeof binding.rowIndex === 'number') ? binding.rowIndex : 0;
            const effectiveRow = (identifierColumn && typeof binding.rowIndex === 'number') ? identRows[bindingRowIndex] : row;
            const value = effectiveRow ? (effectiveRow[binding.column] ?? '') : '';
            if (value == null) return;

            if (obj.isTable && binding.property === 'Cell Text') {
                ensureTableCellData(obj);
                const cellIndex = getNormalizedBindingCellIndex(obj, binding);
                if (!originalProps.__tableCellTexts) originalProps.__tableCellTexts = {};
                if (originalProps.__tableCellTexts[cellIndex] === undefined) {
                    originalProps.__tableCellTexts[cellIndex] = obj.cellData[cellIndex]?.text || '';
                }
                applyBinding(obj, binding.property, value, binding);
                return;
            }

            if (obj.isTable && (binding.property === 'Border Color' || binding.property === 'Border Width')) {
                ensureTableCellData(obj);
                if (!originalProps.__tableCellBorders) {
                    originalProps.__tableCellBorders = obj.cellData.map(cell => ({
                        borderColor: cell.borderColor,
                        borderWidth: cell.borderWidth
                    }));
                }
            }

            const propName = bindingPropertyToObjectProp(binding.property);
            if (propName && originalProps[propName] === undefined) originalProps[propName] = obj[propName];
            applyBinding(obj, binding.property, value, binding);
        });

        if (Object.keys(originalProps).length > 0) originalStates.set(obj, originalProps);
    });

    canvas.renderAll();
    return originalStates;
}

function restoreDataBindingsState(originalStates) {
    originalStates.forEach((props, obj) => {
        if (props.__tableCellTexts && obj.isTable) {
            ensureTableCellData(obj);
            Object.entries(props.__tableCellTexts).forEach(([idx, text]) => {
                const cellIndex = parseInt(idx, 10);
                if (obj.cellData[cellIndex]) obj.cellData[cellIndex].text = text;
            });
        }
        if (props.__tableCellBorders && obj.isTable) {
            ensureTableCellData(obj);
            props.__tableCellBorders.forEach((cellBorder, idx) => {
                if (!obj.cellData[idx] || !cellBorder) return;
                obj.cellData[idx].borderColor = cellBorder.borderColor;
                obj.cellData[idx].borderWidth = cellBorder.borderWidth;
            });
        }
        if (obj.isTable && (props.__tableCellTexts || props.__tableCellBorders)) {
            updateTableLayout(obj);
        }
        const plainProps = { ...props };
        delete plainProps.__tableCellTexts;
        delete plainProps.__tableCellBorders;
        if (Object.keys(plainProps).length > 0) obj.set(plainProps);
        if (obj.type === 'textbox' && (plainProps.text !== undefined || plainProps.fontSize !== undefined || plainProps.fontFamily !== undefined)) {
            refreshTextboxCurve(obj, { skipRender: true });
        }
    });
    if (originalStates.size > 0) canvas.renderAll();
}

// Main handler for the primary export button
async function handleExport() {
    syncCurrentPageStateFromCanvas();
    const format = exportFormatSelect.value;
    const hasData = dataRows.length > 0;
    const totalRows = dataRows.length;
    const title = ($('#titleInput').value || 'Untitled_Template').trim();
    const isFreeUser = userRole !== 'pro' && userRole !== 'admin';

    // 2. Apply freemium limit
    // If identifier column is set, deduplicate rows by identifier for export
    let exportRows;
    if (hasData && identifierColumn && headers.includes(identifierColumn)) {
        const seen = new Set();
        exportRows = dataRows.filter(r => {
            const id = r[identifierColumn];
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    } else {
        exportRows = hasData ? dataRows : [null];
    }
    const rowsToProcess = hasData
        ? (isFreeUser ? exportRows.slice(0, 15) : exportRows)
        : [null];

    const zip = new JSZip();

    // Handle JSON export separately
    if (format === 'json') {
        const exportPayload = {
            version: 'csvlink-template-v2',
            ...buildTemplatePayload()
        };
        const json = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, `${title}.json`);
        return;
    }

    for (let i = 0; i < rowsToProcess.length; i++) {
        const row = rowsToProcess[i];
        const originalStates = row ? applyDataBindingsForRow(row) : new Map();

        const fileName = `${title}${hasData ? `_row_${i + 1}` : ''}.${format}`;
        const exportFormat = (format === 'pdf' || format === 'jpg') ? 'jpeg' : 'png';
        const dataURL = await generateCanvasDataURL(exportFormat);

        if (format === 'pdf') {
            const { width: pageW, height: pageH } = pageRect;
            const pdf = new jsPDF({ unit: 'px', format: [pageW, pageH] });
            pdf.addImage(dataURL, 'JPEG', 0, 0, pageW, pageH);
            if (hasData) {
                zip.file(fileName, await pdf.output('blob'));
            } else {
                saveAs(pdf.output('blob'), fileName);
            }
        } else if (format === 'png' || format === 'jpg') {
            const blob = await (await fetch(dataURL)).blob();
            if (hasData) {
                zip.file(fileName, blob);
            } else {
                saveAs(blob, fileName);
            }
        }

        // Restore original states
        restoreDataBindingsState(originalStates);
    }

    if (hasData) {
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${title}.zip`);
    }

    // 2. Show pro modal AFTER export if limit was hit
    if (isFreeUser && totalRows > 15) {
        proLimitModal.style.display = 'flex';
    }
}
// Handle the "Single PDF" export button
async function handleSinglePdfExport() {
    syncCurrentPageStateFromCanvas();
    if (!dataRows.length) return;

    const isFreeUser = userRole !== 'pro' && userRole !== 'admin';
    let singlePdfExportRows;
    if (identifierColumn && headers.includes(identifierColumn)) {
        const seen = new Set();
        singlePdfExportRows = dataRows.filter(r => {
            const id = r[identifierColumn];
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    } else {
        singlePdfExportRows = dataRows;
    }
    const totalRows = singlePdfExportRows.length;
    const rowsToProcess = isFreeUser ? singlePdfExportRows.slice(0, 15) : singlePdfExportRows;

    const title = ($('#titleInput').value || 'Untitled_Template').trim();
    if (!pageRect) { alert('Page object not found.'); return; }
    const { width: pageW, height: pageH } = pageRect;
    const pdf = new jsPDF({ unit: 'px', format: [pageW, pageH] });
    let firstPage = true;

    for (const row of rowsToProcess) {
        const originalStates = applyDataBindingsForRow(row);

        const dataURL = await generateCanvasDataURL('jpeg');
        if (!firstPage) pdf.addPage([pageW, pageH]);
        pdf.addImage(dataURL, 'JPEG', 0, 0, pageW, pageH);
        firstPage = false;

        restoreDataBindingsState(originalStates);
    }

    saveAs(pdf.output('blob'), `${title}_all_pages.pdf`);

    if (isFreeUser && totalRows > 15) {
        proLimitModal.style.display = 'flex';
    }
}

async function handleExportAllCanvases() {
    syncCurrentPageStateFromCanvas();
    if (!Array.isArray(documentPages) || !documentPages.length) return;

    const title = ($('#titleInput').value || 'Untitled_Template').trim();
    const format = exportFormatSelect?.value || 'pdf';
    const selectedPageIndexes = getSelectedExportPageIndexes();
    if (!selectedPageIndexes.length) {
        showNotification('Select at least one page to export.', 'info', 2200);
        return;
    }

    if (format === 'json') {
        const payload = buildTemplatePayload();
        const selectedPages = selectedPageIndexes
            .map(index => deepClone(payload.pages?.[index]))
            .filter(Boolean);
        if (!selectedPages.length) {
            showNotification('No pages available for JSON export.', 'info', 2200);
            return;
        }

        const firstPage = selectedPages[0] || {};
        const exportPayload = {
            ...payload,
            page: {
                title: payload.page?.title || title,
                width: parsePositiveInt(firstPage?.width, DEFAULT_PAGE_WIDTH),
                height: parsePositiveInt(firstPage?.height, DEFAULT_PAGE_HEIGHT)
            },
            canvas: firstPage?.canvas || { version: '5.3.0', background: 'transparent', objects: [] },
            bindings: firstPage?.bindings || [],
            pages: selectedPages,
            currentPageIndex: 0
        };

        const json = JSON.stringify({ version: 'csvlink-template-v2', ...exportPayload }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, `${title}_pages.json`);
        return;
    }

    if (format === 'pdf') {
        const firstPage = documentPages[selectedPageIndexes[0]];
        const firstW = parsePositiveInt(firstPage?.width, DEFAULT_PAGE_WIDTH);
        const firstH = parsePositiveInt(firstPage?.height, DEFAULT_PAGE_HEIGHT);
        const pdf = new jsPDF({ unit: 'px', format: [firstW, firstH] });

        for (let i = 0; i < selectedPageIndexes.length; i++) {
            const pageState = documentPages[selectedPageIndexes[i]];
            const pageW = parsePositiveInt(pageState?.width, DEFAULT_PAGE_WIDTH);
            const pageH = parsePositiveInt(pageState?.height, DEFAULT_PAGE_HEIGHT);
            const dataURL = await generatePageDataURLFromPageState(pageState, 'jpeg');
            if (i > 0) pdf.addPage([pageW, pageH]);
            pdf.addImage(dataURL, 'JPEG', 0, 0, pageW, pageH);
        }

        saveAs(pdf.output('blob'), `${title}_pages.pdf`);
        return;
    }

    const exportFormat = format === 'png' ? 'png' : 'jpeg';
    const ext = format === 'png' ? 'png' : 'jpg';
    if (selectedPageIndexes.length === 1) {
        const selectedIndex = selectedPageIndexes[0];
        const pageState = documentPages[selectedIndex];
        const dataURL = await generatePageDataURLFromPageState(pageState, exportFormat);
        const blob = await (await fetch(dataURL)).blob();
        saveAs(blob, `${title}_page_${selectedIndex + 1}.${ext}`);
        return;
    }

    const zip = new JSZip();
    for (const selectedIndex of selectedPageIndexes) {
        const pageState = documentPages[selectedIndex];
        const dataURL = await generatePageDataURLFromPageState(pageState, exportFormat);
        const blob = await (await fetch(dataURL)).blob();
        zip.file(`${title}_page_${selectedIndex + 1}.${ext}`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${title}_pages_${ext}.zip`);
}

// Event Listeners for Export
exportBtn.addEventListener('click', handleExport);
exportSinglePdfBtn.addEventListener('click', handleSinglePdfExport);
if (exportAllCanvasesBtn) exportAllCanvasesBtn.addEventListener('click', handleExportAllCanvases);
exportFormatSelect.addEventListener('change', updateExportUI);
if (exportPageSelectorBtn) {
    exportPageSelectorBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = exportPageSelectorMenu?.style.display === 'block';
        setExportPageSelectorOpen(!isOpen);
    });
}
if (exportAllPagesToggle) {
    exportAllPagesToggle.addEventListener('change', () => {
        if (!exportAllPagesToggle.checked) sanitizeExportPageSelections();
        syncExportPageSelectorUI();
    });
}
if (exportPageSelectorMenu) {
    exportPageSelectorMenu.addEventListener('click', (event) => event.stopPropagation());
}
document.addEventListener('click', (event) => {
    if (!exportPageSelectorWrap || !exportPageSelectorMenu) return;
    if (!exportPageSelectorWrap.contains(event.target)) setExportPageSelectorOpen(false);
});
syncExportPageSelectorUI();
on('#closeProLimitModal', 'click', () => proLimitModal.style.display = 'none');

// Binding logic
function applyBinding(o, prop, val, binding = null) {
    const strVal = String(val).trim();
    const numVal = parseFloat(strVal);
    switch (prop) {
        case 'Text Content':
            if (o.type === 'textbox') {
                o.set({ text: strVal });
                refreshTextboxCurve(o, { skipRender: true });
            }
            break;
        case 'Cell Text':
            if (o.isTable) {
                ensureTableCellData(o);
                const cellIndex = getNormalizedBindingCellIndex(o, binding || {});
                if (o.cellData[cellIndex]) {
                    o.cellData[cellIndex].text = strVal;
                    updateTableLayout(o);
                }
            }
            break;
        case 'Font Family':
            if (o.type === 'textbox') {
                ensureFontFamilyLoaded(strVal);
                o.set({ fontFamily: strVal });
                refreshTextboxCurve(o, { skipRender: true });
            }
            break;
        case 'Font Size':
            if (o.type === 'textbox' && !isNaN(numVal)) {
                o.set({ fontSize: numVal });
                refreshTextboxCurve(o, { skipRender: true });
            }
            break;
        case 'Fill': case 'Fill Color': o.set({ fill: strVal }); break;
        case 'Opacity': if (!isNaN(numVal)) o.set({ opacity: numVal }); break;
        case 'Border Color':
            if (o.isTable) {
                o.borderColor = strVal;
                ensureTableCellData(o);
                o.cellData.forEach(cell => { cell.borderColor = strVal; });
                updateTableLayout(o);
            }
            break;
        case 'Border Width':
            if (o.isTable && !isNaN(numVal)) {
                o.borderWidth = numVal;
                ensureTableCellData(o);
                o.cellData.forEach(cell => { cell.borderWidth = Math.max(0.5, numVal); });
                updateTableLayout(o);
            }
            break;
        case 'Stroke Color': o.set({ stroke: strVal }); break;
        case 'Stroke Width':
            if (!isNaN(numVal)) {
                o.set({ strokeWidth: numVal });
                o.setCoords();
            }
            break;
        case 'Corner Radius': if ('rx' in o && !isNaN(numVal)) o.set({ rx: numVal, ry: numVal }); break;
        case 'Image Fill URL': fabric.Image.fromURL(strVal, img => o.set('fill', new fabric.Pattern({ source: img.getElement() })), { crossOrigin: 'anonymous' }); break;
    }
    canvas.renderAll();
}


onClick('#csvViewBtn', openCsvView);
onClick('#closeCsvView', closeCsvView);
function restoreCanvasStateAfterLoad(callback) {
    pageRect = canvas.getObjects().find(o => o.oid === 'pageRect');
    if (pageRect) {
        pageRect.set({
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            isArtboard: true,
            oid: 'pageRect'
        });
    }
    const pageId = currentCanvasPageId();
    canvas.getObjects().forEach(obj => {
        if (!obj || obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine) return;
        try {
            if (!obj.pageId) obj.pageId = pageId;
            stabilizeObjectAfterLoad(obj);
            if (obj.isTable) {
                ensureTableCellData(obj);
                const canInspectChildren = typeof obj.getObjects === 'function';
                const hasCellGroups = canInspectChildren
                    && obj.getObjects().every(child => child?.isTableCellGroup);
                if (!hasCellGroups) rebuildTableCells(obj);
                else updateTableLayout(obj);
            }
        } catch (error) {
            console.warn('Object restore skipped due to invalid object state:', error, obj);
        }
    });
    if (documentPages[currentPageIndex] && pageRect) {
        documentPages[currentPageIndex].width = parsePositiveInt(Math.round(pageRect.width), DEFAULT_PAGE_WIDTH);
        documentPages[currentPageIndex].height = parsePositiveInt(Math.round(pageRect.height), DEFAULT_PAGE_HEIGHT);
    }
    ensureFontsForCanvasObjects(canvas.getObjects());
    keepPageRectAtBack();
    drawGrid();
    renderLayers();
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: false });
    applyCanvasMaskToActivePageObjects();
    canvas.renderAll();
    // historyLocked will be set to false by the caller (undo/redo)
    if (typeof callback === 'function') {
        callback();
    }
}

function normalizePastedObject(obj, pageId) {
    if (!obj) return;
    const ghostLike = !!obj.isCanvasGhost || !!obj.ghostSourceOid || obj.ghostSourcePageIndex !== undefined;
    if (ghostLike) {
        if (obj.clipPath) obj.clipPath = null;
        if (obj.excludeFromExport) obj.excludeFromExport = false;
        if (obj.isCanvasGhost) obj.isCanvasGhost = false;
        if (obj.isCanvasMask) delete obj.isCanvasMask;
        if (obj.ghostSourceOid) delete obj.ghostSourceOid;
        if (obj.ghostSourcePageIndex !== undefined) delete obj.ghostSourcePageIndex;
    }

    obj.oid = createUid('obj');
    obj.name = getUniqueName(obj.name || obj.type || 'object');
    obj.pageId = pageId;
    obj.evented = true;
    if (!obj.locked) obj.selectable = true;
    applyLockStateToObject(obj);

    // Recursively normalize children if it's a group
    if (typeof obj.forEachObject === 'function') {
        obj.forEachObject(child => normalizePastedObject(child, pageId));
    }
}

function offsetWorkspaceObjects(objects = [], dx = 0, dy = 0) {
    if (!Array.isArray(objects) || !objects.length) return;
    objects.forEach(obj => {
        if (!obj) return;
        obj.set({
            left: normalizeNumeric(obj.left, 0) + dx,
            top: normalizeNumeric(obj.top, 0) + dy
        });
        applyObjectMaskForPage(obj, currentPageIndex);
        obj.setCoords();
    });
}

function collectClipboardSourcePages(target) {
    const pageByOid = new Map();
    const pageIndexes = new Set();
    const objects = target?.type === 'activeSelection' && typeof target.getObjects === 'function'
        ? target.getObjects().filter(Boolean)
        : (target ? [target] : []);

    objects.forEach(obj => {
        if (!obj) return;
        const context = getWorkspaceObjectPageContext(obj);
        const contextIndex = Number.isInteger(context?.pageIndex) ? context.pageIndex : -1;
        const fallbackIndex = resolveObjectSourcePageIndex(obj);
        const pageIndex = contextIndex >= 0 ? contextIndex : fallbackIndex;
        const safeIndex = (pageIndex >= 0 && pageIndex < documentPages.length) ? pageIndex : currentPageIndex;
        pageIndexes.add(safeIndex);
        const oid = String(obj.oid || '').trim();
        if (oid) pageByOid.set(oid, safeIndex);
    });

    return {
        pageByOid,
        pageIndexes: Array.from(pageIndexes),
        hasMultipleSourcePages: pageIndexes.size > 1
    };
}

function copy() {
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return Promise.resolve(false);
    ensureTextboxPathsCloneSafe(activeObject);
    const sourcePageIndex = activeObject.type === 'activeSelection'
        ? resolveSelectionSourcePageIndex(activeObject)
        : resolveObjectSourcePageIndex(activeObject);
    const sourceObjectType = activeObject.type || 'object';
    const sourceMeta = collectClipboardSourcePages(activeObject);

    // Capture data bindings for the clipboard
    const clipboardBindings = new Map();
    const processBindingCapture = (obj) => {
        const oid = (obj.oid || '').trim();
        if (oid && bindings.has(oid)) {
            clipboardBindings.set(oid, deepClone(bindings.get(oid)));
        }
    };

    if (activeObject.type === 'activeSelection') {
        activeObject.getObjects().forEach(processBindingCapture);
    } else {
        processBindingCapture(activeObject);
    }

    return new Promise(resolve => {
        activeObject.clone(cloned => {
            ensureTextboxPathsCloneSafe(cloned);
            _clipboard = cloned;
            _clipboardMeta = {
                sourcePageIndex,
                sourceObjectType,
                pasteCount: 0,
                clipboardBindings,
                sourcePageIndexes: sourceMeta.pageIndexes,
                hasMultipleSourcePages: sourceMeta.hasMultipleSourcePages,
                clipboardPageByOid: sourceMeta.pageByOid
            };
            resolve(true);
        }, SERIALIZE_PROPS);
    });
}

function duplicateSelection() {
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return Promise.resolve(false);
    ensureTextboxPathsCloneSafe(activeObject);
    const sourcePageIndex = currentPageIndex;
    const sourceMeta = collectClipboardSourcePages(activeObject);

    // Keep bound data on duplicated objects, matching copy/paste behavior.
    const clipboardBindings = new Map();
    const processBindingCapture = (obj) => {
        const oid = (obj.oid || '').trim();
        if (oid && bindings.has(oid)) {
            clipboardBindings.set(oid, deepClone(bindings.get(oid)));
        }
    };

    if (activeObject.type === 'activeSelection') {
        activeObject.getObjects().forEach(processBindingCapture);
    } else {
        processBindingCapture(activeObject);
    }

    return new Promise(resolve => {
        activeObject.clone(cloned => {
            ensureTextboxPathsCloneSafe(cloned);
            _clipboard = cloned;
            _clipboardMeta = {
                sourcePageIndex,
                sourceObjectType: cloned?.type || activeObject.type || 'object',
                pasteCount: 0,
                clipboardBindings,
                sourcePageIndexes: sourceMeta.pageIndexes,
                hasMultipleSourcePages: sourceMeta.hasMultipleSourcePages,
                clipboardPageByOid: sourceMeta.pageByOid
            };
            paste();
            resolve(true);
        }, SERIALIZE_PROPS);
    });
}

function removeCanvasObjects(objects = []) {
    const list = Array.from(new Set((objects || []).filter(Boolean)));
    if (!list.length) return false;

    let ghostChanged = false;
    list.forEach(obj => {
        if (obj.isCanvasGhost) {
            if (commitGhostObjectRemoval(obj)) ghostChanged = true;
        }
        // Also remove associated data bindings if it's a permanent removal
        if (!obj.isCanvasGhost && obj.oid) {
            bindings.delete(obj.oid);
        }
    });

    // Handle selection state safely
    const active = canvas.getActiveObject();
    if (active && active.type === 'activeSelection') {
        const members = active.getObjects();
        const remaining = members.filter(m => !list.includes(m));
        if (remaining.length === 0) {
            canvas.discardActiveObject();
        } else if (remaining.length < members.length) {
            // Update selection to exclude removed objects
            canvas.discardActiveObject();
            if (remaining.length === 1) {
                canvas.setActiveObject(remaining[0]);
            } else {
                const sel = new fabric.ActiveSelection(remaining, { canvas });
                canvas.setActiveObject(sel);
            }
        }
    } else if (active && list.includes(active)) {
        canvas.discardActiveObject();
    }

    // Perform actual removal from canvas
    list.forEach(obj => {
        if (obj && typeof canvas.remove === 'function') {
            canvas.remove(obj);
        }
    });

    if (ghostChanged) {
        updateFloatingLinker(null);
        renderCanvasGhostPages();
        renderLayers();
        renderPageInspector();
        refreshCanvasPageControlsDebounced();
        requestSaveState();
        return true;
    }

    canvas.requestRenderAll();
    renderLayers();
    refreshCanvasPageControlsDebounced();
    requestSaveState();
    return false;
}

function cut() {
    copy();
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects.length) return;
    removeCanvasObjects(activeObjects);
}

function paste(options = {}) {
    if (!_clipboard) return;
    ensureTextboxPathsCloneSafe(_clipboard);
    const forceOffset = options.forceOffset === true;
    const targetPageIndex = currentPageIndex;
    const sourcePageIndex = Number.isInteger(_clipboardMeta?.sourcePageIndex)
        ? Math.max(0, Math.min(documentPages.length - 1, _clipboardMeta.sourcePageIndex))
        : targetPageIndex;
    const pasteCount = Math.max(0, parseInt(_clipboardMeta?.pasteCount, 10) || 0);
    const nextPasteCount = pasteCount + 1;

    const sourcePageLeft = getPageLayoutLeft(sourcePageIndex);
    const targetPageLeft = getPageLayoutLeft(targetPageIndex);
    const deltaX = targetPageLeft - sourcePageLeft;
    const deltaY = 0;
    const samePage = sourcePageIndex === targetPageIndex;
    const nudge = (forceOffset || samePage) ? (20 * nextPasteCount) : 0;
    const copiedFromActiveSelection = _clipboardMeta?.sourceObjectType === 'activeSelection';
    const preserveSourcePages = _clipboardMeta?.hasMultipleSourcePages === true;
    const clipboardPageByOid = _clipboardMeta?.clipboardPageByOid instanceof Map
        ? _clipboardMeta.clipboardPageByOid
        : new Map();

    _clipboard.clone((clonedObj) => {
        isPastingFromClipboard = true;
        try {
            ensureTextboxPathsCloneSafe(clonedObj);
            const currentPageId = currentCanvasPageId();
            const pastedObjects = [];
            let updatedOtherPages = false;
            const clipboardBindings = _clipboardMeta?.clipboardBindings || new Map();
            canvas.discardActiveObject();

            const transferDataBindings = (oldOid, newOid) => {
                if (oldOid && clipboardBindings.has(oldOid)) {
                    bindings.set(newOid, deepClone(clipboardBindings.get(oldOid)));
                }
            };

            const shouldPasteAsSelection = (copiedFromActiveSelection || clonedObj.type === 'activeSelection')
                && typeof clonedObj.getObjects === 'function';
            if (shouldPasteAsSelection) {
                const offsetX = nudge;
                const offsetY = deltaY + nudge;
                clonedObj.canvas = canvas;
                clonedObj.set({
                    left: normalizeNumeric(clonedObj.left, 0) + offsetX,
                    top: normalizeNumeric(clonedObj.top, 0) + offsetY,
                    evented: true
                });
                clonedObj.setCoords(); // CRITICAL: Update matrices before calculating member positions

                const selectionMatrix = typeof clonedObj.calcOwnMatrix === 'function'
                    ? clonedObj.calcOwnMatrix()
                    : clonedObj.calcTransformMatrix();

                const members = (typeof clonedObj.getObjects === 'function' ? clonedObj.getObjects() : []).slice();
                members.forEach(obj => {
                    const oldOid = (obj.oid || '').trim();
                    const mappedSourcePageIndex = clipboardPageByOid.has(oldOid)
                        ? clipboardPageByOid.get(oldOid)
                        : -1;
                    const memberSourcePageIndex = (mappedSourcePageIndex >= 0 && mappedSourcePageIndex < documentPages.length)
                        ? mappedSourcePageIndex
                        : resolveObjectSourcePageIndex(obj);
                    const memberSourcePageLeft = getPageLayoutLeft(memberSourcePageIndex);
                    const memberTargetPageIndex = preserveSourcePages ? memberSourcePageIndex : targetPageIndex;
                    const memberTargetPageLeft = getPageLayoutLeft(memberTargetPageIndex);
                    const memberDeltaX = memberTargetPageLeft - memberSourcePageLeft;
                    const memberTargetPageId = documentPages[memberTargetPageIndex]?.id || currentPageId;

                    // Bake the selection matrix into each member so absolute placement survives ungrouping.
                    if (selectionMatrix && fabric?.util?.addTransformToObject) {
                        fabric.util.addTransformToObject(obj, selectionMatrix);
                        obj.set({
                            left: normalizeNumeric(obj.left, 0) + memberDeltaX,
                            top: normalizeNumeric(obj.top, 0) + deltaY
                        });
                    } else {
                        const matrix = obj.calcTransformMatrix();
                        const decomposed = fabric.util.qrDecompose(matrix);
                        obj.set({
                            left: normalizeNumeric(decomposed.translateX, normalizeNumeric(obj.left, 0)) + memberDeltaX,
                            top: normalizeNumeric(decomposed.translateY, normalizeNumeric(obj.top, 0)) + deltaY,
                            scaleX: normalizeNumeric(decomposed.scaleX, normalizeNumeric(obj.scaleX, 1)),
                            scaleY: normalizeNumeric(decomposed.scaleY, normalizeNumeric(obj.scaleY, 1)),
                            angle: normalizeNumeric(decomposed.angle, normalizeNumeric(obj.angle, 0)),
                            skewX: normalizeNumeric(decomposed.skewX, normalizeNumeric(obj.skewX, 0)),
                            skewY: normalizeNumeric(decomposed.skewY, normalizeNumeric(obj.skewY, 0))
                        });
                    }
                    obj.group = null; // Detach from the temporary cloned selection

                    normalizePastedObject(obj, memberTargetPageId);
                    obj.setCoords();
                    const newOid = obj.oid;
                    if (memberTargetPageIndex === currentPageIndex) {
                        applyObjectMaskForPage(obj, currentPageIndex);
                        canvas.add(obj);
                        pastedObjects.push(obj);
                    } else {
                        const objectState = serializeWorkspaceObjectForPageState(obj, memberTargetPageIndex, newOid);
                        if (objectState) {
                            upsertObjectInPageState(memberTargetPageIndex, newOid, objectState);
                            updatedOtherPages = true;
                        }
                    }

                    // Re-bind data if applicable
                    transferDataBindings(oldOid, newOid);
                });

                if (pastedObjects.length > 0) {
                    const newSelection = new fabric.ActiveSelection(pastedObjects, {
                        canvas: canvas
                    });
                    newSelection.setCoords();
                    canvas.setActiveObject(newSelection);
                }
            } else {
                const oldOid = (clonedObj.oid || '').trim();
                normalizePastedObject(clonedObj, currentPageId);
                const newOid = clonedObj.oid;
                canvas.add(clonedObj);
                pastedObjects.push(clonedObj);

                // Re-bind data if applicable
                transferDataBindings(oldOid, newOid);
            }

            if (!pastedObjects.length && !updatedOtherPages) return;

            if (!shouldPasteAsSelection && pastedObjects.length) {
                offsetWorkspaceObjects(pastedObjects, deltaX + nudge, deltaY + nudge);
                canvas.setActiveObject(pastedObjects[0]);
            }

            _clipboardMeta = {
                ...(_clipboardMeta || {}),
                sourcePageIndex,
                pasteCount: nextPasteCount,
                clipboardBindings // Retain bindings for subsequent pastes
            };

            canvas.requestRenderAll();
            if (updatedOtherPages) renderCanvasGhostPages();
            renderLayers();
            refreshCanvasPageControlsDebounced();
            requestSaveState();
        } finally {
            isPastingFromClipboard = false;
            scheduleOutsideObjectsCleanup();
        }
    }, SERIALIZE_PROPS);
}
function renderLayers(e) {
    const list = $('#layersList'); if (!list) return; list.innerHTML = '';
    const activeObjects = canvas.getActiveObjects();
    const objects = canvas.getObjects().filter(o => o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine && !o.isArtboard);
    if (objects.length === 0) { list.innerHTML = '<p class="muted" style="text-align: center; padding: 24px 0; font-size: 13px;">Add an object to the canvas.</p>'; return; }
    objects.slice().reverse().forEach(obj => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.dataset.locked = !!obj.locked;
        if (activeObjects.includes(obj)) item.classList.add('active');

        item.onclick = (e) => {
            if (obj.locked) return;
            // 7. Layer multi-select
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                if (canvas.getActiveObjects().includes(obj)) {
                    canvas.getActiveObject().removeWithUpdate(obj);
                } else {
                    canvas.getActiveObject().addWithUpdate(obj);
                }
            } else {
                canvas.setActiveObject(obj);
            }
            canvas.renderAll();
        };

        // DRAG AND DROP HANDLERS
        item.draggable = true;
        item.ondragstart = (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', obj.oid);
        };
        item.ondragend = () => {
            item.classList.remove('dragging');
            document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('drag-over'));
        };
        item.ondragover = (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        };
        item.ondragleave = () => {
            item.classList.remove('drag-over');
        };
        item.ondrop = (e) => {
            e.preventDefault();
            const draggedOid = e.dataTransfer.getData('text/plain');
            const draggedObj = canvas.getObjects().find(o => o.oid === draggedOid);
            if (draggedObj && draggedObj !== obj) {
                // Move draggedObj to be above obj
                canvas.remove(draggedObj);
                const objects = canvas.getObjects();
                const targetIndex = objects.indexOf(obj);
                canvas.insertAt(draggedObj, targetIndex + 1);

                // Re-ensure pageRect is at bottom
                keepPageRectAtBack();
                renderLayers();
                requestSaveState();
            }
        };

        // Capitalize layer name (first letter uppercase)
        const rawName = obj.name || obj.type;
        const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        const nameSpan = document.createElement('span'); nameSpan.className = 'layer-name'; nameSpan.textContent = displayName;
        nameSpan.ondblclick = () => { /* ... rename logic ... */ };

        item.innerHTML = `
            <div class="layer-actions">
                <button title="Lock/Unlock" class="btn ghost btn-lock"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${obj.locked ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'}</svg></button>
                <button title="Bring Forward" class="btn ghost btn-fwd"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg></button>
                <button title="Send Backward" class="btn ghost btn-bwd"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
                <button title="Bring to Front" class="btn ghost btn-front"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5l6 6m-6-6l-6 6M12 19V5M5 19h14"/></svg></button>
                <button title="Send to Back" class="btn ghost btn-back"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19l-6-6m6 6l6-6M12 5v14M5 5h14"/></svg></button>
            </div>`;
        item.prepend(nameSpan);

        item.querySelector('.btn-lock').onclick = (e) => { e.stopPropagation(); toggleLock(obj); };
        item.querySelector('.btn-front').onclick = (e) => { e.stopPropagation(); canvas.bringToFront(obj); renderLayers(); requestSaveState(); };
        item.querySelector('.btn-back').onclick = (e) => { e.stopPropagation(); canvas.sendToBack(obj); keepPageRectAtBack(); renderLayers(); requestSaveState(); };
        item.querySelector('.btn-fwd').onclick = (e) => { e.stopPropagation(); canvas.bringForward(obj); renderLayers(); requestSaveState(); };
        item.querySelector('.btn-bwd').onclick = (e) => { e.stopPropagation(); canvas.sendBackwards(obj); renderLayers(); requestSaveState(); };
        list.appendChild(item);
    });
}
function toggleLock(obj) {
    obj.locked = !obj.locked;
    applyLockStateToObject(obj);
    if (obj.locked) canvas.discardActiveObject();
    obj.setCoords();
    canvas.renderAll();
    renderLayers();
    requestSaveState();
}
function centerAndFitPage() {
    if (!pageRect) return;
    const { width: wrapperW, height: wrapperH } = canvasWrapper.getBoundingClientRect();
    const pageW = pageRect.width;
    const pageH = pageRect.height;
    const zoom = Math.min(wrapperW / pageW, wrapperH / pageH) * 0.95;
    canvas.setZoom(zoom);
    const center = pageRect.getCenterPoint();
    const vpt = [zoom, 0, 0, zoom, (wrapperW / 2) - center.x * zoom, (wrapperH / 2) - center.y * zoom];
    clampViewportTransform(vpt);
    canvas.setViewportTransform(vpt);
    updateZoomLabel();
    canvas.renderAll();
}
onClick('#centerViewBtn', centerAndFitPage);
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const activeObj = canvas.getActiveObject();

    if (isCtrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
    }

    if (isCtrl && key === 'y') {
        e.preventDefault();
        redo();
    }

    if (isCtrl && key === 'c') {
        e.preventDefault();
        copy();
    }

    if (isCtrl && key === 'x') {
        e.preventDefault();
        cut();
    }

    if (isCtrl && key === 'v') {
        e.preventDefault();
        paste();
    }

    if (isCtrl && key === 'd') {
        e.preventDefault();
        duplicateSelection();
    }

    if (isCtrl && key === 'a') {
        e.preventDefault();
        const allObjects = canvas.getObjects().filter(o => o.selectable);
        canvas.setActiveObject(new fabric.ActiveSelection(allObjects, { canvas }));
        canvas.renderAll();
    }

    if (isCtrl && key === 'g') {
        e.preventDefault();
        if (activeObj && activeObj.type === 'activeSelection') activeObj.toGroup();
    }

    if (isCtrl && e.shiftKey && key === 'g') {
        e.preventDefault();
        if (activeObj && activeObj.type === 'group') activeObj.toActiveSelection();
    }

    if (e.key.startsWith('Arrow') && activeObj) {
        e.preventDefault();
        scheduleOutsideObjectsCleanup.clear();
        const amount = e.shiftKey ? 10 : 1;
        switch (e.key) {
            case 'ArrowUp': activeObj.top -= amount; break;
            case 'ArrowDown': activeObj.top += amount; break;
            case 'ArrowLeft': activeObj.left -= amount; break;
            case 'ArrowRight': activeObj.left += amount; break;
        }
        activeObj.setCoords();
        canvas.renderAll();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length) {
            removeCanvasObjects(activeObjects);
        }
    }
});

window.addEventListener('keyup', e => {
    if (!e.key.startsWith('Arrow')) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    scheduleOutsideObjectsCleanup();
    requestSaveState();
});

