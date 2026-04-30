// modules/cache.js
// Thin wrapper around node-cache.
// TTLs:
//   live prices     →  30 min   (prices change during the day)
//   fair price      →  60 min   (per commodity+market pair)
//   forecast        →  6 hours  (Gemini call — expensive)
//   market outlook  →  6 hours
//   alerts          →  30 min
//   preservation    →  24 hours (static knowledge)

const NodeCache = require('node-cache');

const cache = new NodeCache({ useClones: false });

const TTL = {
  LIVE:         30 * 60,
  FAIR_PRICE:   60 * 60,
  FORECAST:     6  * 60 * 60,
  OUTLOOK:      6  * 60 * 60,
  ALERTS:       30 * 60,
  PRESERVATION: 24 * 60 * 60,
};

function get(key)           { return cache.get(key) ?? null; }
function set(key, val, ttl) { cache.set(key, val, ttl); }
function del(key)           { cache.del(key); }
function flush()            { cache.flushAll(); }
function stats()            { return cache.getStats(); }

module.exports = { get, set, del, flush, stats, TTL };
