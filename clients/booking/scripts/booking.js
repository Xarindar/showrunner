(function () {
  const config = window.BookingClientConfig || {};
  const assets = window.BookingAssets || {};

  const state = {
    activeStep: "categories",
    categories: [],
    services: [],
    categoryId: null,
    categoryFocusId: "",
    serviceId: null,
    selectedDate: dateKey(initialSelectedDate()),
    selectedSlot: null,
    staffId: "",
    lastBooking: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    applyBusinessCopy();
    bindEvents();
    setStatus("Loading services...");

    try {
      state.services = await loadServices();
      state.categories = normalizeCategories(config.categories || [], state.services);
      setStatus("");
    } catch (error) {
      if (config.api?.demoFallback !== false) {
        state.services = normalizeServices(config.services || []);
        state.categories = normalizeCategories(config.categories || [], state.services);
        setStatus("Using demo services because live services could not load.");
      } else {
        state.services = [];
        state.categories = normalizeCategories(config.categories || [], []);
        setStatus(error.message || "Services could not load.", true);
      }
    }

    renderAll();
  }

  function cacheElements() {
    els.root = document.querySelector("[data-booking-root]");
    els.panels = Array.from(document.querySelectorAll("[data-step-panel]"));
    els.categoryGrid = document.querySelector("[data-category-grid]");
    els.categoryEmpty = document.querySelector("[data-category-empty]");
    els.categoryPills = document.querySelector("[data-category-pills]");
    els.clearCategoryFilter = document.querySelector("[data-clear-category-filter]");
    els.homeSearch = document.querySelector("[data-home-search]");
    els.promoCard = document.querySelector("[data-promo-card]");
    els.promoTitle = document.querySelector("[data-promo-title]");
    els.promoCopy = document.querySelector("[data-promo-copy]");
    els.promoCta = document.querySelector("[data-promo-cta]");
    els.serviceList = document.querySelector("[data-service-list]");
    els.serviceEmpty = document.querySelector("[data-service-empty]");
    els.serviceSearch = document.querySelector("[data-service-search]");
    els.serviceSort = document.querySelector("[data-service-sort]");
    els.selectedCategoryKicker = document.querySelector("[data-selected-category-kicker]");
    els.selectedServiceKicker = document.querySelector("[data-selected-service-kicker]");
    els.timeControls = document.querySelector(".booking-time-controls");
    els.staffControl = document.querySelector("[data-staff-control]");
    els.staffSelect = document.querySelector("[data-staff-select]");
    els.dateInput = document.querySelector("[data-date-input]");
    els.dateRail = document.querySelector("[data-date-rail]");
    els.monthHeading = document.querySelector("[data-month-heading]");
    els.slotGrid = document.querySelector("[data-slot-grid]");
    els.slotEmpty = document.querySelector("[data-slot-empty]");
    els.slotHeading = document.querySelector("[data-slot-heading]");
    els.timezoneLabel = document.querySelector("[data-timezone-label]");
    els.availabilityStatus = document.querySelector("[data-availability-status]");
    els.reviewBooking = document.querySelector("[data-review-booking]");
    els.confirmSummary = document.querySelector("[data-confirm-summary]");
    els.successSummary = document.querySelector("[data-success-summary]");
    els.successCopy = document.querySelector("[data-success-copy]");
    els.successLinks = document.querySelector("[data-success-links]");
    els.form = document.querySelector("[data-booking-form]");
    els.formStatus = document.querySelector("[data-form-status]");
    els.submitBooking = document.querySelector("[data-submit-booking]");
    els.intakeField = document.querySelector("[data-intake-field]");
    els.intakeLabel = document.querySelector("[data-intake-label]");
    els.policyField = document.querySelector("[data-policy-field]");
    els.policyText = document.querySelector("[data-policy-text]");
  }

  function applyBusinessCopy() {
    const business = config.business || {};
    setText("[data-business-name]", business.name || "Client Studio");
    setText("[data-business-heading]", business.heading || "Book your visit");
    setText("[data-business-kicker]", business.kicker || "Online booking");
    setText("[data-business-tagline]", business.tagline || "Choose a service and reserve your time.");
    setText("[data-business-location]", business.location || "Book online");
    setText("[data-business-hours]", business.hoursLabel || "Open today");
    setText("[data-business-promise]", business.promise || "Fast confirmation");

    const support = document.querySelector("[data-support-link]");
    if (support) {
      const email = business.supportEmail || "hello@example.com";
      support.href = `mailto:${email}`;
    }
  }

  function bindEvents() {
    document.querySelector("[data-back-to-categories]")?.addEventListener("click", () => goToStep("categories"));
    document.querySelector("[data-back-to-services]")?.addEventListener("click", () => goToStep("services"));
    document.querySelector("[data-back-to-time]")?.addEventListener("click", () => goToStep("time"));
    document.querySelector("[data-new-booking]")?.addEventListener("click", resetFlow);
    els.reviewBooking?.addEventListener("click", () => goToStep("confirm"));

    els.homeSearch?.addEventListener("input", () => {
      state.categoryFocusId = "";
      renderCategoryPills();
      renderCategories();
    });
    els.clearCategoryFilter?.addEventListener("click", () => {
      state.categoryFocusId = "";
      if (els.homeSearch) els.homeSearch.value = "";
      renderCategoryPills();
      renderCategories();
    });
    els.promoCard?.addEventListener("click", () => {
      const categoryId = config.promotion?.categoryId;
      if (categoryId) selectCategory(categoryId);
    });
    els.serviceSearch?.addEventListener("input", renderServices);
    els.serviceSort?.addEventListener("change", renderServices);
    els.staffSelect?.addEventListener("change", () => {
      state.staffId = els.staffSelect.value;
      state.selectedSlot = null;
      updateInlineActions();
      loadAndRenderSlots();
    });
    els.dateInput?.addEventListener("change", () => {
      if (!els.dateInput.value) return;
      state.selectedDate = els.dateInput.value;
      state.selectedSlot = null;
      renderDates();
      updateInlineActions();
      loadAndRenderSlots();
    });
    els.form?.addEventListener("submit", submitBooking);
  }

  function renderAll() {
    renderPromo();
    renderCategoryPills();
    renderCategories();
    renderServices();
    renderDates();
    renderStaffSelect();
    updateInlineActions();
    updatePanels();
  }

  function renderCategories() {
    const query = (els.homeSearch?.value || "").trim().toLowerCase();
    const sorted = [...state.categories].sort(sortBySortThenName);
    const visible = query ? sorted.filter((category) => categoryMatchesQuery(category, query)) : sorted;

    els.categoryEmpty.hidden = visible.length > 0;
    els.categoryGrid.innerHTML = sorted
      .filter((category) => visible.includes(category))
      .map((category) => {
        const count = servicesForCategory(category.id).length;
        const image = imageForCategory(category);
        const highlighted = state.categoryFocusId === category.id;
        return `
          <button class="booking-category-card ${highlighted ? "is-highlighted" : ""}" type="button" data-category-id="${escapeAttribute(category.id)}" style="--category-image: url('${escapeAttribute(image)}')">
            <span class="booking-category-card-copy">
              <small>${count} ${count === 1 ? "service" : "services"}</small>
              <strong>${escapeHtml(category.name)}</strong>
              <span>${escapeHtml(category.description || "Select from available services.")}</span>
            </span>
          </button>
        `;
      })
      .join("");

    els.categoryGrid.querySelectorAll("[data-category-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectCategory(button.dataset.categoryId);
      });
    });

    if (state.categoryFocusId) {
      window.setTimeout(() => {
        els.categoryGrid
          .querySelector(`[data-category-id="${cssEscape(state.categoryFocusId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }, 0);
    }
  }

  function renderPromo() {
    const promo = config.promotion || {};
    if (!els.promoCard || promo.enabled === false) return;
    const image = promo.imageUrl || assets.promoImage || assets.fallbackCategoryImage || "";
    els.promoCard.hidden = false;
    els.promoCard.style.setProperty("--promo-image", `url("${image}")`);
    els.promoTitle.textContent = promo.title || "Book your next visit";
    els.promoCopy.textContent = promo.copy || "Find a time that works for you.";
    els.promoCta.textContent = promo.cta || "Book now";
  }

  function renderCategoryPills() {
    const query = (els.homeSearch?.value || "").trim().toLowerCase();
    const categories = [...state.categories]
      .sort(sortBySortThenName)
      .filter((category) => !query || categoryMatchesQuery(category, query));

    const allActive = !state.categoryFocusId;
    els.categoryPills.innerHTML = [
      `<button class="booking-pill ${allActive ? "is-active" : ""}" type="button" data-pill-category="">All</button>`,
      ...categories.map(
        (category) => `
          <button class="booking-pill ${state.categoryFocusId === category.id ? "is-active" : ""}" type="button" data-pill-category="${escapeAttribute(category.id)}">
            ${escapeHtml(category.name)}
          </button>
        `
      )
    ].join("");

    els.categoryPills.querySelectorAll("[data-pill-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.categoryFocusId = button.dataset.pillCategory || "";
        renderCategoryPills();
        renderCategories();
      });
    });
  }

  function renderServices() {
    const category = selectedCategory();
    const search = (els.serviceSearch?.value || "").trim().toLowerCase();
    const sort = els.serviceSort?.value || "recommended";
    let services = state.categoryId ? servicesForCategory(state.categoryId) : [...state.services];

    if (search) {
      services = services.filter((service) =>
        [service.name, service.description, service.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    }

    services = sortServices(services, sort);

    if (els.selectedCategoryKicker) {
      els.selectedCategoryKicker.textContent = category ? category.name : "Services";
    }

    els.serviceEmpty.hidden = services.length > 0;
    els.serviceList.innerHTML = services
      .map((service) => {
        const detail = service.requestOnly ? "Request only" : service.location || "Online booking";
        return `
          <tr>
            <td>
              <span class="booking-service-name">
                <strong>${escapeHtml(service.name)}</strong>
                <span>${escapeHtml(service.description || "Service details available at confirmation.")}</span>
              </span>
            </td>
            <td><span class="booking-service-meta">${service.durationMinutes || 0} min</span></td>
            <td><span class="booking-service-meta">${formatPrice(service.priceCents)}</span></td>
            <td><span class="booking-service-detail">${escapeHtml(detail)}</span></td>
            <td><button class="booking-row-button" type="button" data-service-id="${escapeAttribute(service.id)}">Select</button></td>
          </tr>
        `;
      })
      .join("");

    els.serviceList.querySelectorAll("[data-service-id]").forEach((button) => {
      button.addEventListener("click", () => selectService(button.dataset.serviceId));
    });
  }

  function selectService(serviceId) {
    state.serviceId = serviceId;
    state.selectedSlot = null;
    state.staffId = "";
    renderStaffSelect();
    renderDates();
    goToStep("time");
    updateInlineActions();
    loadAndRenderSlots();
  }

  function selectCategory(categoryId) {
    state.categoryId = categoryId;
    state.categoryFocusId = categoryId;
    state.serviceId = null;
    state.selectedSlot = null;
    state.staffId = "";
    goToStep("services");
    renderAll();
  }

  function renderStaffSelect() {
    const service = selectedService();
    const staff = service?.staff || [];
    const showStaffFilter = config.features?.showStaffFilter === true;
    if (!service || !staff.length || !showStaffFilter) {
      if (els.timeControls) els.timeControls.hidden = true;
      els.staffControl.hidden = true;
      els.staffSelect.innerHTML = "";
      state.staffId = "";
      return;
    }

    if (els.timeControls) els.timeControls.hidden = false;
    els.staffControl.hidden = false;
    els.staffSelect.innerHTML = [
      `<option value="">Any available provider</option>`,
      ...staff.map((member) => `<option value="${escapeAttribute(member.id)}">${escapeHtml(member.name)}${member.title ? `, ${escapeHtml(member.title)}` : ""}</option>`)
    ].join("");
    els.staffSelect.value = state.staffId;
  }

  function renderDates() {
    const daysToShow = Number(config.schedule?.daysToShow || 10);
    const today = startOfDay(new Date());
    const dates = Array.from({ length: daysToShow }, (_, index) => {
      const next = new Date(today);
      next.setDate(today.getDate() + index);
      return next;
    });

    if (els.dateInput) {
      els.dateInput.min = dateKey(today);
      els.dateInput.value = state.selectedDate;
    }
    if (els.monthHeading) {
      els.monthHeading.textContent = formatMonthYear(state.selectedDate);
    }

    els.dateRail.innerHTML = dates
      .map((date) => {
        const key = dateKey(date);
        const selected = key === state.selectedDate;
        return `
          <button class="booking-date-button ${selected ? "is-selected" : ""}" type="button" data-date="${key}" aria-pressed="${selected}">
            <span>${weekdayShort(date)}</span>
            <strong>${date.getDate()}</strong>
            <small>${monthShort(date)}</small>
          </button>
        `;
      })
      .join("");

    els.dateRail.querySelectorAll("[data-date]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedDate = button.dataset.date;
        state.selectedSlot = null;
        renderDates();
        updateInlineActions();
        loadAndRenderSlots();
      });
    });
  }

  async function loadAndRenderSlots() {
    const service = selectedService();
    if (!service) return;

    els.slotGrid.innerHTML = "";
    els.slotEmpty.hidden = true;
    setAvailabilityStatus("Checking times...");

    try {
      const slots = await loadSlots(service);
      setAvailabilityStatus("");
      renderSlots(slots);
    } catch (error) {
      setAvailabilityStatus(error.message || "Times could not load.", true);
      renderSlots([]);
    }
  }

  function renderSlots(slots) {
    const service = selectedService();
    if (els.selectedServiceKicker) {
      els.selectedServiceKicker.textContent = service ? service.name : "Time";
    }
    if (els.slotHeading) {
      els.slotHeading.textContent = "Time";
    }
    if (els.timezoneLabel) {
      els.timezoneLabel.textContent = "";
    }

    els.slotEmpty.hidden = slots.length > 0;
    els.slotGrid.innerHTML = slots
      .map((slot, index) => {
        const selected = state.selectedSlot?.startsAt === slot.startsAt && (state.selectedSlot?.staffId || "") === (slot.staffId || "");
        return `
          <button class="booking-slot-button ${selected ? "is-selected" : ""}" type="button" data-slot-index="${index}" aria-pressed="${selected}">
            <strong>${escapeHtml(slot.label || formatTime(slot.startsAt))}</strong>
            <span>${escapeHtml(slot.staffName || selectedStaffName() || "Available")}</span>
          </button>
        `;
      })
      .join("");

    els.slotGrid.querySelectorAll("[data-slot-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSlot = slots[Number(button.dataset.slotIndex)];
        renderSlots(slots);
        updateInlineActions();
      });
    });
  }

  function renderConfirm() {
    const service = selectedService();
    const slot = state.selectedSlot;
    if (!service || !slot) return;

    els.confirmSummary.innerHTML = summaryMarkup(service, slot);
    els.submitBooking.textContent = service.requestOnly ? "Send request" : "Confirm booking";

    if (service.intakePrompt) {
      els.intakeField.hidden = false;
      els.intakeLabel.textContent = service.intakePrompt;
    } else {
      els.intakeField.hidden = true;
    }

    if (service.policyText) {
      els.policyField.hidden = false;
      els.policyText.textContent = service.policyText;
      const checkbox = els.policyField.querySelector("input");
      checkbox.required = Boolean(service.requirePolicy);
    } else {
      els.policyField.hidden = true;
    }
  }

  function updateInlineActions() {
    if (els.reviewBooking) {
      els.reviewBooking.disabled = !state.selectedSlot;
    }
  }

  function renderSuccess(bookingResult) {
    const service = selectedService();
    const slot = state.selectedSlot;
    if (!service || !slot) return;

    els.successSummary.innerHTML = summaryMarkup(service, slot, bookingResult?.booking?.id);
    els.successCopy.textContent = service.requestOnly
      ? "Your appointment request has been sent. The team will follow up with confirmation."
      : "Your appointment is confirmed. A confirmation email is on its way.";

    const links = [];
    if (bookingResult?.booking?.calendarUrl) {
      links.push(`<a class="booking-button booking-button-secondary" href="${escapeAttribute(bookingResult.booking.calendarUrl)}">Add to calendar</a>`);
    }
    if (bookingResult?.booking?.manageUrl) {
      links.push(`<a class="booking-button booking-button-secondary" href="${escapeAttribute(bookingResult.booking.manageUrl)}">Manage booking</a>`);
    }
    if (bookingResult?.booking?.formLinks?.length) {
      bookingResult.booking.formLinks.forEach((form) => {
        links.push(`<a class="booking-button booking-button-secondary" href="${escapeAttribute(form.href)}">${escapeHtml(form.name)}</a>`);
      });
    }
    els.successLinks.innerHTML = links.join("");
  }

  function updatePanels() {
    if (els.root) {
      els.root.dataset.activeStep = state.activeStep;
    }

    els.panels.forEach((panel) => {
      const isActive = panel.dataset.stepPanel === state.activeStep;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });

    if (state.activeStep === "confirm") {
      renderConfirm();
    }
  }

  function goToStep(stepId) {
    if (!canVisitStep(stepId)) return;
    state.activeStep = stepId;
    updatePanels();
    updateInlineActions();
    if (stepId === "time") loadAndRenderSlots();
  }

  function canVisitStep(stepId) {
    if (stepId === "categories") return true;
    if (stepId === "services") return Boolean(state.categoryId);
    if (stepId === "time") return Boolean(state.serviceId);
    if (stepId === "confirm") return Boolean(state.serviceId && state.selectedSlot);
    return false;
  }

  async function submitBooking(event) {
    event.preventDefault();
    const service = selectedService();
    const slot = state.selectedSlot;
    if (!service || !slot) return;

    const formData = new FormData(els.form);
    const payload = {
      serviceId: service.id,
      staffId: slot.staffId || state.staffId || undefined,
      resourceIds: slot.resourceIds || undefined,
      startsAt: slot.startsAt,
      customerName: String(formData.get("customerName") || "").trim(),
      customerEmail: String(formData.get("customerEmail") || "").trim(),
      customerPhone: String(formData.get("customerPhone") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      intakeResponse: String(formData.get("intakeResponse") || "").trim(),
      policyAccepted: formData.get("policyAccepted") === "on",
      companyWebsite: String(formData.get("companyWebsite") || "")
    };

    setFormStatus("Sending...");
    els.submitBooking.disabled = true;

    try {
      const result = await createBooking(payload);
      state.lastBooking = result;
      renderSuccess(result);
      state.activeStep = "success";
      updatePanels();
      updateInlineActions();
      els.form.reset();
      setFormStatus("");
    } catch (error) {
      setFormStatus(error.message || "Booking could not be completed.", true);
    } finally {
      els.submitBooking.disabled = false;
    }
  }

  async function loadServices() {
    if (!config.api?.enabled) return normalizeServices(config.services || []);
    const response = await apiRequest("/services");
    const liveServices = response.services || [];
    return normalizeServices(liveServices.map(mergeServicePresentation));
  }

  async function loadSlots(service) {
    if (config.api?.enabled) {
      const params = new URLSearchParams({ serviceId: service.id, date: state.selectedDate });
      if (state.staffId) params.set("staffId", state.staffId);
      const response = await apiRequest(`/availability?${params.toString()}`);
      return (response.diagnostics?.slots || []).map(normalizeSlot);
    }

    return demoSlots(service);
  }

  async function createBooking(payload) {
    if (config.api?.enabled) {
      return apiRequest("/bookings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    await new Promise((resolve) => window.setTimeout(resolve, 450));
    return {
      ok: true,
      booking: {
        id: `demo-${Math.floor(Math.random() * 90000) + 10000}`,
        status: selectedService()?.requestOnly ? "PENDING" : "CONFIRMED",
        serviceId: payload.serviceId,
        staffId: payload.staffId || null,
        startsAt: payload.startsAt,
        endsAt: state.selectedSlot?.endsAt
      }
    };
  }

  async function apiRequest(path, options) {
    const api = config.api || {};
    const url = makeApiUrl(path);
    const headers = {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    };

    if (api.publishableKey) {
      if (api.sendKeyAsHeader !== false) {
        headers["X-Showrunner-Key"] = api.publishableKey;
      } else {
        url.searchParams.set("key", api.publishableKey);
      }
    }

    const response = await fetch(url.toString(), {
      ...options,
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }
    return payload.data || payload;
  }

  function makeApiUrl(path) {
    const base = String(config.api?.baseUrl || "/api/public/v1").replace(/\/$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (/^https?:\/\//i.test(base)) return new URL(`${base}${cleanPath}`);
    return new URL(`${base}${cleanPath}`, window.location.origin);
  }

  function normalizeServices(services) {
    return services
      .map((service, index) => ({
        id: String(service.id || service.slug || `service-${index}`),
        slug: service.slug || "",
        categoryId: service.categoryId || "general",
        name: service.name || "Untitled service",
        description: service.description || "",
        durationMinutes: Number(service.durationMinutes || 0),
        priceCents: typeof service.priceCents === "number" ? service.priceCents : null,
        location: service.location || "",
        minimumNoticeHours: service.minimumNoticeHours,
        maxAdvanceDays: service.maxAdvanceDays,
        slotIntervalMinutes: service.slotIntervalMinutes,
        intakePrompt: service.intakePrompt || "",
        policyText: service.policyText || "",
        requirePolicy: Boolean(service.requirePolicy),
        requestOnly: Boolean(service.requestOnly),
        waitlistEnabled: Boolean(service.waitlistEnabled),
        staff: Array.isArray(service.staff) ? service.staff : [],
        resources: Array.isArray(service.resources) ? service.resources : [],
        sort: Number.isFinite(Number(service.sort)) ? Number(service.sort) : index + 1
      }))
      .filter((service) => service.id && service.name);
  }

  function normalizeCategories(categories, services) {
    const normalized = categories.map((category, index) => ({
      id: String(category.id || `category-${index}`),
      name: category.name || "Services",
      description: category.description || "",
      imageKey: category.imageKey || category.id || "fallback",
      sort: Number.isFinite(Number(category.sort)) ? Number(category.sort) : index + 1
    }));

    const known = new Set(normalized.map((category) => category.id));
    services.forEach((service) => {
      if (!known.has(service.categoryId)) {
        normalized.push({
          id: service.categoryId,
          name: titleCase(service.categoryId),
          description: "Available services",
          imageKey: service.categoryId,
          sort: normalized.length + 1
        });
        known.add(service.categoryId);
      }
    });

    return normalized;
  }

  function mergeServicePresentation(service) {
    const presentation = config.servicePresentation?.[service.id] || config.servicePresentation?.[service.slug] || {};
    return { ...service, ...presentation };
  }

  function normalizeSlot(slot) {
    return {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      label: slot.label || formatTime(slot.startsAt),
      resourceIds: slot.resourceIds || [],
      resourceNames: slot.resourceNames || [],
      staffId: slot.staffId || "",
      staffName: slot.staffName || ""
    };
  }

  function demoSlots(service) {
    const selected = parseDateKey(state.selectedDate);
    const closed = config.schedule?.demoClosedWeekdays || [];
    if (closed.includes(selected.getDay())) return [];

    const startHour = Number(config.schedule?.demoStartHour || 9);
    const endHour = Number(config.schedule?.demoEndHour || 17);
    const interval = Number(config.schedule?.demoIntervalMinutes || service.slotIntervalMinutes || 30);
    const duration = Number(service.durationMinutes || 30);
    const slots = [];
    const selectedStaff = service.staff?.find((member) => member.id === state.staffId) || service.staff?.[0] || null;

    for (let minutes = startHour * 60; minutes + duration <= endHour * 60; minutes += interval) {
      const startsAt = new Date(selected);
      startsAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      if (startsAt < new Date()) continue;

      const endsAt = new Date(startsAt);
      endsAt.setMinutes(endsAt.getMinutes() + duration);

      const skipPattern = (startsAt.getDate() + startsAt.getHours() + startsAt.getMinutes() / 30) % 5 === 0;
      if (skipPattern) continue;

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        label: formatTime(startsAt),
        resourceIds: service.resources?.map((resource) => resource.id) || [],
        resourceNames: service.resources?.map((resource) => resource.name) || [],
        staffId: selectedStaff?.id || "",
        staffName: selectedStaff?.name || ""
      });
    }

    return slots.slice(0, 18);
  }

  function resetFlow() {
    state.activeStep = "categories";
    state.categoryId = null;
    state.categoryFocusId = "";
    state.serviceId = null;
    state.selectedSlot = null;
    state.staffId = "";
    state.lastBooking = null;
    setFormStatus("");
    setAvailabilityStatus("");
    renderAll();
  }

  function selectedCategory() {
    return state.categories.find((category) => category.id === state.categoryId) || null;
  }

  function selectedService() {
    return state.services.find((service) => service.id === state.serviceId) || null;
  }

  function selectedStaffName() {
    const service = selectedService();
    if (!service || !state.staffId) return "";
    return service.staff?.find((member) => member.id === state.staffId)?.name || "";
  }

  function servicesForCategory(categoryId) {
    return state.services.filter((service) => service.categoryId === categoryId);
  }

  function categoryMatchesQuery(category, query) {
    const categoryText = [category.name, category.description].filter(Boolean).join(" ").toLowerCase();
    if (categoryText.includes(query)) return true;
    return servicesForCategory(category.id).some((service) =>
      [service.name, service.description, service.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }

  function imageForCategory(category) {
    return (
      category.imageUrl ||
      assets.categoryImages?.[category.imageKey] ||
      assets.categoryImages?.[category.id] ||
      assets.fallbackCategoryImage ||
      ""
    );
  }

  function sortServices(services, sort) {
    const sorted = [...services];
    if (sort === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "duration") return sorted.sort((a, b) => a.durationMinutes - b.durationMinutes || a.name.localeCompare(b.name));
    if (sort === "price") {
      return sorted.sort((a, b) => (a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
    }
    return sorted.sort(sortBySortThenName);
  }

  function sortBySortThenName(a, b) {
    return (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name);
  }

  function summaryMarkup(service, slot, bookingId) {
    const rows = [
      ["Service", service.name],
      ["Date", formatLongDate(slot.startsAt)],
      ["Time", `${formatTime(slot.startsAt)}-${formatTime(slot.endsAt)}`],
      ["Length", `${service.durationMinutes} minutes`],
      ["Price", formatPrice(service.priceCents)]
    ];
    if (slot.staffName) rows.push(["Provider", slot.staffName]);
    if (bookingId) rows.push(["Reference", bookingId]);

    return `
      <dl>
        ${rows
          .map(
            ([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
    `;
  }

  function formatPrice(cents) {
    if (cents === 0) return "Free";
    if (typeof cents !== "number" || Number.isNaN(cents)) return "Varies";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: config.currency || "USD"
    }).format(cents / 100);
  }

  function formatTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function formatLongDate(value) {
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : new Date(value);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function formatMonthYear(value) {
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : new Date(value);
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function weekdayShort(date) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  }

  function monthShort(date) {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function titleCase(value) {
    return String(value || "services")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function initialSelectedDate() {
    const closed = config.schedule?.demoClosedWeekdays || [];
    const next = startOfDay(new Date());
    for (let index = 0; index < 14; index += 1) {
      if (!closed.includes(next.getDay())) return next;
      next.setDate(next.getDate() + 1);
    }
    return startOfDay(new Date());
  }

  function setStatus(message, isError) {
    setAvailabilityStatus(message, isError);
  }

  function setAvailabilityStatus(message, isError) {
    els.availabilityStatus.textContent = message || "";
    els.availabilityStatus.classList.toggle("is-error", Boolean(isError));
  }

  function setFormStatus(message, isError) {
    els.formStatus.textContent = message || "";
    els.formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
