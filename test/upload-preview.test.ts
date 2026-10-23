import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("queued photo previews release their blob URLs when removed or replaced", () => {
  const target = { src: "" };
  const created: File[] = [], released: string[] = [], effects: Array<() => () => void> = [];
  const mocks: Record<string, unknown> = {
    react: { useRef: () => ({ current: target }), useEffect: (effect: () => () => void) => effects.push(effect) },
    "react/jsx-runtime": { jsx: () => null }
  };
  const source = ts.transpileModule(readFileSync("components/ui/asset-upload-panel.tsx", "utf8") + "\nexport { UploadThumbnail };", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports: { UploadThumbnail?: (props: { file: File }) => unknown } = {};
  runInNewContext(source, { exports, require: (name: string) => mocks[name] || {}, URL: {
    createObjectURL: (file: File) => { created.push(file); return `blob:preview-${created.length}`; },
    revokeObjectURL: (url: string) => released.push(url)
  } });
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  exports.UploadThumbnail!({ file });
  const cleanup = effects[0]();
  assert.equal(created[0], file);
  assert.equal(target.src, "blob:preview-1");
  cleanup();
  assert.deepEqual(released, ["blob:preview-1"]);
});
