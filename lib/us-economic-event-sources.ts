import { createHash } from "node:crypto";

import {
  parseUsEconomicEventInput,
  type UsEconomicEventInput,
  type UsEconomicEventType,
} from "@/models/UsEconomicEvent";

const BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";
const BLS_PPI_URL = "https://www.bls.gov/schedule/news_release/ppi.htm";
const BLS_CALENDAR_URL =
  "https://www.bls.gov/schedule/news_release/bls.ics";
const BEA_PCE_URL = "https://www.bea.gov/news/schedule/full";
const FED_FOMC_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const SOURCE_TIME_ZONE = "America/New_York" as const;
const OFFICIAL_FETCH_USER_AGENT =
  "PortfolioTrack/1.0 (+https://portfolio-track-jade.vercel.app)";

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

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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

function previousMonth(year: number, month: number) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

export function parseBlsCalendar(ics: string) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "").replace(/\r/g, "");
  const groups: Record<"CPI" | "PPI", ParsedSourceEvent[]> = {
    CPI: [],
    PPI: [],
  };

  for (const match of unfolded.matchAll(
    /BEGIN:VEVENT\n([\s\S]*?)\nEND:VEVENT/g,
  )) {
    const summary = match[1].match(/^SUMMARY:(.+)$/m)?.[1]?.trim();
    const eventType =
      summary === "Consumer Price Index"
        ? "CPI"
        : summary === "Producer Price Index"
          ? "PPI"
          : null;
    if (!eventType) continue;

    const dateTime = match[1].match(
      /^DTSTART(?:;TZID=(?:US-Eastern|America\/New_York))?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:\d{2})?$/m,
    );
    if (!dateTime) {
      throw new Error(`${eventType} 官方 iCalendar 發布時間無法解析`);
    }

    const releaseYear = Number(dateTime[1]);
    const releaseMonth = Number(dateTime[2]);
    const reference = previousMonth(releaseYear, releaseMonth);
    const referenceMonthName = FULL_MONTH_NAMES[reference.month - 1];
    if (!referenceMonthName) {
      throw new Error(`${eventType} 官方 iCalendar 參考月份不正確`);
    }
    const sourcePeriodLabel = `${referenceMonthName} ${reference.year}`;

    groups[eventType].push(
      buildEvent({
        eventType,
        referenceYear: reference.year,
        referenceMonth: reference.month,
        sourcePeriodLabel,
        sourceReleaseName:
          eventType === "CPI" ? "Consumer Price Index" : "Producer Price Index",
        releaseYear,
        releaseMonth,
        releaseDay: Number(dateTime[3]),
        releaseHour: Number(dateTime[4]),
        releaseMinute: Number(dateTime[5]),
        sourceAgency: "BLS",
        sourceUrl: eventType === "CPI" ? BLS_CPI_URL : BLS_PPI_URL,
      }),
    );
  }

  for (const eventType of ["CPI", "PPI"] as const) {
    if (groups[eventType].length < 10) {
      throw new Error(
        `${eventType} 官方 iCalendar 解析筆數異常：${groups[eventType].length}`,
      );
    }
  }

  return groups;
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

async function fetchOfficialPage(
  url: string,
  accept = "text/html,application/xhtml+xml",
) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: accept,
      "User-Agent": OFFICIAL_FETCH_USER_AGENT,
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
  const [blsCalendar, pceHtml, fomcHtml] = await Promise.all([
    fetchOfficialPage(
      BLS_CALENDAR_URL,
      "text/calendar,text/plain;q=0.9,*/*;q=0.8",
    ),
    fetchOfficialPage(BEA_PCE_URL),
    fetchOfficialPage(FED_FOMC_URL),
  ]);
  const year = currentNewYorkYear(now);
  const blsGroups = parseBlsCalendar(blsCalendar);
  const sourceGroups = [
    blsGroups.CPI,
    blsGroups.PPI,
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
