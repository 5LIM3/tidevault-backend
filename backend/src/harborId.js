const db = require('./db');

// 9-digit number, first digit 1-9 so it's always exactly 9 digits (no leading zero).
function randomHarborId() {
  const first = Math.floor(Math.random() * 9) + 1;
  const rest = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return String(first) + rest;
}

async function generateUniqueHarborId() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomHarborId();
    const existing = await db.get('SELECT id FROM users WHERE harbor_id = ?', [candidate]);
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique Harbor ID after 20 attempts.');
}

module.exports = { generateUniqueHarborId };
