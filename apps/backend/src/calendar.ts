import type { MarketStatus } from "@market-watch/shared-types";

const holidays = new Set(["2026-01-26", "2026-03-03", "2026-08-15", "2026-10-02", "2026-11-09"]);
const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function parts(date: Date) {
  const values = ist.formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
  return { date: values.date ?? "", hour: Number(values.hour), minute: Number(values.minute), weekday: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(date) };
}

export function getMarketStatus(date = new Date()): MarketStatus {
  const value = parts(date);
  const minutes = value.hour * 60 + value.minute;
  const weekday = value.weekday === "Sat" || value.weekday === "Sun";
  const open = !weekday && !holidays.has(value.date) && minutes >= 555 && minutes <= 930;
  return { open, session: open ? "OPEN" : "CLOSED", timestamp: date.toISOString() };
}

export function isMarketOpen(date = new Date()) { return getMarketStatus(date).open; }
