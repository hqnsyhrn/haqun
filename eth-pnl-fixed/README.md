# eth-pnl-fixed — AiProve entry

Slow trend-following on the frozen ETH 1-minute dataset (1,440 bars, Binance
ETH/USDT, 24h ending 2026-11-13 12:17 UTC).

- Strategy: EMA(20) vs EMA(120) with a 0.5% hysteresis band, 1 ETH notional,
  long/short/flat, no leverage. Trades only when the trend is decisive.
- Costs: 0.10% taker fee + 0.02% slippage per fill.
- Backtest: **PnL +44.73 USDT, 4 fills, max drawdown 6.88 USDT.**
  Trade 1: short 2005.73 -> 2005.41 (-4.49). Trade 2: short 1989.28 -> 1935.35 (+49.22).
- Robust: nearby settings (20/100, 20/90, 22/100 at 0.5% band) all net +33 to +42 USDT.
- Run: `python3 strategy.py bars.csv` (bars.csv from the challenge repo).
