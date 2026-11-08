// Times shown to people (notifications, SMS) are in Kampala time, East Africa Time (UTC+3 all
// year). The API itself always speaks ISO 8601 UTC.
const FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Kampala',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * "Tue 10 Nov, 4:00 pm". Some ICU versions put a narrow no-break space before "pm", which SMS
 * gateways can garble, so every space becomes a plain one.
 */
export function kampalaTime(date: Date): string {
  return FORMAT.format(date).replace(/\s+/g, ' ');
}
