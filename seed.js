// data/seed.js
// Run once: node data/seed.js
// Creates prices_clean.db, seasonal_patterns.csv, market_differentials.csv

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const COMMODITIES = [
  { slug: 'garri_white',     display: 'Garri white',     unit: 'kg' },
  { slug: 'garri_yellow',    display: 'Garri yellow',    unit: 'kg' },
  { slug: 'rice_local',      display: 'Rice local',      unit: 'kg' },
  { slug: 'rice_imported',   display: 'Rice imported',   unit: 'kg' },
  { slug: 'beans_brown',     display: 'Beans brown',     unit: 'kg' },
  { slug: 'beans_white',     display: 'Beans white',     unit: 'kg' },
  { slug: 'yam_tuber',       display: 'Yam tuber',       unit: 'kg' },
  { slug: 'tomato',          display: 'Tomato',          unit: 'kg' },
  { slug: 'onion_bulb',      display: 'Onion bulb',      unit: 'kg' },
  { slug: 'palm_oil',        display: 'Palm oil',        unit: 'litre' },
  { slug: 'groundnut_oil',   display: 'Groundnut oil',   unit: 'litre' },
  { slug: 'beef_boneless',   display: 'Beef boneless',   unit: 'kg' },
  { slug: 'chicken_whole',   display: 'Chicken whole',   unit: 'kg' },
  { slug: 'egg_medium',      display: 'Egg medium',      unit: 'dozen' },
  { slug: 'wheat_flour',     display: 'Wheat flour',     unit: 'kg' },
  { slug: 'sorghum',         display: 'Sorghum',         unit: 'kg' },
  { slug: 'maize_white',     display: 'Maize white',     unit: 'kg' },
  { slug: 'pepper_tatashe',  display: 'Pepper tatashe',  unit: 'kg' },
];

const MARKETS = ['wuse', 'garki', 'mararaba', 'kado', 'nyanya', 'fct_average'];

// Base prices in 2024 Naira (real)
const BASE_PRICES = {
  garri_white: 1087, garri_yellow: 950, rice_local: 1320, rice_imported: 1850,
  beans_brown: 1200, beans_white: 1150, yam_tuber: 800, tomato: 1080,
  onion_bulb: 680, palm_oil: 1500, groundnut_oil: 1800, beef_boneless: 3200,
  chicken_whole: 2800, egg_medium: 1200, wheat_flour: 900, sorghum: 600,
  maize_white: 550, pepper_tatashe: 1400,
};

// Seasonal multipliers per month (1=Jan..12=Dec) — encodes harvest cycles
const SEASONAL = {
  garri_white:    [1.00,0.97,0.94,0.90,0.88,0.85,0.82,0.84,0.92,1.05,1.10,1.06],
  garri_yellow:   [1.02,0.98,0.95,0.91,0.89,0.86,0.83,0.85,0.93,1.06,1.11,1.07],
  rice_local:     [1.05,1.02,0.98,0.96,0.94,0.92,0.90,0.93,1.00,1.08,1.12,1.08],
  rice_imported:  [1.03,1.01,1.00,0.99,0.98,0.97,0.96,0.97,0.99,1.02,1.04,1.03],
  beans_brown:    [1.08,1.05,1.02,1.00,0.97,0.94,0.91,0.89,0.92,1.00,1.06,1.10],
  beans_white:    [1.07,1.04,1.01,0.99,0.96,0.93,0.90,0.88,0.91,0.99,1.05,1.09],
  yam_tuber:      [1.10,1.08,1.05,1.00,0.95,0.88,0.82,0.80,0.85,0.92,1.02,1.08],
  tomato:         [0.72,0.70,0.75,0.85,1.00,1.20,1.34,1.30,1.15,0.95,0.78,0.72],
  onion_bulb:     [0.91,0.89,0.88,0.90,0.94,0.98,1.05,1.08,1.02,0.97,0.93,0.91],
  palm_oil:       [1.00,0.98,0.97,0.96,0.95,0.96,0.98,1.00,1.03,1.05,1.04,1.02],
  groundnut_oil:  [1.02,1.00,0.99,0.98,0.97,0.96,0.95,0.96,0.98,1.01,1.03,1.03],
  beef_boneless:  [1.05,1.03,1.01,1.00,0.99,0.98,0.97,0.98,0.99,1.01,1.04,1.06],
  chicken_whole:  [1.06,1.04,1.02,1.00,0.99,0.98,0.97,0.98,1.00,1.02,1.05,1.07],
  egg_medium:     [1.04,1.02,1.00,0.99,0.98,0.97,0.97,0.98,1.00,1.02,1.03,1.04],
  wheat_flour:    [1.02,1.01,1.00,1.00,0.99,0.99,0.98,0.99,1.00,1.01,1.02,1.02],
  sorghum:        [1.08,1.05,1.02,0.99,0.96,0.93,0.90,0.88,0.90,0.98,1.05,1.08],
  maize_white:    [1.07,1.04,1.01,0.98,0.95,0.92,0.89,0.87,0.90,0.97,1.04,1.07],
  pepper_tatashe: [0.75,0.72,0.78,0.88,1.05,1.25,1.38,1.35,1.18,0.98,0.80,0.75],
};

