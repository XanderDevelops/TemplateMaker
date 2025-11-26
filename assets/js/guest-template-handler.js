/**
 * Guest Template Handler
 * Handles the restoration of guest work when a user logs in
 */

import { supabase } from './supabase-client.js';

/**
 * Restores guest template for logged-in users
 * @param {Object} params - Parameters object
 * @param {Object} params.currentUser - The current authenticated user
 * @param {string} params.userRole - The user's role (free/pro)
 * @param {Object} params.canvas - Fabric.js canvas instance
 * @param {Object} params.pageRect - Page rectangle object
 * @param {Map} params.bindings - Data bindings map
 * @param {Function} params.restoreCanvasStateAfterLoad - Callback for canvas restoration
 * @param {Function} params.centerAndFitPage - Callback to center and fit the page
 * @param {HTMLElement} params.saveStatusEl - Save status element
 * @param {Function} params.setCurrentTemplateId - Callback to set the current template ID
 * @returns {Promise<boolean>} - Returns true if template was restored, false otherwise
 */
export async function restoreGuestTemplate(params) {
    const {
        currentUser,
        userRole,
        canvas,
        pageRect,
        bindings,
        restoreCanvasStateAfterLoad,
        centerAndFitPage,
        saveStatusEl,
        setCurrentTemplateId
    } = params;

    // Check if user is logged in and has a guest template
    const guestTemplateData = localStorage.getItem('csvlink-guest-template');
    if (!currentUser || !guestTemplateData) {
        return false;
    }

    try {
        const template = JSON.parse(guestTemplateData);

        // Set template properties
        const titleInput = document.querySelector('#titleInput');
        const pageWidth = document.querySelector('#pageWidth');
        const pageHeight = document.querySelector('#pageHeight');

        if (titleInput) titleInput.value = template.title || 'Untitled_Template';
        if (pageWidth) pageWidth.value = template.page.width || 768;
        if (pageHeight) pageHeight.value = template.page.height || 1024;

        if (pageRect) {
            pageRect.set({
                width: parseInt(template.page.width),
                height: parseInt(template.page.height)
            });
        }

        if (template.bindings) {
            bindings.clear();
            for (const [key, value] of template.bindings) {
                bindings.set(key, value);
            }
        }

        // Load canvas with async save callback
        return new Promise((resolve) => {
            canvas.loadFromJSON(template.canvas, async () => {
                restoreCanvasStateAfterLoad();
                centerAndFitPage();
                saveStatusEl.textContent = 'Restoring your work from guest session...';

                // Try to save to database
                const saved = await saveGuestTemplateToDatabase({
                    currentUser,
                    userRole,
                    template,
                    saveStatusEl,
                    setCurrentTemplateId,
                    canvas,
                    bindings
                });

                resolve(saved);
            });
        });
    } catch (err) {
        console.error('Failed to restore guest template:', err);
        saveStatusEl.textContent = 'Error restoring template. Please check console.';
        saveStatusEl.style.color = '#ff0000';
        return false;
    }
}

/**
 * Saves guest template to database
 * @private
 */
