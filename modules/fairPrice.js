function applyMarketDifferential(basePrice, commodity, market, differentials) {
  const row = differentials.find(
    d => d.commodity === commodity && d.market === market
  );
  return row ? basePrice * row.multiplier : basePrice;
}

function getFairPrice(commodity, market, db, patterns, differentials) {
  const rows = db.prepare(`
    SELECT price_real FROM prices
    WHERE commodity = ?
    AND date >= date('now', '-12 months')
  `).all(commodity);

  if (!rows.length) {
    throw new Error(`No price data found for ${commodity}`);
  }

  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const baseFair = mean(rows.map(r => r.price_real));

  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const seasonal = patterns.find(
    p => p.commodity === commodity && p.month_of_year === currentMonth
  );

  const marketPrice = applyMarketDifferential(baseFair, commodity, market, differentials);
  const pctVsSeasonal = seasonal
    ? ((marketPrice - seasonal.price_real_mean) / seasonal.price_real_mean) * 100
    : null;

  let verdict = 'fair';
  if (pctVsSeasonal !== null) {
    if (pctVsSeasonal > 15) verdict = 'above average';
    else if (pctVsSeasonal < -15) verdict = 'below average — good time to buy';
  }

  return {
    commodity,
    market,
    fair_price_ngn: Math.round(marketPrice * 100) / 100,
    seasonal_avg_ngn: seasonal ? Math.round(seasonal.price_real_mean * 100) / 100 : null,
    pct_vs_seasonal: pctVsSeasonal !== null ? Math.round(pctVsSeasonal * 10) / 10 : null,
    verdict,
    confidence: rows.length >= 6 ? 'high' : 'low'
  };
}

module.exports = { getFairPrice };