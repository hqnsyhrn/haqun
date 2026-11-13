// Count primes <= N (1 <= N <= 5,000,000). Odd-only sieve of Eratosthenes.
// Usage: node primes.js < N   (reads N from stdin, prints count)
const fs = require('fs');
const N = parseInt(fs.readFileSync(0, 'utf8').trim(), 10);
if (N < 2) { console.log(0); process.exit(0); }
// odds only: index i represents number 2*i+1
const size = ((N + 1) >> 1);
const isComp = new Uint8Array(size);
const sq = Math.floor(Math.sqrt(N));
for (let i = 3; i <= sq; i += 2) {
  if (!isComp[i >> 1]) {
    const step = i;
    const start = (i * i) >> 1;
    for (let j = start; j < size; j += step) isComp[j] = 1;
  }
}
let count = 1; // prime 2
for (let i = 1; i < size; i++) if (!isComp[i]) count++;
console.log(count);
