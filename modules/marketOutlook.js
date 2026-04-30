// modules/marketOutlook.js
// GET /api/market-outlook?market=wuse
// Produces the home screen hero summary using Gemini.

const gemini         = require('./gemini');
const { getLivePrices } = require('./livePrices');
const cache          = require('./cache');

function buildFallbackSummary(prices, market) {
  const buyItems  = prices.filter(p => p.verdict === 'buy_now').map(p => p.display_name);
  const avoidItems = prices.filter(p => p.verdict === 'avoid_bulk').map(p => p.display_name);

  let summary = '';
  if (buyItems.length)  summary += `Good time to buy: ${buyItems.join(', ')}. `;
  if (avoidItems.length) summary += `Avoid bulk buying: ${avoidItems.join(', ')}. `;
  if (!summary) summary = `Prices at ${market} are generally near fair levels today.`;

  return summary.trim();
}

async function getMarketOutlook(market) {
  const cacheKey = `outlook:${market}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const liveData = getLivePrices(market);
  const prices   = liveData.prices;

  // Pick top buy and top avoid for structured fields
  const buyNow   = prices.filter(p => p.verdict === 'buy_now')
    .sort((a, b) => a.pct_vs_seasonal - b.pct_vs_seasonal)[0];
  const avoid    = prices.filter(p => p.verdict === 'avoid_bulk')
    .sort((a, b) => b.pct_vs_seasonal - a.pct_vs_seasonal)[0];

  // Build a compact price snapshot for Gemini
  const snapshot = prices.slice(0, 8).map(p =>
    `${p.display_name}: ₦${p.price_ngn}/${p.unit} (${p.pct_vs_seasonal > 0 ? '+' : ''}${p.pct_vs_seasonal}% vs seasonal avg, ${p.verdict})`
  ).join('\n');

  const nowLabel = new Date().toLocaleString('en-GB', { weekday:'long', day:'numeric', month:'long' });

  const prompt = `You are a friendly market intelligence advisor for households in Abuja, Nigeria.
Today is ${nowLabel}. Here is the current price snapshot for ${market} market:

${snapshot}

Write a 2-sentence market summary that:
1. Highlights the most important buying opportunity or risk
2. Gives a practical timing recommendation

Keep it conversational, specific, and under 50 words total.
Respond with ONLY the summary text — no quotes, no labels, no JSON.`;

  let summary;
  try {
    summary = (await gemini.call(prompt)).trim().replace(/^"|"$/g, '');
    if (!summary || summary.length < 10) throw new Error('Empty summary');
  } catch (err) {
    console.warn(`[marketOutlook] Gemini failed: ${err.message}. Using fallback.`);
    summary = buildFallbackSummary(prices, market);
  }

  const result = {
    market,
    generated_at: new Date().toISOString(),
    summary,
    top_buy: buyNow ? {
      commodity:    buyNow.commodity,
      display_name: buyNow.display_name,
      reason:       `${Math.abs(buyNow.pct_vs_seasonal)}% below seasonal average`,
    } : null,
    top_avoid: avoid ? {
      commodity:    avoid.commodity,
      display_name: avoid.display_name,
      reason:       `${avoid.pct_vs_seasonal}% above seasonal average`,
    } : null,
  };

  cache.set(cacheKey, result, cache.TTL.OUTLOOK);
  return result;
}

module.exports = { getMarketOutlook };
