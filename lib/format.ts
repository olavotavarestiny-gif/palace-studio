export function luandaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function dateLabel(date: string, weekday = false) {
  return new Intl.DateTimeFormat("pt-AO", {
    timeZone: "Africa/Luanda",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(weekday ? { weekday: "long" as const } : {}),
  }).format(new Date(`${date}T12:00:00+01:00`));
}
export function timeLabel(date: string) {
  return new Intl.DateTimeFormat("pt-AO", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
export function money(value: number) {
  return `${new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 2 }).format(Number(value))} Kz`;
}
