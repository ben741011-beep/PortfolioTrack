export type MarketComparison = {
  market?: "TW" | "US";
  label: string;
  warning?: boolean;
};

export type MonthlyStatistic = {
  month: number;
  taiwanAverageReturn: number;
  taiwanWinRate: number;
  usAverageReturn: number;
  usWinRate: number;
  comparison: MarketComparison;
};

export const monthlyStatistics: MonthlyStatistic[] = [
  { month: 1, taiwanAverageReturn: 2.07, taiwanWinRate: 55.2, usAverageReturn: 0.15, usWinRate: 55.2, comparison: { market: "TW", label: "台股" } },
  { month: 2, taiwanAverageReturn: 2.15, taiwanWinRate: 65.5, usAverageReturn: -0.34, usWinRate: 48.3, comparison: { market: "TW", label: "台股大勝" } },
  { month: 3, taiwanAverageReturn: 0.81, taiwanWinRate: 65.5, usAverageReturn: 1.08, usWinRate: 62.1, comparison: { market: "US", label: "美股" } },
  { month: 4, taiwanAverageReturn: 0.93, taiwanWinRate: 48.3, usAverageReturn: 1.92, usWinRate: 72.4, comparison: { market: "US", label: "美股" } },
  { month: 5, taiwanAverageReturn: 0.96, taiwanWinRate: 51.7, usAverageReturn: 0.62, usWinRate: 69.0, comparison: { market: "TW", label: "報酬較高、美股較穩" } },
  { month: 6, taiwanAverageReturn: 0.13, taiwanWinRate: 48.3, usAverageReturn: 0.24, usWinRate: 62.1, comparison: { market: "US", label: "美股" } },
  { month: 7, taiwanAverageReturn: -0.42, taiwanWinRate: 51.7, usAverageReturn: 1.23, usWinRate: 62.1, comparison: { market: "US", label: "美股大勝" } },
  { month: 8, taiwanAverageReturn: -0.40, taiwanWinRate: 55.2, usAverageReturn: -0.29, usWinRate: 58.6, comparison: { label: "兩邊都弱" } },
  { month: 9, taiwanAverageReturn: -1.82, taiwanWinRate: 48.3, usAverageReturn: -1.10, usWinRate: 48.3, comparison: { label: "兩邊最弱", warning: true } },
  { month: 10, taiwanAverageReturn: 0.42, taiwanWinRate: 67.9, usAverageReturn: 1.76, usWinRate: 64.3, comparison: { market: "US", label: "美股" } },
  { month: 11, taiwanAverageReturn: 1.35, taiwanWinRate: 58.6, usAverageReturn: 2.33, usWinRate: 79.3, comparison: { market: "US", label: "美股大勝" } },
  { month: 12, taiwanAverageReturn: 2.68, taiwanWinRate: 79.3, usAverageReturn: 0.97, usWinRate: 69.0, comparison: { market: "TW", label: "台股大勝" } },
];
