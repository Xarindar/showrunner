type CsvOptions = {
  lineEnding?: "\n" | "\r\n";
  preventFormulaInjection?: boolean;
};

export function csvCell(value: unknown, options: CsvOptions = {}) {
  let text = value === null || value === undefined ? "" : String(value);

  if (options.preventFormulaInjection && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function csvDocument(rows: readonly (readonly unknown[])[], options: CsvOptions = {}) {
  const lineEnding = options.lineEnding || "\r\n";
  return rows.map((row) => row.map((value) => csvCell(value, options)).join(",")).join(lineEnding);
}
