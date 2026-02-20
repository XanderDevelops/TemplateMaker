        // --- SETTINGS & API KEY MODAL ---
        const settingsBtn = $('#settingsBtn'); const settingsModal = $('#settingsModal'); const closeSettingsModalBtn = $('#closeSettingsModal');
        settingsBtn.addEventListener('click', openSettingsModal); closeSettingsModalBtn.addEventListener('click', () => settingsModal.style.display = 'none'); settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) { settingsModal.style.display = 'none'; } });
        const openCustomerPortal = async () => { const btn = $('#manageSubscriptionBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Generating link...'; } try { const { data, error } = await supabase.functions.invoke('lemonsqueezy-sub-manager', { body: { action: 'getPortalLink' } }); if (error) throw error; if (data && data.url) window.open(data.url, '_blank'); else throw new Error('Could not generate portal link.'); } catch (error) { alert(`Error: ${error.message}`); } finally { if (btn) { btn.disabled = false; btn.textContent = 'Manage Subscription'; } } };
        async function openSettingsModal() { const settingsContent = $('#settingsContent'); settingsContent.innerHTML = '<p class="muted">Loading account details...</p>'; settingsModal.style.display = 'flex'; const { data: { user } } = await supabase.auth.getUser(); if (!user) { settingsContent.innerHTML = '<p>Please log in to manage your settings.</p>'; return; } const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single(); if (error || !profile) { settingsContent.innerHTML = '<p class="error">Could not load your profile.</p>'; return; } const currentTheme = localStorage.getItem('csvlink-theme') || 'light'; let modalHTML = `<div class="settings-section stack"><h4>Appearance</h4><button id="themeToggleBtn" class="btn ghost" style="width: 100%;">${currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</button></div><div class="settings-section stack" style="gap: 16px;"><h4>Account</h4><div class="stack"><label for="newPassword">New Password</label><input type="password" id="newPassword" placeholder="Enter new password"></div><div class="stack"><label for="confirmPassword">Confirm Password</label><input type="password" id="confirmPassword" placeholder="Confirm new password"></div><button id="changePasswordBtn" class="btn">Update Password</button><p id="passwordMessage" class="muted" style="text-align:center; margin-top: 4px;"></p></div>`; if (profile.role === 'pro' || profile.role === 'admin') { modalHTML += `<div class="settings-section stack"><h4>Subscription</h4><p class="muted">You are on the Pro plan.</p><button id="manageSubscriptionBtn" class="btn ghost" style="width: 100%;">Manage Subscription</button></div>`; } else { modalHTML += `<div class="settings-section stack"><h4>Upgrade to Pro</h4><p class="muted">Upgrade for API access and unlimited templates.</p><a href="/#pricing" class="btn" style="text-decoration: none;">View Pricing Plans</a></div>`; } if (profile.role === 'pro' || profile.role === 'admin') { modalHTML += `<div class="settings-section stack" style="gap: 16px;"><h4>Developer API Keys</h4><div id="newKeyContainer" class="stack" style="display:none;"><h5>Your New API Key</h5><p class="muted">Copy this key and store it safely. <strong>You will not see it again.</strong></p><div id="newKeyDisplay"></div></div><div class="stack"><h5>Your Existing Keys</h5><div id="existingKeysList" class="stack">Loading...</div></div><button id="generateKeyBtn" class="btn">Generate New API Key</button><p id="keyMessage" class="muted" style="text-align:center; margin-top: 4px;"></p></div>`; } settingsContent.innerHTML = modalHTML; attachSettingsEventListeners(user.id, profile.role); }
        function attachSettingsEventListeners(userId, role) { on('#themeToggleBtn', 'click', toggleTheme); on('#changePasswordBtn', 'click', async () => { const newPassword = $('#newPassword').value, confirmPassword = $('#confirmPassword').value, msgEl = $('#passwordMessage'); if (!newPassword || newPassword !== confirmPassword) { msgEl.textContent = 'Passwords do not match or are empty.'; return; } msgEl.textContent = 'Updating...'; const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) { msgEl.textContent = `Error: ${error.message}`; } else { msgEl.textContent = 'Password updated successfully!'; $('#newPassword').value = ''; $('#confirmPassword').value = ''; } }); if (role === 'pro' || role === 'admin') { on('#generateKeyBtn', 'click', handleGenerateKey); loadAndDisplayKeys(userId); if ($('#manageSubscriptionBtn')) on('#manageSubscriptionBtn', 'click', openCustomerPortal); } }
        function applyTheme(theme) {
            document.body.classList.toggle('light-mode', theme === 'light');
            localStorage.setItem('csvlink-theme', theme);
            if (pageRect) {
                styleActivePageRect();
                renderCanvasGhostPages();
                canvas.requestRenderAll();
            }
            const icon = $('#themeIconSvg');
            if (icon) {
                icon.innerHTML = (theme === 'light')
                    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/>'
                    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
            }
        }
        function toggleTheme() {
            const newTheme = (localStorage.getItem('csvlink-theme') || 'light') === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            const themeBtn = $('#themeToggleBtn');
            if (themeBtn) themeBtn.textContent = newTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }
        // toolbar icon toggle
        $('#themeIconBtn')?.addEventListener('click', toggleTheme);
        async function loadAndDisplayKeys(userId) { const list = $('#existingKeysList'); const { data: keys, error } = await supabase.from('api_keys').select('api_key, created_at').eq('user_id', userId); if (error) { list.innerHTML = '<p class="error">Could not load keys.</p>'; return; } if (keys.length === 0) { list.innerHTML = '<p class="muted">No API keys generated.</p>'; } else { list.innerHTML = keys.map(k => `<div class="api-key-item"><span>${k.api_key.substring(0, 11)}...${k.api_key.substring(k.api_key.length - 4)}</span><span class="muted">Created: ${new Date(k.created_at).toLocaleDateString()}</span></div>`).join(''); } }
        async function handleGenerateKey() { const btn = $('#generateKeyBtn'), msg = $('#keyMessage'), container = $('#newKeyContainer'), display = $('#newKeyDisplay'); btn.disabled = true; btn.textContent = 'Generating...'; msg.textContent = ''; container.style.display = 'none'; try { const { data, error } = await supabase.functions.invoke('generate-api-key'); if (error) throw error; display.textContent = data.apiKey; container.style.display = 'block'; const { data: { user } } = await supabase.auth.getUser(); loadAndDisplayKeys(user.id); } catch (error) { msg.textContent = `Error: ${error.message}`; } finally { btn.disabled = false; btn.textContent = 'Generate New API Key'; } }

        // --- INSPECTOR & HELPERS ---
        const inspector = $('#inspector'); const multiInspector = $('#multiSelectInspector');
        const fontPickerState = { search: '', serif: 'all', style: 'all' };
        const MAX_FONT_PREVIEW_RESULTS = 48;
        const FONT_PREVIEW_SAMPLE = 'The quick brown fox';
        canvas.on('selection:created', (e) => {
            if (activeTableCellEditor) closeTableCellEditor({ commit: true });
            if (!e.target?.isTable) clearTableCellSelections();
            refreshInspector(e);
            renderLayers();
            updateFloatingLinker(e.target);
        });
        canvas.on('selection:updated', (e) => {
            if (activeTableCellEditor) closeTableCellEditor({ commit: true });
            if (!e.target?.isTable) clearTableCellSelections();
            refreshInspector(e);
            renderLayers();
            updateFloatingLinker(e.target);
        });
        canvas.on('selection:cleared', () => {
            if (activeTableCellEditor) closeTableCellEditor({ commit: true });
            clearTableCellSelections();
            $('#noSelection').style.display = 'block';
            inspector.style.display = 'none';
            multiInspector.style.display = 'none';
            renderPageInspector();
            renderLayers();
            updateFloatingLinker(null);
        });
        function updateLiveInspector(options) { const target = options.target; if (!target || target.type === 'activeSelection') return; const updateValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; }; updateValue('inspector-pos-x', Math.round(target.left)); updateValue('inspector-pos-y', Math.round(target.top)); updateValue('inspector-dim-w', Math.round(target.getScaledWidth())); updateValue('inspector-dim-h', Math.round(target.getScaledHeight())); updateValue('inspector-opacity-slider', target.opacity); updateValue('inspector-opacity-input', target.opacity); updateValue('inspector-stroke-width-slider', target.strokeWidth); updateValue('inspector-stroke-width-input', target.strokeWidth); if (target.rx !== undefined) { updateValue('inspector-corner-radius-slider', target.rx); updateValue('inspector-corner-radius-input', target.rx); } }
        function refreshInspector(e) { const target = e.target || canvas.getActiveObject(); if (!target) return; if (target.type === 'activeSelection') { inspector.style.display = 'none'; multiInspector.style.display = 'grid'; $('#noSelection').style.display = 'none'; renderMultiSelectInspector(target); } else { multiInspector.style.display = 'none'; inspector.style.display = 'grid'; $('#noSelection').style.display = 'none'; renderSingleObjectInspector(target); } }
        function getCommonPropertyValue(objects, property) { const firstValue = objects[0][property]; for (let i = 1; i < objects.length; i++) { if (objects[i][property] !== firstValue) return ''; } return firstValue; }
        function setCommonPropertyValue(objects, property, value) {
            if (property === 'fontFamily') ensureFontFamilyLoaded(value);
            objects.forEach(obj => {
                if (property === 'curveAmount' && obj.type === 'textbox') {
                    setTextboxCurve(obj, value, { skipRender: true });
                    return;
                }
                obj.set(property, value);
                if (obj.type === 'textbox' && ['text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle'].includes(property)) {
                    refreshTextboxCurve(obj, { skipRender: true });
                }
                if (property === 'fontFamily' && typeof obj.initDimensions === 'function') {
                    obj.initDimensions();
                    obj.setCoords?.();
                }
            });
            canvas.renderAll();
            requestSaveState();
        }
        function selectSameTypeObjects(baseObject) {
            if (!baseObject) return;
            const matches = canvas.getObjects().filter(obj => {
                if (!obj || obj.oid === 'pageRect' || obj.excludeFromExport || obj.isSnapLine || obj.isArtboard) return false;
                if (obj.locked) return false;
                if (baseObject.isTable) return !!obj.isTable;
                if (baseObject.isSvgGroup) return !!obj.isSvgGroup;
                return obj.type === baseObject.type && !obj.isTable && !obj.isSvgGroup;
            });

            if (!matches.length) return;
            if (matches.length === 1) canvas.setActiveObject(matches[0]);
            else canvas.setActiveObject(new fabric.ActiveSelection(matches, { canvas }));
            canvas.requestRenderAll();
            refreshInspector({ target: canvas.getActiveObject() });
        }
        function renderMultiSelectInspector(selection) {
            multiInspector.innerHTML = '';
            const objects = selection.getObjects();

            // Check if all selected objects are text
            const allText = objects.every(obj => obj.type === 'textbox');

            multiInspector.appendChild(section('Actions', [
                buttonRow('Group', () => { if (selection.size() > 1) selection.toGroup(); canvas.requestRenderAll(); }),
                buttonRow('Remove', () => { removeCanvasObjects(objects); })
            ]));

            // Alignment for multiple objects
            multiInspector.appendChild(section('Align Objects', [alignMultipleObjectsButtons()]));
            multiInspector.appendChild(section('Align to Page', [alignToPageButtons(true)]));
            multiInspector.appendChild(section('Distribute', [distributeButtons()]));

            // If all selected are text, show text formatting
            if (allText) {
                const commonFontSize = getCommonPropertyValue(objects, 'fontSize');
                const commonFontFamily = getCommonPropertyValue(objects, 'fontFamily');
                const commonFill = getCommonPropertyValue(objects, 'fill');
                const commonTextAlign = getCommonPropertyValue(objects, 'textAlign');
                const commonFontWeight = getCommonPropertyValue(objects, 'fontWeight');
                const commonFontStyle = getCommonPropertyValue(objects, 'fontStyle');
                const commonUnderline = getCommonPropertyValue(objects, 'underline');
                const commonCurveAmount = getCommonPropertyValue(objects, 'curveAmount');

                multiInspector.appendChild(section('Text Formatting', [
                    inputRow('Font Size', commonFontSize || '', v => setCommonPropertyValue(objects, 'fontSize', parseFloat(v) || 14)),
                    fontFamilyInputRow('Font Family', commonFontFamily || 'Arial', v => setCommonPropertyValue(objects, 'fontFamily', v)),
                    colorInputRow('Text Color', commonFill || '#000000', v => setCommonPropertyValue(objects, 'fill', v)),
                    sliderRow('Curve', Number.isFinite(parseFloat(commonCurveAmount)) ? parseFloat(commonCurveAmount) : 0, v => setCommonPropertyValue(objects, 'curveAmount', parseFloat(v) || 0), { min: -100, max: 100, step: 1 }),
                    buttonGroupRow('Text Style', [
                        { value: 'bold', label: 'B', active: commonFontWeight === 'bold' },
                        { value: 'italic', label: 'I', active: commonFontStyle === 'italic' },
                        { value: 'underline', label: 'U', active: commonUnderline === true }
                    ], null, (v) => {
                        objects.forEach(obj => {
                            if (v === 'bold') obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold');
                            else if (v === 'italic') obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic');
                            else if (v === 'underline') obj.set('underline', !obj.underline);
                            refreshTextboxCurve(obj, { skipRender: true });
                        });
                        canvas.renderAll();
                        requestSaveState();
                        refreshInspector({ target: selection });
                    }),
                    buttonGroupRow('Alignment', ['left', 'center', 'right', 'justify'], commonTextAlign || 'left', v => {
                        objects.forEach(obj => {
                            obj.set({ textAlign: v });
                            obj.initDimensions();
                            refreshTextboxCurve(obj, { skipRender: true });
                        });
                        canvas.requestRenderAll();
                        requestSaveState();
                    })
                ]));
            }

            multiInspector.appendChild(section('Common', [
                sliderRow('Opacity', getCommonPropertyValue(objects, 'opacity') ?? 1, (v) => setCommonPropertyValue(objects, 'opacity', v), { min: 0, max: 1, step: 0.01 }),
                colorInputRow('Stroke Color', getCommonPropertyValue(objects, 'stroke') ?? '', v => setCommonPropertyValue(objects, 'stroke', v)),
                sliderRow('Stroke Width', getCommonPropertyValue(objects, 'strokeWidth') ?? 0, (v) => setCommonPropertyValue(objects, 'strokeWidth', v), { min: 0, max: 50, step: 1 })
            ]));
        }



        function setObjectDimensions(obj, w, h, opts = {}) {
            const lockWidth = !!opts.lockWidth;
            const minSize = 1;
            if (!obj || !obj.width || !obj.height) return;
            const newW = Math.max(minSize, Number(w) || obj.getScaledWidth());
            const newH = Math.max(minSize, Number(h) || obj.getScaledHeight());

            const baseW = obj.width;
            const baseH = obj.height;

            if (!lockWidth) obj.scaleX = newW / baseW;
            obj.scaleY = newH / baseH;
            obj.setCoords();
        }

        function dimensionsRow(obj) {
            const isTextbox = obj?.type === 'textbox';
            const w = document.createElement('div');
            w.className = 'stack full-width';
            w.innerHTML = `<label>Dimensions</label>`;
            const r = document.createElement('div');
            r.className = 'row';

            const x = document.createElement('input');
            x.type = 'number';
            x.value = Math.round(obj.getScaledWidth());
            x.id = 'inspector-dim-w';

            const y = document.createElement('input');
            y.type = 'number';
            y.value = Math.round(obj.getScaledHeight());
            y.id = 'inspector-dim-h';

            if (isTextbox) {
                x.disabled = true;
                x.title = 'Text box width is locked. Use the text box handles to resize width.';
                x.style.opacity = '0.6';
            }

            const update = () => {
                setObjectDimensions(obj, x.value, y.value, { lockWidth: isTextbox });
                canvas.requestRenderAll();
                updateLiveInspector({ target: canvas.getActiveObject() });
            };
            const finalUpdate = () => { update(); requestSaveState(); };
            x.oninput = update; y.oninput = update;
            x.onchange = finalUpdate; y.onchange = finalUpdate;

            r.append(x, y);
            w.appendChild(r);
            return w;
        }

        function renderSingleObjectInspector(o) {
            inspector.innerHTML = '';
            const actions = [];
            if (o.type === 'group' && !o.isTable && !o.isSvgGroup) actions.push(buttonRow('Ungroup', () => o.toActiveSelection()));
            actions.push(buttonRow('Select Same Type', () => selectSameTypeObjects(o)));
            actions.push(buttonRow('Remove', () => removeCanvasObjects([o])));
            inspector.appendChild(section('Actions', actions));

            inspector.appendChild(section('Advanced Links', [buttonRow(`Manage Links (${getBindingsFor(o).length})`, () => { selectedObjectForManager = o; openDataLinksManager(); })]));
            if (o.type === 'image') inspector.appendChild(section('Image', [buttonRow('Crop Image', () => openVisualCropper(o))]));
            if (['rect', 'image', 'circle', 'triangle', 'polygon'].includes(o.type)) { const shapeProps = []; if (['rect', 'image'].includes(o.type)) shapeProps.push(sliderRow('Corner Radius', o.rx ?? 0, (v) => o.set({ rx: v, ry: v }), { min: 0, max: Math.min(o.width, o.height) / 2, step: 1 })); inspector.appendChild(section('Shape Properties', shapeProps)); }

            if (o.isSvgGroup) {
                inspector.appendChild(section('SVG Style', [
                    colorInputRow('Fill', o.fill, v => { o.set('fill', v); o.forEachObject(sub => { if (sub.fill !== 'none') sub.set({ fill: v }) }); }),
                    colorInputRow('Stroke', o.stroke, v => { o.set('stroke', v); o.forEachObject(sub => sub.set({ stroke: v })); }),
                    sliderRow('Stroke Width', o.strokeWidth ?? 1, v => {
                        o.set({ strokeWidth: parseFloat(v) });
                        o.forEachObject(sub => sub.set({ strokeWidth: parseFloat(v) }));
                        // Fix for pivot shift: setCoords and recalibrate if group
                        o.setCoords();
                        if (o.type === 'group') {
                            // This re-calculates the group size based on children
                            const center = o.getCenterPoint();
                            o.addWithUpdate();
                            o.setPositionByOrigin(center, 'center', 'center');
                        }
                        canvas.renderAll();
                        requestSaveState();
                    }, { min: 0, max: 20, step: 0.5 })
                ]));
            }

            if (['rect', 'triangle', 'circle', 'polygon', 'path'].includes(o.type)) { inspector.appendChild(section('Fill', [colorInputRow('Color', o.fill, v => o.set({ fill: v })), buttonRow('Fill with Image', () => { editingFillObject = o; $('#imageFillUpload').click(); })])); $('#imageFillUpload').onchange = e => { if (!e.target.files?.[0] || !editingFillObject) return; const reader = new FileReader(); reader.onload = ev => { fabric.Image.fromURL(ev.target.result, img => { editingFillObject.set('fill', new fabric.Pattern({ source: img.getElement(), repeat: 'repeat' })); canvas.renderAll(); requestSaveState(); }, { crossOrigin: 'anonymous' }); }; reader.readAsDataURL(e.target.files[0]); e.target.value = ''; }; }
            if (['rect', 'triangle', 'circle', 'polygon', 'path', 'line'].includes(o.type)) {
                inspector.appendChild(section('Stroke', [
                    colorInputRow('Color', o.stroke || '#000000', v => {
                        o.set({ stroke: v || null });
                    }),
                    sliderRow('Width', o.strokeWidth ?? 1, v => {
                        o.set({ strokeWidth: Math.max(0, parseFloat(v) || 0) });
                        o.setCoords();
                    }, { min: 0, max: 40, step: 0.5 })
                ]));
            }

            if (o.isTable) {
                ensureTableCellData(o);
                const selectedCells = getSelectedTableCellIndices(o);
                const singleSelectedCellIndex = selectedCells.length === 1 ? selectedCells[0] : -1;
                const cellTextBinding = singleSelectedCellIndex >= 0
                    ? getBindingsFor(o).find(b => b.property === 'Cell Text' && getNormalizedBindingCellIndex(o, b) === singleSelectedCellIndex)
                    : null;
                const selectionInfo = document.createElement('div');
                selectionInfo.className = 'full-width muted';
                selectionInfo.style.fontSize = '11px';
                selectionInfo.style.marginBottom = '6px';
                selectionInfo.textContent = selectedCells.length
                    ? `${selectedCells.length} cell(s) selected`
                    : 'No cells selected. Click table cells (Shift/Ctrl for multi-select). Double-click a cell to edit.';

                const cellLinkInfo = document.createElement('div');
                cellLinkInfo.className = 'full-width muted';
                cellLinkInfo.style.fontSize = '11px';
                if (singleSelectedCellIndex < 0) {
                    cellLinkInfo.textContent = 'Data Link: select exactly one cell to link it to a data column.';
                } else {
                    cellLinkInfo.textContent = `Data Link ${tableCellRefLabel(o, singleSelectedCellIndex)}: ${cellTextBinding?.column || 'not linked'}`;
                }

                const tableRows = [
                    selectionInfo,
                    cellLinkInfo,
                    buttonRow('Link Selected Cell To Column', () => {
                        if (singleSelectedCellIndex < 0) {
                            showNotification('Select exactly one table cell first.');
                            return;
                        }
                        let binding = cellTextBinding;
                        if (!binding) {
                            binding = saveBinding(o, { column: '', property: 'Cell Text', cellIndex: singleSelectedCellIndex });
                        } else {
                            binding.cellIndex = singleSelectedCellIndex;
                            requestSaveState();
                        }
                        openColumnSelectionModal(o, binding, {
                            onLinked: () => {
                                if (dataLinksManagerModal && dataLinksManagerModal.style.display === 'flex') renderDataLinksManager();
                                refreshInspector({ target: o });
                            }
                        });
                    }),
                    buttonRow('Remove Selected Cell Link', () => {
                        if (singleSelectedCellIndex < 0 || !cellTextBinding) {
                            showNotification('No linked cell selected.');
                            return;
                        }
                        removeBinding(o, cellTextBinding);
                        refreshInspector({ target: o });
                    }),
                    buttonRow('Select All Cells', () => {
                        setSelectedTableCells(o, Array.from({ length: o.rows * o.cols }, (_, i) => i));
                        refreshInspector({ target: o });
                    }),
                    buttonRow('Clear Cell Selection', () => {
                        o._selectedCells = new Set();
                        refreshTableSelectionVisual(o);
                        canvas.requestRenderAll();
                        refreshInspector({ target: o });
                    }),
                    inputRow('Rows', o.rows || 1, v => {
                        const targetRows = Math.max(1, parseInt(v, 10) || 1);
                        resizeTableCellData(o, targetRows, Math.max(1, o.cols || 1));
                        o.rowHeights = Array.from({ length: targetRows }, (_, i) => o.rowHeights?.[i] || o.rowHeights?.[0] || 50);
                        o.headerRows = Math.min(o.headerRows || 0, targetRows);
                        rebuildTableCells(o);
                        canvas.requestRenderAll();
                    }, 'number'),
                    inputRow('Columns', o.cols || 1, v => {
                        const targetCols = Math.max(1, parseInt(v, 10) || 1);
                        resizeTableCellData(o, Math.max(1, o.rows || 1), targetCols);
                        o.colWidths = Array.from({ length: targetCols }, (_, i) => o.colWidths?.[i] || o.colWidths?.[0] || 120);
                        rebuildTableCells(o);
                        canvas.requestRenderAll();
                    }, 'number'),
                    inputRow('Header Rows', o.headerRows || 0, v => {
                        o.headerRows = Math.max(0, Math.min(o.rows || 1, parseInt(v, 10) || 0));
                        rebuildTableCells(o);
                        canvas.requestRenderAll();
                    }, 'number'),
                    colorInputRow('Header Fill', o.headerFill || '#f3f4f6', v => {
                        o.headerFill = v;
                        rebuildTableCells(o);
                        canvas.requestRenderAll();
                    }),
                    colorInputRow('Body Fill', o.bodyFill || '#ffffff', v => {
                        o.bodyFill = v;
                        rebuildTableCells(o);
                        canvas.requestRenderAll();
                    }),
                    colorInputRow('Border Color', o.borderColor || '#333333', v => {
                        o.borderColor = v;
                        applyToSelectedTableCells(o, (cell) => { cell.borderColor = v || '#333333'; }, { fallbackAll: true });
                    }),
                    sliderRow('Border Width', o.borderWidth || 1, v => {
                        o.borderWidth = parseFloat(v);
                        applyToSelectedTableCells(o, (cell) => { cell.borderWidth = Math.max(0.5, parseFloat(v) || 1); }, { fallbackAll: true });
                    }, { min: 0, max: 20, step: 0.5 }),
                    inputRow('Cell Text', getCommonSelectedTableCellValue(o, 'text', { fallbackAll: false }) || '', v => {
                        applyToSelectedTableCells(o, (cell) => { cell.text = v; }, { fallbackAll: true });
                    }),
                    colorInputRow('Cell Fill', getCommonSelectedTableCellValue(o, 'fill', { fallbackAll: false }) || '#ffffff', v => {
                        applyToSelectedTableCells(o, (cell) => { cell.fill = v || '#ffffff'; }, { fallbackAll: true });
                    }),
                    colorInputRow('Cell Text Color', getCommonSelectedTableCellValue(o, 'textColor', { fallbackAll: false }) || '#111111', v => {
                        applyToSelectedTableCells(o, (cell) => { cell.textColor = v || '#111111'; }, { fallbackAll: true });
                    }),
                    sliderRow('Cell Font Size', getCommonSelectedTableCellValue(o, 'fontSize', { fallbackAll: false }) || 14, v => {
                        applyToSelectedTableCells(o, (cell) => { cell.fontSize = Math.max(6, parseFloat(v) || 14); }, { fallbackAll: true });
                    }, { min: 6, max: 96, step: 1 }),
                    buttonGroupRow('Cell H Align', ['left', 'center', 'right', 'justify'], getCommonSelectedTableCellValue(o, 'textAlign', { fallbackAll: false }) || '', v => {
                        applyToSelectedTableCells(o, (cell) => { cell.textAlign = v; }, { fallbackAll: true });
                    }),
                    buttonGroupRow('Cell V Align', ['top', 'middle', 'bottom'], getCommonSelectedTableCellValue(o, 'textVAlign', { fallbackAll: false }) || '', v => {
                        applyToSelectedTableCells(o, (cell) => { cell.textVAlign = v; }, { fallbackAll: true });
                    }),
                    buttonRow('Center Text In Cell', () => {
                        applyToSelectedTableCells(o, (cell) => {
                            cell.textAlign = 'center';
                            cell.textVAlign = 'middle';
                        }, { fallbackAll: true });
                    }),
                    iconButtonsRow('Borders', [
                        { icon: tableActionIcon('top'), label: 'Top', title: 'Toggle top border', onClick: () => toggleSelectedTableBorderSide(o, 'top') },
                        { icon: tableActionIcon('right'), label: 'Right', title: 'Toggle right border', onClick: () => toggleSelectedTableBorderSide(o, 'right') },
                        { icon: tableActionIcon('bottom'), label: 'Bottom', title: 'Toggle bottom border', onClick: () => toggleSelectedTableBorderSide(o, 'bottom') },
                        { icon: tableActionIcon('left'), label: 'Left', title: 'Toggle left border', onClick: () => toggleSelectedTableBorderSide(o, 'left') }
                    ]),
                    iconButtonsRow('Structure', [
                        { icon: tableActionIcon('addRow'), label: 'Row+', title: 'Add row', onClick: () => addTableRow(o) },
                        { icon: tableActionIcon('removeRow'), label: 'Row-', title: 'Remove row', onClick: () => removeTableRow(o) },
                        { icon: tableActionIcon('addCol'), label: 'Col+', title: 'Add column', onClick: () => addTableColumn(o) },
                        { icon: tableActionIcon('removeCol'), label: 'Col-', title: 'Remove column', onClick: () => removeTableColumn(o) }
                    ])
                ];
                inspector.appendChild(section('Table', tableRows));
            }

            if (o.type === 'textbox') {
                inspector.appendChild(section('Text', [
                    inputRow('Content', o.text, v => {
                        o.set({ text: v });
                        refreshTextboxCurve(o, { skipRender: true });
                    }, 'textarea'),
                    inputRow('Font Size', o.fontSize, v => {
                        o.set({ fontSize: parseFloat(v) });
                        refreshTextboxCurve(o, { skipRender: true });
                    }),
                    fontFamilyInputRow('Font Family', o.fontFamily, (selectedFamily) => {
                        o.set({ fontFamily: selectedFamily });
                        if (typeof o.initDimensions === 'function') {
                            o.initDimensions();
                            o.setCoords?.();
                        }
                        refreshTextboxCurve(o, { skipRender: true });
                        canvas.renderAll();
                        requestSaveState();
                    }, { showUploadButton: true }),
                    colorInputRow('Fill Color', o.fill, v => o.set({ fill: v })),
                    sliderRow('Curve', Number.isFinite(parseFloat(o.curveAmount)) ? parseFloat(o.curveAmount) : 0, v => {
                        setTextboxCurve(o, parseFloat(v) || 0, { skipRender: true });
                    }, { min: -100, max: 100, step: 1 }),
                    buttonGroupRow('Text Style', [
                        { value: 'bold', label: 'B', active: o.fontWeight === 'bold' },
                        { value: 'italic', label: 'I', active: o.fontStyle === 'italic' },
                        { value: 'underline', label: 'U', active: o.underline === true }
                    ], null, (v) => {
                        if (v === 'bold') o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold');
                        else if (v === 'italic') o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic');
                        else if (v === 'underline') o.set('underline', !o.underline);
                        refreshTextboxCurve(o, { skipRender: true });
                        canvas.renderAll();
                        requestSaveState();
                        refreshInspector({ target: o });
                    }),
                    buttonGroupRow('Alignment', ['left', 'center', 'right', 'justify'], o.textAlign, v => {
                        o.set({ textAlign: v });
                        o.initDimensions();
                        refreshTextboxCurve(o, { skipRender: true });
                        canvas.requestRenderAll();
                    })
                ]));
            }
            inspector.appendChild(section('Common', [
                xyInputRow('Position', { x: o.left, y: o.top }, (p) => o.set({ left: p.x, top: p.y })),
                xyInputRow('Dimensions', { w: o.getScaledWidth(), h: o.getScaledHeight() }, (d) => { setObjectDimensions(o, d.w, d.h); }),
                sliderRow('Opacity', o.opacity ?? 1, (v) => o.set({ opacity: v }), { min: 0, max: 1, step: 0.01 }),
            ]));
            inspector.appendChild(section('Align to Page', [alignToPageButtons()]));
        }
        function renderPageInspector() {
            const pageRect = canvas.getObjects().find(o => o.oid === 'pageRect');
            if (!pageRect) return;
            const container = document.getElementById('pageInspector');
            if (!container) return;
            container.innerHTML = '';
            const pageProps = section('Page Style', [
                colorInputRow('Background Color', pageRect.fill || '#ffffff', (v) => {
                    pageRect.set({ fill: v });
                    canvas.requestRenderAll();
                    requestSaveState();
                }),
                buttonRow('Set Background Image', () => {
                    const up = document.getElementById('imageFillUpload');
                    if (!up) return;
                    editingFillObject = pageRect;
                    up.click();
                })
            ]);
            container.appendChild(pageProps);
        }
        on('#loadTemplateBtnPage', 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTemplateLoader(e.currentTarget || e.target);
        });
        function section(title, rows) { const w = document.createElement('div'); w.className = 'stack'; w.innerHTML = `<h3>${title}</h3>`; const g = document.createElement('div'); g.className = 'prop-grid'; rows.forEach(r => g.appendChild(r)); w.appendChild(g); return w; }
        function inputRow(label, value, onChange, type = 'text') { const w = document.createElement('div'); w.className = 'stack full-width'; w.innerHTML = `<label>${label}</label>`; const i = document.createElement(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') i.type = type; i.value = value ?? ''; i.oninput = () => { onChange(i.value); canvas.requestRenderAll(); }; i.onchange = () => requestSaveState(); if (type === 'textarea') i.rows = 3; w.appendChild(i); return w; }
        function xyInputRow(label, values, onChange) { const w = document.createElement('div'); w.className = 'stack full-width'; w.innerHTML = `<label>${label}</label>`; const r = document.createElement('div'); r.className = 'row'; const x = document.createElement('input'); x.type = 'number'; x.value = Math.round(values.x ?? values.w ?? 0); const y = document.createElement('input'); y.type = 'number'; y.value = Math.round(values.y ?? values.h ?? 0); if (label === 'Position') { x.id = 'inspector-pos-x'; y.id = 'inspector-pos-y'; } else if (label === 'Dimensions') { x.id = 'inspector-dim-w'; y.id = 'inspector-dim-h'; } const update = () => { const v = label === 'Position' ? { x: parseFloat(x.value), y: parseFloat(y.value) } : { w: parseFloat(x.value), h: parseFloat(y.value) }; onChange(v); canvas.requestRenderAll(); updateLiveInspector({ target: canvas.getActiveObject() }); }; const finalUpdate = () => { update(); requestSaveState(); }; x.oninput = update; y.oninput = update; x.onchange = finalUpdate; y.onchange = finalUpdate; r.append(x, y); w.appendChild(r); return w; }
        function sliderRow(label, value, onChange, { min = 0, max = 100, step = 1 }, idPrefix = null) { const w = document.createElement('div'); w.className = 'stack full-width'; w.innerHTML = `<label>${label}</label>`; const r = document.createElement('div'); r.className = 'slider-wrapper'; const s = document.createElement('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = value; const n = document.createElement('input'); n.type = 'number'; n.min = min; n.max = max; n.step = step; n.value = value; const idBase = idPrefix || 'inspector-' + label.toLowerCase().replace(/\s+/g, '-'); s.id = idBase + '-slider'; n.id = idBase + '-input'; const update = (val) => { onChange(val); canvas.requestRenderAll(); }; s.oninput = () => { n.value = s.value; update(parseFloat(s.value)); }; n.oninput = () => { s.value = n.value; update(parseFloat(n.value)); }; s.onchange = () => requestSaveState(); n.onchange = () => requestSaveState(); r.append(s, n); w.appendChild(r); return w; }
        function selectRow(label, opts, val, onChange) { const w = document.createElement('div'); w.className = 'stack full-width'; w.innerHTML = `<label>${label}</label>`; const s = document.createElement('select'); opts.forEach(opt => s.innerHTML += `<option value="${opt}" ${opt == val ? 'selected' : ''}>${opt}</option>`); s.onchange = e => { onChange(e.target.value); canvas.renderAll(); requestSaveState(); }; w.appendChild(s); return w; }
        function fontFamilyInputRow(label, value, onCommit, options = {}) {
            const showUploadButton = !!options.showUploadButton;
            const w = document.createElement('div');
            w.className = 'stack full-width';
            w.innerHTML = `<label>${label}</label>`;

            const topRow = document.createElement('div');
            topRow.className = 'row';
            topRow.style.gap = '8px';

            const selectedInput = document.createElement('input');
            selectedInput.type = 'text';
            selectedInput.value = value ?? '';
            selectedInput.placeholder = 'Selected font family';
            selectedInput.autocomplete = 'off';
            selectedInput.spellcheck = false;
            selectedInput.style.flex = '1';
            selectedInput.style.fontFamily = `"${normalizeFontFamilyName(selectedInput.value) || 'Inter'}", var(--font), sans-serif`;

            const commitSelected = () => {
                const nextValue = normalizeFontFamilyName(selectedInput.value);
                if (!nextValue) return;
                selectedInput.value = nextValue;
                selectedInput.style.fontFamily = `"${nextValue}", var(--font), sans-serif`;
                addFontFamilyToRegistry(nextValue);
                ensureFontFamilyLoaded(nextValue);
                onCommit(nextValue);
            };

            selectedInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                selectedInput.blur();
            });
            selectedInput.addEventListener('change', commitSelected);

            topRow.appendChild(selectedInput);

            if (showUploadButton) {
                const btn = document.createElement('button');
                btn.className = 'btn ghost icon-only';
                btn.title = 'Upload Font';
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
                btn.onclick = () => $('#fontUpload').click();
                topRow.appendChild(btn);
            }

            const controlsRow = document.createElement('div');
            controlsRow.className = 'row';
            controlsRow.style.gap = '8px';

            const searchInput = document.createElement('input');
            searchInput.type = 'search';
            searchInput.value = fontPickerState.search || '';
            searchInput.placeholder = 'Search fonts...';
            searchInput.style.flex = '1';
            searchInput.autocomplete = 'off';
            searchInput.spellcheck = false;

            const serifSelect = document.createElement('select');
            serifSelect.style.width = '120px';
            getFontSerifFilterOptions().forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                serifSelect.appendChild(option);
            });
            serifSelect.value = fontPickerState.serif || 'all';

            const styleSelect = document.createElement('select');
            styleSelect.style.width = '130px';
            getFontStyleFilterOptions().forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                styleSelect.appendChild(option);
            });
            styleSelect.value = fontPickerState.style || 'all';

            controlsRow.append(serifSelect, styleSelect);

            const searchRow = document.createElement('div');
            searchRow.className = 'row';
            searchRow.style.gap = '8px';
            searchRow.appendChild(searchInput);

            const results = document.createElement('div');
            results.style.maxHeight = '180px';
            results.style.overflowY = 'auto';
            results.style.border = '1px solid var(--border)';
            results.style.borderRadius = '10px';
            results.style.padding = '4px';
            results.style.background = 'var(--panel)';

            const formatCategoryLabel = (category) => {
                const normalized = normalizeFontCategory(category);
                if (normalized === 'sans-serif') return 'Sans';
                if (normalized === 'serif') return 'Serif';
                if (normalized === 'display') return 'Display';
                if (normalized === 'handwriting') return 'Handwriting';
                if (normalized === 'monospace') return 'Mono';
                return normalized;
            };

            const applyFont = (fontFamily) => {
                const nextValue = normalizeFontFamilyName(fontFamily);
                if (!nextValue) return;
                selectedInput.value = nextValue;
                selectedInput.style.fontFamily = `"${nextValue}", var(--font), sans-serif`;
                addFontFamilyToRegistry(nextValue);
                ensureFontFamilyLoaded(nextValue);
                onCommit(nextValue);
            };

            const renderResults = () => {
                const query = String(searchInput.value || '').trim().toLowerCase();
                const activeSerif = String(serifSelect.value || 'all');
                const activeStyle = String(styleSelect.value || 'all');
                fontPickerState.search = searchInput.value || '';
                fontPickerState.serif = activeSerif;
                fontPickerState.style = activeStyle;

                const matched = FONT_LIST.filter(fontName => {
                    if (query && !String(fontName).toLowerCase().includes(query)) return false;
                    if (!fontMatchesSerifFilter(fontName, activeSerif)) return false;
                    if (!fontMatchesStyleFilter(fontName, activeStyle)) return false;
                    return true;
                });

                results.innerHTML = '';
                if (!matched.length) {
                    const empty = document.createElement('div');
                    empty.className = 'muted';
                    empty.style.fontSize = '11px';
                    empty.style.padding = '8px';
                    empty.textContent = 'No fonts match this search/filter.';
                    results.appendChild(empty);
                    return;
                }

                const visible = matched.slice(0, MAX_FONT_PREVIEW_RESULTS);
                visible.forEach((fontName, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'btn ghost';
                    btn.type = 'button';
                    btn.style.width = '100%';
                    btn.style.justifyContent = 'space-between';
                    btn.style.alignItems = 'center';
                    btn.style.height = 'auto';
                    btn.style.padding = '6px 8px';
                    btn.style.marginBottom = '4px';
                    btn.style.display = 'flex';
                    btn.style.gap = '8px';

                    const left = document.createElement('div');
                    left.style.flex = '1';
                    left.style.minWidth = '0';

                    const family = document.createElement('div');
                    family.textContent = fontName;
                    family.style.fontFamily = `"${fontName}", var(--font), sans-serif`;
                    family.style.fontSize = '14px';
                    family.style.textAlign = 'left';
                    family.style.whiteSpace = 'nowrap';
                    family.style.overflow = 'hidden';
                    family.style.textOverflow = 'ellipsis';

                    const sample = document.createElement('div');
                    sample.textContent = FONT_PREVIEW_SAMPLE;
                    sample.style.fontFamily = `"${fontName}", var(--font), sans-serif`;
                    sample.style.fontSize = '11px';
                    sample.style.opacity = '0.8';
                    sample.style.textAlign = 'left';
                    sample.style.whiteSpace = 'nowrap';
                    sample.style.overflow = 'hidden';
                    sample.style.textOverflow = 'ellipsis';

                    left.append(family, sample);

                    const badge = document.createElement('span');
                    badge.className = 'muted';
                    badge.style.fontSize = '10px';
                    badge.style.whiteSpace = 'nowrap';
                    badge.textContent = formatCategoryLabel(getFontCategory(fontName));

                    btn.append(left, badge);
                    btn.onclick = () => applyFont(fontName);
                    btn.onmouseenter = () => { ensureFontFamilyLoaded(fontName); };
                    results.appendChild(btn);

                    if (idx < 8) ensureFontFamilyLoaded(fontName);
                });

                if (matched.length > visible.length) {
                    const note = document.createElement('div');
                    note.className = 'muted';
                    note.style.fontSize = '10px';
                    note.style.textAlign = 'center';
                    note.style.padding = '4px 0 2px';
                    note.textContent = `Showing ${visible.length} of ${matched.length} matches. Refine search/filter.`;
                    results.appendChild(note);
                }
            };

            searchInput.addEventListener('input', renderResults);
            serifSelect.addEventListener('change', renderResults);
            styleSelect.addEventListener('change', renderResults);

            w.append(topRow, controlsRow, searchRow, results);
            renderResults();
            return w;
        }
        function buttonRow(label, onClick) { const w = document.createElement('div'); w.className = 'full-width'; const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = label; b.onclick = onClick; b.style.width = '100%'; w.appendChild(b); return w; }
        function tableActionIcon(kind) {
            const icons = {
                addRow: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="14"/><line x1="3" y1="11" x2="17" y2="11"/><line x1="20" y1="16" x2="20" y2="22"/><line x1="17" y1="19" x2="23" y2="19"/></svg>',
                removeRow: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="14"/><line x1="3" y1="11" x2="17" y2="11"/><line x1="17" y1="19" x2="23" y2="19"/></svg>',
                addCol: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="14"/><line x1="10" y1="4" x2="10" y2="18"/><line x1="20" y1="16" x2="20" y2="22"/><line x1="17" y1="19" x2="23" y2="19"/></svg>',
                removeCol: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="14"/><line x1="10" y1="4" x2="10" y2="18"/><line x1="17" y1="19" x2="23" y2="19"/></svg>',
                top: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="4" x2="20" y2="4" stroke-width="3"/></svg>',
                right: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16"/><line x1="20" y1="4" x2="20" y2="20" stroke-width="3"/></svg>',
                bottom: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="20" x2="20" y2="20" stroke-width="3"/></svg>',
                left: '<svg class="inspector-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="4" x2="4" y2="20" stroke-width="3"/></svg>'
            };
            return icons[kind] || '';
        }
        function iconButtonsRow(label, items) {
            const w = document.createElement('div');
            w.className = 'stack full-width';
            w.innerHTML = `<label>${label}</label>`;
            const r = document.createElement('div');
            r.className = 'row';
            r.style.gap = '6px';
            items.forEach(item => {
                const b = document.createElement('button');
                b.className = 'btn ghost';
                b.style.flex = '1';
                b.style.padding = '0 8px';
                b.style.height = '30px';
                b.title = item.title || item.label || '';
                b.innerHTML = `${item.icon || ''}${item.label ? `<span>${item.label}</span>` : ''}`;
                b.onclick = item.onClick;
                r.appendChild(b);
            });
            w.appendChild(r);
            return w;
        }
        function colorInputRow(label, value, onChange) {
            const w = document.createElement('div');
            w.className = 'stack full-width';
            w.innerHTML = `<label>${label}</label>`;
            const r = document.createElement('div');
            r.className = 'color-picker-wrapper';

            const t = document.createElement('input');
            t.type = 'text';
            t.value = value || '';
            t.placeholder = 'No color';

            const c = document.createElement('input');
            c.type = 'color';
            c.value = value || '#000000';

            // "Clear Color" button
            const clearBtn = document.createElement('button');
            clearBtn.className = 'btn ghost';
            clearBtn.textContent = '×';
            clearBtn.title = 'Clear color (set to null)';
            clearBtn.style.cssText = 'padding: 4px 8px; font-size: 16px; line-height: 1;';
            clearBtn.onclick = (e) => {
                e.preventDefault();
                t.value = '';
                onChange(null);
                canvas.requestRenderAll();
                requestSaveState();
            };

            const update = (val) => { onChange(val); canvas.requestRenderAll(); };
            t.oninput = () => { if (t.value) c.value = t.value; update(t.value || null); };
            c.oninput = () => { t.value = c.value; update(c.value); };
            t.onchange = () => requestSaveState();
            c.onchange = () => requestSaveState();

            r.append(t, c, clearBtn);
            w.appendChild(r);
            return w;
        }
        function buttonGroupRow(label, options, value, onChange) {
            const w = document.createElement('div');
            w.className = 'stack full-width';
            w.innerHTML = `<label>${label}</label>`;
            const r = document.createElement('div');
            r.className = 'align-buttons';
            r.style.gridTemplateColumns = `repeat(${options.length}, 32px)`;

            const icons = {
                left: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>',
                center: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>',
                right: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M9 15v2h12v-2H9zm-6 6h18v-2H3v2zm6-8h12v-2H9v2zM3 7v2h18V7H3zM3 3v2h18V3H3z"/></svg>',
                justify: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>'
            };

            options.forEach(opt => {
                const isObject = typeof opt === 'object';
                const val = isObject ? opt.value : opt;
                const label = isObject ? opt.label : opt;
                const isActive = isObject ? opt.active : (val === value);

                const btn = document.createElement('button');
                btn.className = 'btn ghost';
                if (isActive) btn.classList.add('active');

                // Use icon if available, otherwise use label
                if (icons[val]) {
                    btn.innerHTML = icons[val];
                } else {
                    btn.textContent = label;
                    btn.style.fontWeight = val === 'bold' ? 'bold' : 'normal';
                    btn.style.fontStyle = val === 'italic' ? 'italic' : 'normal';
                    btn.style.textDecoration = val === 'underline' ? 'underline' : 'none';
                }

                btn.onclick = () => {
                    onChange(val);
                    // For toggle buttons (bold, italic, underline), don't clear others
                    if (!isObject || !opt.hasOwnProperty('active')) {
                        r.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                };
                r.appendChild(btn);
            });
            w.appendChild(r);
            return w;
        }

        // --- VISUAL CROPPER ---
        function initializeVisualCropper() { const modal = $('#visualCropModal'); const container = $('#visualCropContainer'); cropCanvas = new fabric.Canvas('cropCanvas', { selection: false, backgroundColor: '#222' }); new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); cropCanvas.setWidth(width).setHeight(height); }).observe(container); on('#closeVisualCropModal', 'click', closeVisualCropper); on('#cancelCropBtn', 'click', closeVisualCropper); on('#applyCropBtn', 'click', applyCrop); }
        function openVisualCropper(imageObject) { croppingImage = imageObject; const modal = $('#visualCropModal'); modal.style.display = 'flex'; cropCanvas.clear(); const { width: cW, height: cH } = $('#visualCropContainer').getBoundingClientRect(); cropCanvas.setWidth(cW).setHeight(cH); const imgEl = croppingImage.getElement(); const scale = Math.min(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight) * 0.8; const imgInstance = new fabric.Image(imgEl, { selectable: false, evented: false, scaleX: scale, scaleY: scale }); cropCanvas.add(imgInstance); cropCanvas.centerObject(imgInstance); cropCanvas.add(new fabric.Rect({ fill: 'rgba(0,0,0,0.3)', width: cW, height: cH, selectable: false, evented: false })); const cropBox = new fabric.Rect({ left: imgInstance.left, top: imgInstance.top, width: imgInstance.getScaledWidth(), height: imgInstance.getScaledHeight(), fill: 'transparent', stroke: '#fff', strokeWidth: 2, cornerColor: '#fff', cornerSize: 12, transparentCorners: false, }); cropCanvas.add(cropBox); cropCanvas.setActiveObject(cropBox); cropCanvas.renderAll(); }
        function closeVisualCropper() { $('#visualCropModal').style.display = 'none'; croppingImage = null; cropCanvas.clear(); }
        function applyCrop() { if (!croppingImage || !cropCanvas.getActiveObject()) return; const cropBox = cropCanvas.getActiveObject(); const imgInstance = cropCanvas.getObjects('image')[0]; const cropX = (cropBox.left - imgInstance.left) / imgInstance.scaleX; const cropY = (cropBox.top - imgInstance.top) / imgInstance.scaleY; const width = cropBox.getScaledWidth() / imgInstance.scaleX; const height = cropBox.getScaledHeight() / imgInstance.scaleY; croppingImage.set({ cropX, cropY, width, height }); croppingImage.scaleToWidth(cropBox.getScaledWidth()); canvas.renderAll(); requestSaveState(); closeVisualCropper(); }

        // --- ALIGNMENT & DATA BINDING ---
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

            // Actions for single objects
            const singleActions = {
                left: o => o.set({ originX: 'left', left: pageRect.left }),
                h_center: o => o.set({ originX: 'center', left: pageRect.left + pageRect.width / 2 }),
                right: o => o.set({ originX: 'left', left: pageRect.left + pageRect.width - o.getScaledWidth() }),
                top: o => o.set({ originY: 'top', top: pageRect.top }),
                v_center: o => o.set({ originY: 'center', top: pageRect.top + pageRect.height / 2 }),
                bottom: o => o.set({ originY: 'top', top: pageRect.top + pageRect.height - o.getScaledHeight() })
            };

            // For multi-select, we calculate offset to move the whole group
            function alignMultiSelection(selection, key) {
                if (!selection) return;
                const bounds = selection.getBoundingRect(true, true);
                let dx = 0, dy = 0;

                switch (key) {
                    case 'left':
                        dx = pageRect.left - bounds.left;
                        break;
                    case 'h_center':
                        dx = (pageRect.left + pageRect.width / 2) - (bounds.left + bounds.width / 2);
                        break;
                    case 'right':
                        dx = (pageRect.left + pageRect.width) - (bounds.left + bounds.width);
                        break;
                    case 'top':
                        dy = pageRect.top - bounds.top;
                        break;
                    case 'v_center':
                        dy = (pageRect.top + pageRect.height / 2) - (bounds.top + bounds.height / 2);
                        break;
                    case 'bottom':
                        dy = (pageRect.top + pageRect.height) - (bounds.top + bounds.height);
                        break;
                }

                // Move all objects by the calculated offset
                selection.forEachObject(obj => {
                    obj.set({ left: obj.left + dx, top: obj.top + dy });
                    obj.setCoords();
                });
                selection.setCoords();
            }

            Object.keys(icons).forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'btn ghost';
                btn.innerHTML = icons[key];
                btn.title = `Align ${key.replace('_', ' ')}`;
                btn.onclick = () => {
                    const active = canvas.getActiveObject();
                    if (active && pageRect) {
                        if (active.type === 'activeSelection') {
                            alignMultiSelection(active, key);
                        } else {
                            singleActions[key](active);
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

        function alignMultipleObjectsButtons() {
            const container = document.createElement('div');
            container.className = 'align-buttons full-width';
            container.style.gridTemplateColumns = 'repeat(6, 32px)';

            const alignments = [
                { key: 'left', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="3" y1="4" x2="3" y2="20" stroke="currentColor" stroke-width="2"/><rect x="6" y="7" width="8" height="3" fill="currentColor"/><rect x="6" y="14" width="12" height="3" fill="currentColor"/></svg>', title: 'Align left edges' },
                { key: 'h_center', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="2"/><rect x="7" y="6" width="10" height="3" fill="currentColor"/><rect x="5" y="15" width="14" height="3" fill="currentColor"/></svg>', title: 'Align centers horizontally' },
                { key: 'right', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="21" y1="4" x2="21" y2="20" stroke="currentColor" stroke-width="2"/><rect x="10" y="7" width="8" height="3" fill="currentColor"/><rect x="6" y="14" width="12" height="3" fill="currentColor"/></svg>', title: 'Align right edges' },
                { key: 'top', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="4" y1="3" x2="20" y2="3" stroke="currentColor" stroke-width="2"/><rect x="7" y="6" width="3" height="8" fill="currentColor"/><rect x="14" y="6" width="3" height="12" fill="currentColor"/></svg>', title: 'Align top edges' },
                { key: 'v_center', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"/><rect x="6" y="7" width="3" height="10" fill="currentColor"/><rect x="15" y="5" width="3" height="14" fill="currentColor"/></svg>', title: 'Align centers vertically' },
                { key: 'bottom', icon: '<svg viewBox="0 0 24 24" width="16" height="16"><line x1="4" y1="21" x2="20" y2="21" stroke="currentColor" stroke-width="2"/><rect x="7" y="10" width="3" height="8" fill="currentColor"/><rect x="14" y="6" width="3" height="12" fill="currentColor"/></svg>', title: 'Align bottom edges' }
            ];

            alignments.forEach(({ key, icon, title }) => {
                const btn = document.createElement('button');
                btn.className = 'btn ghost align-btn';
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
                        refValue = Math.min(...objects.map(o => o.left - o.getScaledWidth() / 2));
                        objects.forEach(o => o.set({ left: refValue + o.getScaledWidth() / 2 }));
                    } else if (key === 'right') {
                        refValue = Math.max(...objects.map(o => o.left + o.getScaledWidth() / 2));
                        objects.forEach(o => o.set({ left: refValue - o.getScaledWidth() / 2 }));
                    } else if (key === 'h_center') {
                        const lefts = objects.map(o => o.left);
                        refValue = (Math.min(...lefts) + Math.max(...lefts)) / 2;
                        objects.forEach(o => o.set({ left: refValue }));
                    } else if (key === 'top') {
                        refValue = Math.min(...objects.map(o => o.top - o.getScaledHeight() / 2));
                        objects.forEach(o => o.set({ top: refValue + o.getScaledHeight() / 2 }));
                    } else if (key === 'bottom') {
                        refValue = Math.max(...objects.map(o => o.top + o.getScaledHeight() / 2));
                        objects.forEach(o => o.set({ top: refValue - o.getScaledHeight() / 2 }));
                    } else if (key === 'v_center') {
                        const tops = objects.map(o => o.top);
                        refValue = (Math.min(...tops) + Math.max(...tops)) / 2;
                        objects.forEach(o => o.set({ top: refValue }));
                    }

                    objects.forEach(o => o.setCoords());
                    canvas.renderAll();
                    requestSaveState();
                };
                container.appendChild(btn);
            });

            return container;
        }

        // --- Distribution tools (multi-select) ---
        function distributeSelection(selection, axis) {
            if (!selection || selection.type !== 'activeSelection') return;
            const objs = selection.getObjects().filter(o => o && o.oid !== 'pageRect' && !o.isArtboard);
            if (objs.length < 3) return; // distribution needs 3+ objects

            const rectFor = (o) => {
                o.setCoords();
                return o.getBoundingRect(true, true);
            };

            const items = objs.map(o => ({ o, r: rectFor(o) }));
            if (axis === 'h') {
                items.sort((a, b) => a.r.left - b.r.left);
                const leftEdge = Math.min(...items.map(i => i.r.left));
                const rightEdge = Math.max(...items.map(i => i.r.left + i.r.width));
                const total = items.reduce((s, i) => s + i.r.width, 0);
                const gap = (rightEdge - leftEdge - total) / (items.length - 1);
                let cursor = leftEdge;
                items.forEach(i => {
                    const dx = cursor - i.r.left;
                    i.o.left += dx;
                    i.o.setCoords();
                    // refresh cached rect for subsequent objects
                    cursor += i.r.width + gap;
                });
            } else {
                items.sort((a, b) => a.r.top - b.r.top);
                const topEdge = Math.min(...items.map(i => i.r.top));
                const bottomEdge = Math.max(...items.map(i => i.r.top + i.r.height));
                const total = items.reduce((s, i) => s + i.r.height, 0);
                const gap = (bottomEdge - topEdge - total) / (items.length - 1);
                let cursor = topEdge;
                items.forEach(i => {
                    const dy = cursor - i.r.top;
                    i.o.top += dy;
                    i.o.setCoords();
                    cursor += i.r.height + gap;
                });
            }

            selection.setCoords();
            canvas.requestRenderAll();
            requestSaveState();
        }

        function distributeButtons() {
            const container = document.createElement('div');
            container.className = 'align-buttons';
            container.style.gridTemplateColumns = 'repeat(2, 32px)';

            const hBtn = document.createElement('button');
            hBtn.className = 'btn ghost';
            hBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="4" width="2" height="16" fill="currentColor" opacity="0.3"/><rect x="19" y="4" width="2" height="16" fill="currentColor" opacity="0.3"/><rect x="11" y="6" width="2" height="12" fill="currentColor"/></svg>';
            hBtn.title = 'Distribute Horizontally';
            hBtn.onclick = () => distributeSelection(canvas.getActiveObject(), 'h');

            const vBtn = document.createElement('button');
            vBtn.className = 'btn ghost';
            vBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="transform: rotate(90deg)"><rect x="3" y="4" width="2" height="16" fill="currentColor" opacity="0.3"/><rect x="19" y="4" width="2" height="16" fill="currentColor" opacity="0.3"/><rect x="11" y="6" width="2" height="12" fill="currentColor"/></svg>';
            vBtn.title = 'Distribute Vertically';
            vBtn.onclick = () => distributeSelection(canvas.getActiveObject(), 'v');

            container.append(hBtn, vBtn);
            return container;
        }
        function getBindingsFor(o) { const id = ensureId(o); if (!bindings.has(id)) bindings.set(id, []); return bindings.get(id); }
        function isCellTextBinding(o, b) {
            return !!(o?.isTable && b?.property === 'Cell Text');
        }
        function getNormalizedBindingCellIndex(table, binding) {
            if (!table?.isTable) return 0;
            ensureTableCellData(table);
            const max = Math.max(0, table.rows * table.cols - 1);
            const raw = parseInt(binding?.cellIndex, 10);
            const idx = Number.isFinite(raw) ? raw : 0;
            return Math.max(0, Math.min(max, idx));
        }
        function bindingsMatch(o, a, b) {
            if (a?.property !== b?.property) return false;
            if (isCellTextBinding(o, a) || isCellTextBinding(o, b)) {
                return getNormalizedBindingCellIndex(o, a) === getNormalizedBindingCellIndex(o, b);
            }
            return true;
        }
        function saveBinding(o, b) {
            const arr = getBindingsFor(o);
            const incoming = { ...(b || {}) };
            if (isCellTextBinding(o, incoming)) incoming.cellIndex = getNormalizedBindingCellIndex(o, incoming);
            let existing = arr.find(i => bindingsMatch(o, i, incoming));
            if (!existing) {
                arr.push(incoming);
                existing = incoming;
            } else {
                Object.assign(existing, incoming);
            }
            requestSaveState();
            return existing;
        }
        function removeBinding(o, b) { const arr = getBindingsFor(o); const i = arr.indexOf(b); if (i > -1) arr.splice(i, 1); requestSaveState(); }
        function ensureId(o) { if (!o.oid) o.oid = `obj_${Date.now()}_${Math.random()}`; return o.oid; }
        canvas.on('object:added', (e) => {
            if (!e.target) return;
            if (e.target.isCanvasGhost) return;
            ensureId(e.target);
            if (e.target.type === 'textbox') {
                e.target.padding = 0;
            }
            applyLockStateToObject(e.target);
            if (e.target.type === 'path' || e.target.isSvgGroup || e.target.type === 'group') {
                e.target.objectCaching = false;
            }
            if (e.target.oid !== 'pageRect' && !e.target.excludeFromExport && !e.target.isSnapLine && !e.target.isArtboard && !e.target.pageId) {
                e.target.pageId = currentCanvasPageId();
            }
            if (!e.target.isCanvasGhost) {
                applyObjectMaskForPage(e.target, currentPageIndex);
            }
        });


        // --- 8. CORRECTED & ENHANCED FLOATING UI LOGIC ---
        const floatingLinker = $('#floating-linker');
        const floatingLinkBtn = $('#floatingLinkBtn');
        const floatingColumnList = $('#floatingColumnList');
        const floatingColumnListContent = $('#floatingColumnListContent');
        const floatingColumnSearch = $('#floatingColumnSearch');

        function updateFloatingLinker(target) {
            const activeObjects = canvas.getActiveObjects();

            // Hide if nothing is selected
            if (activeObjects.length === 0) {
                floatingLinker.style.display = 'none';
                floatingColumnList.style.display = 'none';
                return;
            }

            // Keep endpoint handles unobstructed while editing lines.
            if (activeObjects.length === 1 && activeObjects[0]?.type === 'line') {
                floatingLinker.style.display = 'none';
                floatingColumnList.style.display = 'none';
                return;
            }

            // Show the main floating container for any selection (single or multiple)
            floatingLinker.style.display = 'flex';

            // The "anchor" for positioning is always the active selection group or the single object
            const anchor = canvas.getActiveObject();
            updateFloatingLinkerPosition(anchor);

            // Only show the "Link Data" button for a SINGLE selection when data is loaded
            if (activeObjects.length === 1 && headers.length > 0) {
                floatingLinkBtn.style.display = 'inline-flex';
                let objBindings = getBindingsFor(activeObjects[0]);

                // If it's a table and a specific cell is selected, show only what's linked to that cell
                if (activeObjects[0].isTable) {
                    const selectedCellIndex = getSingleSelectedTableCellIndex(activeObjects[0]);
                    if (selectedCellIndex >= 0) {
                        objBindings = objBindings.filter(b =>
                            b.property === 'Cell Text' &&
                            getNormalizedBindingCellIndex(activeObjects[0], b) === selectedCellIndex
                        );
                    }
                }

                if (objBindings.length > 0) {
                    // Show actual linked column names
                    const colNames = [...new Set(objBindings.map(b => b.column).filter(Boolean))];
                    floatingLinkBtn.textContent = colNames.length > 0 ? colNames.join(', ') : 'Link Data';
                } else {
                    floatingLinkBtn.textContent = 'Link Data';
                }
            } else {
                floatingLinkBtn.style.display = 'none';
            }
        }

        function updateFloatingLinkerPosition(target) {
            // Guard against errors if the target or its coordinates aren't ready
            if (!target || !floatingLinker) return;

            if (!target.oCoords) {
                if (typeof target.setCoords === 'function') target.setCoords();
                if (!target.oCoords) return;
            }

            const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();

            // Default object controls expose `tr`; custom controls (e.g. line endpoints) may not.
            let anchorPoint = target.oCoords.tr
                || target.oCoords.br
                || target.oCoords.end
                || target.oCoords.start
                || null;

            if (!anchorPoint || !Number.isFinite(anchorPoint.x) || !Number.isFinite(anchorPoint.y)) {
                const coords = typeof target.getCoords === 'function' ? target.getCoords() : null;
                if (Array.isArray(coords) && coords.length > 0) {
                    anchorPoint = coords.reduce((best, p) => {
                        if (!best) return p;
                        if (p.x > best.x) return p;
                        if (p.x === best.x && p.y < best.y) return p;
                        return best;
                    }, null);
                }
            }

            if (!anchorPoint || !Number.isFinite(anchorPoint.x) || !Number.isFinite(anchorPoint.y)) return;

            floatingLinker.style.left = `${anchorPoint.x + canvasRect.left + 10}px`;
            floatingLinker.style.top = `${anchorPoint.y + canvasRect.top}px`;
        }


        // Show/Hide the column list dropdown
        floatingLinkBtn.addEventListener('click', () => {
            const target = canvas.getActiveObject();
            if (!target) return;
            const isVisible = floatingColumnList.style.display === 'block';
            floatingColumnList.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                renderFloatingColumnList(target, '');
                floatingColumnSearch.focus();
            }
        });

        // Filter the column list
        floatingColumnSearch.addEventListener('input', () => {
            renderFloatingColumnList(canvas.getActiveObject(), floatingColumnSearch.value);
        });

        function renderFloatingColumnList(target, query) {
            if (!target) return;
            floatingColumnListContent.innerHTML = '';
            const q = query.toLowerCase();

            // If identifier column is set, show a grouped view with row selector
            const hasIdentifier = identifierColumn && headers.includes(identifierColumn);

            // Determine if there's an existing binding for the current focus (single cell for tables, or first binding for others)
            let currentBinding = null;
            if (target.isTable) {
                const cellIdx = getSingleSelectedTableCellIndex(target);
                if (cellIdx >= 0) {
                    currentBinding = getBindingsFor(target).find(b =>
                        b.property === 'Cell Text' &&
                        getNormalizedBindingCellIndex(target, b) === cellIdx
                    );
                }
            } else {
                currentBinding = getBindingsFor(target)[0];
            }

            headers.filter(h => h.toLowerCase().includes(q)).forEach(h => {
                const item = document.createElement('div');
                item.className = 'col-item';
                item.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

                const isSelected = currentBinding && currentBinding.column === h;
                if (isSelected) {
                    item.setAttribute('aria-selected', 'true');
                }

                const headerRow = document.createElement('div');
                headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%;';

                const label = document.createElement('span');
                label.textContent = h;
                headerRow.appendChild(label);

                if (isSelected) {
                    const unlinkBtn = document.createElement('button');
                    unlinkBtn.className = 'btn ghost';
                    unlinkBtn.style.cssText = 'padding: 0; min-width: 20px; height: 20px; border: none; background: transparent; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px;';
                    unlinkBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>';
                    unlinkBtn.title = 'Remove Link';
                    unlinkBtn.onmouseover = () => unlinkBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                    unlinkBtn.onmouseout = () => unlinkBtn.style.background = 'transparent';
                    unlinkBtn.onclick = (e) => {
                        e.stopPropagation();
                        removeBinding(target, currentBinding);
                        floatingColumnList.style.display = 'none';
                        updateFloatingLinker(target);
                        refreshInspector({ target });
                    };
                    headerRow.appendChild(unlinkBtn);
                }
                item.appendChild(headerRow);

                // Check if this column has multi-row data when identifier is set
                let rowSelectEl = null;
                if (hasIdentifier && h !== identifierColumn) {
                    // Count unique identifier values to see if multi-row
                    const identValues = [...new Set(dataRows.map(r => r[identifierColumn]).filter(Boolean))];
                    const hasMultiRow = identValues.some(id => dataRows.filter(r => r[identifierColumn] === id).length > 1);
                    if (hasMultiRow) {
                        // Show a row index selector
                        const maxRowsPerIdent = Math.max(...identValues.map(id => dataRows.filter(r => r[identifierColumn] === id).length));
                        rowSelectEl = document.createElement('select');
                        rowSelectEl.style.cssText = 'font-size: 11px; padding: 2px 4px; margin-top: 2px;';
                        for (let ri = 0; ri < maxRowsPerIdent; ri++) {
                            const opt = document.createElement('option');
                            opt.value = ri;
                            opt.textContent = `Row ${ri + 1}`;
                            rowSelectEl.appendChild(opt);
                        }
                        if (isSelected && typeof currentBinding.rowIndex === 'number') {
                            rowSelectEl.value = currentBinding.rowIndex;
                        }
                        rowSelectEl.onclick = (e) => e.stopPropagation();
                        item.appendChild(rowSelectEl);
                    }
                }

                item.onclick = () => {
                    const selectedRowIndex = rowSelectEl ? parseInt(rowSelectEl.value, 10) : 0;
                    const bindingData = { column: h, rowIndex: selectedRowIndex };

                    if (target.isTable) {
                        const selectedCellIndex = getSingleSelectedTableCellIndex(target);
                        if (selectedCellIndex < 0) {
                            showNotification('Select one table cell before linking data.');
                            floatingColumnList.style.display = 'none';
                            return;
                        }
                        const existing = getBindingsFor(target).find(b =>
                            b.property === 'Cell Text' && getNormalizedBindingCellIndex(target, b) === selectedCellIndex
                        );
                        if (existing) {
                            existing.column = h;
                            if (hasIdentifier) existing.rowIndex = selectedRowIndex;
                            requestSaveState();
                        } else {
                            const newB = { column: h, property: 'Cell Text', cellIndex: selectedCellIndex };
                            if (hasIdentifier) newB.rowIndex = selectedRowIndex;
                            saveBinding(target, newB);
                        }
                    } else {
                        const defaultProp = defaultPropertyFor(target);
                        const targetBindings = getBindingsFor(target);
                        if (targetBindings.length > 0) {
                            targetBindings[0].column = h;
                            targetBindings[0].property = defaultProp;
                            if (hasIdentifier) targetBindings[0].rowIndex = selectedRowIndex;
                        } else {
                            const newB = { column: h, property: defaultProp };
                            if (hasIdentifier) newB.rowIndex = selectedRowIndex;
                            saveBinding(target, newB);
                        }
                    }
                    requestSaveState();
                    floatingColumnList.style.display = 'none';
                    updateFloatingLinker(target);
                    refreshInspector({ target });
                };
                floatingColumnListContent.appendChild(item);
            });
        }

        // Add event handlers for Duplicate and Delete buttons
        on('#duplicateBtn', 'click', () => {
            duplicateSelection();
        });

        on('#deleteBtn', 'click', () => {
            const activeObjects = canvas.getActiveObjects();
            if (activeObjects.length) {
                removeCanvasObjects(activeObjects);
            }
        });

        // Bring to Front / Send to Back quick buttons
        on('#bringToFrontBtn', 'click', () => {
            const activeObjects = canvas.getActiveObjects();
            activeObjects.forEach(obj => canvas.bringToFront(obj));
            renderLayers();
            requestSaveState();
        });

        on('#sendToBackBtn', 'click', () => {
            const activeObjects = canvas.getActiveObjects();
            activeObjects.forEach(obj => canvas.sendToBack(obj));
            keepPageRectAtBack();
            renderLayers();
            requestSaveState();
        });

        canvas.on('object:moving', () => {
            floatingLinker.style.display = 'none';
            floatingColumnList.style.display = 'none';
        });
        canvas.on('object:modified', () => {
            updateFloatingLinker(canvas.getActiveObject());
        });

        // Hide dropdown if clicking outside
        window.addEventListener('click', (e) => {
            if (!floatingLinker.contains(e.target)) {
                floatingColumnList.style.display = 'none';
            }
        });

        const dataLinksManagerModal = $('#dataLinksManagerModal');
        const openDataLinksManagerBtn = $('#openDataLinksManagerBtn');
        const closeDataLinksManagerModalBtn = $('#closeDataLinksManagerModal');
        let selectedObjectForManager = null;

        // --- IDENTIFIER COLUMN LOGIC ---
        function refreshIdentifierDropdown() {
            const dropdown = $('#csvIdentifierColumnDropdown');
            if (!dropdown) return;
            dropdown.innerHTML = '<option value="">(None)</option>';
            headers.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h;
                opt.textContent = h;
                if (h === identifierColumn) opt.selected = true;
                dropdown.appendChild(opt);
            });
        }

        on('#csvIdentifierColumnDropdown', 'change', (e) => {
            identifierColumn = e.target.value;
            requestSaveState();
        });

        function showIdentifierColumnModal() {
            const modal = $('#identifierColumnModal');
            const select = $('#identifierColumnSelect');
            const preview = $('#identifierColumnPreview');
            if (!modal || !select) return;

            select.innerHTML = '<option value="">(None — each row is a separate page)</option>';
            headers.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h;
                opt.textContent = h;
                if (h === identifierColumn) opt.selected = true;
                select.appendChild(opt);
            });

            const updatePreview = () => {
                const col = select.value;
                if (!col) {
                    preview.textContent = `Each of the ${dataRows.length} rows will generate a separate page.`;
                    return;
                }
                const uniqueValues = [...new Set(dataRows.map(r => r[col]).filter(Boolean))];
                const multiRowCount = uniqueValues.filter(v => dataRows.filter(r => r[col] === v).length > 1).length;
                preview.textContent = `${uniqueValues.length} unique value(s). ${multiRowCount} with multiple rows.`;
            };
            select.onchange = updatePreview;
            updatePreview();

            modal.style.display = 'flex';
        }

        on('#confirmIdentifierColumnBtn', 'click', () => {
            const select = $('#identifierColumnSelect');
            identifierColumn = select ? select.value : '';
            refreshIdentifierDropdown();
            requestSaveState();
            $('#identifierColumnModal').style.display = 'none';
        });

        on('#skipIdentifierColumnBtn', 'click', () => {
            identifierColumn = '';
            refreshIdentifierDropdown();
            requestSaveState();
            $('#identifierColumnModal').style.display = 'none';
        });

        on('#closeIdentifierColumnModal', 'click', () => {
            $('#identifierColumnModal').style.display = 'none';
        });

        function openDataLinksManager() {
            renderDataLinksManager();
            dataLinksManagerModal.style.display = 'flex';
        }
        function closeDataLinksManager() {
            dataLinksManagerModal.style.display = 'none';
            selectedObjectForManager = null;
        }
        openDataLinksManagerBtn.addEventListener('click', openDataLinksManager);
        closeDataLinksManagerModalBtn.addEventListener('click', closeDataLinksManager);

        function renderDataLinksManager() {
            const objectsList = $('#dataLinksObjectsList');
            objectsList.innerHTML = '';
            const objects = canvas.getObjects().filter(o => o.oid !== 'pageRect' && !o.excludeFromExport && !o.isArtboard);
            if (objects.length === 0) {
                objectsList.innerHTML = '<p class="muted" style="font-size:12px; text-align:center;">No objects on canvas.</p>';
                $('#dataLinksEditorContent').innerHTML = '<p class="muted" style="text-align:center; padding-top: 24px;">Add an object to the canvas to create a data link.</p>';
                return;
            }
            objects.forEach(obj => {
                const item = document.createElement('div');
                item.className = 'data-links-object-item';
                item.setAttribute('data-oid', ensureId(obj));
                // Keep object names consistent with the Layers panel
                let name = obj.name || obj.type;
                const bindingCount = getBindingsFor(obj).length;
                item.innerHTML = `<strong>${name}</strong> <br> <span class="muted">${bindingCount} link(s)</span>`;
                item.addEventListener('click', () => {
                    selectedObjectForManager = obj;
                    document.querySelectorAll('.data-links-object-item').forEach(el => el.removeAttribute('aria-selected'));
                    item.setAttribute('aria-selected', 'true');
                    renderBindingsForObject(obj);
                });
                objectsList.appendChild(item);
            });
            if (selectedObjectForManager) {
                const selectedItem = objectsList.querySelector(`[data-oid="${selectedObjectForManager.oid}"]`);
                if (selectedItem) selectedItem.setAttribute('aria-selected', 'true');
                else selectedObjectForManager = null;
            }
            if (selectedObjectForManager) renderBindingsForObject(selectedObjectForManager);
            else $('#dataLinksEditorContent').innerHTML = '<p class="muted" style="text-align:center; padding-top: 24px;">Select an object from the left to manage its data links.</p>';
        }

        function renderBindingsForObject(obj) {
            const container = $('#dataLinksEditorContent');
            container.innerHTML = '';
            const linksWrapper = document.createElement('div');
            linksWrapper.className = 'links-list-wrapper';
            const header = document.createElement('h4');
            header.textContent = 'Active Links';
            linksWrapper.appendChild(header);
            const objectBindings = getBindingsFor(obj);
            if (objectBindings.length === 0) {
                linksWrapper.innerHTML += '<p class="muted" style="text-align:center; padding: 16px 0;">No data links configured for this object.</p>';
            } else {
                objectBindings.forEach(b => linksWrapper.appendChild(bindingEditorRow(obj, b)));
            }
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'add-link-button-wrapper';
            const addButton = document.createElement('button');
            addButton.className = 'btn';
            addButton.textContent = 'Add New Link';
            addButton.style.width = '100%';
            addButton.onclick = () => {
                const newBinding = { column: '', property: defaultPropertyFor(obj) };
                if (obj.isTable && newBinding.property === 'Cell Text') {
                    const selectedCellIndex = getSingleSelectedTableCellIndex(obj);
                    newBinding.cellIndex = selectedCellIndex >= 0 ? selectedCellIndex : 0;
                }
                saveBinding(obj, newBinding);
                renderDataLinksManager();
            };
            buttonWrapper.appendChild(addButton);
            container.append(linksWrapper, buttonWrapper);
        }

        function bindingEditorRow(o, b) {
            const box = document.createElement('div');
            box.className = 'stack';
            box.style.cssText = 'border:1px solid var(--border);padding:8px;border-radius:8px;margin-top:8px;';

            box.appendChild(selectRow('Property', propertyOptionsFor(o), b.property, v => {
                b.property = v;
                if (isCellTextBinding(o, b)) b.cellIndex = getNormalizedBindingCellIndex(o, b);
                requestSaveState();
                renderDataLinksManager();
            }));

            const info = document.createElement('div');
            info.className = 'muted';
            info.textContent = `Linked to: ${b.column || '\u2014'}${(b.rowIndex > 0) ? ` (Row ${b.rowIndex + 1})` : ''}`;
            info.style.fontSize = '12px';

            if (isCellTextBinding(o, b)) {
                ensureTableCellData(o);
                b.cellIndex = getNormalizedBindingCellIndex(o, b);
                const targetCell = document.createElement('div');
                targetCell.className = 'muted';
                targetCell.style.fontSize = '12px';
                targetCell.textContent = `Target Cell: ${tableCellRefLabel(o, b.cellIndex)}`;

                const posWrap = document.createElement('div');
                posWrap.className = 'row';
                posWrap.style.gap = '8px';
                posWrap.style.marginTop = '6px';
                const rowInput = document.createElement('input');
                rowInput.type = 'number';
                rowInput.min = '1';
                rowInput.max = `${o.rows}`;
                rowInput.title = 'Row';
                rowInput.value = `${Math.floor(b.cellIndex / o.cols) + 1}`;
                const colInput = document.createElement('input');
                colInput.type = 'number';
                colInput.min = '1';
                colInput.max = `${o.cols}`;
                colInput.title = 'Column';
                colInput.value = `${(b.cellIndex % o.cols) + 1}`;

                const updateCellTarget = () => {
                    const row = Math.max(1, Math.min(o.rows, parseInt(rowInput.value, 10) || 1));
                    const col = Math.max(1, Math.min(o.cols, parseInt(colInput.value, 10) || 1));
                    rowInput.value = `${row}`;
                    colInput.value = `${col}`;
                    b.cellIndex = (row - 1) * o.cols + (col - 1);
                    targetCell.textContent = `Target Cell: ${tableCellRefLabel(o, b.cellIndex)}`;
                    requestSaveState();
                    refreshInspector({ target: o });
                };
                rowInput.oninput = updateCellTarget;
                colInput.oninput = updateCellTarget;
                posWrap.append(rowInput, colInput);
                box.append(targetCell, posWrap);
            }

            const linkBtn = document.createElement('button');
            linkBtn.className = b.column ? 'btn primary' : 'btn';
            linkBtn.textContent = b.column ? 'Change Column' : 'Link Column';
            linkBtn.onclick = () => {
                openColumnSelectionModal(o, b);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn ghost';
            delBtn.textContent = 'Remove';
            delBtn.onclick = () => {
                removeBinding(o, b);
                renderDataLinksManager();
            };

            const btnGroup = document.createElement('div');
            btnGroup.className = 'row';
            btnGroup.style.marginTop = '8px';
            btnGroup.append(linkBtn, delBtn);

            box.append(info, btnGroup);
            return box;
        }


        function openColumnSelectionModal(object, binding, options = {}) {
            const modal = $('#columnSelectModal');
            const list = $('#columnSelectList');
            const searchInput = $('#columnSelectSearch');
            const confirmBtn = $('#confirmColumnSelect');

            const renderList = (query = '') => {
                list.innerHTML = '';
                const q = query.toLowerCase();
                headers.forEach((h, index) => {
                    if (h.toLowerCase().includes(q)) {
                        const item = document.createElement('div');
                        item.className = 'col-item';
                        item.dataset.columnName = h; // Store name for confirmation

                        const sample = dataRows.length > 0 ? (dataRows[0]?.[h] ?? '\u2014') : '\u2014';

                        item.innerHTML = `<strong>Column ${index + 1}: ${h}</strong><div class="muted" style="font-size: 11px;">Sample: ${sample}</div>`;

                        // Preselect currently linked column
                        if (binding.column && binding.column === h) {
                            item.setAttribute('aria-selected', 'true');
                        }

                        item.onclick = () => {
                            list.querySelectorAll('.col-item').forEach(el => el.removeAttribute('aria-selected'));
                            item.setAttribute('aria-selected', 'true');
                        };
                        list.appendChild(item);
                    }
                });
            };

            // Use a fresh, single-use event listener for confirmation to avoid old references
            const confirmHandler = () => {
                const selectedEl = list.querySelector('[aria-selected="true"]');
                if (selectedEl) {
                    binding.column = selectedEl.dataset.columnName;
                    requestSaveState();
                    if (typeof options.onLinked === 'function') options.onLinked(binding);
                    else renderDataLinksManager(); // Refresh manager to show the new column name
                    modal.style.display = 'none';
                } else {
                    showNotification("Please select a column.", 'info', 2000);
                }
            };

            confirmBtn.onclick = confirmHandler;

            searchInput.oninput = () => renderList(searchInput.value);

            renderList(); // Initial render
            modal.style.display = 'flex';
        }

        function propertyOptionsFor(o) { const common = ['Opacity', 'Stroke Color', 'Stroke Width']; if (o.isTable) return ['Cell Text', 'Border Color', 'Border Width']; if (o.type === 'textbox') return ['Text Content', 'Font Family', 'Font Size', 'Fill Color', ...common]; if (['rect', 'image'].includes(o.type)) common.push('Corner Radius'); if (o.isSvgGroup || ['rect', 'circle', 'triangle', 'polygon', 'path'].includes(o.type)) return ['Fill', 'Stroke Color', 'Stroke Width', 'Opacity']; return common; }
        function defaultPropertyFor(o) { if (o?.isTable) return 'Cell Text'; return o.type === 'textbox' ? 'Text Content' : 'Fill'; }

