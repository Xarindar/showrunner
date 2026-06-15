const bookingWidgetSource = String.raw`
(function () {
  "use strict";

  if (window.customElements && window.customElements.get("showrunner-booking")) return;

  var scriptOrigin = (function () {
    try {
      var script = document.currentScript;
      return script && script.src ? new URL(script.src, window.location.href).origin : window.location.origin;
    } catch (_error) {
      return window.location.origin;
    }
  })();

  var tokenAttrs = {
    accentColor: ["accent-color", "primary-color"],
    backgroundColor: ["background-color"],
    borderColor: ["border-color"],
    mutedColor: ["muted-color"],
    radius: ["radius"],
    textColor: ["text-color"]
  };

  function localDateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function formatDateTime(value) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (_error) {
      return value;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function normalizeApiBase(value) {
    var base = value || scriptOrigin;
    return String(base).replace(/\/+$/, "");
  }

  function selectedOption(value, selected) {
    return String(value) === String(selected) ? " selected" : "";
  }

  function slotKey(slot) {
    var resourceIds = Array.isArray(slot.resourceIds) ? slot.resourceIds.join(",") : "";
    return [slot.startsAt || "", slot.staffId || "", resourceIds].join("|");
  }

  function readThemeAttribute(element) {
    var theme = {};
    var rawTheme = element.getAttribute("theme");
    if (rawTheme) {
      try {
        var parsed = JSON.parse(rawTheme);
        if (parsed && typeof parsed === "object") theme = parsed;
      } catch (_error) {}
    }

    Object.keys(tokenAttrs).forEach(function (key) {
      tokenAttrs[key].some(function (attr) {
        var value = element.getAttribute(attr);
        if (value) {
          theme[key] = value;
          return true;
        }
        return false;
      });
    });

    return theme;
  }

  function css() {
    return [
      ":host{display:block;color:inherit;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      ".sr-widget{--sr-accent:#0f766e;--sr-bg:#ffffff;--sr-border:#d5d9df;--sr-muted:#64748b;--sr-text:#111827;--sr-radius:8px;color:var(--sr-text);background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:var(--sr-radius);box-sizing:border-box;max-width:680px;overflow:hidden;}",
      ".sr-shell{display:grid;gap:18px;padding:18px;}",
      ".sr-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid var(--sr-border);padding:18px 18px 14px;}",
      ".sr-title{font-size:1.15rem;font-weight:700;line-height:1.25;margin:0;}",
      ".sr-subtitle{color:var(--sr-muted);font-size:.9rem;margin:4px 0 0;}",
      ".sr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}",
      ".sr-field{display:grid;gap:6px;min-width:0;}",
      ".sr-field-full{grid-column:1/-1;}",
      "label{font-size:.82rem;font-weight:650;}",
      "select,input,textarea{appearance:none;background:#fff;border:1px solid var(--sr-border);border-radius:6px;box-sizing:border-box;color:var(--sr-text);font:inherit;min-height:42px;padding:9px 10px;width:100%;}",
      "textarea{min-height:84px;resize:vertical;}",
      "input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid color-mix(in srgb,var(--sr-accent),transparent 35%);outline-offset:2px;}",
      ".sr-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;}",
      "button{border:0;border-radius:6px;cursor:pointer;font:inherit;min-height:40px;padding:9px 12px;}",
      ".sr-slot{background:#f8fafc;border:1px solid var(--sr-border);color:var(--sr-text);}",
      ".sr-slot[aria-pressed='true']{background:var(--sr-accent);border-color:var(--sr-accent);color:#fff;}",
      ".sr-primary{background:var(--sr-accent);color:#fff;font-weight:700;}",
      ".sr-primary:disabled,.sr-slot:disabled{cursor:not-allowed;opacity:.55;}",
      ".sr-empty,.sr-error,.sr-success{border-radius:6px;font-size:.92rem;padding:10px 12px;}",
      ".sr-empty{background:#f8fafc;color:var(--sr-muted);}",
      ".sr-error{background:#fef2f2;color:#991b1b;}",
      ".sr-success{background:#ecfdf5;color:#065f46;}",
      ".sr-footer{align-items:center;display:flex;gap:10px;justify-content:space-between;}",
      ".sr-busy{color:var(--sr-muted);font-size:.9rem;}",
      ".sr-honeypot{height:0;left:-10000px;opacity:0;overflow:hidden;position:absolute;width:0;}",
      "@media (max-width:560px){.sr-header{display:block}.sr-grid{grid-template-columns:1fr}.sr-shell{padding:14px}.sr-header{padding:14px}.sr-slots{grid-template-columns:repeat(2,minmax(0,1fr));}}"
    ].join("");
  }

  class ShowrunnerBooking extends HTMLElement {
    static get observedAttributes() {
      return [
        "publishable-key",
        "key",
        "api-base",
        "service-id",
        "service-slug",
        "staff-id",
        "theme",
        "accent-color",
        "primary-color",
        "background-color",
        "border-color",
        "muted-color",
        "text-color",
        "radius",
        "iframe-session-token"
      ];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.services = [];
      this.slots = [];
      this.selectedServiceId = "";
      this.selectedStaffId = "";
      this.selectedSlot = null;
      this.date = this.getAttribute("date") || localDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
      this.loading = false;
      this.submitting = false;
      this.error = "";
      this.success = null;
    }

    connectedCallback() {
      this.render();
      this.loadServices();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this.shadowRoot) return;
      if (name === "api-base" || name === "publishable-key" || name === "key" || name === "service-id" || name === "service-slug" || name === "staff-id") {
        this.loadServices();
        return;
      }
      this.applyTheme();
    }

    apiBase() {
      return normalizeApiBase(this.getAttribute("api-base"));
    }

    publishableKey() {
      return this.getAttribute("publishable-key") || this.getAttribute("key") || "";
    }

    iframeSessionToken() {
      return this.getAttribute("iframe-session-token") || "";
    }

    serviceDefault() {
      return this.getAttribute("service-id") || this.getAttribute("service-slug") || "";
    }

    staffDefault() {
      return this.getAttribute("staff-id") || "";
    }

    currentService() {
      var selected = this.selectedServiceId;
      return this.services.find(function (service) {
        return service.id === selected;
      }) || null;
    }

    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
    }

    setError(message) {
      this.error = message;
      this.dispatch("showrunner:error", { message: message });
    }

    async fetchJson(path, options) {
      var headers = {
        Accept: "application/json",
        "X-Showrunner-Key": this.publishableKey()
      };
      var iframeSessionToken = this.iframeSessionToken();
      if (iframeSessionToken) headers["X-Showrunner-Iframe-Session"] = iframeSessionToken;
      if (options && options.body) headers["Content-Type"] = "application/json";
      var response = await fetch(this.apiBase() + path, Object.assign({ headers: headers }, options || {}));
      var payload = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      return payload.data;
    }

    async loadServices() {
      if (!this.isConnected) return;
      if (!this.publishableKey()) {
        this.setError("Missing publishable key.");
        this.render();
        return;
      }

      this.loading = true;
      this.error = "";
      this.success = null;
      this.render();

      try {
        var data = await this.fetchJson("/api/public/v1/services");
        this.services = Array.isArray(data.services) ? data.services : [];
        var serviceDefault = this.serviceDefault();
        var defaultService = this.services.find(function (service) {
          return service.id === serviceDefault || service.slug === serviceDefault;
        }) || this.services[0] || null;
        this.selectedServiceId = defaultService ? defaultService.id : "";
        var staffDefault = this.staffDefault();
        if (defaultService && staffDefault && defaultService.staff.some(function (staff) { return staff.id === staffDefault; })) {
          this.selectedStaffId = staffDefault;
        } else {
          this.selectedStaffId = "";
        }
        await this.loadAvailability();
        this.dispatch("showrunner:ready", { services: this.services });
      } catch (error) {
        this.setError(error instanceof Error ? error.message : "Unable to load booking options.");
        this.slots = [];
        this.render();
      } finally {
        this.loading = false;
        this.render();
      }
    }

    async loadAvailability() {
      if (!this.selectedServiceId || !this.date) {
        this.slots = [];
        this.selectedSlot = null;
        return;
      }

      this.loading = true;
      this.error = "";
      this.selectedSlot = null;
      this.render();

      try {
        var params = new URLSearchParams({
          serviceId: this.selectedServiceId,
          date: this.date
        });
        if (this.selectedStaffId) params.set("staffId", this.selectedStaffId);
        var data = await this.fetchJson("/api/public/v1/availability?" + params.toString());
        this.slots = data && data.diagnostics && Array.isArray(data.diagnostics.slots) ? data.diagnostics.slots : [];
        this.dispatch("showrunner:availability", { serviceId: this.selectedServiceId, date: this.date, slots: this.slots });
      } catch (error) {
        this.setError(error instanceof Error ? error.message : "Unable to load available times.");
        this.slots = [];
      } finally {
        this.loading = false;
        this.render();
      }
    }

    async submitBooking(event) {
      event.preventDefault();
      if (!this.selectedSlot || this.submitting) return;
      var form = event.currentTarget;
      var service = this.currentService();
      var body = {
        serviceId: this.selectedServiceId,
        staffId: this.selectedSlot.staffId || this.selectedStaffId || undefined,
        resourceIds: this.selectedSlot.resourceIds || [],
        startsAt: this.selectedSlot.startsAt,
        customerName: form.customerName.value,
        customerEmail: form.customerEmail.value,
        customerPhone: form.customerPhone.value,
        notes: form.notes.value,
        intakeResponse: form.intakeResponse ? form.intakeResponse.value : "",
        policyAccepted: form.policyAccepted ? form.policyAccepted.checked : false,
        companyWebsite: form.companyWebsite.value
      };

      if (service && service.requirePolicy && service.policyText && !body.policyAccepted) {
        this.setError("Please accept the appointment policy before booking.");
        this.render();
        return;
      }

      this.submitting = true;
      this.error = "";
      this.render();

      try {
        var data = await this.fetchJson("/api/public/v1/bookings", {
          method: "POST",
          body: JSON.stringify(body)
        });
        this.success = data.booking || { ok: true };
        this.dispatch("showrunner:booking-created", { booking: data.booking });
      } catch (error) {
        this.setError(error instanceof Error ? error.message : "Unable to complete booking.");
      } finally {
        this.submitting = false;
        this.render();
      }
    }

    applyTheme() {
      var root = this.shadowRoot && this.shadowRoot.querySelector(".sr-widget");
      if (!root) return;
      var theme = readThemeAttribute(this);
      var variables = {
        accentColor: "--sr-accent",
        backgroundColor: "--sr-bg",
        borderColor: "--sr-border",
        mutedColor: "--sr-muted",
        radius: "--sr-radius",
        textColor: "--sr-text"
      };
      Object.keys(variables).forEach(function (key) {
        if (theme[key]) root.style.setProperty(variables[key], String(theme[key]));
      });
    }

    bindEvents() {
      var service = this.shadowRoot.querySelector("[data-service]");
      if (service) {
        service.addEventListener("change", (event) => {
          this.selectedServiceId = event.currentTarget.value;
          this.selectedStaffId = "";
          this.loadAvailability();
        });
      }

      var staff = this.shadowRoot.querySelector("[data-staff]");
      if (staff) {
        staff.addEventListener("change", (event) => {
          this.selectedStaffId = event.currentTarget.value;
          this.loadAvailability();
        });
      }

      var date = this.shadowRoot.querySelector("[data-date]");
      if (date) {
        date.addEventListener("change", (event) => {
          this.date = event.currentTarget.value;
          this.loadAvailability();
        });
      }

      this.shadowRoot.querySelectorAll("[data-slot]").forEach((button) => {
        button.addEventListener("click", () => {
          var key = button.getAttribute("data-slot");
          this.selectedSlot = this.slots.find(function (slot) { return slotKey(slot) === key; }) || null;
          this.render();
        });
      });

      var form = this.shadowRoot.querySelector("[data-booking-form]");
      if (form) form.addEventListener("submit", this.submitBooking.bind(this));
    }

    renderSelectors(service) {
      var serviceOptions = this.services.map((item) => {
        return "<option value='" + escapeHtml(item.id) + "'" + selectedOption(item.id, this.selectedServiceId) + ">" + escapeHtml(item.name) + "</option>";
      }).join("");
      var staffOptions = service && service.staff.length
        ? "<option value=''>Any available staff</option>" + service.staff.map((staff) => {
          return "<option value='" + escapeHtml(staff.id) + "'" + selectedOption(staff.id, this.selectedStaffId) + ">" + escapeHtml(staff.name) + "</option>";
        }).join("")
        : "";

      return "<div class='sr-grid'>" +
        "<div class='sr-field'><label for='sr-service'>Service</label><select id='sr-service' data-service>" + serviceOptions + "</select></div>" +
        "<div class='sr-field'><label for='sr-date'>Date</label><input id='sr-date' data-date type='date' value='" + escapeHtml(this.date) + "'></div>" +
        (staffOptions ? "<div class='sr-field sr-field-full'><label for='sr-staff'>Staff</label><select id='sr-staff' data-staff>" + staffOptions + "</select></div>" : "") +
      "</div>";
    }

    renderSlots() {
      if (this.loading) return "<div class='sr-empty'>Loading times...</div>";
      if (!this.selectedServiceId) return "<div class='sr-empty'>No services are available.</div>";
      if (!this.slots.length) return "<div class='sr-empty'>No times are available for this date.</div>";
      return "<div class='sr-slots' aria-label='Available times'>" + this.slots.map((slot) => {
        var key = slotKey(slot);
        var selected = this.selectedSlot && slotKey(this.selectedSlot) === key;
        var label = slot.label || formatDateTime(slot.startsAt);
        if (!this.selectedStaffId && slot.staffName) label += " - " + slot.staffName;
        return "<button class='sr-slot' type='button' data-slot='" + escapeHtml(key) + "' aria-pressed='" + (selected ? "true" : "false") + "'>" + escapeHtml(label) + "</button>";
      }).join("") + "</div>";
    }

    renderBookingForm(service) {
      if (!this.selectedSlot) return "";
      var intake = service && service.intakePrompt
        ? "<div class='sr-field sr-field-full'><label for='sr-intake'>" + escapeHtml(service.intakePrompt) + "</label><textarea id='sr-intake' name='intakeResponse'></textarea></div>"
        : "";
      var policy = service && service.policyText
        ? "<label class='sr-field sr-field-full'><span>Policy</span><span><input name='policyAccepted' type='checkbox' " + (service.requirePolicy ? "required" : "") + "> " + escapeHtml(service.policyText) + "</span></label>"
        : "";

      return "<form data-booking-form class='sr-grid'>" +
        "<div class='sr-field sr-field-full'><strong>" + escapeHtml(formatDateTime(this.selectedSlot.startsAt)) + "</strong></div>" +
        "<div class='sr-field'><label for='sr-name'>Name</label><input id='sr-name' name='customerName' autocomplete='name' required minlength='2'></div>" +
        "<div class='sr-field'><label for='sr-email'>Email</label><input id='sr-email' name='customerEmail' type='email' autocomplete='email' required></div>" +
        "<div class='sr-field sr-field-full'><label for='sr-phone'>Phone</label><input id='sr-phone' name='customerPhone' autocomplete='tel'></div>" +
        intake +
        "<div class='sr-field sr-field-full'><label for='sr-notes'>Notes</label><textarea id='sr-notes' name='notes'></textarea></div>" +
        policy +
        "<div class='sr-honeypot'><label>Company website <input name='companyWebsite' tabindex='-1' autocomplete='off'></label></div>" +
        "<div class='sr-footer sr-field-full'><span class='sr-busy'>" + (this.submitting ? "Booking..." : "") + "</span><button class='sr-primary' type='submit' " + (this.submitting ? "disabled" : "") + ">" + (service && service.requestOnly ? "Request appointment" : "Book appointment") + "</button></div>" +
      "</form>";
    }

    renderSuccess() {
      if (!this.success) return "";
      if (!this.success.id) return "<div class='sr-success'>Thanks. Your request was received.</div>";
      var status = this.success.status === "PENDING" ? "Your appointment request is in." : "Your appointment is booked.";
      var links = [
        this.success.manageUrl ? "<a href='" + escapeHtml(this.apiBase() + this.success.manageUrl) + "' target='_blank' rel='noopener'>Manage appointment</a>" : "",
        this.success.calendarUrl ? "<a href='" + escapeHtml(this.apiBase() + this.success.calendarUrl) + "' target='_blank' rel='noopener'>Add to calendar</a>" : ""
      ].filter(Boolean).join(" · ");
      return "<div class='sr-success'><strong>" + escapeHtml(status) + "</strong>" + (links ? "<div>" + links + "</div>" : "") + "</div>";
    }

    render() {
      var service = this.currentService();
      this.shadowRoot.innerHTML = "<style>" + css() + "</style>" +
        "<div class='sr-widget'>" +
          "<div class='sr-header'><div><h2 class='sr-title'>Book an appointment</h2>" +
          "<p class='sr-subtitle'>" + escapeHtml(service ? service.name : "Choose a service") + "</p></div></div>" +
          "<div class='sr-shell'>" +
            (this.error ? "<div class='sr-error' role='alert'>" + escapeHtml(this.error) + "</div>" : "") +
            this.renderSuccess() +
            (!this.success ? this.renderSelectors(service) + this.renderSlots() + this.renderBookingForm(service) : "") +
          "</div>" +
        "</div>";
      this.applyTheme();
      this.bindEvents();
    }
  }

  window.customElements.define("showrunner-booking", ShowrunnerBooking);
})();
`;

export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (asset !== "booking.js") return new Response("Not found", { status: 404 });

  return new Response(bookingWidgetSource, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
