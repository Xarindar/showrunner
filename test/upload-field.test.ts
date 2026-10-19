import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

test("drop zones retain all files for multiple uploads and only one for single-image fields", () => {
  const require = createRequire(import.meta.url);
  const input = { files: [] as unknown[], dispatchEvent: () => { changes++; } };
  let changes = 0;
  class Transfer {
    files: unknown[] = [];
    items = { add: (file: unknown) => this.files.push(file) };
  }
  const exports: Record<string, (props: object) => { props: { children: Array<{ props: { onDrop?: (event: unknown) => void; multiple?: boolean } }> } }> = {};
  const source = ts.transpileModule(readFileSync(new URL("../components/ui/upload-field.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  runInNewContext(source, { exports, require: (id: string) => id === "react" ? {
    useId: () => "file-input", useEffect: () => {}, useRef: () => ({ current: input }), useState: () => ["", () => {}]
  } : id === "./utils" ? { cx: (...values: unknown[]) => values.filter(Boolean).join(" ") } : require(id), DataTransfer: Transfer, Event, Array });
  const files = Array.from({ length: 9 }, (_, index) => ({ name: `image-${index}.png` }));
  const event = { preventDefault: () => {}, dataTransfer: { files } };
  for (const multiple of [true, false]) {
    const field = exports.UploadField({ multiple });
    assert.equal(field.props.children[0].props.multiple, multiple);
    field.props.children[1].props.onDrop!(event);
    assert.equal(input.files.length, multiple ? 9 : 1);
  }
  exports.UploadField({ multiple: true, disabled: true }).props.children[1].props.onDrop!(event);
  assert.equal(changes, 2);
});
