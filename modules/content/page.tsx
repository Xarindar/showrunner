import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { manifest } from "./module";
import { updateContentAction } from "./actions";
import { HeroContentEditor } from "./hero-content-editor";
import { getHeroPresentationForSite } from "./hero-presentation.server";
import { Card, EqualGrid } from "@/components/ui";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{saved?: string;}>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  await requireAdmin("content:manage");
  const [{ saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const heroPresentation = await getHeroPresentationForSite(settings.siteId, settings);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Content</p>
          <h1>Homepage hero studio</h1>
          <p>Compose the public hero, slideshow screens, calls to action, and intro copy in one workspace.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Content saved.</div> : null}

      <HeroContentEditor action={updateContentAction} initialPresentation={heroPresentation} settings={settings} />

      <EqualGrid aria-label="Content readiness" as="section">
        <Card>
          <span className="ui-badge ui-badge-warning">Partial</span>
          <h2 className="compact-title">Current content scope</h2>
          <p>{manifest.readiness.summary}</p>
        </Card>
        <Card>
          <span className="ui-badge">Planned</span>
          <h2 className="compact-title">SEO foundation</h2>
          <p>{manifest.readiness.primaryGap}</p>
        </Card>
      </EqualGrid>
    </div>);

}
