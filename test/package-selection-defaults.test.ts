import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductType } from "@prisma/client";
import { packageExtraPhotoPriceField, packagePhotoAllowanceField, packageSelectionData } from "../lib/products/package-selection";
import { PackageProductFields } from "../modules/products/package-product-fields";

function formSchemas() {
  const output = ts.transpileModule(readFileSync("lib/admin-validation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = createRequire(import.meta.url);
  const exported: Record<string, z.ZodType> = {};
  const mocks: Record<string, unknown> = {
    "server-only": {}, "next/headers": {}, "next/navigation": {},
    "@/lib/form-data": {}, "@/lib/format": {}, "@/lib/clients/status": { clientStatusValues: ["ACTIVE"] },
    "@/lib/security/urls": { isSafeExternalHttpsUrl: () => true }, "@/lib/theme/tokens": {},
    "@/lib/products/package-selection": { packageExtraPhotoPriceField, packagePhotoAllowanceField }
  };
  runInNewContext(output, { exports: exported, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return exported;
}

const product = {
  id: "package-a", name: "Family portraits", slug: "family-portraits", summary: "", description: "", type: "SERVICE_PACKAGE", status: "ACTIVE",
  basePrice: "250.00", compareAtPrice: "", currency: "USD", sku: "", seoTitle: "", seoDescription: "", vendor: "", externalReference: "", weightGrams: "", tags: "", inventoryQuantity: ""
};

test("optional package defaults distinguish omitted, blank, and explicit zero", () => {
  assert.equal(packagePhotoAllowanceField.parse(undefined), undefined);
  assert.equal(packageExtraPhotoPriceField.parse(undefined), undefined);
  assert.equal(packagePhotoAllowanceField.parse(""), null);
  assert.equal(packageExtraPhotoPriceField.parse(""), null);
  assert.equal(packagePhotoAllowanceField.parse("0"), 0);
  assert.equal(packageExtraPhotoPriceField.parse("0.00"), 0);
  assert.equal(packageExtraPhotoPriceField.parse("8.75"), 875);
  for (const value of ["-1", "1.2", "10001", "unknown"]) assert.equal(packagePhotoAllowanceField.safeParse(value).success, false);
  for (const value of ["-1", "1.001", "21474836.48", "unknown"]) assert.equal(packageExtraPhotoPriceField.safeParse(value).success, false);
});

test("product edit omissions preserve values; blank clears; other product types remain untouched", () => {
  const schemas = formSchemas();
  const absent = schemas.productUpdateFormSchema.parse(product) as Parameters<typeof packageSelectionData>[0];
  assert.deepEqual(packageSelectionData(absent), {});
  const cleared = schemas.productUpdateFormSchema.parse({ ...product, photoSelectionAllowance: "", extraPhotoPrice: "" }) as Parameters<typeof packageSelectionData>[0];
  assert.deepEqual(packageSelectionData(cleared), { photoSelectionAllowance: null, extraPhotoPriceCents: null });
  const zero = schemas.productUpdateFormSchema.parse({ ...product, photoSelectionAllowance: "0", extraPhotoPrice: "0" }) as Parameters<typeof packageSelectionData>[0];
  assert.deepEqual(packageSelectionData(zero), { photoSelectionAllowance: 0, extraPhotoPriceCents: 0 });
  assert.deepEqual(packageSelectionData({ ...zero, type: "PHYSICAL" }), {});
  assert.deepEqual(packageSelectionData({ type: "SERVICE_PACKAGE", photoSelectionAllowance: 10 }), { photoSelectionAllowance: 10 });
});

test("quick product creation accepts configurable package defaults without requiring them", () => {
  const schema = formSchemas().productQuickCreateFormSchema;
  assert.equal(schema.safeParse({ name: "Photo package", basePrice: "", type: "SERVICE_PACKAGE" }).success, true);
  const parsed = schema.parse({ name: "Photo package", basePrice: "100", type: "SERVICE_PACKAGE", photoSelectionAllowance: "12", extraPhotoPrice: "8.75" }) as Parameters<typeof packageSelectionData>[0];
  assert.deepEqual(packageSelectionData(parsed), { photoSelectionAllowance: 12, extraPhotoPriceCents: 875 });
});

test("package-default inputs are exposed only for service packages and preserve explicit zero", () => {
  const service = renderToStaticMarkup(createElement(PackageProductFields, { id: "type", initialType: ProductType.SERVICE_PACKAGE, allowance: 0, extraPhotoPriceCents: 0 }));
  assert.match(service, /name="photoSelectionAllowance"[^>]*value="0"/);
  assert.match(service, /name="extraPhotoPrice"[^>]*value="0.00"/);
  for (const type of [ProductType.PHYSICAL, ProductType.DIGITAL, ProductType.GIFT_CARD, ProductType.BUNDLE]) {
    const other = renderToStaticMarkup(createElement(PackageProductFields, { id: "type", initialType: type, allowance: 12, extraPhotoPriceCents: 875 }));
    assert.doesNotMatch(other, /name="photoSelectionAllowance"|name="extraPhotoPrice"/);
  }
});
