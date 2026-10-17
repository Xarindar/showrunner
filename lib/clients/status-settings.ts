import { clientStatusOptions, defaultClientStatus, normalizeClientStatus, type ClientStatusValue } from "./status";

export type ClientStatusSettings = { options: Array<{ value: ClientStatusValue; label: string }>; defaultStatus: ClientStatusValue };

export function normalizeClientStatusSettings(value: unknown): ClientStatusSettings {
  const stored = value as Partial<ClientStatusSettings> | null;
  const options = Array.isArray(stored?.options) ? stored.options.filter((option, index, all) =>
    option && normalizeClientStatus(option.value) === option.value && typeof option.label === "string" &&
    option.label.trim().length > 0 && option.label.length <= 60 && all.findIndex((item) => item && item.value === option.value) === index
  ).map((option) => ({ value: option.value, label: option.label.trim() })) : [];
  if (!options.length) return { options: clientStatusOptions.filter((option) => !option.value.startsWith("session_")), defaultStatus: defaultClientStatus };
  return { options, defaultStatus: options.find((option) => option.value === stored?.defaultStatus)?.value || options[0].value };
}

export function clientStatusSettingsFromForm(formData: FormData): ClientStatusSettings {
  const enabled = formData.getAll("clientStatusEnabled").map(String);
  const options = clientStatusOptions.filter((option) => enabled.includes(option.value)).map((option) => ({
    value: option.value, label: String(formData.get(`clientStatusLabel_${option.value}`) || "").trim()
  }));
  if (!options.length || options.some((option) => !option.label || option.label.length > 60)) throw new Error("Enable at least one client status and give each a label of 1–60 characters.");
  const defaultStatus = String(formData.get("clientDefaultStatus"));
  if (!options.some((option) => option.value === defaultStatus)) throw new Error("Choose an enabled client status as the default.");
  return normalizeClientStatusSettings({ options, defaultStatus });
}
