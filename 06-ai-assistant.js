        // --- AI ASSISTANT ---
        const aiApiKeyInput = $('#aiApiKeyPanel');
        const aiPromptInput = $('#aiChatPrompt');
        const aiSendBtn = $('#aiChatSendBtn');
        const aiSendBtnText = $('#aiChatSendText');
        const aiChatSpinner = $('#aiChatSpinner');
        const aiChatLog = $('#aiChatLog');
        const aiResetChatBtn = $('#aiResetChatBtn');
        const aiFileInput = $('#aiChatFile');
        const aiClearFileBtn = $('#aiClearFileBtn');
        const aiAttachmentMeta = $('#aiAttachmentMeta');

        const aiUiReady = [
            aiApiKeyInput,
            aiPromptInput,
            aiSendBtn,
            aiSendBtnText,
            aiChatSpinner,
            aiChatLog,
            aiResetChatBtn,
            aiFileInput,
            aiClearFileBtn,
            aiAttachmentMeta
        ].every(Boolean);

        if (!aiUiReady) {
            console.warn('AI panel controls missing. AI copilot disabled.');
        } else {
            const AI_ICON_BASE = 'https://mzdhdmfjwdpolrxraqtv.supabase.co/storage/v1/object/public/elements/icons';
            const AI_MAX_TEXT_ATTACHMENT_CHARS = 20000;
            const AI_MAX_BINARY_ATTACHMENT_BYTES = 4 * 1024 * 1024;
            const AI_CANVAS_SNAPSHOT_MAX_SIDE = 820;
            const AI_CANVAS_SNAPSHOT_QUALITY = 0.4;
            const AI_REQUEST_TIMEOUT_MS = 36000;
            const AI_TEMPLATE_REQUEST_TIMEOUT_MS = 95000;
            const AI_TEMPLATE_RETRY_TIMEOUT_MS = 60000;
            const AI_MAX_CONVERSATION_ITEMS = 6;
            const AI_MAX_CONVERSATION_CHARS = 240;
            const AI_MAX_APPLIED_ACTIONS = 8;
            const AI_MAX_APPLIED_ACTION_CHARS = 180;
            const AI_MAX_CONTEXT_COLUMNS = 14;
            const AI_MAX_CANVAS_JSON_CHARS = 24000;
            const AI_MAX_CANVAS_JSON_OBJECTS = 80;
            const AI_MAX_TEMPLATE_CONTEXT_CHARS = 52000;
            const AI_MAX_TEMPLATE_OBJECTS_PER_PAGE = 120;
            const AI_MAX_TEMPLATE_PAGES_CONTEXT = 10;
            const AI_ATTACHMENT_IMAGE_MAX_SIDE = 1400;
            const AI_ATTACHMENT_IMAGE_QUALITY = 0.78;
            const AI_ATTACHMENT_IMAGE_TARGET_BASE64 = 900000;
            const AI_RETRY_TEXT_ATTACHMENT_CHARS = 6000;
            const AI_STRICT_MAX_PAGES = 24;
            const AI_STRICT_MAX_OBJECTS_PER_PAGE = 280;
            const AI_STRICT_MAX_GROUP_CHILDREN = 60;
            const AI_STRICT_MAX_OBJECT_DEPTH = 3;
            const AI_STRICT_MAX_TEXT_LENGTH = 5000;
            const AI_STRICT_MAX_IMAGE_SRC_CHARS = 16000;
            const AI_STRICT_MAX_PATH_SEGMENTS = 220;
            const AI_STRICT_MAX_HEADERS = 200;
            const AI_STRICT_MAX_ROWS = 5000;
            const AI_STRICT_ALLOWED_TYPES = new Set([
                'rect',
                'circle',
                'triangle',
                'textbox',
                'image',
                'line',
                'path',
                'group',
                'polygon',
                'polyline',
                'ellipse'
            ]);
            const AI_STRICT_ALLOWED_TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);
            const AI_MODEL_NAME = 'gemini-2.5-flash';
            const AI_MODEL_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL_NAME}:generateContent`;
            const AI_MODEL_STREAM_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL_NAME}:streamGenerateContent?alt=sse`;
            const AI_CREATIVE_REQUEST_TIMEOUT_MS = 90000;
            const AI_LIVE_RENDER_DELAY_MS = 28;
            const AI_JSON_RESPONSE_SCHEMA = {
                type: 'OBJECT',
                properties: {
                    thought: { type: 'STRING', description: 'Optional planning notes for action selection.' },
                    reply: { type: 'STRING' },
                    actions: {
                        type: 'ARRAY',
                        items: { type: 'OBJECT' }
                    }
                },
                required: ['reply', 'actions']
            };

            let aiAutoApplyEnabled = true;
            let aiConversation = [];
            let aiAttachment = null;

            const savedApiKey = localStorage.getItem('googleAiApiKey');
            if (savedApiKey) aiApiKeyInput.value = savedApiKey;

            function setAiBusy(isBusy) {
                aiSendBtn.disabled = isBusy;
                aiSendBtnText.style.display = isBusy ? 'none' : 'inline-block';
                aiChatSpinner.style.display = isBusy ? 'inline-flex' : 'none';
            }

            function ensureChatScrolledToBottom() {
                aiChatLog.scrollTop = aiChatLog.scrollHeight;
            }

            function clampText(value, maxChars = 240) {
                const text = String(value || '').replace(/\s+/g, ' ').trim();
                if (!text) return '';
                if (text.length <= maxChars) return text;
                return `${text.slice(0, Math.max(8, maxChars - 3))}...`;
            }

            function extractFirstQuestion(value = '') {
                const text = String(value || '').replace(/\s+/g, ' ').trim();
                if (!text) return '';
                const match = text.match(/[^?]+\?/);
                return match ? match[0].trim() : '';
            }

            function appendAiChatMessage(kind, text) {
                const empty = aiChatLog.querySelector('.ai-chat-empty');
                if (empty) empty.remove();
                const el = document.createElement('div');
                el.className = `ai-chat-message ${kind}`;
                el.textContent = text;
                aiChatLog.appendChild(el);
                ensureChatScrolledToBottom();
                return el;
            }

            function createAiThinkingTicker(targetEl) {
                const startTime = Date.now();
                const stages = [
                    'Thinking',
                    'Reviewing canvas context',
                    'Planning design actions',
                    'Preparing response'
                ];
                let stageIndex = 0;
                let stageOverride = '';

                const render = () => {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    const stage = stageOverride || stages[stageIndex % stages.length];
                    stageIndex += 1;
                    targetEl.textContent = `${stage}... ${elapsed}s`;
                };

                render();
                const intervalId = setInterval(render, 1200);

                return {
                    setStage(nextStage) {
                        stageOverride = String(nextStage || '').trim();
                    },
                    stop() {
                        clearInterval(intervalId);
                    }
                };
            }

            function resetAiChat() {
                aiConversation = [];
                aiAutoApplyEnabled = true;
                aiChatLog.innerHTML = '<div class="ai-chat-empty muted">Ask for layout ideas, canvas changes, dimensions, icons, and iterative edits.</div>';
                clearAiAttachment();
            }

            function formatAttachmentSize(sizeBytes = 0) {
                if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
                if (sizeBytes < 1024) return `${sizeBytes} B`;
                if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
                return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
            }

            function updateAttachmentMeta() {
                if (!aiAttachment) {
                    aiAttachmentMeta.textContent = '';
                    aiClearFileBtn.disabled = true;
                    return;
                }
                aiAttachmentMeta.textContent = `Attached: ${aiAttachment.name} (${formatAttachmentSize(aiAttachment.size)})`;
                aiClearFileBtn.disabled = false;
            }

            function clearAiAttachment() {
                aiAttachment = null;
                aiFileInput.value = '';
                updateAttachmentMeta();
            }

            function arrayBufferToBase64(buffer) {
                const bytes = new Uint8Array(buffer);
                const chunkSize = 0x8000;
                let binary = '';
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, i + chunkSize);
                    binary += String.fromCharCode(...chunk);
                }
                return btoa(binary);
            }

            function isTextLikeFile(file) {
                if (!file) return false;
                const type = (file.type || '').toLowerCase();
                const name = (file.name || '').toLowerCase();
                return type.startsWith('text/')
                    || type.includes('json')
                    || type.includes('xml')
                    || type.includes('csv')
                    || name.endsWith('.txt')
                    || name.endsWith('.md')
                    || name.endsWith('.json')
                    || name.endsWith('.csv')
                    || name.endsWith('.svg');
            }

            async function readFileAsDataUrl(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(String(e.target?.result || ''));
                    reader.onerror = () => reject(new Error('Failed to read image file.'));
                    reader.readAsDataURL(file);
                });
            }

            async function optimizeImageDataUrl(dataUrl, maxSide = AI_ATTACHMENT_IMAGE_MAX_SIDE, quality = AI_ATTACHMENT_IMAGE_QUALITY) {
                const parsed = String(dataUrl || '').match(/^data:(.*?);base64,(.*)$/);
                if (!parsed?.[1] || !parsed?.[2]) return null;
                const sourceMime = parsed[1];
                const sourceBase64 = parsed[2];
                if (!sourceMime.startsWith('image/')) {
                    return { mimeType: sourceMime, base64Data: sourceBase64 };
                }
                if (sourceBase64.length <= 900000) {
                    return { mimeType: sourceMime, base64Data: sourceBase64 };
                }
                try {
                    const img = await new Promise((resolve, reject) => {
                        const el = new Image();
                        el.onload = () => resolve(el);
                        el.onerror = () => reject(new Error('Failed to decode image attachment.'));
                        el.src = dataUrl;
                    });
                    const naturalW = Math.max(1, parseInt(img.naturalWidth, 10) || parseInt(img.width, 10) || 1);
                    const naturalH = Math.max(1, parseInt(img.naturalHeight, 10) || parseInt(img.height, 10) || 1);
                    const aggressiveMaxSide = sourceBase64.length > 2200000 ? Math.min(maxSide, 1100) : maxSide;
                    const ratio = Math.min(1, aggressiveMaxSide / Math.max(naturalW, naturalH));
                    const targetW = Math.max(1, Math.round(naturalW * ratio));
                    const targetH = Math.max(1, Math.round(naturalH * ratio));
                    const canvasEl = document.createElement('canvas');
                    canvasEl.width = targetW;
                    canvasEl.height = targetH;
                    const ctx = canvasEl.getContext('2d', { alpha: false });
                    if (!ctx) return { mimeType: sourceMime, base64Data: sourceBase64 };
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, targetW, targetH);
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                    const qualitySteps = [quality, 0.68, 0.58, 0.48, 0.4]
                        .filter((value, index, arr) => Number.isFinite(value) && value > 0.2 && arr.indexOf(value) === index);
                    let bestMime = sourceMime;
                    let bestBase64 = sourceBase64;
                    for (let i = 0; i < qualitySteps.length; i++) {
                        const compressedDataUrl = canvasEl.toDataURL('image/jpeg', qualitySteps[i]);
                        const compressedMatch = String(compressedDataUrl).match(/^data:(.*?);base64,(.*)$/);
                        if (!compressedMatch?.[1] || !compressedMatch?.[2]) continue;
                        bestMime = compressedMatch[1];
                        bestBase64 = compressedMatch[2];
                        if (bestBase64.length <= AI_ATTACHMENT_IMAGE_TARGET_BASE64) break;
                    }
                    if (!bestMime || !bestBase64) {
                        return { mimeType: sourceMime, base64Data: sourceBase64 };
                    }
                    return {
                        mimeType: bestMime,
                        base64Data: bestBase64
                    };
                } catch (_) {
                    return { mimeType: sourceMime, base64Data: sourceBase64 };
                }
            }

            async function toAttachmentPayload(file) {
                if (!file) return null;

                if (file.type && file.type.startsWith('image/')) {
                    const dataUrl = await readFileAsDataUrl(file);
                    const optimized = await optimizeImageDataUrl(dataUrl);
                    const mimeType = optimized?.mimeType;
                    const base64Data = optimized?.base64Data;
                    if (!mimeType || !base64Data) throw new Error('Invalid image attachment format.');
                    return {
                        name: file.name || 'image',
                        size: Math.max(file.size || 0, Math.ceil(base64Data.length * 0.75)),
                        kind: 'inline',
                        mimeType,
                        inlineData: base64Data
                    };
                }

                if (isTextLikeFile(file)) {
                    const raw = await file.text();
                    const text = raw.length > AI_MAX_TEXT_ATTACHMENT_CHARS
                        ? `${raw.slice(0, AI_MAX_TEXT_ATTACHMENT_CHARS)}\n...[truncated]`
                        : raw;
                    return {
                        name: file.name || 'text-file',
                        size: file.size || 0,
                        kind: 'text',
                        text
                    };
                }

                const binarySize = file.size || 0;
                if (binarySize > AI_MAX_BINARY_ATTACHMENT_BYTES) {
                    throw new Error('Attachment is too large. Keep binary files under 4 MB.');
                }
                const buffer = await file.arrayBuffer();
                return {
                    name: file.name || 'attachment',
                    size: binarySize,
                    kind: 'inline',
                    mimeType: file.type || 'application/octet-stream',
                    inlineData: arrayBufferToBase64(buffer)
                };
            }

            function summarizeActiveSelection() {
                const active = canvas.getActiveObject();
                if (!active) return 'none';
                if (active.type === 'activeSelection' && typeof active.getObjects === 'function') {
                    const members = active.getObjects().filter(Boolean);
                    const counts = {};
                    members.slice(0, 8).forEach(member => {
                        const type = String(member?.type || 'object');
                        counts[type] = (counts[type] || 0) + 1;
                    });
                    const typeSummary = Object.entries(counts)
                        .slice(0, 4)
                        .map(([type, count]) => `${count} ${type}`)
                        .join(', ');
                    return `${members.length} selected objects${typeSummary ? ` (${typeSummary})` : ''}`;
                }
                const name = active.name || active.type || 'object';
                const width = Math.round(active.getScaledWidth?.() || active.width || 0);
                const height = Math.round(active.getScaledHeight?.() || active.height || 0);
                const details = [`${width}x${height}`];
                const fill = typeof active.fill === 'string' ? active.fill : '';
                const stroke = typeof active.stroke === 'string' ? active.stroke : '';
                if ((active.type === 'textbox' || active.type === 'i-text') && typeof active.text === 'string') {
                    details.push(`text="${clampText(active.text, 30)}"`);
                    if (fill) details.push(`color=${fill}`);
                } else if (fill) {
                    details.push(`fill=${fill}`);
                }
                if (stroke) details.push(`stroke=${stroke}`);
                return `${name} (${details.join(', ')})`;
            }

            function buildEditorContextSummary() {
                const currentPage = documentPages[currentPageIndex] || {};
                const pagesSummary = documentPages
                    .slice(0, 12)
                    .map((p, idx) => {
                        const w = parsePositiveInt(p?.width, DEFAULT_PAGE_WIDTH);
                        const h = parsePositiveInt(p?.height, DEFAULT_PAGE_HEIGHT);
                        return `${idx + 1}:${w}x${h}${idx === currentPageIndex ? '*' : ''}`;
                    })
                    .join(', ');
                const columns = headers.length
                    ? `${headers.slice(0, AI_MAX_CONTEXT_COLUMNS).join(', ')}${headers.length > AI_MAX_CONTEXT_COLUMNS ? ', ...' : ''}`
                    : 'none';
                const objectCount = canvas.getObjects()
                    .filter(o => o && o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine && !o.isCanvasGhost && !o.isArtboard)
                    .length;
                return [
                    `Pages: ${documentPages.length || 1} (${pagesSummary || '1:768x1024*'})`,
                    `Current page index (1-based): ${currentPageIndex + 1}`,
                    `Current page size: ${parsePositiveInt(currentPage.width, DEFAULT_PAGE_WIDTH)}x${parsePositiveInt(currentPage.height, DEFAULT_PAGE_HEIGHT)}`,
                    `Objects on current page: ${objectCount}`,
                    `Active selection: ${summarizeActiveSelection()}`,
                    `Data columns: ${columns}`
                ].join('\n');
            }

            function buildConversationSummary(limit = 12) {
                const maxItems = Math.max(1, Math.min(limit, AI_MAX_CONVERSATION_ITEMS));
                const subset = aiConversation.slice(-maxItems);
                if (!subset.length) return 'No prior chat context.';
                return subset
                    .map(msg => `${msg.role.toUpperCase()}: ${clampText(msg.text, AI_MAX_CONVERSATION_CHARS)}`)
                    .join('\n');
            }

            function summarizeAppliedActions(actions = []) {
                if (!Array.isArray(actions) || !actions.length) return 'none';
                return actions
                    .slice(0, AI_MAX_APPLIED_ACTIONS)
                    .map((action, idx) => `${idx + 1}. ${clampText(JSON.stringify(action), AI_MAX_APPLIED_ACTION_CHARS)}`)
                    .join('\n');
            }

            function buildCopilotPrompt(userPrompt, options = {}) {
                const phase = String(options.phase || 'full').toLowerCase() === 'draft' ? 'draft' : 'full';
                const maxActions = phase === 'draft' ? 5 : 12;
                const applyMode = aiAutoApplyEnabled ? 'apply' : 'plan_only';
                const includeConversation = options.includeConversation !== false;
                const appliedActions = Array.isArray(options.appliedActions) ? options.appliedActions : [];
                const phaseInstructions = phase === 'draft'
                    ? `Pass type: DRAFT.
- Return only the first ${maxActions} high-impact actions that create visible structure fast.
- Prioritize page/canvas size, major containers, and key headings.
- Do not over-plan. Make progress immediately.`
                    : `Pass type: REFINE.
- Improve polish, spacing, visual hierarchy, and details.
- Avoid repeating actions already applied.`;
                return `
You are the CSVLink AI Copilot. Your job is to ACTUALLY BUILD what the user requests by returning concrete JSON actions.
Do not only describe ideas. Return executable actions whenever canvas edits are requested.
You collaborate iteratively and return compact tool actions, not full Fabric JSON.
Return strict JSON only (no markdown, no code fences):
{
  "reply": "short natural-language response",
  "actions": [
    { "type": "action_name", "...": "params" }
  ]
}

Execution mode: ${applyMode}
- If mode is "plan_only", still propose actions, but keep them low risk.
- Prefer small batches (max ${maxActions} actions) and high-value edits first.
- If the request needs no canvas changes, return an empty "actions" array.
- Default to autonomous decisions. Ask a question only when a critical requirement is missing.
- Keep "reply" operational and brief (max 12 words). No narrative explanations.
- If "Objects on current page" is 0 and user asks for design/layout work, include at least 3 creation actions
  (like add_text/add_shape/add_icon/add_table/add_image_url) before any selection-only actions.
${phaseInstructions}

Available action types:
1) { "type": "add_canvas", "count": 1, "width": 1080, "height": 1350 }
2) { "type": "switch_canvas", "index": 1 }
3) { "type": "set_canvas_size", "scope": "current|all", "width": 1080, "height": 1350 }
4) { "type": "set_title", "title": "My Template" }
5) { "type": "add_text", "text": "Inbox", "x": "center|number|percent", "y": "number|percent|top|center|bottom", "fontSize": 56, "fontFamily": "Inter", "color": "#0f172a", "align": "left|center|right", "width": 700, "curve": -100..100 }
6) { "type": "add_shape", "shape": "rect|square|circle|triangle|line|arrow|star", "x": "center|number", "y": "number", "width": 700, "height": 96, "fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "radius": 14, "opacity": 1 }
7) { "type": "add_icon", "name": "inbox", "x": "number|center", "y": "number", "size": 42, "color": "#334155" }
8) { "type": "add_image_url", "url": "https://...", "x": "center|number", "y": "number", "width": 320, "height": 180, "opacity": 1 }
9) { "type": "add_table", "x": "center|number", "y": "number", "rows": 6, "cols": 4, "cellWidth": 160, "cellHeight": 56, "headerRows": 1 }
10) { "type": "duplicate_selection" }
11) { "type": "delete_selection" }
12) { "type": "clear_canvas" }
13) { "type": "select_all" }
14) { "type": "move_selection", "target": "selection|all", "x": "center|number|percent", "y": "number|percent|top|center|bottom", "dx": 24, "dy": -10 }
15) { "type": "resize_selection", "target": "selection|all", "width": 640, "height": 320, "scale": 1.1 }
16) { "type": "style_selection", "target": "selection|all", "fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "opacity": 1, "color": "#0f172a", "fontSize": 16, "fontFamily": "Inter", "align": "left|center|right", "radius": 12, "curve": -100..100 }
17) { "type": "remove_outside_objects" }
18) { "type": "replace_canvas_json", "canvas": { "version": "5.3.0", "objects": [] }, "width": 768, "height": 1024 }

Coordinate rules:
- Numeric x/y are relative to current page top-left.
- "center" means visual center of current page.
- "50%" means 50 percent of current page width/height.

Canvas JSON rules:
- You receive current-page JSON context in the request. Use it for precise edits.
- Prefer standard action types for small changes.
- Use "replace_canvas_json" for full structural rewrites.

Design quality rules:
- Use an 8px spacing rhythm (8/16/24/32/48/64) and clean alignment.
- Build strong hierarchy: one clear headline, supporting subtext, then details.
- Favor subtle strokes (#cbd5e1), readable contrast, and rounded corners (8-18).
- Keep outputs modular: several focused actions, not one giant monolithic change.

Icon source (preferred):
${AI_ICON_BASE}/{icon-name}.svg

Current editor context:
${buildEditorContextSummary()}

Recent conversation:
${includeConversation ? buildConversationSummary() : 'Skipped for draft speed.'}

Already applied actions (do not repeat):
${summarizeAppliedActions(appliedActions)}

User request:
${userPrompt || '(Attachment-only request)'}
`.trim();
            }

            function parseAiJsonResponse(rawText) {
                if (!rawText || typeof rawText !== 'string') return null;
                const trimmed = rawText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                const candidates = [trimmed];
                const objectMatch = trimmed.match(/\{[\s\S]*\}/);
                if (objectMatch?.[0] && objectMatch[0] !== trimmed) candidates.push(objectMatch[0]);
                const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
                if (arrayMatch?.[0] && arrayMatch[0] !== trimmed) candidates.push(arrayMatch[0]);

                for (const candidate of candidates) {
                    try {
                        return JSON.parse(candidate);
                    } catch (_) {
                        continue;
                    }
                }
                return null;
            }

            function normalizeAiParsedPayload(parsed, fallbackReply = 'Done.') {
                if (Array.isArray(parsed)) {
                    return { reply: 'Generated action plan.', actions: parsed };
                }
                if (!parsed || typeof parsed !== 'object') {
                    return { reply: fallbackReply, actions: [] };
                }
                let actions = Array.isArray(parsed.actions)
                    ? parsed.actions
                    : Array.isArray(parsed.plan)
                        ? parsed.plan
                        : [];
                if (!actions.length && parsed.action && typeof parsed.action === 'object') {
                    actions = [parsed.action];
                }
                if (!actions.length) {
                    const canvasPayload = parsed.canvas
                        || parsed.canvas_json
                        || parsed.canvasJson
                        || parsed.page?.canvas
                        || (Array.isArray(parsed.objects) ? {
                            version: '5.3.0',
                            background: 'transparent',
                            objects: parsed.objects
                        } : null);
                    if (canvasPayload && typeof canvasPayload === 'object') {
                        actions = [{
                            type: 'replace_canvas_json',
                            canvas: canvasPayload,
                            width: parsed.page?.width ?? parsed.width,
                            height: parsed.page?.height ?? parsed.height
                        }];
                    }
                }
                return {
                    reply: String(parsed.reply || parsed.message || parsed.summary || fallbackReply),
                    actions
                };
            }

            function extractActionsFromPlainText(rawText) {
                if (!rawText || typeof rawText !== 'string') return [];
                const actions = [];
                const lower = rawText.toLowerCase();
                const countWords = {
                    one: 1,
                    two: 2,
                    three: 3,
                    four: 4,
                    five: 5,
                    six: 6,
                    seven: 7,
                    eight: 8
                };
                const parseCountToken = (token) => {
                    if (!token) return null;
                    const direct = parseInt(token, 10);
                    if (Number.isFinite(direct)) return direct;
                    const byWord = countWords[String(token).trim().toLowerCase()];
                    return Number.isFinite(byWord) ? byWord : null;
                };

                const addCanvasMatch = lower.match(/\b(?:add|create|make|generate|build)\s+((?:\d+|one|two|three|four|five|six|seven|eight))\s+(?:new\s+)?(?:canvas(?:es)?|page(?:s)?)\b/);
                if (addCanvasMatch?.[1]) {
                    actions.push({ type: 'add_canvas', count: parseCountToken(addCanvasMatch[1]) || 1 });
                } else if (/\b(?:add|create|make|generate|build)\s+(?:a|one|new)\s+(?:canvas|page)\b/.test(lower)) {
                    actions.push({ type: 'add_canvas', count: 1 });
                } else if (/\b(?:add|create|make|generate|build)\s+(?:new\s+)?(?:canvases|pages)\b/.test(lower)) {
                    const inferredCount = /\b(multiple|several|few)\b/.test(lower) ? 3 : 2;
                    actions.push({ type: 'add_canvas', count: inferredCount });
                } else if (/\b(?:add|create|make|generate|build)\s+(?:new\s+)?(?:canvas|page)\b/.test(lower)) {
                    actions.push({ type: 'add_canvas', count: 1 });
                }

                const switchMatch = lower.match(/\b(?:switch|go|jump|open|move)\s+(?:to\s+)?(?:canvas|page)\s*(\d+)\b/);
                if (switchMatch?.[1]) {
                    actions.push({ type: 'switch_canvas', index: parseInt(switchMatch[1], 10) });
                }

                const sizeMatch = lower.match(/\b(\d{3,5})\s*(?:x|×|by)\s*(\d{3,5})\b/);
                if (sizeMatch?.[1] && sizeMatch?.[2]) {
                    actions.push({
                        type: 'set_canvas_size',
                        scope: /\ball\b/.test(lower) && /\b(?:canvas|canvases|pages)\b/.test(lower) ? 'all' : 'current',
                        width: parseInt(sizeMatch[1], 10),
                        height: parseInt(sizeMatch[2], 10)
                    });
                }

                const titleMatch = rawText.match(/\b(?:title|name)\s+(?:it|template)?\s*(?:to|as)?\s*["“]([^"”]{2,120})["”]/i);
                if (titleMatch?.[1]) {
                    actions.push({ type: 'set_title', title: titleMatch[1].trim() });
                }

                const headingMatch = rawText.match(/\b(?:add|create|make)\s+(?:a\s+)?(?:title|heading|headline)\s*(?:that\s+says|saying|called|named)?\s*["“]([^"”]{2,120})["”]/i);
                if (headingMatch?.[1]) {
                    actions.push({ type: 'add_text', text: headingMatch[1].trim(), x: 'center', y: '18%', align: 'center' });
                }

                if (/\bclear\s+(?:the\s+)?canvas\b/.test(lower)) {
                    actions.push({ type: 'clear_canvas' });
                }
                if (/\bduplicate\b/.test(lower) && /\b(?:selection|selected)\b/.test(lower)) {
                    actions.push({ type: 'duplicate_selection' });
                }
                if (/\b(delete|remove)\b/.test(lower) && /\b(?:selection|selected)\b/.test(lower)) {
                    actions.push({ type: 'delete_selection' });
                }
                if (/\bselect\s+all\b/.test(lower)) {
                    actions.push({ type: 'select_all' });
                }
                if (/\bcleanup\b/.test(lower) && /\boutside\b/.test(lower)) {
                    actions.push({ type: 'remove_outside_objects' });
                }

                return actions;
            }

            function normalizeAiAction(raw) {
                if (!raw || typeof raw !== 'object') return null;
                const next = { ...raw };
                const rawType = String(next.type || next.tool || next.action || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
                if (!rawType) {
                    const canvasPayload = next.canvas
                        || next.canvas_json
                        || next.canvasJson
                        || next.page?.canvas
                        || (Array.isArray(next.objects) ? {
                            version: '5.3.0',
                            background: 'transparent',
                            objects: next.objects
                        } : null);
                    if (canvasPayload && typeof canvasPayload === 'object') {
                        return {
                            ...next,
                            type: 'replace_canvas_json',
                            canvas: canvasPayload,
                            width: next.page?.width ?? next.width,
                            height: next.page?.height ?? next.height
                        };
                    }
                    return null;
                }
                const aliases = {
                    create_canvas: 'add_canvas',
                    create_canvases: 'add_canvas',
                    new_canvas: 'add_canvas',
                    add_page: 'add_canvas',
                    add_pages: 'add_canvas',
                    create_page: 'add_canvas',
                    create_pages: 'add_canvas',
                    new_page: 'add_canvas',
                    new_pages: 'add_canvas',
                    switch_page: 'switch_canvas',
                    go_to_page: 'switch_canvas',
                    goto_page: 'switch_canvas',
                    resize_canvas: 'set_canvas_size',
                    resize_page: 'set_canvas_size',
                    set_page_size: 'set_canvas_size',
                    set_dimensions: 'set_canvas_size',
                    change_dimensions: 'set_canvas_size',
                    set_page_dimensions: 'set_canvas_size',
                    change_page_dimensions: 'set_canvas_size',
                    add_rectangle: 'add_shape',
                    add_rect: 'add_shape',
                    add_circle: 'add_shape',
                    add_triangle: 'add_shape',
                    add_line: 'add_shape',
                    add_star: 'add_shape',
                    add_arrow: 'add_shape',
                    add_heading: 'add_text',
                    add_headline: 'add_text',
                    add_title: 'add_text',
                    set_heading: 'add_text',
                    remove_selection: 'delete_selection',
                    delete_selected: 'delete_selection',
                    remove_selected: 'delete_selection',
                    clear_current_canvas: 'clear_canvas',
                    clear_page: 'clear_canvas',
                    copy_selection: 'duplicate_selection',
                    duplicate_selected: 'duplicate_selection',
                    select_everything: 'select_all',
                    select_all_objects: 'select_all',
                    move_selected: 'move_selection',
                    move_objects: 'move_selection',
                    nudge_selection: 'move_selection',
                    scale_selection: 'resize_selection',
                    resize_selected: 'resize_selection',
                    format_selection: 'style_selection',
                    set_selection_style: 'style_selection',
                    style_selected: 'style_selection',
                    cleanup_outside_objects: 'remove_outside_objects',
                    remove_outside: 'remove_outside_objects',
                    set_canvas_json: 'replace_canvas_json',
                    update_canvas_json: 'replace_canvas_json',
                    edit_canvas_json: 'replace_canvas_json',
                    replace_canvas_json: 'replace_canvas_json',
                    replace_canvas_state: 'replace_canvas_json',
                    replace_page_json: 'replace_canvas_json'
                };
                const type = aliases[rawType] || rawType;
                if (!type) return null;
                if (type === 'add_shape' && !next.shape && rawType.startsWith('add_')) {
                    next.shape = rawType.replace('add_', '');
                }
                if (type === 'add_canvas') {
                    if (!Number.isFinite(parseInt(next.count, 10))) {
                        const countFallback = parseInt(next.pages ?? next.pageCount ?? next.quantity ?? next.number, 10);
                        if (Number.isFinite(countFallback)) next.count = countFallback;
                    }
                    if (!next.width && Number.isFinite(parseFloat(next.w ?? next.pageWidth ?? next.canvasWidth))) {
                        next.width = parseFloat(next.w ?? next.pageWidth ?? next.canvasWidth);
                    }
                    if (!next.height && Number.isFinite(parseFloat(next.h ?? next.pageHeight ?? next.canvasHeight))) {
                        next.height = parseFloat(next.h ?? next.pageHeight ?? next.canvasHeight);
                    }
                }
                if (type === 'switch_canvas' && next.index == null) {
                    const candidate = parseInt(next.page ?? next.pageIndex ?? next.canvas ?? next.canvasIndex, 10);
                    if (Number.isFinite(candidate)) next.index = candidate;
                }
                if (type === 'set_canvas_size') {
                    if (!next.width && Number.isFinite(parseFloat(next.w ?? next.pageWidth ?? next.canvasWidth))) {
                        next.width = parseFloat(next.w ?? next.pageWidth ?? next.canvasWidth);
                    }
                    if (!next.height && Number.isFinite(parseFloat(next.h ?? next.pageHeight ?? next.canvasHeight))) {
                        next.height = parseFloat(next.h ?? next.pageHeight ?? next.canvasHeight);
                    }
                    if (!next.scope) {
                        if (next.all === true || next.applyToAll === true || next.target === 'all') next.scope = 'all';
                        if (next.current === true) next.scope = 'current';
                    }
                }
                if (type === 'add_text') {
                    if (!next.text && typeof next.title === 'string') next.text = next.title;
                    if (!next.text && typeof next.content === 'string') next.text = next.content;
                    if (!next.text && typeof next.value === 'string') next.text = next.value;
                    if (!next.fontSize && Number.isFinite(parseFloat(next.size))) next.fontSize = parseFloat(next.size);
                }
                if (type === 'add_shape') {
                    if (!next.shape && typeof next.kind === 'string') next.shape = next.kind;
                    if (!next.width && Number.isFinite(parseFloat(next.w))) next.width = parseFloat(next.w);
                    if (!next.height && Number.isFinite(parseFloat(next.h))) next.height = parseFloat(next.h);
                }
                if (type === 'add_icon' && !next.name) {
                    const iconName = next.icon ?? next.iconName ?? next.value;
                    if (typeof iconName === 'string' && iconName.trim()) next.name = iconName.trim();
                }
                if (type === 'add_image_url' && !next.url) {
                    const imageUrl = next.src ?? next.imageUrl ?? next.image;
                    if (typeof imageUrl === 'string' && imageUrl.trim()) next.url = imageUrl.trim();
                }
                if (type === 'move_selection') {
                    if (next.dx == null && Number.isFinite(parseFloat(next.deltaX ?? next.offsetX))) {
                        next.dx = parseFloat(next.deltaX ?? next.offsetX);
                    }
                    if (next.dy == null && Number.isFinite(parseFloat(next.deltaY ?? next.offsetY))) {
                        next.dy = parseFloat(next.deltaY ?? next.offsetY);
                    }
                }
                if (type === 'resize_selection') {
                    if (!next.width && Number.isFinite(parseFloat(next.w))) next.width = parseFloat(next.w);
                    if (!next.height && Number.isFinite(parseFloat(next.h))) next.height = parseFloat(next.h);
                }
                if (type === 'replace_canvas_json') {
                    if (!next.canvas || typeof next.canvas !== 'object') {
                        const canvasPayload = next.canvas_json
                            || next.canvasJson
                            || next.page?.canvas
                            || (Array.isArray(next.objects) ? {
                                version: '5.3.0',
                                background: 'transparent',
                                objects: next.objects
                            } : null);
                        if (canvasPayload && typeof canvasPayload === 'object') next.canvas = canvasPayload;
                    }
                    if (!next.width && Number.isFinite(parseFloat(next.page?.width))) {
                        next.width = parseFloat(next.page.width);
                    }
                    if (!next.height && Number.isFinite(parseFloat(next.page?.height))) {
                        next.height = parseFloat(next.page.height);
                    }
                }
                return { ...next, type };
            }

            function getEditableCanvasObjects() {
                return canvas.getObjects().filter(o =>
                    o && o.oid !== 'pageRect' && !o.excludeFromExport && !o.isSnapLine && !o.isCanvasGhost && !o.isArtboard
                );
            }

            function getActionTargetObjects(action = {}) {
                const targetMode = String(action.target || 'selection').toLowerCase();
                if (targetMode === 'all') return getEditableCanvasObjects();
                const active = canvas.getActiveObject();
                if (!active) return [];
                if (active.type === 'activeSelection' && typeof active.getObjects === 'function') {
                    return active.getObjects().filter(Boolean);
                }
                return [active];
            }

            function ensureActionSelectionTarget(action = {}) {
                const targetMode = String(action.target || 'selection').toLowerCase();
                if (targetMode !== 'all') return canvas.getActiveObject();
                const objects = getEditableCanvasObjects();
                if (!objects.length) return null;
                if (objects.length === 1) {
                    canvas.setActiveObject(objects[0]);
                    return objects[0];
                }
                const selection = new fabric.ActiveSelection(objects, { canvas });
                canvas.setActiveObject(selection);
                return selection;
            }

            function buildCanvasSnapshotPart() {
                try {
                    if (!canvas?.lowerCanvasEl || typeof canvas.toDataURL !== 'function') return null;
                    const width = Number(canvas.lowerCanvasEl.width) || 0;
                    const height = Number(canvas.lowerCanvasEl.height) || 0;
                    if (!width || !height) return null;
                    const maxSide = Math.max(width, height);
                    const multiplier = Math.max(0.2, Math.min(1, AI_CANVAS_SNAPSHOT_MAX_SIDE / maxSide));
                    const dataUrl = canvas.toDataURL({
                        format: 'jpeg',
                        quality: AI_CANVAS_SNAPSHOT_QUALITY,
                        multiplier
                    });
                    const [, mimeType, base64Data] = String(dataUrl).match(/^data:(.*?);base64,(.*)$/) || [];
                    if (!mimeType || !base64Data) return null;
                    if (base64Data.length > 1_100_000) return null;
                    return {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    };
                } catch (err) {
                    console.warn('Unable to build AI canvas snapshot.', err);
                    return null;
                }
            }

            function buildCanvasJsonContextPart() {
                try {
                    if (typeof syncCurrentPageStateFromCanvas === 'function') {
                        syncCurrentPageStateFromCanvas();
                    }
                    const page = documentPages[currentPageIndex] || {};
                    const pageWidth = parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH);
                    const pageHeight = parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT);
                    const canvasState = (typeof sanitizeCanvasStateForEditor === 'function')
                        ? sanitizeCanvasStateForEditor(page.canvas, { pageWidth, pageHeight })
                        : (page.canvas || { version: '5.3.0', background: 'transparent', objects: [] });
                    const basePayload = {
                        page: {
                            index: currentPageIndex + 1,
                            width: pageWidth,
                            height: pageHeight
                        },
                        canvas: canvasState
                    };
                    let serialized = JSON.stringify(basePayload);
                    if (serialized.length > AI_MAX_CANVAS_JSON_CHARS) {
                        const trimmedObjects = Array.isArray(canvasState?.objects)
                            ? canvasState.objects.slice(0, AI_MAX_CANVAS_JSON_OBJECTS)
                            : [];
                        serialized = JSON.stringify({
                            page: basePayload.page,
                            canvas: {
                                ...canvasState,
                                objects: trimmedObjects
                            },
                            note: `Object list truncated to first ${AI_MAX_CANVAS_JSON_OBJECTS} entries.`
                        });
                    }
                    if (serialized.length > AI_MAX_CANVAS_JSON_CHARS) {
                        serialized = `${serialized.slice(0, AI_MAX_CANVAS_JSON_CHARS)}...[truncated]`;
                    }
                    return {
                        text: `Current editable canvas JSON (current page):\n${serialized}`
                    };
                } catch (err) {
                    console.warn('Unable to build AI canvas JSON context.', err);
                    return null;
                }
            }

            function getCurrentPageFrame() {
                const current = documentPages[currentPageIndex] || {};
                const width = parsePositiveInt(pageRect?.width, parsePositiveInt(current.width, DEFAULT_PAGE_WIDTH));
                const height = parsePositiveInt(pageRect?.height, parsePositiveInt(current.height, DEFAULT_PAGE_HEIGHT));
                const left = normalizeNumeric(pageRect?.left, getPageLayoutLeft(currentPageIndex));
                const top = normalizeNumeric(pageRect?.top, 0);
                return {
                    left,
                    top,
                    width,
                    height,
                    centerX: left + width / 2,
                    centerY: top + height / 2
                };
            }

            function promptHasDesignIntent(promptText = '') {
                const lower = String(promptText || '').toLowerCase();
                return /\b(design|designer|redesign|recreate|layout|mockup|hero|landing|poster|flyer|ui|screen|interface|template|style|look|visual|polish|card|section|resume|cv|curriculum|portfolio|document|doc)\b/.test(lower);
            }

            function promptRequestsCanvasMutation(promptText = '') {
                const lower = String(promptText || '').toLowerCase();
                const intent = /\b(add|create|make|build|generate|design|redesign|recreate|change|update|edit|modify|move|resize|style|apply|do|convert|transform)\b/.test(lower);
                const domain = /\b(canvas|page|pages|template|layout|design|ui|screen|element|elements|object|objects|shape|text|icon|image|table|resume|cv|document|doc|portfolio)\b/.test(lower);
                return intent && domain;
            }

            function inferDesignerHeading(promptText = '') {
                const raw = String(promptText || '').trim();
                const quoted = raw.match(/["“]([^"”]{3,90})["”]/);
                if (quoted?.[1]) return clampText(quoted[1], 72);
                const lower = raw.toLowerCase();
                if (/\b(login|sign[\s-]?in|auth)\b/.test(lower)) return 'Welcome Back';
                if (/\b(sign[\s-]?up|register|onboard)\b/.test(lower)) return 'Create Your Account';
                if (/\b(dashboard|analytics|report)\b/.test(lower)) return 'Performance Overview';
                if (/\b(profile|account)\b/.test(lower)) return 'Account Settings';
                if (/\b(ecommerce|product|shop|store)\b/.test(lower)) return 'Featured Products';
                if (/\b(resume|cv|curriculum|portfolio)\b/.test(lower)) return 'Your Name';
                return 'Design Draft';
            }

            function buildDesignerBootstrapActions(promptText = '') {
                if (!promptHasDesignIntent(promptText) && !promptRequestsCanvasMutation(promptText) && !aiAttachment) return [];
                const lower = String(promptText || '').toLowerCase();
                const resetIntent = /\b(from scratch|start over|blank|clean slate|new design)\b/.test(lower);
                const existingObjects = getEditableCanvasObjects().length;
                if (!resetIntent && existingObjects > 2) {
                    return [{
                        type: 'add_text',
                        text: inferDesignerHeading(promptText),
                        x: 'center',
                        y: '10%',
                        width: Math.max(220, Math.round(getCurrentPageFrame().width * 0.78)),
                        align: 'center',
                        color: '#0f172a',
                        fontSize: Math.max(18, Math.round(getCurrentPageFrame().width * 0.03)),
                        fontFamily: 'Inter'
                    }];
                }

                const frame = getCurrentPageFrame();
                const heading = inferDesignerHeading(promptText);
                const headlineY = Math.max(56, Math.round(frame.height * 0.16));
                const panelHeight = Math.max(200, Math.round(frame.height * 0.58));
                const panelWidth = Math.max(260, Math.round(Math.min(frame.width * 0.88, 980)));
                const subtitleY = Math.max(headlineY + 52, Math.round(frame.height * 0.27));

                return [
                    {
                        type: 'add_shape',
                        shape: 'rect',
                        x: 'center',
                        y: 'center',
                        width: panelWidth,
                        height: panelHeight,
                        fill: '#ffffff',
                        stroke: '#dbe2ea',
                        strokeWidth: 1,
                        radius: 18
                    },
                    {
                        type: 'add_text',
                        text: heading,
                        x: 'center',
                        y: headlineY,
                        width: Math.max(220, Math.round(frame.width * 0.82)),
                        align: 'center',
                        color: '#0f172a',
                        fontSize: Math.max(26, Math.round(frame.width * 0.062)),
                        fontFamily: 'Inter'
                    },
                    {
                        type: 'add_text',
                        text: 'Starter layout added. Ask for sections, icons, and style refinements.',
                        x: 'center',
                        y: subtitleY,
                        width: Math.max(220, Math.round(frame.width * 0.75)),
                        align: 'center',
                        color: '#334155',
                        fontSize: Math.max(13, Math.round(frame.width * 0.02)),
                        fontFamily: 'Inter'
                    }
                ];
            }

            function buildNoOpRescueActions(promptText = '') {
                if (!promptRequestsCanvasMutation(promptText) && !promptHasDesignIntent(promptText) && !aiAttachment) return [];
                const existingObjects = getEditableCanvasObjects().length;
                if (!existingObjects) return buildDesignerBootstrapActions(promptText);
                const frame = getCurrentPageFrame();
                return [{
                    type: 'add_text',
                    text: inferDesignerHeading(promptText),
                    x: 'center',
                    y: Math.max(32, Math.round(frame.height * 0.1)),
                    width: Math.max(220, Math.round(frame.width * 0.8)),
                    align: 'center',
                    color: '#0f172a',
                    fontSize: Math.max(18, Math.round(frame.width * 0.03)),
                    fontFamily: 'Inter'
                }];
            }

            function shouldIncludeCanvasSnapshot(promptText = '') {
                const lower = String(promptText || '').toLowerCase();
                const hasObjects = getEditableCanvasObjects().length > 0;
                if (!hasObjects) return false;
                if (aiAttachment?.kind === 'inline') return true;
                return /\b(edit|update|adjust|tweak|modify|improve|refine|align|move|resize|restyle|based on|this canvas|existing)\b/.test(lower);
            }

            function shouldSkipRemoteAiCall(promptText = '', quickActions = []) {
                return false;
            }

            function resolveAxisCoordinate(value, axis, frame, fallback) {
                if (Number.isFinite(value)) {
                    return (axis === 'x' ? frame.left : frame.top) + value;
                }
                if (typeof value !== 'string') return fallback;
                const raw = value.trim().toLowerCase();
                if (!raw) return fallback;

                if (raw.endsWith('%')) {
                    const pct = parseFloat(raw.slice(0, -1));
                    if (Number.isFinite(pct)) {
                        const ratio = Math.max(0, Math.min(100, pct)) / 100;
                        return axis === 'x'
                            ? frame.left + frame.width * ratio
                            : frame.top + frame.height * ratio;
                    }
                }

                if (raw === 'center' || raw === 'middle') return axis === 'x' ? frame.centerX : frame.centerY;
                if (axis === 'x' && raw === 'left') return frame.left + 24;
                if (axis === 'x' && raw === 'right') return frame.left + frame.width - 24;
                if (axis === 'y' && raw === 'top') return frame.top + 24;
                if (axis === 'y' && raw === 'bottom') return frame.top + frame.height - 24;

                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed)) {
                    return (axis === 'x' ? frame.left : frame.top) + parsed;
                }
                return fallback;
            }

            function resolveActionPoint(action = {}) {
                const frame = getCurrentPageFrame();
                const spawn = getDefaultSpawnPoint();
                return {
                    x: resolveAxisCoordinate(action.x, 'x', frame, spawn.x),
                    y: resolveAxisCoordinate(action.y, 'y', frame, spawn.y)
                };
            }

            function applyCommonObjectStyles(obj, action = {}) {
                if (!obj) return;
                const patch = {};
                if (typeof action.fill === 'string') patch.fill = action.fill;
                if (typeof action.color === 'string' && obj.type === 'textbox') patch.fill = action.color;
                if (typeof action.stroke === 'string') patch.stroke = action.stroke;
                if (Number.isFinite(parseFloat(action.strokeWidth))) patch.strokeWidth = Math.max(0, parseFloat(action.strokeWidth));
                if (Number.isFinite(parseFloat(action.opacity))) patch.opacity = Math.max(0, Math.min(1, parseFloat(action.opacity)));
                obj.set(patch);

                if (obj.type === 'textbox') {
                    if (typeof action.text === 'string') obj.set({ text: action.text });
                    if (Number.isFinite(parseFloat(action.fontSize))) obj.set({ fontSize: Math.max(8, parseFloat(action.fontSize)) });
                    if (typeof action.fontFamily === 'string' && action.fontFamily.trim()) {
                        const requestedFamily = action.fontFamily.trim();
                        ensureFontFamilyLoaded(requestedFamily);
                        obj.set({ fontFamily: requestedFamily });
                    }
                    if (typeof action.align === 'string') obj.set({ textAlign: action.align });
                    if (Number.isFinite(parseFloat(action.width))) obj.set({ width: Math.max(24, parseFloat(action.width)) });
                    if (Number.isFinite(parseFloat(action.curve))) {
                        setTextboxCurve(obj, parseFloat(action.curve), { skipRender: true });
                    } else {
                        refreshTextboxCurve(obj, { skipRender: true });
                    }
                }

                if (obj.type === 'rect' && Number.isFinite(parseFloat(action.radius))) {
                    const r = Math.max(0, parseFloat(action.radius));
                    obj.set({ rx: r, ry: r });
                }

                obj.setCoords();
            }

            function moveSelectionFromAction(action = {}) {
                const target = ensureActionSelectionTarget(action);
                if (!target) return 'No selection to move.';

                const deltaX = parseFloat(action.dx);
                const deltaY = parseFloat(action.dy);
                const hasDelta = Number.isFinite(deltaX) || Number.isFinite(deltaY);
                if (hasDelta) {
                    target.set({
                        left: normalizeNumeric(target.left, 0) + (Number.isFinite(deltaX) ? deltaX : 0),
                        top: normalizeNumeric(target.top, 0) + (Number.isFinite(deltaY) ? deltaY : 0)
                    });
                } else {
                    const frame = getCurrentPageFrame();
                    const fallbackX = normalizeNumeric(target.left, frame.centerX);
                    const fallbackY = normalizeNumeric(target.top, frame.centerY);
                    const nextX = resolveAxisCoordinate(action.x, 'x', frame, fallbackX);
                    const nextY = resolveAxisCoordinate(action.y, 'y', frame, fallbackY);
                    if (typeof target.setPositionByOrigin === 'function') {
                        target.setPositionByOrigin(new fabric.Point(nextX, nextY), 'center', 'center');
                    } else {
                        target.set({ left: nextX, top: nextY });
                    }
                }

                target.setCoords();
                canvas.requestRenderAll();
                return 'Moved selection.';
            }

            function resizeSelectionFromAction(action = {}) {
                const target = ensureActionSelectionTarget(action);
                if (!target) return 'No selection to resize.';

                const requestedW = parseFloat(action.width);
                const requestedH = parseFloat(action.height);
                const requestedScale = parseFloat(action.scale);
                let changed = false;

                if (Number.isFinite(requestedScale) && requestedScale > 0) {
                    target.set({
                        scaleX: (target.scaleX || 1) * requestedScale,
                        scaleY: (target.scaleY || 1) * requestedScale
                    });
                    changed = true;
                }

                const currentW = Math.max(1, target.getScaledWidth?.() || target.width || 1);
                const currentH = Math.max(1, target.getScaledHeight?.() || target.height || 1);

                if (Number.isFinite(requestedW) && requestedW > 0) {
                    target.set({ scaleX: (target.scaleX || 1) * (requestedW / currentW) });
                    changed = true;
                }
                if (Number.isFinite(requestedH) && requestedH > 0) {
                    target.set({ scaleY: (target.scaleY || 1) * (requestedH / currentH) });
                    changed = true;
                }

                if (!changed) return 'Skipped resize: no width/height/scale provided.';
                target.setCoords();
                canvas.requestRenderAll();
                return 'Resized selection.';
            }

            function styleSelectionFromAction(action = {}) {
                const objects = getActionTargetObjects(action);
                if (!objects.length) return 'No selection to style.';
                objects.forEach(obj => applyCommonObjectStyles(obj, action));
                canvas.requestRenderAll();
                return `Styled ${objects.length} selected object${objects.length === 1 ? '' : 's'}.`;
            }

            async function addImageFromUrl(url, action = {}) {
                const { x, y } = resolveActionPoint(action);
                return new Promise((resolve, reject) => {
                    fabric.Image.fromURL(url, (img) => {
                        if (!img) {
                            reject(new Error('Image could not be loaded.'));
                            return;
                        }
                        img.set({
                            left: x,
                            top: y,
                            originX: 'center',
                            originY: 'center',
                            name: getUniqueName('image'),
                            pageId: currentCanvasPageId()
                        });

                        const targetW = parseFloat(action.width);
                        const targetH = parseFloat(action.height);
                        if (Number.isFinite(targetW) && Number.isFinite(targetH) && img.width && img.height) {
                            img.set({ scaleX: targetW / img.width, scaleY: targetH / img.height });
                        } else if (Number.isFinite(targetW)) {
                            img.scaleToWidth(Math.max(8, targetW));
                        } else if (Number.isFinite(targetH)) {
                            img.scaleToHeight(Math.max(8, targetH));
                        }

                        applyCommonObjectStyles(img, action);
                        canvas.add(img).setActiveObject(img);
                        resolve(img);
                    }, { crossOrigin: 'anonymous' });
                });
            }

            async function addSvgFromUrl(url, action = {}) {
                const { x, y } = resolveActionPoint(action);
                return new Promise((resolve, reject) => {
                    fabric.loadSVGFromURL(url, (objects, options) => {
                        if (!objects || !objects.length) {
                            reject(new Error('SVG returned no drawable objects.'));
                            return;
                        }
                        const tint = typeof action.color === 'string' ? action.color : null;
                        objects.forEach(obj => {
                            obj.objectCaching = false;
                            if (tint) {
                                if (typeof obj.fill === 'string' && obj.fill !== 'none') obj.set({ fill: tint });
                                if (typeof obj.stroke === 'string' && obj.stroke !== 'none') obj.set({ stroke: tint });
                            }
                        });
                        const group = new fabric.Group(objects, {
                            ...options,
                            left: x,
                            top: y,
                            originX: 'center',
                            originY: 'center',
                            isSvgGroup: true,
                            objectCaching: false,
                            name: getUniqueName('icon'),
                            pageId: currentCanvasPageId()
                        });
                        const targetSize = Math.max(8, parseFloat(action.size) || 96);
                        group.scaleToWidth(targetSize);
                        applyCommonObjectStyles(group, action);
                        canvas.add(group).setActiveObject(group);
                        resolve(group);
                    }, null, { crossOrigin: 'anonymous' });
                });
            }

            function parseActionIndex(value, fallback = 0) {
                const raw = parseInt(value, 10);
                if (!Number.isFinite(raw)) return fallback;
                if (raw >= 1) return raw - 1;
                return raw;
            }

            async function executeAiAction(action) {
                switch (action.type) {
                    case 'add_canvas': {
                        const count = Math.max(1, Math.min(8, parseInt(action.count, 10) || 1));
                        const width = parsePositiveInt(action.width, parsePositiveInt(generalPageSize.width, DEFAULT_PAGE_WIDTH));
                        const height = parsePositiveInt(action.height, parsePositiveInt(generalPageSize.height, DEFAULT_PAGE_HEIGHT));
                        for (let i = 0; i < count; i++) {
                            await addCanvasPage(documentPages.length, { width, height });
                        }
                        return `Added ${count} canvas${count === 1 ? '' : 'es'} (${width}x${height}).`;
                    }
                    case 'switch_canvas': {
                        if (!documentPages.length) return 'No canvases available.';
                        const target = Math.max(0, Math.min(documentPages.length - 1, parseActionIndex(action.index, currentPageIndex)));
                        await switchToCanvasPage(target, { fitView: false });
                        return `Switched to canvas ${target + 1}.`;
                    }
                    case 'set_canvas_size': {
                        const width = parsePositiveInt(action.width, parsePositiveInt(generalPageSize.width, DEFAULT_PAGE_WIDTH));
                        const height = parsePositiveInt(action.height, parsePositiveInt(generalPageSize.height, DEFAULT_PAGE_HEIGHT));
                        const scope = String(action.scope || 'current').toLowerCase();

                        if (scope === 'all') {
                            $('#pageWidth').value = width;
                            $('#pageHeight').value = height;
                            if (typeof setPageDimensions === 'function') {
                                setPageDimensions();
                                if (typeof setPageDimensions.flush === 'function') setPageDimensions.flush();
                            }
                            return `Updated matching canvases to ${width}x${height}.`;
                        }

                        syncCurrentPageStateFromCanvas();
                        const page = documentPages[currentPageIndex];
                        if (!page) return 'No active canvas to resize.';
                        page.width = width;
                        page.height = height;
                        ensurePageRectInCanvasState(page);
                        await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
                        generalPageSize = getMostCommonPageSize();
                        syncGeneralPageSizeInputs();
                        return `Resized current canvas to ${width}x${height}.`;
                    }
                    case 'set_title': {
                        const title = String(action.title || '').trim();
                        if (!title) return 'Skipped empty title.';
                        $('#titleInput').value = title;
                        return `Set title to "${title}".`;
                    }
                    case 'replace_canvas_json': {
                        syncCurrentPageStateFromCanvas();
                        const page = documentPages[currentPageIndex];
                        if (!page) return 'No active canvas available.';
                        const candidate = action.canvas
                            || action.canvas_json
                            || action.canvasJson
                            || action.page?.canvas
                            || (Array.isArray(action.objects) ? {
                                version: '5.3.0',
                                background: 'transparent',
                                objects: action.objects
                            } : null);
                        if (!candidate || typeof candidate !== 'object') {
                            return 'Skipped invalid canvas JSON payload.';
                        }
                        const width = parsePositiveInt(
                            action.width ?? action.page?.width,
                            parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH)
                        );
                        const height = parsePositiveInt(
                            action.height ?? action.page?.height,
                            parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT)
                        );
                        const nextCanvas = (typeof sanitizeCanvasStateForEditor === 'function')
                            ? sanitizeCanvasStateForEditor(candidate, { pageWidth: width, pageHeight: height })
                            : candidate;

                        page.width = width;
                        page.height = height;
                        page.canvas = nextCanvas;
                        ensurePageRectInCanvasState(page);
                        await switchToCanvasPage(currentPageIndex, { fitView: false, skipSave: true, suppressHistory: true });
                        const objectCount = Array.isArray(page.canvas?.objects)
                            ? page.canvas.objects.filter(obj => obj && obj.oid !== 'pageRect').length
                            : 0;
                        return `Replaced current canvas JSON (${objectCount} object${objectCount === 1 ? '' : 's'}).`;
                    }
                    case 'add_text': {
                        const { x, y } = resolveActionPoint(action);
                        adders.text(x, y, String(action.text || 'Text'));
                        const obj = canvas.getActiveObject();
                        applyCommonObjectStyles(obj, action);
                        return `Added text "${String(action.text || 'Text').slice(0, 48)}".`;
                    }
                    case 'add_shape': {
                        const shape = String(action.shape || 'rect').toLowerCase();
                        const { x, y } = resolveActionPoint(action);
                        if (shape === 'rect' || shape === 'rectangle') adders.rect({ x, y, asSquare: false });
                        else if (shape === 'square') adders.square(x, y);
                        else if (shape === 'circle') adders.circle(x, y);
                        else if (shape === 'triangle') adders.triangle(x, y);
                        else if (shape === 'line') adders.line(x, y);
                        else if (shape === 'arrow') adders.arrow(x, y);
                        else if (shape === 'star') adders.star(x, y);
                        else return `Unknown shape "${shape}".`;

                        const obj = canvas.getActiveObject();
                        if (obj && Number.isFinite(parseFloat(action.width)) && Number.isFinite(parseFloat(action.height)) && obj.type !== 'line') {
                            const nextW = Math.max(4, parseFloat(action.width));
                            const nextH = Math.max(4, parseFloat(action.height));
                            if (obj.type === 'circle') {
                                obj.set({ radius: Math.max(2, Math.min(nextW, nextH) / 2) });
                            } else {
                                obj.set({ width: nextW, height: nextH });
                            }
                        }
                        applyCommonObjectStyles(obj, action);
                        return `Added ${shape}.`;
                    }
                    case 'add_icon': {
                        const iconName = String(action.name || 'sparkles').toLowerCase().replace(/[^a-z0-9-]/g, '');
                        const iconUrls = [
                            `${AI_ICON_BASE}/${iconName}.svg`,
                            `https://api.iconify.design/lucide/${iconName}.svg`,
                            `https://api.iconify.design/mdi/${iconName}.svg`
                        ];
                        let loaded = false;
                        let lastError = null;
                        for (const iconUrl of iconUrls) {
                            try {
                                await addSvgFromUrl(iconUrl, action);
                                loaded = true;
                                break;
                            } catch (err) {
                                lastError = err;
                            }
                        }
                        if (!loaded) throw (lastError || new Error(`Icon "${iconName}" could not be loaded.`));
                        return `Added icon "${iconName}".`;
                    }
                    case 'add_image_url': {
                        const url = String(action.url || '').trim();
                        if (!url) return 'Skipped missing image URL.';
                        if (/\.svg(\?|$)/i.test(url)) {
                            await addSvgFromUrl(url, action);
                        } else {
                            await addImageFromUrl(url, action);
                        }
                        return 'Added image from URL.';
                    }
                    case 'add_table': {
                        const { x, y } = resolveActionPoint(action);
                        const rows = Math.max(1, parsePositiveInt(action.rows, 4));
                        const cols = Math.max(1, parsePositiveInt(action.cols, 3));
                        const table = createTableObject({
                            x,
                            y,
                            rows,
                            cols,
                            cellWidth: Math.max(30, parsePositiveInt(action.cellWidth, 140)),
                            cellHeight: Math.max(24, parsePositiveInt(action.cellHeight, 52)),
                            headerRows: Math.max(0, Math.min(rows, parseInt(action.headerRows, 10) || 1))
                        });
                        canvas.add(table).setActiveObject(table);
                        return `Added table ${rows}x${cols}.`;
                    }
                    case 'duplicate_selection': {
                        const duplicated = await duplicateSelection();
                        if (!duplicated) return 'Nothing selected to duplicate.';
                        return 'Duplicated selection.';
                    }
                    case 'delete_selection': {
                        const activeObjects = canvas.getActiveObjects();
                        if (!activeObjects.length) return 'No selection to delete.';
                        removeCanvasObjects(activeObjects);
                        return `Deleted ${activeObjects.length} selected object${activeObjects.length === 1 ? '' : 's'}.`;
                    }
                    case 'clear_canvas': {
                        const removable = getEditableCanvasObjects();
                        if (!removable.length) return 'Canvas already empty.';
                        removeCanvasObjects(removable);
                        return `Cleared ${removable.length} object${removable.length === 1 ? '' : 's'} from current canvas.`;
                    }
                    case 'select_all': {
                        const objects = getEditableCanvasObjects();
                        if (!objects.length) return 'No objects available on this canvas.';
                        if (objects.length === 1) {
                            canvas.setActiveObject(objects[0]);
                        } else {
                            canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
                        }
                        canvas.requestRenderAll();
                        return `Selected ${objects.length} object${objects.length === 1 ? '' : 's'}.`;
                    }
                    case 'move_selection':
                        return moveSelectionFromAction(action);
                    case 'resize_selection':
                        return resizeSelectionFromAction(action);
                    case 'style_selection':
                        return styleSelectionFromAction(action);
                    case 'remove_outside_objects': {
                        if (typeof removeObjectsOutsideAllCanvasPages !== 'function') {
                            return 'Outside-object cleanup is not available.';
                        }
                        const removed = removeObjectsOutsideAllCanvasPages(null, true);
                        return removed ? 'Removed objects fully outside all canvases.' : 'No outside objects were removed.';
                    }
                    default:
                        return `Skipped unsupported action "${action.type}".`;
                }
            }

            function buildAiSafetyPolicy(promptText = '') {
                const lower = String(promptText || '').toLowerCase();
                const allowClear = /\b(clear|wipe|empty|erase|reset)\b[\s\S]{0,48}\b(canvas|page|design|everything|all)\b/.test(lower)
                    || /\b(start over|from scratch|clean slate)\b/.test(lower);
                const allowDeleteSelection = /\b(delete|remove)\b[\s\S]{0,24}\b(selection|selected|object|element|item|layer)\b/.test(lower)
                    || /\b(delete|remove)\b[\s\S]{0,24}\b(all|everything)\b/.test(lower);
                const allowOutsideCleanup = /\b(remove|cleanup|clean)\b[\s\S]{0,24}\b(outside|off[- ]?canvas)\b/.test(lower);
                return {
                    allowClear,
                    allowDeleteSelection,
                    allowOutsideCleanup,
                    allowEmptyResult: allowClear || allowDeleteSelection || allowOutsideCleanup
                };
            }

            function filterAiActionsForSafety(actions, safetyPolicy) {
                const safe = [];
                const blocked = [];
                const policy = safetyPolicy || buildAiSafetyPolicy('');
                (actions || []).forEach(action => {
                    if (!action || typeof action !== 'object') return;
                    const type = String(action.type || '');
                    if (type === 'clear_canvas' && !policy.allowClear) {
                        blocked.push(action);
                        return;
                    }
                    if (type === 'delete_selection' && !policy.allowDeleteSelection) {
                        blocked.push(action);
                        return;
                    }
                    if (type === 'remove_outside_objects' && !policy.allowOutsideCleanup) {
                        blocked.push(action);
                        return;
                    }
                    if (type === 'replace_canvas_json' && !policy.allowClear) {
                        const candidate = action.canvas
                            || action.canvas_json
                            || action.canvasJson
                            || action.page?.canvas;
                        const hasDrawableObjects = Array.isArray(candidate?.objects)
                            && candidate.objects.some(obj =>
                                obj
                                && obj.oid !== 'pageRect'
                                && !obj.excludeFromExport
                                && !obj.isSnapLine
                                && !obj.isCanvasGhost
                            );
                        if (!hasDrawableObjects && getEditableCanvasObjects().length > 0) {
                            blocked.push(action);
                            return;
                        }
                    }
                    safe.push(action);
                });
                return { safe, blocked };
            }

            async function executeAiActions(actions, statusEl, { allowEmptyResult = false } = {}) {
                if (!Array.isArray(actions) || !actions.length) {
                    statusEl.textContent = 'No canvas actions were generated.';
                    return;
                }

                const beforeCount = getEditableCanvasObjects().length;
                const lines = [];
                for (let i = 0; i < actions.length; i++) {
                    const action = actions[i];
                    const label = `${i + 1}/${actions.length} ${action.type}`;
                    statusEl.textContent = `Applying action ${label}...`;
                    try {
                        const result = await executeAiAction(action);
                        lines.push(`${label}: ${result}`);
                    } catch (err) {
                        lines.push(`${label}: Error - ${err.message}`);
                    }
                }

                canvas.requestRenderAll();
                renderLayers();
                refreshCanvasPageControlsDebounced();
                if (typeof scheduleOutsideObjectsCleanup === 'function') scheduleOutsideObjectsCleanup();
                requestSaveState();

                const afterCount = getEditableCanvasObjects().length;
                if (!allowEmptyResult && beforeCount > 0 && afterCount === 0) {
                    if (typeof undo === 'function') {
                        undo();
                        lines.push('Safety rollback: prevented accidental empty canvas.');
                    } else {
                        lines.push('Safety warning: canvas became empty unexpectedly. Use Undo.');
                    }
                }

                statusEl.textContent = lines.join('\n');
            }

            async function requestAiResponseText(
                apiKey,
                parts,
                {
                    enforceJson = true,
                    onProgress = null,
                    timeoutMs = AI_REQUEST_TIMEOUT_MS,
                    responseSchema = AI_JSON_RESPONSE_SCHEMA
                } = {}
            ) {
                const payload = {
                    contents: [{ parts }]
                };

                if (enforceJson) {
                    payload.generationConfig = {
                        temperature: 0.2,
                        responseMimeType: 'application/json'
                    };
                    if (responseSchema && typeof responseSchema === 'object') {
                        payload.generationConfig.responseSchema = responseSchema;
                    }
                } else {
                    payload.generationConfig = { temperature: 0.2 };
                }

                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

                try {
                    if (typeof onProgress === 'function') {
                        onProgress(enforceJson ? 'Sending request' : 'Retrying request');
                    }

                    const response = await fetch(AI_MODEL_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-goog-api-key': apiKey
                        },
                        body: JSON.stringify(payload),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        const message = errorData.error?.message || 'Unknown error';
                        if (enforceJson && /responsemimetype|responseschema|generationconfig/i.test(String(message))) {
                            return requestAiResponseText(apiKey, parts, { enforceJson: false, onProgress, timeoutMs });
                        }
                        throw new Error(`API Error ${response.status}: ${message}`);
                    }

                    if (typeof onProgress === 'function') onProgress('Reading response');
                    const data = await response.json();
                    return (data?.candidates?.[0]?.content?.parts || [])
                        .map(part => part.text || '')
                        .join('\n')
                        .trim();
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s. Try a shorter prompt.`);
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            function isAiTimeoutError(error) {
                if (!error) return false;
                const message = String(error.message || '');
                return /timed out|timeout|abort/i.test(message) || error.name === 'AbortError';
            }

            function buildAiRepairPrompt(userPrompt, rawResponse) {
                return `
Convert the assistant output below into strict JSON (no markdown):
{
  "reply": "short response",
  "actions": [{ "type": "action_name" }]
}

Allowed action names:
add_canvas, switch_canvas, set_canvas_size, set_title, add_text, add_shape, add_icon, add_image_url, add_table,
duplicate_selection, delete_selection, clear_canvas, select_all, move_selection, resize_selection, style_selection,
remove_outside_objects, replace_canvas_json.

Rules:
- Keep actions small and realistic for the current request.
- If no actionable canvas step exists, return an empty actions array.

Original user request:
${userPrompt || '(Attachment-only request)'}

Assistant output to convert:
${rawResponse}
`.trim();
            }

            async function tryRepairActionsFromText(apiKey, userPrompt, rawResponse, { onProgress = null, timeoutMs = AI_REQUEST_TIMEOUT_MS } = {}) {
                if (!rawResponse) return null;
                try {
                    if (typeof onProgress === 'function') onProgress('Repairing response format');
                    const repairText = await requestAiResponseText(
                        apiKey,
                        [{ text: buildAiRepairPrompt(userPrompt, rawResponse) }],
                        { enforceJson: true, onProgress, timeoutMs }
                    );
                    const repairedParsed = parseAiJsonResponse(repairText);
                    if (!repairedParsed) return null;
                    return normalizeAiParsedPayload(repairedParsed, 'Converted to actions.');
                } catch (err) {
                    console.warn('AI action repair failed:', err);
                    return null;
                }
            }

            function buildGoogleFontsHint(maxItems = 140) {
                const pool = Array.isArray(globalThis.GOOGLE_FONT_FAMILIES)
                    ? globalThis.GOOGLE_FONT_FAMILIES
                    : (Array.isArray(typeof GOOGLE_FONT_FAMILIES !== 'undefined' ? GOOGLE_FONT_FAMILIES : null)
                        ? GOOGLE_FONT_FAMILIES
                        : []);
                if (!pool.length) {
                    return 'All Google Fonts available in the editor are allowed for fontFamily.';
                }
                const sample = pool.slice(0, Math.max(20, maxItems)).join(', ');
                const truncated = pool.length > maxItems ? ', ...' : '';
                return `All Google Fonts are available for fontFamily (${pool.length} families). Use any Google font name exactly. Sample list: ${sample}${truncated}`;
            }

            function getCurrentPageDimensionsForAi() {
                const page = documentPages[currentPageIndex] || {};
                return {
                    width: parsePositiveInt(page.width, DEFAULT_PAGE_WIDTH),
                    height: parsePositiveInt(page.height, DEFAULT_PAGE_HEIGHT)
                };
            }

            function buildCreativeFabricPrompt(userPrompt, { pageWidth, pageHeight } = {}) {
                const width = parsePositiveInt(pageWidth, DEFAULT_PAGE_WIDTH);
                const height = parsePositiveInt(pageHeight, DEFAULT_PAGE_HEIGHT);
                return `
You are a senior UI/visual designer working directly with Fabric.js object JSON.
Return ONLY a JSON array of drawable Fabric.js objects for ONE page.
Do not return markdown, explanations, wrappers, template schemas, or top-level objects.

Canvas size:
- width: ${width}
- height: ${height}

Allowed object types only:
rect, circle, triangle, textbox, image, line, path, group, polygon, polyline, ellipse.

Strict rules:
- Never include pageRect/isArtboard objects.
- Use top-left anchors: "originX":"left", "originY":"top".
- Keep every object fully inside canvas bounds.
- Prefer "textbox" for text. Keep text wrapping using sensible width.
- For textboxes: keep scaleX=1 and scaleY=1, size via width/fontSize.
- If styles is present on text, use an array.
- Never use textBaseline "alphabetical" (use "alphabetic" or omit).
- Do not use clipPath, transformMatrix, filters, scripts, or non-Fabric custom code.
- Use professional layout quality (spacing rhythm, alignment, readable hierarchy).
${buildGoogleFontsHint()}

User request:
${userPrompt || '(Attachment-only request)'}

Return format example:
[
  { "type":"rect","originX":"left","originY":"top","left":0,"top":0,"width":${width},"height":120,"fill":"#0f172a" },
  { "type":"textbox","originX":"left","originY":"top","left":36,"top":34,"width":420,"text":"Invoice","fontSize":42,"fontFamily":"Inter","fill":"#ffffff","scaleX":1,"scaleY":1,"styles":[] }
]
`.trim();
            }

            function shouldReplaceCurrentCanvasForAi(promptText = '', hasAttachment = false) {
                if (hasAttachment) return true;
                const text = String(promptText || '').toLowerCase();
                if (!text.trim()) return false;
                const replaceIntent = /\b(recreate|create|design|redesign|from scratch|start over|new layout|build a|make a)\b/i.test(text);
                const additiveIntent = /\b(add|append|insert|place|include)\b/i.test(text) && !replaceIntent;
                if (replaceIntent) return true;
                if (additiveIntent) return false;
                return true;
            }

            function buildCreativeAiRequestParts(promptText, { pageWidth, pageHeight, retry = false } = {}) {
                const parts = [{ text: buildCreativeFabricPrompt(promptText, { pageWidth, pageHeight }) }];
                if (!aiAttachment) return parts;
                parts.push({ text: `Reference attachment: ${aiAttachment.name}. Recreate/align design to this reference when relevant.` });
                if (aiAttachment.kind === 'inline') {
                    parts.push({
                        inline_data: {
                            mime_type: aiAttachment.mimeType || 'application/octet-stream',
                            data: aiAttachment.inlineData
                        }
                    });
                } else if (aiAttachment.kind === 'text') {
                    const maxChars = retry ? AI_RETRY_TEXT_ATTACHMENT_CHARS : AI_MAX_TEXT_ATTACHMENT_CHARS;
                    const rawText = String(aiAttachment.text || '');
                    const attachmentText = rawText.length > maxChars
                        ? `${rawText.slice(0, maxChars)}\n...[truncated]`
                        : rawText;
                    parts.push({ text: `Attached file text:\n${attachmentText}` });
                }
                return parts;
            }

            function extractCandidateTextFromGeminiChunk(data) {
                const parts = data?.candidates?.[0]?.content?.parts;
                if (!Array.isArray(parts)) return '';
                return parts
                    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
                    .join('');
            }

            function computeStreamTextDelta(nextText, state) {
                const incoming = String(nextText || '');
                if (!incoming) return '';
                if (!state.lastText) {
                    state.lastText = incoming;
                    return incoming;
                }
                if (incoming === state.lastText) return '';
                if (incoming.startsWith(state.lastText)) {
                    const delta = incoming.slice(state.lastText.length);
                    state.lastText = incoming;
                    return delta;
                }
                if (state.lastText.startsWith(incoming)) {
                    state.lastText = incoming;
                    return '';
                }
                let prefixLen = 0;
                const max = Math.min(state.lastText.length, incoming.length);
                while (prefixLen < max && state.lastText[prefixLen] === incoming[prefixLen]) {
                    prefixLen += 1;
                }
                state.lastText = incoming;
                return incoming.slice(prefixLen);
            }

            async function requestAiResponseTextStream(
                apiKey,
                parts,
                {
                    onProgress = null,
                    timeoutMs = AI_CREATIVE_REQUEST_TIMEOUT_MS,
                    onTextChunk = null,
                    temperature = 0.72
                } = {}
            ) {
                const payload = {
                    contents: [{ parts }],
                    generationConfig: {
                        temperature,
                        responseMimeType: 'application/json'
                    }
                };
                const abortController = new AbortController();
                const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
                const streamState = { lastText: '' };
                let assembledText = '';
                try {
                    if (typeof onProgress === 'function') onProgress('Opening live stream');
                    const response = await fetch(AI_MODEL_STREAM_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-goog-api-key': apiKey
                        },
                        body: JSON.stringify(payload),
                        signal: abortController.signal
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        const message = errorData.error?.message || `HTTP ${response.status}`;
                        throw new Error(`API Error ${response.status}: ${message}`);
                    }

                    if (!response.body || typeof response.body.getReader !== 'function') {
                        throw new Error('Streaming response body is unavailable.');
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let sseBuffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        sseBuffer += decoder.decode(value, { stream: true });

                        let boundaryMatch = sseBuffer.match(/\r?\n\r?\n/);
                        while (boundaryMatch && Number.isFinite(boundaryMatch.index)) {
                            const boundaryIndex = boundaryMatch.index;
                            const separatorLength = boundaryMatch[0].length || 2;
                            const eventBlock = sseBuffer.slice(0, boundaryIndex);
                            sseBuffer = sseBuffer.slice(boundaryIndex + separatorLength);
                            boundaryMatch = sseBuffer.match(/\r?\n\r?\n/);

                            const lines = eventBlock.split(/\r?\n/);
                            const dataLines = lines
                                .filter((line) => line.startsWith('data:'))
                                .map((line) => line.slice(5).trimStart());
                            if (!dataLines.length) continue;
                            const dataText = dataLines.join('\n').trim();
                            if (!dataText || dataText === '[DONE]') continue;

                            let chunkData = null;
                            try {
                                chunkData = JSON.parse(dataText);
                            } catch (_) {
                                continue;
                            }
                            const candidateText = extractCandidateTextFromGeminiChunk(chunkData);
                            if (!candidateText) continue;
                            const delta = computeStreamTextDelta(candidateText, streamState);
                            if (!delta) continue;
                            assembledText += delta;
                            if (typeof onTextChunk === 'function') onTextChunk(delta, assembledText);
                        }
                    }

                    const finalFlush = decoder.decode();
                    if (finalFlush) {
                        sseBuffer += finalFlush;
                    }
                    if (sseBuffer.trim()) {
                        const lines = sseBuffer.split(/\r?\n/);
                        const dataLines = lines
                            .filter((line) => line.startsWith('data:'))
                            .map((line) => line.slice(5).trimStart());
                        const dataText = dataLines.join('\n').trim();
                        if (dataText && dataText !== '[DONE]') {
                            try {
                                const chunkData = JSON.parse(dataText);
                                const candidateText = extractCandidateTextFromGeminiChunk(chunkData);
                                const delta = computeStreamTextDelta(candidateText, streamState);
                                if (delta) {
                                    assembledText += delta;
                                    if (typeof onTextChunk === 'function') onTextChunk(delta, assembledText);
                                }
                            } catch (_) {
                                // ignore incomplete final event
                            }
                        }
                    }
                    return assembledText;
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s. Try a shorter prompt.`);
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            function createStreamingFabricArrayParser() {
                let text = '';
                let scanIndex = 0;
                let startedArray = false;
                let objectStart = -1;
                let objectDepth = 0;
                let inString = false;
                let escaped = false;
                const parsedObjects = [];

                const push = (chunkText) => {
                    const incoming = String(chunkText || '');
                    if (!incoming) return [];
                    text += incoming;
                    const newObjects = [];

                    for (let i = scanIndex; i < text.length; i++) {
                        const ch = text[i];
                        if (!startedArray) {
                            if (ch === '[') startedArray = true;
                            continue;
                        }

                        if (objectStart < 0) {
                            if (ch === '{') {
                                objectStart = i;
                                objectDepth = 1;
                                inString = false;
                                escaped = false;
                            }
                            continue;
                        }

                        if (escaped) {
                            escaped = false;
                            continue;
                        }

                        if (ch === '\\' && inString) {
                            escaped = true;
                            continue;
                        }

                        if (ch === '"') {
                            inString = !inString;
                            continue;
                        }

                        if (!inString) {
                            if (ch === '{') {
                                objectDepth += 1;
                            } else if (ch === '}') {
                                objectDepth -= 1;
                                if (objectDepth === 0) {
                                    const objectText = text.slice(objectStart, i + 1);
                                    objectStart = -1;
                                    try {
                                        const parsed = JSON.parse(objectText);
                                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                            parsedObjects.push(parsed);
                                            newObjects.push(parsed);
                                        }
                                    } catch (_) {
                                        // Ignore malformed fragment; final parse fallback handles this.
                                    }
                                }
                            }
                        }
                    }

                    scanIndex = text.length;
                    return newObjects;
                };

                const finalize = () => {
                    const parsed = parseAiJsonResponse(text);
                    if (Array.isArray(parsed)) {
                        const missing = parsed.slice(parsedObjects.length).filter(obj => obj && typeof obj === 'object' && !Array.isArray(obj));
                        if (missing.length) parsedObjects.push(...missing);
                        return missing;
                    }
                    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.objects)) {
                        const missing = parsed.objects
                            .slice(parsedObjects.length)
                            .filter(obj => obj && typeof obj === 'object' && !Array.isArray(obj));
                        if (missing.length) parsedObjects.push(...missing);
                        return missing;
                    }
                    return [];
                };

                return {
                    push,
                    finalize,
                    getText: () => text,
                    getCount: () => parsedObjects.length
                };
            }

            function parseAiFabricObjectsFromText(rawText) {
                const parsed = parseAiJsonResponse(rawText);
                if (Array.isArray(parsed)) {
                    return parsed.filter(obj => obj && typeof obj === 'object' && !Array.isArray(obj));
                }
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.objects)) {
                    return parsed.objects.filter(obj => obj && typeof obj === 'object' && !Array.isArray(obj));
                }
                return [];
            }

            function enlivenFabricObjectsSafe(rawObjects = []) {
                return new Promise((resolve) => {
                    if (!Array.isArray(rawObjects) || !rawObjects.length) {
                        resolve([]);
                        return;
                    }
                    try {
                        fabric.util.enlivenObjects(rawObjects, (objects) => {
                            resolve(Array.isArray(objects) ? objects.filter(Boolean) : []);
                        }, null);
                    } catch (error) {
                        console.warn('enlivenObjects failed:', error);
                        resolve([]);
                    }
                });
            }

            function clearCurrentPageDrawableObjects() {
                const objects = getEditableCanvasObjects();
                objects.forEach((obj) => canvas.remove(obj));
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }

            function delayMs(ms) {
                const wait = Math.max(0, parseInt(ms, 10) || 0);
                if (!wait) return Promise.resolve();
                return new Promise((resolve) => setTimeout(resolve, wait));
            }

            function buildTemplateJsonEditPrompt(userPrompt) {
                return `
You are the CSVLink Template JSON Editor.
Return ONLY one valid JSON object: the full modified template.

Critical output rules:
- Output must be JSON only. No markdown, no code fences, no explanation text.
- Keep compatibility with CSVLink template loader.
- Preserve existing data/keys unless user asks to change them.
- You may change page dimensions, add/remove/reorder pages, and edit canvas objects per request.
- Every page must include a pageRect object (oid="pageRect") sized to that page.
- If a reference file/image is attached, follow it closely in the generated layout.
- Use top-left object anchoring consistently: set "originX":"left" and "originY":"top" on drawable objects.
- Treat "left"/"top" as the object top-left corner (not center).
- Allowed drawable Fabric object types: rect, circle, triangle, textbox, image, line, path, group, polygon, polyline, ellipse.
- Do NOT use clipPath, transformMatrix, filters, or custom script-like fields.
- For text, prefer Fabric "textbox" objects (not "text" or "i-text") so wrapping works.
- For textboxes, keep "scaleX"/"scaleY" at 1 and control size via "fontSize" + "width".
- If "styles" is present on text objects, keep it as an array ("[]" when unused).
- Never use textBaseline "alphabetical"; use "alphabetic" or omit textBaseline.
- Ensure professional composition:
  - Keep all text fully inside page bounds (no clipping).
  - Keep readable typography and consistent spacing.
  - Use sensible textbox widths so long lines wrap instead of overflowing.
  - Maintain a clean margin (about 20-28px) from page edges for text content.
${buildGoogleFontsHint()}

Expected top-level shape:
{
  "version": "csvlink-template-v2",
  "page": { "title": "Untitled_Template", "width": 768, "height": 1024 },
  "canvas": { "version": "5.3.0", "background": "transparent", "objects": [] },
  "bindings": [],
  "pages": [],
  "currentPageIndex": 0,
  "data": { "headers": [], "rows": [], "identifierColumn": "" }
}

User instruction:
${userPrompt || '(Attachment-only request)'}
`.trim();
            }

            function getCurrentTemplatePayloadForAi() {
                try {
                    if (typeof buildTemplatePayload === 'function') {
                        const payload = buildTemplatePayload();
                        if (payload && typeof payload === 'object') return payload;
                    }
                } catch (err) {
                    console.warn('Unable to build template payload for AI context.', err);
                }
                const activePage = documentPages[currentPageIndex] || {};
                return {
                    version: 'csvlink-template-v2',
                    page: {
                        title: $('#titleInput')?.value || 'Untitled_Template',
                        width: parsePositiveInt(activePage.width, DEFAULT_PAGE_WIDTH),
                        height: parsePositiveInt(activePage.height, DEFAULT_PAGE_HEIGHT)
                    },
                    canvas: activePage.canvas || { version: '5.3.0', background: 'transparent', objects: [] },
                    bindings: activePage.bindings || [],
                    pages: documentPages || [],
                    currentPageIndex,
                    data: {
                        headers: headers || [],
                        rows: dataRows || [],
                        identifierColumn: identifierColumn || ''
                    }
                };
            }

            function clampStringForAi(value, maxChars = 220) {
                if (value == null) return '';
                const text = typeof value === 'string'
                    ? value
                    : (typeof value === 'number' || typeof value === 'boolean')
                        ? String(value)
                        : (() => {
                            try {
                                return JSON.stringify(value);
                            } catch (_) {
                                return String(value);
                            }
                        })();
                if (text.length <= maxChars) return text;
                return `${text.slice(0, Math.max(12, maxChars - 3))}...`;
            }

            function compactAiScalar(value, maxChars = 120) {
                if (value == null) return '';
                if (typeof value === 'number' && Number.isFinite(value)) return value;
                if (typeof value === 'boolean') return value;
                return clampStringForAi(value, maxChars);
            }

            function roundFinite(value, digits = 2) {
                const num = Number(value);
                if (!Number.isFinite(num)) return null;
                const factor = Math.pow(10, digits);
                return Math.round(num * factor) / factor;
            }

            function compactCanvasObjectForAi(obj, options = {}) {
                if (!obj || typeof obj !== 'object') return null;
                const depth = parseInt(options.depth, 10) || 0;
                const maxDepth = Math.max(1, parseInt(options.maxDepth, 10) || 2);
                const maxTextChars = Math.max(60, parsePositiveInt(options.maxTextChars, 220));
                const maxSrcChars = Math.max(80, parsePositiveInt(options.maxSrcChars, 260));
                const maxChildObjects = Math.max(2, parsePositiveInt(options.maxChildObjects, 8));

                const compacted = {};
                const type = clampStringForAi(obj.type || 'object', 28);
                compacted.type = type;
                if (obj.oid != null) compacted.oid = clampStringForAi(obj.oid, 80);
                if (obj.name != null) compacted.name = clampStringForAi(obj.name, 80);

                const numericKeys = [
                    'left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle', 'opacity',
                    'strokeWidth', 'fontSize', 'lineHeight', 'charSpacing', 'rx', 'ry', 'radius'
                ];
                numericKeys.forEach((key) => {
                    const rounded = roundFinite(obj[key], 2);
                    if (rounded !== null) compacted[key] = rounded;
                });

                const stringKeys = [
                    'fill', 'stroke', 'fontFamily', 'fontWeight', 'fontStyle', 'textAlign', 'textBaseline',
                    'originX', 'originY', 'strokeDashArray', 'globalCompositeOperation'
                ];
                stringKeys.forEach((key) => {
                    if (typeof obj[key] === 'string' && obj[key].trim()) {
                        const limit = key === 'fontFamily' ? 90 : 50;
                        compacted[key] = clampStringForAi(obj[key], limit);
                    }
                });

                if (typeof obj.visible === 'boolean') compacted.visible = obj.visible;
                if (typeof obj.selectable === 'boolean') compacted.selectable = obj.selectable;

                if (typeof obj.text === 'string') {
                    compacted.text = clampStringForAi(obj.text, maxTextChars);
                }
                if (typeof obj.src === 'string') {
                    compacted.src = clampStringForAi(obj.src, maxSrcChars);
                }
                if (Array.isArray(obj.styles) || (obj.styles && typeof obj.styles === 'object')) {
                    compacted.styles = [];
                }

                if (Array.isArray(obj.points) && obj.points.length) {
                    const pointLimit = Math.min(10, obj.points.length);
                    compacted.points = obj.points.slice(0, pointLimit).map((point) => ({
                        x: roundFinite(point?.x, 1) ?? 0,
                        y: roundFinite(point?.y, 1) ?? 0
                    }));
                    if (obj.points.length > pointLimit) {
                        compacted.__pointsTruncated = obj.points.length - pointLimit;
                    }
                }

                if (Array.isArray(obj.path) && obj.path.length) {
                    const pathLimit = Math.min(8, obj.path.length);
                    compacted.path = obj.path.slice(0, pathLimit).map((segment) =>
                        Array.isArray(segment) ? segment.slice(0, 5) : segment
                    );
                    if (obj.path.length > pathLimit) {
                        compacted.__pathTruncated = obj.path.length - pathLimit;
                    }
                }

                if (Array.isArray(obj.objects) && obj.objects.length && depth < maxDepth) {
                    const childLimit = Math.min(maxChildObjects, obj.objects.length);
                    compacted.objects = obj.objects
                        .slice(0, childLimit)
                        .map((child) => compactCanvasObjectForAi(child, {
                            ...options,
                            depth: depth + 1,
                            maxChildObjects: Math.max(2, Math.floor(maxChildObjects * 0.75))
                        }))
                        .filter(Boolean);
                    if (obj.objects.length > childLimit) {
                        compacted.__objectsTruncated = obj.objects.length - childLimit;
                    }
                }

                if (obj.clipPath && typeof obj.clipPath === 'object' && depth < maxDepth) {
                    const compactClip = compactCanvasObjectForAi(obj.clipPath, {
                        ...options,
                        depth: depth + 1,
                        maxChildObjects: Math.max(2, Math.floor(maxChildObjects * 0.6))
                    });
                    if (compactClip) compacted.clipPath = compactClip;
                }

                return compacted;
            }

            function compactCanvasForAi(canvasPayload, options = {}) {
                const source = canvasPayload && typeof canvasPayload === 'object' ? canvasPayload : {};
                const sourceObjects = Array.isArray(source.objects) ? source.objects : [];
                const maxObjectsPerPage = Math.max(12, parsePositiveInt(options.maxObjectsPerPage, AI_MAX_TEMPLATE_OBJECTS_PER_PAGE));
                const includedObjects = sourceObjects
                    .slice(0, maxObjectsPerPage)
                    .map((obj) => compactCanvasObjectForAi(obj, options))
                    .filter(Boolean);
                const compacted = {
                    version: clampStringForAi(source.version || '5.3.0', 16),
                    background: typeof source.background === 'string' ? clampStringForAi(source.background, 40) : 'transparent',
                    objects: includedObjects
                };
                if (sourceObjects.length > includedObjects.length) {
                    compacted.__truncatedObjects = sourceObjects.length - includedObjects.length;
                }
                if (sourceObjects.length) compacted.__objectCount = sourceObjects.length;
                return compacted;
            }

            function compactBindingsForAi(bindings, options = {}) {
                if (!Array.isArray(bindings) || !bindings.length) return [];
                const maxBindings = Math.max(8, parsePositiveInt(options.maxBindings, 80));
                return bindings
                    .slice(0, maxBindings)
                    .map((binding) => {
                        if (Array.isArray(binding)) {
                            return [
                                clampStringForAi(binding[0], 100),
                                clampStringForAi(binding[1], 180)
                            ];
                        }
                        if (binding && typeof binding === 'object') {
                            const compacted = {};
                            const keys = ['oid', 'column', 'property', 'path', 'source', 'target', 'type', 'key'];
                            keys.forEach((key) => {
                                if (binding[key] != null) {
                                    compacted[key] = compactAiScalar(binding[key], 140);
                                }
                            });
                            return Object.keys(compacted).length ? compacted : null;
                        }
                        return clampStringForAi(binding, 180);
                    })
                    .filter(Boolean);
            }

            function compactDataRowsForAi(rows, headers, options = {}) {
                if (!Array.isArray(rows) || !rows.length) return [];
                const maxRows = Math.max(0, parseInt(options.maxRows, 10) || 0);
                if (maxRows <= 0) return [];
                const maxCols = Math.max(1, parsePositiveInt(options.maxCols, 12));
                const maxCellChars = Math.max(24, parsePositiveInt(options.maxCellChars, 80));
                return rows.slice(0, maxRows).map((row) => {
                    if (Array.isArray(row)) {
                        return row
                            .slice(0, maxCols)
                            .map((cell) => compactAiScalar(cell, maxCellChars));
                    }
                    if (row && typeof row === 'object') {
                        const keys = Array.isArray(headers) && headers.length
                            ? headers.slice(0, maxCols)
                            : Object.keys(row).slice(0, maxCols);
                        const compacted = {};
                        keys.forEach((key) => {
                            compacted[key] = compactAiScalar(row[key], maxCellChars);
                        });
                        return compacted;
                    }
                    return compactAiScalar(row, maxCellChars);
                });
            }

            function compactTemplatePayloadForAi(templatePayload, options = {}) {
                const source = templatePayload && typeof templatePayload === 'object' ? templatePayload : {};
                const fallbackPageWidth = parsePositiveInt(source?.page?.width, DEFAULT_PAGE_WIDTH);
                const fallbackPageHeight = parsePositiveInt(source?.page?.height, DEFAULT_PAGE_HEIGHT);
                const sourcePages = Array.isArray(source.pages) && source.pages.length
                    ? source.pages
                    : [{
                        width: fallbackPageWidth,
                        height: fallbackPageHeight,
                        canvas: source.canvas || { version: '5.3.0', background: 'transparent', objects: [] },
                        bindings: source.bindings || []
                    }];
                const totalPages = sourcePages.length;
                const maxPages = Math.max(1, parsePositiveInt(options.maxPages, AI_MAX_TEMPLATE_PAGES_CONTEXT));
                const limitedPages = sourcePages.slice(0, maxPages);
                const currentPage = parseInt(source.currentPageIndex, 10);
                const currentPageIndex = Number.isFinite(currentPage) ? Math.max(0, currentPage) : 0;

                const pages = limitedPages.map((page, idx) => {
                    const width = parsePositiveInt(page?.width, fallbackPageWidth);
                    const height = parsePositiveInt(page?.height, fallbackPageHeight);
                    const canvasPayload = page?.canvas && typeof page.canvas === 'object'
                        ? page.canvas
                        : (idx === currentPageIndex ? source.canvas : null);
                    const canvasCompact = compactCanvasForAi(canvasPayload, options);
                    const pageBindings = compactBindingsForAi(page?.bindings, options);
                    const compactedPage = { width, height, canvas: canvasCompact, bindings: pageBindings };
                    if (page?.name != null) compactedPage.name = clampStringForAi(page.name, 80);
                    if (page?.title != null) compactedPage.title = clampStringForAi(page.title, 80);
                    if (pageBindings.length < (Array.isArray(page?.bindings) ? page.bindings.length : 0)) {
                        compactedPage.__truncatedBindings = (page.bindings.length - pageBindings.length);
                    }
                    return compactedPage;
                });

                const maxHeaders = Math.max(8, parsePositiveInt(options.maxHeaders, 48));
                const headerValues = Array.isArray(source?.data?.headers) ? source.data.headers : [];
                const headersCompact = headerValues
                    .slice(0, maxHeaders)
                    .map((header) => clampStringForAi(header, 120));
                const rowsCompact = compactDataRowsForAi(source?.data?.rows, headersCompact, options);

                const payload = {
                    version: clampStringForAi(source.version || 'csvlink-template-v2', 48),
                    page: {
                        title: clampStringForAi(source?.page?.title || 'Untitled_Template', 120),
                        width: parsePositiveInt(source?.page?.width, fallbackPageWidth),
                        height: parsePositiveInt(source?.page?.height, fallbackPageHeight)
                    },
                    currentPageIndex: Math.min(currentPageIndex, Math.max(0, pages.length - 1)),
                    pages,
                    data: {
                        headers: headersCompact,
                        rows: rowsCompact,
                        identifierColumn: clampStringForAi(source?.data?.identifierColumn || '', 120)
                    }
                };

                if (source.canvas && typeof source.canvas === 'object') {
                    payload.canvas = compactCanvasForAi(source.canvas, options);
                }
                const rootBindings = compactBindingsForAi(source.bindings, options);
                if (rootBindings.length) payload.bindings = rootBindings;

                payload.__meta = {
                    totalPages,
                    includedPages: pages.length,
                    truncatedPages: Math.max(0, totalPages - pages.length),
                    contextMode: options.tight ? 'tight' : 'standard'
                };
                if (headerValues.length > headersCompact.length) {
                    payload.__meta.truncatedHeaders = headerValues.length - headersCompact.length;
                }
                if (Array.isArray(source?.data?.rows) && source.data.rows.length > rowsCompact.length) {
                    payload.__meta.truncatedRows = source.data.rows.length - rowsCompact.length;
                }
                return payload;
            }

            function buildTemplateContextForAi(templatePayload, options = {}) {
                const tight = options.tight === true;
                const maxChars = Math.max(12000, parsePositiveInt(options.maxChars, AI_MAX_TEMPLATE_CONTEXT_CHARS));
                let config = {
                    tight,
                    maxPages: tight ? Math.min(4, AI_MAX_TEMPLATE_PAGES_CONTEXT) : AI_MAX_TEMPLATE_PAGES_CONTEXT,
                    maxObjectsPerPage: tight ? Math.max(24, Math.floor(AI_MAX_TEMPLATE_OBJECTS_PER_PAGE * 0.45)) : AI_MAX_TEMPLATE_OBJECTS_PER_PAGE,
                    maxBindings: tight ? 30 : 80,
                    maxHeaders: tight ? 20 : 48,
                    maxRows: tight ? 1 : 2,
                    maxCols: tight ? 8 : 12,
                    maxCellChars: tight ? 60 : 84,
                    maxTextChars: tight ? 120 : 220,
                    maxSrcChars: tight ? 140 : 280,
                    maxChildObjects: tight ? 4 : 8,
                    maxDepth: tight ? 1 : 2
                };

                let compactPayload = null;
                let jsonText = '';
                for (let attempt = 0; attempt < 6; attempt++) {
                    compactPayload = compactTemplatePayloadForAi(templatePayload, config);
                    jsonText = JSON.stringify(compactPayload);
                    if (jsonText.length <= maxChars) {
                        return {
                            jsonText,
                            charCount: jsonText.length,
                            config,
                            summary: compactPayload.__meta || {}
                        };
                    }
                    config = {
                        ...config,
                        maxPages: Math.max(1, Math.floor(config.maxPages * 0.75)),
                        maxObjectsPerPage: Math.max(12, Math.floor(config.maxObjectsPerPage * 0.68)),
                        maxBindings: Math.max(8, Math.floor(config.maxBindings * 0.65)),
                        maxHeaders: Math.max(8, Math.floor(config.maxHeaders * 0.75)),
                        maxRows: attempt >= 1 ? 0 : Math.max(0, config.maxRows - 1),
                        maxCols: Math.max(4, Math.floor(config.maxCols * 0.75)),
                        maxCellChars: Math.max(30, Math.floor(config.maxCellChars * 0.85)),
                        maxTextChars: Math.max(70, Math.floor(config.maxTextChars * 0.82)),
                        maxSrcChars: Math.max(90, Math.floor(config.maxSrcChars * 0.78)),
                        maxChildObjects: Math.max(2, Math.floor(config.maxChildObjects * 0.75)),
                        maxDepth: attempt >= 2 ? 1 : config.maxDepth
                    };
                }

                const source = templatePayload && typeof templatePayload === 'object' ? templatePayload : {};
                const summaryPages = (Array.isArray(source.pages) ? source.pages : [])
                    .slice(0, 6)
                    .map((page, idx) => ({
                        index: idx,
                        width: parsePositiveInt(page?.width, DEFAULT_PAGE_WIDTH),
                        height: parsePositiveInt(page?.height, DEFAULT_PAGE_HEIGHT),
                        objectCount: Array.isArray(page?.canvas?.objects) ? page.canvas.objects.length : 0
                    }));
                const fallback = {
                    version: clampStringForAi(source.version || 'csvlink-template-v2', 48),
                    page: {
                        title: clampStringForAi(source?.page?.title || 'Untitled_Template', 120),
                        width: parsePositiveInt(source?.page?.width, DEFAULT_PAGE_WIDTH),
                        height: parsePositiveInt(source?.page?.height, DEFAULT_PAGE_HEIGHT)
                    },
                    currentPageIndex: Math.max(0, parseInt(source.currentPageIndex, 10) || 0),
                    data: {
                        headers: Array.isArray(source?.data?.headers)
                            ? source.data.headers.slice(0, 16).map((header) => clampStringForAi(header, 100))
                            : [],
                        rows: [],
                        identifierColumn: clampStringForAi(source?.data?.identifierColumn || '', 100)
                    },
                    pageSummaries: summaryPages,
                    __meta: {
                        contextMode: 'fallback',
                        note: 'Template context trimmed to page summaries due payload size.'
                    }
                };
                const fallbackText = JSON.stringify(fallback);
                return {
                    jsonText: fallbackText,
                    charCount: fallbackText.length,
                    config,
                    summary: fallback.__meta || {}
                };
            }

            function buildTemplateEditorRequestParts(promptText, contextPacket, { retry = false } = {}) {
                const parts = [
                    { text: buildTemplateJsonEditPrompt(promptText) },
                    {
                        text: `Current template JSON context (${contextPacket?.charCount || 0} chars):\n${contextPacket?.jsonText || '{}'}`
                    }
                ];

                if (!aiAttachment) return parts;
                parts.push({ text: `Attached reference file: ${aiAttachment.name}` });
                if (aiAttachment.kind === 'inline') {
                    parts.push({
                        inline_data: {
                            mime_type: aiAttachment.mimeType || 'application/octet-stream',
                            data: aiAttachment.inlineData
                        }
                    });
                    return parts;
                }
                if (aiAttachment.kind === 'text') {
                    const maxChars = retry ? AI_RETRY_TEXT_ATTACHMENT_CHARS : AI_MAX_TEXT_ATTACHMENT_CHARS;
                    const rawText = String(aiAttachment.text || '');
                    const attachmentText = rawText.length > maxChars
                        ? `${rawText.slice(0, maxChars)}\n...[truncated]`
                        : rawText;
                    parts.push({ text: `Attached file text:\n${attachmentText}` });
                }
                return parts;
            }

            function normalizeAiTemplatePayload(raw) {
                if (!raw || typeof raw !== 'object') return null;
                if (raw.template && typeof raw.template === 'object') return raw.template;
                if (raw.result && typeof raw.result === 'object') return raw.result;
                if (raw.output && typeof raw.output === 'object') return raw.output;
                if (raw.pages || raw.canvas || raw.page) return raw;
                return null;
            }

            function toFiniteNumber(value, fallback = 0) {
                const num = parseFloat(value);
                return Number.isFinite(num) ? num : fallback;
            }

            function clampFiniteNumber(value, minValue, maxValue, fallback = minValue) {
                const safeMin = Number.isFinite(minValue) ? minValue : fallback;
                const safeMax = Number.isFinite(maxValue) ? maxValue : fallback;
                if (safeMax < safeMin) return safeMin;
                const num = toFiniteNumber(value, fallback);
                return Math.min(safeMax, Math.max(safeMin, num));
            }

            function sanitizeSafeString(value, maxChars = 120, fallback = '') {
                if (value == null) return fallback;
                const text = String(value).replace(/\u0000/g, '').trim();
                if (!text) return fallback;
                if (text.length <= maxChars) return text;
                return text.slice(0, maxChars);
            }

            function sanitizeSafeColor(value, fallback = '#000000') {
                if (typeof value !== 'string') return fallback;
                const text = value.trim();
                if (!text || text.length > 90) return fallback;
                const lower = text.toLowerCase();
                if (lower.includes('javascript:') || lower.includes('url(') || lower.includes('<') || lower.includes('>')) {
                    return fallback;
                }
                if (/^#([0-9a-f]{3,8})$/i.test(text)) return text;
                if (/^rgba?\(\s*[-\d.,%\s]+\)$/i.test(text)) return text;
                if (/^hsla?\(\s*[-\d.,%\s]+\)$/i.test(text)) return text;
                if (/^[a-z]{3,24}$/i.test(text)) return text;
                if (lower === 'transparent' || lower === 'currentcolor' || lower === 'none') {
                    return lower === 'none' ? 'transparent' : text;
                }
                return fallback;
            }

            function sanitizeSafeImageSrc(value) {
                if (typeof value !== 'string') return '';
                const src = value.trim();
                if (!src || src.length > AI_STRICT_MAX_IMAGE_SRC_CHARS) return '';
                if (/^https?:\/\//i.test(src)) return src;
                if (/^data:image\//i.test(src)) return src;
                if (/^blob:/i.test(src)) return src;
                return '';
            }

            function sanitizeSafeFontFamily(value) {
                const fallback = 'Arial';
                const requested = sanitizeSafeString(value, 90, '');
                if (!requested) return fallback;
                const normalized = requested.replace(/^["']+|["']+$/g, '').trim();
                if (!normalized) return fallback;

                if (typeof GOOGLE_FONT_FAMILY_MAP !== 'undefined' && GOOGLE_FONT_FAMILY_MAP instanceof Map) {
                    const mapped = GOOGLE_FONT_FAMILY_MAP.get(normalized.toLowerCase());
                    if (mapped) return mapped;
                }

                if (typeof FONT_LIST !== 'undefined' && Array.isArray(FONT_LIST)) {
                    const found = FONT_LIST.find((name) => String(name).toLowerCase() === normalized.toLowerCase());
                    if (found) return found;
                }

                return normalized;
            }

            function sanitizeSafeStrokeDashArray(rawDash) {
                if (!Array.isArray(rawDash)) return undefined;
                const dash = rawDash
                    .map((item) => clampFiniteNumber(item, 0, 400, 0))
                    .filter((item) => Number.isFinite(item) && item >= 0)
                    .slice(0, 12);
                return dash.length ? dash : undefined;
            }

            function sanitizeSafePath(rawPath) {
                if (!rawPath) return null;
                if (typeof rawPath === 'string') {
                    const text = rawPath.trim();
                    if (!text || text.length > 6000 || text.includes('<')) return null;
                    return text;
                }
                if (!Array.isArray(rawPath)) return null;
                const segments = rawPath.slice(0, AI_STRICT_MAX_PATH_SEGMENTS);
                const nextSegments = [];
                for (let i = 0; i < segments.length; i++) {
                    const segment = segments[i];
                    if (!Array.isArray(segment) || !segment.length) continue;
                    const cmd = sanitizeSafeString(segment[0], 2, '');
                    if (!cmd) continue;
                    const args = segment
                        .slice(1, 10)
                        .map((value) => clampFiniteNumber(value, -20000, 20000, 0));
                    nextSegments.push([cmd, ...args]);
                }
                return nextSegments.length ? nextSegments : null;
            }

            function sanitizeSafePoints(rawPoints, { pageWidth, pageHeight }) {
                if (!Array.isArray(rawPoints)) return [];
                return rawPoints
                    .slice(0, 220)
                    .map((point) => {
                        if (!point || typeof point !== 'object') return null;
                        const x = clampFiniteNumber(point.x, -pageWidth, pageWidth * 2, 0);
                        const y = clampFiniteNumber(point.y, -pageHeight, pageHeight * 2, 0);
                        return { x, y };
                    })
                    .filter(Boolean);
            }

            function estimateStrictObjectSize(obj, { pageWidth, pageHeight }) {
                if (!obj || typeof obj !== 'object') return { width: 1, height: 1 };
                const type = String(obj.type || '').toLowerCase();
                if (type === 'circle') {
                    const radius = Math.max(1, toFiniteNumber(obj.radius, 24));
                    return { width: radius * 2, height: radius * 2 };
                }
                if (type === 'textbox') {
                    const width = Math.max(40, toFiniteNumber(obj.width, Math.min(280, pageWidth)));
                    const fontSize = Math.max(8, toFiniteNumber(obj.fontSize, 24));
                    const lineHeight = Math.max(0.9, toFiniteNumber(obj.lineHeight, 1.16));
                    const lines = Math.max(1, String(obj.text || '').split('\n').length);
                    const height = Math.max(fontSize * lineHeight * lines + 12, fontSize + 10);
                    return { width, height };
                }
                if (type === 'line') {
                    const width = Math.abs(toFiniteNumber(obj.x2, 120) - toFiniteNumber(obj.x1, 0));
                    const height = Math.abs(toFiniteNumber(obj.y2, 0) - toFiniteNumber(obj.y1, 0));
                    return { width: Math.max(2, width), height: Math.max(2, height) };
                }
                const width = Math.max(1, toFiniteNumber(obj.width, 120));
                const height = Math.max(1, toFiniteNumber(obj.height, 80));
                return { width, height };
            }

            function clampStrictObjectToPage(obj, { pageWidth, pageHeight }) {
                if (!obj || typeof obj !== 'object') return obj;
                const size = estimateStrictObjectSize(obj, { pageWidth, pageHeight });
                const objectWidth = Math.max(1, Math.min(pageWidth, size.width));
                const objectHeight = Math.max(1, Math.min(pageHeight, size.height));
                const maxLeft = Math.max(0, pageWidth - objectWidth);
                const maxTop = Math.max(0, pageHeight - objectHeight);
                obj.left = clampFiniteNumber(obj.left, 0, maxLeft, obj.left);
                obj.top = clampFiniteNumber(obj.top, 0, maxTop, obj.top);

                if (obj.type === 'textbox') {
                    const availableWidth = Math.max(80, pageWidth - obj.left - 8);
                    obj.width = clampFiniteNumber(obj.width, 80, availableWidth, Math.min(availableWidth, obj.width));
                }

                return obj;
            }

            function sanitizeAiFabricObjectStrict(rawObject, context, report) {
                if (!rawObject || typeof rawObject !== 'object') {
                    report.droppedObjects += 1;
                    return null;
                }

                const depth = parseInt(context.depth, 10) || 0;
                if (depth > AI_STRICT_MAX_OBJECT_DEPTH) {
                    report.droppedObjects += 1;
                    return null;
                }

                let type = sanitizeSafeString(rawObject.type || '', 24, '').toLowerCase();
                if (type === 'text' || type === 'i-text') type = 'textbox';
                if (rawObject.oid === 'pageRect' || rawObject.isArtboard) {
                    report.droppedObjects += 1;
                    return null;
                }
                if (!AI_STRICT_ALLOWED_TYPES.has(type)) {
                    report.droppedObjects += 1;
                    return null;
                }

                const pageWidth = parsePositiveInt(context.pageWidth, DEFAULT_PAGE_WIDTH);
                const pageHeight = parsePositiveInt(context.pageHeight, DEFAULT_PAGE_HEIGHT);

                const out = {
                    type,
                    originX: 'left',
                    originY: 'top',
                    left: clampFiniteNumber(rawObject.left, 0, pageWidth, 0),
                    top: clampFiniteNumber(rawObject.top, 0, pageHeight, 0),
                    angle: clampFiniteNumber(rawObject.angle, -360, 360, 0),
                    opacity: clampFiniteNumber(rawObject.opacity, 0, 1, 1)
                };

                const oid = sanitizeSafeString(rawObject.oid, 90, '');
                if (oid) out.oid = oid;
                const name = sanitizeSafeString(rawObject.name, 90, '');
                if (name) out.name = name;
                if (typeof rawObject.locked === 'boolean') out.locked = rawObject.locked;
                if (typeof rawObject.selectable === 'boolean') out.selectable = rawObject.selectable;
                if (typeof rawObject.evented === 'boolean') out.evented = rawObject.evented;

                if (type === 'textbox') {
                    const maxTextWidth = Math.max(80, pageWidth - 16);
                    out.text = sanitizeSafeString(rawObject.text ?? '', AI_STRICT_MAX_TEXT_LENGTH, '');
                    out.width = clampFiniteNumber(rawObject.width, 80, maxTextWidth, Math.min(360, maxTextWidth));
                    out.fontSize = clampFiniteNumber(rawObject.fontSize, 8, 180, 24);
                    out.fontFamily = sanitizeSafeFontFamily(rawObject.fontFamily);
                    out.fill = sanitizeSafeColor(rawObject.fill, '#111827');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '');
                    out.strokeWidth = out.stroke ? clampFiniteNumber(rawObject.strokeWidth, 0, 16, 0) : 0;
                    out.textAlign = AI_STRICT_ALLOWED_TEXT_ALIGNS.has(String(rawObject.textAlign || '').toLowerCase())
                        ? String(rawObject.textAlign).toLowerCase()
                        : 'left';
                    out.lineHeight = clampFiniteNumber(rawObject.lineHeight, 0.9, 2.4, 1.16);
                    out.charSpacing = clampFiniteNumber(rawObject.charSpacing, -250, 2400, 0);
                    out.styles = Array.isArray(rawObject.styles) ? rawObject.styles : [];
                    out.scaleX = 1;
                    out.scaleY = 1;
                    out.minWidth = clampFiniteNumber(rawObject.minWidth, 20, out.width, 20);
                    out.padding = 0;
                    out.splitByGrapheme = !!rawObject.splitByGrapheme;
                    const baseline = String(rawObject.textBaseline || '').toLowerCase();
                    if (['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom'].includes(baseline)) {
                        out.textBaseline = baseline;
                    }
                    if (rawObject.fontWeight != null) out.fontWeight = sanitizeSafeString(rawObject.fontWeight, 20, '');
                    if (rawObject.fontStyle != null) out.fontStyle = sanitizeSafeString(rawObject.fontStyle, 20, '');
                    if (rawObject.curveAmount != null) {
                        out.curveAmount = clampFiniteNumber(rawObject.curveAmount, -100, 100, 0);
                    }
                } else if (type === 'rect' || type === 'triangle') {
                    out.width = clampFiniteNumber(rawObject.width, 6, pageWidth, 180);
                    out.height = clampFiniteNumber(rawObject.height, 6, pageHeight, 120);
                    out.fill = sanitizeSafeColor(rawObject.fill, '#cbd5e1');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '');
                    out.strokeWidth = out.stroke ? clampFiniteNumber(rawObject.strokeWidth, 0, 18, 0) : 0;
                    if (type === 'rect') {
                        out.rx = clampFiniteNumber(rawObject.rx ?? rawObject.radius, 0, out.width / 2, 0);
                        out.ry = clampFiniteNumber(rawObject.ry ?? rawObject.radius, 0, out.height / 2, out.rx);
                    }
                } else if (type === 'ellipse') {
                    out.rx = clampFiniteNumber(rawObject.rx, 3, pageWidth / 2, 48);
                    out.ry = clampFiniteNumber(rawObject.ry, 3, pageHeight / 2, 30);
                    out.fill = sanitizeSafeColor(rawObject.fill, '#cbd5e1');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '');
                    out.strokeWidth = out.stroke ? clampFiniteNumber(rawObject.strokeWidth, 0, 18, 0) : 0;
                    out.width = out.rx * 2;
                    out.height = out.ry * 2;
                } else if (type === 'circle') {
                    out.radius = clampFiniteNumber(rawObject.radius ?? (toFiniteNumber(rawObject.width, 80) / 2), 4, Math.min(pageWidth, pageHeight) / 2, 40);
                    out.fill = sanitizeSafeColor(rawObject.fill, '#cbd5e1');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '');
                    out.strokeWidth = out.stroke ? clampFiniteNumber(rawObject.strokeWidth, 0, 18, 0) : 0;
                    out.width = out.radius * 2;
                    out.height = out.radius * 2;
                } else if (type === 'line') {
                    const lineWidth = clampFiniteNumber(
                        rawObject.width ?? Math.abs(toFiniteNumber(rawObject.x2, 120) - toFiniteNumber(rawObject.x1, 0)),
                        8,
                        pageWidth,
                        180
                    );
                    const lineHeight = clampFiniteNumber(
                        rawObject.height ?? Math.abs(toFiniteNumber(rawObject.y2, 0) - toFiniteNumber(rawObject.y1, 0)),
                        0,
                        pageHeight,
                        0
                    );
                    out.x1 = 0;
                    out.y1 = 0;
                    out.x2 = lineWidth;
                    out.y2 = lineHeight;
                    out.stroke = sanitizeSafeColor(rawObject.stroke || rawObject.fill, '#334155');
                    out.strokeWidth = clampFiniteNumber(rawObject.strokeWidth, 1, 18, 2);
                    out.fill = 'transparent';
                    out.width = lineWidth;
                    out.height = Math.max(1, lineHeight);
                    const lineCap = sanitizeSafeString(rawObject.strokeLineCap, 16, 'round').toLowerCase();
                    out.strokeLineCap = ['butt', 'round', 'square'].includes(lineCap) ? lineCap : 'round';
                } else if (type === 'path') {
                    const safePath = sanitizeSafePath(rawObject.path);
                    if (!safePath) {
                        report.droppedObjects += 1;
                        return null;
                    }
                    out.path = safePath;
                    out.fill = sanitizeSafeColor(rawObject.fill, 'transparent');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '#334155');
                    out.strokeWidth = clampFiniteNumber(rawObject.strokeWidth, 0, 18, out.stroke === 'transparent' ? 0 : 2);
                    out.width = clampFiniteNumber(rawObject.width, 8, pageWidth, 180);
                    out.height = clampFiniteNumber(rawObject.height, 8, pageHeight, 80);
                    out.objectCaching = false;
                } else if (type === 'polygon' || type === 'polyline') {
                    const safePoints = sanitizeSafePoints(rawObject.points, { pageWidth, pageHeight });
                    if (safePoints.length < 2) {
                        report.droppedObjects += 1;
                        return null;
                    }
                    out.points = safePoints;
                    out.fill = type === 'polyline' ? 'transparent' : sanitizeSafeColor(rawObject.fill, '#cbd5e1');
                    out.stroke = sanitizeSafeColor(rawObject.stroke, '#334155');
                    out.strokeWidth = clampFiniteNumber(rawObject.strokeWidth, 0, 18, 2);
                    out.width = clampFiniteNumber(rawObject.width, 8, pageWidth, 180);
                    out.height = clampFiniteNumber(rawObject.height, 8, pageHeight, 100);
                } else if (type === 'image') {
                    const src = sanitizeSafeImageSrc(rawObject.src || rawObject._src || rawObject.imageSrc);
                    if (!src) {
                        report.droppedObjects += 1;
                        return null;
                    }
                    out.src = src;
                    out.width = clampFiniteNumber(rawObject.width, 16, pageWidth, Math.min(260, pageWidth));
                    out.height = clampFiniteNumber(rawObject.height, 16, pageHeight, Math.min(220, pageHeight));
                    out.crossOrigin = sanitizeSafeString(rawObject.crossOrigin, 22, 'anonymous') || 'anonymous';
                } else if (type === 'group') {
                    const rawChildren = Array.isArray(rawObject.objects) ? rawObject.objects : [];
                    const limitedChildren = rawChildren.slice(0, AI_STRICT_MAX_GROUP_CHILDREN);
                    const childObjects = limitedChildren
                        .map((child) => sanitizeAiFabricObjectStrict(child, { ...context, depth: depth + 1 }, report))
                        .filter(Boolean);
                    if (!childObjects.length) {
                        report.droppedObjects += 1;
                        return null;
                    }
                    out.objects = childObjects;
                    out.objectCaching = false;
                    out.subTargetCheck = false;
                    out.width = clampFiniteNumber(rawObject.width, 10, pageWidth, 220);
                    out.height = clampFiniteNumber(rawObject.height, 10, pageHeight, 160);
                    if (rawChildren.length > limitedChildren.length) {
                        report.truncatedObjects += rawChildren.length - limitedChildren.length;
                    }
                }

                const dash = sanitizeSafeStrokeDashArray(rawObject.strokeDashArray);
                if (dash) out.strokeDashArray = dash;

                if (out.fill === undefined) out.fill = 'transparent';
                if (out.stroke === undefined) out.stroke = '';
                if (!Number.isFinite(out.strokeWidth)) out.strokeWidth = out.stroke ? 1 : 0;

                if (typeof out.shadow === 'object') delete out.shadow;
                if (out.clipPath) delete out.clipPath;
                if (out.transformMatrix) delete out.transformMatrix;
                if (out.filters) delete out.filters;

                clampStrictObjectToPage(out, { pageWidth, pageHeight });
                report.keptObjects += 1;
                return out;
            }

            function sanitizeAiCanvasStateStrict(rawCanvas, { pageWidth, pageHeight }) {
                const sourceCanvas = rawCanvas && typeof rawCanvas === 'object' ? rawCanvas : {};
                const sourceObjects = Array.isArray(sourceCanvas.objects) ? sourceCanvas.objects : [];
                const limitedObjects = sourceObjects.slice(0, AI_STRICT_MAX_OBJECTS_PER_PAGE);
                const report = {
                    sourceObjects: sourceObjects.length,
                    keptObjects: 0,
                    droppedObjects: 0,
                    truncatedObjects: Math.max(0, sourceObjects.length - limitedObjects.length)
                };
                report.droppedObjects += report.truncatedObjects;

                const usedOids = new Set(['pageRect']);
                const objects = limitedObjects
                    .map((rawObject, index) => {
                        const safeObject = sanitizeAiFabricObjectStrict(rawObject, { pageWidth, pageHeight, depth: 0 }, report);
                        if (!safeObject) return null;
                        const baseOid = sanitizeSafeString(safeObject.oid, 90, '') || `ai_obj_${index + 1}`;
                        let nextOid = baseOid;
                        let seq = 2;
                        while (usedOids.has(nextOid)) {
                            nextOid = `${baseOid}_${seq}`;
                            seq += 1;
                        }
                        usedOids.add(nextOid);
                        safeObject.oid = nextOid;
                        return safeObject;
                    })
                    .filter(Boolean);

                const pageRectPayload = typeof createPageRectPayload === 'function'
                    ? createPageRectPayload(pageWidth, pageHeight)
                    : {
                        type: 'rect',
                        oid: 'pageRect',
                        isArtboard: true,
                        left: 0,
                        top: 0,
                        width: pageWidth,
                        height: pageHeight,
                        fill: '#fff',
                        stroke: '#d1d5db',
                        strokeWidth: 1,
                        originX: 'left',
                        originY: 'top',
                        selectable: false,
                        evented: false
                    };

                const canvasState = {
                    version: '5.3.0',
                    background: 'transparent',
                    objects: [pageRectPayload, ...objects]
                };

                return { canvasState, report };
            }

            function sanitizeAiDataCell(value) {
                if (value == null) return '';
                if (typeof value === 'number' && Number.isFinite(value)) return value;
                if (typeof value === 'boolean') return value;
                if (typeof value === 'string') return value.length > 1800 ? value.slice(0, 1800) : value;
                try {
                    const text = JSON.stringify(value);
                    return text.length > 1800 ? text.slice(0, 1800) : text;
                } catch (_) {
                    return String(value).slice(0, 1800);
                }
            }

            function sanitizeAiTemplatePayloadStrict(templatePayload) {
                const source = templatePayload && typeof templatePayload === 'object' ? templatePayload : {};
                const sourcePages = Array.isArray(source.pages) && source.pages.length
                    ? source.pages
                    : [{
                        width: source?.page?.width ?? DEFAULT_PAGE_WIDTH,
                        height: source?.page?.height ?? DEFAULT_PAGE_HEIGHT,
                        canvas: source.canvas || { version: '5.3.0', background: 'transparent', objects: [] },
                        bindings: source.bindings || [],
                        title: source?.page?.title || 'Page 1'
                    }];
                const rootBindings = Array.isArray(source.bindings) ? source.bindings : [];
                const limitedPages = sourcePages.slice(0, AI_STRICT_MAX_PAGES);
                const report = {
                    sourcePages: sourcePages.length,
                    keptPages: limitedPages.length,
                    truncatedPages: Math.max(0, sourcePages.length - limitedPages.length),
                    sourceObjects: 0,
                    keptObjects: 0,
                    droppedObjects: 0,
                    truncatedObjects: 0,
                    truncatedRows: 0
                };

                const pages = limitedPages.map((rawPage, index) => {
                    const width = parsePositiveInt(rawPage?.width ?? source?.page?.width, DEFAULT_PAGE_WIDTH);
                    const height = parsePositiveInt(rawPage?.height ?? source?.page?.height, DEFAULT_PAGE_HEIGHT);
                    const title = sanitizeSafeString(rawPage?.title, 120, `Page ${index + 1}`) || `Page ${index + 1}`;
                    const { canvasState, report: canvasReport } = sanitizeAiCanvasStateStrict(rawPage?.canvas, { pageWidth: width, pageHeight: height });
                    report.sourceObjects += canvasReport.sourceObjects;
                    report.keptObjects += canvasReport.keptObjects;
                    report.droppedObjects += canvasReport.droppedObjects;
                    report.truncatedObjects += canvasReport.truncatedObjects;

                    const finalCanvas = (typeof sanitizeCanvasStateForEditor === 'function')
                        ? sanitizeCanvasStateForEditor(canvasState, { pageWidth: width, pageHeight: height })
                        : canvasState;
                    const rawBindings = Array.isArray(rawPage?.bindings) ? rawPage.bindings : (index === 0 ? rootBindings : []);
                    const pageBindings = typeof sanitizeBindingsEntries === 'function'
                        ? sanitizeBindingsEntries(rawBindings)
                        : [];

                    return {
                        id: sanitizeSafeString(rawPage?.id, 80, '') || (typeof createUid === 'function' ? createUid('page') : `page_${index + 1}`),
                        title,
                        width,
                        height,
                        canvas: finalCanvas,
                        bindings: pageBindings
                    };
                });

                const selectedIndex = Math.max(
                    0,
                    Math.min(
                        pages.length - 1,
                        parseInt(source.currentPageIndex, 10) || 0
                    )
                );
                const activePage = pages[selectedIndex] || pages[0] || {
                    title: 'Page 1',
                    width: DEFAULT_PAGE_WIDTH,
                    height: DEFAULT_PAGE_HEIGHT,
                    canvas: {
                        version: '5.3.0',
                        background: 'transparent',
                        objects: [
                            typeof createPageRectPayload === 'function'
                                ? createPageRectPayload(DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT)
                                : {
                                    type: 'rect',
                                    oid: 'pageRect',
                                    isArtboard: true,
                                    left: 0,
                                    top: 0,
                                    width: DEFAULT_PAGE_WIDTH,
                                    height: DEFAULT_PAGE_HEIGHT,
                                    fill: '#fff',
                                    stroke: '#d1d5db',
                                    strokeWidth: 1,
                                    originX: 'left',
                                    originY: 'top'
                                }
                        ]
                    },
                    bindings: []
                };

                const rawHeaders = Array.isArray(source?.data?.headers) ? source.data.headers : [];
                const headers = rawHeaders
                    .slice(0, AI_STRICT_MAX_HEADERS)
                    .map((header) => sanitizeSafeString(header, 120, ''))
                    .filter(Boolean);
                const rawRows = Array.isArray(source?.data?.rows) ? source.data.rows : [];
                const rows = rawRows
                    .slice(0, AI_STRICT_MAX_ROWS)
                    .map((row) => {
                        if (Array.isArray(row)) {
                            const next = {};
                            headers.forEach((header, idx) => {
                                next[header] = sanitizeAiDataCell(row[idx]);
                            });
                            return next;
                        }
                        if (row && typeof row === 'object') {
                            const keys = headers.length ? headers : Object.keys(row).slice(0, AI_STRICT_MAX_HEADERS);
                            const next = {};
                            keys.forEach((key) => {
                                next[key] = sanitizeAiDataCell(row[key]);
                            });
                            return next;
                        }
                        return null;
                    })
                    .filter(Boolean);
                report.truncatedRows = Math.max(0, rawRows.length - rows.length);

                let identifier = sanitizeSafeString(source?.data?.identifierColumn, 120, '');
                if (identifier && headers.length && !headers.includes(identifier)) identifier = '';

                return {
                    payload: {
                        version: 'csvlink-template-v2',
                        page: {
                            title: sanitizeSafeString(source?.page?.title, 140, activePage.title) || activePage.title,
                            width: activePage.width,
                            height: activePage.height
                        },
                        canvas: activePage.canvas,
                        bindings: activePage.bindings,
                        pages,
                        currentPageIndex: selectedIndex,
                        data: {
                            headers,
                            rows,
                            identifierColumn: identifier
                        }
                    },
                    report
                };
            }

            function isTextLikeCanvasObject(obj) {
                const type = String(obj?.type || '').toLowerCase();
                return type === 'text' || type === 'i-text' || type === 'textbox';
            }

            function clampNumber(value, minValue, maxValue) {
                const safeMin = Number.isFinite(minValue) ? minValue : value;
                const safeMax = Number.isFinite(maxValue) ? maxValue : value;
                return Math.min(safeMax, Math.max(safeMin, value));
            }

            function translateCanvasObject(obj, dx = 0, dy = 0) {
                if (!obj) return false;
                if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
                if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;
                obj.set({
                    left: normalizeNumeric(obj.left, 0) + dx,
                    top: normalizeNumeric(obj.top, 0) + dy
                });
                if (typeof obj.setCoords === 'function') obj.setCoords();
                return true;
            }

            function fitTextObjectWithinFrame(obj, frame, margin = 22) {
                if (!obj || !isTextLikeCanvasObject(obj)) return false;
                let changed = false;
                const maxWidth = Math.max(120, frame.width - margin * 2);
                const maxHeight = Math.max(80, frame.height - margin * 2);
                if (obj.type === 'textbox') {
                    const currentWidth = parseFloat(obj.width);
                    const nextWidth = Number.isFinite(currentWidth)
                        ? Math.min(maxWidth, Math.max(120, currentWidth))
                        : maxWidth;
                    if (!Number.isFinite(currentWidth) || Math.abs(nextWidth - currentWidth) > 0.5) {
                        obj.set({ width: nextWidth });
                        changed = true;
                    }
                }

                for (let i = 0; i < 24; i++) {
                    if (typeof obj.setCoords === 'function') obj.setCoords();
                    const bounds = obj.getBoundingRect(true, true);
                    if (!bounds) break;
                    const tooWide = bounds.width > maxWidth + 0.5;
                    const tooTall = bounds.height > maxHeight + 0.5;
                    if (!tooWide && !tooTall) break;
                    const currentFontSize = parseFloat(obj.fontSize);
                    if (!Number.isFinite(currentFontSize) || currentFontSize <= 10) break;
                    obj.set({ fontSize: Math.max(10, currentFontSize - 1) });
                    changed = true;
                }

                if (typeof obj.setCoords === 'function') obj.setCoords();
                const finalBounds = obj.getBoundingRect(true, true);
                if (
                    finalBounds
                    && obj.type !== 'textbox'
                    && finalBounds.width > maxWidth + 1
                    && Number.isFinite(finalBounds.width)
                    && finalBounds.width > 0
                ) {
                    const factor = Math.max(0.65, maxWidth / finalBounds.width);
                    if (factor < 0.999) {
                        obj.set({
                            scaleX: normalizeNumeric(obj.scaleX, 1) * factor,
                            scaleY: normalizeNumeric(obj.scaleY, 1) * factor
                        });
                        changed = true;
                    }
                }

                if (changed && typeof obj.setCoords === 'function') obj.setCoords();
                return changed;
            }

            function keepObjectInsideFrame(obj, frame, { marginX = 0, marginY = 0 } = {}) {
                if (!obj) return false;
                if (typeof obj.setCoords === 'function') obj.setCoords();
                const bounds = obj.getBoundingRect(true, true);
                if (!bounds) return false;

                const minLeft = frame.left + marginX;
                const minTop = frame.top + marginY;
                const maxLeft = Math.max(minLeft, frame.left + frame.width - marginX - bounds.width);
                const maxTop = Math.max(minTop, frame.top + frame.height - marginY - bounds.height);
                const targetLeft = clampNumber(bounds.left, minLeft, maxLeft);
                const targetTop = clampNumber(bounds.top, minTop, maxTop);
                const dx = targetLeft - bounds.left;
                const dy = targetTop - bounds.top;
                return translateCanvasObject(obj, dx, dy);
            }

            function polishCurrentPageLayoutForProfessionalOutput() {
                const frame = getCurrentPageFrame();
                const objects = getEditableCanvasObjects();
                let changed = false;
                objects.forEach(obj => {
                    if (!obj) return;
                    const textLike = isTextLikeCanvasObject(obj);
                    if (textLike) {
                        if (fitTextObjectWithinFrame(obj, frame, 22)) changed = true;
                    }
                    if (keepObjectInsideFrame(obj, frame, { marginX: textLike ? 20 : 0, marginY: textLike ? 16 : 0 })) {
                        changed = true;
                    }
                });
                if (changed) canvas.requestRenderAll();
                return changed;
            }

            async function runProfessionalLayoutPass({ onProgress = null } = {}) {
                if (!Array.isArray(documentPages) || !documentPages.length) return 0;
                const returnIndex = currentPageIndex;
                let changedPages = 0;
                for (let i = 0; i < documentPages.length; i++) {
                    if (typeof onProgress === 'function') onProgress(`Polishing page ${i + 1}/${documentPages.length}`);
                    if (i !== currentPageIndex) {
                        await switchToCanvasPage(i, { fitView: false, skipSave: true, suppressHistory: true });
                    }
                    if (polishCurrentPageLayoutForProfessionalOutput()) changedPages += 1;
                    syncCurrentPageStateFromCanvas();
                }
                if (currentPageIndex !== returnIndex) {
                    await switchToCanvasPage(returnIndex, { fitView: true, skipSave: true, suppressHistory: true });
                }
                return changedPages;
            }

            async function tryRepairTemplateFromText(
                apiKey,
                userPrompt,
                rawResponse,
                {
                    onProgress = null,
                    timeoutMs = Math.min(AI_TEMPLATE_REQUEST_TIMEOUT_MS, 40000)
                } = {}
            ) {
                if (!rawResponse) return null;
                const repairPrompt = `
Convert the assistant output below into strict JSON ONLY for a CSVLink template.
Return one JSON object and nothing else.

User request:
${userPrompt || '(Attachment-only request)'}

Assistant output:
${rawResponse}
`.trim();
                try {
                    if (typeof onProgress === 'function') onProgress('Repairing template JSON');
                    const repairedText = await requestAiResponseText(
                        apiKey,
                        [{ text: repairPrompt }],
                        { enforceJson: true, onProgress, timeoutMs, responseSchema: null }
                    );
                    const repairedParsed = parseAiJsonResponse(repairedText);
                    return normalizeAiTemplatePayload(repairedParsed);
                } catch (err) {
                    console.warn('Template JSON repair failed:', err);
                    return null;
                }
            }

            async function callAiTemplateEditor(apiKey, promptText, { onProgress = null } = {}) {
                const currentTemplate = getCurrentTemplatePayloadForAi();
                if (typeof onProgress === 'function') onProgress('Preparing template context');
                const primaryContext = buildTemplateContextForAi(currentTemplate, {
                    tight: false,
                    maxChars: AI_MAX_TEMPLATE_CONTEXT_CHARS
                });
                const retryContext = buildTemplateContextForAi(currentTemplate, {
                    tight: true,
                    maxChars: Math.max(16000, Math.floor(AI_MAX_TEMPLATE_CONTEXT_CHARS * 0.7))
                });
                const hasInlineAttachment = aiAttachment?.kind === 'inline';
                const primaryTimeoutMs = hasInlineAttachment || primaryContext.charCount > 30000
                    ? Math.min(AI_TEMPLATE_REQUEST_TIMEOUT_MS, 70000)
                    : Math.min(AI_TEMPLATE_REQUEST_TIMEOUT_MS, 52000);
                const retryTimeoutMs = Math.min(AI_TEMPLATE_RETRY_TIMEOUT_MS, hasInlineAttachment ? 50000 : 42000);

                let responseText = '';
                try {
                    const parts = buildTemplateEditorRequestParts(promptText, primaryContext, { retry: false });
                    if (typeof onProgress === 'function') {
                        onProgress(`Sending template request (${Math.round(primaryContext.charCount / 1000)}k chars context)`);
                    }
                    responseText = await requestAiResponseText(
                        apiKey,
                        parts,
                        {
                            enforceJson: true,
                            onProgress,
                            timeoutMs: primaryTimeoutMs,
                            responseSchema: null
                        }
                    );
                } catch (error) {
                    if (!isAiTimeoutError(error)) throw error;
                    const parts = buildTemplateEditorRequestParts(promptText, retryContext, { retry: true });
                    if (typeof onProgress === 'function') {
                        onProgress(`Timed out, retrying with smaller context (${Math.round(retryContext.charCount / 1000)}k chars)`);
                    }
                    responseText = await requestAiResponseText(
                        apiKey,
                        parts,
                        {
                            enforceJson: true,
                            onProgress,
                            timeoutMs: retryTimeoutMs,
                            responseSchema: null
                        }
                    );
                }

                if (!responseText) throw new Error('No template JSON returned by AI.');

                if (typeof onProgress === 'function') onProgress('Parsing template JSON');
                const parsed = parseAiJsonResponse(responseText);
                let templatePayload = normalizeAiTemplatePayload(parsed);
                if (!templatePayload) {
                    templatePayload = await tryRepairTemplateFromText(apiKey, promptText, responseText, {
                        onProgress,
                        timeoutMs: Math.min(AI_TEMPLATE_RETRY_TIMEOUT_MS, 35000)
                    });
                }
                if (!templatePayload) {
                    throw new Error('AI response was not valid template JSON.');
                }
                return templatePayload;
            }

            async function applyAiTemplatePayload(templatePayload) {
                if (!templatePayload || typeof templatePayload !== 'object') {
                    throw new Error('Invalid AI template payload.');
                }
                const payload = JSON.parse(JSON.stringify(templatePayload));
                const strictResult = sanitizeAiTemplatePayloadStrict(payload);
                const safePayload = strictResult?.payload && typeof strictResult.payload === 'object'
                    ? strictResult.payload
                    : payload;
                const strictReport = strictResult?.report || null;
                if (safePayload.page?.title) {
                    $('#titleInput').value = String(safePayload.page.title);
                }
                if (safePayload.data && typeof safePayload.data === 'object') {
                    headers = Array.isArray(safePayload.data.headers) ? safePayload.data.headers : [];
                    dataRows = Array.isArray(safePayload.data.rows) ? safePayload.data.rows : [];
                    identifierColumn = String(safePayload.data.identifierColumn || '');
                }
                const selectedIndex = Number.isFinite(parseInt(safePayload.currentPageIndex, 10))
                    ? parseInt(safePayload.currentPageIndex, 10)
                    : currentPageIndex;
                await setDocumentPagesFromTemplate(safePayload, { fitView: true, selectedIndex });
                const polishedPages = await runProfessionalLayoutPass();
                bindings = new Map(documentPages[currentPageIndex]?.bindings || safePayload.bindings || []);
                historyStack = [];
                historyIndex = -1;
                lastHistorySig = null;
                requestSaveState();
                renderLayers();
                refreshCanvasPageControlsDebounced();
                return {
                    pageCount: Array.isArray(documentPages) ? documentPages.length : 1,
                    polishedPages,
                    strictReport
                };
            }

            async function callAiCreativeFabricDesigner(
                apiKey,
                promptText,
                {
                    onProgress = null,
                    onRawObject = null
                } = {}
            ) {
                const { width: pageWidth, height: pageHeight } = getCurrentPageDimensionsForAi();
                const primaryParts = buildCreativeAiRequestParts(promptText, { pageWidth, pageHeight, retry: false });
                const retryParts = buildCreativeAiRequestParts(promptText, { pageWidth, pageHeight, retry: true });
                const parser = createStreamingFabricArrayParser();
                let emittedCount = 0;
                let streamError = null;

                const emitRawObjects = (objects = [], source = 'stream') => {
                    if (!Array.isArray(objects) || !objects.length) return;
                    objects.forEach((obj) => {
                        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
                        emittedCount += 1;
                        if (typeof onRawObject === 'function') {
                            try {
                                onRawObject(obj, { index: emittedCount, source });
                            } catch (err) {
                                console.warn('Live AI object callback failed:', err);
                            }
                        }
                    });
                };

                try {
                    if (typeof onProgress === 'function') onProgress('Streaming design objects');
                    const streamText = await requestAiResponseTextStream(
                        apiKey,
                        primaryParts,
                        {
                            onProgress,
                            timeoutMs: AI_CREATIVE_REQUEST_TIMEOUT_MS,
                            onTextChunk: (deltaText) => {
                                const nextObjects = parser.push(deltaText);
                                emitRawObjects(nextObjects, 'stream');
                            },
                            temperature: 0.72
                        }
                    );
                    emitRawObjects(parser.finalize(), 'stream-finalize');
                    if (emittedCount > 0) {
                        return {
                            emittedCount,
                            streamUsed: true,
                            partial: false,
                            rawText: parser.getText() || streamText || ''
                        };
                    }

                    const parsedFromStreamText = parseAiFabricObjectsFromText(streamText || parser.getText());
                    emitRawObjects(parsedFromStreamText, 'stream-full');
                    if (emittedCount > 0) {
                        return {
                            emittedCount,
                            streamUsed: true,
                            partial: false,
                            rawText: parser.getText() || streamText || ''
                        };
                    }
                    throw new Error('Stream completed but returned no Fabric object array.');
                } catch (error) {
                    streamError = error;
                    if (emittedCount > 0) {
                        return {
                            emittedCount,
                            streamUsed: true,
                            partial: true,
                            warning: `Live stream interrupted. Applied ${emittedCount} object${emittedCount === 1 ? '' : 's'} so far.`
                        };
                    }
                }

                if (typeof onProgress === 'function') onProgress('Fallback: requesting object array');
                let responseText = '';
                try {
                    responseText = await requestAiResponseText(
                        apiKey,
                        retryParts,
                        {
                            enforceJson: true,
                            onProgress,
                            timeoutMs: Math.min(AI_CREATIVE_REQUEST_TIMEOUT_MS, 65000),
                            responseSchema: null
                        }
                    );
                } catch (fallbackError) {
                    if (streamError) {
                        throw new Error(`${streamError.message} Fallback failed: ${fallbackError.message}`);
                    }
                    throw fallbackError;
                }

                const fallbackObjects = parseAiFabricObjectsFromText(responseText);
                emitRawObjects(fallbackObjects, 'fallback');
                if (emittedCount <= 0) {
                    const prefix = streamError ? `${streamError.message} ` : '';
                    throw new Error(`${prefix}AI returned no valid Fabric objects.`);
                }
                return {
                    emittedCount,
                    streamUsed: false,
                    partial: false,
                    warning: streamError ? 'Live stream unavailable. Fallback object array applied.' : ''
                };
            }

            async function applyAiRawFabricObjectLive(rawObject, context = {}) {
                const pageWidth = parsePositiveInt(context.pageWidth, DEFAULT_PAGE_WIDTH);
                const pageHeight = parsePositiveInt(context.pageHeight, DEFAULT_PAGE_HEIGHT);
                const pageId = context.pageId || currentCanvasPageId();
                const usedOids = context.usedOids instanceof Set ? context.usedOids : new Set();
                const report = context.report && typeof context.report === 'object'
                    ? context.report
                    : { sourceObjects: 0, keptObjects: 0, droppedObjects: 0, truncatedObjects: 0, appliedObjects: 0, failedEnliven: 0 };
                report.sourceObjects += 1;

                const safeObject = sanitizeAiFabricObjectStrict(
                    rawObject,
                    { pageWidth, pageHeight, depth: 0 },
                    report
                );
                if (!safeObject) return false;

                const baseOid = sanitizeSafeString(safeObject.oid, 90, '') || `ai_gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                let nextOid = baseOid;
                let attempt = 2;
                while (usedOids.has(nextOid)) {
                    nextOid = `${baseOid}_${attempt}`;
                    attempt += 1;
                }
                usedOids.add(nextOid);
                safeObject.oid = nextOid;
                safeObject.pageId = pageId;
                safeObject.name = sanitizeSafeString(safeObject.name, 120, '') || getUniqueName(safeObject.type || 'object');

                const enlivened = await enlivenFabricObjectsSafe([safeObject]);
                if (!enlivened.length) {
                    report.failedEnliven += 1;
                    return false;
                }

                const obj = enlivened[0];
                obj.set({
                    oid: safeObject.oid,
                    name: safeObject.name,
                    pageId,
                    originX: 'left',
                    originY: 'top'
                });

                if (
                    obj.type === 'image'
                    && Number.isFinite(safeObject.width)
                    && Number.isFinite(safeObject.height)
                    && Number.isFinite(obj.width)
                    && Number.isFinite(obj.height)
                    && obj.width > 0
                    && obj.height > 0
                ) {
                    obj.set({
                        scaleX: safeObject.width / obj.width,
                        scaleY: safeObject.height / obj.height
                    });
                }

                canvas.add(obj);
                if (isTextLikeCanvasObject(obj)) {
                    fitTextObjectWithinFrame(obj, getCurrentPageFrame(), 22);
                }
                keepObjectInsideFrame(obj, getCurrentPageFrame(), {
                    marginX: isTextLikeCanvasObject(obj) ? 20 : 0,
                    marginY: isTextLikeCanvasObject(obj) ? 16 : 0
                });
                if (typeof obj.setCoords === 'function') obj.setCoords();
                canvas.requestRenderAll();
                report.appliedObjects += 1;
                return true;
            }

            async function callAiCopilot(apiKey, promptText, {
                onProgress = null,
                phase = 'full',
                appliedActions = []
            } = {}) {
                const normalizedPhase = String(phase || 'full').toLowerCase() === 'draft' ? 'draft' : 'full';
                const isDraft = normalizedPhase === 'draft';
                const requestTimeoutMs = isDraft ? 22000 : AI_REQUEST_TIMEOUT_MS;
                const parts = [{
                    text: buildCopilotPrompt(promptText, {
                        phase: normalizedPhase,
                        includeConversation: !isDraft,
                        appliedActions
                    })
                }];

                if (typeof onProgress === 'function') onProgress(isDraft ? 'Drafting actions' : 'Preparing request');
                if (!isDraft) {
                    if (typeof onProgress === 'function') onProgress('Collecting canvas JSON');
                    const canvasJsonPart = buildCanvasJsonContextPart();
                    if (canvasJsonPart) parts.push(canvasJsonPart);
                }
                if (!isDraft && shouldIncludeCanvasSnapshot(promptText)) {
                    if (typeof onProgress === 'function') onProgress('Capturing canvas');
                    const snapshotPart = buildCanvasSnapshotPart();
                    if (snapshotPart) {
                        parts.push({ text: 'Current canvas snapshot:' });
                        parts.push(snapshotPart);
                    }
                }

                if (aiAttachment) {
                    if (aiAttachment.kind === 'inline') {
                        parts.push({ text: `Reference attachment: ${aiAttachment.name}. Use this to recreate the layout with canvas actions.` });
                        parts.push({
                            inline_data: {
                                mime_type: aiAttachment.mimeType || 'application/octet-stream',
                                data: aiAttachment.inlineData
                            }
                        });
                    } else if (aiAttachment.kind === 'text') {
                        parts.push({ text: `Attached file: ${aiAttachment.name}\n\n${aiAttachment.text}` });
                    }
                }

                const responseText = await requestAiResponseText(
                    apiKey,
                    parts,
                    { enforceJson: true, onProgress, timeoutMs: requestTimeoutMs }
                );
                if (!responseText) return { reply: 'No response text was returned.', actions: [] };

                if (typeof onProgress === 'function') onProgress('Parsing actions');
                const parsed = parseAiJsonResponse(responseText);
                if (parsed) {
                    const normalized = normalizeAiParsedPayload(parsed, 'Done.');
                    if (!Array.isArray(normalized.actions) || !normalized.actions.length) {
                        normalized.actions = extractActionsFromPlainText(`${normalized.reply}\n${promptText}`)
                            .map(normalizeAiAction)
                            .filter(Boolean);
                    }
                    return normalized;
                }

                const repaired = await tryRepairActionsFromText(
                    apiKey,
                    promptText,
                    responseText,
                    { onProgress, timeoutMs: Math.min(requestTimeoutMs, 22000) }
                );
                if (repaired) return repaired;

                const heuristicActions = extractActionsFromPlainText(`${responseText}\n${promptText}`)
                    .map(normalizeAiAction)
                    .filter(Boolean);
                return {
                    reply: responseText,
                    actions: heuristicActions
                };
            }

            async function handleAiSend() {
                const apiKey = aiApiKeyInput.value.trim();
                const prompt = aiPromptInput.value.trim();
                if (!apiKey) {
                    alert('Please enter your Google AI Studio API key.');
                    return;
                }
                if (!prompt && !aiAttachment) {
                    alert('Please enter a message or attach a file.');
                    return;
                }

                localStorage.setItem('googleAiApiKey', apiKey);

                const userLine = prompt || '(Attachment only)';
                appendAiChatMessage('user', userLine);
                aiConversation.push({ role: 'user', text: userLine });
                aiPromptInput.value = '';

                const thinkingEl = appendAiChatMessage('status', 'Thinking...');
                const thinkingTicker = createAiThinkingTicker(thinkingEl);
                setAiBusy(true);

                try {
                    const replaceCanvas = shouldReplaceCurrentCanvasForAi(prompt, !!aiAttachment);
                    const pageInfo = getCurrentPageDimensionsForAi();
                    const pageId = currentCanvasPageId();
                    const usedOids = new Set(
                        canvas.getObjects()
                            .map((obj) => sanitizeSafeString(obj?.oid, 90, ''))
                            .filter(Boolean)
                    );
                    const liveReport = {
                        sourceObjects: 0,
                        keptObjects: 0,
                        droppedObjects: 0,
                        truncatedObjects: 0,
                        appliedObjects: 0,
                        failedEnliven: 0
                    };

                    if (replaceCanvas) {
                        thinkingTicker.setStage('Clearing current canvas');
                        clearCurrentPageDrawableObjects();
                        bindings = new Map();
                        syncCurrentPageStateFromCanvas();
                    }

                    let applyQueue = Promise.resolve();
                    const enqueueRawObject = (rawObject, meta = {}) => {
                        applyQueue = applyQueue.then(async () => {
                            try {
                                const nextLabel = liveReport.appliedObjects + 1;
                                thinkingTicker.setStage(`Drawing object ${nextLabel}`);
                                await applyAiRawFabricObjectLive(rawObject, {
                                    pageWidth: pageInfo.width,
                                    pageHeight: pageInfo.height,
                                    pageId,
                                    usedOids,
                                    report: liveReport
                                });
                                if (liveReport.appliedObjects > 0 && liveReport.appliedObjects % 3 === 0) {
                                    syncCurrentPageStateFromCanvas();
                                    renderLayers();
                                    refreshCanvasPageControlsDebounced();
                                }
                                if (meta?.source === 'stream') {
                                    await delayMs(AI_LIVE_RENDER_DELAY_MS);
                                }
                            } catch (err) {
                                console.warn('Live object apply failed:', err);
                            }
                        });
                    };

                    const creativeSummary = await callAiCreativeFabricDesigner(
                        apiKey,
                        prompt,
                        {
                            onProgress: (stage) => thinkingTicker.setStage(stage),
                            onRawObject: enqueueRawObject
                        }
                    );
                    await applyQueue;

                    if (liveReport.appliedObjects <= 0) {
                        throw new Error('AI returned no drawable objects after validation.');
                    }

                    const polished = polishCurrentPageLayoutForProfessionalOutput() ? 1 : 0;
                    syncCurrentPageStateFromCanvas();
                    requestSaveState();
                    renderLayers();
                    refreshCanvasPageControlsDebounced();

                    thinkingTicker.stop();
                    thinkingEl.className = 'ai-chat-message assistant';
                    const filtered = Math.max(0, parseInt(liveReport.droppedObjects, 10) || 0);
                    const failedEnliven = Math.max(0, parseInt(liveReport.failedEnliven, 10) || 0);
                    const streamFlag = creativeSummary?.streamUsed ? ' (live stream)' : ' (fallback mode)';
                    const partialNote = creativeSummary?.partial ? ' Partial result preserved.' : '';
                    const warningNote = creativeSummary?.warning ? ` ${creativeSummary.warning}` : '';
                    const polishNote = polished > 0 ? ' Professional polish applied.' : '';
                    const filterNote = (filtered > 0 || failedEnliven > 0)
                        ? ` Sanitizer filtered ${filtered} and skipped ${failedEnliven}.`
                        : '';
                    const finalMsg = `Applied ${liveReport.appliedObjects} AI object${liveReport.appliedObjects === 1 ? '' : 's'}${streamFlag}.${polishNote}${filterNote}${partialNote}${warningNote}`;
                    thinkingEl.textContent = finalMsg;
                    aiConversation.push({ role: 'assistant', text: finalMsg });
                } catch (error) {
                    thinkingTicker.stop();
                    console.error('AI Copilot Error:', error);
                    thinkingEl.textContent = `Error: ${error.message}`;
                    thinkingEl.className = 'ai-chat-message status';
                } finally {
                    thinkingTicker.stop();
                    setAiBusy(false);
                    clearAiAttachment();
                }
            }

            aiSendBtn.addEventListener('click', () => {
                handleAiSend().catch(err => {
                    console.error('AI send failed:', err);
                    appendAiChatMessage('status', `Error: ${err.message}`);
                    setAiBusy(false);
                });
            });

            aiPromptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    aiSendBtn.click();
                }
            });

            aiPromptInput.addEventListener('paste', async (e) => {
                const items = (e.clipboardData || window.clipboardData)?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.kind === 'file' && item.type?.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (!file) continue;
                        try {
                            aiAttachment = await toAttachmentPayload(file);
                            updateAttachmentMeta();
                        } catch (err) {
                            showNotification(`Attachment error: ${err.message}`, 'error');
                        }
                        break;
                    }
                }
            });

            aiFileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                    clearAiAttachment();
                    return;
                }
                try {
                    aiAttachment = await toAttachmentPayload(file);
                    updateAttachmentMeta();
                } catch (err) {
                    clearAiAttachment();
                    showNotification(`Attachment error: ${err.message}`, 'error');
                }
            });

            aiClearFileBtn.addEventListener('click', () => clearAiAttachment());
            aiResetChatBtn.addEventListener('click', resetAiChat);

            resetAiChat();
        }
