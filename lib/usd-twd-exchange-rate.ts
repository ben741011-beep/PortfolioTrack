const CBC_USD_TWD_URL = "https://www.cbc.gov.tw/tw/lp-645-1.html";

export type UsdTwdExchangeRate = {
  rate: number;
  quoteDate: string;
  source: "中央銀行";
};

export class ExchangeRateServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeRateServiceError";
  }
}

export async function fetchLatestUsdTwdExchangeRate(): Promise<UsdTwdExchangeRate> {
  let response: Response;

  try {
    response = await fetch(CBC_USD_TWD_URL, {
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent": "PortfolioTrack/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ExchangeRateServiceError("目前無法取得美元兌台幣匯率");
  }

  if (!response.ok) {
    throw new ExchangeRateServiceError("中央銀行匯率服務暫時無法使用");
  }

  const html = await response.text();
  const match = html.match(
    /<td\s+data-th="標題\(日期\)">\s*<span>(\d{4}\/\d{2}\/\d{2})<\/span>\s*<\/td>\s*<td\s+data-th="NTD\/USD">\s*<span>(\d+(?:\.\d+)?)<\/span>/,
  );

  if (!match) {
    throw new ExchangeRateServiceError("中央銀行匯率資料格式不正確");
  }

  const rate = Number(match[2]);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ExchangeRateServiceError("中央銀行匯率資料格式不正確");
  }

  return {
    rate,
    quoteDate: match[1].replaceAll("/", "-"),
    source: "中央銀行",
  };
}
