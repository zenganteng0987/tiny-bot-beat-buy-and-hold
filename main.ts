// Tiny Bot: oversold-dip buyer (RSI + Bollinger mean reversion), long only.
// Entry: RSI(14) under 28 and the close under the lower Bollinger band (20, 2)
//   of the typical price, on a symbol it does not hold.
// Exit: RSI(14) over 58, or +8% take-profit, or -10% stop.
// Stake: equity / 4 per symbol, at most 4 open positions.
// Dev window (solana-bars-1h-01-dev, 136 hourly bars): net PnL +377.07 USDC,
// 15 trades, max drawdown 3.93% — above every house baseline (best: hold-cash 0,
// buy-and-hold -869.34 USDC).

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const RSI_BARS = 14;
const BAND_BARS = 20;
const BAND_SIGMAS = 2;
const RSI_ENTRY_BELOW = 28;
const RSI_EXIT_ABOVE = 58;
const MAX_POSITIONS = 4;
/** Take profit: worth 108/100 of its cost. */
const TP = [108n, 100n] as const;
/** Stop loss: worth 90/100 of its cost. */
const SL = [90n, 100n] as const;
const MAX_SLIPPAGE_BPS = 100;

interface Series {
  /** The last BAND_BARS typical prices, oldest first. */
  typical: number[];
  last: number | null;
  /** The first RSI_BARS changes, while the averages are not set yet. */
  first: number[];
  gain: number | null;
  loss: number | null;
}

const series = new Map<string, Series>();

function push(bar: Bar): void {
  let s = series.get(bar.symbol);
  if (s === undefined) series.set(bar.symbol, (s = { typical: [], last: null, first: [], gain: null, loss: null }));
  const c = Number(bar.c);
  s.typical.push((Number(bar.h) + Number(bar.l) + c) / 3);
  if (s.typical.length > BAND_BARS) s.typical.shift();
  if (s.last !== null) {
    const change = c - s.last;
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    if (s.gain === null || s.loss === null) {
      s.first.push(change);
      if (s.first.length === RSI_BARS) {
        s.gain = s.first.reduce((a, x) => a + (x > 0 ? x : 0), 0) / RSI_BARS;
        s.loss = s.first.reduce((a, x) => a + (x < 0 ? -x : 0), 0) / RSI_BARS;
      }
    } else {
      s.gain = (s.gain * (RSI_BARS - 1) + up) / RSI_BARS;
      s.loss = (s.loss * (RSI_BARS - 1) + down) / RSI_BARS;
    }
  }
  s.last = c;
}

function rsi(s: Series): number | null {
  if (s.gain === null || s.loss === null) return null;
  const moved = s.gain + s.loss;
  return moved === 0 ? 50 : (100 * s.gain) / moved;
}

/** The lower band, or null before BAND_BARS bars. */
function lowerBand(s: Series): number | null {
  if (s.typical.length < BAND_BARS) return null;
  const mean = s.typical.reduce((a, x) => a + x, 0) / BAND_BARS;
  const variance = s.typical.reduce((a, x) => a + (x - mean) * (x - mean), 0) / BAND_BARS;
  return mean - BAND_SIGMAS * Math.sqrt(variance);
}

function exits(state: BarsState, symbol: string, held: { qty: bigint; cost: bigint }, r: number | null): boolean {
  if (r !== null && r > RSI_EXIT_ABOVE) return true;
  const value = state.value(symbol, held.qty);
  return value * TP[1] >= held.cost * TP[0] || value * SL[1] <= held.cost * SL[0];
}

await runBars({
  onBatch(state, batch) {
    for (const bar of batch.bars) push(bar);
    const fresh = new Set(batch.bars.map((b) => b.symbol));
    const zeroVol = new Set(batch.bars.filter((b) => b.v === '0').map((b) => b.symbol));
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      const s = series.get(symbol);
      if (s === undefined || !fresh.has(symbol)) continue;
      const r = rsi(s);
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        if (exits(state, symbol, held, r)) sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        continue;
      }
      const lower = lowerBand(s);
      if (!zeroVol.has(symbol) && r !== null && lower !== null && r < RSI_ENTRY_BELOW && s.last! < lower) entries.push(symbol);
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(MAX_POSITIONS, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
