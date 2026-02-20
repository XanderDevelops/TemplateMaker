// --- COMPONENT ADDITION ---
function getUniqueName(baseName) {
    const existingNames = canvas.getObjects().map(o => o.name).filter(Boolean);
    if (!existingNames.includes(baseName)) { return baseName; }
    let i = 1;
    while (existingNames.includes(`${baseName} ${i}`)) { i++; }
    return `${baseName} ${i}`;
}

function currentCanvasPageId() {
    return documentPages[currentPageIndex]?.id || 'page_1';
}

function pageIndexForPageId(pageId) {
    if (!pageId) return -1;
    return documentPages.findIndex(page => page?.id === pageId);
}

function resolveObjectSourcePageIndex(obj) {
    if (!obj) return currentPageIndex;
    const idx = pageIndexForPageId(obj.pageId);
    return idx >= 0 ? idx : currentPageIndex;
}

function resolveSelectionSourcePageIndex(selection) {
    if (!selection || selection.type !== 'activeSelection' || typeof selection.getObjects !== 'function') {
        return resolveObjectSourcePageIndex(selection);
    }

    const counts = new Map();
    selection.getObjects().forEach(member => {
        if (!member) return;
        const context = getWorkspaceObjectPageContext(member);
        const idxFromContext = Number.isInteger(context?.pageIndex) ? context.pageIndex : -1;
        const fallbackIdx = resolveObjectSourcePageIndex(member);
        const idx = idxFromContext >= 0 ? idxFromContext : fallbackIdx;
        const safeIdx = (idx >= 0 && idx < documentPages.length) ? idx : currentPageIndex;
        counts.set(safeIdx, (counts.get(safeIdx) || 0) + 1);
    });

    if (!counts.size) return currentPageIndex;

    let bestIndex = currentPageIndex;
    let bestCount = -1;
    counts.forEach((count, index) => {
        if (count > bestCount) {
            bestCount = count;
            bestIndex = index;
        }
    });
    return bestIndex;
}

const TABLE_TEXT_PADDING = 6;

function getDefaultTableCellData(table, row, col) {
    const isHeader = row < (table.headerRows || 0);
    return {
        row,
        col,
        text: '',
        fill: isHeader ? (table.headerFill || '#f3f4f6') : (table.bodyFill || '#ffffff'),
        textColor: '#111111',
        fontSize: 14,
        textAlign: 'left',
        textVAlign: 'top',
        borderColor: table.borderColor || '#333333',
        borderWidth: Math.max(0.5, parseFloat(table.borderWidth) || 1),
        borders: { top: true, right: true, bottom: true, left: true }
    };
}

function normalizeTableCellData(raw, table, row, col) {
    const base = getDefaultTableCellData(table, row, col);
    const merged = { ...base, ...(raw || {}) };
    merged.row = row;
    merged.col = col;
    merged.text = typeof merged.text === 'string' ? merged.text : '';
    merged.fill = merged.fill ?? base.fill;
    merged.textColor = merged.textColor || base.textColor;
    merged.fontSize = Math.max(6, parseFloat(merged.fontSize) || base.fontSize);
    merged.textAlign = ['left', 'center', 'right', 'justify'].includes(merged.textAlign) ? merged.textAlign : base.textAlign;
    merged.textVAlign = ['top', 'middle', 'bottom'].includes(merged.textVAlign) ? merged.textVAlign : base.textVAlign;
    merged.borderColor = merged.borderColor || table.borderColor || base.borderColor;
    merged.borderWidth = Math.max(0.5, parseFloat(merged.borderWidth) || table.borderWidth || base.borderWidth);
    const borders = merged.borders || {};
    merged.borders = {
        top: borders.top !== false,
        right: borders.right !== false,
        bottom: borders.bottom !== false,
        left: borders.left !== false
    };
    return merged;
}

function ensureTableCellData(table) {
    if (!table || !table.isTable) return;
    const rows = Math.max(1, parseInt(table.rows, 10) || 1);
    const cols = Math.max(1, parseInt(table.cols, 10) || 1);
    table.rows = rows;
    table.cols = cols;
    table.headerRows = Math.max(0, Math.min(rows, parseInt(table.headerRows, 10) || 0));
    table.borderColor = table.borderColor || '#333333';
    table.borderWidth = Math.max(0.5, parseFloat(table.borderWidth) || 1);
    table.headerFill = table.headerFill || '#f3f4f6';
    table.bodyFill = table.bodyFill || '#ffffff';

    const baseW = Math.max(25, parseFloat(table.colWidths?.[0]) || 120);
    const baseH = Math.max(25, parseFloat(table.rowHeights?.[0]) || 50);
    table.colWidths = Array.from({ length: cols }, (_, i) => Math.max(25, parseFloat(table.colWidths?.[i]) || baseW));
    table.rowHeights = Array.from({ length: rows }, (_, i) => Math.max(25, parseFloat(table.rowHeights?.[i]) || baseH));

    const old = Array.isArray(table.cellData) ? table.cellData : [];
    const next = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            next.push(normalizeTableCellData(old[idx], table, r, c));
        }
    }
    table.cellData = next;
    if (!(table._selectedCells instanceof Set)) {
        table._selectedCells = new Set(Array.isArray(table.selectedCells) ? table.selectedCells : []);
    }
}

function resizeTableCellData(table, nextRows, nextCols) {
    ensureTableCellData(table);
    const prevRows = table.rows;
    const prevCols = table.cols;
    const previous = table.cellData.slice();
    const resized = [];

    for (let r = 0; r < nextRows; r++) {
        for (let c = 0; c < nextCols; c++) {
            if (r < prevRows && c < prevCols) {
                const oldIdx = r * prevCols + c;
                resized.push(normalizeTableCellData(previous[oldIdx], table, r, c));
            } else {
                resized.push(getDefaultTableCellData(table, r, c));
            }
        }
    }

    table.rows = nextRows;
    table.cols = nextCols;
    table.cellData = resized;
    table.headerRows = Math.max(0, Math.min(table.rows, table.headerRows || 0));
}

function getTableCellGroupParts(cellGroup) {
    const objs = cellGroup.getObjects();
    return {
        fillRect: objs[0],
        textObj: objs[1],
        topLine: objs[2],
        rightLine: objs[3],
        bottomLine: objs[4],
        leftLine: objs[5],
        selectionRect: objs[6]
    };
}

function createTableCellGroup({ width, height, cellData, cellIndex, row, col }) {
    const fillRect = new fabric.Rect({
        left: -width / 2,
        top: -height / 2,
        originX: 'left',
        originY: 'top',
        width,
        height,
        fill: cellData.fill,
        stroke: null,
        selectable: false,
        evented: false
    });

    const textObj = new fabric.Textbox(cellData.text || '', {
        left: -width / 2 + TABLE_TEXT_PADDING,
        top: -height / 2 + TABLE_TEXT_PADDING,
        originX: 'left',
        originY: 'top',
        width: Math.max(8, width - TABLE_TEXT_PADDING * 2),
        fontSize: cellData.fontSize || 14,
        fill: cellData.textColor || '#111111',
        textAlign: cellData.textAlign || 'left',
        lineHeight: 1.2,
        selectable: false,
        evented: false,
        editable: false
    });

    const makeBorderRect = (visible = true) => new fabric.Rect({
        left: -width / 2,
        top: -height / 2,
        originX: 'left',
        originY: 'top',
        width: 1,
        height: 1,
        fill: cellData.borderColor || '#333333',
        selectable: false,
        evented: false,
        visible
    });

    const topLine = makeBorderRect(cellData.borders?.top !== false);
    const rightLine = makeBorderRect(cellData.borders?.right !== false);
    const bottomLine = makeBorderRect(cellData.borders?.bottom !== false);
    const leftLine = makeBorderRect(cellData.borders?.left !== false);

    const selectionRect = new fabric.Rect({
        left: -width / 2,
        top: -height / 2,
        originX: 'left',
        originY: 'top',
        width,
        height,
        fill: 'rgba(59,130,246,0.12)',
        stroke: '#3b82f6',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        visible: false
    });

    return new fabric.Group([fillRect, textObj, topLine, rightLine, bottomLine, leftLine, selectionRect], {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        isTableCellGroup: true,
        cellIndex,
        row,
        col
    });
}

