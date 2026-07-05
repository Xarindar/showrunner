(function () {
  window.BookingClientConfig = {
    business: {
      name: "Northline Studio",
      heading: "Book your visit",
      kicker: "Online booking",
      tagline: "Browse service categories, compare services in a clean list, and reserve the time that works.",
      location: "Chicago, IL",
      hoursLabel: "Open Tue-Sat",
      promise: "Confirmation in minutes",
      supportEmail: "hello@example.com",
      timezone: "America/Chicago"
    },
    api: {
      enabled: false,
      baseUrl: "/api/public/v1",
      publishableKey: "",
      sendKeyAsHeader: true,
      demoFallback: true
    },
    currency: "USD",
    schedule: {
      daysToShow: 7,
      demoStartHour: 9,
      demoEndHour: 18,
      demoIntervalMinutes: 30,
      demoClosedWeekdays: [0, 1]
    },
    promotion: {
      enabled: true,
      title: "Plan your next appointment",
      copy: "Popular times are open this week.",
      cta: "Book now",
      categoryId: "hair"
    },
    categories: [
      {
        id: "hair",
        name: "Haircare",
        description: "Cuts, styling, conditioning, and maintenance services.",
        imageKey: "hair",
        sort: 10
      },
      {
        id: "color",
        name: "Color Studio",
        description: "Gloss, highlights, blonding, and corrective color appointments.",
        imageKey: "color",
        sort: 20
      },
      {
        id: "spa",
        name: "Skin & Spa",
        description: "Restorative treatments, facials, and scalp care sessions.",
        imageKey: "spa",
        sort: 30
      },
      {
        id: "consult",
        name: "Consultations",
        description: "Planning sessions for new clients and larger transformations.",
        imageKey: "consult",
        sort: 40
      }
    ],
    services: [
      {
        id: "signature-cut",
        categoryId: "hair",
        name: "Signature Cut & Style",
        description: "Personalized cut, wash, finish, and at-home styling guidance.",
        durationMinutes: 60,
        priceCents: 7800,
        sort: 10,
        staff: [
          { id: "ava", name: "Ava Morgan", title: "Senior Stylist" },
          { id: "miles", name: "Miles Carter", title: "Stylist" }
        ],
        intakePrompt: "Share your current hair length and what you want changed."
      },
      {
        id: "express-trim",
        categoryId: "hair",
        name: "Express Trim",
        description: "Shape refresh for existing clients with light finishing.",
        durationMinutes: 30,
        priceCents: 4200,
        sort: 20
      },
      {
        id: "repair-treatment",
        categoryId: "hair",
        name: "Bond Repair Treatment",
        description: "Strengthening treatment for dryness, breakage, or heat damage.",
        durationMinutes: 45,
        priceCents: 5600,
        sort: 30
      },
      {
        id: "root-touch",
        categoryId: "color",
        name: "Root Touch-Up",
        description: "Coverage and tone refresh for regrowth up to eight weeks.",
        durationMinutes: 90,
        priceCents: 11200,
        sort: 10,
        policyText: "Color services may require a patch test or consultation based on your history.",
        requirePolicy: true
      },
      {
        id: "gloss-refresh",
        categoryId: "color",
        name: "Gloss Refresh",
        description: "Adds shine, adjusts tone, and revives previously colored hair.",
        durationMinutes: 60,
        priceCents: 8600,
        sort: 20
      },
      {
        id: "dimensional-highlights",
        categoryId: "color",
        name: "Dimensional Highlights",
        description: "Custom placement for brightness, contrast, and blended grow-out.",
        durationMinutes: 150,
        priceCents: 21000,
        sort: 30,
        requestOnly: true,
        intakePrompt: "Tell us about your color history and attach references after booking if requested."
      },
      {
        id: "hydration-facial",
        categoryId: "spa",
        name: "Hydration Facial",
        description: "Deep cleanse, exfoliation, mask, and barrier-supporting finish.",
        durationMinutes: 60,
        priceCents: 9800,
        sort: 10
      },
      {
        id: "scalp-ritual",
        categoryId: "spa",
        name: "Scalp Ritual",
        description: "Scalp analysis, massage, detox rinse, and restorative treatment.",
        durationMinutes: 75,
        priceCents: 11800,
        sort: 20
      },
      {
        id: "new-client-consult",
        categoryId: "consult",
        name: "New Client Consultation",
        description: "Discuss goals, timing, maintenance, and service recommendations.",
        durationMinutes: 30,
        priceCents: 0,
        sort: 10,
        requestOnly: true,
        intakePrompt: "What would you like help planning?"
      },
      {
        id: "color-correction-consult",
        categoryId: "consult",
        name: "Color Correction Planning",
        description: "Required planning call for complex color repair or major transformation.",
        durationMinutes: 45,
        priceCents: 2500,
        sort: 20,
        requestOnly: true,
        intakePrompt: "Describe your current color, recent services, and target result."
      }
    ],
    servicePresentation: {}
  };
})();
