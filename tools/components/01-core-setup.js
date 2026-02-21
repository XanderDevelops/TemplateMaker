// --- Supabase and Auth Integration ---
const supabase = globalThis.__csvlink_supabase;

// --- UTILITIES & SETUP ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const on = (sel, evt, handler, opts) => { const el = $(sel); if (!el) return null; el.addEventListener(evt, handler, opts); return el; };
const onClick = (sel, handler) => { const el = $(sel); if (!el) return null; el.addEventListener('click', handler); return el; };
const setText = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };

const { jsPDF } = window.jspdf;

// --- STATE ---
const canvasWrapper = $('.canvas-wrap');
const canvasEditorStage = $('.canvas-editor-stage');
const pageActionToolbar = $('#pageActionToolbar');
const canvasPagesPanel = $('#canvasPagesPanel');
const canvasPagesStrip = $('#canvasPagesStrip');
const toggleCanvasPagesPanelBtn = $('#toggleCanvasPagesPanelBtn');
const hideCanvasPagesPanelBtn = $('#hideCanvasPagesPanelBtn');
const canvasPagesHeaderRow = canvasPagesPanel?.querySelector('.canvas-pages-header-row');
// 9. Preserve layer stacking
const canvas = new fabric.Canvas('c', { backgroundColor: 'transparent', selection: true, preserveObjectStacking: true });
// High-quality rendering (avoid blurry output)
canvas.enableRetinaScaling = true;
canvas.imageSmoothingEnabled = true;

function getDefaultSpawnPoint() {
    if (pageRect && typeof pageRect.getCenterPoint === 'function') {
        const center = pageRect.getCenterPoint();
        if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) return center;
    }
    const vpCenter = canvas.getVpCenter();
    return new fabric.Point(vpCenter.x, vpCenter.y);
}
const DEFAULT_PAGE_WIDTH = 768;
const DEFAULT_PAGE_HEIGHT = 1024;
const CAMERA_BOUND_PADDING = 600;
const SERIALIZE_PROPS = ['oid', 'name', 'isTable', 'isSvgGroup', 'rows', 'cols', 'colWidths', 'rowHeights', 'locked', 'pageId', 'headerRows', 'headerFill', 'bodyFill', 'borderColor', 'borderWidth', 'cellData', 'isArtboard', 'curveAmount'];
let pageRect;
let documentPages = [];
let currentPageIndex = 0;
let selectedCanvasIndexes = new Set([0]);
let canvasSelectionAnchorIndex = 0;
let isPageSwitching = false;
let isRenderingCanvasGhosts = false;
let isReassigningPageOwnership = false;
let isPastingFromClipboard = false;
let isObjectInteractionActive = false; // still useful for some logic, but we'll be more careful
let ghostRenderVersion = 0;
let isCanvasPagesPanelCollapsed = false;
let draggedCanvasPageIndex = null;
let generalPageSize = { width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT };
let bindings = new Map();
let workbook, worksheet, headers = [], dataRows = [];
let identifierColumn = '';
let gridEnabled = false, snapEnabled = true;
let gridCellSize = 32;
let historyStack = [];// history snapshots
let lastHistorySig = null;
let historyIndex = -1;
let historyLocked = false;
let isRestoringHistory = false;
let _clipboard = null;
let _clipboardMeta = null;
const SYSTEM_FONT_LIST = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];
const GOOGLE_FONT_FAMILY_MAP = new Map(GOOGLE_FONT_FAMILIES.map(name => [String(name).toLowerCase(), String(name)]));
const FONT_LIST = Array.from(new Set([...SYSTEM_FONT_LIST, ...GOOGLE_FONT_FAMILIES]))
    .sort((a, b) => a.localeCompare(b));
const FONT_LIST_LOWER_SET = new Set(FONT_LIST.map(name => String(name).toLowerCase()));
const SYSTEM_FONT_METADATA = {
    'Arial': { category: 'sans-serif', classifications: ['modern', 'minimalist'] },
    'Helvetica': { category: 'sans-serif', classifications: ['modern', 'minimalist'] },
    'Times New Roman': { category: 'serif', classifications: ['classic'] },
    'Georgia': { category: 'serif', classifications: ['classic'] },
    'Courier New': { category: 'monospace', classifications: ['retro'] },
    'Verdana': { category: 'sans-serif', classifications: ['modern'] },
    'Impact': { category: 'display', classifications: ['retro'] },
    'Comic Sans MS': { category: 'handwriting', classifications: ['casual'] }
};
const FONT_SERIF_FILTER_OPTIONS = [
    { value: 'all', label: 'All Scripts' },
    { value: 'serif', label: 'Serif' },
    { value: 'non-serif', label: 'Non-Serif' }
];
const FONT_STYLE_FILTER_OPTIONS = [
    { value: 'all', label: 'All Styles' },
    { value: 'modern', label: 'Modern' },
    { value: 'minimalist', label: 'Minimalist' },
    { value: 'retro', label: 'Retro' },
    { value: 'vintage', label: 'Vintage' },
    { value: 'display', label: 'Display' },
    { value: 'handwriting', label: 'Handwriting' },
    { value: 'monospace', label: 'Monospace' }
];
const FONT_RETRO_KEYWORDS = ['retro', 'vintage', 'old', 'classic', 'groovy', 'bubble', 'pixel', 'typewriter', 'western', 'slab', 'deco'];
const FONT_VINTAGE_KEYWORDS = ['vintage', 'oldstyle', 'antique', 'roman', 'gothic', 'medieval', 'victorian'];
const FONT_STYLE_TAG_CACHE = new Map();
const FONT_METADATA_MAP = new Map();
const GOOGLE_FONTS_STYLESHEET_BASE_URL = 'https://fonts.googleapis.com/css2';
const FONT_FAMILY_DATALIST_ID = 'font-family-datalist';
const fontLoadPromiseCache = new Map();
let fontFamilyDatalistInitialized = false;
let editingFillObject = null;
let cropCanvas, croppingImage = null;
let currentUser = null, currentTemplateId = null, userRole = 'free';
let pendingGuestTemplateRestore = false;
const saveStatusEl = $('#saveStatus');
let activeTableCellEditor = null;
const PAGE_STRIP_COLLAPSE_KEY = 'csvlink-canvas-strip-collapsed';
const PAGE_SIDE_GAP = 120;

function normalizeFontFamilyName(fontFamily) {
    if (typeof fontFamily !== 'string') return '';
    const firstFamily = fontFamily.split(',')[0]?.trim();
    if (!firstFamily) return '';
    return firstFamily.replace(/^["']+|["']+$/g, '').trim();
}

function normalizeFontCategory(category) {
    const raw = String(category || '').trim().toLowerCase();
    if (!raw) return 'sans-serif';
    if (raw === 'sans serif' || raw === 'sans-serif' || raw === 'non-serif' || raw === 'non serifs') return 'sans-serif';
    if (raw === 'mono' || raw === 'monospace') return 'monospace';
    if (raw === 'handwriting' || raw === 'script') return 'handwriting';
    if (raw === 'display') return 'display';
    if (raw === 'serif') return 'serif';
    return raw.replace(/\s+/g, '-');
}

function toSearchTokens(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function buildFontMetadataIndex() {
    if (FONT_METADATA_MAP.size) return;

    Object.entries(GOOGLE_FONT_METADATA || {}).forEach(([family, rawMeta]) => {
        const key = String(family || '').toLowerCase();
        if (!key) return;
        const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
        const classifications = Array.isArray(meta.classifications)
            ? meta.classifications.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
            : [];
        FONT_METADATA_MAP.set(key, {
            category: normalizeFontCategory(meta.category),
            classifications
        });
    });

    Object.entries(SYSTEM_FONT_METADATA).forEach(([family, rawMeta]) => {
        const key = String(family || '').toLowerCase();
        if (!key) return;
        const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
        const classifications = Array.isArray(meta.classifications)
            ? meta.classifications.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
            : [];
        FONT_METADATA_MAP.set(key, {
            category: normalizeFontCategory(meta.category),
            classifications
        });
    });
}

function getFontMetadata(fontFamily) {
    buildFontMetadataIndex();
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized) return { category: 'sans-serif', classifications: [] };
    const key = normalized.toLowerCase();
    const meta = FONT_METADATA_MAP.get(key);
    if (meta) return meta;
    return { category: 'sans-serif', classifications: [] };
}

function getFontCategory(fontFamily) {
    return getFontMetadata(fontFamily).category || 'sans-serif';
}

function getFontStyleTags(fontFamily) {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized) return [];
    const cacheKey = normalized.toLowerCase();
    if (FONT_STYLE_TAG_CACHE.has(cacheKey)) return FONT_STYLE_TAG_CACHE.get(cacheKey);

    const tags = new Set();
    const meta = getFontMetadata(normalized);
    const category = normalizeFontCategory(meta.category);
    const classifications = Array.isArray(meta.classifications) ? meta.classifications : [];
    const nameTokens = toSearchTokens(normalized);
    const nameString = nameTokens.join(' ');

    tags.add(category);
    if (category === 'sans-serif') tags.add('non-serif');
    classifications.forEach(tag => tags.add(tag));

    const isRetroName = FONT_RETRO_KEYWORDS.some(keyword => nameString.includes(keyword));
    const isVintageName = FONT_VINTAGE_KEYWORDS.some(keyword => nameString.includes(keyword));

    if (category === 'sans-serif' || category === 'monospace') tags.add('modern');
    if ((category === 'sans-serif' || category === 'monospace') && !isRetroName && !isVintageName) tags.add('minimalist');
    if (isRetroName || classifications.includes('retro') || classifications.includes('slab') || category === 'display') tags.add('retro');
    if (isVintageName || classifications.includes('oldstyle') || classifications.includes('classical') || category === 'serif') tags.add('vintage');

    const result = Array.from(tags);
    FONT_STYLE_TAG_CACHE.set(cacheKey, result);
    return result;
}

function isSerifFontFamily(fontFamily) {
    const meta = getFontMetadata(fontFamily);
    const category = normalizeFontCategory(meta.category);
    const classifications = Array.isArray(meta.classifications) ? meta.classifications : [];
    const tokens = toSearchTokens(fontFamily).join(' ');

    if (category === 'serif') return true;
    if (classifications.includes('serif') || classifications.includes('slab') || classifications.includes('oldstyle') || classifications.includes('classical')) return true;
    if (tokens.includes('serif') || tokens.includes('slab') || tokens.includes('roman')) return true;
    return false;
}

function fontMatchesSerifFilter(fontFamily, serifFilterValue = 'all') {
    const filter = String(serifFilterValue || 'all').trim().toLowerCase();
    if (!filter || filter === 'all') return true;
    const serif = isSerifFontFamily(fontFamily);
    if (filter === 'serif') return serif;
    if (filter === 'non-serif' || filter === 'sans-serif' || filter === 'non serif') return !serif;
    return true;
}

function fontMatchesStyleFilter(fontFamily, styleFilterValue = 'all') {
    const filter = String(styleFilterValue || 'all').trim().toLowerCase();
    if (!filter || filter === 'all') return true;
    const tags = getFontStyleTags(fontFamily);
    return tags.includes(filter);
}

function fontMatchesFilter(fontFamily, filterValue = 'all') {
    return fontMatchesStyleFilter(fontFamily, filterValue);
}

function getFontSerifFilterOptions() {
    return FONT_SERIF_FILTER_OPTIONS.slice();
}

function getFontStyleFilterOptions() {
    return FONT_STYLE_FILTER_OPTIONS.slice();
}

function getFontFilterOptions() {
    return getFontStyleFilterOptions();
}

function toGoogleFontsFamilyParam(fontFamily) {
    return encodeURIComponent(fontFamily).replace(/%20/g, '+');
}

function addFontFamilyToRegistry(fontFamily) {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized) return '';

    const key = normalized.toLowerCase();
    if (FONT_LIST_LOWER_SET.has(key)) return normalized;

    FONT_LIST_LOWER_SET.add(key);
    FONT_LIST.push(normalized);
    FONT_LIST.sort((a, b) => a.localeCompare(b));
    if (!FONT_METADATA_MAP.has(key)) {
        FONT_METADATA_MAP.set(key, { category: 'sans-serif', classifications: [] });
    }
    FONT_STYLE_TAG_CACHE.delete(key);

    if (fontFamilyDatalistInitialized) {
        const datalist = ensureFontFamilyDatalist();
        if (datalist) {
            const option = document.createElement('option');
            option.value = normalized;
            datalist.appendChild(option);
        }
    }

    return normalized;
}

function ensureFontFamilyDatalist() {
    let datalist = document.getElementById(FONT_FAMILY_DATALIST_ID);
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = FONT_FAMILY_DATALIST_ID;
        document.body.appendChild(datalist);
    }

    if (!fontFamilyDatalistInitialized) {
        const fragment = document.createDocumentFragment();
        FONT_LIST.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            fragment.appendChild(option);
        });
        datalist.replaceChildren(fragment);
        fontFamilyDatalistInitialized = true;
    }

    return datalist;
}

function refreshCanvasTextObjectsForFont(fontFamily) {
    const target = normalizeFontFamilyName(fontFamily).toLowerCase();
    if (!target || !canvas || typeof canvas.getObjects !== 'function') return;

    let changed = false;
    const visit = (obj) => {
        if (!obj) return;

        const isTextObject = obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text';
        if (isTextObject && normalizeFontFamilyName(obj.fontFamily).toLowerCase() === target) {
            if (typeof obj.initDimensions === 'function') obj.initDimensions();
            if (typeof obj.setCoords === 'function') obj.setCoords();
            changed = true;
        }

        if (typeof obj.getObjects === 'function') {
            obj.getObjects().forEach(visit);
        }
    };

    canvas.getObjects().forEach(visit);
    if (changed) canvas.requestRenderAll();
}

function ensureFontFamilyLoaded(fontFamily) {
    const normalized = normalizeFontFamilyName(fontFamily);
    if (!normalized) return Promise.resolve(false);

    const lookupKey = normalized.toLowerCase();
    const canonical = GOOGLE_FONT_FAMILY_MAP.get(lookupKey) || normalized;
    const canonicalKey = canonical.toLowerCase();
    addFontFamilyToRegistry(canonical);
    const isGoogleManaged = GOOGLE_FONT_FAMILY_MAP.has(canonicalKey);

    if (fontLoadPromiseCache.has(canonicalKey)) return fontLoadPromiseCache.get(canonicalKey);

    // For non-Google families (system or uploaded), rely on currently loaded fonts.
    if (!isGoogleManaged) {
        try {
            if (document.fonts && document.fonts.check(`16px "${canonical}"`)) {
                refreshCanvasTextObjectsForFont(canonical);
                return Promise.resolve(true);
            }
        } catch (_) { }
        return Promise.resolve(false);
    }

    const linkId = `gf-${canonicalKey.replace(/[^a-z0-9]+/g, '-')}`;
    const loadPromise = new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            resolve(!!ok);
        };
        const waitForFontFace = async () => {
            try {
                if (document.fonts && typeof document.fonts.load === 'function') {
                    await Promise.race([
                        document.fonts.load(`16px "${canonical}"`),
                        new Promise(r => setTimeout(r, 2500))
                    ]);
                }
            } catch (_) { }
            finish(true);
        };

        const existingLink = document.getElementById(linkId);
        if (existingLink) {
            if (existingLink.dataset.loaded === '1') {
                waitForFontFace();
                return;
            }
            existingLink.addEventListener('load', () => {
                existingLink.dataset.loaded = '1';
                waitForFontFace();
            }, { once: true });
            existingLink.addEventListener('error', () => {
                console.warn(`Failed to load Google font stylesheet: ${canonical}`);
                finish(false);
            }, { once: true });
            setTimeout(() => finish(existingLink.dataset.loaded === '1'), 4500);
            return;
        }

        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `${GOOGLE_FONTS_STYLESHEET_BASE_URL}?family=${toGoogleFontsFamilyParam(canonical)}&display=swap`;
        link.dataset.fontFamily = canonical;
        link.addEventListener('load', () => {
            link.dataset.loaded = '1';
            waitForFontFace();
        }, { once: true });
        link.addEventListener('error', () => {
            console.warn(`Failed to load Google font stylesheet: ${canonical}`);
            finish(false);
        }, { once: true });
        document.head.appendChild(link);
        setTimeout(() => finish(link.dataset.loaded === '1'), 4500);
    }).then((loaded) => {
        if (loaded) refreshCanvasTextObjectsForFont(canonical);
        return loaded;
    }).finally(() => {
        fontLoadPromiseCache.delete(canonicalKey);
    });

    fontLoadPromiseCache.set(canonicalKey, loadPromise);
    return loadPromise;
}

