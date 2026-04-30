// modules/buyNowAlerts.js
// GET /api/alerts?market=wuse
// Derives alerts from live fair-price data — no Gemini needed.

const { getFairPrice }  = require('./fairPrice');
const { runPriceForecast } = require('./priceStrategist');
const cache = require('./cache');

const WATCHED_COMMODITIES = [
  'garri_white','rice_local','beans_brown','tomato','onion_bulb',
  'yam_tuber','palm_oil','pepper_tatashe','garri_yellow','maize_white',
];

function deriveAlertType(pct) {
  if (pct <= -8)  return 'buy_now';
  if (pct >= 18)  return 'avoid_bulk';
  if (pct >= 5)   return 'watch';
  if (pct <= -3)  return 'watch';
  return null; // no alert if near-fair
}

function windowLabel(type, pct, outlook) {
  if (type === 'buy_now') {
    if (outlook === 'rising') return 'Price rising soon — buy within the week';
    if (pct <= -20) return 'Strong seasonal low — ideal bulk buying window';
    return 'Below seasonal average — good buying window';
  }
  if (type === 'avoid_bulk') {
    if (outlook === 'falling') return 'Prices expected to fall — wait before buying';
    return 'Peak season pricing — buy only what you need now';
  }
  if (type === 'watch') {
    if (pct > 0)  return 'Slightly above average — monitor for a better price';
    return 'Approaching seasonal low — worth watching';
  }
  return '';
}

async function getAlerts(market) {
  const cacheKey = `alerts:${market}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const alerts = [];
  let alertId = 1;

  for (const commodity of WATCHED_COMMODITIES) {
    try {
      const fp = getFairPrice(commodity, market);
      const type = deriveAlertType(fp.pct_vs_seasonal);
      if (!type) continue;

      // Get outlook for richer window label (non-blocking — use cached if available)
      let outlook = 'stable';
      try {
        const forecast = await runPriceForecast(commodity);
        outlook = forecast.next_30_day_outlook;
      } catch {}

      alerts.push({
        id:             `alert_${String(alertId++).padStart(3, '0')}`,
        commodity:      fp.commodity,
        display_name:   fp.display_name,
        type,
        price_ngn:      fp.fair_price_ngn,
        pct_vs_seasonal: fp.pct_vs_seasonal,
        market_display: fp.market_display,
        window_label:   windowLabel(type, fp.pct_vs_seasonal, outlook),
        created_at:     new Date().toISOString(),
      });
    } catch {
      // Skip commodity if data unavailable
    }
  }

  // Sort: buy_now first, then watch, then avoid_bulk
  const order = { buy_now: 0, watch: 1, avoid_bulk: 2 };
  alerts.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));

  const result = {
    market,
    refreshed_at: new Date().toISOString(),
    alerts,
  };

  cache.set(cacheKey, result, cache.TTL.ALERTS);
  return result;
}

module.exports = { getAlerts };
