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
            const AI_MAX_CONVERSATION_ITEMS = 6;
            const AI_MAX_CONVERSATION_CHARS = 240;
            const AI_MAX_APPLIED_ACTIONS = 8;
            const AI_MAX_APPLIED_ACTION_CHARS = 180;
            const AI_MAX_CONTEXT_COLUMNS = 14;
            const AI_MAX_CANVAS_JSON_CHARS = 24000;
            const AI_MAX_CANVAS_JSON_OBJECTS = 80;
            const AI_MODEL_NAME = 'gemini-2.5-flash';
            const AI_MODEL_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL_NAME}:generateContent`;
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

            async function toAttachmentPayload(file) {
                if (!file) return null;

                if (file.type && file.type.startsWith('image/')) {
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = () => reject(new Error('Failed to read image file.'));
                        reader.readAsDataURL(file);
                    });
                    const [, mimeType, base64Data] = String(dataUrl).match(/^data:(.*?);base64,(.*)$/) || [];
                    if (!mimeType || !base64Data) throw new Error('Invalid image attachment format.');
                    return {
                        name: file.name || 'image',
                        size: file.size || 0,
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

            function normalizeAiTemplatePayload(raw) {
                if (!raw || typeof raw !== 'object') return null;
                if (raw.template && typeof raw.template === 'object') return raw.template;
                if (raw.result && typeof raw.result === 'object') return raw.result;
                if (raw.output && typeof raw.output === 'object') return raw.output;
                if (raw.pages || raw.canvas || raw.page) return raw;
                return null;
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
                const currentTemplateText = JSON.stringify(currentTemplate);
                const parts = [
                    { text: buildTemplateJsonEditPrompt(promptText) },
                    { text: `Current template JSON:\n${currentTemplateText}` }
                ];

                if (typeof onProgress === 'function') onProgress('Preparing request');
                if (aiAttachment) {
                    parts.push({ text: `Attached reference file: ${aiAttachment.name}` });
                    if (aiAttachment.kind === 'inline') {
                        parts.push({
                            inline_data: {
                                mime_type: aiAttachment.mimeType || 'application/octet-stream',
                                data: aiAttachment.inlineData
                            }
                        });
                    } else if (aiAttachment.kind === 'text') {
                        parts.push({ text: `Attached file text:\n${aiAttachment.text}` });
                    }
                }

                const responseText = await requestAiResponseText(
                    apiKey,
                    parts,
                    {
                        enforceJson: true,
                        onProgress,
                        timeoutMs: AI_TEMPLATE_REQUEST_TIMEOUT_MS,
                        responseSchema: null
                    }
                );
                if (!responseText) throw new Error('No template JSON returned by AI.');

                if (typeof onProgress === 'function') onProgress('Parsing template JSON');
                const parsed = parseAiJsonResponse(responseText);
                let templatePayload = normalizeAiTemplatePayload(parsed);
                if (!templatePayload) {
                    templatePayload = await tryRepairTemplateFromText(apiKey, promptText, responseText, { onProgress });
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
                if (payload.page?.title) {
                    $('#titleInput').value = String(payload.page.title);
                }
                if (payload.data && typeof payload.data === 'object') {
                    headers = Array.isArray(payload.data.headers) ? payload.data.headers : [];
                    dataRows = Array.isArray(payload.data.rows) ? payload.data.rows : [];
                    identifierColumn = String(payload.data.identifierColumn || '');
                }
                const selectedIndex = Number.isFinite(parseInt(payload.currentPageIndex, 10))
                    ? parseInt(payload.currentPageIndex, 10)
                    : currentPageIndex;
                await setDocumentPagesFromTemplate(payload, { fitView: true, selectedIndex });
                bindings = new Map(documentPages[currentPageIndex]?.bindings || payload.bindings || []);
                historyStack = [];
                historyIndex = -1;
                lastHistorySig = null;
                requestSaveState();
                renderLayers();
                refreshCanvasPageControlsDebounced();
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
                    const templatePayload = await callAiTemplateEditor(apiKey, prompt, {
                        onProgress: (stage) => thinkingTicker.setStage(stage)
                    });

                    thinkingTicker.stop();
                    thinkingEl.textContent = 'Applying returned template JSON...';
                    thinkingEl.className = 'ai-chat-message assistant';

                    await applyAiTemplatePayload(templatePayload);
                    const pageCount = Array.isArray(documentPages) ? documentPages.length : 1;
                    const appliedMsg = `Loaded AI template JSON (${pageCount} page${pageCount === 1 ? '' : 's'}).`;
                    appendAiChatMessage('status', appliedMsg);
                    aiConversation.push({ role: 'assistant', text: appliedMsg });
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
