(function () {
  const prefix = "bookingRule:";
  function answers(form) {
    return Object.fromEntries([...new FormData(form)].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), String(value)]));
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render(form, rules, serviceId, context = {}) {
    if (!form) return;
    const identity = serviceId + ":" + (context.revision || "");
    const previous = form.dataset.ruleService === identity ? answers(form) : {};
    form.dataset.ruleService = identity;
    for (const name of ["customerName", "customerEmail", "customerPhone"]) {
      const input = form.elements.namedItem(name);
      if (!input) continue;
      input.required = true;
    }
    let root = form.querySelector("[data-booking-rule-fields]");
    if (!root) {
      root = element("div", "", "booking-rule-fields");
      root.dataset.bookingRuleFields = "";
      const anchor = form.querySelector("[data-intake-field]");
      if (anchor) anchor.after(root); else form.append(root);
    }
    root.replaceChildren();
    const fields = (rules || []).filter(rule => rule.kind === "intake" && !rule.contactField);
    root.hidden = fields.length === 0;
    if (fields.length) root.append(element("h3", context.title || "Session details", "booking-rule-title"));
    for (const category of new Set(fields.map(rule => rule.category))) {
      const group = element("fieldset");
      if (category !== context.title) group.append(element("legend", category));
      for (const rule of fields.filter(rule => rule.category === category)) {
        const field = element(rule.type === "RADIO" ? "fieldset" : "label");
        field.append(element(rule.type === "RADIO" ? "legend" : "span", rule.label + (rule.required ? "" : " (optional)")));
        if (rule.type === "RADIO") {
          for (const option of rule.options) {
            const label = element("label", "", "booking-rule-choice");
            const input = element("input");
            Object.assign(input, { type: "radio", name: prefix + rule.id, value: option, required: rule.required, checked: previous[rule.id] === option });
            label.append(input, element("span", option)); field.append(label);
          }
        } else {
          const input = element(rule.type === "SELECT" ? "select" : "input");
          input.name = prefix + rule.id; input.required = rule.required; input.setAttribute("aria-label", rule.label);
          if (rule.type === "SELECT") {
            const blank = element("option", "Choose an option"); blank.value = ""; input.append(blank);
            for (const option of rule.options) { const node = element("option", option); node.value = option; input.append(node); }
          } else { input.type = "text"; input.maxLength = 4000; input.placeholder = rule.placeholder; }
          input.value = previous[rule.id] || ""; field.append(input);
        }
        if (rule.helpText) field.append(element("small", rule.helpText));
        group.append(field);
      }
      root.append(group);
    }
  }
  window.ShowrunnerBookingRules = { render, answers };
})();
