// modules/fairPrice.js
// GET /api/fair-price?commodity=garri_white&market=wuse

const db    = require('./db');
const cache = require('./cache');

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function verdictLabel(verdict) {
  const map = {
    buy_now:    'Below average — buy now',
    fair:       'Fair price',
    watch:      'Slightly above average',
    avoid_bulk: 'Above average — avoid bulk buying',
  };
  return map[verdict] ?? verdict;
}

function deriveVerdict(pct) {
  if (pct <= -10) return 'buy_now';
  if (pct >= 20)  return 'avoid_bulk';
  if (pct >= 8)   return 'watch';
  return 'fair';
}

function deriveTrend(history) {
  if (history.length < 3) return 'stable';
  const last3 = history.slice(-3).map(h => h.price_ngn);
  const delta = last3[2] - last3[0];
  const pct   = (delta / last3[0]) * 100;
  if (pct >  5) return 'up';
  if (pct < -5) return 'down';
  return 'stable';
}

function getFairPrice(commodity, market) {
  const cacheKey = `fair:${commodity}:${market}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  // Validate commodity exists
  const displayName = db.getDisplayName(commodity);
  const unit        = db.getUnit(commodity);

  // Get last 12 months of FCT-average prices
  const history12 = db.getLastNMonthPrices(commodity, 12);
  if (!history12.length) {
    const err = new Error(`No price data found for commodity: '${commodity}'`);
    err.code = 'COMMODITY_NOT_FOUND';
    throw err;
  }

  // Base fair price = 12-month real price average, then apply market differential
  const avgReal     = history12.reduce((s, r) => s + r.price_real, 0) / history12.length;
  const multiplier  = db.getDifferential(commodity, market);
  if (multiplier === 1.0 && !['wuse','garki','mararaba','kado','nyanya','fct_average'].includes(market)) {
    const err = new Error(`Market not found: '${market}'`);
    err.code = 'MARKET_NOT_FOUND';
    throw err;
  }

  const fairPriceReal = avgReal * multiplier;

  // Seasonal context for current month
  const currentMonth = new Date().getMonth() + 1;
  const seasonal     = db.getSeasonalRow(commodity, currentMonth);
  const seasonalAvg  = seasonal ? seasonal.price_real_mean * multiplier : fairPriceReal;
  const pctVsSeasonal = Math.round(((fairPriceReal - seasonalAvg) / seasonalAvg) * 1000) / 10;

  const verdict = deriveVerdict(pctVsSeasonal);
  const trend   = deriveTrend(history12);

  // Build price_history array (nominal prices for display)
  const priceHistory = history12.map((row, i) => ({
    month:      MONTHS[row.month - 1],
    price_ngn:  Math.round(row.price_ngn * multiplier),
    ...(i === history12.length - 1 ? { is_current: true } : {}),
  }));

  const result = {
    commodity,
    display_name:      displayName,
    market,
    market_display:    marketDisplay(market),
    fair_price_ngn:    Math.round(fairPriceReal),
    unit,
    seasonal_avg_ngn:  Math.round(seasonalAvg),
    pct_vs_seasonal:   pctVsSeasonal,
    verdict,
    verdict_label:     verdictLabel(verdict),
    trend,
    confidence:        history12.length >= 10 ? 'high' : history12.length >= 6 ? 'medium' : 'low',
    sources:           ['nbs', 'wfp', 'hfcp'],
    price_history:     priceHistory,
  };

  cache.set(cacheKey, result, cache.TTL.FAIR_PRICE);
  return result;
}

function marketDisplay(market) {
  const map = {
    wuse: 'Wuse Market', garki: 'Garki Market', mararaba: 'Mararaba Market',
    kado: 'Kado Market', nyanya: 'Nyanya Market', fct_average: 'FCT Average',
  };
  return map[market] ?? market;
}

module.exports = { getFairPrice };
