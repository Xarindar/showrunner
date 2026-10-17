import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Modal } from "../components/ui/modal";

test("empty client records show readable messages; populated records retain tables and pagination", () => {
  const output = ts.transpileModule(readFileSync("modules/clients/detail/client-notes-documents-card.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const require = createRequire(import.meta.url);
  const exported: Record<string, ComponentType<Record<string, unknown>>> = {};
  runInNewContext(output, { exports: exported, require: (id: string) => id === "@/components/ui" ? { Button, Card, Modal } : require(id) });
  const props = { noteCount: 0, documentCount: 0, notesTable: "NOTES_TABLE", documentsTable: "DOCUMENTS_TABLE", notesPagination: "NOTES_PAGER", documentsPagination: "DOCUMENTS_PAGER", noteForm: null, documentForm: null };
  const empty = renderToStaticMarkup(createElement(exported.ClientNotesDocumentsCard, props));
  assert(empty.includes("No notes yet.") && empty.includes("No documents yet."));
  assert(!/NOTES_TABLE|DOCUMENTS_TABLE|NOTES_PAGER|DOCUMENTS_PAGER/.test(empty));
  assert(empty.includes("Add note") && empty.includes("Add document"));
  const populated = renderToStaticMarkup(createElement(exported.ClientNotesDocumentsCard, { ...props, noteCount: 1, documentCount: 2 }));
  for (const marker of ["NOTES_TABLE", "DOCUMENTS_TABLE", "NOTES_PAGER", "DOCUMENTS_PAGER"]) assert(populated.includes(marker));
  assert(!populated.includes("No notes yet.") && !populated.includes("No documents yet."));
});
