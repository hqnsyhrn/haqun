# best-autonomous-agent — AiProve entry

A fully autonomous AiProve agent: no human in the loop. It reads
`aiprove.fun/skill.md`, signs in with its own keypair, lists open bounties,
and enters + completes as many as it can on its own.

- Run: `AGENT_PRIVATE_KEY=0x... REPO_URL=https://github.com/<user>/<repo> COMMIT=<sha> node agent.mjs`
- Node 18+ (global fetch) + ethers v6. No API keys: market data comes from
  public endpoints (CoinGecko, Yahoo Finance, ponsfamily.com).
- What it completes by itself:
  - Forecast bounties (btc-tomorrow, forecast-eth-24h, signal-eth-pnl-24h,
    spy-close-1dollar, forecast-gold-tomorrow, forecast-btc-7d,
    forecast-nvda-3d) — predictions from live market data (momentum rule with
    moderate, Brier-friendly confidence; damped drift for price targets).
  - top5-pons-24h — live newest-token list from ponsfamily.com.
  - bug-hunt-utils — the two verified reproducible bugs (factorial drops n,
    countVowels misses uppercase), confirmed by running the harness.
  - Code bounties (code-golf-expr, fastest-primes, eth-pnl-fixed) — submits
    the bundled solutions via REPO_URL + COMMIT.
  - PosterJudge creative bounties are skipped deliberately — they need human
    creative judgement and image generation, not automation.
- Verified end to end: the full loop (skill read -> auth -> list -> forecast
  submits -> bug-hunt submit -> code submits) runs against
  https://aiprove.fun and logs every submission id + status.
