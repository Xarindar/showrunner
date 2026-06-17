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
      ":host{display:block;color:inherit;font-family:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);}",
      ".sr-widget{--sr-accent:var(--color-brand,#0f766e);--sr-bg:var(--color-surface,#ffffff);--sr-border:var(--color-border,#d5d9df);--sr-muted:var(--color-muted,#64748b);--sr-text:var(--color-text,#111827);--sr-radius:var(--radius-card,8px);--sr-space-2:var(--space-2,8px);--sr-space-3:var(--space-3,12px);--sr-space-4:var(--space-4,16px);--sr-space-5:var(--space-5,20px);--sr-control:var(--control-height,42px);--sr-row:var(--row-height,58px);color:var(--sr-text);background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:var(--sr-radius);box-sizing:border-box;max-width:680px;min-height:420px;overflow:hidden;}",
      ".sr-shell{display:grid;gap:var(--sr-space-5);padding:var(--sr-space-5);}",
      ".sr-header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sr-space-3);border-bottom:1px solid var(--sr-border);min-height:86px;padding:var(--sr-space-5) var(--sr-space-5) var(--sr-space-4);}",
      ".sr-title{font-size:1.15rem;font-weight:700;line-height:1.25;margin:0;}",
      ".sr-subtitle{color:var(--sr-muted);font-size:.9rem;margin:4px 0 0;}",
      ".sr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sr-space-3);}",
      ".sr-field{display:grid;gap:6px;min-width:0;}",
      ".sr-field-full{grid-column:1/-1;}",
      "label{font-size:.82rem;font-weight:650;}",
      "select,input,textarea{appearance:none;background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:calc(var(--sr-radius) - 2px);box-sizing:border-box;color:var(--sr-text);font:inherit;min-height:var(--sr-control);padding:9px 10px;width:100%;}",
      "textarea{min-height:96px;resize:vertical;}",
      "input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid color-mix(in srgb,var(--sr-accent),transparent 35%);outline-offset:2px;}",
      ".sr-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:var(--sr-space-2);}",
      "button{border:0;border-radius:calc(var(--sr-radius) - 2px);cursor:pointer;font:inherit;min-height:var(--sr-control);padding:9px 12px;}",
      ".sr-slot{background:color-mix(in srgb,var(--sr-bg) 86%,var(--sr-accent) 14%);border:1px solid var(--sr-border);color:var(--sr-text);min-height:var(--sr-row);}",
      ".sr-slot[aria-pressed='true']{background:var(--sr-accent);border-color:var(--sr-accent);color:#fff;}",
      ".sr-primary{background:var(--sr-accent);color:#fff;font-weight:700;}",
      ".sr-primary:disabled,.sr-slot:disabled{cursor:not-allowed;opacity:.55;}",
      ".sr-empty,.sr-error,.sr-success{border-radius:calc(var(--sr-radius) - 2px);font-size:.92rem;min-height:72px;padding:10px 12px;}",
      ".sr-empty{background:color-mix(in srgb,var(--sr-bg) 88%,var(--sr-border));color:var(--sr-muted);}",
      ".sr-error{background:#fef2f2;color:#991b1b;}",
      ".sr-success{background:#ecfdf5;color:#065f46;}",
      ".sr-footer{align-items:center;display:flex;gap:var(--sr-space-3);justify-content:space-between;min-height:var(--sr-control);}",
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

