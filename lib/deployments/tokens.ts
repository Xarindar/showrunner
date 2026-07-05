import "server-only";

import crypto from "node:crypto";

export function generateDeploymentToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashDeploymentToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function deploymentTokenPreview(token: string) {
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
