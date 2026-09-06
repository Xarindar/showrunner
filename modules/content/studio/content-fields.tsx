"use client";

import { Fields, type Choice } from "./editor";
import { blockRegistry, type Field } from "./registry";
import type { ContentBlockConfig } from "./manifest";
import type { LinkOptions } from "./field-layout";
import styles from "./studio.module.css";

export function ContentFields({ block, value, onChange, ...props }: { block: ContentBlockConfig; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; canUpload: boolean; assetBaseUrl?: string; choices: Choice[]; linkOptions: LinkOptions }) {
  const fields = Object.fromEntries(Object.entries(blockRegistry[block.type].fields).filter(([key]) => block.editableFields.includes(key)));
  if (!block.editorGroups) return <Fields {...props} fields={fields} value={value} onChange={onChange} prefix={block.id} fixedRows={block.fixedRows} limits={block.limits} minimums={block.minimums} />;
  return <>{block.editorGroups.map((group, index) => <details className={styles.contentGroup} key={index} open><summary>{group.label}</summary><div className={styles.groupFields}>{group.fields.map(item => {
    const [list, position, key] = item.path.split(".");
    const rows = value[list] as Record<string, unknown>[];
    const row = rows?.[Number(position)];
    if (!row || !fields[list]) return null;
    const rowFields = fields[list].fields!;
    const selectedFields: Record<string, Field> = key ? { [key]: { ...rowFields[key], label: item.label } } : Object.fromEntries(Object.entries(rowFields).filter(([name]) => name !== "caption"));
    return <Fields {...props} key={item.path} prefix={`${block.id}-${list}-${row.id}`} fixedRows fields={selectedFields} value={row} onChange={next => onChange({ ...value, [list]: rows.map((row, i) => i === Number(position) ? next : row) })} />;
  })}</div></details>)}</>;
}
