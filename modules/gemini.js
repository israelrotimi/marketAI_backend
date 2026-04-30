// modules/gemini.js
// Thin wrapper around the Gemini REST API.
// Handles retries, timeouts, and safe JSON extraction.

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_RETRIES  = 2;
const TIMEOUT_MS   = 12000;

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY env variable is not set');
  return key;
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Safely extract the first JSON object or array from a string.
// Gemini sometimes wraps output in ```json … ``` fences.
function extractJson(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // Try parsing the whole string first
  try { return JSON.parse(cleaned); } catch {}
  // Find first { or [
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error('No JSON found in Gemini response');
  // Find matching end by scanning brackets
  const opener = cleaned[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === opener) depth++;
    else if (cleaned[i] === closer) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Unbalanced JSON in Gemini response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function call(prompt, expectJson = false) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey()}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      ...(expectJson ? { responseMimeType: 'application/json' } : {}),
    },
  });

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, TIMEOUT_MS);

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text) throw new Error('Empty Gemini response');

      return expectJson ? extractJson(text) : text;

    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }

  throw Object.assign(new Error(`Gemini failed after ${MAX_RETRIES + 1} attempts: ${lastErr?.message}`), {
    code: 'GEMINI_UNAVAILABLE',
  });
}

module.exports = { call };
