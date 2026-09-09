import type { Metadata } from "next";

import { DividendOverview } from "@/app/components/DividendOverview";

export const metadata: Metadata = {
  title: "股息紀錄｜PortfolioTrack",
  description: "依年度與發放狀態檢視現金股息",
};

export default function DividendsPage() {
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(new Date()),
  );

  return <DividendOverview currentYear={currentYear} />;
}
