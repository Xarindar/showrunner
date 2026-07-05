import { defaultTemplateRepository, getGithubOAuthConfig, parseTemplateRepository } from "@/lib/deployments/github";
import { warning, type ModuleHealthCheck, type PlatformWarning } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings: PlatformWarning[] = [];
  const templateRepository = defaultTemplateRepository();

  if (!getGithubOAuthConfig()) {
    warnings.push(
      warning(
        "GitHub OAuth is not configured",
        "Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET before sending client deployment invites.",
        "warning",
        "deployments",
        "/admin/modules/deployments"
      )
    );
  }

  if (!templateRepository || !parseTemplateRepository(templateRepository)) {
    warnings.push(
      warning(
        "Deployment template repository is missing",
        "Set DEPLOYMENT_TEMPLATE_REPOSITORY to the owner/repo template used for generated client repositories.",
        "warning",
        "deployments",
        "/admin/modules/deployments"
      )
    );
  }

  return warnings;
};