async function saveGuestTemplateToDatabase(params) {
    const {
        currentUser,
        userRole,
        template,
        saveStatusEl,
        setCurrentTemplateId,
        canvas,
        bindings
    } = params;

    try {
        const titleInput = document.querySelector('#titleInput');
        const pageWidth = document.querySelector('#pageWidth');
        const pageHeight = document.querySelector('#pageHeight');

        const fullTemplateData = {
            canvas: canvas.toJSON(['oid', 'name', 'isTable', 'isSvgGroup', 'rows', 'cols', 'colWidths', 'rowHeights', 'locked']),
            page: {
                title: titleInput?.value || template.title,
                width: pageWidth?.value || template.page.width,
                height: pageHeight?.value || template.page.height
            },
            bindings: Array.from(bindings.entries())
        };

        // Check free account template limit
        if (userRole === 'free') {
            const { count, error: countError } = await supabase
                .from('templates')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', currentUser.id);

            if (countError) {
                console.error('Error checking template count:', countError);
                saveStatusEl.textContent = 'Error checking account limits. Template saved locally.';
                saveStatusEl.style.color = '#ff9800';
                return false;
            }

            if (count >= 5) {
                saveStatusEl.textContent = 'Free account limit (5 templates) reached. Please upgrade or delete a template.';
                saveStatusEl.style.color = '#ff9800';
                return false;
            }
        }

        // Save to database
        const { data, error } = await supabase
            .from('templates')
            .insert({
                user_id: currentUser.id,
                title: titleInput?.value || template.title || 'Untitled_Template',
                template_data: fullTemplateData
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error saving restored template:', error);
            saveStatusEl.textContent = 'Error saving template. Your work is safe in browser storage.';
            saveStatusEl.style.color = '#ff0000';
            return false;
        }

        // Success! Update UI and remove from localStorage
        setCurrentTemplateId(data.id);
        const newUrl = `${window.location.pathname}?id=${data.id}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);

        saveStatusEl.textContent = 'Template restored and saved to your account!';
        saveStatusEl.style.color = '#4caf50';

        // Only remove from localStorage after successful save
        localStorage.removeItem('csvlink-guest-template');

        // Reset save status color after 3 seconds
        setTimeout(() => {
            saveStatusEl.style.color = '';
            saveStatusEl.textContent = 'All changes saved.';
        }, 3000);

        return true;
    } catch (saveError) {
        console.error('Error during template save:', saveError);
        saveStatusEl.textContent = 'Error saving template. Please try exporting as JSON backup.';
        saveStatusEl.style.color = '#ff0000';
        return false;
    }
}

/**
 * Auto-saves guest template to localStorage
 * Should be called periodically for guest users
 * @param {Object} params - Parameters object
 * @param {Object} params.currentUser - The current user (null for guests)
 * @param {Object} params.canvas - Fabric.js canvas instance
 * @param {Map} params.bindings - Data bindings map
 * @param {HTMLElement} params.saveStatusEl - Save status element
 */
export function saveGuestTemplate(params) {
    const { currentUser, canvas, bindings, saveStatusEl } = params;

    // Only save if guest (not logged in)
    if (currentUser) return;

    const objects = canvas.getObjects().filter(o => o.oid !== 'pageRect' && !o.excludeFromExport);
    if (objects.length === 0) return; // Don't save empty canvas

    const titleInput = document.querySelector('#titleInput');
    const pageWidth = document.querySelector('#pageWidth');
    const pageHeight = document.querySelector('#pageHeight');

    const guestTemplate = {
        title: titleInput?.value || 'Untitled_Template',
        canvas: canvas.toJSON(['oid', 'name', 'isTable', 'isSvgGroup', 'rows', 'cols', 'colWidths', 'rowHeights', 'locked']),
        page: {
            width: pageWidth?.value || 768,
            height: pageHeight?.value || 1024
        },
        bindings: Array.from(bindings.entries())
    };

    try {
        localStorage.setItem('csvlink-guest-template', JSON.stringify(guestTemplate));
        if (saveStatusEl) {
            saveStatusEl.textContent = "Guest work auto-saved locally. Log in to save to cloud.";
            saveStatusEl.style.color = '#ff9800';
        }
    } catch (err) {
        console.error('Failed to save guest template:', err);
        if (saveStatusEl) {
            saveStatusEl.textContent = "Error auto-saving. Please export your work.";
            saveStatusEl.style.color = '#ff0000';
        }
    }
}

/**
 * Shows a warning to guest users
 * @param {HTMLElement} saveStatusEl - Save status element
 */
export function showGuestWarning(saveStatusEl) {
    if (saveStatusEl) {
        saveStatusEl.textContent = "Log in to save your work.";
        saveStatusEl.style.color = '#ff9800';
    }
}