function updateTableCellGroupVisual(cellGroup, width, height, cellData, selected = false) {
    const { fillRect, textObj, topLine, rightLine, bottomLine, leftLine, selectionRect } = getTableCellGroupParts(cellGroup);
    const clampedWidth = Math.max(1, width);
    const clampedHeight = Math.max(1, height);
    const localLeft = -clampedWidth / 2;
    const localTop = -clampedHeight / 2;

    fillRect.set({
        left: localLeft,
        top: localTop,
        width: clampedWidth,
        height: clampedHeight,
        fill: cellData.fill
    });

    textObj.set({
        left: localLeft + TABLE_TEXT_PADDING,
        top: localTop + TABLE_TEXT_PADDING,
        width: Math.max(8, clampedWidth - TABLE_TEXT_PADDING * 2),
        text: cellData.text || '',
        fill: cellData.textColor || '#111111',
        fontSize: Math.max(6, cellData.fontSize || 14),
        textAlign: cellData.textAlign || 'left'
    });
    textObj.initDimensions();
    const availableTextHeight = Math.max(0, clampedHeight - TABLE_TEXT_PADDING * 2);
    const measuredTextHeight = Math.min(availableTextHeight, textObj.height || 0);
    let textTop = localTop + TABLE_TEXT_PADDING;
    if (cellData.textVAlign === 'middle') {
        textTop = localTop + TABLE_TEXT_PADDING + Math.max(0, (availableTextHeight - measuredTextHeight) / 2);
    } else if (cellData.textVAlign === 'bottom') {
        textTop = localTop + clampedHeight - TABLE_TEXT_PADDING - measuredTextHeight;
    }
    textObj.set({ top: textTop });

    const borderColor = cellData.borderColor || '#333333';
    const borderWidth = Math.max(0.5, cellData.borderWidth || 1);
    const clampedBorder = Math.min(Math.max(0.5, borderWidth), Math.min(clampedWidth, clampedHeight));
    topLine.set({ left: localLeft, top: localTop, width: clampedWidth, height: clampedBorder, fill: borderColor, visible: cellData.borders?.top !== false });
    rightLine.set({ left: localLeft + clampedWidth - clampedBorder, top: localTop, width: clampedBorder, height: clampedHeight, fill: borderColor, visible: cellData.borders?.right !== false });
    bottomLine.set({ left: localLeft, top: localTop + clampedHeight - clampedBorder, width: clampedWidth, height: clampedBorder, fill: borderColor, visible: cellData.borders?.bottom !== false });
    leftLine.set({ left: localLeft, top: localTop, width: clampedBorder, height: clampedHeight, fill: borderColor, visible: cellData.borders?.left !== false });

    selectionRect.set({
        left: localLeft,
        top: localTop,
        width: clampedWidth,
        height: clampedHeight,
        visible: !!selected
    });

    cellGroup.set({ width, height, dirty: true });
    cellGroup.setCoords();
}

function refreshTableSelectionVisual(table) {
    if (!table?.isTable) return;
    const selected = table._selectedCells instanceof Set ? table._selectedCells : new Set();
    const cells = table.getObjects().filter(obj => obj.isTableCellGroup);
    cells.forEach((cellGroup, index) => {
        const parts = getTableCellGroupParts(cellGroup);
        if (parts.selectionRect) parts.selectionRect.set({ visible: selected.has(index) });
    });
    table.selectedCells = Array.from(selected);
}

function clearTableCellSelections(exceptTable = null) {
    canvas.getObjects().forEach(obj => {
        if (!obj?.isTable || obj === exceptTable) return;
        obj._selectedCells = new Set();
        refreshTableSelectionVisual(obj);
    });
    canvas.requestRenderAll();
}

function getTableCellFromPointer(table, pointer) {
    if (!table || !pointer) return null;
    const local = table.toLocalPoint(new fabric.Point(pointer.x, pointer.y), 'center', 'center');
    let currentY = -table.height / 2;

    for (let r = 0; r < table.rows; r++) {
        const h = table.rowHeights[r];
        let currentX = -table.width / 2;
        for (let c = 0; c < table.cols; c++) {
            const w = table.colWidths[c];
            if (local.x >= currentX && local.x <= currentX + w && local.y >= currentY && local.y <= currentY + h) {
                return { row: r, col: c, index: r * table.cols + c };
            }
            currentX += w;
        }
        currentY += h;
    }
    return null;
}

function getTableCellLocalRect(table, cellIndex) {
    if (!table?.isTable) return null;
    const maxIndex = table.rows * table.cols - 1;
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > maxIndex) return null;
    const row = Math.floor(cellIndex / table.cols);
    const col = cellIndex % table.cols;
    const totalWidth = table.colWidths.reduce((sum, w) => sum + w, 0);
    const totalHeight = table.rowHeights.reduce((sum, h) => sum + h, 0);
    let left = -totalWidth / 2;
    let top = -totalHeight / 2;
    for (let c = 0; c < col; c++) left += table.colWidths[c];
    for (let r = 0; r < row; r++) top += table.rowHeights[r];
    return {
        left,
        top,
        width: table.colWidths[col],
        height: table.rowHeights[row],
        row,
        col
    };
}

