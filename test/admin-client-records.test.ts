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
  const props = { noteCount: 0, documentCount: 0, notesTable: "No notes yet.", documentsTable: "No documents yet.", notesPagination: "NOTES_PAGER", documentsPagination: "DOCUMENTS_PAGER", noteForm: null, documentForm: null };
  for (const tab of ["notes", "documents"] as const) {
    const empty = renderToStaticMarkup(createElement(exported.ClientNotesDocumentsCard, { ...props, initialActiveTab: tab }));
    assert(empty.includes(tab === "notes" ? "No notes yet." : "No documents yet."));
    assert(!/NOTES_PAGER|DOCUMENTS_PAGER/.test(empty));
    assert.equal((empty.match(/ui-data-table-titlebar/g) || []).length, 1);
    assert(empty.includes("Add note") && empty.includes("Add document"));
    const populated = renderToStaticMarkup(createElement(exported.ClientNotesDocumentsCard, { ...props, initialActiveTab: tab, notesTable: "NOTES_TABLE", documentsTable: "DOCUMENTS_TABLE", noteCount: 1, documentCount: 2 }));
    const prefix = tab === "notes" ? "NOTES" : "DOCUMENTS";
    const other = tab === "notes" ? "DOCUMENTS" : "NOTES";
    assert(populated.includes(`${prefix}_TABLE`) && populated.includes(`${prefix}_PAGER`));
    assert(!populated.includes(`${other}_TABLE`) && !populated.includes(`${other}_PAGER`));
  }
});
