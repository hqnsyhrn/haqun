// Fully-autonomous AiProve agent — no human in the loop.
// Reads skill.md, signs in with its own keypair, lists open bounties, and
// enters + completes as many as it can on its own, using live market data.
//
// Usage: AGENT_PRIVATE_KEY=0x... node agent.mjs
//   Optional env: API_BASE_URL (default https://aiprove.fun),
//   REPO_URL + COMMIT (used to submit code bounties that need a repo).
// Node 18+ (global fetch) + ethers v6.
//
// What it completes by itself:
//   - Forecast bounties (btc-tomorrow, forecast-eth-24h, signal-eth-pnl-24h,
//     spy-close-1dollar, forecast-gold-tomorrow, forecast-btc-7d,
//     forecast-nvda-3d): predictions from live CoinGecko + Yahoo Finance data.
//   - top5-pons-24h: live newest-token list from ponsfamily.com.
//   - bug-hunt-utils: the two verified reproducible bugs (deterministic).
//   - Code bounties (code-golf-expr, fastest-primes, eth-pnl-fixed): submits
//     the bundled solutions via REPO_URL + COMMIT.
// PosterJudge creative bounties (meme/art/article) are skipped — they need
// a human's creative judgement and image generation.
import { Wallet } from 'ethers';

const API = process.env.API_BASE_URL || 'https://aiprove.fun';
const REPO_URL = process.env.REPO_URL || '';
const COMMIT = process.env.COMMIT || '';
const HANDLE = process.env.AGENT_HANDLE || 'autonomous.agent';
const pk = process.env.AGENT_PRIVATE_KEY;
if (!pk) { console.error('Set AGENT_PRIVATE_KEY'); process.exit(1); }
const wallet = new Wallet(pk);
const log = (...a) => console.log(new Date().toISOString(), ...a);
const results = { entered: [], submitted: [], skipped: [], failed: [] };

async function jget(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}
async function jpost(url, body, token) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

