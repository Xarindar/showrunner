import assert from "node:assert/strict";
import test from "node:test";
import { tablePageHref, tablePageSize } from "../lib/admin-table-pagination";

test("table page sizes accept bounded integers and reject invalid query input", () => {
  for (const value of [undefined, "", "0", "-1", "1.5", "Infinity", "101", "bad"]) {
    assert.equal(tablePageSize(value), 25);
  }
  assert.equal(tablePageSize("1"), 1);
  assert.equal(tablePageSize("100"), 100);
});

test("pagination keeps filters and the measured page size in server links", () => {
  assert.equal(tablePageHref("/admin/modules/clients?status=active&page=2#list", 8), "/admin/modules/clients?status=active&page=2&pageSize=8#list");
  assert.equal(tablePageHref("/admin/modules/products?pageSize=50", 6), "/admin/modules/products?pageSize=6");
  assert.equal(tablePageHref("?status=active&page=2", 6), "?status=active&page=2&pageSize=6");
  assert.equal(tablePageHref(undefined, 8), undefined);
  assert.equal(tablePageHref("/admin/modules/forms?page=2"), "/admin/modules/forms?page=2");
});
