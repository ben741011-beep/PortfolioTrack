import assert from "node:assert/strict";
import test from "node:test";

import { parseYahooMarketQuote } from "./yahoo-market-quote";

const usTime = Date.parse("2026-09-17T18:30:00Z") / 1_000;
const twTime = Date.parse("2026-09-18T04:30:00Z") / 1_000;
const now = Date.parse("2026-09-18T05:00:00Z");
const usMarket = { currency: "USD", timeZone: "America/New_York" } as const;
const twMarket = { currency: "TWD", timeZone: "Asia/Taipei" } as const;

function chart(
  symbol: string,
  currency: string,
  timeZone: string,
  price: unknown,
  marketTime: unknown,
) {
  return {
    chart: {
      result: [{
        meta: {
          symbol,
          currency,
          exchangeTimezoneName: timeZone,
          regularMarketPrice: price,
          regularMarketTime: marketTime,
        },
        indicators: { quote: [{ close: [999] }] },
      }],
    },
  };
}

test("reads a US regular-session price during and after trading", () => {
  const body = chart("QQQ", "USD", "America/New_York", 716.92, usTime);
  const expected = { price: 716.92, quoteDate: "2026-09-17" };
  assert.deepEqual(parseYahooMarketQuote(body, "QQQ", usMarket, now), expected);
  assert.deepEqual(parseYahooMarketQuote(body, "QQQ", usMarket, now + 86_400_000), expected);
});

test("reads listed and OTC Taiwan regular-session prices", () => {
  assert.deepEqual(
    parseYahooMarketQuote(chart("2330.TW", "TWD", "Asia/Taipei", 2440, twTime), "2330.TW", twMarket, now),
    { price: 2440, quoteDate: "2026-09-18" },
  );
  assert.deepEqual(
    parseYahooMarketQuote(chart("6488.TWO", "TWD", "Asia/Taipei", 907, twTime), "6488.TWO", twMarket, now),
    { price: 907, quoteDate: "2026-09-18" },
  );
});

test("does not use daily close when the regular-session price is absent", () => {
  const body = chart("2330.TW", "TWD", "Asia/Taipei", null, twTime);
  assert.equal(parseYahooMarketQuote(body, "2330.TW", twMarket, now), null);
});

test("rejects wrong symbol, currency, venue time zone, and future quote time", () => {
  const body = chart("2330.TW", "TWD", "Asia/Taipei", 2440, twTime);
  assert.equal(parseYahooMarketQuote(body, "6488.TWO", twMarket, now), null);
  assert.equal(parseYahooMarketQuote(body, "2330.TW", usMarket, now), null);
  assert.equal(parseYahooMarketQuote(chart("2330.TW", "TWD", "Europe/London", 2440, twTime), "2330.TW", twMarket, now), null);
  assert.equal(parseYahooMarketQuote(chart("2330.TW", "TWD", "Asia/Taipei", 2440, twTime + 86_400), "2330.TW", twMarket, now), null);
});
