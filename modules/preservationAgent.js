// modules/preservationAgent.js
// POST /api/preservation
// RAG pipeline: keyword retrieval over preservation_kb.json → Gemini synthesis

const fs     = require('fs');
const path   = require('path');
const gemini = require('./gemini');
const cache  = require('./cache');

// Load KB once at module init
const KB_PATH = path.join(__dirname, '../data/preservation_kb.json');
let _kb = null;

function loadKb() {
  if (_kb) return _kb;
  if (!fs.existsSync(KB_PATH)) {
    throw new Error(`preservation_kb.json not found at ${KB_PATH}. Run: node data/seed.js`);
  }
  _kb = JSON.parse(fs.readFileSync(KB_PATH));
  console.log(`[preservation] Loaded ${_kb.length} KB entries`);
  return _kb;
}

// ─── Retrieval layer ────────────────────────────────────────────────────────
// Scores each KB entry against the query (commodity + storage + quantity).
// No embeddings needed at hackathon scale — exact and partial tag matching
// with a commodity filter gives reliable retrieval over a small corpus.

function tokenise(str) {
  return str.toLowerCase().replace(/[_-]/g, ' ').split(/\s+/).filter(Boolean);
}

function retrieveContext(commodity, storage, quantity) {
  const kb = loadKb();

  // Normalise storage/quantity values to tag tokens
  const queryTokens = [
    ...tokenise(storage),
    ...tokenise(quantity),
    ...(storage === 'no_fridge' ? ['no electricity'] : []),
    ...(quantity === 'bulk' ? ['long term'] : []),
  ];

  // 1) Filter to matching commodity (exact slug match first, then partial)
  let candidates = kb.filter(e => e.commodity === commodity);
  if (!candidates.length) {
    // Try partial match (e.g. "pepper" matches "pepper_tatashe")
    candidates = kb.filter(e => e.commodity.includes(commodity) || commodity.includes(e.commodity));
  }
  if (!candidates.length) {
    // Fall back to generic entries tagged with the commodity name in content
    candidates = kb.filter(e => e.content.toLowerCase().includes(commodity.replace(/_/g,' ')));
  }

  // 2) Score by tag overlap
  const scored = candidates.map(entry => {
    const entryTokens = entry.tags.map(t => tokenise(t)).flat();
    const matches = queryTokens.filter(qt =>
      entryTokens.some(et => et.includes(qt) || qt.includes(et))
    ).length;
    return { ...entry, _score: matches };
  }).sort((a, b) => b._score - a._score);

  // Return top 2 content blocks
  return scored.slice(0, 2).map(e => e.content);
}

// ─── Fallback steps (no Gemini / no KB match) ───────────────────────────────
function genericFallback(commodity, storage) {
  const name = commodity.replace(/_/g, ' ');
  if (storage === 'no_fridge') {
    return [
      { step: 1, instruction: `Store ${name} in a cool, dry, dark and well-ventilated place.` },
      { step: 2, instruction: 'Use an airtight container to protect from moisture and insects.' },
      { step: 3, instruction: 'Check weekly and remove any spoiled portions immediately to prevent spread.' },
    ];
  }
  return [
    { step: 1, instruction: `Refrigerate ${name} in the vegetable drawer.` },
    { step: 2, instruction: 'Use within the recommended shelf life for fresh produce.' },
  ];
}