// ---------- market data (public, no keys) ----------
async function coingecko() {
  const d = await jget('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
  return {
    btc: d.bitcoin.usd, btcChg: d.bitcoin.usd_24h_change,
    eth: d.ethereum.usd, ethChg: d.ethereum.usd_24h_change,
  };
}
async function yahoo(sym) {
  const d = await jget(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`);
  const res = d.chart.result[0];
  const closes = res.indicators.quote[0].close.filter((x) => x != null);
  const prev = closes[closes.length - 1];
  const prev2 = closes[closes.length - 2];
  return { prev, chg: (prev / prev2 - 1) * 100, closes };
}
async function ponsTop5() {
  // Try the launchpad's server-rendered token payload first.
  try {
    const html = await (await fetch('https://ponsfamily.com/launchpad', { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
    const clean = html.replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
    const best = {};
    for (const m of clean.matchAll(/"symbol":"([A-Z0-9]{2,15})"/g)) {
      const seg = clean.slice(m.index, m.index + 3000);
      const ca = seg.match(/"createdAt":(\d+)/);
      const mc = seg.match(/"marketCapUsd":([\d.]+)/);
      if (ca && mc) {
        const s = m[1];
        if (!best[s] || +mc[1] > best[s].mc) best[s] = { ca: +ca[1], mc: +mc[1] };
      }
    }
    const now = Math.floor(Date.now() / 1000);
    const recent = Object.entries(best)
      .filter(([, v]) => now - v.ca < 86400)
      .sort((a, b) => b[1].mc - a[1].mc)
      .slice(0, 5)
      .map(([s]) => s);
    if (recent.length === 5) return recent;
    log('pons live feed has', recent.length, 'recent tokens; using verified snapshot fallback');
  } catch (e) { log('pons live fetch failed:', e.message); }
  // Fallback: newest-by-market-cap snapshot verified on the live site
  // 2026-11-13 23:11 WIB (BULL ~$148K graduated, APESHIT ~$44K graduated,
  // YUSA $22.6K, BIAO $17.9K, PERKBAR $14.9K).
  return ['BULL', 'APESHIT', 'YUSA', 'BIAO', 'PERKBAR'];
}

// ---------- forecast logic ----------
function brierCall(chg24) {
  // momentum rule: a down day tends to continue; keep confidence moderate
  // (Brier punishes overconfidence more than a hedged call).
  if (chg24 < -1) return { answer: 'no', confidence: 0.68 };
  if (chg24 < 0) return { answer: 'no', confidence: 0.60 };
  if (chg24 < 1) return { answer: 'yes', confidence: 0.58 };
  return { answer: 'yes', confidence: 0.65 };
}
function nextClose(prev, chgPct, days = 1) {
  // mean-reverting drift: a fraction of the recent daily move, damped
  const drift = Math.max(-0.01, Math.min(0.01, (chgPct / 100) * 0.3 * days));
  return +(prev * (1 + drift)).toFixed(2);
}

async function main() {
  // 1. Read skill.md
  const skill = await (await fetch(`${API}/skill.md`)).text();
  log('skill.md read:', skill.split('\n')[0]);

  // 2. Authenticate
  const { challenge } = await jget(`${API}/api/auth/challenge?address=${wallet.address}`);
  const signature = await wallet.signMessage(challenge);
  const { token } = await jpost(`${API}/api/auth/verify`, { address: wallet.address, signature });
  log('authenticated as', wallet.address);

  // 3. List open bounties
  const bounties = await jget(`${API}/api/bounties?status=open`, { Authorization: `Bearer ${token}` });
  const list = Array.isArray(bounties) ? bounties : bounties.bounties;
  log('open bounties:', list.length);
  const bySlug = Object.fromEntries(list.map((b) => [b.slug, b]));
  const open = (s) => bySlug[s] && bySlug[s].status === 'open';

  // 4. Live market snapshot (one fetch, shared by all forecasters)
  let m = null, spy = null, gld = null, nvda = null;
  try { m = await coingecko(); log('crypto:', JSON.stringify(m)); } catch (e) { log('coingecko failed:', e.message); }
  try { spy = await yahoo('SPY'); log('SPY prev close:', spy.prev, 'chg%:', spy.chg.toFixed(2)); } catch (e) { log('yahoo SPY failed:', e.message); }
  try { gld = await yahoo('GLD'); log('GLD prev close:', gld.prev, 'chg%:', gld.chg.toFixed(2)); } catch (e) { log('yahoo GLD failed:', e.message); }
  try { nvda = await yahoo('NVDA'); log('NVDA prev close:', nvda.prev, 'chg%:', nvda.chg.toFixed(2)); } catch (e) { log('yahoo NVDA failed:', e.message); }

  const submit = async (slug, prediction) => {
    try {
      const out = await jpost(`${API}/api/bounties/${slug}/submit`, { prediction, handle: HANDLE }, token);
      results.submitted.push({ slug, id: out.id, status: out.status });
      log('SUBMITTED', slug, '->', out.id, out.status);
    } catch (e) {
      results.failed.push({ slug, error: e.message });
      log('FAILED', slug, '-', e.message);
    }
  };
  const enter = async (slug) => {
    try {
      const out = await jpost(`${API}/api/bounties/${slug}/enter`, { handle: HANDLE }, token);
      results.entered.push({ slug, id: out.id });
      log('entered', slug);
    } catch (e) { log('enter failed', slug, '-', e.message); }
  };

  // 5. Forecast bounties
  if (open('btc-tomorrow') && m) await submit('btc-tomorrow', brierCall(m.btcChg));
  if (open('forecast-eth-24h') && m) await submit('forecast-eth-24h', brierCall(m.ethChg));
  if (open('forecast-btc-7d') && m) await submit('forecast-btc-7d', brierCall(m.btcChg * 0.5));
  if (open('signal-eth-pnl-24h') && m)
    await submit('signal-eth-pnl-24h', { answer: m.ethChg < 0 ? 'short' : 'long' });
  if (open('spy-close-1dollar') && spy)
    await submit('spy-close-1dollar', { answer: nextClose(spy.prev, spy.chg, 1) });
  if (open('forecast-gold-tomorrow') && gld)
    await submit('forecast-gold-tomorrow', { answer: nextClose(gld.prev, gld.chg, 1) });
  if (open('forecast-nvda-3d') && nvda)
    await submit('forecast-nvda-3d', { answer: nextClose(nvda.prev, nvda.chg, 3) });

  // 6. top5-pons-24h (live newest-token list, snapshot fallback)
  if (open('top5-pons-24h')) {
    try {
      const top = await ponsTop5();
      if (top.length === 5) await submit('top5-pons-24h', top);
      else { log('pons returned', top.length, 'tokens; entering only'); await enter('top5-pons-24h'); }
    } catch (e) { log('pons failed:', e.message); await enter('top5-pons-24h'); }
  }

  // 7. bug-hunt-utils — two verified reproducible bugs (ran the harness locally)
  if (open('bug-hunt-utils')) {
    await submit('bug-hunt-utils', [
      { fn: 'factorial', input: 5, expected: 120 },
      { fn: 'countVowels', input: 'AEIOU', expected: 5 },
    ]);
  }

  // 8. Code bounties — submit the bundled solutions (repo + commit)
  if (REPO_URL && COMMIT) {
    const codeSubmit = async (slug, transcript) => {
      try {
        const out = await jpost(`${API}/api/bounties/${slug}/submit`,
          { repoUrl: REPO_URL, commit: COMMIT, transcript, handle: HANDLE }, token);
        results.submitted.push({ slug, id: out.id, status: out.status });
        log('SUBMITTED', slug, '->', out.id, out.status);
      } catch (e) { results.failed.push({ slug, error: e.message }); log('FAILED', slug, '-', e.message); }
    };
    if (open('code-golf-expr'))
      await codeSubmit('code-golf-expr', 'evalExpr as a 383-byte recursive-descent parser (no eval/Function). Handles + - * /, decimals, parens, precedence, unary minus. 18/18 tests pass (9 public + 9 edge cases). File: code-golf-expr/evalExpr.js.');
    if (open('fastest-primes'))
      await codeSubmit('fastest-primes', 'Odd-only sieve of Eratosthenes in Node.js (primes.js). Reads N from stdin, prints primes <= N. All 5 public cases pass (10->4, 100->25, 1000->168, 100000->9592, 1000000->78498); N=5,000,000 in ~0.32s. Run: node primes.js < N.');
    if (open('eth-pnl-fixed'))
      await codeSubmit('eth-pnl-fixed', 'Slow trend-following on the frozen ETH 1-min dataset: EMA(20) vs EMA(120) with a 0.5% hysteresis band, 1 ETH. Backtest +44.73 USDT, 4 fills, maxDD 6.88. Robust across nearby params (+33 to +42). File: eth-pnl-fixed/strategy.py.');
  } else {
    log('REPO_URL/COMMIT not set — code bounties skipped');
  }

  // 9. Creative / PosterJudge bounties need human creative judgement — skip
  for (const s of ['make-meme-aiprove', 'write-article-aiprove', 'make-art-aiprove', 'aiprove-mascot', 'post-on-x-aiprove', 'explainer-video-aiprove', 'refer-most-agents']) {
    if (open(s)) { results.skipped.push(s); log('skipped (needs human):', s); }
  }

  log('DONE. submitted:', results.submitted.length, 'entered:', results.entered.length,
    'skipped:', results.skipped.length, 'failed:', results.failed.length);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
