import assert from "node:assert/strict";
import test from "node:test";
import { clientGalleryLocalImageStatus } from "../modules/portfolio/client-gallery-validation";

test("failed, uncertain and stopped batches cannot override local evidence with server Ready", () => {
  for (const status of ["failed", "ready", "uploading"]) {
    assert.equal(clientGalleryLocalImageStatus("Ready", false, [{ status: "done" }, { status }]), "Needs attention");
  }
  assert.equal(clientGalleryLocalImageStatus("Ready", true, [{ status: "failed" }]), "Images processing");
});

test("completed or explicitly cleared batches defer to the saved server status", () => {
  assert.equal(clientGalleryLocalImageStatus("Ready", false, [{ status: "done" }]), "Ready");
  assert.equal(clientGalleryLocalImageStatus("Needs attention", false, []), "Needs attention");
  assert.equal(clientGalleryLocalImageStatus("Images processing", false, []), "Images processing");
  assert.equal(clientGalleryLocalImageStatus(undefined, false, []), "Awaiting photos");
});