const buyButtonWidgetSource = String.raw`
(function () {
  "use strict";
  if (window.customElements && window.customElements.get("showrunner-buy-button")) return;

  var scriptOrigin = (function () {
    try {
      var script = document.currentScript;
      return script && script.src ? new URL(script.src, window.location.href).origin : window.location.origin;
    } catch (_error) {
      return window.location.origin;
    }
  })();

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function normalizeApiBase(value) {
    return String(value || scriptOrigin).replace(/\/+$/, "");
  }
  var tokenAttrs = {
    accentColor: ["accent-color", "primary-color"],
    backgroundColor: ["background-color"],
    borderColor: ["border-color"],
    mutedColor: ["muted-color"],
    radius: ["radius"],
    textColor: ["text-color"]
  };
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
  function applyTheme(element, root) {
    var theme = readThemeAttribute(element);
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

  function css() {
    return [
      ":host{display:block;font-family:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);}",
      ".sr-card{--sr-accent:var(--color-brand,#0f766e);--sr-bg:var(--color-surface,#ffffff);--sr-border:var(--color-border,#d5d9df);--sr-muted:var(--color-muted,#64748b);--sr-text:var(--color-text,#111827);--sr-radius:var(--radius-card,8px);--sr-space-3:var(--space-3,12px);--sr-space-4:var(--space-4,16px);--sr-control:var(--control-height,42px);background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:var(--sr-radius);color:var(--sr-text);box-sizing:border-box;display:grid;gap:var(--sr-space-3);max-width:420px;min-height:236px;padding:var(--sr-space-4);}",
      ".sr-row{display:grid;gap:6px}.sr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-size:.82rem;font-weight:650}input{background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:calc(var(--sr-radius) - 2px);box-sizing:border-box;color:var(--sr-text);font:inherit;min-height:var(--sr-control);padding:8px 10px;width:100%;}",
      "button{background:var(--sr-accent);border:0;border-radius:calc(var(--sr-radius) - 2px);color:#fff;cursor:pointer;font:inherit;font-weight:700;min-height:var(--sr-control);padding:9px 12px;}button:disabled{cursor:not-allowed;opacity:.6}.sr-error{background:color-mix(in srgb,var(--color-danger,#991b1b) 8%,var(--sr-bg));border-radius:calc(var(--sr-radius) - 2px);color:var(--color-danger,#991b1b);min-height:42px;padding:10px}.sr-note{color:var(--sr-muted);font-size:.9rem;min-height:22px}"
    ].join("");
  }

  class ShowrunnerBuyButton extends HTMLElement {
    static get observedAttributes() {
      return ["publishable-key", "key", "api-base", "product-id", "product-slug", "variant-id", "quantity", "label", "theme", "accent-color", "primary-color", "background-color", "border-color", "muted-color", "text-color", "radius"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.error = "";
      this.loading = false;
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      if (this.shadowRoot) this.render();
    }

    apiBase() {
      return normalizeApiBase(this.getAttribute("api-base"));
    }

    publishableKey() {
      return this.getAttribute("publishable-key") || this.getAttribute("key") || "";
    }

    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
    }

    async submit(event) {
      event.preventDefault();
      if (this.loading) return;
      if (!this.publishableKey()) {
        this.error = "Missing publishable key.";
        this.dispatch("showrunner:error", { message: this.error });
        this.render();
        return;
      }
      var form = event.currentTarget;
      var body = {
        customerEmail: form.customerEmail.value,
        customerName: form.customerName.value,
        productId: this.getAttribute("product-id") || undefined,
        productSlug: this.getAttribute("product-slug") || undefined,
        quantity: Number(this.getAttribute("quantity") || "1"),
        variantId: this.getAttribute("variant-id") || undefined
      };
      this.loading = true;
      this.error = "";
      this.render();
      try {
        var response = await fetch(this.apiBase() + "/api/public/v1/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Showrunner-Key": this.publishableKey()
          },
          body: JSON.stringify(body)
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || "Checkout failed.");
        var checkout = payload.data && payload.data.checkout ? payload.data.checkout : {};
        this.dispatch("showrunner:checkout-created", { checkout: checkout });
        if (checkout.checkoutUrl) {
          window.location.assign(checkout.checkoutUrl);
        } else {
          this.error = "Order complete.";
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Checkout failed.";
        this.dispatch("showrunner:error", { message: this.error });
      } finally {
        this.loading = false;
        this.render();
      }
    }

    render() {
      this.shadowRoot.innerHTML = "<style>" + css() + "</style><form class='sr-card'>" +
        (this.error ? "<div class='sr-error'>" + escapeHtml(this.error) + "</div>" : "") +
        "<div class='sr-grid'><div class='sr-row'><label for='sr-name'>Name</label><input id='sr-name' name='customerName' autocomplete='name' required minlength='2'></div>" +
        "<div class='sr-row'><label for='sr-email'>Email</label><input id='sr-email' name='customerEmail' type='email' autocomplete='email' required></div></div>" +
        "<button type='submit'" + (this.loading ? " disabled" : "") + ">" + escapeHtml(this.loading ? "Preparing checkout..." : this.getAttribute("label") || "Buy now") + "</button>" +
        "<div class='sr-note'>Secure hosted checkout. Card details are collected by the payment provider.</div>" +
      "</form>";
      applyTheme(this, this.shadowRoot.querySelector(".sr-card"));
      this.shadowRoot.querySelector("form").addEventListener("submit", this.submit.bind(this));
    }
  }

  window.customElements.define("showrunner-buy-button", ShowrunnerBuyButton);
})();
`;

