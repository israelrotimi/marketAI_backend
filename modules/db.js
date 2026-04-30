// modules/db.js
// Loads prices_clean.db and both CSVs once at startup.
// All other modules import from here — never re-load per request.

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const initSqlJs = require('sql.js');

let _db        = null;
let _patterns  = null;
let _diffs     = null;
let _meta      = null;

async function load() {
  if (_db) return; // already loaded

  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/prices_clean.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`prices_clean.db not found at ${dbPath}. Run: node data/seed.js`);
  }

  const fileBuffer = fs.readFileSync(dbPath);
  _db = new SQL.Database(fileBuffer);

  const patternPath = path.join(__dirname, '../data/seasonal_patterns.csv');
  const diffPath    = path.join(__dirname, '../data/market_differentials.csv');

  _patterns = parse(fs.readFileSync(patternPath), { columns: true, cast: true });
  _diffs    = parse(fs.readFileSync(diffPath),    { columns: true, cast: true });

  // Build commodity meta map from DB
  _meta = {};
  const rows = _db.exec('SELECT slug, display_name, unit FROM commodity_meta');
  if (rows.length) {
    for (const row of rows[0].values) {
      _meta[row[0]] = { display_name: row[1], unit: row[2] };
    }
  }

  console.log('[db] Loaded DB + CSVs.');
}

function db()       { return _db; }
function patterns() { return _patterns; }
function diffs()    { return _diffs; }
function meta()     { return _meta; }

function queryAll(sql, params = []) {
  const result = _db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

function getDisplayName(slug) {
  return _meta?.[slug]?.display_name ?? slug.replace(/_/g, ' ');
}

function getUnit(slug) {
  return _meta?.[slug]?.unit ?? 'kg';
}

function getSeasonalRow(commodity, monthOfYear) {
  return _patterns.find(
    p => p.commodity === commodity && p.month_of_year === monthOfYear
  ) || null;
}

function getDifferential(commodity, market) {
  const row = _diffs.find(d => d.commodity === commodity && d.market === market);
  return row ? row.multiplier : 1.0;
}

function getLastNMonthPrices(commodity, n = 12) {
  return queryAll(
    `SELECT month, year, price_ngn, price_real FROM prices
     WHERE commodity = ? AND market = 'fct_average'
     ORDER BY date DESC LIMIT ?`,
    [commodity, n]
  ).reverse();
}

module.exports = { load, db, patterns, diffs, meta, queryAll, getDisplayName, getUnit, getSeasonalRow, getDifferential, getLastNMonthPrices };
