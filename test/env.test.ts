import assert from "node:assert/strict";
import test from "node:test";
import { positiveIntegerEnv } from "../lib/env";

test("worker and SMTP integer settings reject partial numbers, fractions and unsafe values", () => {
  const name = "SHOWRUNNER_TEST_INTEGER";
  const previous = process.env[name];
  try {
    for (const value of ["", " ", "0", "-1", "1.5", "25jobs", "Infinity", "9007199254740992"]) {
      process.env[name] = value;
      assert.equal(positiveIntegerEnv(name, 50), 50, value);
    }
    for (const value of ["25", " 25 "]) {
      process.env[name] = value;
      assert.equal(positiveIntegerEnv(name, 50), 25);
    }
    delete process.env[name];
    assert.equal(positiveIntegerEnv(name, 50), 50);
  } finally {
    if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
  }
});
