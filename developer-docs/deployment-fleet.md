# Showrunner deployment fleet

Inventory verified against accessible Railway projects during the October 2026 release pass. Re-run discovery before future rollouts; historical "beta" labels do not establish isolation. This is an inventory, not credentials or authorization for a future deployment.

## Active web targets

All four currently source `Xarindar/showrunner` on `main`.

| Installation | Project / environment / service IDs | Primary URL |
| --- | --- | --- |
| Cottage616 | `e72b421f-abca-48d4-aa39-c805456d9d13` / `536cb800-6976-4af2-b85a-2c11ea508636` / `c4bdb224-7a55-4f27-b4e4-ed26021bd792` | https://admin.cottage616.com |
| Jazzr Photography | `f8cb2d27-0934-4bf2-9460-5f1fc958160b` / `bf30358a-fbca-43f3-a223-27aac283374f` / `ac33aad7-a1d8-4a4d-938a-c7d413b3c8b0` | https://admin.jazzrphotography.com |
| Admit One | `20900b03-1e55-4afc-b525-23d4b80c65f2` / `838af607-18fd-4007-b53c-d7aa4ca8ca4a` / `785c8f23-f571-4abd-8f72-8b783de6a960` | https://admin.admitonedesign.com |
| Older Cottage installation | `3f36cf50-7717-4320-952c-d7c084f4adbe` / `0ef8c743-66f2-4a81-8ab4-d39845e2fdc9` / `2bd6518c-7ef0-4f11-b99e-33f56f7ea45f` | https://showrunner-production-e684.up.railway.app |

The older Cottage Showrunner remains active even though the former Cottage website was stopped/disconnected during the domain move. Do not confuse their service IDs or delete their data.

Admit One also has the `square-token-refresh` worker (`0dda6c82-a848-4f58-8d7e-1b1411e25d1d`) sourced from the same repository. Check its effective cron/start configuration separately from web health. A cron deployment can be stopped between successful runs; that alone does not mean it is abandoned.

The separate Jazzr project `c98a67d4-1480-4b22-8c27-9b1ebfbc1785` contains `showrunner-beta` (`1cd4c0e1-ca49-46ed-898d-8c8dddf82f12`) with no source or deployment at discovery time. It is not an active rollout target. Do not initialize it as an incidental update.

## Discovery and release procedure

Use the Railway connector when authenticated, or the installed CLI:

```powershell
railway list --json
railway status --project PROJECT_ID --environment ENVIRONMENT_ID --json
railway deployment list --project PROJECT_ID --environment ENVIRONMENT_ID --service SERVICE_ID --limit 3 --json
```

Inventory accessible environments, repository sources, active deployments, revisions and domains. Avoid printing variables or secret-bearing local harness files. Specify project/environment/service IDs rather than relying on a linked CLI default.

A push to a tracked branch may start deployments automatically. Observe those deployments before manually uploading an archive. If Git deployment does not start, use a clean `git archive` of the reviewed commit and `railway up` with explicit selectors. Preserve per-service configuration, domains, storage and secrets; do not run seeds or reset databases during an update.

For each web target, record the new deployment ID/revision, wait for success, then check `/api/health`, login rendering, admin styles and relevant browser/public flows. Worker verification must check its own deployment/run status. Preserve the previous deployment ID for recovery; rollback does not automatically reverse database migrations.

Keep release-specific results in the release report. This inventory is not proof that a later commit reached the fleet.
