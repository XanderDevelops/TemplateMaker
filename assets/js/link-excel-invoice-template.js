(() => {
  'use strict';

  const TEMPLATE_URL = '/assets/templates/invoice-template-3.json';
  const LINKABLE_FIELDS = new Set([
    'company_name', 'company_address', 'invoice_number_value', 'invoice_date_value',
    'bill_to_address', 'ship_to_address',
    'item_1_desc', 'item_1_qty', 'item_1_unit_price', 'item_1_amount',
    'item_2_desc', 'item_2_qty', 'item_2_unit_price', 'item_2_amount',
    'item_3_desc', 'item_3_qty', 'item_3_unit_price', 'item_3_amount',
    'subtotal_value', 'tax_value', 'total_value', 'notes_content', 'footer_text_content'
  ]);

  const AUTO_TARGETS = [
    { target: 'invoice_number_value', patterns: [/^invoice\s*(no|number|#)?\.?$/i, /^inv\s*(no|number|#)?\.?$/i] },
    { target: 'invoice_date_value', patterns: [/^invoice\s*date$/i, /^date$/i] },
    { target: 'bill_to_address', patterns: [/^(customer|client|bill\s*to|name|customer\s*name|client\s*name)$/i] },
    { target: 'ship_to_address', patterns: [/^(ship\s*to|shipping|shipping\s*address)$/i] },
    { target: 'item_1_desc', patterns: [/^(item|product|description)\s*1$/i] },
    { target: 'item_1_qty', patterns: [/^(qty|quantity)\s*1$/i] },
    { target: 'item_1_unit_price', patterns: [/^(price|unit\s*price)\s*1$/i] },
    { target: 'item_1_amount', patterns: [/^(amount|total)\s*1$/i] },
    { target: 'item_2_desc', patterns: [/^(item|product|description)\s*2$/i] },
    { target: 'item_2_qty', patterns: [/^(qty|quantity)\s*2$/i] },
    { target: 'item_2_unit_price', patterns: [/^(price|unit\s*price)\s*2$/i] },
    { target: 'item_2_amount', patterns: [/^(amount|total)\s*2$/i] },
    { target: 'item_3_desc', patterns: [/^(item|product|description)\s*3$/i] },
    { target: 'item_3_qty', patterns: [/^(qty|quantity)\s*3$/i] },
    { target: 'item_3_unit_price', patterns: [/^(price|unit\s*price)\s*3$/i] },
    { target: 'item_3_amount', patterns: [/^(amount|total)\s*3$/i] },
    { target: 'subtotal_value', patterns: [/^subtotal$/i] },
    { target: 'tax_value', patterns: [/^(tax|tax\s*amount)$/i] },
    { target: 'total_value', patterns: [/^(grand\s*total|invoice\s*total|total)$/i] },
    { target: 'company_name', patterns: [/^(company|company\s*name)$/i] },
    { target: 'company_address', patterns: [/^company\s*address$/i] },
    { target: 'notes_content', patterns: [/^(notes|terms|payment\s*terms)$/i] }
  ];

  const state = {
    template: null,
    canvas: null,
    thumbnail: null,
    columns: [],
    rows: [],
    firstRow: {},
    fileName: null,
    links: new Map(),
    originalText: new Map(),
    selectedColumn: null,
    currentDocument: 'invoices',
    toastTimer: null
  };

  const els = {
    documentTypes: document.getElementById('documentTypes'),
    templateList: document.getElementById('templateList'),
    templateEmpty: document.getElementById('templateEmpty'),
    templateCount: document.getElementById('templateCount'),
    templateCategoryLabel: document.getElementById('templateCategoryLabel'),
    invoiceCanvas: document.getElementById('invoiceCanvas'),
    templateThumbnail: document.getElementById('templateThumbnail'),
    canvasPageShell: document.getElementById('canvasPageShell'),
    fieldLinkOverlays: document.getElementById('fieldLinkOverlays'),
    previewHelp: document.getElementById('previewHelp'),
    dropZone: document.getElementById('dropZone'),
    uploadButton: document.getElementById('uploadButton'),
    excelInput: document.getElementById('excelInput'),
    filePill: document.getElementById('filePill'),
    fileName: document.getElementById('fileName'),
    fileMeta: document.getElementById('fileMeta'),
    clearFile: document.getElementById('clearFile'),
    openEditorButton: document.getElementById('openEditorButton'),
    columnsList: document.getElementById('columnsList'),
    columnsCount: document.getElementById('columnsCount'),
    columnsInstruction: document.getElementById('columnsInstruction'),
    linkedCount: document.getElementById('linkedCount'),
    openCount: document.getElementById('openCount'),
    toast: document.getElementById('toast')
  };

  const linkIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.2 13.8l3.6-3.6"></path>
      <path d="M8.5 16.5l-1.1 1.1a3.4 3.4 0 0 1-4.8-4.8l3-3a3.4 3.4 0 0 1 4.8 0"></path>
      <path d="M15.5 7.5l1.1-1.1a3.4 3.4 0 0 1 4.8 4.8l-3 3a3.4 3.4 0 0 1-4.8 0"></path>
    </svg>`;

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2300);
  }

  function normalize(value) {
    return String(value ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function sampleFor(column) {
    const value = state.firstRow?.[column];
    if (value === null || value === undefined || String(value).trim() === '') return 'No sample value';
    const text = String(value).trim();
    return text.length > 34 ? text.slice(0, 31) + '…' : text;
  }

  function getAutoTarget(column, usedTargets) {
    const normalized = normalize(column);
    for (const rule of AUTO_TARGETS) {
      if (usedTargets.has(rule.target)) continue;
      if (rule.patterns.some(pattern => pattern.test(normalized))) return rule.target;
    }
    return null;
  }

  function setColumns(headers, firstRow = {}, { autoLink = true, rows = null } = {}) {
    state.columns = headers.filter(Boolean).map(h => String(h).trim()).filter(Boolean);
    state.rows = Array.isArray(rows) ? rows : (firstRow && Object.keys(firstRow).length ? [firstRow] : []);
    state.firstRow = firstRow || state.rows[0] || {};
    state.links.clear();
    state.selectedColumn = null;
    restoreTemplateText();

    if (autoLink) {
      const usedTargets = new Set();
      state.columns.forEach(column => {
        const target = getAutoTarget(column, usedTargets);
        if (target) {
          state.links.set(column, target);
          usedTargets.add(target);
          applyColumnValueToTarget(column, target);
        }
      });
    }

    renderColumns();
    updateLinkingPrompt();
    renderFieldLinkIndicators();
  }

  function renderColumns() {
    els.columnsList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.columns.forEach(column => {
      const linkedTarget = state.links.get(column);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'column-item' + (state.selectedColumn === column ? ' selected' : '');
      item.dataset.column = column;
      item.setAttribute('aria-pressed', state.selectedColumn === column ? 'true' : 'false');
      item.innerHTML = `
        <span class="column-type">Aa</span>
        <span class="column-copy">
          <span class="column-name"></span>
          <span class="column-sample"></span>
        </span>
        <span class="link-status ${linkedTarget ? 'linked' : ''}" ${linkedTarget ? 'data-tooltip="Linked"' : 'data-tooltip="Not linked"'}>
          ${linkIcon}
        </span>`;
      item.querySelector('.column-name').textContent = column;
      item.querySelector('.column-sample').textContent = sampleFor(column);
      item.addEventListener('click', () => selectColumn(column));
      fragment.appendChild(item);
    });

    els.columnsList.appendChild(fragment);
    const linked = state.links.size;
    els.columnsCount.textContent = state.columns.length;
    els.linkedCount.textContent = linked;
    els.openCount.textContent = Math.max(0, state.columns.length - linked);
    renderFieldLinkIndicators();
  }

  function selectColumn(column) {
    if (state.selectedColumn === column) {
      state.selectedColumn = null;
    } else {
      state.selectedColumn = column;
    }
    renderColumns();
    updateLinkingPrompt();
  }

  function updateLinkingPrompt() {
    if (state.selectedColumn) {
      els.canvasPageShell.classList.add('linking');
      els.previewHelp.classList.add('active');
      els.previewHelp.lastChild.textContent = ` Click a field to link “${state.selectedColumn}”`;
    } else {
      els.canvasPageShell.classList.remove('linking');
      els.previewHelp.classList.remove('active');
      els.previewHelp.lastChild.textContent = ' Click a column to start linking';
    }
  }

  function restoreTemplateText() {
    if (!state.canvas) return;
    state.canvas.getObjects().forEach(obj => {
      if (obj.oid && state.originalText.has(obj.oid) && typeof obj.set === 'function') {
        obj.set('text', state.originalText.get(obj.oid));
      }
    });
    state.canvas.requestRenderAll();
  }

  function applyColumnValueToTarget(column, targetOid) {
    if (!state.canvas) return;
    const obj = state.canvas.getObjects().find(o => o.oid === targetOid);
    if (!obj || !('text' in obj)) return;
    const raw = state.firstRow?.[column];
    if (raw === undefined || raw === null || String(raw).trim() === '') return;
    obj.set('text', String(raw).trim());
    state.canvas.requestRenderAll();
  }

  function renderFieldLinkIndicators() {
    if (!els.fieldLinkOverlays) return;
    els.fieldLinkOverlays.innerHTML = '';
    if (!state.canvas || !state.template || !state.links.size) return;

    const pageWidth = state.template.page?.width || 768;
    const scale = els.canvasPageShell.clientWidth / pageWidth;
    const linkedTargets = [...new Set(state.links.values())];

    linkedTargets.forEach(targetOid => {
      const obj = state.canvas.getObjects().find(o => o.oid === targetOid);
      if (!obj) return;
      const rect = obj.getBoundingRect(true, true);
      const indicator = document.createElement('span');
      indicator.className = 'field-link-indicator';
      indicator.innerHTML = linkIcon;
      indicator.style.left = `${(rect.left + rect.width) * scale + 6}px`;
      indicator.style.top = `${(rect.top + rect.height / 2) * scale}px`;
      els.fieldLinkOverlays.appendChild(indicator);
    });
  }

  function linkSelectedColumn(targetOid) {
    const column = state.selectedColumn;
    if (!column || !targetOid || !LINKABLE_FIELDS.has(targetOid)) return;

    for (const [otherColumn, otherTarget] of [...state.links.entries()]) {
      if (otherTarget === targetOid && otherColumn !== column) state.links.delete(otherColumn);
    }
    state.links.set(column, targetOid);
    restoreTemplateText();
    for (const [linkedColumn, linkedTarget] of state.links.entries()) {
      applyColumnValueToTarget(linkedColumn, linkedTarget);
    }

    state.selectedColumn = null;
    renderColumns();
    updateLinkingPrompt();
    renderFieldLinkIndicators();
    showToast(`Linked “${column}” to the selected invoice field.`);
  }

  function configureCanvasObjects() {
    state.originalText.clear();
    state.canvas.getObjects().forEach(obj => {
      const oid = obj.oid;
      const linkable = LINKABLE_FIELDS.has(oid);
      if (oid && 'text' in obj) state.originalText.set(oid, obj.text);
      obj.set({
        selectable: false,
        hasControls: false,
        hasBorders: false,
        evented: linkable,
        hoverCursor: linkable ? 'pointer' : 'default'
      });
    });
    state.canvas.selection = false;
    state.canvas.skipTargetFind = false;
    state.canvas.on('mouse:down', event => {
      const target = event.target;
      if (!state.selectedColumn || !target?.oid || !LINKABLE_FIELDS.has(target.oid)) return;
      linkSelectedColumn(target.oid);
    });
  }

  function resizeCanvasToShell() {
    if (!state.canvas || !state.template) return;
    const width = state.template.page?.width || 768;
    const height = state.template.page?.height || 1024;
    const shellWidth = els.canvasPageShell.clientWidth;
    if (!shellWidth) return;
    const scale = shellWidth / width;
    const shellHeight = height * scale;
    state.canvas.setDimensions({ width: shellWidth, height: shellHeight });
    state.canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    els.canvasPageShell.style.height = `${shellHeight}px`;
    state.canvas.calcOffset();
    state.canvas.requestRenderAll();
    renderFieldLinkIndicators();
  }

  function renderThumbnail(template) {
    if (!window.fabric || !els.templateThumbnail) return;
    const thumb = new fabric.StaticCanvas(els.templateThumbnail, {
      renderOnAddRemove: false,
      selection: false,
      backgroundColor: '#fff'
    });
    const width = template.page?.width || 768;
    const height = template.page?.height || 1024;
    const scale = 116 / width;
    thumb.setWidth(116);
    thumb.setHeight(154.7);
    thumb.loadFromJSON(template.canvas, () => {
      thumb.setViewportTransform([scale, 0, 0, scale, 0, 0]);
      thumb.getObjects().forEach(obj => obj.set({ selectable: false, evented: false }));
      thumb.requestRenderAll();
    });
    state.thumbnail = thumb;
  }

  async function loadTemplate() {
    const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Template request failed (${response.status})`);
    const template = await response.json();
    state.template = template;

    state.canvas = new fabric.Canvas(els.invoiceCanvas, {
      selection: false,
      preserveObjectStacking: true,
      backgroundColor: '#fff',
      renderOnAddRemove: false
    });
    state.canvas.setWidth(template.page?.width || 768);
    state.canvas.setHeight(template.page?.height || 1024);

    await new Promise(resolve => {
      state.canvas.loadFromJSON(template.canvas, () => {
        configureCanvasObjects();
        state.canvas.requestRenderAll();
        resolve();
      });
    });

    renderThumbnail(template);
    resizeCanvasToShell();

    const sampleHeaders = template.data?.headers || [];
    const sampleRows = template.data?.rows || [];
    const sampleRow = sampleRows[0] || {};
    setColumns(sampleHeaders, sampleRow, { autoLink: true, rows: sampleRows });
  }

  function handleDocumentType(button) {
    const doc = button.dataset.document;
    state.currentDocument = doc;
    els.documentTypes.querySelectorAll('.document-type').forEach(btn => btn.classList.toggle('active', btn === button));
    const label = button.querySelector('span:last-child')?.textContent?.trim() || 'Templates';
    els.templateCategoryLabel.textContent = label;
    const available = doc === 'invoices';
    els.templateList.hidden = !available;
    els.templateEmpty.hidden = available;
    els.templateCount.textContent = available ? '1' : '0';
    if (!available) showToast(`${label} templates are coming soon.`);
  }

  function parseWorkbook(arrayBuffer, fileName) {
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('The workbook does not contain a readable sheet.');
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    let headers = [];
    if (rows.length) {
      headers = Object.keys(rows[0]);
    } else {
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      headers = (matrix[0] || []).map(v => String(v).trim()).filter(Boolean);
    }
    if (!headers.length) throw new Error('No column headers were found in this file.');
    return { headers, rows, firstRow: rows[0] || {}, fileName, rowCount: rows.length };
  }

  async function loadSpreadsheet(file) {
    if (!file) return;
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!allowed) {
      showToast('Please upload an .xlsx, .xls or .csv file.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const result = parseWorkbook(buffer, file.name);
      state.fileName = file.name;
      setColumns(result.headers, result.firstRow, { autoLink: true, rows: result.rows });
      els.fileName.textContent = file.name;
      els.fileMeta.textContent = `${result.headers.length} columns · ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}`;
      els.filePill.hidden = false;
      els.dropZone.classList.add('has-file');
      els.columnsInstruction.textContent = 'Columns from your file. Linked fields are marked automatically when CSVLink finds a clear match.';
      showToast(`Loaded ${result.headers.length} columns and ${result.rowCount} rows from ${file.name}.`);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'CSVLink could not read this file.');
    }
  }

  function resetToSampleData() {
    if (!state.template) return;
    els.excelInput.value = '';
    state.fileName = null;
    els.filePill.hidden = true;
    els.dropZone.classList.remove('has-file');
    els.fileName.textContent = '';
    els.fileMeta.textContent = '';
    els.columnsInstruction.textContent = 'Example columns are loaded so you can try the linking flow.';
    const sampleRows = state.template.data?.rows || [];
    setColumns(state.template.data?.headers || [], sampleRows[0] || {}, { autoLink: true, rows: sampleRows });
    showToast('Example columns restored.');
  }

  function updateBindingsList(rawBindings = []) {
    const linkByOid = new Map();
    for (const [column, oid] of state.links.entries()) {
      linkByOid.set(oid, [{ column, property: 'Text Content' }]);
    }

    const seen = new Set();
    const next = (Array.isArray(rawBindings) ? rawBindings : []).map(entry => {
      const oid = Array.isArray(entry) ? String(entry[0] || '') : '';
      if (!oid) return entry;
      seen.add(oid);
      return [oid, linkByOid.get(oid) || []];
    });

    linkByOid.forEach((bindingList, oid) => {
      if (!seen.has(oid)) next.push([oid, bindingList]);
    });
    return next;
  }

  function updateCanvasTextsForHandoff(canvasJson) {
    if (!canvasJson || !Array.isArray(canvasJson.objects)) return;
    const columnByOid = new Map([...state.links.entries()].map(([column, oid]) => [oid, column]));
    canvasJson.objects.forEach(obj => {
      const column = columnByOid.get(obj?.oid);
      if (!column || !('text' in obj)) return;
      const value = state.firstRow?.[column];
      if (value !== undefined && value !== null && String(value).trim() !== '') obj.text = String(value).trim();
    });
  }

  function buildEditorHandoffTemplate() {
    const template = JSON.parse(JSON.stringify(state.template || {}));
    template.data = {
      ...(template.data || {}),
      headers: [...state.columns],
      rows: state.rows.map(row => ({ ...row }))
    };
    template.bindings = updateBindingsList(template.bindings);
    updateCanvasTextsForHandoff(template.canvas);

    if (Array.isArray(template.pages) && template.pages.length) {
      template.pages = template.pages.map((page, index) => {
        if (index !== 0) return page;
        const nextPage = { ...page, bindings: updateBindingsList(page.bindings) };
        updateCanvasTextsForHandoff(nextPage.canvas);
        return nextPage;
      });
    }
    return template;
  }

  function openEditorWithCurrentState(event) {
    if (!state.template) return;
    if (event) event.preventDefault();
    const template = buildEditorHandoffTemplate();
    const handoff = {
      version: 1,
      createdAt: Date.now(),
      fileName: state.fileName || 'Landing page data',
      template,
      data: { headers: [...state.columns], rows: state.rows.map(row => ({ ...row })) }
    };
    try {
      localStorage.setItem('csvlink-editor-handoff', JSON.stringify(handoff));
      localStorage.setItem('cachedFileName', handoff.fileName);
      localStorage.setItem('cachedHeaders', JSON.stringify(handoff.data.headers));
      localStorage.setItem('cachedDataRows', JSON.stringify(handoff.data.rows));
      localStorage.removeItem('cachedIdentifierColumn');
    } catch (error) {
      console.warn('Could not cache editor handoff:', error);
    }
    window.location.href = '/tool?handoff=1';
  }

  function setupEvents() {
    els.openEditorButton?.addEventListener('click', openEditorWithCurrentState);

    els.documentTypes.addEventListener('click', event => {
      const button = event.target.closest('.document-type');
      if (button) handleDocumentType(button);
    });

    els.uploadButton.addEventListener('click', event => {
      event.stopPropagation();
      els.excelInput.click();
    });
    els.dropZone.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      els.excelInput.click();
    });
    els.excelInput.addEventListener('change', event => loadSpreadsheet(event.target.files?.[0]));
    els.clearFile.addEventListener('click', event => {
      event.stopPropagation();
      resetToSampleData();
    });

    ['dragenter', 'dragover'].forEach(name => {
      els.dropZone.addEventListener(name, event => {
        event.preventDefault();
        event.stopPropagation();
        els.dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      els.dropZone.addEventListener(name, event => {
        event.preventDefault();
        event.stopPropagation();
        els.dropZone.classList.remove('dragover');
      });
    });
    els.dropZone.addEventListener('drop', event => loadSpreadsheet(event.dataTransfer?.files?.[0]));

    window.addEventListener('resize', () => {
      clearTimeout(window.__csvlinkLandingResize);
      window.__csvlinkLandingResize = setTimeout(resizeCanvasToShell, 80);
    });
  }

  async function init() {
    setupEvents();
    try {
      await loadTemplate();
    } catch (error) {
      console.error(error);
      showToast('The invoice template could not be loaded.');
    }
  }

  init();
})();