const galleryWidgetSource = String.raw`
(function () {
  "use strict";
  if (window.customElements && window.customElements.get("showrunner-gallery")) return;
  var scriptOrigin = (function () {
    try {
      var script = document.currentScript;
      return script && script.src ? new URL(script.src, window.location.href).origin : window.location.origin;
    } catch (_error) {
      return window.location.origin;
    }
  })();
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function normalizeApiBase(value) {
    return String(value || scriptOrigin).replace(/\/+$/, "");
  }
  var tokenAttrs = {
    accentColor: ["accent-color", "primary-color"],
    backgroundColor: ["background-color"],
    borderColor: ["border-color"],
    mutedColor: ["muted-color"],
    radius: ["radius"],
    textColor: ["text-color"]
  };
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
  function applyTheme(element, root) {
    var theme = readThemeAttribute(element);
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
  function css() {
    return [
      ":host{display:block;font-family:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);}",
      ".sr-gallery{--sr-accent:var(--color-brand,#0f766e);--sr-bg:var(--color-surface,#ffffff);--sr-border:var(--color-border,#d5d9df);--sr-muted:var(--color-muted,#64748b);--sr-text:var(--color-text,#111827);--sr-radius:var(--radius-card,8px);--sr-space-3:var(--space-3,12px);color:var(--sr-text);display:grid;gap:var(--sr-space-3);min-height:160px}.sr-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));}.sr-item{background:color-mix(in srgb,var(--sr-bg) 88%,var(--sr-border));border:1px solid var(--sr-border);border-radius:var(--sr-radius);overflow:hidden}.sr-item img{aspect-ratio:4/3;display:block;object-fit:cover;width:100%;}.sr-body{padding:10px}.sr-title{font-weight:700;margin:0}.sr-caption{color:var(--sr-muted);font-size:.9rem;margin:4px 0 0}.sr-error,.sr-empty{border-radius:calc(var(--sr-radius) - 2px);min-height:48px;padding:10px}.sr-error{background:color-mix(in srgb,var(--color-danger,#991b1b) 8%,var(--sr-bg));color:var(--color-danger,#991b1b)}.sr-empty{background:color-mix(in srgb,var(--sr-bg) 88%,var(--sr-border));color:var(--sr-muted)}"
    ].join("");
  }
  class ShowrunnerGallery extends HTMLElement {
    static get observedAttributes() {
      return ["publishable-key", "key", "api-base", "slug", "access-token", "theme", "accent-color", "primary-color", "background-color", "border-color", "muted-color", "text-color", "radius"];
    }
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.gallery = null;
      this.error = "";
      this.loading = false;
    }
    connectedCallback() {
      this.render();
      this.load();
    }
    attributeChangedCallback(oldName, oldValue, newValue) {
      if (oldValue !== newValue && this.isConnected) this.load();
    }
    apiBase() {
      return normalizeApiBase(this.getAttribute("api-base"));
    }
    publishableKey() {
      return this.getAttribute("publishable-key") || this.getAttribute("key") || "";
    }
    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
    }
    async load() {
      var slug = this.getAttribute("slug") || "";
      if (!this.publishableKey() || !slug) {
        this.error = "Missing gallery configuration.";
        this.render();
        return;
      }
      this.loading = true;
      this.error = "";
      this.render();
      try {
        var params = new URLSearchParams();
        var accessToken = this.getAttribute("access-token") || "";
        if (accessToken) params.set("access", accessToken);
        var response = await fetch(this.apiBase() + "/api/public/v1/galleries/" + encodeURIComponent(slug) + (params.toString() ? "?" + params.toString() : ""), {
          headers: { "X-Showrunner-Key": this.publishableKey() }
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || "Gallery failed to load.");
        this.gallery = payload.data && payload.data.gallery ? payload.data.gallery : null;
        this.dispatch("showrunner:gallery-ready", { gallery: this.gallery });
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Gallery failed to load.";
        this.dispatch("showrunner:error", { message: this.error });
      } finally {
        this.loading = false;
        this.render();
      }
    }
    render() {
      var items = this.gallery && Array.isArray(this.gallery.items) ? this.gallery.items : [];
      this.shadowRoot.innerHTML = "<style>" + css() + "</style><div class='sr-gallery'>" +
        (this.error ? "<div class='sr-error'>" + escapeHtml(this.error) + "</div>" : "") +
        (this.loading ? "<div class='sr-empty'>Loading gallery...</div>" : "") +
        (!this.loading && this.gallery ? "<div><h2 class='sr-title'>" + escapeHtml(this.gallery.title) + "</h2>" + (this.gallery.description ? "<p class='sr-caption'>" + escapeHtml(this.gallery.description) + "</p>" : "") + "</div>" : "") +
        (!this.loading && this.gallery && items.length ? "<div class='sr-grid'>" + items.map(function (item) {
          return "<article class='sr-item'><img src='" + escapeHtml(item.imageUrl || "") + "' alt='" + escapeHtml(item.altText || item.title || item.caption || "Gallery image") + "' loading='lazy'><div class='sr-body'>" +
            (item.title ? "<p class='sr-title'>" + escapeHtml(item.title) + "</p>" : "") +
            (item.caption ? "<p class='sr-caption'>" + escapeHtml(item.caption) + "</p>" : "") +
          "</div></article>";
        }).join("") + "</div>" : "") +
        (!this.loading && this.gallery && !items.length ? "<div class='sr-empty'>No gallery images are available.</div>" : "") +
      "</div>";
      applyTheme(this, this.shadowRoot.querySelector(".sr-gallery"));
    }
  }
  window.customElements.define("showrunner-gallery", ShowrunnerGallery);
})();
`;

