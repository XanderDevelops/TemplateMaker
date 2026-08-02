# Simplified Chinese localization

- Mainland China is detected through `/api/locale` using Vercel's `x-vercel-ip-country` header.
- Browser language and Asia/Shanghai timezone are client-side fallbacks.
- A persistent English / 简体中文 selector is available on every HTML page.
- Static pages, SEO metadata, JSON-LD, tool UI, dynamic DOM messages, alert/confirm/prompt dialogs, and common generated labels are translated.
- Imported spreadsheet values and editable user content are deliberately excluded from automatic translation.
- Chinese system fonts are used, so the localization does not depend on Google Fonts.
- Language can be forced for testing with `?lang=zh-CN` or `?lang=en`.

## QA summary

```json
{
  "source_strings": 4604,
  "translated_entries": 2856,
  "manual_entries": 548,
  "english_heavy_entries": 15,
  "html_files_injected": 39
}
```

The 15 English-heavy catalog entries are intentionally preserved technical examples (API code/JSON, HTTP headers, font names, and cache diagnostics); code blocks are excluded from DOM translation so executable examples are never altered.

## Validation performed

- `CN` geolocation header → `zh-CN`
- Chinese `Accept-Language` outside China → `zh-CN`
- English request outside China → `en`
- All 39 HTML surfaces include the localization bootstrap, stylesheet, and runtime
- No missing literal strings were found in alert, confirm, prompt, toast, notification, button-state, title, placeholder, or ARIA-label contexts
- Imported CSV table values, column names, grouped previews, and user-created object names are marked `data-i18n-skip`
- JavaScript syntax checks passed for the localization API/runtime and both editor builds
