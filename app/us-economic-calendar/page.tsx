import type { Metadata } from "next";
import { connection } from "next/server";

import { EconomicCalendarRefreshButton } from "@/app/components/EconomicCalendarRefreshButton";
import {
  economicEventMeta,
  type EconomicEvent,
  type EconomicEventType,
} from "@/lib/us-economic-calendar";
import {
  listUpcomingUsEconomicEvents,
  type UsEconomicEventDocument,
} from "@/models/UsEconomicEvent";

export const metadata: Metadata = {
  title: "美國經濟數據時程表｜家庭資產簿",
  description: "掌握 FOMC、CPI、PPI 與 PCE 的官方發布日期與台灣時間",
};

const badgeStyles: Record<EconomicEventType, string> = {
  FOMC: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  CPI: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  PPI: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  PCE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

const dotStyles: Record<EconomicEventType, string> = {
  FOMC: "bg-violet-400 shadow-violet-400/50",
  CPI: "bg-sky-400 shadow-sky-400/50",
  PPI: "bg-amber-400 shadow-amber-400/50",
  PCE: "bg-emerald-400 shadow-emerald-400/50",
};

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    day: "2-digit",
  }).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    weekday: "short",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function daysUntil(date: Date, now: Date) {
  const difference = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(difference / 86_400_000));
}