function ensureFontsForCanvasObjects(objects = []) {
    const list = Array.isArray(objects) ? objects : [objects];
    const usedFamilies = new Set();
    const collect = (obj) => {
        if (!obj) return;
        const family = normalizeFontFamilyName(obj.fontFamily);
        if (family) usedFamilies.add(family);
        if (typeof obj.getObjects === 'function') {
            obj.getObjects().forEach(collect);
        }
    };

    list.forEach(collect);
    usedFamilies.forEach(family => { ensureFontFamilyLoaded(family); });
}

const createUid = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const deepClone = (value) => JSON.parse(JSON.stringify(value));

function parsePositiveInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeCanvasPageSelections({ ensureCurrent = true } = {}) {
    const next = new Set();
    selectedCanvasIndexes.forEach(idx => {
        if (Number.isInteger(idx) && idx >= 0 && idx < documentPages.length) next.add(idx);
    });

    if (!next.size && documentPages.length) {
        const safeCurrent = Math.max(0, Math.min(documentPages.length - 1, currentPageIndex));
        next.add(safeCurrent);
    }
    if (ensureCurrent && documentPages.length) {
        const safeCurrent = Math.max(0, Math.min(documentPages.length - 1, currentPageIndex));
        next.add(safeCurrent);
    }
    selectedCanvasIndexes = next;

    if (documentPages.length) {
        const safeCurrent = Math.max(0, Math.min(documentPages.length - 1, currentPageIndex));
        if (!Number.isInteger(canvasSelectionAnchorIndex)
            || canvasSelectionAnchorIndex < 0
            || canvasSelectionAnchorIndex >= documentPages.length) {
            canvasSelectionAnchorIndex = safeCurrent;
        }
    } else {
        canvasSelectionAnchorIndex = 0;
    }
}

function setCanvasPageSelection(indexes = [], { ensureCurrent = true } = {}) {
    const list = Array.isArray(indexes) ? indexes : [indexes];
    selectedCanvasIndexes = new Set(
        list
            .map(v => parseInt(v, 10))
            .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < documentPages.length)
    );
    normalizeCanvasPageSelections({ ensureCurrent });
}

function getSelectedCanvasPageIndexes({ ensureCurrent = true } = {}) {
    normalizeCanvasPageSelections({ ensureCurrent });
    return Array.from(selectedCanvasIndexes).sort((a, b) => a - b);
}

function shiftCanvasPageSelectionForInsert(insertAt) {
    const safeInsertAt = Math.max(0, parseInt(insertAt, 10) || 0);
    const shifted = new Set();
    selectedCanvasIndexes.forEach(idx => shifted.add(idx >= safeInsertAt ? idx + 1 : idx));
    selectedCanvasIndexes = shifted;
    if (canvasSelectionAnchorIndex >= safeInsertAt) canvasSelectionAnchorIndex += 1;
    normalizeCanvasPageSelections({ ensureCurrent: true });
}

function shiftCanvasPageSelectionForDelete(deleteAt) {
    const safeDeleteAt = Math.max(0, parseInt(deleteAt, 10) || 0);
    const shifted = new Set();
    selectedCanvasIndexes.forEach(idx => {
        if (idx === safeDeleteAt) return;
        shifted.add(idx > safeDeleteAt ? idx - 1 : idx);
    });
    selectedCanvasIndexes = shifted;
    if (canvasSelectionAnchorIndex === safeDeleteAt) canvasSelectionAnchorIndex = Math.max(0, safeDeleteAt - 1);
    else if (canvasSelectionAnchorIndex > safeDeleteAt) canvasSelectionAnchorIndex -= 1;
    normalizeCanvasPageSelections({ ensureCurrent: true });
}

function remapCanvasPageIndexForMove(index, fromIndex, toIndex) {
    const idx = parseInt(index, 10);
    const from = parseInt(fromIndex, 10);
    const to = parseInt(toIndex, 10);
    if (!Number.isInteger(idx) || !Number.isInteger(from) || !Number.isInteger(to)) return idx;
    if (idx === from) return to;
    if (from < to) {
        if (idx > from && idx <= to) return idx - 1;
        return idx;
    }
    if (from > to) {
        if (idx >= to && idx < from) return idx + 1;
        return idx;
    }
    return idx;
}

function createPageRectPayload(width = DEFAULT_PAGE_WIDTH, height = DEFAULT_PAGE_HEIGHT) {
    return {
        type: 'rect',
        version: '5.3.0',
        originX: 'left',
        originY: 'top',
        left: 0,
        top: 0,
        width,
        height,
        fill: '#ffffff',
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
    };
}

function createBlankPageState(index = 0, width = DEFAULT_PAGE_WIDTH, height = DEFAULT_PAGE_HEIGHT) {
    return {
        id: createUid('page'),
        title: `Page ${index + 1}`,
        width,
        height,
        canvas: {
            version: '5.3.0',
            background: 'transparent',
            objects: [createPageRectPayload(width, height)]
        },
        bindings: []
    };
}

const VALID_ORIGIN_X = new Set(['left', 'center', 'right']);
const VALID_ORIGIN_Y = new Set(['top', 'center', 'bottom']);
const VALID_TEXT_BASELINES = new Set(['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom']);
const VALID_TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);
const TEXT_CURVE_MIN = -100;
const TEXT_CURVE_MAX = 100;
const TEXT_CURVE_EPSILON = 0.001;
const TEXT_CURVE_MIN_SPAN_RAD = Math.PI / 36;

function normalizeNumeric(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

function clampTextCurveAmount(value) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(TEXT_CURVE_MIN, Math.min(TEXT_CURVE_MAX, parsed));
}

function toSingleLineCurveText(value) {
    return String(value ?? '').replace(/\r?\n+/g, ' ');
}

function measureTextboxSingleLineWidth(textbox, value) {
    if (!textbox || textbox.type !== 'textbox') return 0;
    const text = toSingleLineCurveText(value ?? textbox.text);
    if (!text) return 0;

    try {
        const probe = new fabric.Text(text, {
            fontFamily: textbox.fontFamily,
            fontSize: textbox.fontSize,
            fontWeight: textbox.fontWeight,
            fontStyle: textbox.fontStyle,
            charSpacing: textbox.charSpacing,
            stroke: textbox.stroke,
            strokeWidth: textbox.strokeWidth
        });
        const measured = parseFloat(probe.width);
        if (Number.isFinite(measured) && measured > 0) return measured;
    } catch (_) { }

    return 0;
}

function getTextboxCurveTextLength(textbox, value = null) {
    if (!textbox || textbox.type !== 'textbox') return 0;
    const measuredSingleLine = measureTextboxSingleLineWidth(textbox, value);
    if (measuredSingleLine > 0) return measuredSingleLine;

    if (typeof textbox.calcTextWidth === 'function') {
        const measured = parseFloat(textbox.calcTextWidth());
        if (Number.isFinite(measured) && measured > 0) return measured;
    }

    const lines = Array.isArray(textbox.textLines) ? textbox.textLines : [];
    if (lines.length && typeof textbox.getLineWidth === 'function') {
        const widths = lines
            .map((_, index) => parseFloat(textbox.getLineWidth(index)))
            .filter(width => Number.isFinite(width) && width > 0);
        if (widths.length) return Math.max(...widths);
    }

    const text = String(textbox.text || '');
    const fontSize = Math.max(8, parseFloat(textbox.fontSize) || 24);
    return Math.max(fontSize, text.length * fontSize * 0.58);
}

function buildTextboxCurvePathData(radius, curveAmount) {
    const amount = clampTextCurveAmount(curveAmount);
    const absAmount = Math.abs(amount);
    const sweepFlag = amount >= 0 ? 1 : 0;
    const span = Math.max(
        TEXT_CURVE_MIN_SPAN_RAD,
        Math.min(Math.PI * 2, (absAmount / TEXT_CURVE_MAX) * Math.PI * 2)
    );

    if (span >= (Math.PI * 2 - 0.0001)) {
        return `M 0 ${-radius} A ${radius} ${radius} 0 1 ${sweepFlag} 0 ${radius} A ${radius} ${radius} 0 1 ${sweepFlag} 0 ${-radius}`;
    }

    const midpoint = amount >= 0 ? -Math.PI / 2 : Math.PI / 2;
    const isNegativeCurve = amount < 0;
    const startAngle = isNegativeCurve ? (midpoint + span / 2) : (midpoint - span / 2);
    const endAngle = isNegativeCurve ? (midpoint - span / 2) : (midpoint + span / 2);
    const startX = radius * Math.cos(startAngle);
    const startY = radius * Math.sin(startAngle);
    const endX = radius * Math.cos(endAngle);
    const endY = radius * Math.sin(endAngle);
    const largeArcFlag = span > Math.PI ? 1 : 0;
    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}

function clearTextboxCurvePath(textbox, { skipRender = false } = {}) {
    if (!textbox || textbox.type !== 'textbox') return false;
    const hadPath = !!textbox.path;
    textbox.set({
        path: null,
        pathAlign: 'baseline',
        pathSide: 'left',
        pathStartOffset: 0
    });
    if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
    if (typeof textbox.setCoords === 'function') textbox.setCoords();
    if (!skipRender) (textbox.canvas || canvas)?.requestRenderAll();
    return hadPath;
}

function setTextboxCurve(textbox, curveAmount, { skipRender = false } = {}) {
    if (!textbox || textbox.type !== 'textbox') return false;
    const nextAmount = clampTextCurveAmount(curveAmount);
    textbox.curveAmount = nextAmount;

    const singleLineText = toSingleLineCurveText(textbox.text);
    if (singleLineText !== String(textbox.text || '')) {
        textbox.set({ text: singleLineText });
    }

    const content = String(textbox.text || '').trim();
    if (!content || Math.abs(nextAmount) <= TEXT_CURVE_EPSILON) {
        return clearTextboxCurvePath(textbox, { skipRender });
    }

    const singleLineWidth = measureTextboxSingleLineWidth(textbox, textbox.text);
    if (singleLineWidth > 0) {
        const minNoWrapWidth = Math.max(24, Math.ceil(singleLineWidth + 2));
        if (!Number.isFinite(parseFloat(textbox.width)) || parseFloat(textbox.width) < minNoWrapWidth) {
            textbox.set({ width: minNoWrapWidth });
        }
    }

    const span = Math.max(
        TEXT_CURVE_MIN_SPAN_RAD,
        Math.min(Math.PI * 2, (Math.abs(nextAmount) / TEXT_CURVE_MAX) * Math.PI * 2)
    );
    const textLength = Math.max(10, getTextboxCurveTextLength(textbox, textbox.text));
    const fontSize = Math.max(8, parseFloat(textbox.fontSize) || 24);
    const radius = Math.max(fontSize * 0.9, textLength / span);
    const curvePath = new fabric.Path(buildTextboxCurvePathData(radius, nextAmount), {
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        visible: false,
        evented: false,
        selectable: false,
        fill: null,
        stroke: null
    });

    textbox.set({
        path: curvePath,
        pathAlign: 'center',
        pathSide: 'left',
        pathStartOffset: 0
    });
    if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
    if (typeof textbox.setCoords === 'function') textbox.setCoords();
    if (!skipRender) (textbox.canvas || canvas)?.requestRenderAll();
    return true;
}

function refreshTextboxCurve(textbox, options = {}) {
    if (!textbox || textbox.type !== 'textbox') return false;
    const current = clampTextCurveAmount(textbox.curveAmount);
    textbox.curveAmount = current;
    return setTextboxCurve(textbox, current, options);
}

function isValidTextboxPathObject(path) {
    return !!path
        && typeof path.toObject === 'function'
        && typeof path.isNotVisible === 'function';
}

function normalizeTextboxCurvePathObject(textbox, { skipRender = true } = {}) {
    if (!textbox || textbox.type !== 'textbox') return false;
    const curveAmount = clampTextCurveAmount(textbox.curveAmount);
    textbox.curveAmount = curveAmount;

    const hasCurve = Math.abs(curveAmount) > TEXT_CURVE_EPSILON;
    const hasPath = !!textbox.path;
    const hasValidPathObject = hasPath && isValidTextboxPathObject(textbox.path);
    const needsCurveRefresh = hasCurve && !hasValidPathObject;
    const needsPathClear = !hasCurve && hasPath;
    if (!needsCurveRefresh && !needsPathClear) return false;

    try {
        if (needsCurveRefresh) return refreshTextboxCurve(textbox, { skipRender });
        return clearTextboxCurvePath(textbox, { skipRender });
    } catch (error) {
        console.warn('Failed to normalize textbox curve path:', error);
        textbox.set({
            path: null,
            pathAlign: 'baseline',
            pathSide: 'left',
            pathStartOffset: 0
        });
        if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
        if (typeof textbox.setCoords === 'function') textbox.setCoords();
        if (!skipRender) (textbox.canvas || canvas)?.requestRenderAll();
        return true;
    }
}

function normalizeTextboxPathsForSerialization(rootObject = null) {
    const initial = rootObject
        ? [rootObject]
        : (typeof canvas?.getObjects === 'function' ? canvas.getObjects() : []);
    if (!initial.length) return false;

    const stack = [...initial];
    const visited = new Set();
    let changed = false;
    while (stack.length) {
        const obj = stack.pop();
        if (!obj || visited.has(obj)) continue;
        visited.add(obj);

        if (obj.type === 'textbox' && normalizeTextboxCurvePathObject(obj, { skipRender: true })) {
            changed = true;
        }

        if (typeof obj.getObjects === 'function') {
            const children = obj.getObjects();
            if (Array.isArray(children) && children.length) {
                children.forEach(child => stack.push(child));
            }
        }
    }

    return changed;
}

