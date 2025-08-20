import { supabase } from './supabase-client.js';

const form = document.getElementById('submit-form');
const messageEl = document.getElementById('form-message');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        messageEl.textContent = 'You must be logged in to submit a template.';
        messageEl.style.color = 'red';
        return;
    }
    // In a real app, you'd check if the user is an admin here.
    // const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    // if (profile.role !== 'admin') { /* show error */ }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    messageEl.textContent = '';

    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const price = document.getElementById('price').value;
    const category = document.getElementById('category').value;
    const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim());
    const file = document.getElementById('template-file').files[0];

    if (!file) {
        messageEl.textContent = 'Please select a template file.';
        messageEl.style.color = 'red';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Template';
        return;
    }

    // Read the content of the JSON file
    const fileReader = new FileReader();
    fileReader.onload = async (event) => {
        try {
            const templateData = JSON.parse(event.target.result);

            // The preview is simply the canvas state itself
            const previewUrl = templateData.canvas;

            const { error } = await supabase.from('store_templates').insert({
                title,
                description,
                price,
                category,
                tags,
                template_data: templateData, // The entire JSON object from the file
                preview_url: previewUrl,     // Just the canvas part for the preview
            });

            if (error) {
                throw error;
            }

            messageEl.textContent = 'Template submitted successfully!';
            messageEl.style.color = 'lime';
            form.reset();

        } catch (error) {
            messageEl.textContent = `Error: ${error.message}`;
            messageEl.style.color = 'red';
            console.error(error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Template';
        }
    };
    fileReader.readAsText(file);
});