export type NotificationTone = "success" | "danger" | "neutral";

export function notificationDuration(tone: NotificationTone, message: string) {
  return tone === "danger" ? null : Math.max(5000, Math.ceil(message.length / 12) * 1000);
}

// Consume only the originating flash flag; keep filters, selection and fragments.
export function consumeNotification(href: string, key: string) {
  const url = new URL(href);
  if (!url.searchParams.has(key)) return null;
  url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
