// modules/livePrices.js
// GET /api/prices/live?market=wuse

const { getFairPrice } = require('./fairPrice');
const cache = require('./cache');

const TOP_COMMODITIES = [
  'garri_white','rice_local','tomato','onion_bulb',
  'beans_brown','yam_tuber','palm_oil','pepper_tatashe',
  'beef_boneless','egg_medium',
];

function getLivePrices(market) {
  const cacheKey = `live:${market}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const prices = [];
  for (const commodity of TOP_COMMODITIES) {
    try {
      const fp = getFairPrice(commodity, market);
      prices.push({
        commodity:        fp.commodity,
        display_name:     fp.display_name,
        price_ngn:        fp.fair_price_ngn,
        unit:             fp.unit,
        pct_vs_seasonal:  fp.pct_vs_seasonal,
        trend:            fp.trend,
        verdict:          fp.verdict,
      });
    } catch {
      // Skip commodities with no data rather than failing the whole response
    }
  }

  if (!prices.length) {
    const err = new Error(`No price data available for market: '${market}'`);
    err.code = 'NO_DATA_AVAILABLE';
    throw err;
  }

  const result = {
    market,
    refreshed_at: new Date().toISOString(),
    prices,
  };

  cache.set(cacheKey, result, cache.TTL.LIVE);
  return result;
}

module.exports = { getLivePrices };