function repairLiveCanvasTextObjectsForSerialization(rootObject = null) {
    const initial = rootObject
        ? [rootObject]
        : (typeof canvas?.getObjects === 'function' ? canvas.getObjects() : []);
    if (!initial.length) return false;

    const stack = [...initial];
    const visited = new Set();
    let changed = false;

    while (stack.length) {
        const obj = stack.pop();
        if (!obj || visited.has(obj)) continue;
        visited.add(obj);

        const isTextLike = obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text';
        if (isTextLike) {
            const patch = {};
            if (typeof obj.text !== 'string') patch.text = String(obj.text ?? '');
            const currentFontSize = normalizeNumeric(obj.fontSize, 24);
            if (!Number.isFinite(currentFontSize) || currentFontSize <= 0) patch.fontSize = 24;
            const currentWidth = normalizeNumeric(obj.width, 240);
            if (!Number.isFinite(currentWidth) || currentWidth <= 0) patch.width = 240;
            if (!Array.isArray(obj.styles)) patch.styles = [];
            const baseline = typeof obj.textBaseline === 'string'
                ? obj.textBaseline.toLowerCase()
                : 'alphabetic';
            if (obj.textBaseline != null && !VALID_TEXT_BASELINES.has(baseline)) {
                patch.textBaseline = 'alphabetic';
            }
            const sx = normalizeNumeric(obj.scaleX, 1) || 1;
            const sy = normalizeNumeric(obj.scaleY, 1) || 1;
            if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
                patch.width = Math.max(120, normalizeNumeric(obj.width, 240) * Math.abs(sx));
                patch.fontSize = Math.max(8, normalizeNumeric(obj.fontSize, 24) * Math.abs(sy));
                patch.scaleX = 1;
                patch.scaleY = 1;
            }
            if (Object.keys(patch).length) {
                obj.set(patch);
                if (typeof obj.initDimensions === 'function') obj.initDimensions();
                if (typeof obj.setCoords === 'function') obj.setCoords();
                changed = true;
            }
        }

        if (typeof obj.getObjects === 'function') {
            const children = obj.getObjects();
            if (Array.isArray(children) && children.length) {
                children.forEach(child => stack.push(child));
            }
        }
    }

    return changed;
}

function sanitizeCanvasObject(rawObject, { pageWidth = DEFAULT_PAGE_WIDTH, pageHeight = DEFAULT_PAGE_HEIGHT, depth = 0 } = {}) {
    if (!rawObject || typeof rawObject !== 'object') return null;
    const obj = { ...rawObject };

    if (!VALID_ORIGIN_X.has(obj.originX)) obj.originX = 'left';
    if (!VALID_ORIGIN_Y.has(obj.originY)) obj.originY = 'top';
    obj.left = normalizeNumeric(obj.left, pageWidth / 2);
    obj.top = normalizeNumeric(obj.top, pageHeight / 2);
    obj.scaleX = normalizeNumeric(obj.scaleX, 1) || 1;
    obj.scaleY = normalizeNumeric(obj.scaleY, 1) || 1;
    obj.angle = normalizeNumeric(obj.angle, 0);

    if (Array.isArray(obj.objects)) {
        obj.objects = obj.objects
            .map(child => sanitizeCanvasObject(child, { pageWidth, pageHeight, depth: depth + 1 }))
            .filter(Boolean);
    }

    if (obj.oid === 'pageRect' || obj.isArtboard) {
        obj.oid = 'pageRect';
        obj.isArtboard = true;
        obj.originX = 'left';
        obj.originY = 'top';
        obj.left = 0;
        obj.top = 0;
        obj.width = parsePositiveInt(Math.round(normalizeNumeric(obj.width, pageWidth)), pageWidth);
        obj.height = parsePositiveInt(Math.round(normalizeNumeric(obj.height, pageHeight)), pageHeight);
        obj.selectable = false;
        obj.evented = false;
        obj.hasControls = false;
        obj.hasBorders = false;
        obj.lockMovementX = true;
        obj.lockMovementY = true;
        obj.lockScalingX = true;
        obj.lockScalingY = true;
        obj.lockRotation = true;
    } else {
        if (depth === 0) {
            const isLocked = !!obj.locked;
            obj.locked = isLocked;
            obj.selectable = !isLocked;
            obj.evented = !isLocked;
            obj.hasControls = !isLocked;
            obj.hasBorders = !isLocked;
            obj.lockMovementX = isLocked;
            obj.lockMovementY = isLocked;
            obj.lockScalingX = isLocked;
            obj.lockScalingY = isLocked;
            obj.lockRotation = isLocked;
        }
    }

    // Prevent accidental clipping/teleporting from AI-generated transforms.
    if (obj.clipPath) delete obj.clipPath;
    if (obj.transformMatrix) delete obj.transformMatrix;

    const isTextLike = obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text';
    if (isTextLike) {
        obj.type = 'textbox';
        if (typeof obj.text !== 'string') obj.text = String(obj.text ?? '');
        if (!Number.isFinite(parseFloat(obj.fontSize)) || parseFloat(obj.fontSize) <= 0) obj.fontSize = 24;
        if (!obj.fontFamily || typeof obj.fontFamily !== 'string') obj.fontFamily = 'Arial';
        const align = String(obj.textAlign || 'left').toLowerCase();
        obj.textAlign = VALID_TEXT_ALIGNS.has(align) ? align : 'left';
        if (!Number.isFinite(parseFloat(obj.lineHeight)) || parseFloat(obj.lineHeight) <= 0) obj.lineHeight = 1.16;
        if (!Number.isFinite(parseFloat(obj.charSpacing))) obj.charSpacing = 0;
        obj.splitByGrapheme = !!obj.splitByGrapheme;
        if (obj.minWidth == null || !Number.isFinite(parseFloat(obj.minWidth)) || parseFloat(obj.minWidth) < 20) {
            obj.minWidth = 20;
        }
        if (!Array.isArray(obj.styles)) obj.styles = [];

        if (typeof obj.textBaseline === 'string') {
            const baseline = obj.textBaseline.toLowerCase();
            obj.textBaseline = VALID_TEXT_BASELINES.has(baseline) ? baseline : 'alphabetic';
        } else if (obj.textBaseline != null) {
            obj.textBaseline = 'alphabetic';
        }

        const sx = Math.abs(normalizeNumeric(obj.scaleX, 1) || 1);
        const sy = Math.abs(normalizeNumeric(obj.scaleY, 1) || 1);
        const baseWidth = Math.max(120, normalizeNumeric(obj.width, 260));
        const normalizedWidth = Math.min(pageWidth * 0.95, Math.max(120, baseWidth * sx));
        const normalizedFontSize = Math.max(8, normalizeNumeric(obj.fontSize, 24) * sy);
        obj.width = normalizedWidth;
        obj.fontSize = normalizedFontSize;
        obj.scaleX = 1;
        obj.scaleY = 1;

        obj.curveAmount = clampTextCurveAmount(obj.curveAmount);
        if (obj.path) delete obj.path;
        obj.padding = 0;
        if (obj.lockUniScaling == null) obj.lockUniScaling = true;
    }

    if (obj.type === 'path' || obj.isSvgGroup || obj.type === 'group') {
        obj.objectCaching = false;
    }

    return obj;
}

function sanitizeCanvasStateForEditor(rawCanvas, { pageWidth = DEFAULT_PAGE_WIDTH, pageHeight = DEFAULT_PAGE_HEIGHT } = {}) {
    const canvasState = (rawCanvas && typeof rawCanvas === 'object') ? { ...rawCanvas } : { version: '5.3.0', background: 'transparent', objects: [] };
    if (!Array.isArray(canvasState.objects)) canvasState.objects = [];
    canvasState.version = canvasState.version || '5.3.0';
    canvasState.background = 'transparent';

    const sanitizedObjects = canvasState.objects
        .map(obj => sanitizeCanvasObject(obj, { pageWidth, pageHeight }))
        .filter(Boolean);

    let pageRectObj = sanitizedObjects.find(obj => obj.oid === 'pageRect');
    if (!pageRectObj) {
        pageRectObj = createPageRectPayload(pageWidth, pageHeight);
    } else {
        pageRectObj.width = pageWidth;
        pageRectObj.height = pageHeight;
        pageRectObj.left = 0;
        pageRectObj.top = 0;
        pageRectObj.originX = 'left';
        pageRectObj.originY = 'top';
        pageRectObj.selectable = false;
        pageRectObj.evented = false;
        pageRectObj.hasControls = false;
        pageRectObj.hasBorders = false;
        pageRectObj.lockMovementX = true;
        pageRectObj.lockMovementY = true;
        pageRectObj.lockScalingX = true;
        pageRectObj.lockScalingY = true;
        pageRectObj.lockRotation = true;
        pageRectObj.isArtboard = true;
        pageRectObj.oid = 'pageRect';
    }

    canvasState.objects = [pageRectObj, ...sanitizedObjects.filter(obj => obj.oid !== 'pageRect')];
    return canvasState;
}

function sanitizeBindingsEntries(rawBindings) {
    if (!Array.isArray(rawBindings)) return [];
    return rawBindings
        .filter(entry => Array.isArray(entry) && entry.length === 2)
        .map(([oid, bindingList]) => {
            const safeOid = String(oid || '').trim();
            if (!safeOid) return null;
            const safeBindings = Array.isArray(bindingList)
                ? bindingList
                    .filter(b => b && typeof b === 'object')
                    .map(b => {
                        const property = String(b.property || '').trim();
                        const column = String(b.column || '').trim();
                        if (!property) return null;
                        const next = { ...b, property, column };
                        if (property === 'Cell Text') {
                            next.cellIndex = Number.isFinite(parseInt(next.cellIndex, 10)) ? parseInt(next.cellIndex, 10) : 0;
                        } else {
                            delete next.cellIndex;
                        }
                        return next;
                    })
                    .filter(Boolean)
                : [];
            return [safeOid, safeBindings];
        })
        .filter(Boolean);
}

function lineEndpointPositionHandler(dim, finalMatrix, fabricObject, currentControl) {
    if (!fabricObject || fabricObject.type !== 'line') return new fabric.Point(0, 0);
    const pointKey = currentControl?.pointKey || this?.pointKey || 'end';
    const canvasPoint = getLineCanvasPoint(fabricObject, pointKey);
    if (!canvasPoint) return new fabric.Point(0, 0);
    return fabric.util.transformPoint(
        canvasPoint,
        fabricObject.canvas?.viewportTransform || [1, 0, 0, 1, 0, 0]
    );
}

function getLineLocalPoint(line, pointKey) {
    if (!line || line.type !== 'line') return null;
    if (typeof line.calcLinePoints === 'function') {
        const points = line.calcLinePoints();
        if (
            points &&
            Number.isFinite(points.x1) &&
            Number.isFinite(points.y1) &&
            Number.isFinite(points.x2) &&
            Number.isFinite(points.y2)
        ) {
            return pointKey === 'start'
                ? new fabric.Point(points.x1, points.y1)
                : new fabric.Point(points.x2, points.y2);
        }
    }

    const x1 = Number.isFinite(line.x1) ? line.x1 : 0;
    const y1 = Number.isFinite(line.y1) ? line.y1 : 0;
    const x2 = Number.isFinite(line.x2) ? line.x2 : x1;
    const y2 = Number.isFinite(line.y2) ? line.y2 : y1;
    const pathOffset = line.pathOffset || { x: 0, y: 0 };
    const offsetX = Number.isFinite(pathOffset.x) ? pathOffset.x : 0;
    const offsetY = Number.isFinite(pathOffset.y) ? pathOffset.y : 0;
    return pointKey === 'start'
        ? new fabric.Point(x1 - offsetX, y1 - offsetY)
        : new fabric.Point(x2 - offsetX, y2 - offsetY);
}

function getLineCanvasPoint(line, pointKey) {
    if (!line || line.type !== 'line') return null;
    const localPoint = getLineLocalPoint(line, pointKey);
    if (!localPoint) return null;
    const matrix = line.calcTransformMatrix();
    return fabric.util.transformPoint(localPoint, matrix);
}

function normalizeLineFromCanvasEndpoints(line, startPoint, endPoint) {
    if (!line || line.type !== 'line') return false;
    if (!startPoint || !endPoint) return false;
    if (!Number.isFinite(startPoint.x) || !Number.isFinite(startPoint.y) || !Number.isFinite(endPoint.x) || !Number.isFinite(endPoint.y)) return false;

    const left = Math.min(startPoint.x, endPoint.x);
    const top = Math.min(startPoint.y, endPoint.y);
    const x1 = startPoint.x;
    const y1 = startPoint.y;
    const x2 = endPoint.x;
    const y2 = endPoint.y;

    line.set({
        originX: 'center',
        originY: 'center',
        angle: 0,
        scaleX: 1,
        scaleY: 1,
        x1,
        y1,
        x2,
        y2
    });

    if (typeof line._setWidthHeight === 'function') line._setWidthHeight();
    line.setCoords();
    return true;
}

function snapLineEndpoint(anchorPoint, pointerPoint, enableSnap = false) {
    if (!enableSnap) return pointerPoint;
    if (!anchorPoint || !pointerPoint) return pointerPoint;

    const dx = pointerPoint.x - anchorPoint.x;
    const dy = pointerPoint.y - anchorPoint.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return pointerPoint;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return pointerPoint;

    const candidates = [
        { x: dx, y: 0 },      // horizontal
        { x: 0, y: dy }       // vertical
    ];

    // slope +1 diagonal
    const t1 = (dx + dy) / 2;
    candidates.push({ x: t1, y: t1 });

    // slope -1 diagonal
    const t2 = (dx - dy) / 2;
    candidates.push({ x: t2, y: -t2 });

    let best = candidates[0];
    let bestDist = Infinity;
    for (const c of candidates) {
        const dist = (c.x - dx) * (c.x - dx) + (c.y - dy) * (c.y - dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = c;
        }
    }

    return new fabric.Point(anchorPoint.x + best.x, anchorPoint.y + best.y);
}

function lineEndpointActionHandler(eventData, transform, x, y) {
    const line = transform?.target;
    if (!line || line.type !== 'line') return false;

    const canvas = line.canvas;
    if (!canvas) return false;

    const control = line.controls?.[transform.corner];
    const pointKey = control?.pointKey === 'start' ? 'start' : 'end';
    const anchorKey = pointKey === 'start' ? 'end' : 'start';
    const anchorPoint = getLineCanvasPoint(line, anchorKey);
    if (!anchorPoint) return false;

    let pointerPoint = null;
    if (Number.isFinite(x) && Number.isFinite(y)) {
        pointerPoint = new fabric.Point(x, y);
    } else {
        const pointer = canvas.getPointer(eventData);
        pointerPoint = new fabric.Point(pointer.x, pointer.y);
    }
    if (!Number.isFinite(pointerPoint.x) || !Number.isFinite(pointerPoint.y)) return false;
    pointerPoint = snapLineEndpoint(anchorPoint, pointerPoint, !!eventData?.shiftKey);

    const startPoint = pointKey === 'start' ? pointerPoint : anchorPoint;
    const endPoint = pointKey === 'start' ? anchorPoint : pointerPoint;
    normalizeLineFromCanvasEndpoints(line, startPoint, endPoint);
    line._endpointDragDirty = true;
    if (typeof requestSaveState === 'function') requestSaveState();
    line.setCoords();
    canvas.requestRenderAll();
    return true;
}

