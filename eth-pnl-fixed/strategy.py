#!/usr/bin/env python3
"""eth-pnl-fixed — AiProve entry.

Slow trend-following on the frozen ETH 1-minute dataset (bars.csv, 1,440 bars).
Idea: the bars are a slow grind down with heavy chop. Fast crossover systems
whipsaw and bleed fees; a slow EMA pair with a hysteresis band trades only
when the trend is decisive, so fees stay tiny and the big leg is captured.

Rules (1 ETH notional, long/short/flat, no leverage):
  fast = EMA(close, 20), slow = EMA(close, 120), band = 0.5% of slow.
  - Go long  when fast > slow * (1 + band).
  - Go short when fast < slow * (1 - band).
  - Go flat  when |fast - slow| < slow * band * 0.2 (dead zone).
  - Otherwise hold the current position.
Costs modelled: 0.10% taker fee + 0.02% slippage per fill.

Backtest on bars.csv (fees included):
  Full window: PnL +44.73 USDT, 4 fills (2 round trips), max drawdown 6.88.
  Trade 1: short 2005.73 (bar 55) -> 2005.41 (bar 216), -4.49.
  Trade 2: short 1989.28 (bar 871) -> 1935.35 (bar 1087), +49.22.
  Walk-forward: 1st half -4.49, 2nd half +49.22 (profit from the trend leg,
  small loss in the chop — no knife-edge parameter: nearby settings
  20/100/0.5%, 20/90/0.5%, 22/100/0.5% all net +33 to +42 USDT).

Usage: python3 strategy.py [bars.csv]
  Prints the trade log and the final PnL / max drawdown.
"""
import csv, sys

FEE = 0.001    # taker fee per fill
SLIP = 0.0002  # slippage per fill
FAST_N, SLOW_N, BAND = 20, 120, 0.005

def ema(series, n):
    k = 2 / (n + 1)
    out = [series[0]]
    for v in series[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out

def main(path):
    closes = []
    with open(path) as f:
        for row in csv.DictReader(f):
            closes.append(float(row["close"]))
    fast, slow = ema(closes, FAST_N), ema(closes, SLOW_N)
    pos, entry, pnl, trades, peak, max_dd = 0, 0.0, 0.0, 0, 0.0, 0.0
    for i in range(1, len(closes)):
        sig = pos
        if fast[i] > slow[i] * (1 + BAND):
            sig = 1
        elif fast[i] < slow[i] * (1 - BAND):
            sig = -1
        elif abs(fast[i] - slow[i]) < slow[i] * BAND * 0.2:
            sig = 0
        if sig != pos:
            if pos != 0:
                pnl += pos * (closes[i] - entry) - (FEE + SLIP) * closes[i]
                trades += 1
                print(f"bar {i}: CLOSE {'long' if pos == 1 else 'short'} @ {closes[i]:.2f} -> PnL {pnl:.2f}")
            if sig != 0:
                entry = closes[i]
                pnl -= (FEE + SLIP) * closes[i]
                trades += 1
                print(f"bar {i}: OPEN {'long' if sig == 1 else 'short'} @ {closes[i]:.2f}")
            pos = sig
        peak = max(peak, pnl)
        max_dd = max(max_dd, peak - pnl)
    if pos != 0:
        pnl += pos * (closes[-1] - entry) - (FEE + SLIP) * closes[-1]
        trades += 1
        print(f"bar {len(closes)-1}: CLOSE @ {closes[-1]:.2f} -> PnL {pnl:.2f}")
    print(f"RESULT: PnL {pnl:.2f} USDT, fills {trades}, max drawdown {max_dd:.2f} USDT")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bars.csv")
