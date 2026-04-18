const express = require('express');
const Database = require('better-sqlite3');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const { getFairPrice } = require('./modules/fairPrice');

const app = express();
app.use(express.json());

// Load data once at startup — not per request
const db = new Database('./data/prices_clean.db');
const patterns = parse(fs.readFileSync('./data/seasonal_patterns.csv'), { columns: true, cast: true });
const differentials = parse(fs.readFileSync('./data/market_differentials.csv'), { columns: true, cast: true });

app.get('/api/fair-price', (req, res) => {
  const { commodity, market } = req.query;

  if (!commodity || !market) {
    return res.status(400).json({ error: 'commodity and market are required' });
  }

  try {
    const result = getFairPrice(commodity, market, db, patterns, differentials);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('API running on port 3000'));