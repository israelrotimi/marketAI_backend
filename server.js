// server.js
// Abuja Market Advisor — Express API
// Usage: GEMINI_API_KEY=your_key node server.js

require('dotenv').config(); // optional — loads .env if present

const express = require('express');
const dbModule = require('./modules/db');
const cache   = require('./modules/cache');
const {
  errorMiddleware, asyncHandler,
  requireQuery, requireBody,
  validateMarket, validateStorage, validateQuantity,
} = require('./modules/errorHandler');

const { getLivePrices }       = require('./modules/livePrices');
const { getFairPrice }        = require('./modules/fairPrice');
const { runPriceForecast }    = require('./modules/priceStrategist');
const { getPreservationAdvice } = require('./modules/preservationAgent');
const { getAlerts }           = require('./modules/buyNowAlerts');
const { getMarketOutlook }    = require('./modules/marketOutlook');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── CORS (for mobile app during development) ────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    cache:  cache.stats(),
    gemini: !!process.env.GEMINI_API_KEY,
  });
});

// ─── GET /api/prices/live?market=wuse ─────────────────────────────────────────
app.get('/api/prices/live', asyncHandler(async (req, res) => {
  requireQuery(req, 'market');
  const market = req.query.market.toLowerCase();
  validateMarket(market);
  const data = getLivePrices(market);
  res.json(data);
}));

// ─── GET /api/fair-price?commodity=garri_white&market=wuse ────────────────────
app.get('/api/fair-price', asyncHandler(async (req, res) => {
  requireQuery(req, 'commodity', 'market');
  const commodity = req.query.commodity.toLowerCase();
  const market    = req.query.market.toLowerCase();
  validateMarket(market);
  const data = getFairPrice(commodity, market);
  res.json(data);
}));

// ─── GET /api/forecast?commodity=garri_white ──────────────────────────────────
app.get('/api/forecast', asyncHandler(async (req, res) => {
  requireQuery(req, 'commodity');
  const commodity = req.query.commodity.toLowerCase();
  const data = await runPriceForecast(commodity);
  res.json(data);
}));

// ─── POST /api/preservation ───────────────────────────────────────────────────
// Body: { commodity, storage, quantity }
app.post('/api/preservation', asyncHandler(async (req, res) => {
  requireBody(req, 'commodity', 'storage', 'quantity');
  const commodity = req.body.commodity.toLowerCase();
  const storage   = req.body.storage.toLowerCase();
  const quantity  = req.body.quantity.toLowerCase();
  validateStorage(storage);
  validateQuantity(quantity);
  const data = await getPreservationAdvice(commodity, storage, quantity);
  res.json(data);
}));

// ─── GET /api/alerts?market=wuse ──────────────────────────────────────────────
app.get('/api/alerts', asyncHandler(async (req, res) => {
  requireQuery(req, 'market');
  const market = req.query.market.toLowerCase();
  validateMarket(market);
  const data = await getAlerts(market);
  res.json(data);
}));

// ─── GET /api/market-outlook?market=wuse ──────────────────────────────────────
app.get('/api/market-outlook', asyncHandler(async (req, res) => {
  requireQuery(req, 'market');
  const market = req.query.market.toLowerCase();
  validateMarket(market);
  const data = await getMarketOutlook(market);
  res.json(data);
}));

// ─── DEV: flush cache ─────────────────────────────────────────────────────────
app.post('/dev/cache/flush', (req, res) => {
  cache.flush();
  res.json({ message: 'Cache flushed' });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: true, code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global error middleware ──────────────────────────────────────────────────
app.use(errorMiddleware);

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await dbModule.load();
    app.listen(PORT, () => {
      console.log(`\nMarket Advisor API running on http://localhost:${PORT}`);
      console.log(`Gemini: ${process.env.GEMINI_API_KEY ? 'configured' : 'NOT SET — AI features will use fallbacks'}`);
      console.log('\nEndpoints:');
      console.log('  GET  /api/prices/live?market=wuse');
      console.log('  GET  /api/fair-price?commodity=garri_white&market=wuse');
      console.log('  GET  /api/forecast?commodity=garri_white');
      console.log('  POST /api/preservation  { commodity, storage, quantity }');
      console.log('  GET  /api/alerts?market=wuse');
      console.log('  GET  /api/market-outlook?market=wuse');
      console.log('  GET  /health\n');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
