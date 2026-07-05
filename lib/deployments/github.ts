import "server-only";

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { deploymentGithubCallbackUrl } from "@/lib/deployments/urls";
import type { ModuleId } from "@/shell/modules";

const githubApiVersion = "2022-11-28";
const githubUserAgent = "Showrunner Client Deployment Module";
const statePurpose = "client-deployment";

export type ParsedTemplateRepository = {
  owner: string;
  repo: string;
  value: string;
};

export type GithubOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

type DeploymentGithubState = JWTPayload & {
  deploymentId: string;
  purpose: typeof statePurpose;
  tokenHash: string;
};

type GithubAccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export type GithubUser = {
  html_url: string;
  login: string;
};

export type GithubRepository = {
  default_branch: string;
  full_name: string;
  html_url: string;
  name: string;
  owner: {
    login: string;
  };
};

export type ProvisionGithubRepositoryInput = {
  accessToken: string;
  clientEmail: string;
  clientName: string;
  deploymentId: string;
  moduleInclude: string;
  repoName: string;
  repoOwner: string;
  selectedModules: ModuleId[];
  templateRepository: string;
};

function stateSecret() {
  const secret = process.env.DEPLOYMENT_STATE_SECRET || process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("DEPLOYMENT_STATE_SECRET or AUTH_SECRET must be set in production.");
  }

  return new TextEncoder().encode(secret || "dev-secret-change-before-deploying");
}

export function getGithubOAuthConfig(): GithubOAuthConfig | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

export function defaultTemplateRepository() {
  return process.env.DEPLOYMENT_TEMPLATE_REPOSITORY || "";
}

export function parseTemplateRepository(value: string): ParsedTemplateRepository | null {
  const trimmed = value.trim().replace(/\.git$/, "");
  const urlMatch = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/.exec(trimmed);
  const shorthandMatch = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  const match = urlMatch || shorthandMatch;

  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");
  if (!owner || !repo) return null;

  return {
    owner,
    repo,
    value: `${owner}/${repo}`
  };
}

export async function createDeploymentGithubState(deploymentId: string, tokenHash: string) {
  return new SignJWT({ deploymentId, purpose: statePurpose, tokenHash })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(stateSecret());
}

export async function verifyDeploymentGithubState(state: string) {
  const verified = await jwtVerify(state, stateSecret());
  const payload = verified.payload as DeploymentGithubState;

  if (payload.purpose !== statePurpose || typeof payload.deploymentId !== "string" || typeof payload.tokenHash !== "string") {
    throw new Error("Invalid deployment authorization state.");
  }

  return {
    deploymentId: payload.deploymentId,
    tokenHash: payload.tokenHash
  };
}

export async function githubAuthorizeUrl(input: { baseUrl: string; deploymentId: string; tokenHash: string }) {
  const config = getGithubOAuthConfig();
  if (!config) return null;

  const state = await createDeploymentGithubState(input.deploymentId, input.tokenHash);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", deploymentGithubCallbackUrl(input.baseUrl));
  url.searchParams.set("scope", "repo read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");

  return url.toString();
}

export async function exchangeGithubCode(code: string, baseUrl: string) {
  const config = getGithubOAuthConfig();
  if (!config) throw new Error("GitHub OAuth credentials are not configured.");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: deploymentGithubCallbackUrl(baseUrl)
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const data = (await response.json()) as GithubAccessTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth token exchange failed.");
  }

  return data.access_token;
}

async function githubJson<T>(url: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("User-Agent", githubUserAgent);
  headers.set("X-GitHub-Api-Version", githubApiVersion);

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

export async function getGithubUser(accessToken: string) {
  return githubJson<GithubUser>("https://api.github.com/user", accessToken);
}

function deploymentManifest(input: ProvisionGithubRepositoryInput) {
  return {
    client: {
      email: input.clientEmail,
      name: input.clientName
    },
    deploymentId: input.deploymentId,
    generatedAt: new Date().toISOString(),
    modules: {
      include: input.moduleInclude,
      selected: input.selectedModules
    },
    templateRepository: input.templateRepository
  };
}

async function writeDeploymentManifest(repo: GithubRepository, input: ProvisionGithubRepositoryInput) {
  const content = Buffer.from(JSON.stringify(deploymentManifest(input), null, 2)).toString("base64");
  const path = ".showrunner/deployment.json".split("/").map(encodeURIComponent).join("/");

  return githubJson(`https://api.github.com/repos/${repo.full_name}/contents/${encodeURIComponent(path)}`, input.accessToken, {
    body: JSON.stringify({
      content,
      message: "Add Showrunner deployment manifest"
    }),
    method: "PUT"
  });
}

async function writeDeploymentManifestWithRetry(repo: GithubRepository, input: ProvisionGithubRepositoryInput) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeDeploymentManifest(repo, input);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }

  throw lastError;
}

export async function provisionGithubRepository(input: ProvisionGithubRepositoryInput) {
  const template = parseTemplateRepository(input.templateRepository);
  if (!template) throw new Error("Template repository must be owner/repo or a GitHub repository URL.");

  const repo = await githubJson<GithubRepository>(`https://api.github.com/repos/${template.owner}/${template.repo}/generate`, input.accessToken, {
    body: JSON.stringify({
      description: `Showrunner deployment for ${input.clientName}`,
      include_all_branches: false,
      name: input.repoName,
      owner: input.repoOwner || undefined,
      private: true
    }),
    method: "POST"
  });

  await writeDeploymentManifestWithRetry(repo, {
    ...input,
    templateRepository: template.value
  });

  return repo;
}
