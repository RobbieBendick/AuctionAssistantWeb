'use strict';
// Public item icon. Image tags cannot send the ledger token, and the icon
// itself is not the gold log. Redirects to Wowhead's image CDN.

const { iconFromTooltip } = require('../../icons');
const { cors, redis } = require('../shared');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  const id = String((req.query && req.query.id) || '');
  if (!/^[1-9]\d*$/.test(id)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  try {
    let icon = await redis(['GET', 'AuctionAssistant-icon:' + id]);
    if (!icon) {
      const tip = await fetch('https://nether.wowhead.com/tooltip/item/' + id, {
        headers: { 'user-agent': 'AuctionAssistant' },
      });
      if (!tip.ok) throw new Error(String(tip.status));
      icon = iconFromTooltip(await tip.text());
      if (!icon) throw new Error('no icon');
      try { await redis(['SET', 'AuctionAssistant-icon:' + id, icon]); } catch { /* uncached is fine */ }
    }
    res.statusCode = 302;
    res.setHeader('location', 'https://wow.zamimg.com/images/wow/icons/large/' + icon + '.jpg');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end();
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
};
