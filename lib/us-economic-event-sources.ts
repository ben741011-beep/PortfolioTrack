import { createHash } from "node:crypto";

import {
  parseUsEconomicEventInput,
  type UsEconomicEventInput,
  type UsEconomicEventType,
} from "@/models/UsEconomicEvent";

const BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";
const BLS_PPI_URL = "https://www.bls.gov/schedule/news_release/ppi.htm";
const BEA_PCE_URL = "https://www.bea.gov/news/schedule/full";
const FED_FOMC_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const SOURCE_TIME_ZONE = "America/New_York" as const;

type ParsedSourceEvent = Omit<UsEconomicEventInput, "sourcePageHash" | "fetchedAt">;

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMonth(value: string) {
  const normalized = value.toLowerCase().replace(/\./g, "");
  const month = MONTHS[normalized];
  if (!month) throw new Error(`無法解析月份：${value}`);
  return month;
}

function parseMonthYear(value: string) {
  const match = value.match(/^([A-Za-z]+)\s+([0-9]{4})$/);
  if (!match) throw new Error(`無法解析參考月份：${value}`);
  return { year: Number(match[2]), month: parseMonth(match[1]) };
}

function parseReleaseDate(value: string) {
  const match = value.match(/^([A-Za-z]+)\.?\s+([0-9]{1,2}),\s+([0-9]{4})$/);
  if (!match) throw new Error(`無法解析發布日期：${value}`);
  return {
    year: Number(match[3]),
    month: parseMonth(match[1]),
    day: Number(match[2]),
  };
}

function parse12HourTime(value: string) {
  const match = value.trim().match(/^([0-9]{1,2}):([0-9]{2})\s+(AM|PM)$/i);
  if (!match) throw new Error(`無法解析發布時間：${value}`);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(match[2]) };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  const match = part?.match(/^GMT([+-])([0-9]{2}):([0-9]{2})$/);
  if (!match) throw new Error(`無法取得 ${timeZone} 時區偏移`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

function zonedDateTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = getTimeZoneOffsetMinutes(
    new Date(naiveUtc),
    SOURCE_TIME_ZONE,
  );
  const firstResult = new Date(naiveUtc - firstOffset * 60_000);
  const finalOffset = getTimeZoneOffsetMinutes(firstResult, SOURCE_TIME_ZONE);
  return new Date(naiveUtc - finalOffset * 60_000);
}

function buildEvent({
  eventType,
  referenceYear,
  referenceMonth,
  sourcePeriodLabel,
  sourceReleaseName,
  releaseYear,
  releaseMonth,
  releaseDay,
  releaseHour,
  releaseMinute,
  sourceAgency,
  sourceUrl,
  hasProjections = false,
}: {
  eventType: UsEconomicEventType;
  referenceYear: number;
  referenceMonth: number;
  sourcePeriodLabel: string;
  sourceReleaseName: string;
  releaseYear: number;
  releaseMonth: number;
  releaseDay: number;
  releaseHour: number;
  releaseMinute: number;
  sourceAgency: "Federal Reserve" | "BLS" | "BEA";
  sourceUrl: string;
  hasProjections?: boolean;
}): ParsedSourceEvent {
  const referencePeriod = `${referenceYear}-${pad(referenceMonth)}`;
  return {
    eventKey: `${eventType}:${referencePeriod}`,
    eventType,
    referencePeriod,
    sourcePeriodLabel,
    sourceReleaseName,
    releaseAt: zonedDateTimeToDate(
      releaseYear,
      releaseMonth,
      releaseDay,
      releaseHour,
      releaseMinute,
    ),
    sourceLocalDate: `${releaseYear}-${pad(releaseMonth)}-${pad(releaseDay)}`,
    sourceLocalTime: `${pad(releaseHour)}:${pad(releaseMinute)}`,
    sourceTimeZone: SOURCE_TIME_ZONE,
    sourceAgency,
    sourceUrl,
    hasProjections,
  };
}

export function parseBlsSchedule(
  html: string,
  eventType: "CPI" | "PPI",
  sourceUrl: string,
) {
  const events: ParsedSourceEvent[] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => decodeHtml(match[1]),
    );
    if (cells.length !== 3 || !/^[A-Za-z]+\s+[0-9]{4}$/.test(cells[0])) {
      continue;
    }

    const reference = parseMonthYear(cells[0]);
    const release = parseReleaseDate(cells[1]);
    const time = parse12HourTime(cells[2]);
    events.push(
      buildEvent({
        eventType,
        referenceYear: reference.year,
        referenceMonth: reference.month,
        sourcePeriodLabel: cells[0],
        sourceReleaseName:
          eventType === "CPI" ? "Consumer Price Index" : "Producer Price Index",
        releaseYear: release.year,
        releaseMonth: release.month,
        releaseDay: release.day,
        releaseHour: time.hour,
        releaseMinute: time.minute,
        sourceAgency: "BLS",
        sourceUrl,
      }),
    );
  }

  if (events.length < 10) {
    throw new Error(`${eventType} 官方時程解析筆數異常：${events.length}`);
  }
  return events;
}

