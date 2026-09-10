import { fetchLatestUsdTwdExchangeRate } from "@/lib/usd-twd-exchange-rate";
import {
  findUsdTwdExchangeRate,
  serializeExchangeRate,
  upsertUsdTwdExchangeRate,
  USD_TWD_PAIR,
} from "@/models/ExchangeRate";

const taipeiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const globalForExchangeRate = globalThis as typeof globalThis & {
  usdTwdRefreshPromise?: ReturnType<typeof refreshUsdTwdExchangeRate>;
};

function getTaipeiDate(date: Date) {
  return taipeiDateFormatter.format(date);
}

async function refreshUsdTwdExchangeRate() {
  const latest = await fetchLatestUsdTwdExchangeRate();
  const saved = await upsertUsdTwdExchangeRate({
    pair: USD_TWD_PAIR,
    ...latest,
    fetchedAt: new Date(),
  });

  return serializeExchangeRate(saved);
}

export async function getDailyUsdTwdExchangeRate() {
  const stored = await findUsdTwdExchangeRate();

  if (stored && getTaipeiDate(stored.fetchedAt) === getTaipeiDate(new Date())) {
    return serializeExchangeRate(stored);
  }

  if (!globalForExchangeRate.usdTwdRefreshPromise) {
    globalForExchangeRate.usdTwdRefreshPromise = refreshUsdTwdExchangeRate();
  }

  try {
    return await globalForExchangeRate.usdTwdRefreshPromise;
  } finally {
    globalForExchangeRate.usdTwdRefreshPromise = undefined;
  }
}
