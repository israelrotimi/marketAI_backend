# Abuja Market Advisor — Backend API

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Seed the development database + CSV files
node data/seed.js

# 3. Set your Gemini API key
export GEMINI_API_KEY=your_key_here

# 4. Start the server
npm start
# or with auto-reload:
npm run dev
```

Server runs on `http://localhost:3000`

---

## Environment variables

| Variable         | Required | Description                  |
|------------------|----------|------------------------------|
| `GEMINI_API_KEY` | Yes      | Google Gemini API key        |
| `PORT`           | No       | Server port (default: 3000)  |

Create a `.env` file in the root:
```
GEMINI_API_KEY=your_key_here
PORT=3000
```

---

## Endpoints

| Method | Path | Description | Cache TTL |
|--------|------|-------------|-----------|
| GET | `/api/prices/live?market=wuse` | Live prices for a market | 30 min |
| GET | `/api/fair-price?commodity=garri_white&market=wuse` | Fair price benchmark | 60 min |
| GET | `/api/forecast?commodity=garri_white` | AI seasonal forecast | 6 hrs |
| POST | `/api/preservation` | Preservation advice (RAG) | 24 hrs |
| GET | `/api/alerts?market=wuse` | Buy now / watch / avoid alerts | 30 min |
| GET | `/api/market-outlook?market=wuse` | Home screen AI summary | 6 hrs |
| GET | `/health` | Server health + cache stats | none |
| POST | `/dev/cache/flush` | Flush all caches | — |

---

## Valid parameter values

**Markets:** `wuse` `garki` `mararaba` `kado` `nyanya` `fct_average`

**Storage (preservation):** `no_fridge` `fridge` `generator`

**Quantity (preservation):** `bulk` `weekly` `daily`

---

## Error shape

```json
{
  "error": true,
  "code": "COMMODITY_NOT_FOUND",
  "message": "No price data found for commodity: 'xyz'"
}
```

Error codes: `COMMODITY_NOT_FOUND` · `MARKET_NOT_FOUND` · `NO_DATA_AVAILABLE` · `INVALID_PARAMS` · `GEMINI_UNAVAILABLE`

---

## Project structure

```
market-advisor/
├── server.js                    # Express app + all routes
├── modules/
│   ├── db.js                    # SQLite + CSV loader (singleton)
│   ├── cache.js                 # TTL cache wrapper
│   ├── gemini.js                # Gemini client (retry + timeout)
│   ├── errorHandler.js          # Error middleware + validators
│   ├── livePrices.js            # GET /api/prices/live
│   ├── fairPrice.js             # GET /api/fair-price
│   ├── priceStrategist.js       # GET /api/forecast
│   ├── preservationAgent.js     # POST /api/preservation (RAG)
│   ├── buyNowAlerts.js          # GET /api/alerts
│   └── marketOutlook.js         # GET /api/market-outlook
├── data/
│   ├── seed.js                  # Run once — generates all data files
│   ├── prices_clean.db          # SQLite (seed.js output)
│   ├── seasonal_patterns.csv    # (seed.js output)
│   ├── market_differentials.csv # (seed.js output)
│   └── preservation_kb.json     # (seed.js output)
└── package.json
```

## Swapping in real data

When Person D delivers real data files, drop them into `data/` replacing
the seeded versions. File names and paths must stay the same.
No code changes needed anywhere.
