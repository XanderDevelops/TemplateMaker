(function () {
  const trimText = (value, max = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

  function getSectionLabel(element) {
    const section = element.closest('section');
    if (!section) return null;
    return section.id || section.getAttribute('aria-label') || section.className || null;
  }

  function logLandingEvent(eventName, metadata) {
    try {
      if (typeof window.csvlinkLogActivity === 'function') {
        window.csvlinkLogActivity(eventName, metadata);
      }
      if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...metadata });
      }
    } catch (error) {
      console.warn('Landing tracking failed:', error);
    }
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    const text = trimText(link.textContent || link.getAttribute('aria-label') || href);
    const metadata = {
      cta_text: text,
      href,
      section: getSectionLabel(link),
      page_title: document.title || null
    };

    if (/lemonsqueezy\.com\/buy/i.test(href) || link.classList.contains('lemonsqueezy-button')) {
      logLandingEvent('checkout_started', metadata);
      return;
    }

    if (href === '/tool' || href.startsWith('/tool?') || href.endsWith('/tool')) {
      logLandingEvent('landing_tool_cta_clicked', metadata);
      return;
    }

    if (/\.(csv|xlsx|xls)$/i.test(href)) {
      logLandingEvent('sample_file_download_clicked', metadata);
    }
  }, { passive: true });
})();
