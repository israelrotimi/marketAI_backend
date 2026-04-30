// modules/errorHandler.js
// Central Express error middleware + request validator helpers.

const ERROR_CODES = new Set([
  'COMMODITY_NOT_FOUND',
  'MARKET_NOT_FOUND',
  'NO_DATA_AVAILABLE',
  'INVALID_PARAMS',
  'GEMINI_UNAVAILABLE',
]);

const HTTP_STATUS = {
  COMMODITY_NOT_FOUND: 404,
  MARKET_NOT_FOUND:    404,
  NO_DATA_AVAILABLE:   503,
  INVALID_PARAMS:      400,
  GEMINI_UNAVAILABLE:  502,
};

const VALID_MARKETS = new Set(['wuse','garki','mararaba','kado','nyanya','fct_average']);
const VALID_STORAGE = new Set(['no_fridge','fridge','generator']);
const VALID_QUANTITY = new Set(['bulk','weekly','daily']);

function invalidParam(message) {
  const err = new Error(message);
  err.code = 'INVALID_PARAMS';
  return err;
}

function requireQuery(req, ...fields) {
  for (const f of fields) {
    if (!req.query[f] || !String(req.query[f]).trim()) {
      throw invalidParam(`Missing required query parameter: '${f}'`);
    }
  }
}

function requireBody(req, ...fields) {
  for (const f of fields) {
    if (!req.body[f] || !String(req.body[f]).trim()) {
      throw invalidParam(`Missing required body field: '${f}'`);
    }
  }
}

function validateMarket(market) {
  if (!VALID_MARKETS.has(market)) {
    throw invalidParam(`Invalid market '${market}'. Must be one of: ${[...VALID_MARKETS].join(', ')}`);
  }
}

function validateStorage(storage) {
  if (!VALID_STORAGE.has(storage)) {
    throw invalidParam(`Invalid storage '${storage}'. Must be one of: ${[...VALID_STORAGE].join(', ')}`);
  }
}

function validateQuantity(quantity) {
  if (!VALID_QUANTITY.has(quantity)) {
    throw invalidParam(`Invalid quantity '${quantity}'. Must be one of: ${[...VALID_QUANTITY].join(', ')}`);
  }
}

// Express error middleware — must have 4 params
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  const code   = ERROR_CODES.has(err.code) ? err.code : 'INTERNAL_ERROR';
  const status = HTTP_STATUS[code] ?? 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}:`, err.message);
  }

  res.status(status).json({
    error:   true,
    code,
    message: err.message ?? 'An unexpected error occurred',
  });
}

// Wraps async route handlers so errors propagate to errorMiddleware
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  errorMiddleware,
  asyncHandler,
  requireQuery,
  requireBody,
  validateMarket,
  validateStorage,
  validateQuantity,
};
