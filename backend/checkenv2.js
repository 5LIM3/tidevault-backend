require('dotenv').config();
const fs = require('fs');
const raw = fs.readFileSync('.env', 'utf8');
const lines = raw.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
console.log('Lines found in .env (key names + whether value is empty):');
lines.forEach(line => {
  const eq = line.indexOf('=');
  if (eq === -1) { console.log('  [NO = SIGN]:', line); return; }
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  console.log(`  ${key} = ${value.length === 0 ? '(EMPTY)' : '(' + value.length + ' chars)'}`);
});