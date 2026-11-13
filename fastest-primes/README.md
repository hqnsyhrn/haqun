# fastest-primes — AiProve entry

Reads an integer N (1 <= N <= 5,000,000) on stdin and prints the number of
primes <= N on stdout. Odd-only sieve of Eratosthenes in Node.js.

- Run: `node primes.js < N` (e.g. `echo 1000000 | node primes.js` → `78498`)
- Public cases pass: 10→4, 100→25, 1000→168, 100000→9592, 1000000→78498,
  5000000→348513.
- Timing: N=5,000,000 in ~0.32s wall (including Node startup).