export function parseBeaPceSchedule(html: string, sourceUrl: string, year: number) {
  const events: ParsedSourceEvent[] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rowMatch of rowMatches) {
    if (!/Personal Income and Outlays/i.test(rowMatch[1])) continue;

    const dateLabel = rowMatch[1].match(
      /<div[^>]*class="release-date"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const timeLabel = rowMatch[1].match(
      /<small[^>]*class="text-muted"[^>]*>([\s\S]*?)<\/small>/i,
    );
    const title = decodeHtml(rowMatch[1]);
    const referenceMatch = title.match(
      /Personal Income and Outlays,\s+([A-Za-z]+)\s+([0-9]{4})/i,
    );
    if (!dateLabel || !timeLabel || !referenceMatch) {
      if (/October and November 2025/i.test(title)) continue;
      throw new Error(`PCE 官方時程欄位無法解析：${title}`);
    }

    const dateMatch = decodeHtml(dateLabel[1]).match(
      /^([A-Za-z]+)\s+([0-9]{1,2})$/,
    );
    if (!dateMatch) throw new Error(`PCE 發布日期無法解析：${dateLabel[1]}`);
    const time = parse12HourTime(decodeHtml(timeLabel[1]));
    const referenceMonth = parseMonth(referenceMatch[1]);
    const referenceYear = Number(referenceMatch[2]);
    events.push(
      buildEvent({
        eventType: "PCE",
        referenceYear,
        referenceMonth,
        sourcePeriodLabel: `${referenceMatch[1]} ${referenceYear}`,
        sourceReleaseName: "Personal Income and Outlays",
        releaseYear: year,
        releaseMonth: parseMonth(dateMatch[1]),
        releaseDay: Number(dateMatch[2]),
        releaseHour: time.hour,
        releaseMinute: time.minute,
        sourceAgency: "BEA",
        sourceUrl,
      }),
    );
  }

  if (events.length < 10) {
    throw new Error(`PCE 官方時程解析筆數異常：${events.length}`);
  }
  return events;
}

export function parseFedFomcSchedule(
  html: string,
  sourceUrl: string,
  minimumYear: number,
) {
  const headings = [...html.matchAll(/<a[^>]*>\s*([0-9]{4}) FOMC Meetings\s*<\/a>/gi)];
  const events: ParsedSourceEvent[] = [];

  for (let index = 0; index < headings.length; index += 1) {
    const year = Number(headings[index][1]);
    if (year < minimumYear || year > minimumYear + 1) continue;
    const start = headings[index].index ?? 0;
    const end = headings[index + 1]?.index ?? html.length;
    const section = html.slice(start, end);
    const meetings = section.matchAll(
      /fomc-meeting__month[^>]*>[\s\S]*?<strong>([A-Za-z]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)<\/div>/gi,
    );

    for (const meeting of meetings) {
      const month = parseMonth(meeting[1]);
      const dateText = decodeHtml(meeting[2]);
      const dateMatch = dateText.match(/^([0-9]{1,2})-([0-9]{1,2})(\*)?$/);
      if (!dateMatch) throw new Error(`FOMC 會議日期無法解析：${dateText}`);
      events.push(
        buildEvent({
          eventType: "FOMC",
          referenceYear: year,
          referenceMonth: month,
          sourcePeriodLabel: `${meeting[1]} ${dateText}`,
          sourceReleaseName: "FOMC Meeting",
          releaseYear: year,
          releaseMonth: month,
          releaseDay: Number(dateMatch[2]),
          releaseHour: 14,
          releaseMinute: 0,
          sourceAgency: "Federal Reserve",
          sourceUrl,
          hasProjections: Boolean(dateMatch[3]),
        }),
      );
    }
  }

  const currentYearCount = events.filter(
    (event) => event.referencePeriod.startsWith(`${minimumYear}-`),
  ).length;
  if (currentYearCount !== 8) {
    throw new Error(`FOMC ${minimumYear} 年解析筆數異常：${currentYearCount}`);
  }
  return events;
}

function hashEvents(events: ParsedSourceEvent[]) {
  const canonical = events
    .map((event) => ({
      eventKey: event.eventKey,
      releaseAt: event.releaseAt.toISOString(),
      sourcePeriodLabel: event.sourcePeriodLabel,
      hasProjections: event.hasProjections,
    }))
    .sort((a, b) => a.eventKey.localeCompare(b.eventKey));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function fetchOfficialPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "PortfolioTrack/1.0 economic-calendar-refresh",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} 回傳 HTTP ${response.status}`);
  }
  return response.text();
}

function currentNewYorkYear(now: Date) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SOURCE_TIME_ZONE,
      year: "numeric",
    }).format(now),
  );
}

export async function fetchOfficialUsEconomicEvents(now = new Date()) {
  const [cpiHtml, ppiHtml, pceHtml, fomcHtml] = await Promise.all([
    fetchOfficialPage(BLS_CPI_URL),
    fetchOfficialPage(BLS_PPI_URL),
    fetchOfficialPage(BEA_PCE_URL),
    fetchOfficialPage(FED_FOMC_URL),
  ]);
  const year = currentNewYorkYear(now);
  const sourceGroups = [
    parseBlsSchedule(cpiHtml, "CPI", BLS_CPI_URL),
    parseBlsSchedule(ppiHtml, "PPI", BLS_PPI_URL),
    parseBeaPceSchedule(pceHtml, BEA_PCE_URL, year),
    parseFedFomcSchedule(fomcHtml, FED_FOMC_URL, year),
  ];
  const fetchedAt = new Date();
  const events = sourceGroups.flatMap((group) => {
    const sourcePageHash = hashEvents(group);
    return group.map((event) =>
      parseUsEconomicEventInput({
        ...event,
        sourcePageHash,
        fetchedAt,
      }),
    );
  });
  const upcomingEvents = events
    .filter((event) => event.releaseAt.getTime() >= now.getTime())
    .sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
  const uniqueKeys = new Set(upcomingEvents.map((event) => event.eventKey));
  if (uniqueKeys.size !== upcomingEvents.length) {
    throw new Error("官方經濟時程包含重複 eventKey，停止更新");
  }
  if (upcomingEvents.length === 0) {
    throw new Error("官方經濟時程沒有未來事件，停止更新");
  }
  return upcomingEvents;
}
