export type EconomicEventType = "FOMC" | "CPI" | "PPI" | "PCE";

export type EconomicEvent = {
  type: EconomicEventType;
  title: string;
  description: string;
  referencePeriod: string;
  taipeiDateTime: string;
  sourceName: string;
  sourceUrl: string;
  hasProjections?: boolean;
};

export const economicEventMeta: Record<
  EconomicEventType,
  { label: string; shortDescription: string; accent: string }
> = {
  FOMC: {
    label: "聯準會利率決議",
    shortDescription: "利率、政策聲明與記者會",
    accent: "violet",
  },
  CPI: {
    label: "消費者物價指數",
    shortDescription: "觀察消費端通膨變化",
    accent: "sky",
  },
  PPI: {
    label: "生產者物價指數",
    shortDescription: "觀察生產端成本壓力",
    accent: "amber",
  },
  PCE: {
    label: "個人消費支出物價",
    shortDescription: "聯準會偏好的通膨指標",
    accent: "emerald",
  },
};

const BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";
const BLS_PPI_URL = "https://www.bls.gov/schedule/news_release/ppi.htm";
const BEA_PCE_URL = "https://www.bea.gov/news/schedule/full";
const FED_FOMC_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

export const usEconomicEvents: EconomicEvent[] = [
  {
    type: "CPI",
    title: "CPI 消費者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 9 月數據",
    taipeiDateTime: "2026-10-14T20:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_CPI_URL,
  },
  {
    type: "PPI",
    title: "PPI 生產者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 9 月數據",
    taipeiDateTime: "2026-10-15T20:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_PPI_URL,
  },
  {
    type: "FOMC",
    title: "FOMC 利率決議",
    description: "政策聲明發布；30 分鐘後舉行記者會",
    referencePeriod: "10/27–10/28 會議",
    taipeiDateTime: "2026-10-29T02:00:00+08:00",
    sourceName: "Federal Reserve",
    sourceUrl: FED_FOMC_URL,
  },
  {
    type: "PCE",
    title: "PCE 個人消費支出物價",
    description: "隨個人所得與支出報告發布",
    referencePeriod: "2026 年 9 月數據",
    taipeiDateTime: "2026-10-29T20:30:00+08:00",
    sourceName: "BEA",
    sourceUrl: BEA_PCE_URL,
  },
  {
    type: "CPI",
    title: "CPI 消費者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 10 月數據",
    taipeiDateTime: "2026-11-10T21:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_CPI_URL,
  },
  {
    type: "PPI",
    title: "PPI 生產者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 10 月數據",
    taipeiDateTime: "2026-11-13T21:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_PPI_URL,
  },
  {
    type: "PCE",
    title: "PCE 個人消費支出物價",
    description: "隨個人所得與支出報告發布",
    referencePeriod: "2026 年 10 月數據",
    taipeiDateTime: "2026-11-25T21:30:00+08:00",
    sourceName: "BEA",
    sourceUrl: BEA_PCE_URL,
  },
  {
    type: "FOMC",
    title: "FOMC 利率決議",
    description: "政策聲明發布；30 分鐘後舉行記者會",
    referencePeriod: "12/8–12/9 會議",
    taipeiDateTime: "2026-12-10T03:00:00+08:00",
    sourceName: "Federal Reserve",
    sourceUrl: FED_FOMC_URL,
    hasProjections: true,
  },
  {
    type: "CPI",
    title: "CPI 消費者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 11 月數據",
    taipeiDateTime: "2026-12-10T21:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_CPI_URL,
  },
  {
    type: "PPI",
    title: "PPI 生產者物價指數",
    description: "美國東部時間 08:30 發布",
    referencePeriod: "2026 年 11 月數據",
    taipeiDateTime: "2026-12-15T21:30:00+08:00",
    sourceName: "BLS",
    sourceUrl: BLS_PPI_URL,
  },
  {
    type: "PCE",
    title: "PCE 個人消費支出物價",
    description: "隨個人所得與支出報告發布",
    referencePeriod: "2026 年 11 月數據",
    taipeiDateTime: "2026-12-23T21:30:00+08:00",
    sourceName: "BEA",
    sourceUrl: BEA_PCE_URL,
  },
];