function getTableCellEditorRect(table, cellIndex) {
    const localRect = getTableCellLocalRect(table, cellIndex);
    if (!localRect) return null;
    const tableMatrix = table.calcTransformMatrix();
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const finalMatrix = fabric.util.multiplyTransformMatrices(vpt, tableMatrix);
    const corners = [
        new fabric.Point(localRect.left, localRect.top),
        new fabric.Point(localRect.left + localRect.width, localRect.top),
        new fabric.Point(localRect.left + localRect.width, localRect.top + localRect.height),
        new fabric.Point(localRect.left, localRect.top + localRect.height)
    ].map(p => fabric.util.transformPoint(p, finalMatrix));
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();
    return {
        left: canvasRect.left + minX,
        top: canvasRect.top + minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function closeTableCellEditor({ commit = true } = {}) {
    if (!activeTableCellEditor) return;
    activeTableCellEditor.close(commit);
}

function startTableCellEditor(table, cellIndex) {
    if (!table?.isTable) return;
    ensureTableCellData(table);
    const cell = table.cellData[cellIndex];
    if (!cell) return;

    closeTableCellEditor({ commit: true });

    const rect = getTableCellEditorRect(table, cellIndex);
    if (!rect || rect.width < 4 || rect.height < 4) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'table-cell-editor';
    input.value = cell.text || '';
    input.style.left = `${Math.round(rect.left + 1)}px`;
    input.style.top = `${Math.round(rect.top + 1)}px`;
    input.style.width = `${Math.max(28, Math.round(rect.width - 2))}px`;
    input.style.height = `${Math.max(22, Math.round(rect.height - 2))}px`;
    input.style.fontSize = `${Math.max(10, Math.round(cell.fontSize || 14))}px`;
    input.style.textAlign = cell.textAlign || 'left';
    input.style.fontFamily = 'inherit';

    document.body.appendChild(input);

    let closed = false;
    const previousValue = cell.text || '';
    const closeEditor = (shouldCommit) => {
        if (closed) return;
        closed = true;
        const nextValue = input.value;
        if (shouldCommit && table.isTable && previousValue !== nextValue) {
            ensureTableCellData(table);
            if (table.cellData[cellIndex]) {
                table.cellData[cellIndex].text = nextValue;
                updateTableLayout(table);
                canvas.requestRenderAll();
                requestSaveState();
            }
        }
        input.remove();
        if (activeTableCellEditor && activeTableCellEditor.input === input) {
            activeTableCellEditor = null;
        }
        if (canvas.getActiveObject() === table) refreshInspector({ target: table });
    };

    activeTableCellEditor = { table, cellIndex, input, close: closeEditor };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            closeEditor(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeEditor(false);
        }
    });
    input.addEventListener('blur', () => closeEditor(true));

    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

function getSelectedTableCellIndices(table, { fallbackAll = false } = {}) {
    ensureTableCellData(table);
    if (!(table._selectedCells instanceof Set)) table._selectedCells = new Set();
    const selected = Array.from(table._selectedCells).filter(i => Number.isInteger(i) && i >= 0 && i < table.rows * table.cols);
    if (selected.length || !fallbackAll) return selected;
    return Array.from({ length: table.rows * table.cols }, (_, i) => i);
}

function getTableCellRowCol(table, cellIndex) {
    ensureTableCellData(table);
    const max = Math.max(0, table.rows * table.cols - 1);
    const idx = Math.max(0, Math.min(max, parseInt(cellIndex, 10) || 0));
    return {
        index: idx,
        row: Math.floor(idx / table.cols),
        col: idx % table.cols
    };
}

function tableCellRefLabel(table, cellIndex) {
    const rc = getTableCellRowCol(table, cellIndex);
    return `R${rc.row + 1} C${rc.col + 1}`;
}

function getSingleSelectedTableCellIndex(table) {
    const selected = getSelectedTableCellIndices(table, { fallbackAll: false });
    return selected.length === 1 ? selected[0] : -1;
}

function setSelectedTableCells(table, indices, { append = false, toggle = false } = {}) {
    if (!table?.isTable) return;
    ensureTableCellData(table);
    const maxIdx = table.rows * table.cols - 1;
    let next = append || toggle ? new Set(table._selectedCells || []) : new Set();
    indices.forEach(idx => {
        if (!Number.isInteger(idx) || idx < 0 || idx > maxIdx) return;
        if (toggle) {
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
        } else {
            next.add(idx);
        }
    });
    table._selectedCells = next;
    refreshTableSelectionVisual(table);
    canvas.requestRenderAll();
}

function getCommonSelectedTableCellValue(table, key, { fallbackAll = false } = {}) {
    const indices = getSelectedTableCellIndices(table, { fallbackAll });
    if (!indices.length) return '';
    const values = indices.map(i => {
        const cell = table.cellData[i];
        if (!cell) return undefined;
        if (key.includes('.')) {
            const [k1, k2] = key.split('.');
            return cell[k1]?.[k2];
        }
        return cell[key];
    });
    const first = values[0];
    return values.every(v => v === first) ? first : '';
}

function applyToSelectedTableCells(table, updater, { fallbackAll = true } = {}) {
    if (!table?.isTable) return;
    ensureTableCellData(table);
    const indices = getSelectedTableCellIndices(table, { fallbackAll });
    if (!indices.length) return;
    indices.forEach(idx => updater(table.cellData[idx], idx));
    updateTableLayout(table);
    canvas.requestRenderAll();
    requestSaveState();
}

function toggleSelectedTableBorderSide(table, side) {
    if (!['top', 'right', 'bottom', 'left'].includes(side)) return;
    ensureTableCellData(table);
    const indices = getSelectedTableCellIndices(table, { fallbackAll: true });
    if (!indices.length) return;
    const allOn = indices.every(idx => table.cellData[idx]?.borders?.[side] !== false);
    indices.forEach(idx => {
        const cell = table.cellData[idx];
        cell.borders = cell.borders || { top: true, right: true, bottom: true, left: true };
        cell.borders[side] = !allOn;
    });
    updateTableLayout(table);
    canvas.requestRenderAll();
    requestSaveState();
}

function rebuildTableCells(table) {
    if (!table || !table.isTable) return;
    ensureTableCellData(table);
    const existingSelection = new Set(getSelectedTableCellIndices(table));
    const center = table.getCenterPoint();
    table.getObjects().slice().forEach(cell => table.remove(cell));

    for (let r = 0; r < table.rows; r++) {
        for (let c = 0; c < table.cols; c++) {
            const index = r * table.cols + c;
            const cellGroup = createTableCellGroup({
                width: table.colWidths[c],
                height: table.rowHeights[r],
                cellData: table.cellData[index],
                cellIndex: index,
                row: r,
                col: c
            });
            table.add(cellGroup);
        }
    }

    table._selectedCells = existingSelection;
    table.originalColWidths = [...table.colWidths];
    table.originalRowHeights = [...table.rowHeights];
    updateTableLayout(table, center);
}

function createTableObject({
    x,
    y,
    rows,
    cols,
    cellWidth,
    cellHeight,
    headerRows = 1,
    headerFill = '#f3f4f6',
    bodyFill = '#ffffff',
    borderColor = '#333333',
    borderWidth = 1
}) {
    const colWidths = Array(Math.max(1, cols)).fill(Math.max(25, cellWidth));
    const rowHeights = Array(Math.max(1, rows)).fill(Math.max(25, cellHeight));

    const table = new fabric.Group([], {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        isTable: true,
        rows: Math.max(1, rows),
        cols: Math.max(1, cols),
        colWidths,
        rowHeights,
        originalColWidths: [...colWidths],
        originalRowHeights: [...rowHeights],
        headerRows: Math.max(0, Math.min(rows, headerRows)),
        headerFill,
        bodyFill,
        borderColor,
        borderWidth,
        cellData: [],
        hasControls: true,
        hasBorders: true,
        cornerColor: '#4285F4',
        cornerStyle: 'circle',
        transparentCorners: false,
        borderScaleFactor: 1,
        objectCaching: false,
        lockScalingFlip: true,
        name: getUniqueName('table'),
        pageId: currentCanvasPageId()
    });

    table._selectedCells = new Set();
    table.selectedCells = [];
    rebuildTableCells(table);
    return table;
}

function addTableRow(table) {
    const nextRows = Math.max(1, table.rows + 1);
    const nextCols = Math.max(1, table.cols);
    resizeTableCellData(table, nextRows, nextCols);
    table.rowHeights.push(table.rowHeights[table.rowHeights.length - 1] || 50);
    table.headerRows = Math.min(table.headerRows || 0, nextRows);
    rebuildTableCells(table);
    canvas.requestRenderAll();
    requestSaveState();
}

function removeTableRow(table) {
    if (table.rows <= 1) return;
    const nextRows = table.rows - 1;
    const nextCols = table.cols;
    resizeTableCellData(table, nextRows, nextCols);
    table.rowHeights.pop();
    table.headerRows = Math.min(table.headerRows || 0, nextRows);
    rebuildTableCells(table);
    canvas.requestRenderAll();
    requestSaveState();
}

function addTableColumn(table) {
    const nextRows = table.rows;
    const nextCols = table.cols + 1;
    resizeTableCellData(table, nextRows, nextCols);
    table.colWidths.push(table.colWidths[table.colWidths.length - 1] || 120);
    rebuildTableCells(table);
    canvas.requestRenderAll();
    requestSaveState();
}

function removeTableColumn(table) {
    if (table.cols <= 1) return;
    const nextRows = table.rows;
    const nextCols = table.cols - 1;
    resizeTableCellData(table, nextRows, nextCols);
    table.colWidths.pop();
    rebuildTableCells(table);
    canvas.requestRenderAll();
    requestSaveState();
}

const DEFAULT_SHAPE_FILL = '#dbe7f3';

const adders = {
    text: (x, y, content = 'Sample Text') => canvas.add(new fabric.Textbox(content, { left: x, top: y, fontSize: 28, fill: '#000000', fontFamily: 'Arial', originX: 'center', originY: 'center', styles: [], padding: 0, curveAmount: 0, name: getUniqueName('text'), lockUniScaling: true, pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()),
    rect: ({ x, y, asSquare = true } = {}) => canvas.add(new fabric.Rect({ left: x, top: y, width: asSquare ? 150 : 220, height: 150, fill: DEFAULT_SHAPE_FILL, stroke: null, strokeWidth: 0, strokeUniform: true, originX: 'center', originY: 'center', name: getUniqueName(asSquare ? 'square' : 'rectangle'), pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()),
    circle: (x, y) => canvas.add(new fabric.Circle({ left: x, top: y, radius: 75, fill: DEFAULT_SHAPE_FILL, stroke: null, strokeWidth: 0, strokeUniform: true, originX: 'center', originY: 'center', name: getUniqueName('circle'), pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()),
    triangle: (x, y) => canvas.add(new fabric.Triangle({ left: x, top: y, width: 150, height: 130, fill: DEFAULT_SHAPE_FILL, stroke: null, strokeWidth: 0, strokeUniform: true, originX: 'center', originY: 'center', name: getUniqueName('triangle'), pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()),
    line: (x, y) => {
        const spawnPoint = (Number.isFinite(x) && Number.isFinite(y))
            ? { x, y }
            : getDefaultSpawnPoint();
        const startPoint = new fabric.Point(spawnPoint.x - 75, spawnPoint.y);
        const endPoint = new fabric.Point(spawnPoint.x + 75, spawnPoint.y);

        const line = new fabric.Line([startPoint.x, startPoint.y, endPoint.x, endPoint.y], {
            stroke: DEFAULT_SHAPE_FILL,
            strokeWidth: 4,
            strokeUniform: true,
            originX: 'center',
            originY: 'center',
            padding: 0,
            name: getUniqueName('line'),
            pageId: currentCanvasPageId()
        });

        normalizeLineFromCanvasEndpoints(line, startPoint, endPoint);
        canvas.add(line).setActiveObject(line);
        canvas.renderAll();
    },
    star: (x, y) => { const pts = (n, oR, iR) => { const p = []; let a = -Math.PI / 2; const s = (Math.PI * 2) / n; for (let i = 0; i < n; i++) { p.push({ x: oR * Math.cos(a), y: oR * Math.sin(a) }); a += s / 2; p.push({ x: iR * Math.cos(a), y: iR * Math.sin(a) }); a += s / 2; } return p; }; canvas.add(new fabric.Polygon(pts(5, 75, 35), { left: x, top: y, fill: DEFAULT_SHAPE_FILL, stroke: null, strokeWidth: 0, strokeUniform: true, originX: 'center', originY: 'center', name: getUniqueName('star'), pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()); },
    square: (x, y) => adders.rect({ x, y, asSquare: true }),
    arrow: (x, y) => canvas.add(new fabric.Path('M 0 20 L 60 20 L 60 0 L 100 30 L 60 60 L 60 40 L 0 40 Z', { left: x, top: y, fill: DEFAULT_SHAPE_FILL, stroke: null, strokeWidth: 0, strokeUniform: true, originX: 'center', originY: 'center', name: getUniqueName('arrow'), pageId: currentCanvasPageId() })).setActiveObject(canvas.getObjects().pop()),
    image: (x, y, url, elementData = {}) => { fabric.Image.fromURL(url, (img) => { img.set({ left: x, top: y, scaleX: 0.5, scaleY: 0.5, originX: 'center', originY: 'center', name: getUniqueName('image'), pageId: currentCanvasPageId(), ...elementData }); canvas.add(img).setActiveObject(img); }, { crossOrigin: 'anonymous' }); },
    svg: (x, y, url, elementData = {}) => {
        fabric.loadSVGFromURL(url, (objects, options) => {
            if (!objects || objects.length === 0) return;
            objects.forEach(obj => {
                obj.objectCaching = false;
            });
            const group = new fabric.Group(objects, {
                ...options, ...elementData,
                left: x, top: y, originX: 'center', originY: 'center',
                isSvgGroup: true, name: getUniqueName('svg'), pageId: currentCanvasPageId(), objectCaching: false
            });
            group.scaleToWidth(150);
            group.setCoords();
            canvas.add(group).setActiveObject(canvas.getObjects().pop());
            canvas.renderAll();
        }, null, { crossOrigin: 'anonymous' });
    },
    // 6. Restored Table Code
    table: (x, y) => {
        tableCreatorModal.style.display = 'flex';

        const createHandler = () => {
            const rows = parsePositiveInt($('#tableRows').value, 3);
            const cols = parsePositiveInt($('#tableCols').value, 3);
            const cellWidth = parsePositiveInt($('#tableCellWidth').value, 120);
            const cellHeight = parsePositiveInt($('#tableCellHeight').value, 50);
            const headerRows = Math.max(0, Math.min(rows, parseInt($('#tableHeaderRows').value, 10) || 0));
            if (rows <= 0 || cols <= 0) return;

            const spawnPoint = (Number.isFinite(x) && Number.isFinite(y))
                ? { x, y }
                : getDefaultSpawnPoint();
            const table = createTableObject({
                x: spawnPoint.x,
                y: spawnPoint.y,
                rows,
                cols,
                cellWidth,
                cellHeight,
                headerRows
            });

            table.setPositionByOrigin(new fabric.Point(spawnPoint.x, spawnPoint.y), 'center', 'center');
            canvas.add(table).setActiveObject(table);
            canvas.requestRenderAll();
            closeTableModal();
        };

        const closeTableModal = () => {
            tableCreatorModal.style.display = 'none';
            $('#confirmTableCreate').removeEventListener('click', createHandler);
            $('#cancelTableCreate').removeEventListener('click', closeTableModal);
            $('#closeTableCreator').removeEventListener('click', closeTableModal);
        };

        on('#confirmTableCreate', 'click', createHandler, { once: true });
        on('#cancelTableCreate', 'click', closeTableModal, { once: true });
        on('#closeTableCreator', 'click', closeTableModal, { once: true });
    }
};
// 6. Restored Table Code
function updateTableLayout(table, preservedCenter = null) {
    if (!table || !table.isTable) return;
    ensureTableCellData(table);

    const cellObjects = table.getObjects();
    const allChildrenAreCells = cellObjects.length === table.rows * table.cols
        && cellObjects.every(obj => obj?.isTableCellGroup);
    if (!allChildrenAreCells) {
        rebuildTableCells(table);
        return;
    }

    const totalWidth = table.colWidths.reduce((sum, w) => sum + w, 0);
    const totalHeight = table.rowHeights.reduce((sum, h) => sum + h, 0);
    const center = preservedCenter || table.getCenterPoint();
    const selected = table._selectedCells instanceof Set ? table._selectedCells : new Set();

    let currentY = -totalHeight / 2;
    for (let r = 0; r < table.rows; r++) {
        let currentX = -totalWidth / 2;
        for (let c = 0; c < table.cols; c++) {
            const cellIndex = r * table.cols + c;
            const cellGroup = table.item(cellIndex);
            if (!cellGroup) continue;
            const width = table.colWidths[c];
            const height = table.rowHeights[r];
            const cellData = table.cellData[cellIndex] || getDefaultTableCellData(table, r, c);
            updateTableCellGroupVisual(cellGroup, width, height, cellData, selected.has(cellIndex));
            cellGroup.set({
                left: currentX + width / 2,
                top: currentY + height / 2,
                originX: 'center',
                originY: 'center',
                row: r,
                col: c,
                cellIndex
            });
            cellGroup.setCoords();
            currentX += width;
        }
        currentY += table.rowHeights[r];
    }

    table.width = totalWidth;
    table.height = totalHeight;
    table.setPositionByOrigin(center, 'center', 'center');
    table.dirty = true;
    table.setCoords();
    table.selectedCells = Array.from(selected);
}
// 6. Restored Table Code
class TableResizer {

    constructor(canvas) {
        this.canvas = canvas;
        this.state = {};
        this.resetState();

        this.RESIZE_HANDLE_AREA = 12;
        this.MIN_CELL_SIZE = 25;
    }

    resetState() {
        if (this.state.target) {
            this.state.target.lockMovementX = false;
            this.state.target.lockMovementY = false;
        }
        this.state = {
            isResizing: false,
            target: null,
            type: null,
            index: -1,
            startX: 0,
            startY: 0,
            originalPos: { x: 0, y: 0 },
            originalWidths: [],
            originalHeights: [],
        };
        this.canvas.defaultCursor = 'default';
    }

    init() {
        this.canvas.on('mouse:down', this.handleMouseDown.bind(this));
        this.canvas.on('mouse:move', this.handleMouseMove.bind(this));
        this.canvas.on('mouse:up', this.handleMouseUp.bind(this));
        this.canvas.on('object:modified', this.handleObjectScaling.bind(this));
    }

    handleObjectScaling(options) {
        const table = options.target;
        if (!table || !table.isTable) return;

        const { scaleX, scaleY } = table;

        let totalWidth = 0;
        for (let i = 0; i < table.colWidths.length; i++) {
            const newWidth = table.originalColWidths[i] * scaleX;
            table.colWidths[i] = Math.max(this.MIN_CELL_SIZE, newWidth);
            totalWidth += table.colWidths[i];
        }

        let totalHeight = 0;
        for (let i = 0; i < table.rowHeights.length; i++) {
            const newHeight = table.originalRowHeights[i] * scaleY;
            table.rowHeights[i] = Math.max(this.MIN_CELL_SIZE, newHeight);
            totalHeight += table.rowHeights[i];
        }

        table.width = totalWidth;
        table.height = totalHeight;
        table.scaleX = 1;
        table.scaleY = 1;

        updateTableLayout(table);
    }

    handleMouseDown(options) {
        if (options.target && options.target.isTable) {
            options.target.originalColWidths = [...options.target.colWidths];
            options.target.originalRowHeights = [...options.target.rowHeights];
        }

        if (!this.canvas.defaultCursor.includes('resize') || !options.target || !options.target.isTable) {
            return;
        }

        const pointer = this.canvas.getPointer(options.e);
        const table = options.target;

        this.state.isResizing = true;
        this.state.target = table;
        this.state.startX = pointer.x;
        this.state.startY = pointer.y;
        this.state.originalPos = { x: table.left, y: table.top };
        this.state.originalWidths = [...table.colWidths];
        this.state.originalHeights = [...table.rowHeights];

        table.lockMovementX = true;
        table.lockMovementY = true;
    }

    handleMouseMove(options) {
        if (this.state.isResizing) {
            this.performResize(options);
        } else {
            this.detectHover(options);
        }
    }

    performResize(options) {
        const pointer = this.canvas.getPointer(options.e);
        const { target, type, index, startX, startY, originalPos } = this.state;
        const dx = pointer.x - startX;
        const dy = pointer.y - startY;

        switch (type) {
            // --- INTERNAL RESIZING (PUSH/PULL) ---
            case 'col': {
                const newWidth = this.state.originalWidths[index] + dx;
                const adjacentNewWidth = this.state.originalWidths[index + 1] - dx;
                if (newWidth >= this.MIN_CELL_SIZE && adjacentNewWidth >= this.MIN_CELL_SIZE) {
                    target.colWidths[index] = newWidth;
                    target.colWidths[index + 1] = adjacentNewWidth;
                }
                break;
            }
            case 'row': {
                const newHeight = this.state.originalHeights[index] + dy;
                const adjacentNewHeight = this.state.originalHeights[index + 1] - dy;
                if (newHeight >= this.MIN_CELL_SIZE && adjacentNewHeight >= this.MIN_CELL_SIZE) {
                    target.rowHeights[index] = newHeight;
                    target.rowHeights[index + 1] = adjacentNewHeight;
                }
                break;
            }
            // --- EDGE RESIZING (PIVOT LOGIC) ---
            case 'edge-right': {
                const newWidth = this.state.originalWidths[index] + dx;
                if (newWidth >= this.MIN_CELL_SIZE) {
                    target.colWidths[index] = newWidth;
                    // [FIX] Move the table's center by HALF the delta to keep the left edge anchored.
                    target.left = originalPos.x + dx / 2;
                }
                break;
            }
            case 'edge-left': {
                const newWidth = this.state.originalWidths[index] - dx;
                if (newWidth >= this.MIN_CELL_SIZE) {
                    target.colWidths[index] = newWidth;
                    // Move the table's center by HALF the delta to keep the right edge anchored.
                    target.left = originalPos.x + dx / 2;
                }
                break;
            }
            case 'edge-bottom': {
                const newHeight = this.state.originalHeights[index] + dy;
                if (newHeight >= this.MIN_CELL_SIZE) {
                    target.rowHeights[index] = newHeight;
                    // [FIX] Move the table's center by HALF the delta to keep the top edge anchored.
                    target.top = originalPos.y + dy / 2;
                }
                break;
            }
            case 'edge-top': {
                const newHeight = this.state.originalHeights[index] - dy;
                if (newHeight >= this.MIN_CELL_SIZE) {
                    target.rowHeights[index] = newHeight;
                    // Move the table's center by HALF the delta to keep the bottom edge anchored.
                    target.top = originalPos.y + dy / 2;
                }
                break;
            }
        }

        // This function recalculates total dimensions and repositions internal cells.
        updateTableLayout(target);

        // We must re-render the canvas to see the changes.
        this.canvas.requestRenderAll();
    }

    detectHover(options) {
        const target = this.canvas.findTarget(options.e);
        if (!target || !target.isTable || !target.hasControls) {
            if (this.canvas.defaultCursor !== 'default') this.canvas.defaultCursor = 'default';
            if (this.canvas.hoverCursor !== 'default') this.canvas.hoverCursor = 'default';
            return;
        }

        const pointer = this.canvas.getPointer(options.e);
        const table = target;
        const localPoint = table.toLocalPoint(new fabric.Point(pointer.x, pointer.y), 'center', 'center');

        let onBoundary = false;

        let currentX = -table.width / 2;
        for (let c = 0; c < table.cols; c++) {
            if (c === 0 && Math.abs(localPoint.x - currentX) < this.RESIZE_HANDLE_AREA) {
                this.canvas.defaultCursor = 'ew-resize';
                this.canvas.hoverCursor = 'ew-resize';
                this.state.type = 'edge-left';
                this.state.index = 0;
                onBoundary = true; break;
            }
            currentX += table.colWidths[c];
            if (Math.abs(localPoint.x - currentX) < this.RESIZE_HANDLE_AREA) {
                this.canvas.defaultCursor = 'ew-resize';
                this.canvas.hoverCursor = 'ew-resize';
                this.state.type = (c === table.cols - 1) ? 'edge-right' : 'col';
                this.state.index = c;
                onBoundary = true; break;
            }
        }

        if (!onBoundary) {
            let currentY = -table.height / 2;
            for (let r = 0; r < table.rows; r++) {
                if (r === 0 && Math.abs(localPoint.y - currentY) < this.RESIZE_HANDLE_AREA) {
                    this.canvas.defaultCursor = 'ns-resize';
                    this.canvas.hoverCursor = 'ns-resize';
                    this.state.type = 'edge-top';
                    this.state.index = 0;
                    onBoundary = true; break;
                }
                currentY += table.rowHeights[r];
                if (Math.abs(localPoint.y - currentY) < this.RESIZE_HANDLE_AREA) {
                    this.canvas.defaultCursor = 'ns-resize';
                    this.canvas.hoverCursor = 'ns-resize';
                    this.state.type = (r === table.rows - 1) ? 'edge-bottom' : 'row';
                    this.state.index = r;
                    onBoundary = true; break;
                }
            }
        }

        if (!onBoundary) {
            this.canvas.defaultCursor = 'default';
            this.canvas.hoverCursor = 'default';
        }
    }

    handleMouseUp() {
        if (this.state.isResizing) {
            if (this.state.target) {
                this.state.target.originalColWidths = [...this.state.target.colWidths];
                this.state.target.originalRowHeights = [...this.state.target.rowHeights];
            }
            this.resetState();
            this.canvas.requestRenderAll();
        }
    }
}
const tableResizer = new TableResizer(canvas);
tableResizer.init();

canvas.on('mouse:down', (options) => {
    if (activeTableCellEditor) closeTableCellEditor({ commit: true });
    const table = options.target;
    if (!table || !table.isTable) return;
    if (tableResizer.state.isResizing || canvas.defaultCursor.includes('resize')) return;

    const pointer = canvas.getPointer(options.e);
    const hit = getTableCellFromPointer(table, pointer);
    if (!hit) return;

    const append = !!options.e.shiftKey;
    const toggle = !!(options.e.ctrlKey || options.e.metaKey);
    if (!append && !toggle) clearTableCellSelections(table);

    setSelectedTableCells(table, [hit.index], { append, toggle });
    refreshInspector({ target: table });
    updateFloatingLinker(table);
});

canvas.on('mouse:dblclick', (options) => {
    const table = options.target;
    if (!table || !table.isTable) return;
    if (tableResizer.state.isResizing || canvas.defaultCursor.includes('resize')) return;

    const pointer = canvas.getPointer(options.e);
    const hit = getTableCellFromPointer(table, pointer);
    if (!hit) return;

    clearTableCellSelections(table);
    setSelectedTableCells(table, [hit.index]);
    startTableCellEditor(table, hit.index);
    refreshInspector({ target: table });
    updateFloatingLinker(table);
});

canvas.on('mouse:wheel', () => {
    if (activeTableCellEditor) closeTableCellEditor({ commit: true });
});


document.getElementById('imageUpload').addEventListener('change', e => { if (!e.target.files || !e.target.files[0]) return; const reader = new FileReader(); reader.onload = (ev) => { const spawn = getDefaultSpawnPoint(); adders.image(spawn.x, spawn.y, ev.target.result); e.target.value = ''; }; reader.readAsDataURL(e.target.files[0]); });
document.querySelectorAll('.shape-chip[data-add]').forEach(chip => {
    const type = chip.getAttribute('data-add');
    chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', `component:${type}`); });
    chip.addEventListener('click', () => {
        if (!adders[type]) return;
        if (type === 'image') { $('#imageUpload').click(); return; }
        const spawn = getDefaultSpawnPoint();
        adders[type](spawn.x, spawn.y);
    });
});

const componentsMainView = document.getElementById('componentsMainView');
const componentsShapesView = document.getElementById('componentsShapesView');
const openShapesMenuBtn = document.getElementById('openShapesMenuBtn');
const backToComponentsBtn = document.getElementById('backToComponentsBtn');

const showComponentsView = (view = 'main') => {
    if (!componentsMainView || !componentsShapesView) return;
    const showShapes = view === 'shapes';
    componentsMainView.hidden = showShapes;
    componentsShapesView.hidden = !showShapes;
};

if (openShapesMenuBtn && componentsMainView && componentsShapesView) {
    openShapesMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showComponentsView('shapes');
    });
    openShapesMenuBtn.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        showComponentsView('shapes');
    });
}

if (backToComponentsBtn && componentsMainView && componentsShapesView) {
    backToComponentsBtn.addEventListener('click', () => showComponentsView('main'));
}

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (componentsShapesView && !componentsShapesView.hidden) showComponentsView('main');
});

const dropTarget = canvas.upperCanvasEl; canvas.calcOffset();
dropTarget.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
dropTarget.addEventListener('drop', (e) => {
    e.preventDefault(); const { x, y } = canvas.getPointer(e); const data = e.dataTransfer.getData('text/plain'); const [dataType, value] = data.split(/:(.*)/s);
    if (dataType === 'component' && adders[value]) { if (value === 'image') { const file = e.dataTransfer.files?.[0]; if (file?.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (ev) => adders.image(x, y, ev.target.result); reader.readAsDataURL(file); } else { $('#imageUpload').click(); } } else { adders[value](x, y); } }
    else if (dataType === 'element') { const elementData = JSON.parse(value); adders.image(x, y, elementData.image_url, { oid: elementData.id }); }
});

// --- SIDEBAR RESIZING & TOGGLING ---
const mainLayout = document.getElementById('main-layout'); const leftResizer = document.getElementById('left-resizer'); const rightResizer = document.getElementById('right-resizer'); let isResizingLeft = false, isResizingRight = false; let lastLeftPanelWidth = '300px', lastRightPanelWidth = '300px'; mainLayout.style.gridTemplateColumns = `${lastLeftPanelWidth} 5px 1fr 5px ${lastRightPanelWidth}`;
function initResizer(resizer, resizeFlagSetter, panelSide) { resizer.addEventListener('mousedown', (e) => { e.preventDefault(); resizeFlagSetter(true); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }); document.addEventListener('mousemove', (e) => { if (!resizeFlagSetter()) return; const mainRect = mainLayout.getBoundingClientRect(); if (panelSide === 'left') { const newWidth = e.clientX - mainRect.left; if (newWidth > 150 && newWidth < mainRect.width / 2) { mainLayout.style.gridTemplateColumns = `${newWidth}px 5px 1fr 5px ${mainLayout.style.gridTemplateColumns.split(' ')[4]}`; lastLeftPanelWidth = `${newWidth}px`; } } else { const newWidth = mainRect.right - e.clientX; if (newWidth > 200 && newWidth < mainRect.width / 2) { mainLayout.style.gridTemplateColumns = `${mainLayout.style.gridTemplateColumns.split(' ')[0]} 5px 1fr 5px ${newWidth}px`; lastRightPanelWidth = `${newWidth}px`; } } const { width, height } = canvasWrapper.getBoundingClientRect(); canvas.setDimensions({ width, height }); canvas.calcOffset(); canvas.renderAll(); }); document.addEventListener('mouseup', () => { if (resizeFlagSetter()) { resizeFlagSetter(false); document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto'; } }); }
initResizer(leftResizer, (v) => { if (v !== undefined) isResizingLeft = v; return isResizingLeft; }, 'left'); initResizer(rightResizer, (v) => { if (v !== undefined) isResizingRight = v; return isResizingRight; }, 'right');
function refreshCanvasSize() {
    setTimeout(() => {
        const { width, height } = canvasWrapper.getBoundingClientRect();
        const currentVpt = Array.isArray(canvas.viewportTransform) ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0];
        canvas.setDimensions({ width, height });
        canvas.calcOffset();
        clampViewportTransform(currentVpt);
        canvas.setViewportTransform(currentVpt);
        canvas.requestRenderAll();
        updatePageActionToolbarPosition();
    }, 50);
}
document.getElementById('left-panel-toggle').addEventListener('click', () => {
    const btn = document.getElementById('left-panel-toggle'); const cols = mainLayout.style.gridTemplateColumns.split(' '); if (cols[0] !== '0px') {
        lastLeftPanelWidth = cols[0]; mainLayout.style.gridTemplateColumns = `0px 0px 1fr 5px ${cols[4]}`;
        document.querySelector('.panel.left')?.classList.add('collapsed'); btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    } else {
        mainLayout.style.gridTemplateColumns = `${lastLeftPanelWidth} 5px 1fr 5px ${cols[4]}`;
        document.querySelector('.panel.left')?.classList.remove('collapsed'); btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    } refreshCanvasSize();
});
document.getElementById('right-panel-toggle').addEventListener('click', () => {
    const btn = document.getElementById('right-panel-toggle'); const cols = mainLayout.style.gridTemplateColumns.split(' '); if (cols[4] !== '0px') {
        lastRightPanelWidth = cols[4]; mainLayout.style.gridTemplateColumns = `${cols[0]} 5px 1fr 0px 0px`;
        document.querySelector('.panel.right')?.classList.add('collapsed'); btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    } else {
        mainLayout.style.gridTemplateColumns = `${cols[0]} 5px 1fr 5px ${lastRightPanelWidth}`;
        document.querySelector('.panel.right')?.classList.remove('collapsed'); btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    } refreshCanvasSize();
});
// --- REBUILT: SNAPPING GUIDES ---
const snapThreshold = 10, snapColor = '#ed7062';
const SNAP_MIN_DIMENSION = 8;
let snapLines = [], snapHighlightBox = null;

function getSnapEdges(obj) {
    obj.setCoords();
    const rect = obj.getBoundingRect(true, true);
    return {
        left: rect.left,
        right: rect.left + rect.width,
        top: rect.top,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
    };
}

function getSnapReferencePoints(target) {
    const selectedMembers = target.type === 'activeSelection'
        ? new Set(target.getObjects())
        : new Set([target]);

    const references = [];
    if (pageRect) references.push(pageRect);

    canvas.getObjects().forEach(obj => {
        if (!obj || !obj.visible || !obj.evented) return;
        if (selectedMembers.has(obj)) return;
        if (obj.excludeFromExport || obj.isSnapLine || obj.isArtboard) return;
        references.push(obj);
    });

    const x = [];
    const y = [];
    references.forEach(obj => {
        const edges = getSnapEdges(obj);
        x.push(
            { value: edges.left, object: obj },
            { value: edges.centerX, object: obj },
            { value: edges.right, object: obj }
        );
        y.push(
            { value: edges.top, object: obj },
            { value: edges.centerY, object: obj },
            { value: edges.bottom, object: obj }
        );
    });

    return { x, y };
}

function findClosestSnap(targetPoints = [], referencePoints = [], zoom = 1) {
    const threshold = snapThreshold / zoom;
    let best = null;

    targetPoints.forEach(targetPoint => {
        referencePoints.forEach(referencePoint => {
            const distance = Math.abs(targetPoint.value - referencePoint.value);
            if (distance >= threshold) return;
            if (!best || distance < best.distance) {
                best = {
                    targetKey: targetPoint.key,
                    targetPoint: targetPoint.value,
                    guidePoint: referencePoint.value,
                    distance,
                    object: referencePoint.object
                };
            }
        });
    });

    return best;
}

function resolveResizeAxisMode(options, axis) {
    const corner = String(options?.transform?.corner || options?.target?.__corner || '').toLowerCase();
    const action = String(options?.transform?.action || '').toLowerCase();
    const origin = String(axis === 'X' ? options?.transform?.originX : options?.transform?.originY || '').toLowerCase();

    if (!action.includes('scale')) return null;

    if (axis === 'X') {
        if (corner === 'mr' || corner === 'tr' || corner === 'br') return 'right';
        if (corner === 'ml' || corner === 'tl' || corner === 'bl') return 'left';
        if (corner === 'mt' || corner === 'mb') return null;
        if (origin === 'left') return 'right';
        if (origin === 'right') return 'left';
        if (origin === 'center' && action.includes('scalex')) return 'center';
        return null;
    }

    if (corner === 'mb' || corner === 'bl' || corner === 'br') return 'bottom';
    if (corner === 'mt' || corner === 'tl' || corner === 'tr') return 'top';
    if (corner === 'ml' || corner === 'mr') return null;
    if (origin === 'top') return 'bottom';
    if (origin === 'bottom') return 'top';
    if (origin === 'center' && action.includes('scaley')) return 'center';
    return null;
}

function getResizeSnapTargetPoints(edges, axisMode, axis) {
    if (!axisMode) return [];

    if (axis === 'X') {
        if (axisMode === 'right') return [{ key: 'right', value: edges.right }, { key: 'centerX', value: edges.centerX }];
        if (axisMode === 'left') return [{ key: 'left', value: edges.left }, { key: 'centerX', value: edges.centerX }];
        if (axisMode === 'center') return [{ key: 'left', value: edges.left }, { key: 'right', value: edges.right }];
        return [];
    }

    if (axisMode === 'bottom') return [{ key: 'bottom', value: edges.bottom }, { key: 'centerY', value: edges.centerY }];
    if (axisMode === 'top') return [{ key: 'top', value: edges.top }, { key: 'centerY', value: edges.centerY }];
    if (axisMode === 'center') return [{ key: 'top', value: edges.top }, { key: 'bottom', value: edges.bottom }];
    return [];
}

function applyResizeSnapForAxis(target, axis, axisMode, snapData, edgesBefore) {
    if (!snapData || !axisMode) return false;

    const isX = axis === 'X';
    const currentSize = isX ? edgesBefore.width : edgesBefore.height;
    if (!Number.isFinite(currentSize) || currentSize <= 0) return false;

    let anchor = null;
    let nextSize = null;

    if (isX) {
        if (axisMode === 'right') {
            anchor = edgesBefore.left;
            if (snapData.targetKey === 'right') nextSize = snapData.guidePoint - anchor;
            if (snapData.targetKey === 'centerX') nextSize = (snapData.guidePoint - anchor) * 2;
        } else if (axisMode === 'left') {
            anchor = edgesBefore.right;
            if (snapData.targetKey === 'left') nextSize = anchor - snapData.guidePoint;
            if (snapData.targetKey === 'centerX') nextSize = (anchor - snapData.guidePoint) * 2;
        } else if (axisMode === 'center') {
            anchor = edgesBefore.centerX;
            if (snapData.targetKey === 'left' || snapData.targetKey === 'right') {
                nextSize = Math.abs(snapData.guidePoint - anchor) * 2;
            }
        }
    } else {
        if (axisMode === 'bottom') {
            anchor = edgesBefore.top;
            if (snapData.targetKey === 'bottom') nextSize = snapData.guidePoint - anchor;
            if (snapData.targetKey === 'centerY') nextSize = (snapData.guidePoint - anchor) * 2;
        } else if (axisMode === 'top') {
            anchor = edgesBefore.bottom;
            if (snapData.targetKey === 'top') nextSize = anchor - snapData.guidePoint;
            if (snapData.targetKey === 'centerY') nextSize = (anchor - snapData.guidePoint) * 2;
        } else if (axisMode === 'center') {
            anchor = edgesBefore.centerY;
            if (snapData.targetKey === 'top' || snapData.targetKey === 'bottom') {
                nextSize = Math.abs(snapData.guidePoint - anchor) * 2;
            }
        }
    }

    if (!Number.isFinite(nextSize) || nextSize < SNAP_MIN_DIMENSION) return false;

    const ratio = nextSize / currentSize;
    if (!Number.isFinite(ratio) || ratio <= 0) return false;

    if (isX) {
        if (target.lockScalingX) return false;
        target.set('scaleX', target.scaleX * ratio);
    } else {
        if (target.lockScalingY) return false;
        target.set('scaleY', target.scaleY * ratio);
    }

    target.setCoords();
    const edgesAfterScale = getSnapEdges(target);

    if (isX) {
        if (axisMode === 'right') target.left += anchor - edgesAfterScale.left;
        else if (axisMode === 'left') target.left += anchor - edgesAfterScale.right;
        else if (axisMode === 'center') target.left += anchor - edgesAfterScale.centerX;
    } else {
        if (axisMode === 'bottom') target.top += anchor - edgesAfterScale.top;
        else if (axisMode === 'top') target.top += anchor - edgesAfterScale.bottom;
        else if (axisMode === 'center') target.top += anchor - edgesAfterScale.centerY;
    }

    target.setCoords();
    return true;
}

function handleSmartSnapping(options) {
    if (!snapEnabled) return;
    if (options?.transform?.action === 'modifyLineEndpoint') return;

    const target = options.target;
    if (!target || target.locked || target.isArtboard) return;

    clearSnapLines();
    clearSnapHighlight();

    const zoom = canvas.getZoom() || 1;
    const targetEdges = getSnapEdges(target);
    const references = getSnapReferencePoints(target);
    const snapX = findClosestSnap([
        { key: 'left', value: targetEdges.left },
        { key: 'centerX', value: targetEdges.centerX },
        { key: 'right', value: targetEdges.right }
    ], references.x, zoom);
    const snapY = findClosestSnap([
        { key: 'top', value: targetEdges.top },
        { key: 'centerY', value: targetEdges.centerY },
        { key: 'bottom', value: targetEdges.bottom }
    ], references.y, zoom);

    if (snapX) target.left -= (snapX.targetPoint - snapX.guidePoint);
    if (snapY) target.top -= (snapY.targetPoint - snapY.guidePoint);
    target.setCoords();

    if (snapX) drawSnapLine({ x1: snapX.guidePoint, y1: -5000, x2: snapX.guidePoint, y2: 5000 });
    if (snapY) drawSnapLine({ y1: snapY.guidePoint, x1: -5000, y2: snapY.guidePoint, x2: 5000 });

    const highlightTarget = [snapX?.object, snapY?.object].find(obj => obj && obj !== pageRect);
    if (highlightTarget) drawSnapHighlight(highlightTarget);
}

function handleResizeSnapping(options) {
    if (!snapEnabled) return;
    if (options?.transform?.action === 'modifyLineEndpoint') return;

    const target = options?.target;
    if (!target || target.locked || target.isArtboard) return;

    const action = String(options?.transform?.action || '').toLowerCase();
    if (!action.includes('scale')) return;

    const normalizedAngle = ((target.angle || 0) % 360 + 360) % 360;
    if (normalizedAngle > 0.001 && normalizedAngle < 359.999) return;

    clearSnapLines();
    clearSnapHighlight();

    const zoom = canvas.getZoom() || 1;
    const targetEdges = getSnapEdges(target);
    const references = getSnapReferencePoints(target);

    const axisModeX = resolveResizeAxisMode(options, 'X');
    const axisModeY = resolveResizeAxisMode(options, 'Y');

    const snapX = findClosestSnap(
        getResizeSnapTargetPoints(targetEdges, axisModeX, 'X'),
        references.x,
        zoom
    );
    const snapY = findClosestSnap(
        getResizeSnapTargetPoints(targetEdges, axisModeY, 'Y'),
        references.y,
        zoom
    );

    const snappedX = applyResizeSnapForAxis(target, 'X', axisModeX, snapX, targetEdges);
    const snappedY = applyResizeSnapForAxis(target, 'Y', axisModeY, snapY, targetEdges);

    if (!snappedX && !snappedY) return;

    if (snappedX && snapX) drawSnapLine({ x1: snapX.guidePoint, y1: -5000, x2: snapX.guidePoint, y2: 5000 });
    if (snappedY && snapY) drawSnapLine({ y1: snapY.guidePoint, x1: -5000, y2: snapY.guidePoint, x2: 5000 });

    const highlightTarget = [
        snappedX ? snapX?.object : null,
        snappedY ? snapY?.object : null
    ].find(obj => obj && obj !== pageRect);
    if (highlightTarget) drawSnapHighlight(highlightTarget);
}

function drawSnapLine(coords) {
    const line = new fabric.Line([coords.x1, coords.y1, coords.x2, coords.y2], {
        stroke: snapColor,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        isSnapLine: true,
        excludeFromExport: true
    });
    snapLines.push(line);
    canvas.add(line);
    line.bringToFront();
}

function drawSnapHighlight(obj) {
    if (!obj) return;

    obj.setCoords(); // update object coordinates

    // get bounding rect in canvas space
    const rect = obj.getBoundingRect(true); // pass `true` to get absolute coordinates including transformations

    clearSnapHighlight();

    snapHighlightBox = new fabric.Rect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
        fill: 'transparent',
        stroke: snapColor,
        strokeWidth: 1,
        isSnapLine: true,
        excludeFromExport: true,
        strokeDashArray: [4, 4],
    });

    canvas.add(snapHighlightBox);
    snapHighlightBox.bringToFront();
}

function clearSnapLines() {
    snapLines.forEach(line => canvas.remove(line));
    snapLines = [];
    clearSnapHighlight();
}

function clearSnapHighlight() {
    if (snapHighlightBox) {
        canvas.remove(snapHighlightBox);
        snapHighlightBox = null;
    }
}

canvas.on('before:transform', () => {
    scheduleOutsideObjectsCleanup.clear();
    clearSnapLines();
});
canvas.on('selection:cleared', () => {
    clearSnapLines();
    scheduleOutsideObjectsCleanup();
});

