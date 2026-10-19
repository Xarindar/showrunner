import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

test("upload panel works inside an editor form and validates only its own inputs", async () => {
  const require = createRequire(import.meta.url);
  const file = new File(["image"], "venue.png", { type: "image/png" });
  let valid = false;
  let validations = 0;
  let refreshes = 0;
  const inputs = [
    { name: "folder", value: "Venue", type: "text", disabled: false, reportValidity: () => { validations++; return valid; } },
    { name: "isPrivate", value: "on", type: "checkbox", checked: true, disabled: false, reportValidity: () => true },
    { name: "isDecorative", value: "on", type: "checkbox", checked: false, disabled: false, reportValidity: () => true }
  ];
  let refIndex = 0;
  const writes: FormData[] = [];
  type Element = { type: unknown; props: { children?: unknown; onClick?: () => Promise<void>; type?: string } };
  const exports: Record<string, (props: object) => Element> = {};
  const source = ts.transpileModule(readFileSync(new URL("../components/ui/asset-upload-panel.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const mocks: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: (initial: unknown) => ({ current: refIndex++ === 0 ? { querySelectorAll: () => inputs } : initial }), useEffect: () => {}
    },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/modules/media/actions": {},
    "@/lib/media-upload-queue": { uploadImageQueue: async (items: unknown[], upload: (item: unknown) => Promise<{ error?: string }>, result: (item: unknown, error?: string) => void) => {
      for (const item of items) result(item, (await upload(item)).error);
    } },
    "./button": { Button: "button" }, "./upload-field": { UploadField: "upload-field" }, "./asset-upload-panel.module.css": {}
  };
  runInNewContext(source, { exports, require: (id: string) => id in mocks ? mocks[id] : require(id), FormData, Array, Map });
  const panel = exports.AssetUploadPanel({ canUpload: true, initialFiles: [file], defaultAlt: "Venue", onBusyChange: () => {}, onDone: () => {}, uploadAction: async (data: FormData) => {
    writes.push(data); return { asset: { id: "uploaded" } };
  } });
  assert.equal(panel.type, "div"); // The picker can live inside another form.
  const children = panel.props.children as Element[];
  const footer = children[1].props.children as Element[];
  const buttons = footer[1].props.children as Element[];
  const upload = buttons[1];
  assert.equal(upload.props.type, "button");
  await upload.props.onClick!();
  assert.equal(writes.length, 0);
  valid = true;
  await upload.props.onClick!();
  assert.equal(validations, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].get("folder"), "Venue");
  assert.equal(writes[0].get("isPrivate"), "on");
  assert.equal(writes[0].has("isDecorative"), false);
  assert.equal(writes[0].get("alt"), "Venue");
  assert.equal((writes[0].get("file") as File).name, "venue.png");
  assert.equal(refreshes, 1);
});
