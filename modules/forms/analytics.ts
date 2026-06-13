export const formAnalyticsEvents = {
  start: "form_start",
  submit: "form_submit",
  view: "form_view"
} as const;

export const formFunnelEventNames = [formAnalyticsEvents.view, formAnalyticsEvents.start, formAnalyticsEvents.submit] as const;
