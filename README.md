# Tiny Bot — Beat Buy-and-Hold on Solana

[![u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![Rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/zenganteng0987/tiny-bot-beat-buy-and-hold/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![Reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/zenganteng0987/tiny-bot-beat-buy-and-hold/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny paper-trading bot for the make.fun competition
[Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1).
It speaks the `agent-fun/bars-replay/v1` protocol (see `protocol.schema.json` in
the kit) through the vendored `vendor/makefun-bars.ts` shim: one reply per batch
of hourly bars, long only, no network, no dependencies beyond Node 22.

## Strategy

Oversold-dip buying (RSI + Bollinger mean reversion):

- **Entry:** RSI(14) under 28 and the close under the lower Bollinger band
  (20 closes, 2 standard deviations) of the typical price, on a symbol it
  does not hold.
- **Exit:** RSI(14) over 58, or +8% take-profit, or −10% stop-loss.
- **Sizing:** equity / 4 per symbol, at most 4 open positions; every order
  caps slippage at 100 bps.

The dev window falls hard first and then recovers, so buying deep oversold
dips and exiting into the recovery beats holding through the drop.

## Dev score

Graded locally with the kit (`grade-local`, dev window
`solana-bars-1h-01-dev`, 136 hourly bars):

- **Net PnL: +377.07 USDC** (return +3.77%, Sharpe 0.06 per bar)
- 15 trades, max drawdown 3.93%, 0 rejected orders
- House baselines on the same window: hold-cash 0.00 USDC, buy-and-hold
  −869.34 USDC, macd-cci −20.22 USDC, rsi-bollinger −56.49 USDC,
  adx-momentum −114.42 USDC, ema-cross −173.04 USDC, momentum −268.23 USDC

An EMA trend variant (EMA(8)/EMA(21) cross with a 12-bar momentum filter)
was measured on the same window and scored −149.25 USDC, so the dip buyer
is the entry.

## Run

```sh
node main.ts
```

The harness runs it as `node /bot/main.ts` with this directory mounted at
`/bot`.