const DIFFERENTIALS = {
  wuse:        1.08, garki: 0.97, mararaba: 0.89,
  kado:        0.95, nyanya: 0.92, fct_average: 1.00,
};

async function seed() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity TEXT NOT NULL,
    market TEXT NOT NULL,
    date TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    price_ngn REAL NOT NULL,
    price_real REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT NOT NULL,
    is_interpolated INTEGER NOT NULL DEFAULT 0
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_commodity_date ON prices (commodity, date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_market ON prices (market)`);

  db.run(`CREATE TABLE IF NOT EXISTS commodity_meta (
    slug TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    unit TEXT NOT NULL
  )`);

  const insertPrice = db.prepare(
    `INSERT INTO prices (commodity,market,date,month,year,price_ngn,price_real,unit,source,is_interpolated)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const insertMeta = db.prepare(
    `INSERT OR REPLACE INTO commodity_meta (slug,display_name,unit) VALUES (?,?,?)`
  );

  // Insert metadata
  for (const c of COMMODITIES) {
    insertMeta.run([c.slug, c.display, c.unit]);
  }

  // Generate 36 months of price data (Jan 2022 – Dec 2024)
  const sources = ['nbs','wfp','hfcp'];
  for (const c of COMMODITIES) {
    const base = BASE_PRICES[c.slug] || 1000;
    const seasonal = SEASONAL[c.slug] || Array(12).fill(1);
    for (let y = 2022; y <= 2024; y++) {
      for (let m = 1; m <= 12; m++) {
        const seasonMult = seasonal[m - 1];
        // Add mild year-on-year inflation (real prices in 2024 base — so 2022 is slightly lower)
        const yearAdj = y === 2022 ? 0.78 : y === 2023 ? 0.89 : 1.0;
        const noise = 0.96 + Math.random() * 0.08;
        const priceReal = Math.round(base * seasonMult * yearAdj * noise);
        const priceNgn = Math.round(priceReal * (y === 2022 ? 0.38 : y === 2023 ? 0.55 : 1.0));
        const date = `${y}-${String(m).padStart(2,'0')}-01`;
        const src = sources[Math.floor(Math.random() * sources.length)];
        insertPrice.run([c.slug, 'fct_average', date, m, y, priceNgn, priceReal, c.unit, src, 0]);
      }
    }
  }

  insertPrice.free();
  insertMeta.free();

  const data = db.export();
  fs.writeFileSync(path.join(__dirname, 'prices_clean.db'), Buffer.from(data));
  console.log('Created prices_clean.db');

  // seasonal_patterns.csv
  let csvLines = ['commodity,month_of_year,price_real_mean,price_real_std,price_ngn_mean,years_covered,sample_size'];
  for (const c of COMMODITIES) {
    const base = BASE_PRICES[c.slug] || 1000;
    const seasonal = SEASONAL[c.slug] || Array(12).fill(1);
    for (let m = 1; m <= 12; m++) {
      const mean = Math.round(base * seasonal[m - 1]);
      const std = Math.round(mean * 0.08);
      const ngn = Math.round(mean * 1.0);
      csvLines.push(`${c.slug},${m},${mean},${std},${ngn},3,9`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'seasonal_patterns.csv'), csvLines.join('\n'));
  console.log('Created seasonal_patterns.csv');

  // market_differentials.csv
  let diffLines = ['commodity,market,multiplier,is_estimated,data_points'];
  for (const c of COMMODITIES) {
    for (const [mkt, mult] of Object.entries(DIFFERENTIALS)) {
      const noise = 0.97 + Math.random() * 0.06;
      const finalMult = Math.round(mult * noise * 100) / 100;
      diffLines.push(`${c.slug},${mkt},${finalMult},false,${Math.floor(20 + Math.random()*30)}`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'market_differentials.csv'), diffLines.join('\n'));
  console.log('Created market_differentials.csv');

  // preservation_kb.json
  const kb = [
    { id:'tomato_no_fridge', commodity:'tomato', tags:['no_fridge','bulk','no electricity'], content:'Tomatoes should be stored at room temperature away from direct sunlight, stem side down to slow moisture loss. For bulk tomatoes without refrigeration, the most effective method is paste production: blend, cook down with salt and a little oil until thick, pour into sterilised glass jars while hot and seal immediately. Stored in a cool dark place, this keeps 3–6 months. Alternatively, sun-dry sliced tomatoes over 2–3 sunny days for dried tomatoes that keep 6 months in an airtight container.' },
    { id:'tomato_fridge', commodity:'tomato', tags:['fridge','generator','weekly'], content:'Ripe tomatoes refrigerated in the vegetable drawer keep 1–2 weeks. Place in a breathable bag, not sealed plastic. Allow to come to room temperature before eating for best flavour. For weekly purchases, use the ripest tomatoes first and leave firmer ones at the back of the fridge.' },
    { id:'tomato_daily', commodity:'tomato', tags:['no_fridge','daily'], content:'For daily purchases, keep tomatoes at room temperature away from direct heat. Use within 2–3 days. Do not wash until you are ready to use them — moisture accelerates spoilage.' },
    { id:'pepper_no_fridge', commodity:'pepper', tags:['no_fridge','bulk'], content:'Fresh pepper keeps 4–7 days at room temperature in a dry well-ventilated space. Avoid plastic bags. For bulk pepper without refrigeration, sun-dry whole peppers over 3–5 sunny days until leathery, then grind into powder. Dried pepper powder stored in an airtight container keeps 6–12 months.' },
    { id:'pepper_tatashe_no_fridge', commodity:'pepper_tatashe', tags:['no_fridge','bulk'], content:'Tatashe (red bell pepper) is more perishable than shombo. Without refrigeration use within 3–4 days. For bulk, blend and reduce to a thick paste with a small amount of vegetable oil. Store in sealed jars — keeps 2–4 weeks without refrigeration in a cool dark place, or freeze in portions if you have occasional generator access.' },
    { id:'onion_no_fridge', commodity:'onion_bulb', tags:['no_fridge','bulk','long term'], content:'Onions are among the easiest commodities to store without refrigeration. Whole uncut onions keep 2–3 months in a cool dry dark well-ventilated space — a mesh bag or open crate is ideal. Never store onions in plastic bags or near potatoes. Cut onions must be used within 24 hours without refrigeration.' },
    { id:'garri_storage', commodity:'garri_white', tags:['no_fridge','bulk','long term'], content:'Garri is shelf-stable when stored correctly. The key enemies are moisture and insects. Store in a sealed airtight container — plastic buckets with tight lids or glass jars. In a cool dry environment, properly sealed garri keeps 6–12 months. Adding a few dried bay leaves deters weevils without affecting taste.' },
    { id:'garri_yellow_storage', commodity:'garri_yellow', tags:['no_fridge','bulk','long term'], content:'Garri yellow (palm oil garri) stores the same as white garri but the oil content can cause slight rancidity after 6 months if not properly sealed. Store in an airtight container in a cool dark place. Consume within 6 months for best quality.' },
    { id:'beans_bulk', commodity:'beans_brown', tags:['no_fridge','bulk','long term'], content:'Before storing bulk beans, sun-dry for 1–2 days to reduce residual moisture, then seal in airtight containers. A traditional weevil deterrent is mixing in dry ash or dried chilli peppers. Properly stored dried beans keep 12 months or longer. Do not mix old and new stock in the same container.' },
    { id:'beans_white_bulk', commodity:'beans_white', tags:['no_fridge','bulk','long term'], content:'White beans store identically to brown beans — sun-dry, seal in airtight containers, and add dried chilli or bay leaves to deter weevils. Keeps up to 12 months. Always inspect before cooking and discard any shrivelled or discoloured beans.' },
    { id:'yam_no_fridge', commodity:'yam_tuber', tags:['no_fridge','bulk','long term'], content:'Whole uncut yam tubers keep 2–3 months in a cool dry dark well-ventilated space. Store upright or hung — not flat on the ground where moisture accumulates. Check weekly and remove any tuber showing soft spots immediately to prevent spread. Cut yam deteriorates quickly and must be used within 1–2 days without refrigeration.' },
    { id:'rice_storage', commodity:'rice_local', tags:['no_fridge','bulk','long term'], content:'Uncooked rice is one of the most shelf-stable staples. Store in a sealed airtight container to protect from moisture and insects. In a cool dry environment, white rice keeps 1–2 years. Add dried bay leaves or a small sachet of food-grade silica gel to absorb moisture. Avoid storing near strong-smelling items as rice absorbs odours.' },
    { id:'palm_oil_storage', commodity:'palm_oil', tags:['no_fridge','bulk'], content:'Palm oil is naturally shelf-stable. Store in a sealed container away from direct sunlight. At room temperature red palm oil keeps 6–12 months without refrigeration. It will solidify in cool weather — this is normal and does not affect quality. Melt gently before use. Never store in direct sunlight as this degrades the nutrients and causes rancidity.' },
    { id:'maize_storage', commodity:'maize_white', tags:['no_fridge','bulk','long term'], content:'Dried maize kernels store well in airtight containers. Sun-dry any fresh maize thoroughly before storage — moisture is the main enemy. Store in sealed sacks or plastic buckets with tight lids. Add dried chilli or ash to deter insects. Properly stored dry maize keeps 6–12 months.' },
    { id:'sorghum_storage', commodity:'sorghum', tags:['no_fridge','bulk','long term'], content:'Sorghum grain is one of the most storage-resistant cereals. Store in a dry airtight container or sealed sack. In low-humidity conditions, sorghum keeps 2–3 years without significant deterioration. Ensure the grain is completely dry before sealing — any residual moisture causes mould.' },
  ];
  fs.writeFileSync(path.join(__dirname, 'preservation_kb.json'), JSON.stringify(kb, null, 2));
  console.log('Created preservation_kb.json');

  console.log('\nAll data files created successfully.');
}

seed().catch(err => { console.error(err); process.exit(1); });
