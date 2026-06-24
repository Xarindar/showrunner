export type VipLoyaltyUnit = "months" | "years";
export type VipSpendWindow = "lifetime" | "12-months" | "24-months";

export type ClientVipSettings = {
  appointments: {
    enabled: boolean;
    threshold: number;
  };
  badgesEnabled: boolean;
  enabled: boolean;
  loyalty: {
    enabled: boolean;
    length: number;
    unit: VipLoyaltyUnit;
  };
  paidRevenueEnabled: boolean;
  spend: {
    enabled: boolean;
    thresholdCents: number;
    window: VipSpendWindow;
  };
};

export const defaultClientVipSettings: ClientVipSettings = {
  appointments: {
    enabled: true,
    threshold: 8
  },
  badgesEnabled: true,
  enabled: true,
  loyalty: {
    enabled: false,
    length: 12,
    unit: "months"
  },
  paidRevenueEnabled: true,
  spend: {
    enabled: true,
    thresholdCents: 250_000,
    window: "lifetime"
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInt(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

function positiveCents(value: unknown, fallback: number) {
  return positiveInt(value, fallback);
}

function loyaltyUnit(value: unknown): VipLoyaltyUnit {
  return value === "years" ? "years" : "months";
}

function spendWindow(value: unknown): VipSpendWindow {
  if (value === "12-months" || value === "24-months") return value;
  return "lifetime";
}

export function normalizeClientVipSettings(value: unknown): ClientVipSettings {
  if (!isRecord(value)) return defaultClientVipSettings;

  const spend = isRecord(value.spend) ? value.spend : {};
  const appointments = isRecord(value.appointments) ? value.appointments : {};
  const loyalty = isRecord(value.loyalty) ? value.loyalty : {};

  return {
    appointments: {
      enabled: booleanValue(appointments.enabled, defaultClientVipSettings.appointments.enabled),
      threshold: positiveInt(appointments.threshold, defaultClientVipSettings.appointments.threshold)
    },
    badgesEnabled: booleanValue(value.badgesEnabled, defaultClientVipSettings.badgesEnabled),
    enabled: booleanValue(value.enabled, defaultClientVipSettings.enabled),
    loyalty: {
      enabled: booleanValue(loyalty.enabled, defaultClientVipSettings.loyalty.enabled),
      length: positiveInt(loyalty.length, defaultClientVipSettings.loyalty.length),
      unit: loyaltyUnit(loyalty.unit)
    },
    paidRevenueEnabled: booleanValue(value.paidRevenueEnabled, defaultClientVipSettings.paidRevenueEnabled),
    spend: {
      enabled: booleanValue(spend.enabled, defaultClientVipSettings.spend.enabled),
      thresholdCents: positiveCents(spend.thresholdCents, defaultClientVipSettings.spend.thresholdCents),
      window: spendWindow(spend.window)
    }
  };
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function dollarsToCents(value: FormDataEntryValue | null, fallback: number) {
  const numeric = Number(String(value || "").replace(/[$,]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : fallback;
}

export function clientVipSettingsFromFormData(formData: FormData): ClientVipSettings {
  return normalizeClientVipSettings({
    appointments: {
      enabled: checked(formData, "vipAppointmentCountEnabled"),
      threshold: positiveInt(formData.get("vipAppointmentCount"), defaultClientVipSettings.appointments.threshold)
    },
    badgesEnabled: checked(formData, "vipBadgesEnabled"),
    enabled: checked(formData, "vipEnabled"),
    loyalty: {
      enabled: checked(formData, "vipLoyaltyEnabled"),
      length: positiveInt(formData.get("vipLoyaltyLength"), defaultClientVipSettings.loyalty.length),
      unit: formData.get("vipLoyaltyUnit")
    },
    paidRevenueEnabled: checked(formData, "vipPaidRevenueEnabled"),
    spend: {
      enabled: checked(formData, "vipSpendEnabled"),
      thresholdCents: dollarsToCents(formData.get("vipSpendAmount"), defaultClientVipSettings.spend.thresholdCents),
      window: formData.get("vipSpendWindow")
    }
  });
}

export function centsToDollarsInput(cents: number) {
  return String(Math.round(cents / 100));
}
