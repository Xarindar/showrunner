(function () {
  const prefix = "bookingRule:";
  const defaults = new WeakMap();
  function answers(form) {
    return Object.fromEntries([...new FormData(form)].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), String(value)]));
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render(form, rules, serviceId) {
    if (!form) return;
    const previous = form.dataset.ruleService === serviceId ? answers(form) : {};
    form.dataset.ruleService = serviceId;
    for (const name of ["customerName", "customerEmail", "customerPhone"]) {
      const input = form.elements.namedItem(name);
      if (!input) continue;
      if (!defaults.has(input)) defaults.set(input, { required: input.required, placeholder: input.placeholder, label: input.closest("label")?.querySelector("span")?.textContent });
      const original = defaults.get(input);
      const rule = rules?.find(rule => rule.contactField === name);
      input.required = original.required || Boolean(rule?.required);
      input.placeholder = rule?.placeholder || original.placeholder;
      const label = input.closest("label")?.querySelector("span");
      if (label) label.textContent = rule?.label || original.label;
    }
    let root = form.querySelector("[data-booking-rule-fields]");
    if (!root) {
      root = element("div", "", "booking-rule-fields");
      root.dataset.bookingRuleFields = "";
      const anchor = form.querySelector("[data-intake-field]");
      if (anchor) anchor.after(root); else form.append(root);
    }
    root.replaceChildren();
    root.hidden = !Array.isArray(rules);
    const fields = (rules || []).filter(rule => rule.kind === "intake" && !rule.contactField);
    for (const category of new Set(fields.map(rule => rule.category))) {
      const group = element("fieldset");
      group.append(element("legend", category));
      for (const rule of fields.filter(rule => rule.category === category)) {
        const field = element(rule.type === "RADIO" ? "fieldset" : "label");
        field.append(element(rule.type === "RADIO" ? "legend" : "span", rule.label));
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