function formatStoredAt(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toEventView(document: UsEconomicEventDocument): EconomicEvent {
  const [year, month] = document.referencePeriod.split("-");
  const referencePeriod =
    document.eventType === "FOMC"
      ? `美東 ${document.sourcePeriodLabel.replace("*", "")} 會議`
      : `${year} 年 ${Number(month)} 月數據`;
  const description =
    document.eventType === "FOMC"
      ? "政策聲明發布；30 分鐘後舉行記者會"
      : document.eventType === "PCE"
        ? "隨個人所得與支出報告發布"
        : "美國東部時間 08:30 發布";

  return {
    type: document.eventType,
    title: `${document.eventType} ${economicEventMeta[document.eventType].label}`,
    description,
    referencePeriod,
    taipeiDateTime: document.releaseAt.toISOString(),
    sourceName: document.sourceAgency,
    sourceUrl: document.sourceUrl,
    hasProjections: document.hasProjections,
  };
}

function EventRow({ event, isNext }: { event: EconomicEvent; isNext: boolean }) {
  const date = new Date(event.taipeiDateTime);

  return (
    <article
      className={`relative grid gap-4 rounded-2xl border p-4 transition sm:grid-cols-[76px_1fr_auto] sm:items-center sm:p-5 ${
        isNext
          ? "border-emerald-400/35 bg-emerald-400/[0.07] shadow-lg shadow-emerald-950/20"
          : "border-white/[0.08] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]"
      }`}
    >
      {isNext ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-emerald-950">
          NEXT
        </span>
      ) : null}

      <div className="flex items-center gap-3 sm:block sm:text-center">
        <span className="text-3xl font-black leading-none tabular-nums text-white">
          {formatDay(date)}
        </span>
        <span className="text-xs font-semibold text-neutral-500 sm:mt-1 sm:block">
          {formatWeekday(date)}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.12em] ${badgeStyles[event.type]}`}>
            {event.type}
          </span>
          {event.hasProjections ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-neutral-300">
              含經濟預測
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 text-base font-bold text-white sm:text-lg">{event.title}</h3>
        <p className="mt-1 text-sm text-neutral-400">
          {event.referencePeriod} · {event.description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
        <div>
          <p className="text-lg font-black tabular-nums text-white">{formatTime(date)}</p>
          <p className="text-[11px] font-semibold text-neutral-500">台灣時間</p>
        </div>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0 inline-flex items-center gap-1 text-xs font-semibold text-neutral-400 transition hover:text-white sm:mt-2"
        >
          {event.sourceName} 官網
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

export default async function UsEconomicCalendarPage() {
  await connection();

  const now = new Date();
  const documents = await listUpcomingUsEconomicEvents(now);
  const upcomingEvents = documents.map(toEventView);
  const visibleEvents = upcomingEvents;
  const nextEvent = upcomingEvents[0];
  const latestStoredAt = documents.reduce<Date | null>(
    (latest, document) =>
      !latest || document.fetchedAt > latest ? document.fetchedAt : latest,
    null,
  );
  const groupedEvents = visibleEvents.reduce<Map<string, EconomicEvent[]>>((groups, event) => {
    const month = formatMonth(new Date(event.taipeiDateTime));
    groups.set(month, [...(groups.get(month) ?? []), event]);
    return groups;
  }, new Map());

  return (
    <main className="relative flex-1 overflow-hidden bg-[#151515] px-4 py-8 text-neutral-100 sm:px-6 sm:py-10 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 right-[-5rem] size-96 rounded-full bg-sky-500/[0.08] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute top-72 left-[-8rem] size-80 rounded-full bg-violet-500/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <header className="grid gap-6 border-b border-white/[0.08] pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-sky-300">
              <span className="size-1.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
              US MACRO CALENDAR · MONGODB
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              美國經濟數據
              <span className="block text-neutral-500">發布時程表</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400 sm:text-base">
              集中掌握會影響市場波動的 FOMC、CPI、PPI 與 PCE。所有時間已換算為台灣時間，日期異動仍以美國官方公告為準。
            </p>
          </div>

          <div className="space-y-3">
            {nextEvent ? (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-5">
                <p className="text-[11px] font-bold tracking-[0.14em] text-emerald-300">
                  下一項重要數據
                </p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-white">{nextEvent.type}</p>
                    <p className="mt-1 text-sm text-neutral-400">{nextEvent.referencePeriod}</p>
                  </div>
                  <p className="text-right text-3xl font-black tabular-nums text-emerald-300">
                    {daysUntil(new Date(nextEvent.taipeiDateTime), now)}
                    <span className="ml-1 text-xs font-semibold text-emerald-300/70">天</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5 text-sm text-amber-200">
                MongoDB 目前沒有未來時程，請登入後手動更新。
              </div>
            )}
            <div className="rounded-2xl border border-white/[0.08] bg-neutral-900/70 p-4">
              <EconomicCalendarRefreshButton />
            </div>
          </div>
        </header>

        <section aria-labelledby="indicator-guide-title" className="py-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="indicator-guide-title" className="text-sm font-bold tracking-wide text-white">
              四大觀察指標
            </h2>
            <span className="text-right text-xs text-neutral-500">
              {latestStoredAt
                ? `MongoDB 資料擷取：${formatStoredAt(latestStoredAt)}`
                : "MongoDB 尚無資料"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.entries(economicEventMeta) as [EconomicEventType, (typeof economicEventMeta)[EconomicEventType]][]).map(
              ([type, meta]) => (
                <div key={type} className="rounded-2xl border border-white/[0.08] bg-neutral-900/70 p-4">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full shadow-[0_0_10px] ${dotStyles[type]}`} />
                    <span className="text-xs font-black tracking-[0.14em] text-neutral-300">{type}</span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-white">{meta.label}</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">{meta.shortDescription}</p>
                </div>
              ),
            )}
          </div>
        </section>

        <section aria-labelledby="upcoming-events-title">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-neutral-500">TAIPEI TIME · GMT+8</p>
              <h2 id="upcoming-events-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">
                {upcomingEvents.length > 0 ? "接下來的發布" : "最近的發布紀錄"}
              </h2>
            </div>
            <p className="text-xs text-neutral-500">冬令時間開始後，美國 08:30 發布將對應台灣 21:30</p>
          </div>

          <div className="space-y-8">
            {Array.from(groupedEvents.entries()).map(([month, events]) => (
              <section key={month} aria-labelledby={`month-${month}`}>
                <div className="mb-3 flex items-center gap-3">
                  <h3 id={`month-${month}`} className="shrink-0 text-sm font-bold text-neutral-300">
                    {month}
                  </h3>
                  <span className="h-px w-full bg-white/[0.07]" />
                  <span className="shrink-0 text-xs tabular-nums text-neutral-600">{events.length} EVENTS</span>
                </div>
                <div className="space-y-3">
                  {events.map((event) => (
                    <EventRow
                      key={`${event.type}-${event.taipeiDateTime}`}
                      event={event}
                      isNext={event === nextEvent}
                    />
                  ))}
                </div>
              </section>
            ))}
            {visibleEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-neutral-500">
                尚無可顯示的未來事件。
              </div>
            ) : null}
          </div>
        </section>

        <aside className="mt-10 rounded-2xl border border-white/[0.08] bg-neutral-900/60 p-5 text-xs leading-6 text-neutral-500 sm:p-6">
          <p className="font-semibold text-neutral-300">時區說明</p>
          <p className="mt-1">
            美國夏令時間期間，東部時間 08:30 對應台灣 20:30；冬令時間期間則對應台灣 21:30。FOMC 政策聲明通常於美東 14:00 公布。
          </p>
        </aside>
      </div>
    </main>
  );
}
