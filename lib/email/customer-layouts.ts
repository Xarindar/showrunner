import type { EmailTokens } from "./types";

const requestBody = "Thanks, {{customerName}}.\n\nYour {{serviceName}} appointment request was received by {{businessName}}.\n\nTime: {{appointmentTime}}\n\nThe business will follow up if anything needs to change.";
const confirmationBody = "Hi {{customerName}},\n\nYour {{serviceName}} appointment with {{businessName}} is confirmed.\n\nTime: {{appointmentTime}}";
const galleryBody = "Hi {{customerName}},\n\nYour photos from {{sessionName}} are ready.\n\nView your private gallery: {{galleryUrl}}\n\nPlease keep this link private.\n\n{{businessName}}";

const bookingTokens = ["businessName", "customerName", "serviceName", "appointmentTime"];
const bookingOptional = ["customerEmail", "timezone", "appointmentTimezone", "appointmentLocation", "mapsUrl", "calendarUrl", "sessionPrepNote"];
const galleryTokens = ["customerName", "sessionName", "galleryUrl", "businessName"];
const brandTokens = ["emailLogoUrl", "galleryCoverUrl", "contactPhone", "contactEmail"];

export const customerEmailDefaults = {
  "booking.created.customer": {
    name: "Booking request received", purpose: "BOOKING_CONFIRMATION",
    subject: "{{businessName}} appointment request", previewText: "Your appointment request was received.",
    textBody: requestBody,
    htmlBody: "<p>Thanks, {{customerName}}.</p><p>Your {{serviceName}} appointment request was received by {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p>The business will follow up if anything needs to change.</p>",
    requiredTokens: bookingTokens, optionalTokens: [...bookingOptional, ...brandTokens]
  },
  "booking.confirmed.customer": {
    name: "Booking confirmed", purpose: "BOOKING_CONFIRMATION",
    subject: "Your {{businessName}} appointment is confirmed", previewText: "Your appointment is confirmed.",
    textBody: confirmationBody,
    htmlBody: "<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} is confirmed.</p><p><strong>Time:</strong> {{appointmentTime}}</p>",
    requiredTokens: bookingTokens, optionalTokens: [...bookingOptional, ...brandTokens]
  },
  "portfolio.session.ready": {
    name: "Session photos ready", purpose: "GALLERY_ACCESS",
    subject: "Your {{sessionName}} photos are ready", previewText: "Open your private gallery to see your photos.",
    textBody: galleryBody,
    htmlBody: '<p>Hi {{customerName}},</p><p>Your photos from {{sessionName}} are ready.</p><p><a href="{{galleryUrl}}">View your private gallery</a></p><p>Please keep this link private.</p><p>{{businessName}}</p>',
    requiredTokens: galleryTokens, optionalTokens: brandTokens
  }
} as const;

export function customerEmailDefault(key: string | null | undefined) {
  return key && Object.hasOwn(customerEmailDefaults, key) ? customerEmailDefaults[key as keyof typeof customerEmailDefaults] : undefined;
}

export function bookingCalendarLinks(input: { startsAt: Date; endsAt: Date; title: string; location: string; confirmed: boolean }) {
  const stamp = (value: Date) => value.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const maps = new URLSearchParams({ api: "1", query: input.location });
  const calendar = new URLSearchParams({ action: "TEMPLATE", text: input.title, dates: `${stamp(input.startsAt)}/${stamp(input.endsAt)}` });
  if (input.location) calendar.set("location", input.location);
  return {
    mapsUrl: input.location ? `https://www.google.com/maps/search/?${maps}` : "",
    calendarUrl: input.confirmed ? `https://calendar.google.com/calendar/render?${calendar}` : ""
  };
}

const paragraph = "margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.55";
const accent = "#713a3c";

function button(label: string, urlToken: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background-color:${accent};border-radius:6px"><a href="{{${urlToken}}}" style="display:inline-block;padding:14px 24px;color:#fffdf9;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">${label}</a></td></tr></table>`;
}

