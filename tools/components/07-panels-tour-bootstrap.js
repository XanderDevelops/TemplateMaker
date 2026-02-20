        // --- LEFT PANEL TABS & ELEMENTS ---
        function initializeLeftPanelTabs() {
            const tabButtons = document.querySelectorAll('.panel-tab-btn');
            const tabContents = document.querySelectorAll('.panel-tab-content');

            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Deactivate all tabs and content panels
                    tabButtons.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    // Activate the clicked tab
                    btn.classList.add('active');

                    // Find and activate the correct content panel using the robust data-target attribute
                    const targetId = btn.dataset.target;
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    } else {
                        console.error(`Tab content panel with ID "${targetId}" not found.`);
                    }
                });
            });

            const searchInput = $('#element-search');
            if (searchInput) {
                const debouncedSearch = debounce(searchElements, 300);
                searchInput.addEventListener('input', () => debouncedSearch(searchInput.value));
            }

            // Initial load of elements
            searchElements('');
        }
        let currentPage = 0;
        let isLoading = false; // Prevents fetching multiple pages at once
        let currentQuery = ''; // Tracks the active search query

        const ELEMENTS_PER_PAGE = 50;

        /**
         * A helper function to shuffle an array in place using the Fisher-Yates algorithm.
         * @param {Array} array The array to be shuffled.
         */
        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]]; // Swap elements
            }
        }

        /**
         * Fetches and displays elements from Supabase with infinite scroll and randomization.
         * @param {string} query The search query.
         * @param {boolean} isNewSearch If true, resets pagination and clears the grid.
         */
        async function searchElements(query, isNewSearch = true) {
            if (!supabase || isLoading) return;

            const grid = document.getElementById('elements-grid');
            if (!grid) return;

            // --- Reset for a new search ---
            if (isNewSearch) {
                currentQuery = query;
                currentPage = 0;
                grid.innerHTML = '';
                // Clean up any existing IntersectionObserver
                if (grid.observer) {
                    grid.observer.disconnect();
                }
            }

            isLoading = true;

            // --- Loading Indicator ---
            const loadingIndicator = document.createElement('p');
            loadingIndicator.className = 'muted';
            loadingIndicator.textContent = 'Loading...';
            grid.appendChild(loadingIndicator);

            // --- Supabase Query with Pagination ---
            const from = currentPage * ELEMENTS_PER_PAGE;
            const to = from + ELEMENTS_PER_PAGE - 1;

            let queryBuilder = supabase.from('elements').select('id, name, image_url, tags');
            if (currentQuery) {
                queryBuilder = queryBuilder.or(`name.ilike.%${currentQuery}%,tags.cs.{${currentQuery}}`);
            }

            // Fetch in a consistent order (e.g., by ID) for stable pagination results.
            const { data, error } = await queryBuilder.order('id').range(from, to);

            // Always remove the loading indicator after the fetch attempt.
            grid.removeChild(loadingIndicator);
            isLoading = false;

            if (error) {
                console.error('Element search error:', error);
                grid.innerHTML = '<p class="muted">Error loading elements.</p>';
                return;
            }

            // Handle no results
            if (!data || data.length === 0) {
                if (isNewSearch) {
                    grid.innerHTML = '<p class="muted">No elements found.</p>';
                }
                // Stop here; no more data to load.
                return;
            }

            // --- RANDOMIZE THE BATCH ---
            shuffleArray(data);

            // --- Element Rendering Loop ---
            for (const el of data) {
                const chip = document.createElement('div');
                chip.className = 'element-chip';
                chip.draggable = true;

                const img = document.createElement('img');
                img.alt = el.name;
                img.loading = 'lazy'; // Defer loading off-screen images

                const isSvg = el.image_url.toLowerCase().endsWith('.svg');
                const imageUrlWithCacheBust = `${el.image_url}?t=${Date.now()}`;

                // Asynchronously load the image to avoid blocking the loop
                (async () => {
                    try {
                        if (isSvg) {
                            const response = await fetch(imageUrlWithCacheBust);
                            const blob = await response.blob();
                            const svgBlob = blob.type === 'image/svg+xml' ?
                                blob :
                                new Blob([await blob.text()], { type: 'image/svg+xml' });
                            img.src = URL.createObjectURL(svgBlob);
                        } else {
                            img.src = imageUrlWithCacheBust;
                        }
                    } catch (err) {
                        console.error(`Failed to load image for ${el.name}:`, err);
                        chip.innerHTML = `<span class="muted" style="font-size: 10px; text-align: center;">Load Error</span>`;
                        chip.draggable = false;
                    }
                })();

                img.onerror = () => {
                    chip.innerHTML = `<span class="muted" style="font-size: 10px; text-align: center;">Load Error</span>`;
                    chip.title = `Error loading: ${el.name}`;
                    chip.draggable = false;
                };

                chip.appendChild(img);

                // --- Drag Support (Handles all image types) ---
                chip.addEventListener('dragend', e => {
                    if (!(img.complete && img.naturalHeight !== 0)) return;

                    // Get mouse position relative to the canvas
                    const canvasRect = canvas.upperCanvasEl.getBoundingClientRect();
                    const mouseX = e.clientX - canvasRect.left;
                    const mouseY = e.clientY - canvasRect.top;

                    // Convert to Fabric coordinates considering zoom/pan
                    const pointer = canvas.getPointer({ clientX: e.clientX, clientY: e.clientY });

                    if (isSvg) {
                        adders.svg(pointer.x, pointer.y, img.src, { oid: el.id });
                    } else {
                        adders.image(pointer.x, pointer.y, img.src, { oid: el.id });
                    }
                });

                // --- Click Support ---
                chip.addEventListener('click', () => {
                    if (img.complete && img.naturalHeight !== 0) {
                        const { x, y } = canvas.getVpCenter();
                        // Logic correctly distinguishes between SVG and raster images
                        if (isSvg) {
                            adders.svg(x, y, img.src, { oid: el.id }); // img.src is the blob URL here
                        } else {
                            adders.image(x, y, img.src, { oid: el.id });
                        }
                    }
                });

                grid.appendChild(chip);
            }

            // Prepare for the next page
            currentPage++;

            // --- Intersection Observer Setup ---
            // If we loaded a full page, there might be more results.
            // Set up the observer on the last element to trigger loading the next page.
            if (data.length === ELEMENTS_PER_PAGE) {
                const lastElement = grid.lastElementChild;
                if (lastElement) {
                    const observer = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting) {
                            observer.disconnect(); // Important: Stop observing the current last element
                            // Load the next page for the same query
                            searchElements(currentQuery, false);
                        }
                    }, { threshold: 0.5 }); // Trigger when 50% of the element is visible

                    observer.observe(lastElement);
                    grid.observer = observer; // Store for cleanup
                }
            }
        }

        // --- INTERACTIVE TOUR ---
        const tourModal = $('#tour-modal');
        const tourHighlight = $('#tour-highlight');
        let currentTourStep = 0;
        const tourSteps = [
            {
                title: "How to Structure Your Data",
                content: `<p>Before importing, make sure your data is structured correctly in a .csv or .xlsx file.</p><img src="assets/images/data-structure-example.png" alt="Example data structure" style="max-width:100%; margin-bottom:1rem;" /><ul><li>Column names should start in cell <b>A1</b>.</li><li>Each new row will be treated as a different file or page.</li></ul>`,
                element: null
            },
            {
                title: "How to Import Your Data",
                content: `<p>Press the <b>Load Data</b> button to open the file picker.</p><p>Valid formats are <b>.xlsx</b> and <b>.csv</b>.</p>`,
                element: 'label[for="csvInput"]'
            },
            {
                title: "AI Copilot",
                content: `<p>The assistant now lives in the lower half of the left panel.</p><p>Use it for iterative edits instead of one-shot generation.</p>`,
                element: '#aiAssistantPanel'
            },
            {
                title: "AI Setup",
                content: `You will need a <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio API key</a>.</p><ul><li>Login to your Google Account.</li><li>Create an API key.</li><li>Paste it in the AI panel.</li></ul>`,
                element: '#aiApiKeyPanel'
            },
            {
                title: "AI Prompting",
                content: `Now enter your request in the chat box and press <b>Send</b>.</p><p><b>Tips:</b></p><ul><li>Ask in small iterative steps.</li><li>You can attach files and keep refining.</li></ul>`,
                element: '#aiChatPrompt'
            },
            {
                title: "How to Link Your Data",
                content: `<p>First, make sure you have imported your data.</p><p>Press <b>Data Links</b> to open the manager.</p>`,
                element: '#openDataLinksManagerBtn',
                action: () => { $('#dataLinksManagerModal').style.display = 'none'; }
            },
            {
                title: "How to Link Your Data",
                content: `<p>From there, you can select an object, choose a column from your data, and link it to a property like 'Text Content' or 'Color'.</p>`,
                element: '.objects-list-container',
                action: () => { $('#dataLinksManagerModal').style.display = 'flex'; }
            },
            {
                title: "Tour Complete!",
                content: `<p>You now know the basics! Start creating your templates.</p>`,
                element: null,
                action: () => { $('#dataLinksManagerModal').style.display = 'none'; }
            }
        ];
        function startTour() { currentTourStep = 0; tourModal.style.display = 'flex'; goToStep(currentTourStep); } function endTour() { tourModal.style.display = 'none'; tourHighlight.style.display = 'none'; localStorage.setItem('hasSeenTour', 'true'); }
        function goToStep(stepIndex) {
            const step = tourSteps[stepIndex];
            if (!step) {
                endTour();
                return;
            }

            // Execute the action first to ensure the element is visible
            if (step.action) {
                step.action();
            }

            if (!step.action) {
                document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
            }

            $('#tour-modal-title').textContent = step.title;
            $('#tour-modal-content').innerHTML = step.content;
            $('#tour-step-counter').textContent = `${stepIndex + 1} / ${tourSteps.length}`;
            $('#tour-prev-btn').disabled = stepIndex === 0;
            $('#tour-next-btn').style.display = stepIndex === tourSteps.length - 1 ? 'none' : 'inline-flex';
            $('#tour-finish-btn').style.display = stepIndex === tourSteps.length - 1 ? 'inline-flex' : 'none';

            const targetEl = step.element ? $(step.element) : null;
            if (targetEl) {
                // Now getBoundingClientRect will have the correct dimensions
                const rect = targetEl.getBoundingClientRect();
                tourHighlight.style.display = 'block';
                tourHighlight.style.width = `${rect.width + 10}px`;
                tourHighlight.style.height = `${rect.height + 10}px`;
                tourHighlight.style.top = `${rect.top - 5}px`;
                tourHighlight.style.left = `${rect.left - 5}px`;

                const modalRect = tourModal.getBoundingClientRect();
                let modalTop = rect.top + 30,
                    modalLeft = rect.right + modalRect.width;

                if (modalLeft + modalRect.width > window.innerWidth) {
                    modalLeft = rect.left - modalRect.width + 100;
                }
                if (modalTop + modalRect.height > window.innerHeight) {
                    modalTop = window.innerHeight - modalRect.height - 30;
                }

                modalTop = Math.max(15, modalTop);
                modalLeft = Math.max(15, modalLeft);

                tourModal.style.top = `${modalTop}px`;
                tourModal.style.left = `${modalLeft}px`;
            } else {
                tourHighlight.style.display = 'none';
                tourModal.style.top = '50%';
                tourModal.style.left = '50%';
                tourModal.style.transform = 'translate(-50%, -50%)';
            }
        }
        on('#start-tour-btn', 'click', startTour); on('#tour-close-btn', 'click', endTour); on('#tour-finish-btn', 'click', endTour); on('#tour-next-btn', 'click', () => { currentTourStep++; goToStep(currentTourStep); }); on('#tour-prev-btn', 'click', () => { currentTourStep--; goToStep(currentTourStep); });

        // 5. Enhanced Template Loader
        const templateLoaderModal = $('#template-loader-modal');
        async function toggleTemplateLoader(button) {
            if (templateLoaderModal.style.display === 'block') {
                templateLoaderModal.style.display = 'none';
                return;
            }
            const rect = button.getBoundingClientRect();
            const maxW = 420;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = rect.left;
            let top = rect.bottom + 8;
            if (left + maxW > vw - 12) left = Math.max(12, vw - maxW - 12);
            if (top > vh - 120) top = Math.max(12, rect.top - 8);
            templateLoaderModal.style.top = `${top}px`;
            templateLoaderModal.style.left = `${left}px`;
            templateLoaderModal.style.display = 'block';
            templateLoaderModal.innerHTML = '<p class="muted" style="padding: 24px; text-align: center;">Loading templates...</p>';

            const [publicTemplates, purchasedTemplates, myTemplates] = await Promise.all([
                supabase.from('public_templates').select('id, title, template_data'),
                currentUser ? supabase.from('purchased_templates').select('store_templates(id, title, template_data)').eq('user_id', currentUser.id) : Promise.resolve({ data: [] }),
                currentUser ? supabase.from('templates').select('id, title, template_data').eq('user_id', currentUser.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] })
            ]);

            templateLoaderModal.innerHTML = `
        <div class="template-modal-tabs">
            <button class="template-modal-tab active" data-tab="public">Public</button>
            <button class="template-modal-tab" data-tab="mine">My Templates</button>
            <button class="template-modal-tab" data-tab="purchased">Library</button>
        </div>
        <div id="public-templates" class="template-grid"></div>
        <div id="my-templates" class="template-grid" style="display:none;"></div>
        <div id="purchased-templates" class="template-grid" style="display:none;"></div>
        <div style="padding: 12px; border-top: 1px solid var(--border); background: var(--panel-2); display: flex; gap: 8px;">
            <button id="loadJsonBtn" class="btn ghost" style="flex: 1; font-size: 11px;">Upload JSON</button>
        </div>
        <input type="file" id="jsonUpload" accept=".json" style="display:none;">
    `;

            const publicGrid = $('#public-templates');
            publicGrid.innerHTML = '';
            (publicTemplates.data || []).forEach(t => publicGrid.appendChild(createTemplateItem(t, true)));

            const myGrid = $('#my-templates');
            myGrid.innerHTML = '';
            if (myTemplates.data && myTemplates.data.length > 0) {
                myTemplates.data.forEach(t => myGrid.appendChild(createTemplateItem(t, false)));
            } else {
                myGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 32px 16px; text-align: center;">
            <p class="muted" style="font-size: 12px; margin-bottom: 12px;">You haven't saved any templates yet.</p>
            <button onclick="templateLoaderModal.style.display='none'" class="btn primary" style="height: 28px; font-size: 11px;">Start Creating</button>
        </div>`;
            }

            const purchasedGrid = $('#purchased-templates');
            purchasedGrid.innerHTML = '';
            if (purchasedTemplates.data && purchasedTemplates.data.length > 0) {
                purchasedTemplates.data.forEach(t => purchasedGrid.appendChild(createTemplateItem(t.store_templates, false, true)));
            } else {
                purchasedGrid.innerHTML = '<p class="muted" style="font-size: 12px; text-align: center; grid-column: 1 / -1; padding: 32px 16px;">No purchased templates found.</p>';
            }

            document.querySelectorAll('.template-modal-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.template-modal-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    publicGrid.style.display = btn.dataset.tab === 'public' ? 'grid' : 'none';
                    myGrid.style.display = btn.dataset.tab === 'mine' ? 'grid' : 'none';
                    purchasedGrid.style.display = btn.dataset.tab === 'purchased' ? 'grid' : 'none';
                });
            });

            on('#loadJsonBtn', 'click', () => $('#jsonUpload').click());
        }

        function createTemplateItem(template, isPublic, isPurchased = false) {
            const item = document.createElement('div');
            item.className = 'template-item';

            const thumb = document.createElement('div');
            thumb.className = 'template-thumb';
            thumb.style.backgroundColor = '#111';
            thumb.innerHTML = '<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:0.1;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>';

            const title = document.createElement('div');
            title.className = 'template-title';
            title.textContent = template.title || 'Untitled Template';

            item.append(thumb, title);

            // Lightweight preview generation
            setTimeout(() => {
                try {
                    const data = template.template_data;
                    const previewCanvas = data?.canvas || data?.pages?.[0]?.canvas;
                    if (previewCanvas) {
                        const off = document.createElement('canvas');
                        off.width = 320;
                        off.height = 240;
                        const c2 = new fabric.StaticCanvas(off); // Use StaticCanvas for better performance
                        c2.loadFromJSON(previewCanvas, () => {
                            const pr = c2.getObjects().find(o => o.oid === 'pageRect');
                            if (pr) {
                                pr.set({ strokeWidth: 0, shadow: null });
                                const zoom = Math.min(off.width / pr.width, off.height / pr.height) * 0.95;
                                c2.setZoom(zoom);
                                c2.viewportTransform[4] = (off.width - pr.width * zoom) / 2;
                                c2.viewportTransform[5] = (off.height - pr.height * zoom) / 2;
                            }
                            c2.renderAll();
                            const dataUrl = off.toDataURL('image/jpeg', 0.8);
                            thumb.innerHTML = ''; // Clear placeholder
                            thumb.style.backgroundImage = `url(${dataUrl})`;
                            c2.dispose();
                        });
                    }
                } catch (e) {
                    console.error('Preview failed:', e);
                }
            }, 50);

            item.onclick = () => {
                loadTemplateFromDB(template.id, { public: isPublic, purchased: isPurchased });
                templateLoaderModal.style.display = 'none';
            };
            return item;
        }

        on('#jsonUpload', 'change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    if (json && (json.pages || json.canvas || json.page || json.bindings)) {
                        if (json.page?.title) $('#titleInput').value = json.page.title;
                        if (json.data) {
                            headers = json.data.headers || [];
                            dataRows = json.data.rows || [];
                        }
                        await setDocumentPagesFromTemplate(json, { fitView: true, selectedIndex: json.currentPageIndex });
                        bindings = new Map(documentPages[currentPageIndex]?.bindings || json.bindings || []);
                    } else if (json && json.objects) {
                        const activePage = documentPages[currentPageIndex] || { width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT };
                        await setDocumentPagesFromTemplate({
                            page: {
                                title: $('#titleInput').value || 'Untitled_Template',
                                width: parsePositiveInt(activePage.width, DEFAULT_PAGE_WIDTH),
                                height: parsePositiveInt(activePage.height, DEFAULT_PAGE_HEIGHT)
                            },
                            canvas: json,
                            bindings: []
                        }, { fitView: true });
                    } else {
                        throw new Error('Unsupported JSON format.');
                    }

                    historyStack = [];
                    historyIndex = -1;
                    lastHistorySig = null;
                    requestSaveState();
                    templateLoaderModal.style.display = 'none';
                } catch (err) {
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset input
        });

        window.addEventListener('click', (e) => {
            if (!templateLoaderModal.contains(e.target) &&
                !e.target.closest('#loadTemplateBtnPage') &&
                !e.target.closest('#openLoaderFromSidebar') &&
                !e.target.closest('#toolbarLoadTemplateBtn')) {
                templateLoaderModal.style.display = 'none';
            }
        });

        // --- INITIALIZE ---
        window.addEventListener('DOMContentLoaded', initializeEditor);

    