const LINE_ENDPOINT_CONTROLS = {
    start: new fabric.Control({
        pointKey: 'start',
        positionHandler: lineEndpointPositionHandler,
        actionHandler: lineEndpointActionHandler,
        actionName: 'modifyLineEndpoint',
        cursorStyle: 'crosshair'
    }),
    end: new fabric.Control({
        pointKey: 'end',
        positionHandler: lineEndpointPositionHandler,
        actionHandler: lineEndpointActionHandler,
        actionName: 'modifyLineEndpoint',
        cursorStyle: 'crosshair'
    })
};

function applyLineEndpointControls(line) {
    if (!line || line.type !== 'line' || line.excludeFromExport || line.isSnapLine) return;
    let startPoint = getLineCanvasPoint(line, 'start');
    let endPoint = getLineCanvasPoint(line, 'end');
    if (!startPoint || !endPoint) {
        const center = (typeof line.getCenterPoint === 'function')
            ? line.getCenterPoint()
            : new fabric.Point(
                Number.isFinite(line.left) ? line.left : 0,
                Number.isFinite(line.top) ? line.top : 0
            );
        startPoint = new fabric.Point(center.x - 75, center.y);
        endPoint = new fabric.Point(center.x + 75, center.y);
    }
    if (Math.abs(startPoint.x - endPoint.x) < 0.0001 && Math.abs(startPoint.y - endPoint.y) < 0.0001) {
        endPoint = new fabric.Point(startPoint.x + 150, startPoint.y);
    }
    normalizeLineFromCanvasEndpoints(line, startPoint, endPoint);

    line.controls = LINE_ENDPOINT_CONTROLS;
    line.set({
        hasBorders: false,
        padding: 0,
        objectCaching: false,
        perPixelTargetFind: true
    });
    line.setCoords();
}

function applyLockStateToObject(obj) {
    if (!obj || obj.oid === 'pageRect' || obj.isArtboard) return;
    const isLocked = !!obj.locked;
    const isEditableLine = obj.type === 'line' && !obj.excludeFromExport && !obj.isSnapLine;
    obj.set({
        selectable: !isLocked,
        evented: !isLocked,
        hasControls: !isLocked,
        hasBorders: isEditableLine ? false : !isLocked,
        lockMovementX: isLocked,
        lockMovementY: isLocked,
        lockScalingX: isLocked,
        lockScalingY: isLocked,
        lockRotation: isLocked
    });
    if (isEditableLine && !isLocked) applyLineEndpointControls(obj);
}

function stabilizeObjectAfterLoad(obj) {
    if (!obj || obj.oid === 'pageRect' || obj.isArtboard) return;

    if (!Number.isFinite(obj.left) || !Number.isFinite(obj.top)) {
        const fallback = pageRect ? pageRect.getCenterPoint() : new fabric.Point(DEFAULT_PAGE_WIDTH / 2, DEFAULT_PAGE_HEIGHT / 2);
        obj.set({
            left: Number.isFinite(obj.left) ? obj.left : fallback.x,
            top: Number.isFinite(obj.top) ? obj.top : fallback.y
        });
    }
    if (!Number.isFinite(obj.scaleX) || obj.scaleX === 0) obj.scaleX = 1;
    if (!Number.isFinite(obj.scaleY) || obj.scaleY === 0) obj.scaleY = 1;

    if (obj.type === 'path') {
        obj.set({ objectCaching: false });
    }
    if (obj.type === 'line' && !obj.excludeFromExport && !obj.isSnapLine) {
        applyLineEndpointControls(obj);
    }
    if (obj.type === 'textbox') {
        obj.set({ padding: 0 });
        refreshTextboxCurve(obj, { skipRender: true });
    }

    if (obj.type === 'group' && !obj.isTable) {
        const center = obj.getCenterPoint();
        if (typeof obj.addWithUpdate === 'function') obj.addWithUpdate();
        obj.setPositionByOrigin(center, 'center', 'center');
        obj.set({ objectCaching: false });
    }

    if (obj.isSvgGroup && typeof obj.forEachObject === 'function') {
        obj.set({ objectCaching: false });
        obj.forEachObject(child => {
            if (!child) return;
            child.set({ objectCaching: false });
        });
    }

    applyLockStateToObject(obj);
    obj.setCoords();
}

function ensurePageRectInCanvasState(pageState) {
    if (!pageState.canvas || typeof pageState.canvas !== 'object') {
        pageState.canvas = { version: '5.3.0', background: 'transparent', objects: [] };
    }
    if (!Array.isArray(pageState.canvas.objects)) pageState.canvas.objects = [];
    let pr = pageState.canvas.objects.find(o => o && o.oid === 'pageRect');
    if (!pr) {
        pr = createPageRectPayload(pageState.width, pageState.height);
        pageState.canvas.objects.unshift(pr);
    } else {
        pr.width = pageState.width;
        pr.height = pageState.height;
        pr.oid = 'pageRect';
        pr.isArtboard = true;
        pr.selectable = false;
        pr.evented = false;
        pr.hasControls = false;
        pr.hasBorders = false;
        pr.lockMovementX = true;
        pr.lockMovementY = true;
        pr.lockScalingX = true;
        pr.lockScalingY = true;
        pr.lockRotation = true;
        if (pr.stroke == null) pr.stroke = 'rgba(0,0,0,0.25)';
        if (pr.strokeWidth == null) pr.strokeWidth = 1;
    }
    pageState.canvas = sanitizeCanvasStateForEditor(pageState.canvas, {
        pageWidth: pageState.width,
        pageHeight: pageState.height
    });
}

function assignPageIdToCanvasObjects(pageState) {
    if (!pageState || !pageState.id || !pageState.canvas || !Array.isArray(pageState.canvas.objects)) return;
    const pageId = pageState.id;
    const visit = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.oid !== 'pageRect' && !obj.isArtboard) obj.pageId = pageId;
        if (Array.isArray(obj.objects)) obj.objects.forEach(visit);
    };
    pageState.canvas.objects.forEach(visit);
}

function ensureDocumentPagesIntegrity() {
    if (!Array.isArray(documentPages) || !documentPages.length) {
        documentPages = [createBlankPageState(0, generalPageSize.width, generalPageSize.height)];
        currentPageIndex = 0;
        setCanvasPageSelection([0], { ensureCurrent: false });
        canvasSelectionAnchorIndex = 0;
        return;
    }

    documentPages = documentPages.map((page, index) => {
        if (!page || typeof page !== 'object') {
            return createBlankPageState(index, generalPageSize.width, generalPageSize.height);
        }
        page.id = page.id || createUid('page');
        page.width = parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH);
        page.height = parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT);
        ensurePageRectInCanvasState(page);
        assignPageIdToCanvasObjects(page);
        return page;
    });

    currentPageIndex = Math.max(0, Math.min(documentPages.length - 1, parseInt(currentPageIndex, 10) || 0));
    normalizeCanvasPageSelections({ ensureCurrent: true });
}

function normalizePageState(rawPage = {}, index = 0) {
    const width = parsePositiveInt(rawPage.width ?? rawPage.page?.width, DEFAULT_PAGE_WIDTH);
    const height = parsePositiveInt(rawPage.height ?? rawPage.page?.height, DEFAULT_PAGE_HEIGHT);
    const pageState = {
        id: rawPage.id || createUid('page'),
        title: rawPage.title || `Page ${index + 1}`,
        width,
        height,
        canvas: sanitizeCanvasStateForEditor(rawPage.canvas || { version: '5.3.0', background: 'transparent', objects: [] }, { pageWidth: width, pageHeight: height }),
        bindings: sanitizeBindingsEntries(rawPage.bindings)
    };
    ensurePageRectInCanvasState(pageState);
    assignPageIdToCanvasObjects(pageState);
    return pageState;
}

function normalizeTemplatePages(templateData = {}) {
    if (Array.isArray(templateData.pages) && templateData.pages.length > 0) {
        const rootBindings = Array.isArray(templateData.bindings) ? templateData.bindings : [];
        const pages = templateData.pages.map((p, i) => normalizePageState({
            ...p,
            bindings: Array.isArray(p?.bindings) ? p.bindings : (i === 0 ? rootBindings : [])
        }, i));
        const selectedIndex = Math.min(
            pages.length - 1,
            Math.max(0, parseInt(templateData.currentPageIndex, 10) || 0)
        );
        return { pages, selectedIndex };
    }

    const width = parsePositiveInt(templateData.page?.width, DEFAULT_PAGE_WIDTH);
    const height = parsePositiveInt(templateData.page?.height, DEFAULT_PAGE_HEIGHT);
    const page = normalizePageState({
        id: createUid('page'),
        title: templateData.page?.title || 'Page 1',
        width,
        height,
        canvas: templateData.canvas,
        bindings: templateData.bindings
    }, 0);
    return { pages: [page], selectedIndex: 0 };
}