function contactLink(label: string, url: string, showIcon: boolean, iconToken: string) {
  return `<td align="center" valign="top" style="padding:0 16px"><a href="${url}" style="color:${accent};font-family:Arial,sans-serif;font-size:14px;text-decoration:underline">${showIcon ? `<img src="{{${iconToken}}}" width="44" height="44" alt="" style="display:block;margin:0 auto 6px">` : ""}${label}</a></td>`;
}

export function customerEmailLayout(key: string, tokens: EmailTokens) {
  const gallery = key === "portfolio.session.ready";
  const confirmed = key === "booking.confirmed.customer";
  const heading = gallery ? "Your gallery is ready" : confirmed ? "Your appointment is confirmed" : "We received your appointment request";
  const description = gallery ? "Your photos from {{sessionName}} are ready to view." :
    confirmed ? "Your {{serviceName}} appointment with {{businessName}} is confirmed." :
    "We received your request for {{serviceName}} with {{businessName}}. We’ll follow up to confirm.";
  const header = tokens.emailLogoUrl
    ? '<img src="{{emailLogoUrl}}" width="180" alt="{{businessName}}" style="width:180px;max-width:100%;height:auto">'
    : `<span style="font-family:Georgia,serif;font-size:27px;color:${accent}">{{businessName}}</span>`;
  const phone = String(tokens.contactPhone || "").replace(/[^\d+]/g, "");
  const contacts = [
    /^\+?\d{7,15}$/.test(phone) ? contactLink("Call", `tel:${phone}`, Boolean(tokens.phoneIconUrl), "phoneIconUrl") : "",
    /^[^\s@?<>]+@[^\s@?<>]+\.[^\s@?<>]+$/.test(String(tokens.contactEmail || "")) ?
      contactLink("Email", "mailto:{{contactEmail}}", Boolean(tokens.emailIconUrl), "emailIconUrl") : ""
  ].join("");
  const maps = tokens.mapsUrl
    ? `<a href="{{mapsUrl}}" style="color:${accent};text-decoration:underline">{{appointmentLocation}}</a>`
    : "{{appointmentLocation}}";
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff2f0">
    <tr><td style="padding:16px 20px"><p style="margin:0 0 4px;color:${accent};font-size:13px;font-weight:bold">When</p>{{appointmentTime}}${tokens.appointmentTimezone ? " {{appointmentTimezone}}" : ""}</td></tr>
    ${tokens.appointmentLocation ? `<tr><td style="padding:0 20px 16px"><p style="margin:0 0 4px;color:${accent};font-size:13px;font-weight:bold">Where</p>${maps}</td></tr>` : ""}
  </table>`;
  const body = gallery
    ? `${button("View your gallery", "galleryUrl")}
      ${tokens.galleryCoverUrl ? '<img src="{{galleryCoverUrl}}" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border-radius:6px;margin:0 0 18px">' : ""}
      <p style="${paragraph}">Open the gallery to review your photos. Any available downloads will appear there.</p>
      <p style="${paragraph}">Please keep this link private. If you have trouble opening the gallery, reply to this email.</p>`
    : `${details}${confirmed && tokens.calendarUrl ? button("Add to calendar", "calendarUrl") : ""}
      ${confirmed && tokens.sessionPrepNote ? `<p style="${paragraph}"><strong>Before your appointment</strong><br>{{sessionPrepNote}}</p>` : ""}
      <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:1.55">Need to make a change? Reply to this email.</p>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2efea;color:#211f1d">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
        <tr><td align="center" style="padding:0 0 20px">${header}</td></tr>
        <tr><td style="padding:28px;background-color:#fffdf9;border:1px solid #dfd8d0;border-radius:14px;font-family:Arial,sans-serif;font-size:16px;line-height:1.5">
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:30px;font-weight:normal;line-height:1.15">${heading}</h1>
          <p style="${paragraph}">Hi {{customerName}},</p>
          <p style="${paragraph}">${description}</p>${body}
        </td></tr>
        ${contacts ? `<tr><td align="center" style="padding:20px 0 0"><table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>${contacts}</tr></table></td></tr>` : ""}
      </table>
    </td></tr>
  </table>`;
}