const formWidgetSource = String.raw`
(function () {
  "use strict";
  if (window.customElements && window.customElements.get("showrunner-form")) return;
  var scriptOrigin = (function () {
    try {
      var script = document.currentScript;
      return script && script.src ? new URL(script.src, window.location.href).origin : window.location.origin;
    } catch (_error) {
      return window.location.origin;
    }
  })();
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function cssIdent(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }
  function normalizeApiBase(value) {
    return String(value || scriptOrigin).replace(/\/+$/, "");
  }
  var tokenAttrs = {
    accentColor: ["accent-color", "primary-color"],
    backgroundColor: ["background-color"],
    borderColor: ["border-color"],
    mutedColor: ["muted-color"],
    radius: ["radius"],
    textColor: ["text-color"]
  };
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
  function applyTheme(element, root) {
    var theme = readThemeAttribute(element);
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
  function css() {
    return [
      ":host{display:block;font-family:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);}",
      ".sr-form{--sr-accent:var(--color-brand,#0f766e);--sr-bg:var(--color-surface,#ffffff);--sr-border:var(--color-border,#d5d9df);--sr-muted:var(--color-muted,#64748b);--sr-panel:var(--color-surface-sunken,#f8fafc);--sr-text:var(--color-text,#111827);--sr-radius:var(--radius-card,8px);--sr-space-2:var(--space-2,8px);--sr-space-3:var(--space-3,12px);--sr-space-4:var(--space-4,16px);--sr-control:var(--control-height,42px);background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:var(--sr-radius);color:var(--sr-text);display:grid;gap:var(--sr-space-3);max-width:680px;min-height:280px;padding:var(--sr-space-4)}.sr-field{display:grid;gap:6px}label{font-size:.82rem;font-weight:650}fieldset{border:0;margin:0;padding:0}legend{color:var(--sr-muted);font-size:.86rem;font-weight:700;margin-bottom:6px}input,select,textarea{background:var(--sr-bg);border:1px solid var(--sr-border);border-radius:calc(var(--sr-radius) - 2px);box-sizing:border-box;color:var(--sr-text);font:inherit;min-height:var(--sr-control);padding:8px 10px;width:100%;}input[type=checkbox],input[type=radio]{min-height:auto;padding:0;width:auto}textarea{min-height:90px}.sr-error,.sr-success,.sr-empty{border-radius:calc(var(--sr-radius) - 2px);min-height:48px;padding:10px}.sr-error{background:color-mix(in srgb,var(--color-danger,#991b1b) 8%,var(--sr-bg));color:var(--color-danger,#991b1b)}.sr-success{background:color-mix(in srgb,var(--color-success,#065f46) 9%,var(--sr-bg));color:var(--color-success,#065f46)}.sr-empty{background:var(--sr-panel);color:var(--sr-muted)}button{background:var(--sr-accent);border:0;border-radius:calc(var(--sr-radius) - 2px);color:#fff;cursor:pointer;font:inherit;font-weight:700;min-height:var(--sr-control);padding:9px 12px}button[disabled]{cursor:not-allowed;opacity:.6}.sr-secondary{background:var(--sr-panel);color:var(--sr-text)}.sr-honeypot{height:0;left:-10000px;opacity:0;overflow:hidden;position:absolute;width:0}.sr-actions{align-items:center;display:flex;flex-wrap:wrap;gap:var(--sr-space-2);justify-content:space-between}.sr-step{background:var(--sr-panel);border-radius:999px;color:var(--sr-muted);font-size:.78rem;font-weight:750;padding:4px 9px}.sr-choice{align-items:center;display:flex;gap:8px}.sr-signature-panel{display:grid;gap:8px}.sr-signature-pad{background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:calc(var(--sr-radius) - 2px);height:150px;touch-action:none;width:100%}.sr-consent{align-items:flex-start;display:flex;gap:8px}.sr-help{color:var(--sr-muted);font-size:.82rem}"
    ].join("");
  }
  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function includesValue(values, value) {
    return typeof value === "string" && values.indexOf(value) !== -1;
  }
  function normalizeConditionalLogic(value) {
    if (!isRecord(value)) {
      return { action: "SHOW", enabled: false, operator: "EQUALS", sourceFieldId: "", value: "" };
    }
    var sourceFieldId = typeof value.sourceFieldId === "string" ? value.sourceFieldId.trim() : "";
    return {
      action: includesValue(["SHOW", "HIDE"], value.action) ? value.action : "SHOW",
      enabled: value.enabled === true && Boolean(sourceFieldId),
      operator: includesValue(["EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_EMPTY", "EMPTY"], value.operator) ? value.operator : "EQUALS",
      sourceFieldId: sourceFieldId,
      value: typeof value.value === "string" ? value.value.trim() : ""
    };
  }
  function conditionalMatches(logic, sourceValue) {
    var actual = String(sourceValue || "").trim();
    var expected = String(logic.value || "").trim();
    var actualComparable = actual.toLowerCase();
    var expectedComparable = expected.toLowerCase();
    if (logic.operator === "NOT_EMPTY") return Boolean(actual);
    if (logic.operator === "EMPTY") return !actual;
    if (logic.operator === "CONTAINS") return expected ? actualComparable.indexOf(expectedComparable) !== -1 : Boolean(actual);
    if (logic.operator === "NOT_EQUALS") return actualComparable !== expectedComparable;
    return actualComparable === expectedComparable;
  }
  function computeVisibleFieldIds(fields, values) {
    var visibleIds = new Set(fields.map(function (field) { return field.id; }));
    for (var index = 0; index < fields.length + 1; index += 1) {
      var nextVisibleIds = new Set();
      fields.forEach(function (field) {
        var logic = normalizeConditionalLogic(field.conditionalLogic);
        if (!logic.enabled) {
          nextVisibleIds.add(field.id);
          return;
        }
        var sourceValue = visibleIds.has(logic.sourceFieldId) ? values[logic.sourceFieldId] || "" : "";
        var matches = conditionalMatches(logic, sourceValue);
        var shouldShow = logic.action === "SHOW" ? matches : !matches;
        if (shouldShow) nextVisibleIds.add(field.id);
      });
      if (nextVisibleIds.size === visibleIds.size && Array.from(nextVisibleIds).every(function (fieldId) { return visibleIds.has(fieldId); })) {
        return nextVisibleIds;
      }
      visibleIds = nextVisibleIds;
    }
    return visibleIds;
  }
  var signatureConsentStatement = "I agree that this electronic signature is the legal equivalent of my handwritten signature and that the information submitted with this form is accurate.";
  function wrapField(field, html, forceHidden) {
    return "<div data-form-field-id='" + escapeHtml(field.id) + "' data-form-field-page='" + escapeHtml(field.pageNumber || 1) + "'" + (forceHidden ? " hidden aria-hidden='true'" : "") + ">" + html + "</div>";
  }
  function helpHtml(field) {
    return field.helpText ? "<small class='sr-help' id='" + escapeHtml(field.id) + "-help'>" + escapeHtml(field.helpText) + "</small>" : "";
  }
  function fieldHtml(field) {
    var required = field.isRequired ? " required" : "";
    var helpAttrs = field.helpText ? " aria-describedby='" + escapeHtml(field.id) + "-help'" : "";
    var label = "<label for='" + escapeHtml(field.inputName) + "'>" + escapeHtml(field.label) + (field.isRequired ? " *" : "") + "</label>";
    if (field.type === "TEXTAREA") return wrapField(field, "<div class='sr-field'>" + label + "<textarea id='" + escapeHtml(field.inputName) + "' name='" + escapeHtml(field.inputName) + "'" + required + helpAttrs + "></textarea>" + helpHtml(field) + "</div>");
    if (field.type === "SELECT") return wrapField(field, "<div class='sr-field'>" + label + "<select id='" + escapeHtml(field.inputName) + "' name='" + escapeHtml(field.inputName) + "'" + required + helpAttrs + "><option value=''>Select one</option>" + (field.options || []).map(function (option) { return "<option value='" + escapeHtml(option) + "'>" + escapeHtml(option) + "</option>"; }).join("") + "</select>" + helpHtml(field) + "</div>");
    if (field.type === "CHECKBOX") return wrapField(field, "<div class='sr-field'><label class='sr-choice'><input name='" + escapeHtml(field.inputName) + "' type='checkbox'" + required + helpAttrs + "> " + escapeHtml(field.label) + (field.isRequired ? " *" : "") + "</label>" + helpHtml(field) + "</div>");
    if (field.type === "RADIO") return wrapField(field, "<fieldset class='sr-field'" + helpAttrs + "><legend>" + escapeHtml(field.label) + (field.isRequired ? " *" : "") + "</legend>" + (field.options || []).map(function (option) { return "<label class='sr-choice'><input name='" + escapeHtml(field.inputName) + "' type='radio' value='" + escapeHtml(option) + "'" + required + "> " + escapeHtml(option) + "</label>"; }).join("") + helpHtml(field) + "</fieldset>");
    if (field.type === "FILE") return wrapField(field, "<div class='sr-field'>" + label + "<input id='" + escapeHtml(field.inputName) + "' name='" + escapeHtml(field.inputName) + "' type='file'" + required + helpAttrs + ">" + helpHtml(field) + "</div>");
    if (field.type === "HIDDEN") return wrapField(field, "<input name='" + escapeHtml(field.inputName) + "' type='hidden' value='" + escapeHtml(field.placeholder || "") + "'>", true);
    if (field.type === "SIGNATURE") {
      return wrapField(field, "<div class='sr-field' data-signature-field='" + escapeHtml(field.inputName) + "' data-signature-required='" + (field.isRequired ? "true" : "false") + "'>" +
        label +
        "<input data-signature-payload name='" + escapeHtml(field.inputName) + "' type='hidden'>" +
        "<div class='sr-actions' style='justify-content:flex-start'><label class='sr-choice'><input data-signature-mode name='" + escapeHtml(field.inputName) + "-mode' type='radio' value='TYPED' checked> Type</label><label class='sr-choice'><input data-signature-mode name='" + escapeHtml(field.inputName) + "-mode' type='radio' value='DRAWN'> Draw</label></div>" +
        "<input data-signature-typed id='" + escapeHtml(field.inputName) + "' autocomplete='name' placeholder='" + escapeHtml(field.placeholder || "Type your full legal name") + "'" + required + helpAttrs + ">" +
        "<div class='sr-signature-panel' data-signature-draw-panel hidden><canvas class='sr-signature-pad' data-signature-canvas aria-label='" + escapeHtml(field.label) + " drawing area'></canvas><button class='sr-secondary' data-signature-clear type='button'>Clear signature</button></div>" +
        helpHtml(field) +
        "<label class='sr-consent'><input data-signature-consent name='" + escapeHtml(field.inputName) + "-consent' type='checkbox'" + required + "> <span>" + escapeHtml(signatureConsentStatement) + "</span></label>" +
      "</div>");
    }
    var type = field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "DATE" ? "date" : "text";
    return wrapField(field, "<div class='sr-field'>" + label + "<input id='" + escapeHtml(field.inputName) + "' name='" + escapeHtml(field.inputName) + "' type='" + type + "' placeholder='" + escapeHtml(field.placeholder || "") + "'" + required + helpAttrs + ">" + helpHtml(field) + "</div>");
  }
  class ShowrunnerForm extends HTMLElement {
    static get observedAttributes() {
      return ["publishable-key", "key", "api-base", "slug", "attachment-target-type", "attachment-target-id", "theme", "accent-color", "primary-color", "background-color", "border-color", "muted-color", "text-color", "radius"];
    }
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.form = null;
      this.error = "";
      this.success = "";
      this.loading = false;
      this.submitting = false;
      this.currentPage = null;
    }
    connectedCallback() {
      this.render();
      this.load();
    }
    attributeChangedCallback(oldName, oldValue, newValue) {
      if (oldValue !== newValue && this.isConnected) this.load();
    }
    apiBase() {
      return normalizeApiBase(this.getAttribute("api-base"));
    }
    publishableKey() {
      return this.getAttribute("publishable-key") || this.getAttribute("key") || "";
    }
    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
    }
    async load() {
      var slug = this.getAttribute("slug") || "";
      if (!this.publishableKey() || !slug) {
        this.error = "Missing form configuration.";
        this.render();
        return;
      }
      this.loading = true;
      this.error = "";
      this.render();
      try {
        var response = await fetch(this.apiBase() + "/api/public/v1/forms/" + encodeURIComponent(slug), {
          headers: { "X-Showrunner-Key": this.publishableKey() }
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || "Form failed to load.");
        this.form = payload.data && payload.data.form ? payload.data.form : null;
        var pages = this.pages();
        this.currentPage = pages[0] || 1;
        this.dispatch("showrunner:form-ready", { form: this.form });
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Form failed to load.";
        this.dispatch("showrunner:error", { message: this.error });
      } finally {
        this.loading = false;
        this.render();
      }
    }
    pages() {
      var fields = this.form && Array.isArray(this.form.fields) ? this.form.fields : [];
      return Array.from(new Set(fields.map(function (field) { return Math.max(1, Number(field.pageNumber || 1)); }))).sort(function (left, right) { return left - right; });
    }
    hasSteps() {
      return Boolean(this.form && this.form.enableSteps && this.pages().length > 1);
    }
    activePage() {
      var pages = this.pages();
      if (!pages.length) return 1;
      return pages.indexOf(this.currentPage) !== -1 ? this.currentPage : pages[0];
    }
    fieldControlValue(htmlForm, field) {
      var controls = Array.from(htmlForm.elements).filter(function (control) {
        return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement;
      });
      var namedControls = controls.filter(function (control) { return control.name === field.inputName; });
      if (field.type === "CHECKBOX") {
        return namedControls.some(function (control) { return control instanceof HTMLInputElement && control.checked; }) ? "yes" : "";
      }
      if (field.type === "RADIO") {
        var checked = namedControls.find(function (control) { return control instanceof HTMLInputElement && control.checked; });
        return checked && checked.value ? checked.value.trim() : "";
      }
      if (field.type === "FILE") {
        var fileControl = namedControls.find(function (control) { return control instanceof HTMLInputElement && control.type === "file"; });
        return fileControl && fileControl.files && fileControl.files[0] ? fileControl.files[0].name.trim() : "";
      }
      if (field.type === "SIGNATURE") {
        var signature = this.shadowRoot.querySelector("[data-signature-field='" + cssIdent(field.inputName) + "']");
        var payload = signature ? signature.querySelector("[data-signature-payload]") : null;
        return payload && payload.value.trim() ? payload.value.trim() : "";
      }
      return namedControls[0] && namedControls[0].value ? namedControls[0].value.trim() : "";
    }
    fieldValues(htmlForm) {
      var fields = this.form && Array.isArray(this.form.fields) ? this.form.fields : [];
      var values = {};
      fields.forEach((field) => {
        values[field.id] = field.type === "HIDDEN" ? field.placeholder || "" : this.fieldControlValue(htmlForm, field);
      });
      return values;
    }
    setFieldEnabled(wrapper, enabled, forceHidden) {
      wrapper.hidden = forceHidden || !enabled;
      wrapper.setAttribute("aria-hidden", forceHidden || !enabled ? "true" : "false");
      Array.from(wrapper.querySelectorAll("input, select, textarea")).forEach(function (control) {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
        if (!control.dataset.originalRequired) control.dataset.originalRequired = control.required ? "true" : "false";
        control.disabled = !enabled;
        control.required = enabled && control.dataset.originalRequired === "true";
        if (!enabled) control.setCustomValidity("");
      });
    }
    applyVisibility(htmlForm) {
      if (!this.form) return;
      this.updateSignatureControls();
      var fields = Array.isArray(this.form.fields) ? this.form.fields : [];
      var visibleFieldIds = computeVisibleFieldIds(fields, this.fieldValues(htmlForm));
      var hasSteps = this.hasSteps();
      var activePage = this.activePage();
      fields.forEach((field) => {
        var wrapper = this.shadowRoot.querySelector("[data-form-field-id='" + cssIdent(field.id) + "']");
        if (!wrapper) return;
        var conditionVisible = visibleFieldIds.has(field.id);
        var pageVisible = !hasSteps || Number(field.pageNumber || 1) === activePage;
        this.setFieldEnabled(wrapper, conditionVisible && pageVisible, field.type === "HIDDEN");
      });
      this.updateSignatureControls();
    }
    enableVisibleFieldsForSubmit(htmlForm) {
      if (!this.form) return;
      this.updateSignatureControls();
      var fields = Array.isArray(this.form.fields) ? this.form.fields : [];
      var visibleFieldIds = computeVisibleFieldIds(fields, this.fieldValues(htmlForm));
      fields.forEach((field) => {
        var wrapper = this.shadowRoot.querySelector("[data-form-field-id='" + cssIdent(field.id) + "']");
        if (!wrapper) return;
        this.setFieldEnabled(wrapper, visibleFieldIds.has(field.id), field.type === "HIDDEN");
      });
      this.updateSignatureControls();
    }
    signaturePayload(input) {
      return JSON.stringify({
        consentStatement: signatureConsentStatement,
        capturedSignature: input.mode === "DRAWN" ? input.drawnDataUrl : input.typedName.trim(),
        signerName: input.typedName.trim(),
        type: input.mode
      });
    }
    updateSignatureControls() {
      Array.from(this.shadowRoot.querySelectorAll("[data-signature-field]")).forEach((wrapper) => {
        var typed = wrapper.querySelector("[data-signature-typed]");
        var payload = wrapper.querySelector("[data-signature-payload]");
        var consent = wrapper.querySelector("[data-signature-consent]");
        var panel = wrapper.querySelector("[data-signature-draw-panel]");
        var selectedMode = wrapper.querySelector("[data-signature-mode]:checked");
        var mode = selectedMode && selectedMode.value === "DRAWN" ? "DRAWN" : "TYPED";
        var typedName = typed && typed.value ? typed.value.trim() : "";
        var drawnDataUrl = wrapper.dataset.signatureDrawn || "";
        var hasSignature = mode === "DRAWN" ? Boolean(typedName || drawnDataUrl) : Boolean(typedName);
        var isRequired = wrapper.dataset.signatureRequired === "true";
        if (panel) panel.hidden = mode !== "DRAWN";
        if (payload) payload.value = hasSignature ? this.signaturePayload({ drawnDataUrl: drawnDataUrl, mode: mode, typedName: typedName }) : "";
        if (consent) consent.required = !consent.disabled && (isRequired || hasSignature);
        if (typed) {
          typed.setCustomValidity("");
          if (!typed.disabled && mode === "DRAWN") {
            if (drawnDataUrl && !typedName) typed.setCustomValidity("Type your full legal name.");
            if (typedName && !drawnDataUrl) typed.setCustomValidity("Draw a signature.");
          }
        }
      });
    }
    bindSignatureControls() {
      Array.from(this.shadowRoot.querySelectorAll("[data-signature-field]")).forEach((wrapper) => {
        var canvas = wrapper.querySelector("[data-signature-canvas]");
        var clear = wrapper.querySelector("[data-signature-clear]");
        if (canvas instanceof HTMLCanvasElement && !canvas.dataset.bound) {
          canvas.dataset.bound = "true";
          var ratio = window.devicePixelRatio || 1;
          var rect = canvas.getBoundingClientRect();
          canvas.width = Math.max(1, Math.floor(rect.width * ratio));
          canvas.height = Math.max(1, Math.floor(rect.height * ratio));
          var context = canvas.getContext("2d");
          if (context) {
            context.scale(ratio, ratio);
            context.lineCap = "round";
            context.lineJoin = "round";
            context.lineWidth = 2.4;
            context.strokeStyle = getComputedStyle(this.shadowRoot.querySelector(".sr-form")).getPropertyValue("--sr-text").trim() || "#111827";
          }
          var drawing = false;
          var point = function (event) {
            var bounds = canvas.getBoundingClientRect();
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
          };
          var finish = () => {
            if (!drawing) return;
            drawing = false;
            wrapper.dataset.signatureDrawn = canvas.toDataURL("image/png");
            this.updateSignatureControls();
          };
          canvas.addEventListener("pointerdown", (event) => {
            var ctx = canvas.getContext("2d");
            if (!ctx) return;
            var current = point(event);
            drawing = true;
            canvas.setPointerCapture(event.pointerId);
            ctx.beginPath();
            ctx.moveTo(current.x, current.y);
          });
          canvas.addEventListener("pointermove", (event) => {
            if (!drawing) return;
            var ctx = canvas.getContext("2d");
            if (!ctx) return;
            var current = point(event);
            ctx.lineTo(current.x, current.y);
            ctx.stroke();
          });
          canvas.addEventListener("pointerup", finish);
          canvas.addEventListener("pointercancel", finish);
        }
        if (clear && !clear.dataset.bound) {
          clear.dataset.bound = "true";
          clear.addEventListener("click", () => {
            if (!(canvas instanceof HTMLCanvasElement)) return;
            var context = canvas.getContext("2d");
            if (context) context.clearRect(0, 0, canvas.width, canvas.height);
            wrapper.dataset.signatureDrawn = "";
            this.updateSignatureControls();
          });
        }
      });
      this.updateSignatureControls();
    }
    controlsHtml(fields) {
      if (!fields.length) return "";
      if (!this.hasSteps()) {
        return "<button type='submit'" + (this.submitting ? " disabled" : "") + ">" + escapeHtml(this.submitting ? "Submitting..." : this.form.submitButtonLabel || "Submit") + "</button>";
      }
      return "<div data-step-actions>" + this.stepControlsHtml() + "</div>";
    }
    stepControlsHtml() {
      var pages = this.pages();
      var activePage = this.activePage();
      var currentPageIndex = Math.max(0, pages.indexOf(activePage));
      return "<div class='sr-actions'><span class='sr-step'>Step " + (currentPageIndex + 1) + " of " + pages.length + "</span><span class='sr-actions'>" +
        "<button class='sr-secondary' data-step='previous' type='button'" + (currentPageIndex <= 0 ? " disabled" : "") + ">Previous</button>" +
        (currentPageIndex < pages.length - 1 ? "<button data-step='next' type='button'>Next</button>" : "<button type='submit'" + (this.submitting ? " disabled" : "") + ">" + escapeHtml(this.submitting ? "Submitting..." : this.form.submitButtonLabel || "Submit") + "</button>") +
      "</span></div>";
    }
    updateStepControls(htmlForm) {
      var container = this.shadowRoot.querySelector("[data-step-actions]");
      if (!container) return;
      container.innerHTML = this.stepControlsHtml();
      this.bindStepButtons(htmlForm);
    }
    bindStepButtons(htmlForm) {
      var previous = this.shadowRoot.querySelector("[data-step='previous']");
      var next = this.shadowRoot.querySelector("[data-step='next']");
      if (previous) previous.addEventListener("click", () => {
        var pages = this.pages();
        var index = Math.max(0, pages.indexOf(this.activePage()));
        this.currentPage = pages[Math.max(0, index - 1)] || this.activePage();
        this.updateStepControls(htmlForm);
        this.applyVisibility(htmlForm);
      });
      if (next) next.addEventListener("click", () => {
        this.applyVisibility(htmlForm);
        if (!htmlForm.reportValidity()) return;
        var pages = this.pages();
        var index = Math.max(0, pages.indexOf(this.activePage()));
        this.currentPage = pages[Math.min(pages.length - 1, index + 1)] || this.activePage();
        this.updateStepControls(htmlForm);
        this.applyVisibility(htmlForm);
      });
    }
    async submit(event) {
      event.preventDefault();
      if (!this.form || this.submitting) return;
      var htmlForm = event.currentTarget;
      this.enableVisibleFieldsForSubmit(htmlForm);
      if (!htmlForm.reportValidity()) {
        this.applyVisibility(htmlForm);
        return;
      }
      var body = new FormData(htmlForm);
      this.submitting = true;
      this.error = "";
      this.success = "";
      this.render();
      try {
        var targetType = this.getAttribute("attachment-target-type") || "";
        var targetId = this.getAttribute("attachment-target-id") || "";
        if (targetType) body.set("attachmentTargetType", targetType);
        if (targetId) body.set("attachmentTargetId", targetId);
        var response = await fetch(this.apiBase() + "/api/public/v1/forms/" + encodeURIComponent(this.form.slug) + "/submissions", {
          method: "POST",
          headers: { "X-Showrunner-Key": this.publishableKey() },
          body: body
        });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(payload.error || "Submission failed.");
        this.success = payload.data && payload.data.successMessage ? payload.data.successMessage : "Thanks. Your form was submitted.";
        this.dispatch("showrunner:form-submitted", payload.data || {});
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Submission failed.";
        this.dispatch("showrunner:error", { message: this.error });
      } finally {
        this.submitting = false;
        this.render();
      }
    }
    render() {
      var fields = this.form && Array.isArray(this.form.fields) ? this.form.fields : [];
      this.shadowRoot.innerHTML = "<style>" + css() + "</style><form class='sr-form' enctype='multipart/form-data'>" +
        (this.form ? "<div><h2>" + escapeHtml(this.form.name) + "</h2>" + (this.form.description ? "<p>" + escapeHtml(this.form.description) + "</p>" : "") + "</div>" : "") +
        (this.error ? "<div class='sr-error'>" + escapeHtml(this.error) + "</div>" : "") +
        (this.success ? "<div class='sr-success'>" + escapeHtml(this.success) + "</div>" : "") +
        (this.loading ? "<div class='sr-empty'>Loading form...</div>" : "") +
        (!this.loading && this.form && !this.success ? (fields.length ? fields.map(fieldHtml).join("") : "<div class='sr-empty'>This form does not have fields yet.</div>") + "<div class='sr-honeypot'><label>Company website <input name='companyWebsite' tabindex='-1' autocomplete='off'></label></div>" + this.controlsHtml(fields) : "") +
      "</form>";
      applyTheme(this, this.shadowRoot.querySelector(".sr-form"));
      var form = this.shadowRoot.querySelector("form");
      if (form && this.form && !this.success) {
        form.addEventListener("submit", this.submit.bind(this));
        form.addEventListener("input", () => this.applyVisibility(form));
        form.addEventListener("change", () => this.applyVisibility(form));
        this.bindStepButtons(form);
        this.bindSignatureControls();
        this.applyVisibility(form);
      }
    }
  }
  window.customElements.define("showrunner-form", ShowrunnerForm);
})();
`;

export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const sources: Record<string, string> = {
    "booking.js": bookingWidgetSource,
    "buy-button.js": buyButtonWidgetSource,
    "form.js": formWidgetSource,
    "gallery.js": galleryWidgetSource
  };
  const source = sources[asset];
  if (!source) return new Response("Not found", { status: 404 });

  return new Response(source, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Content-Type": "application/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
