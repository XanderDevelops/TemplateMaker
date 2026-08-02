// Returns the locale selected from deployment geolocation and request language.
// Vercel supplies x-vercel-ip-country in production; Cloudflare-compatible headers are supported too.
module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const firstHeader = value => Array.isArray(value) ? value[0] : (value || '');
  const country = String(
    firstHeader(req.headers['x-vercel-ip-country']) ||
    firstHeader(req.headers['cf-ipcountry']) ||
    firstHeader(req.headers['x-country-code']) ||
    ''
  ).trim().toUpperCase();
  const acceptLanguage = String(firstHeader(req.headers['accept-language'])).toLowerCase();
  const locale = country === 'CN' || /^zh(?:-|_|,|;|$)/i.test(acceptLanguage) ? 'zh-CN' : 'en';

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Accept-Language, X-Vercel-IP-Country, CF-IPCountry');
  return res.status(200).json({ locale, country: country || null, source: country === 'CN' ? 'country' : (/^zh/i.test(acceptLanguage) ? 'language' : 'default') });
};
