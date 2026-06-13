export const conditionalActions = ["SHOW", "HIDE"] as const;
export const conditionalOperators = ["EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_EMPTY", "EMPTY"] as const;

export type ConditionalAction = (typeof conditionalActions)[number];
export type ConditionalOperator = (typeof conditionalOperators)[number];

export type ConditionalLogic = {
  action: ConditionalAction;
  enabled: boolean;
  operator: ConditionalOperator;
  sourceFieldId: string;
  value: string;
};

export type ConditionalField = {
  conditionalLogic?: unknown;
  id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function normalizeConditionalLogic(value: unknown): ConditionalLogic {
  if (!isRecord(value)) {
    return {
      action: "SHOW",
      enabled: false,
      operator: "EQUALS",
      sourceFieldId: "",
      value: ""
    };
  }

  const sourceFieldId = typeof value.sourceFieldId === "string" ? value.sourceFieldId.trim() : "";

  return {
    action: includesValue(conditionalActions, value.action) ? value.action : "SHOW",
    enabled: value.enabled === true && Boolean(sourceFieldId),
    operator: includesValue(conditionalOperators, value.operator) ? value.operator : "EQUALS",
    sourceFieldId,
    value: typeof value.value === "string" ? value.value.trim() : ""
  };
}

export function conditionalMatches(logic: ConditionalLogic, sourceValue: string) {
  const actual = sourceValue.trim();
  const expected = logic.value.trim();
  const actualComparable = actual.toLowerCase();
  const expectedComparable = expected.toLowerCase();

  if (logic.operator === "NOT_EMPTY") return Boolean(actual);
  if (logic.operator === "EMPTY") return !actual;
  if (logic.operator === "CONTAINS") return expected ? actualComparable.includes(expectedComparable) : Boolean(actual);
  if (logic.operator === "NOT_EQUALS") return actualComparable !== expectedComparable;

  return actualComparable === expectedComparable;
}

export function computeVisibleFieldIds(fields: ConditionalField[], values: Record<string, string>) {
  let visibleIds = new Set(fields.map((field) => field.id));

  for (let index = 0; index < fields.length + 1; index += 1) {
    const nextVisibleIds = new Set<string>();

    for (const field of fields) {
      const logic = normalizeConditionalLogic(field.conditionalLogic);
      if (!logic.enabled) {
        nextVisibleIds.add(field.id);
        continue;
      }

      const sourceValue = visibleIds.has(logic.sourceFieldId) ? values[logic.sourceFieldId] || "" : "";
      const matches = conditionalMatches(logic, sourceValue);
      const shouldShow = logic.action === "SHOW" ? matches : !matches;
      if (shouldShow) nextVisibleIds.add(field.id);
    }

    if (nextVisibleIds.size === visibleIds.size && [...nextVisibleIds].every((fieldId) => visibleIds.has(fieldId))) {
      return nextVisibleIds;
    }

    visibleIds = nextVisibleIds;
  }

  return visibleIds;
}
