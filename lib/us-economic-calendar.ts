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
