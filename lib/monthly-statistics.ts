export type MonthlyStatistic = {
  month: number;
  expectedReturn: number;
  riseRate: number;
  averageRise: number;
  averageFall: number;
  riseCount: number;
  fallCount: number;
  sampleCount: number;
};

export const monthlyStatistics: MonthlyStatistic[] = [
  { month: 1, expectedReturn: 2.05, riseRate: 55.2, averageRise: 6.86, averageFall: -3.87, riseCount: 16, fallCount: 13, sampleCount: 29 },
  { month: 2, expectedReturn: 2.16, riseRate: 65.5, averageRise: 5.26, averageFall: -3.74, riseCount: 19, fallCount: 10, sampleCount: 29 },
  { month: 3, expectedReturn: 0.81, riseRate: 65.5, averageRise: 3.76, averageFall: -4.79, riseCount: 19, fallCount: 10, sampleCount: 29 },
  { month: 4, expectedReturn: 0.92, riseRate: 48.3, averageRise: 6.49, averageFall: -4.28, riseCount: 14, fallCount: 15, sampleCount: 29 },
  { month: 5, expectedReturn: 0.95, riseRate: 51.7, averageRise: 5.03, averageFall: -3.42, riseCount: 15, fallCount: 14, sampleCount: 29 },
  { month: 6, expectedReturn: 0.12, riseRate: 48.3, averageRise: 5.33, averageFall: -4.73, riseCount: 14, fallCount: 15, sampleCount: 29 },
  { month: 7, expectedReturn: 0.03, riseRate: 53.3, averageRise: 4.31, averageFall: -4.85, riseCount: 16, fallCount: 14, sampleCount: 30 },
  { month: 8, expectedReturn: -0.52, riseRate: 53.3, averageRise: 2.92, averageFall: -4.45, riseCount: 16, fallCount: 14, sampleCount: 30 },
  { month: 9, expectedReturn: -2.28, riseRate: 44.8, averageRise: 3.85, averageFall: -7.26, riseCount: 13, fallCount: 16, sampleCount: 29 },
  { month: 10, expectedReturn: -0.24, riseRate: 65.5, averageRise: 3.77, averageFall: -7.88, riseCount: 19, fallCount: 10, sampleCount: 29 },
  { month: 11, expectedReturn: 1.46, riseRate: 62.1, averageRise: 5.07, averageFall: -4.46, riseCount: 18, fallCount: 11, sampleCount: 29 },
  { month: 12, expectedReturn: 2.68, riseRate: 79.3, averageRise: 4.78, averageFall: -5.35, riseCount: 23, fallCount: 6, sampleCount: 29 },
];