function getMostCommonPageSize() {
    if (!Array.isArray(documentPages) || documentPages.length === 0) {
        return { width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT };
    }

    const counts = new Map();
    documentPages.forEach(page => {
        const w = parsePositiveInt(page?.width, DEFAULT_PAGE_WIDTH);
        const h = parsePositiveInt(page?.height, DEFAULT_PAGE_HEIGHT);
        const key = `${w}x${h}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    let bestKey = `${DEFAULT_PAGE_WIDTH}x${DEFAULT_PAGE_HEIGHT}`;
    let bestCount = -1;
    counts.forEach((count, key) => {
        if (count > bestCount) {
            bestCount = count;
            bestKey = key;
        }
    });

    const [w, h] = bestKey.split('x').map(v => parseInt(v, 10));
    return {
        width: parsePositiveInt(w, DEFAULT_PAGE_WIDTH),
        height: parsePositiveInt(h, DEFAULT_PAGE_HEIGHT)
    };
}

function syncGeneralPageSizeInputs() {
    const widthInput = $('#pageWidth');
    const heightInput = $('#pageHeight');
    if (widthInput && document.activeElement !== widthInput) {
        widthInput.value = generalPageSize.width;
    }
    if (heightInput && document.activeElement !== heightInput) {
        heightInput.value = generalPageSize.height;
    }
}

function applyCanvasPagesPanelState() {
    if (!canvasPagesPanel || !toggleCanvasPagesPanelBtn) return;
    canvasPagesPanel.classList.toggle('collapsed', isCanvasPagesPanelCollapsed);
    const stateLabel = toggleCanvasPagesPanelBtn.querySelector('.state');
    if (stateLabel) stateLabel.textContent = isCanvasPagesPanelCollapsed ? 'Show' : '';
    toggleCanvasPagesPanelBtn.setAttribute('aria-expanded', String(!isCanvasPagesPanelCollapsed));
    toggleCanvasPagesPanelBtn.setAttribute('aria-disabled', 'false');
    toggleCanvasPagesPanelBtn.setAttribute('title', isCanvasPagesPanelCollapsed ? 'Show pages panel' : 'Hide pages panel');
    if (hideCanvasPagesPanelBtn) {
        hideCanvasPagesPanelBtn.textContent = isCanvasPagesPanelCollapsed ? 'Show' : 'Hide';
        hideCanvasPagesPanelBtn.setAttribute('title', isCanvasPagesPanelCollapsed ? 'Show pages panel' : 'Hide pages panel');
    }
    localStorage.setItem(PAGE_STRIP_COLLAPSE_KEY, isCanvasPagesPanelCollapsed ? '1' : '0');
    refreshCanvasSize();
}

function beginCanvasSwitchTransition() {
    if (!canvasEditorStage) return () => { };
    canvasEditorStage.classList.add('page-switching');
    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        requestAnimationFrame(() => canvasEditorStage.classList.remove('page-switching'));
    };
}

function iconSvg(kind) {
    const icons = {
        add: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
        duplicate: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>',
        delete: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
    };
    return icons[kind] || '';
}

function getPageLayoutLeft(pageIndex) {
    let left = 0;
    for (let i = 0; i < pageIndex; i++) {
        const width = parsePositiveInt(documentPages[i]?.width, DEFAULT_PAGE_WIDTH);
        left += width + PAGE_SIDE_GAP;
    }
    return left;
}

function getPageBounds(pageIndex) {
    const page = documentPages[pageIndex];
    if (!page) return null;
    const width = parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH);
    const height = parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT);
    const left = getPageLayoutLeft(pageIndex);
    const top = 0;
    return {
        pageIndex,
        pageId: page.id,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    };
}

function buildCanvasMaskRect(left, top, width, height) {
    return new fabric.Rect({
        left,
        top,
        originX: 'left',
        originY: 'top',
        width,
        height,
        absolutePositioned: true,
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        excludeFromExport: true,
        isCanvasMask: true
    });
}

function applyObjectMaskRect(obj, { left, top, width, height }, options = {}) {
    const force = options.force === true;
    if (!obj) return;
    if (!force && (obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isArtboard)) return;
    obj.clipPath = buildCanvasMaskRect(left, top, width, height);
    obj.dirty = true;
    if (typeof obj.setCoords === 'function') obj.setCoords();
}

function applyObjectMaskForPage(obj, pageIndex) {
    const bounds = getPageBounds(pageIndex);
    if (!bounds) return;
    applyObjectMaskRect(obj, bounds);
}

function applyCanvasMaskToActivePageObjects() {
    if (!canvas || !pageRect) return;
    canvas.getObjects().forEach(obj => {
        if (!obj || obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isCanvasGhost || obj.isArtboard) return;
        applyObjectMaskForPage(obj, currentPageIndex);
    });
}

function getObjectBoundsRect(obj) {
    if (!obj || typeof obj.getBoundingRect !== 'function') return null;
    obj.setCoords();
    const rect = obj.getBoundingRect(true, true);
    const width = normalizeNumeric(rect?.width, 0);
    const height = normalizeNumeric(rect?.height, 0);
    if (width <= 0 || height <= 0) return null;
    const left = normalizeNumeric(rect.left, 0);
    const top = normalizeNumeric(rect.top, 0);
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
    };
}

function getRectIntersectionArea(a, b) {
    if (!a || !b) return 0;
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
}

function isRectOverlappingBounds(rect, bounds, tolerance = 0.5) {
    if (!rect || !bounds) return false;
    return !(
        rect.right < (bounds.left - tolerance)
        || rect.left > (bounds.right + tolerance)
        || rect.bottom < (bounds.top - tolerance)
        || rect.top > (bounds.bottom + tolerance)
    );
}

function getObjectCoordsRect(obj) {
    if (!obj) return null;
    if (typeof obj.setCoords === 'function') obj.setCoords();

    // getBoundingRect(true) returns the bounding box in world (canvas) coordinates.
    // This is the most reliable way to check if an object is truly outside the canvas pages,
    // especially when it's part of a group or selection.
    const rect = obj.getBoundingRect(true, true);
    if (rect && rect.width > 0 && rect.height > 0) {
        return {
            left: rect.left,
            top: rect.top,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
            width: rect.width,
            height: rect.height
        };
    }

    // Fallback for objects without getBoundingRect but with getCoords
    let xs = [], ys = [];
    if (typeof obj.getCoords === 'function') {
        const points = obj.getCoords(true, true) || [];
        xs = points.map(p => normalizeNumeric(p?.x, NaN)).filter(Number.isFinite);
        ys = points.map(p => normalizeNumeric(p?.y, NaN)).filter(Number.isFinite);
    }

    if (!xs.length || !ys.length) return null;

    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    return {
        left,
        right,
        top,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
    };
}

function isPointInsideBounds(point, bounds, tolerance = 0.5) {
    if (!point || !bounds) return false;
    const x = normalizeNumeric(point.x, NaN);
    const y = normalizeNumeric(point.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= (bounds.left - tolerance)
        && x <= (bounds.right + tolerance)
        && y >= (bounds.top - tolerance)
        && y <= (bounds.bottom + tolerance);
}

function isObjectOutsideAllCanvasPages(obj) {
    if (!obj) return false;
    // Never remove core structural objects
    if (obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isArtboard || obj.isCanvasMask || obj.isCanvasGhost) return false;

    // If an object is currently part of a group (or ActiveSelection), its individual 
    // coordinates are relative. Skipping these prevents accidental removal during interaction.
    if (obj.group) return false;

    // NEVER remove the currently active object or any object in the active selection
    const active = canvas.getActiveObject();
    if (active === obj) return false;
    if (active && active.type === 'activeSelection' && typeof active.contains === 'function' && active.contains(obj)) return false;

    const objectRect = getObjectCoordsRect(obj);
    if (!objectRect) return false;

    // Check overlap with any page. If it overlaps even slightly, it's NOT "outside all".
    for (let index = 0; index < documentPages.length; index++) {
        const bounds = getPageBounds(index);
        if (!bounds) continue;
        if (isRectOverlappingBounds(objectRect, bounds)) return false;
    }

    // For extra precision (e.g. very thin rotated lines), check individual corners and center
    const center = (typeof obj.getCenterPoint === 'function') ? obj.getCenterPoint() : null;
    if (center) {
        for (let i = 0; i < documentPages.length; i++) {
            const bounds = getPageBounds(i);
            if (bounds && isPointInsideBounds(center, bounds)) return false;
        }
    }

    if (typeof obj.getCoords === 'function') {
        const points = obj.getCoords(true, true) || [];
        for (const point of points) {
            for (let i = 0; i < documentPages.length; i++) {
                const bounds = getPageBounds(i);
                if (bounds && isPointInsideBounds(point, bounds)) return false;
            }
        }
    }

    return true;
}

function getObjectsOutsideAllCanvasPages(target) {
    if (!target) return [];
    const candidates = target.type === 'activeSelection' && typeof target.getObjects === 'function'
        ? target.getObjects()
        : [target];
    return candidates
        .filter(Boolean)
        .filter(obj => isObjectOutsideAllCanvasPages(obj));
}

function removeObjectsOutsideAllCanvasPages(target, checkAll = false) {
    let candidates = [];
    if (checkAll) {
        candidates = canvas.getObjects().filter(o =>
            o && o.oid !== 'pageRect' && !o.excludeFromExport && !o.isArtboard && !o.isCanvasMask && !o.isSnapLine
        );
    } else if (target) {
        candidates = target.type === 'activeSelection' && typeof target.getObjects === 'function'
            ? target.getObjects()
            : [target];
    }

    const outsideObjects = candidates.filter(Boolean).filter(obj => isObjectOutsideAllCanvasPages(obj));
    if (!outsideObjects.length) return false;

    removeCanvasObjects(outsideObjects);
    return true;
}

const scheduleOutsideObjectsCleanup = debounce(() => {
    if (isPastingFromClipboard || isPageSwitching || isRenderingCanvasGhosts || isObjectInteractionActive) return;
    removeObjectsOutsideAllCanvasPages(null, true);
}, 140);

function getDominantPageForObject(obj, threshold = 0.5) {
    const objectRect = getObjectBoundsRect(obj);
    if (!objectRect) return { pageIndex: -1, ratio: 0 };
    const area = Math.max(1, objectRect.width * objectRect.height);

    let bestIndex = -1;
    let bestRatio = 0;
    documentPages.forEach((_, index) => {
        const bounds = getPageBounds(index);
        if (!bounds) return;
        const overlap = getRectIntersectionArea(objectRect, bounds);
        const ratio = overlap / area;
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
        }
    });

    if (bestRatio < threshold) return { pageIndex: -1, ratio: bestRatio };
    return { pageIndex: bestIndex, ratio: bestRatio };
}

function getBestOverlapPageForObject(obj, { excludePageIndex = -1 } = {}) {
    const objectRect = getObjectCoordsRect(obj);
    if (!objectRect) return { pageIndex: -1, area: 0, currentArea: 0 };

    let bestIndex = -1;
    let bestArea = 0;
    let currentArea = 0;
    documentPages.forEach((_, index) => {
        const bounds = getPageBounds(index);
        if (!bounds) return;
        const overlap = getRectIntersectionArea(objectRect, bounds);
        if (index === currentPageIndex) currentArea = overlap;
        if (index === excludePageIndex) return;
        if (overlap > bestArea) {
            bestArea = overlap;
            bestIndex = index;
        }
    });

    return {
        pageIndex: bestArea > 0 ? bestIndex : -1,
        area: bestArea,
        currentArea
    };
}

function sanitizeTransferredObjectState(objState) {
    if (!objState || typeof objState !== 'object') return objState;
    const next = { ...objState };
    if (next.clipPath) delete next.clipPath;
    if (next.transformMatrix) delete next.transformMatrix;
    if (Array.isArray(next.objects)) {
        next.objects = next.objects.map(child => sanitizeTransferredObjectState(child));
    }
    return next;
}

async function transferObjectToPage(obj, targetPageIndex) {
    if (!obj || isPageSwitching || isReassigningPageOwnership) return false;
    if (!documentPages[targetPageIndex] || targetPageIndex === currentPageIndex) return false;
    if (obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isArtboard || obj.isCanvasGhost) return false;

    const oid = obj.oid;
    const sourcePageIndex = currentPageIndex;
    const sourcePage = documentPages[sourcePageIndex];
    const targetPage = documentPages[targetPageIndex];
    if (!sourcePage || !targetPage) return false;

    syncCurrentPageStateFromCanvas();

    const sourceObjects = sourcePage.canvas?.objects || [];
    const sourceObjectIndex = sourceObjects.findIndex(item => item && item.oid === oid);
    if (sourceObjectIndex < 0) return false;

    const movedStateRaw = sourceObjects[sourceObjectIndex];
    sourceObjects.splice(sourceObjectIndex, 1);

    const movedState = sanitizeTransferredObjectState(deepClone(movedStateRaw));
    const sourcePageLeft = getPageLayoutLeft(sourcePageIndex);
    const targetPageLeft = getPageLayoutLeft(targetPageIndex);

    if (Number.isFinite(parseFloat(movedState.left))) {
        movedState.left = parseFloat(movedState.left) + sourcePageLeft - targetPageLeft;
    }
    if (Number.isFinite(parseFloat(movedState.top))) {
        movedState.top = parseFloat(movedState.top);
    }
    movedState.pageId = targetPage.id;

    if (!targetPage.canvas || !Array.isArray(targetPage.canvas.objects)) {
        targetPage.canvas = { version: '5.3.0', background: 'transparent', objects: [] };
    }
    targetPage.canvas.objects.push(movedState);
    ensurePageRectInCanvasState(sourcePage);
    ensurePageRectInCanvasState(targetPage);

    isReassigningPageOwnership = true;
    try {
        await switchToCanvasPage(targetPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
        const movedObject = canvas.getObjects().find(item => item && item.oid === oid && !item.isCanvasGhost);
        if (movedObject) {
            applyObjectMaskForPage(movedObject, currentPageIndex);
            canvas.setActiveObject(movedObject);
            refreshInspector({ target: movedObject });
            updateFloatingLinker(movedObject);
        } else {
            canvas.discardActiveObject();
            refreshInspector({ target: null });
            updateFloatingLinker(null);
        }
        canvas.requestRenderAll();
        renderLayers();
        refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
        requestSaveState();
    } finally {
        isReassigningPageOwnership = false;
    }
    return true;
}

async function maybeReassignObjectToDominantPage(target) {
    if (!target || isPageSwitching || isReassigningPageOwnership || isRenderingCanvasGhosts) return false;

    if (target.type === 'activeSelection') {
        const members = (typeof target.getObjects === 'function') ? target.getObjects().filter(o => o && o.oid !== 'pageRect') : [];
        if (!members.length) return false;
        if (members.some(member => member?.isCanvasGhost)) return false;

        const dominant = getDominantPageForObject(target, 0.5);
        let targetPageIndex = dominant.pageIndex;
        if (targetPageIndex < 0) {
            const fallback = getBestOverlapPageForObject(target, { excludePageIndex: currentPageIndex });
            if (fallback.pageIndex < 0 || fallback.currentArea > 0) return false;
            targetPageIndex = fallback.pageIndex;
        }
        if (targetPageIndex === currentPageIndex) return false;

        // Bulk transfer
        syncCurrentPageStateFromCanvas();
        const sourcePageIndex = currentPageIndex;
        const sourcePage = documentPages[sourcePageIndex];
        const targetPage = documentPages[targetPageIndex];
        if (!sourcePage || !targetPage) return false;

        const sourcePageLeft = getPageLayoutLeft(sourcePageIndex);
        const targetPageLeft = getPageLayoutLeft(targetPageIndex);

        // Transfer each member in documentPages state
        members.forEach(member => {
            const oid = member.oid;
            const sourceObjects = sourcePage.canvas?.objects || [];
            const idx = sourceObjects.findIndex(item => item && item.oid === oid);
            if (idx >= 0) {
                const raw = sourceObjects.splice(idx, 1)[0];
                const movedState = sanitizeTransferredObjectState(deepClone(raw));
                if (Number.isFinite(parseFloat(movedState.left))) {
                    movedState.left = parseFloat(movedState.left) + sourcePageLeft - targetPageLeft;
                }
                movedState.pageId = targetPage.id;
                if (!targetPage.canvas) targetPage.canvas = { objects: [] };
                if (!Array.isArray(targetPage.canvas.objects)) targetPage.canvas.objects = [];
                targetPage.canvas.objects.push(movedState);
            }
        });

        ensurePageRectInCanvasState(sourcePage);
        ensurePageRectInCanvasState(targetPage);

        isReassigningPageOwnership = true;
        try {
            await switchToCanvasPage(targetPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
            const newMembers = canvas.getObjects().filter(o => members.some(m => m.oid === o.oid));
            if (newMembers.length > 1) {
                const sel = new fabric.ActiveSelection(newMembers, { canvas });
                canvas.setActiveObject(sel);
            } else if (newMembers.length === 1) {
                canvas.setActiveObject(newMembers[0]);
            }
            canvas.requestRenderAll();
            renderLayers();
            refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
            requestSaveState();
        } finally {
            isReassigningPageOwnership = false;
        }
        return true;
    }

    const dominant = getDominantPageForObject(target, 0.5);
    let targetPageIndex = dominant.pageIndex;
    if (targetPageIndex < 0) {
        const fallback = getBestOverlapPageForObject(target, { excludePageIndex: currentPageIndex });
        if (fallback.pageIndex < 0 || fallback.currentArea > 0) return false;
        targetPageIndex = fallback.pageIndex;
    }
    if (targetPageIndex === currentPageIndex) return false;
    return transferObjectToPage(target, targetPageIndex);
}

function getWorkspaceObjectPageContext(target) {
    if (!target) return null;
    const fallbackOid = String(target.oid || '').trim();
    if (target.isCanvasGhost) {
        const byMeta = Number.isInteger(target.ghostSourcePageIndex) ? target.ghostSourcePageIndex : -1;
        const byPageId = pageIndexForPageId(target.pageId);
        const pageIndex = byMeta >= 0 ? byMeta : (byPageId >= 0 ? byPageId : currentPageIndex);
        const sourceOid = String(target.ghostSourceOid || fallbackOid).trim();
        return { pageIndex, sourceOid };
    }
    const byPageId = pageIndexForPageId(target.pageId);
    return {
        pageIndex: byPageId >= 0 ? byPageId : currentPageIndex,
        sourceOid: fallbackOid
    };
}

function serializeWorkspaceObjectForPageState(target, pageIndex, sourceOid) {
    const page = documentPages[pageIndex];
    if (!target || !page) return null;
    const safeSourceOid = String(sourceOid || target.oid || '').trim();
    if (!safeSourceOid) return null;

    normalizeTextboxPathsForSerialization(target);
    const raw = target.toObject(SERIALIZE_PROPS);
    raw.oid = safeSourceOid;
    raw.pageId = page.id;
    if (raw.clipPath) delete raw.clipPath;
    if (raw.excludeFromExport) delete raw.excludeFromExport;
    if (raw.isCanvasGhost) delete raw.isCanvasGhost;
    if (raw.ghostSourceOid) delete raw.ghostSourceOid;
    if (raw.ghostSourcePageIndex !== undefined) delete raw.ghostSourcePageIndex;
    if (raw.isCanvasMask) delete raw.isCanvasMask;

    const pageLeft = getPageLayoutLeft(pageIndex);
    if (Number.isFinite(parseFloat(raw.left))) raw.left = parseFloat(raw.left) - pageLeft;
    if (Number.isFinite(parseFloat(raw.top))) raw.top = parseFloat(raw.top);

    return sanitizeCanvasObject(raw, {
        pageWidth: parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH),
        pageHeight: parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT)
    });
}

function removeObjectFromPageState(pageIndex, sourceOid) {
    const page = documentPages[pageIndex];
    if (!page || !sourceOid) return false;
    if (!page.canvas || !Array.isArray(page.canvas.objects)) return false;
    const idx = page.canvas.objects.findIndex(obj => obj && obj.oid === sourceOid);
    if (idx < 0) return false;
    page.canvas.objects.splice(idx, 1);
    ensurePageRectInCanvasState(page);
    return true;
}

function upsertObjectInPageState(pageIndex, sourceOid, objectState) {
    const page = documentPages[pageIndex];
    if (!page || !sourceOid || !objectState) return false;
    if (!page.canvas || !Array.isArray(page.canvas.objects)) {
        page.canvas = { version: '5.3.0', background: 'transparent', objects: [] };
    }

    const idx = page.canvas.objects.findIndex(obj => obj && obj.oid === sourceOid);
    if (idx >= 0) page.canvas.objects[idx] = objectState;
    else page.canvas.objects.push(objectState);
    ensurePageRectInCanvasState(page);
    return true;
}

function commitGhostObjectModification(target, options = {}) {
    const context = getWorkspaceObjectPageContext(target);
    if (!context || !context.sourceOid) return { changed: false };
    const lockToSourcePage = options.lockToSourcePage === true;

    const dominant = lockToSourcePage ? { pageIndex: context.pageIndex } : getDominantPageForObject(target, 0.5);
    const targetPageIndex = dominant.pageIndex >= 0 ? dominant.pageIndex : context.pageIndex;
    if (!documentPages[targetPageIndex]) return { changed: false };

    const objectState = serializeWorkspaceObjectForPageState(target, targetPageIndex, context.sourceOid);
    if (!objectState) return { changed: false };

    const updatedTarget = upsertObjectInPageState(targetPageIndex, context.sourceOid, objectState);
    const moved = targetPageIndex !== context.pageIndex;
    const removedSource = moved ? removeObjectFromPageState(context.pageIndex, context.sourceOid) : false;

    if (moved) {
        target.pageId = documentPages[targetPageIndex]?.id || target.pageId;
        target.ghostSourcePageIndex = targetPageIndex;
        target.ghostSourceOid = context.sourceOid;
        applyObjectMaskForPage(target, targetPageIndex);
    }

    return {
        changed: updatedTarget || removedSource,
        moved,
        sourcePageIndex: context.pageIndex,
        targetPageIndex
    };
}

function commitGhostObjectRemoval(target) {
    if (isPageSwitching || isRenderingCanvasGhosts) return false;
    const context = getWorkspaceObjectPageContext(target);
    if (!context || !context.sourceOid) return false;
    return removeObjectFromPageState(context.pageIndex, context.sourceOid);
}

function initPageActionToolbar() {
    if (!pageActionToolbar) return;
    pageActionToolbar.innerHTML = `
                <button class="btn ghost icon-only" type="button" data-role="add" title="Add Page">${iconSvg('add')}</button>
                <button class="btn ghost icon-only" type="button" data-role="duplicate" title="Duplicate Page">${iconSvg('duplicate')}</button>
                <button class="btn ghost icon-only" type="button" data-role="delete" title="Delete Page">${iconSvg('delete')}</button>
            `;
    pageActionToolbar.querySelector('[data-role="add"]')?.addEventListener('click', () => {
        const current = documentPages[currentPageIndex];
        addCanvasPage(currentPageIndex + 1, { width: current?.width, height: current?.height });
    });
    pageActionToolbar.querySelector('[data-role="duplicate"]')?.addEventListener('click', () => {
        duplicateCanvasPage(currentPageIndex);
    });
    pageActionToolbar.querySelector('[data-role="delete"]')?.addEventListener('click', () => {
        deleteCanvasPage(currentPageIndex);
    });
}

function updatePageActionToolbarPosition() {
    if (!pageActionToolbar) return;
    if (!pageRect || !documentPages.length) {
        pageActionToolbar.classList.add('hidden');
        return;
    }

    pageActionToolbar.classList.remove('hidden');
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const stageRect = canvasEditorStage?.getBoundingClientRect();
    if (!stageRect) return;

    const zoomX = vpt[0] || 1;
    const zoomY = vpt[3] || 1;
    const screenLeft = pageRect.left * zoomX + vpt[4];
    const screenTop = pageRect.top * zoomY + vpt[5];
    const screenWidth = pageRect.width * zoomX;

    const toolbarWidth = pageActionToolbar.offsetWidth || 96;
    const toolbarHeight = pageActionToolbar.offsetHeight || 30;
    const x = screenLeft + screenWidth - toolbarWidth;
    const y = screenTop - toolbarHeight - 8;
    const clampedX = Math.max(8, Math.min(stageRect.width - toolbarWidth - 8, x));
    const clampedY = Math.max(8, Math.min(stageRect.height - toolbarHeight - 8, y));
    pageActionToolbar.style.transform = `translate(${Math.round(clampedX)}px, ${Math.round(clampedY)}px)`;
}

function styleActivePageRect() {
    if (!pageRect) return;
    const isLight = document.body.classList.contains('light-mode');
    pageRect.set({
        stroke: isLight ? 'rgba(37,99,235,0.9)' : 'rgba(59,130,246,0.95)',
        strokeWidth: 2
    });
}

function relocateActiveCanvasToLayout() {
    if (!pageRect) return;
    const targetLeft = getPageLayoutLeft(currentPageIndex);
    const targetTop = 0;
    const currentLeft = normalizeNumeric(pageRect.left, 0);
    const currentTop = normalizeNumeric(pageRect.top, 0);
    const dx = targetLeft - currentLeft;
    const dy = targetTop - currentTop;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    pageRect.set({ left: targetLeft, top: targetTop });
    pageRect.setCoords();
    canvas.getObjects().forEach(obj => {
        if (!obj || obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isCanvasGhost) return;
        obj.set({
            left: normalizeNumeric(obj.left, 0) + dx,
            top: normalizeNumeric(obj.top, 0) + dy
        });
        obj.setCoords();
    });
    applyCanvasMaskToActivePageObjects();
}

function clearCanvasGhostPages() {
    const ghosts = canvas.getObjects().filter(obj => obj?.isCanvasGhost);
    if (!ghosts.length) return;
    isRenderingCanvasGhosts = true;
    ghosts.forEach(obj => canvas.remove(obj));
    isRenderingCanvasGhosts = false;
}

function buildGhostHitOverlay(page, index, left, width, height) {
    const overlay = new fabric.Rect({
        left,
        top: 0,
        originX: 'left',
        originY: 'top',
        width,
        height,
        fill: 'rgba(0, 0, 0, 0.001)',
        stroke: 'rgba(100, 116, 139, 0.45)',
        strokeWidth: 1,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        excludeFromExport: true,
        isCanvasGhost: true,
        isArtboard: true,
        pageId: page.id,
        hoverCursor: 'pointer'
    });

    overlay.on('mousedown', async () => {
        if (isPageSwitching || index === currentPageIndex) return;
        await focusCanvasObjectFromWorkspace(index);
    });

    return overlay;
}

async function focusCanvasObjectFromWorkspace(pageIndex, sourceOid = null) {
    if (!documentPages[pageIndex]) return false;
    const switched = await switchToCanvasPage(pageIndex, { fitView: false });
    if (!switched) return false;

    let target = null;
    if (sourceOid) {
        target = canvas.getObjects().find(obj =>
            obj
            && !obj.isCanvasGhost
            && !obj.excludeFromExport
            && !obj.isSnapLine
            && !obj.isArtboard
            && obj.oid === sourceOid
        );
    }

    if (target) {
        canvas.setActiveObject(target);
        refreshInspector({ target });
        updateFloatingLinker(target);
    } else {
        canvas.discardActiveObject();
        updateFloatingLinker(null);
    }

    canvas.requestRenderAll();
    return true;
}

function resolveGhostCanvasFill(page) {
    const pageRectState = Array.isArray(page?.canvas?.objects)
        ? page.canvas.objects.find(obj => obj && obj.oid === 'pageRect')
        : null;
    const rawFill = typeof pageRectState?.fill === 'string' ? pageRectState.fill.trim() : '';
    const isTransparent = !rawFill
        || rawFill === 'transparent'
        || rawFill === 'none'
        || /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(\.0+)?\s*\)$/i.test(rawFill);
    if (!isTransparent) return rawFill;
    return document.body.classList.contains('light-mode')
        ? 'rgba(255, 255, 255, 0.92)'
        : 'rgba(248, 250, 252, 0.88)';
}

function buildGhostArtboard(page, left, width, height) {
    return new fabric.Rect({
        left,
        top: 0,
        originX: 'left',
        originY: 'top',
        width,
        height,
        fill: resolveGhostCanvasFill(page),
        stroke: 'rgba(148, 163, 184, 0.55)',
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        excludeFromExport: true,
        isCanvasGhost: true,
        isArtboard: true,
        pageId: page.id
    });
}

function prepareGhostObject(obj, offsetX, pageId, pageIndex, pageWidth, pageHeight) {
    if (!obj) return null;
    const left = normalizeNumeric(obj.left, 0) + offsetX;
    const top = normalizeNumeric(obj.top, 0);
    const sourceOid = String(obj.oid || obj.name || obj.type || 'obj');
    obj.set({
        left,
        top,
        selectable: true,
        evented: true,
        hasControls: false,
        hasBorders: false,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        excludeFromExport: true,
        isCanvasGhost: true,
        hoverCursor: 'move'
    });
    obj.oid = `ghost_${pageId}_${sourceOid}`;
    obj.pageId = pageId;
    obj.ghostSourceOid = sourceOid;
    obj.ghostSourcePageIndex = pageIndex;
    applyObjectMaskRect(obj, {
        left: offsetX,
        top: 0,
        width: pageWidth,
        height: pageHeight
    }, { force: true });
    let movedSinceMouseDown = false;
    obj.on('mousedown', () => { movedSinceMouseDown = false; });
    obj.on('moving', () => { movedSinceMouseDown = true; });
    obj.on('mouseup', async (evt) => {
        if (isPageSwitching || pageIndex === currentPageIndex) return;
        if (movedSinceMouseDown) return;
        if (evt?.e?.shiftKey || evt?.e?.ctrlKey || evt?.e?.metaKey) return;
        await focusCanvasObjectFromWorkspace(pageIndex, sourceOid);
    });

    if (obj.type === 'line') {
        obj.controls = {};
    }

    if (typeof obj.forEachObject === 'function') {
        obj.forEachObject(child => {
            if (!child) return;
            child.selectable = false;
            child.evented = false;
            child.excludeFromExport = true;
            child.isCanvasGhost = true;
            child.oid = `ghost_${pageId}_${String(child.oid || child.name || child.type || 'child')}`;
            child.pageId = pageId;
        });
    }

    if (obj.isTable) {
        try {
            ensureTableCellData(obj);
            updateTableLayout(obj);
        } catch (error) {
            console.warn('Failed to prepare ghost table:', error);
        }
    }

    if (typeof obj.setCoords === 'function') obj.setCoords();
    return obj;
}

function renderCanvasGhostPages() {
    if (!canvas || !pageRect || !Array.isArray(documentPages)) return;
    const renderToken = ++ghostRenderVersion;
    clearCanvasGhostPages();
    if (documentPages.length <= 1) {
        canvas.sendToBack(pageRect);
        canvas.requestRenderAll();
        return;
    }

    const ghostTasks = documentPages.map((page, index) => {
        if (!page || index === currentPageIndex) return null;
        const width = parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH);
        const height = parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT);
        const left = getPageLayoutLeft(index);
        const artboard = buildGhostArtboard(page, left, width, height);
        const overlay = buildGhostHitOverlay(page, index, left, width, height);
        const safeCanvas = sanitizeCanvasStateForEditor(page.canvas, { pageWidth: width, pageHeight: height });
        const rawObjects = (safeCanvas.objects || []).filter(obj =>
            obj
            && obj.oid !== 'pageRect'
            && !obj.excludeFromExport
            && !obj.isSnapLine
            && !obj.isCanvasGhost
        );

        if (!rawObjects.length) {
            return Promise.resolve({ index, artboard, objects: [], overlay });
        }

        return new Promise((resolve) => {
            fabric.util.enlivenObjects(rawObjects, (objects) => {
                if (renderToken !== ghostRenderVersion) {
                    resolve({ artboard: null, objects: [], overlay: null });
                    return;
                }
                const prepared = (objects || [])
                    .map(obj => prepareGhostObject(obj, left, page.id, index, width, height))
                    .filter(Boolean);
                resolve({ index, artboard, objects: prepared, overlay });
            }, null);
        });
    }).filter(Boolean);

    Promise.all(ghostTasks)
        .then((results) => {
            if (renderToken !== ghostRenderVersion) return;

            isRenderingCanvasGhosts = true;
            try {
                const newGhostItems = [];
                const sortedResults = results.sort((a, b) => (a.index || 0) - (b.index || 0));

                sortedResults.forEach(({ artboard }) => {
                    if (artboard) {
                        artboard.set({ objectCaching: false, skipOffscreen: false });
                        artboard.setCoords();
                        newGhostItems.push(artboard);
                    }
                });

                sortedResults.forEach(({ overlay }) => {
                    if (overlay) {
                        overlay.set({ skipOffscreen: false });
                        overlay.setCoords();
                        newGhostItems.push(overlay);
                    }
                });

                sortedResults.forEach(({ objects }) => {
                    (objects || []).forEach(obj => {
                        obj.set({ skipOffscreen: false });
                        obj.setCoords();
                        newGhostItems.push(obj);
                    });
                });

                if (newGhostItems.length > 0) {
                    canvas.remove(pageRect);
                    canvas.insertAt(pageRect, 0);
                    let insertIndex = 1;
                    newGhostItems.forEach(item => {
                        canvas.insertAt(item, insertIndex);
                        insertIndex += 1;
                    });
                    canvas.calcOffset();
                } else {
                    canvas.sendToBack(pageRect);
                }
            } finally {
                isRenderingCanvasGhosts = false;
            }

            canvas.requestRenderAll();
        })
        .catch((error) => {
            console.error('Failed to render ghost canvases:', error);
            isRenderingCanvasGhosts = false;
        });
}

function renderCanvasPagePreview(previewEl, pageState) {
    if (!previewEl || !pageState) return;
    previewEl.style.backgroundImage = '';
    previewEl.style.backgroundSize = '16px 16px';
    previewEl.style.backgroundRepeat = 'repeat';
    previewEl.textContent = 'Preview';

    try {
        const off = document.createElement('canvas');
        off.width = 320;
        off.height = 220;
        const staticCanvas = new fabric.StaticCanvas(off, { renderOnAddRemove: false, selection: false });
        const safeCanvas = sanitizeCanvasStateForEditor(pageState.canvas, {
            pageWidth: parsePositiveInt(pageState.width, DEFAULT_PAGE_WIDTH),
            pageHeight: parsePositiveInt(pageState.height, DEFAULT_PAGE_HEIGHT)
        });

        staticCanvas.loadFromJSON(safeCanvas, () => {
            const artboard = staticCanvas.getObjects().find(o => o && (o.oid === 'pageRect' || o.isArtboard));
            if (artboard) {
                artboard.set({ strokeWidth: 1, shadow: null });
                const zoom = Math.min(off.width / artboard.width, off.height / artboard.height) * 0.9;
                staticCanvas.setZoom(zoom);
                staticCanvas.viewportTransform[4] = (off.width - artboard.width * zoom) / 2;
                staticCanvas.viewportTransform[5] = (off.height - artboard.height * zoom) / 2;
            }
            staticCanvas.renderAll();
            if (previewEl.isConnected) {
                previewEl.style.backgroundImage = `url(${off.toDataURL('image/png')})`;
                previewEl.style.backgroundSize = 'contain';
                previewEl.style.backgroundRepeat = 'no-repeat';
                previewEl.textContent = '';
            }
            staticCanvas.dispose();
        });
    } catch (error) {
        console.warn('Canvas preview render failed:', error);
        previewEl.textContent = 'Preview unavailable';
    }
}

function setSingleCanvasDimensions(pageIndex, widthValue, heightValue) {
    const page = documentPages[pageIndex];
    if (!page) return;

    const width = parsePositiveInt(widthValue, page.width || DEFAULT_PAGE_WIDTH);
    const height = parsePositiveInt(heightValue, page.height || DEFAULT_PAGE_HEIGHT);
    if (width === page.width && height === page.height) return;

    if (pageIndex === currentPageIndex) syncCurrentPageStateFromCanvas();

    page.width = width;
    page.height = height;
    ensurePageRectInCanvasState(page);

    const shouldRefreshActiveLayout = !!pageRect && (pageIndex === currentPageIndex || pageIndex < currentPageIndex);
    if (pageIndex === currentPageIndex && pageRect) {
        pageRect.set({ width, height });
        pageRect.setCoords();
    }

    if (shouldRefreshActiveLayout) {
        relocateActiveCanvasToLayout();
        applyCanvasMaskToActivePageObjects();
        drawGrid();
        clampViewportTransform(canvas.viewportTransform);
        canvas.renderAll();
        syncCurrentPageStateFromCanvas();
    }

    renderCanvasGhostPages();
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: false });
    requestSaveState();
}

function refreshCanvasPageControls(options = {}) {
    if (!canvasPagesStrip) return;
    ensureDocumentPagesIntegrity();
    const preserveScroll = options.preserveScroll !== false;
    const priorScroll = preserveScroll ? canvasPagesStrip.scrollLeft : 0;
    const previousFocusId = document.activeElement?.id || '';

    normalizeCanvasPageSelections({ ensureCurrent: true });
    syncGeneralPageSizeInputs();
    canvasPagesStrip.innerHTML = '';

    documentPages.forEach((page, index) => {
        const card = document.createElement('div');
        const isActive = index === currentPageIndex;
        const isSelected = selectedCanvasIndexes.has(index);
        card.className = `canvas-page-card${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`;
        card.dataset.index = String(index);
        card.draggable = documentPages.length > 1;
        card.innerHTML = `
                    <div class="canvas-page-toolbar">
                        <span class="canvas-page-label">Page ${index + 1}</span>
                        <input type="number" min="100" max="10000" value="${parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH)}" title="Width" data-role="width">
                        <span class="muted">×</span>
                        <input type="number" min="100" max="10000" value="${parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT)}" title="Height" data-role="height">
                        <button class="btn ghost icon-only" type="button" data-role="add" title="Add after this page">${iconSvg('add')}</button>
                        <button class="btn ghost icon-only" type="button" data-role="duplicate" title="Duplicate this page">${iconSvg('duplicate')}</button>
                        <button class="btn ghost icon-only" type="button" data-role="delete" title="Delete this page">${iconSvg('delete')}</button>
                    </div>
                    <div class="canvas-page-preview" data-role="preview"></div>
                `;

        const widthInput = card.querySelector('input[data-role="width"]');
        const heightInput = card.querySelector('input[data-role="height"]');
        const preview = card.querySelector('[data-role="preview"]');
        const addBtn = card.querySelector('button[data-role="add"]');
        const duplicateBtn = card.querySelector('button[data-role="duplicate"]');
        const deleteBtn = card.querySelector('button[data-role="delete"]');

        if (deleteBtn) deleteBtn.disabled = documentPages.length <= 1;

        const handleCanvasCardClick = async (event) => {
            const isRange = !!event?.shiftKey;
            const isToggle = !!(event?.ctrlKey || event?.metaKey);

            if (!isRange && !isToggle) {
                setCanvasPageSelection([index], { ensureCurrent: false });
                canvasSelectionAnchorIndex = index;
            } else {
                const nextSelection = new Set(getSelectedCanvasPageIndexes({ ensureCurrent: false }));
                if (isRange) {
                    const anchor = Math.max(0, Math.min(documentPages.length - 1, parseInt(canvasSelectionAnchorIndex, 10) || currentPageIndex));
                    const start = Math.min(anchor, index);
                    const end = Math.max(anchor, index);
                    if (!isToggle) nextSelection.clear();
                    for (let i = start; i <= end; i++) nextSelection.add(i);
                } else if (isToggle) {
                    if (nextSelection.has(index) && index !== currentPageIndex) nextSelection.delete(index);
                    else nextSelection.add(index);
                }
                setCanvasPageSelection(Array.from(nextSelection), { ensureCurrent: true });
                canvasSelectionAnchorIndex = index;
            }

            if (index !== currentPageIndex) {
                await switchToCanvasPage(index, { fitView: false });
                requestSaveState();
                return;
            }

            renderCanvasGhostPages();
            refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
        };

        if (preview) preview.addEventListener('click', (event) => {
            event.stopPropagation();
            handleCanvasCardClick(event);
        });
        card.addEventListener('click', (event) => {
            const interactive = event.target.closest('input, button');
            if (!interactive) handleCanvasCardClick(event);
        });

        card.addEventListener('dragstart', (event) => {
            const interactive = event.target?.closest?.('input, button');
            if (interactive) {
                event.preventDefault();
                return;
            }
            if (!event.dataTransfer || documentPages.length <= 1) return;
            draggedCanvasPageIndex = index;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            draggedCanvasPageIndex = null;
            card.classList.remove('dragging');
            card.classList.remove('drag-over');
        });
        card.addEventListener('dragover', (event) => {
            const fromIndex = Number.isInteger(draggedCanvasPageIndex)
                ? draggedCanvasPageIndex
                : parseInt(event.dataTransfer?.getData('text/plain'), 10);
            if (!Number.isInteger(fromIndex) || fromIndex === index) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
        });
        card.addEventListener('drop', async (event) => {
            const fromIndex = Number.isInteger(draggedCanvasPageIndex)
                ? draggedCanvasPageIndex
                : parseInt(event.dataTransfer?.getData('text/plain'), 10);
            if (!Number.isInteger(fromIndex) || fromIndex === index) return;
            event.preventDefault();
            card.classList.remove('drag-over');
            const rect = card.getBoundingClientRect();
            const dropAfter = event.clientX > rect.left + rect.width / 2;
            let insertAt = index;
            if (fromIndex < index) insertAt -= 1;
            if (dropAfter) insertAt += 1;
            await reorderCanvasPages(fromIndex, insertAt);
        });

        const applyPageSize = () => {
            setSingleCanvasDimensions(index, widthInput?.value, heightInput?.value);
        };
        if (widthInput) {
            widthInput.addEventListener('change', applyPageSize);
            widthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPageSize(); });
        }
        if (heightInput) {
            heightInput.addEventListener('change', applyPageSize);
            heightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPageSize(); });
        }

        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addCanvasPage(index + 1, { width: page.width, height: page.height });
            });
        }
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateCanvasPage(index);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCanvasPage(index);
            });
        }

        canvasPagesStrip.appendChild(card);
        renderCanvasPagePreview(preview, page);
    });

    const addCard = document.createElement('button');
    addCard.className = 'canvas-page-add-card';
    addCard.type = 'button';
    addCard.textContent = '+ Add Page';
    addCard.addEventListener('click', () => {
        addCanvasPage(documentPages.length, { width: generalPageSize.width, height: generalPageSize.height });
    });
    addCard.addEventListener('dragover', (event) => {
        const fromIndex = Number.isInteger(draggedCanvasPageIndex)
            ? draggedCanvasPageIndex
            : parseInt(event.dataTransfer?.getData('text/plain'), 10);
        if (!Number.isInteger(fromIndex)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    addCard.addEventListener('drop', async (event) => {
        const fromIndex = Number.isInteger(draggedCanvasPageIndex)
            ? draggedCanvasPageIndex
            : parseInt(event.dataTransfer?.getData('text/plain'), 10);
        if (!Number.isInteger(fromIndex)) return;
        event.preventDefault();
        await reorderCanvasPages(fromIndex, documentPages.length);
    });
    canvasPagesStrip.appendChild(addCard);

    if (preserveScroll) canvasPagesStrip.scrollLeft = priorScroll;
    if (options.ensureActiveVisible !== false) {
        const activeCard = canvasPagesStrip.querySelector('.canvas-page-card.active');
        if (activeCard) activeCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    if (previousFocusId === 'pageWidth' || previousFocusId === 'pageHeight') {
        syncGeneralPageSizeInputs();
    }
    updatePageActionToolbarPosition();
    if (typeof syncExportPageSelectorUI === 'function') syncExportPageSelectorUI();
}

const refreshCanvasPageControlsDebounced = debounce(() => {
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: false });
}, 220);

function syncCurrentPageStateFromCanvas() {
    if (isPageSwitching || !documentPages[currentPageIndex]) return;
    const pageState = documentPages[currentPageIndex];
    pageState.title = pageState.title || `Page ${currentPageIndex + 1}`;
    if (pageRect) {
        pageState.width = parsePositiveInt(Math.round(pageRect.width), pageState.width || DEFAULT_PAGE_WIDTH);
        pageState.height = parsePositiveInt(Math.round(pageRect.height), pageState.height || DEFAULT_PAGE_HEIGHT);
    } else {
        pageState.width = parsePositiveInt(pageState.width, DEFAULT_PAGE_WIDTH);
        pageState.height = parsePositiveInt(pageState.height, DEFAULT_PAGE_HEIGHT);
    }
    const pageLeft = pageRect ? normalizeNumeric(pageRect.left, getPageLayoutLeft(currentPageIndex)) : getPageLayoutLeft(currentPageIndex);
    const pageTop = pageRect ? normalizeNumeric(pageRect.top, 0) : 0;
    normalizeTextboxPathsForSerialization();
    let serializedCanvas = null;
    try {
        serializedCanvas = canvas.toJSON(SERIALIZE_PROPS);
    } catch (error) {
        console.warn('Canvas serialization failed; attempting text object repair.', error);
        try {
            repairLiveCanvasTextObjectsForSerialization();
            normalizeTextboxPathsForSerialization();
            serializedCanvas = canvas.toJSON(SERIALIZE_PROPS);
        } catch (retryError) {
            console.error('Canvas serialization failed after repair attempt.', retryError);
            return;
        }
    }
    if (Array.isArray(serializedCanvas.objects)) {
        serializedCanvas.objects = serializedCanvas.objects
            .filter(obj => {
                if (!obj) return false;
                if (obj.oid === 'pageRect') return true;
                return !obj.excludeFromExport && !obj.isSnapLine && !obj.isCanvasGhost;
            })
            .map(obj => {
                const next = { ...obj };
                if (next.clipPath) delete next.clipPath;
                if (next.oid === 'pageRect') {
                    next.left = 0;
                    next.top = 0;
                    next.width = pageState.width;
                    next.height = pageState.height;
                    return next;
                }
                if (Number.isFinite(parseFloat(next.left))) next.left = parseFloat(next.left) - pageLeft;
                if (Number.isFinite(parseFloat(next.top))) next.top = parseFloat(next.top) - pageTop;
                return sanitizeCanvasObject(next, {
                    pageWidth: pageState.width,
                    pageHeight: pageState.height
                });
            })
            .filter(Boolean);
    }
    pageState.canvas = serializedCanvas;
    pageState.bindings = Array.from(bindings.entries());
    ensurePageRectInCanvasState(pageState);
}

function pageHasRenderableObjects(pageState) {
    const objects = pageState?.canvas?.objects || [];
    return objects.some(o => o && o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine);
}

function buildTemplatePayload() {
    syncCurrentPageStateFromCanvas();
    if (!documentPages.length) {
        documentPages = [createBlankPageState(0, DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT)];
        currentPageIndex = 0;
        setCanvasPageSelection([0], { ensureCurrent: false });
        canvasSelectionAnchorIndex = 0;
    }

    const clonedPages = deepClone(documentPages);
    const activePage = clonedPages[currentPageIndex] || clonedPages[0];

    return {
        page: {
            title: $('#titleInput').value || 'Untitled_Template',
            width: activePage?.width || DEFAULT_PAGE_WIDTH,
            height: activePage?.height || DEFAULT_PAGE_HEIGHT
        },
        canvas: activePage?.canvas || { version: '5.3.0', background: 'transparent', objects: [] },
        bindings: activePage?.bindings || [],
        pages: clonedPages,
        currentPageIndex,
        data: { headers, rows: dataRows, identifierColumn: identifierColumn || '' }
    };
}

function switchToCanvasPage(index, { fitView = false, skipSave = false, suppressHistory = false } = {}) {
    return new Promise((resolve) => {
        ensureDocumentPagesIntegrity();
        const safeIndex = Math.max(0, Math.min(documentPages.length - 1, parseInt(index, 10) || 0));
        if (!documentPages[safeIndex]) {
            resolve(false);
            return;
        }

        if (!skipSave) syncCurrentPageStateFromCanvas();

        const nextPage = documentPages[safeIndex];
        const priorHistoryLock = historyLocked;
        const priorViewportTransform = Array.isArray(canvas.viewportTransform)
            ? [...canvas.viewportTransform]
            : [1, 0, 0, 1, 0, 0];
        const endSwitchTransition = beginCanvasSwitchTransition();
        currentPageIndex = safeIndex;
        isPageSwitching = true;
        historyLocked = true;
        bindings = new Map(nextPage.bindings || []);

        const finalizeSwitch = (ok) => {
            historyLocked = priorHistoryLock;
            isPageSwitching = false;
            endSwitchTransition();
            resolve(!!ok);
        };

        canvas.discardActiveObject();
        try {
            canvas.loadFromJSON(nextPage.canvas, () => {
                try {
                    restoreCanvasStateAfterLoad(() => {
                        pageRect = canvas.getObjects().find(o => o.oid === 'pageRect');
                        const pageLeft = getPageLayoutLeft(currentPageIndex);
                        if (pageRect) {
                            pageRect.set({
                                left: pageLeft,
                                top: 0,
                                width: nextPage.width,
                                height: nextPage.height,
                                selectable: false,
                                evented: false,
                                hasControls: false,
                                hasBorders: false,
                                lockMovementX: true,
                                lockMovementY: true,
                                lockScalingX: true,
                                lockScalingY: true,
                                lockRotation: true,
                                isArtboard: true
                            });
                            pageRect.setCoords();
                        }
                        canvas.getObjects().forEach(obj => {
                            if (!obj || obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isCanvasGhost) return;
                            obj.set({
                                left: normalizeNumeric(obj.left, 0) + pageLeft,
                                top: normalizeNumeric(obj.top, 0)
                            });
                            obj.setCoords();
                        });
                        applyCanvasMaskToActivePageObjects();
                        styleActivePageRect();

                        refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
                        keepPageRectAtBack();
                        drawGrid();
                        renderCanvasGhostPages();
                        renderLayers();
                        renderPageInspector();
                        canvas.discardActiveObject();
                        $('#inspector').style.display = 'none';
                        $('#multiSelectInspector').style.display = 'none';
                        $('#noSelection').style.display = 'block';
                        updateFloatingLinker(null);

                        if (fitView) centerAndFitPage();
                        else {
                            canvas.setViewportTransform(priorViewportTransform);
                            canvas.requestRenderAll();
                        }
                        updatePageActionToolbarPosition();

                        finalizeSwitch(true);
                    });
                } catch (error) {
                    console.error('Failed during page restore:', error);
                    finalizeSwitch(false);
                }
            });
        } catch (error) {
            console.error('Failed to load page JSON:', error);
            finalizeSwitch(false);
        }
    });
}

async function reorderCanvasPages(fromIndex, toIndex) {
    ensureDocumentPagesIntegrity();
    if (!Array.isArray(documentPages) || documentPages.length <= 1) return false;

    const safeFrom = Math.max(0, Math.min(documentPages.length - 1, parseInt(fromIndex, 10) || 0));
    const parsedTo = parseInt(toIndex, 10);
    const safeToRaw = Number.isInteger(parsedTo) ? parsedTo : safeFrom;
    const safeTo = Math.max(0, Math.min(documentPages.length - 1, safeToRaw));
    if (safeFrom === safeTo) return false;

    syncCurrentPageStateFromCanvas();

    const [movedPage] = documentPages.splice(safeFrom, 1);
    const insertAt = Math.max(0, Math.min(documentPages.length, safeToRaw));
    documentPages.splice(insertAt, 0, movedPage);

    const nextCurrent = remapCanvasPageIndexForMove(currentPageIndex, safeFrom, insertAt);
    currentPageIndex = Math.max(0, Math.min(documentPages.length - 1, nextCurrent));

    const remappedSelection = new Set();
    selectedCanvasIndexes.forEach(idx => {
        const remapped = remapCanvasPageIndexForMove(idx, safeFrom, insertAt);
        if (Number.isInteger(remapped) && remapped >= 0 && remapped < documentPages.length) {
            remappedSelection.add(remapped);
        }
    });
    selectedCanvasIndexes = remappedSelection;
    canvasSelectionAnchorIndex = remapCanvasPageIndexForMove(canvasSelectionAnchorIndex, safeFrom, insertAt);
    normalizeCanvasPageSelections({ ensureCurrent: true });

    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
    await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
    requestSaveState();
    return true;
}

async function addCanvasPage(insertAt = documentPages.length, sourceSize = null) {
    ensureDocumentPagesIntegrity();
    syncCurrentPageStateFromCanvas();
    const safeInsertAt = Math.max(0, Math.min(documentPages.length, parseInt(insertAt, 10) || 0));
    const seedW = parsePositiveInt(
        sourceSize?.width,
        parsePositiveInt(generalPageSize.width, DEFAULT_PAGE_WIDTH)
    );
    const seedH = parsePositiveInt(
        sourceSize?.height,
        parsePositiveInt(generalPageSize.height, DEFAULT_PAGE_HEIGHT)
    );
    const newPage = createBlankPageState(safeInsertAt, seedW, seedH);
    documentPages.splice(safeInsertAt, 0, newPage);
    if (safeInsertAt <= currentPageIndex) currentPageIndex += 1;
    shiftCanvasPageSelectionForInsert(safeInsertAt);
    setCanvasPageSelection([safeInsertAt], { ensureCurrent: false });
    canvasSelectionAnchorIndex = safeInsertAt;
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
    await switchToCanvasPage(safeInsertAt, { fitView: false, skipSave: true, suppressHistory: true });
    requestSaveState();
}

async function duplicateCanvasPage(sourceIndex = currentPageIndex) {
    ensureDocumentPagesIntegrity();
    syncCurrentPageStateFromCanvas();
    const safeSourceIndex = Math.max(0, Math.min(documentPages.length - 1, parseInt(sourceIndex, 10) || 0));
    if (!documentPages[safeSourceIndex]) return;

    const clone = deepClone(documentPages[safeSourceIndex]);
    clone.id = createUid('page');
    clone.title = `${clone.title || `Page ${safeSourceIndex + 1}`} Copy`;
    const insertAt = safeSourceIndex + 1;
    documentPages.splice(insertAt, 0, normalizePageState(clone, insertAt));
    if (insertAt <= currentPageIndex) currentPageIndex += 1;
    shiftCanvasPageSelectionForInsert(insertAt);
    setCanvasPageSelection([insertAt], { ensureCurrent: false });
    canvasSelectionAnchorIndex = insertAt;
    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
    await switchToCanvasPage(insertAt, { fitView: false, skipSave: true, suppressHistory: true });
    requestSaveState();
}

async function deleteCanvasPage(targetIndex = currentPageIndex) {
    ensureDocumentPagesIntegrity();
    if (documentPages.length <= 1) return;
    const safeTargetIndex = Math.max(0, Math.min(documentPages.length - 1, parseInt(targetIndex, 10) || 0));
    const label = safeTargetIndex + 1;
    if (!confirm(`Delete canvas ${label}?`)) return;

    syncCurrentPageStateFromCanvas();

    documentPages.splice(safeTargetIndex, 1);
    if (!documentPages.length) {
        documentPages = [createBlankPageState(0, generalPageSize.width, generalPageSize.height)];
    }

    if (safeTargetIndex < currentPageIndex) currentPageIndex = Math.max(0, currentPageIndex - 1);
    if (safeTargetIndex === currentPageIndex) currentPageIndex = Math.max(0, currentPageIndex - 1);
    if (currentPageIndex > documentPages.length - 1) currentPageIndex = documentPages.length - 1;
    shiftCanvasPageSelectionForDelete(safeTargetIndex);

    refreshCanvasPageControls({ preserveScroll: true, ensureActiveVisible: true });
    await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
    requestSaveState();
}

async function setDocumentPagesFromTemplate(templateData = {}, options = {}) {
    const normalized = normalizeTemplatePages(templateData);
    documentPages = normalized.pages;
    generalPageSize = getMostCommonPageSize();
    syncGeneralPageSizeInputs();
    currentPageIndex = typeof options.selectedIndex === 'number'
        ? Math.min(documentPages.length - 1, Math.max(0, options.selectedIndex))
        : normalized.selectedIndex;
    setCanvasPageSelection([currentPageIndex], { ensureCurrent: false });
    canvasSelectionAnchorIndex = currentPageIndex;
    await switchToCanvasPage(currentPageIndex, {
        fitView: options.fitView !== false,
        skipSave: true,
        suppressHistory: true
    });
}

window.createLemonSqueezy();
LemonSqueezy.Setup({ eventHandler: (event) => { if (event.event === 'Checkout.Success') console.log('Checkout successful!', event.data); } });

// --- DEBOUNCE UTILITY ---
function debounce(func, delay = 1500) {
    let timeout = null;
    let lastArgs = null;
    let lastThis = null;
    const debounced = function (...args) {
        lastArgs = args;
        lastThis = this;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = null;
            const argsToUse = lastArgs || [];
            const thisToUse = lastThis;
            lastArgs = null;
            lastThis = null;
            func.apply(thisToUse, argsToUse);
        }, delay);
    };
    debounced.clear = () => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        lastArgs = null;
        lastThis = null;
    };
    debounced.flush = () => {
        if (!timeout) return false;
        clearTimeout(timeout);
        timeout = null;
        const argsToUse = lastArgs || [];
        const thisToUse = lastThis;
        lastArgs = null;
        lastThis = null;
        func.apply(thisToUse, argsToUse);
        return true;
    };
    debounced.pending = () => !!timeout;
    return debounced;
}

const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};

function renderCsvView(filterText = '') {
    const wrap = $('#csvViewContent');
    const dropZone = $('#csvDropZone');
    const meta = $('#csvViewMeta');
    if (!wrap) return;

    if (!headers || headers.length === 0 || !dataRows || dataRows.length === 0) {
        wrap.style.display = 'none';
        if (dropZone) dropZone.style.display = 'flex';
        if (meta) meta.textContent = '';
        return;
    }

    if (dropZone) dropZone.style.display = 'none';
    wrap.style.display = 'block';

    const q = (filterText || '').toLowerCase().trim();
    const visibleIndices = [];
    dataRows.forEach((r, i) => {
        if (!q || headers.some(h => String(r[h] ?? '').toLowerCase().includes(q))) visibleIndices.push(i);
    });

    if (meta) meta.textContent = `${dataRows.length.toLocaleString()} row(s) • ${headers.length} column(s)`;

    const maxRows = Math.min(200, visibleIndices.length);
    let html = `<table style="width:100%; border-collapse:collapse; font-size:12px; border-style: hidden;">`;

    // Headers
    html += '<thead><tr>';
    headers.forEach((h, i) => {
        html += `<th style="position:sticky; top:0; background:var(--panel-2); border-bottom:1px solid var(--border); border-right:1px solid var(--border); padding:0; text-align:left; min-width:140px; z-index: 10;">
        <div style="display:flex; align-items:center; group">
          <div contenteditable="true" onblur="updateHeader(${i}, this.innerText)" style="flex:1; padding:12px; outline:none; font-weight: 600; color: var(--fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(String(h))}</div>
          <button onclick="deleteColumn(${i})" style="background:none; border:none; color:var(--muted); cursor:pointer; padding:8px 12px; font-size:16px; transition: color 0.2s;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'" title="Delete Column">&times;</button>
        </div>
      </th>`;
    });
    // Add column button in header
    html += `<th style="position:sticky; top:0; background:var(--panel-2); border-bottom:1px solid var(--border); width:50px; text-align:center; z-index: 10;">
    <button onclick="document.getElementById('addColBtn').click()" class="btn ghost" style="width:32px; height:32px; padding:0; border-radius:50%; border: 1px dashed var(--border); color: var(--muted);" title="Add Column">+</button>
  </th>`;
    html += '</tr></thead>';

    html += '<tbody>';
    for (let i = 0; i < maxRows; i++) {
        const dataIndex = visibleIndices[i];
        const row = dataRows[dataIndex] || {};
        html += `<tr style="transition: background 0.1s;" onmouseover="this.style.background='rgba(59,130,246,0.03)'" onmouseout="this.style.background='transparent'">` + headers.map((h, colIndex) => {
            const val = escapeHtml(String(row[h] ?? ''));
            return `<td contenteditable="true" 
            data-row-index="${dataIndex}" data-col-index="${colIndex}"
            onblur="updateCsvCell(${dataIndex}, '${escapeHtml(h)}', this.innerText)" 
            style="border-bottom:1px solid var(--border); border-right:1px solid var(--border); padding:10px 12px; color:var(--fg); outline:none; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; user-select: text;">${val}</td>`;
        }).join('') + `
      <td style="border-bottom:1px solid var(--border); text-align:center;">
        <button onclick="deleteRow(${dataIndex})" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:18px; padding: 4px 10px; transition: color 0.2s;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'" title="Delete Row">&times;</button>
      </td>
    </tr>`;
    }

    // Last row for "Add Row" button
    html += `<tr>
    <td colspan="${headers.length}" style="padding: 0; border-bottom:1px solid var(--border);">
      <button onclick="document.getElementById('addRowBtn').click()" style="width:100%; height:44px; background:transparent; border:none; color:var(--muted); cursor:pointer; font-size:13px; font-weight:500; transition: all 0.2s; display: flex; align-items:center; justify-content:center; gap: 8px;" onmouseover="this.style.background='rgba(59,130,246,0.05)'; this.style.color='var(--accent)'" onmouseout="this.style.background='transparent'; this.style.color='var(--muted)'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Row</button>
    </td>
    <td style="border-bottom:1px solid var(--border);"></td>
  </tr>`;

    html += '</tbody></table>';

    if (visibleIndices.length > maxRows) {
        html += `<div class="muted" style="padding:16px; text-align:center; background: var(--panel); border-top: 1px solid var(--border);">Showing first ${maxRows} rows of ${visibleIndices.length.toLocaleString()}. Use search to refine.</div>`;
    }
    wrap.innerHTML = html;

    // Add paste listener for Excel support
    wrap.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('paste', handleCsvCellPaste);
    });
}

async function handleCsvCellPaste(e) {
    const text = e.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;

    e.preventDefault();
    const rows = text.split(/\r?\n/).filter(line => line.length > 0).map(line => line.split('\t'));
    const startCell = e.target;
    const startRowIndex = parseInt(startCell.dataset.rowIndex);
    const startColIndex = parseInt(startCell.dataset.colIndex);

    if (isNaN(startRowIndex) || isNaN(startColIndex)) return;

    rows.forEach((row, rOffset) => {
        const targetRowIndex = startRowIndex + rOffset;
        if (targetRowIndex >= dataRows.length) return;

        row.forEach((value, cOffset) => {
            const targetColIndex = startColIndex + cOffset;
            if (targetColIndex >= headers.length) return;
            const colKey = headers[targetColIndex];
            dataRows[targetRowIndex][colKey] = value.trim();
        });
    });

    renderCsvView($('#csvViewSearch')?.value);
    requestSaveState();
}

window.updateCsvCell = (rowIndex, colKey, newVal) => {
    if (dataRows[rowIndex]) {
        dataRows[rowIndex][colKey] = newVal;
        requestSaveState();
    }
};

window.updateHeader = (index, newVal) => {
    const oldVal = headers[index];
    if (oldVal === newVal || !newVal.trim()) return;
    newVal = newVal.trim();
    headers[index] = newVal;
    dataRows.forEach(row => {
        row[newVal] = row[oldVal];
        delete row[oldVal];
    });
    bindings.forEach((b) => { if (b.column === oldVal) b.column = newVal; });
    renderCsvView();
    requestSaveState();
};

window.deleteRow = (index) => {
    dataRows.splice(index, 1);
    renderCsvView($('#csvViewSearch')?.value);
    requestSaveState();
};

window.deleteColumn = (index) => {
    const colName = headers[index];
    if (confirm(`Delete column "${colName}" and all its data?`)) {
        headers.splice(index, 1);
        dataRows.forEach(row => delete row[colName]);
        // Also remove bindings
        bindings.forEach((bArr, oid) => {
            const filtered = bArr.filter(b => b.column !== colName);
            bindings.set(oid, filtered);
        });
        renderCsvView($('#csvViewSearch')?.value);
        requestSaveState();
    }
};

on('#addRowBtn', 'click', () => {
    if (!headers.length) headers = ['Column 1', 'Column 2', 'Column 3'];
    const newRow = {};
    headers.forEach(h => newRow[h] = '');
    dataRows.push(newRow);
    renderCsvView($('#csvViewSearch')?.value);
    requestSaveState();
});

on('#addColBtn', 'click', () => {
    const newColName = prompt('Enter new column name:', `Column ${headers.length + 1}`);
    if (!newColName) return;
    if (headers.includes(newColName)) { alert('Column already exists.'); return; }
    headers.push(newColName);
    dataRows.forEach(r => r[newColName] = '');
    renderCsvView($('#csvViewSearch')?.value);
    requestSaveState();
});

on('#clearDataBtn', 'click', () => {
    if (confirm('Are you sure you want to clear all data? This will also remove your column headers.')) {
        headers = [];
        dataRows = [];
        renderCsvView();
        requestSaveState();
    }
});

on('#csvViewSearch', 'input', (e) => {
    renderCsvView(e.target.value);
});

// Paste Handler for CSV Modal
window.addEventListener('paste', (e) => {
    if ($('#csvViewModal').style.display !== 'flex') return;
    if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;

    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('Text');
    if (!pastedData) return;

    const rows = pastedData.trim().split('\n').map(r => r.split('\t'));
    if (rows.length === 0) return;

    if (headers.length === 0) {
        headers = rows[0].map((h, i) => h.trim() || `Col ${i + 1}`);
        const count = {};
        headers = headers.map(h => { count[h] = (count[h] || 0) + 1; return count[h] > 1 ? `${h}_${count[h]}` : h; });
        rows.shift();
    }

    rows.forEach(r => {
        const rowObj = {};
        headers.forEach((h, i) => { rowObj[h] = r[i] ? r[i].trim() : ''; });
        dataRows.push(rowObj);
    });

    renderCsvView($('#csvViewSearch')?.value);
    requestSaveState();
    showNotification(`Imported ${rows.length} rows from clipboard.`);
});

// Drag & Drop Handler for CSV Modal
on('#csvViewModal', 'dragover', (e) => {
    e.preventDefault();
    $('#csvDropZone').style.borderColor = 'var(--accent)';
    $('#csvDropZone').style.background = 'rgba(59, 130, 246, 0.05)';
});
on('#csvViewModal', 'dragleave', (e) => {
    e.preventDefault();
    $('#csvDropZone').style.borderColor = 'var(--border)';
    $('#csvDropZone').style.background = 'rgba(255, 255, 255, 0.02)';
});
on('#csvViewModal', 'drop', async (e) => {
    e.preventDefault();
    $('#csvDropZone').style.borderColor = 'var(--border)';
    $('#csvDropZone').style.background = 'rgba(255, 255, 255, 0.02)';
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        const data = await file.arrayBuffer();
        processFileData(data, file.name);
        await cacheDataFile(file);
    } else {
        showNotification('Please drop a valid CSV or Excel file.', 'error');
    }
});

function openCsvView() {
    const modal = $('#csvViewModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderCsvView($('#csvViewSearch')?.value);
}

function closeCsvView() { $('#csvViewModal').style.display = 'none'; }
