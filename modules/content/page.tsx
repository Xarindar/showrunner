import { Save } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { manifest } from "./module";
import { updateContentAction } from "./actions";
import { Button, Card, EqualGrid } from "@/components/ui";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{saved?: string;}>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  await requireAdmin("content:manage");
  const [{ saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Content</p>
          <h1>Editable public content</h1>
          <p>Keep this intentionally simple so clients can change copy and imagery without changing layout.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Content saved.</div> : null}

      <Card action={updateContentAction} as="form" minHeight="none" bodyClassName="form-grid">
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="heroHeadline">Hero headline</label>
            <input id="heroHeadline" name="heroHeadline" defaultValue={settings.heroHeadline} required />
          </div>

          <div className="ui-field">
            <label htmlFor="heroImageUrl">Hero image URL</label>
            <input id="heroImageUrl" name="heroImageUrl" defaultValue={settings.heroImageUrl} required />
          </div>
        </EqualGrid>

        <div className="ui-field">
          <label htmlFor="heroSubheadline">Hero supporting copy</label>
          <textarea id="heroSubheadline" name="heroSubheadline" defaultValue={settings.heroSubheadline} />
        </div>

        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="introTitle">Intro section title</label>
            <input id="introTitle" name="introTitle" defaultValue={settings.introTitle} required />
          </div>
          <div className="ui-field">
            <label htmlFor="introBody">Intro section body</label>
            <textarea id="introBody" name="introBody" defaultValue={settings.introBody} />
          </div>
        </EqualGrid>

        <Button type="submit">
          <Save size={18} />
          Save content
        </Button>
      </Card>

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
