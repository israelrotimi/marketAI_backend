// modules/priceStrategist.js
// GET /api/forecast?commodity=garri_white
// Calls Gemini to interpret seasonal patterns and produce a forecast.

const gemini = require('./gemini');
const db     = require('./db');
const cache  = require('./cache');

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Fallback when Gemini is unavailable — derived purely from data
function syntheticForecast(commodity, commPatterns) {
  if (!commPatterns.length) return null;

  const sorted = [...commPatterns].sort((a, b) => a.price_real_mean - b.price_real_mean);
  const lowMonths  = sorted.slice(0, 2).map(p => MONTHS[p.month_of_year - 1]);
  const highMonths = sorted.slice(-2).map(p => MONTHS[p.month_of_year - 1]);

  const now       = new Date().getMonth() + 1;
  const nextMonth = (now % 12) + 1;
  const current   = commPatterns.find(p => p.month_of_year === now);
  const next      = commPatterns.find(p => p.month_of_year === nextMonth);

  let outlook = 'stable';
  if (current && next) {
    const delta = ((next.price_real_mean - current.price_real_mean) / current.price_real_mean) * 100;
    if (delta > 4)  outlook = 'rising';
    if (delta < -4) outlook = 'falling';
  }

  return {
    seasonal_low_months:  lowMonths,
    seasonal_high_months: highMonths,
    next_30_day_outlook:  outlook,
    confidence:           'medium',
    reasoning:            'Forecast based on historical seasonal patterns (AI unavailable).',
  };
}

async function runPriceForecast(commodity) {
  const cacheKey = `forecast:${commodity}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const displayName   = db.getDisplayName(commodity);
  const commPatterns  = db.patterns().filter(p => p.commodity === commodity)
    .sort((a, b) => a.month_of_year - b.month_of_year);

  if (!commPatterns.length) {
    const err = new Error(`No seasonal data for commodity: '${commodity}'`);
    err.code  = 'COMMODITY_NOT_FOUND';
    throw err;
  }

  const contextLines = commPatterns.map(p =>
    `${MONTHS[p.month_of_year - 1]}: avg ₦${Math.round(p.price_real_mean)}/` +
    `${db.getUnit(commodity)} (±${Math.round(p.price_real_std)}), ${p.years_covered} years`
  );

  const nowLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prompt = `You are a food market analyst for Abuja, Nigeria.
Below are historical monthly average real prices (2024 Naira) for ${displayName}:

${contextLines.join('\n')}

Today is ${nowLabel}.

Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text:
{
  "seasonal_low_months": ["Month1", "Month2"],
  "seasonal_high_months": ["Month1", "Month2"],
  "next_30_day_outlook": "rising",
  "confidence": "high",
  "reasoning": "One concise sentence explaining the forecast."
}

next_30_day_outlook must be exactly one of: "rising", "stable", "falling"
confidence must be exactly one of: "high", "medium", "low"
seasonal_low_months and seasonal_high_months must each contain 1–3 month names.`;

  let forecast;
  try {
    const raw = await gemini.call(prompt, true);
    // Validate required fields
    forecast = {
      seasonal_low_months:  Array.isArray(raw.seasonal_low_months)  ? raw.seasonal_low_months  : [],
      seasonal_high_months: Array.isArray(raw.seasonal_high_months) ? raw.seasonal_high_months : [],
      next_30_day_outlook:  ['rising','stable','falling'].includes(raw.next_30_day_outlook) ? raw.next_30_day_outlook : 'stable',
      confidence:           ['high','medium','low'].includes(raw.confidence) ? raw.confidence : 'medium',
      reasoning:            typeof raw.reasoning === 'string' ? raw.reasoning : '',
    };
  } catch (geminiErr) {
    console.warn(`[priceStrategist] Gemini failed for ${commodity}: ${geminiErr.message}. Using synthetic fallback.`);
    forecast = syntheticForecast(commodity, commPatterns) || {
      seasonal_low_months: [], seasonal_high_months: [],
      next_30_day_outlook: 'stable', confidence: 'low',
      reasoning: 'Forecast unavailable.',
    };
  }

  const result = {
    commodity,
    display_name:         displayName,
    generated_at:         new Date().toISOString(),
    ...forecast,
  };

  cache.set(cacheKey, result, cache.TTL.FORECAST);
  return result;
}

module.exports = { runPriceForecast };
