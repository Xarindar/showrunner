export const clientStatusValues = [
  "active_order",
  "order_placed",
  "order_paid",
  "order_shipped",
  "appointment_booked",
  "appointment_paid",
  "deposit_paid",
  "session_booked",
  "session_paid"
] as const;

export type ClientStatusValue = (typeof clientStatusValues)[number];

export const defaultClientStatus: ClientStatusValue = "active_order";

const clientStatusLabels: Record<ClientStatusValue, string> = {
  active_order: "Active Order",
  order_placed: "Order Placed",
  order_paid: "Order Paid",
  order_shipped: "Order Shipped",
  appointment_booked: "Appointment Booked",
  appointment_paid: "Appointment Paid",
  deposit_paid: "Deposit Paid",
  session_booked: "Session booked",
  session_paid: "Session paid"
};

const legacyClientStatusMap: Record<string, ClientStatusValue> = {
  active: "active_order",
  inactive: "order_shipped",
  lead: "active_order",
  vip: "active_order"
};

export const clientStatusOptions = clientStatusValues.map((value) => ({
  label: clientStatusLabels[value],
  value
}));

function normalizeStatusKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeClientStatus(value?: string | null): ClientStatusValue | undefined {
  if (!value || typeof value !== "string") return undefined;
  const normalized = normalizeStatusKey(value);
  if ((clientStatusValues as readonly string[]).includes(normalized)) return normalized as ClientStatusValue;
  return legacyClientStatusMap[normalized];
}

export function parseClientStatus(value?: string | null): ClientStatusValue {
  return normalizeClientStatus(value) || defaultClientStatus;
}

export function clientStatusLabel(value: string, options = clientStatusOptions) {
  const normalized = normalizeClientStatus(value);
  const configured = options.find((option) => option.value === normalized);
  if (configured) return configured.label;
  if (normalized) return clientStatusLabels[normalized];

  return normalizeStatusKey(value)
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