// ─── Gemini synthesis ───────────────────────────────────────────────────────
async function synthesiseSteps(commodity, storage, quantity, contextBlocks) {
  const name = commodity.replace(/_/g, ' ');
  const storageLabel = { no_fridge: 'no refrigerator / no electricity', fridge: 'refrigerator available', generator: 'generator with intermittent electricity' }[storage] ?? storage;
  const qtyLabel = { bulk: 'large bulk purchase', weekly: 'weekly household purchase', daily: 'daily purchase' }[quantity] ?? quantity;

  const contextText = contextBlocks.length
    ? `REFERENCE KNOWLEDGE:\n${contextBlocks.join('\n\n')}`
    : 'No specific reference available — use general food safety best practices for Nigerian households.';

  const prompt = `You are a practical food preservation advisor for Nigerian households in Abuja.
Use ONLY the reference information below to answer. Do not add information not in the reference.

${contextText}

USER SITUATION:
- Commodity: ${name}
- Storage constraint: ${storageLabel}
- Purchase size: ${qtyLabel}

Provide practical step-by-step preservation instructions.
Respond ONLY with a valid JSON array — no markdown, no extra text:
[
  { "step": 1, "instruction": "..." },
  { "step": 2, "instruction": "..." }
]

Rules:
- Maximum 5 steps
- Each instruction is one clear sentence in plain English
- Focus on what to DO, not what not to do
- Instructions must be actionable for someone with no special equipment`;

  const raw = await gemini.call(prompt, true);
  if (!Array.isArray(raw)) throw new Error('Gemini did not return an array');

  return raw
    .filter(s => typeof s.step === 'number' && typeof s.instruction === 'string')
    .slice(0, 5)
    .map((s, i) => ({ step: i + 1, instruction: s.instruction.trim() }));
}

// ─── Shelf life lookup ───────────────────────────────────────────────────────
const SHELF_LIVES = {
  tomato:         { no_fridge: '4–5 days fresh / 3–6 months (paste)',   fridge: '1–2 weeks', generator: '1 week' },
  pepper_tatashe: { no_fridge: '3–4 days fresh / 2–4 weeks (paste)',    fridge: '1–2 weeks', generator: '1 week' },
  pepper:         { no_fridge: '4–7 days fresh / 6–12 months (dried)',  fridge: '2 weeks',   generator: '2 weeks' },
  onion_bulb:     { no_fridge: '2–3 months',  fridge: '1–2 months',     generator: '2–3 months' },
  garri_white:    { no_fridge: '6–12 months', fridge: '6–12 months',    generator: '6–12 months' },
  garri_yellow:   { no_fridge: '4–6 months',  fridge: '6 months',       generator: '6 months' },
  beans_brown:    { no_fridge: '12 months',   fridge: '12 months',      generator: '12 months' },
  beans_white:    { no_fridge: '12 months',   fridge: '12 months',      generator: '12 months' },
  yam_tuber:      { no_fridge: '2–3 months',  fridge: '1 month',        generator: '2 months' },
  rice_local:     { no_fridge: '1–2 years',   fridge: '1–2 years',      generator: '1–2 years' },
  rice_imported:  { no_fridge: '1–2 years',   fridge: '1–2 years',      generator: '1–2 years' },
  palm_oil:       { no_fridge: '6–12 months', fridge: '1 year',         generator: '6–12 months' },
  maize_white:    { no_fridge: '6–12 months', fridge: '6–12 months',    generator: '6–12 months' },
  sorghum:        { no_fridge: '2–3 years',   fridge: '2–3 years',      generator: '2–3 years' },
};

function getShelfLife(commodity, storage) {
  const entry = SHELF_LIVES[commodity];
  if (!entry) return 'Varies by condition';
  return entry[storage] ?? entry.no_fridge ?? 'Varies';
}

// ─── Main export ─────────────────────────────────────────────────────────────
async function getPreservationAdvice(commodity, storage, quantity) {
  const cacheKey = `pres:${commodity}:${storage}:${quantity}`;
  const cached   = cache.get(cacheKey);
  if (cached) return cached;

  const displayName = commodity.replace(/_/g, ' ');
  const contextBlocks = retrieveContext(commodity, storage, quantity);

  let steps;
  try {
    steps = await synthesiseSteps(commodity, storage, quantity, contextBlocks);
    if (!steps.length) throw new Error('Empty steps from Gemini');
  } catch (err) {
    console.warn(`[preservation] Gemini failed: ${err.message}. Using fallback.`);
    steps = genericFallback(commodity, storage);
  }

  const result = {
    commodity,
    display_name:        displayName,
    storage,
    quantity,
    steps,
    shelf_life_estimate: getShelfLife(commodity, storage),
    sources:             contextBlocks.length ? ['fao_postharvest', 'nbs_household'] : ['general_guidelines'],
  };

  cache.set(cacheKey, result, cache.TTL.PRESERVATION);
  return result;
}

module.exports = { getPreservationAdvice };
