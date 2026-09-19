require('dotenv').config();
const val = process.env.DATABASE_URL || '';
console.log('DATABASE_URL is set:', !!val);
console.log('length:', val.length);
console.log('starts with:', val.slice(0, 15));
console.log('contains literal placeholder [YOUR-PASSWORD]:', val.includes('[YOUR-PASSWORD]'));
console.log('contains unquoted # (dotenv would truncate here):', val.includes('#'));