fetch(GEMINI_API_KEY)

async function runPriceForecast(commodity, db, patterns) {
  const commPatterns = patterns
    .filter(p => p.commodity === commodity)
    .sort((a, b) => a.month_of_year - b.month_of_year);

  if (!commPatterns.length) throw new Error(`No patterns for ${commodity}`);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const contextLines = commPatterns.map(p =>
    `${months[p.month_of_year - 1]}: avg ₦${Math.round(p.price_real_mean)}/kg ` +
    `(±${Math.round(p.price_real_std)}), ${p.years_covered} years of data`
  );

  const prompt = `You are a food market analyst for Abuja, Nigeria.
Below are historical monthly average real prices (2024 Naira) for ${commodity}:

${contextLines.join('\n')}

Today is ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}.

Return ONLY valid JSON, no markdown, no explanation:
{
  "seasonal_low_months": ["month1", "month2"],
  "seasonal_high_months": ["month1", "month2"],
  "next_30_day_outlook": "rising | stable | falling",
  "confidence": "high | medium | low",
  "reasoning": "one sentence"
}`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    // Return cached/fallback if Gemini response is malformed
    return { next_30_day_outlook: 'stable', confidence: 'low', reasoning: 'Forecast unavailable', seasonal_low_months: [], seasonal_high_months: [] };
  }
}