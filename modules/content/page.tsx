import { Save } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { manifest } from "./module";
import { updateContentAction } from "./actions";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{ saved?: string }>;
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

      <form action={updateContentAction} className="ui-card ui-card-density-normal ui-card-min-none form-grid">
        <div className="grid-2">
          <div className="ui-field">
            <label htmlFor="heroHeadline">Hero headline</label>
            <input id="heroHeadline" name="heroHeadline" defaultValue={settings.heroHeadline} required />
          </div>

          <div className="ui-field">
            <label htmlFor="heroImageUrl">Hero image URL</label>
            <input id="heroImageUrl" name="heroImageUrl" defaultValue={settings.heroImageUrl} required />
          </div>
        </div>

        <div className="ui-field">
          <label htmlFor="heroSubheadline">Hero supporting copy</label>
          <textarea id="heroSubheadline" name="heroSubheadline" defaultValue={settings.heroSubheadline} />
        </div>

        <div className="grid-2">
          <div className="ui-field">
            <label htmlFor="introTitle">Intro section title</label>
            <input id="introTitle" name="introTitle" defaultValue={settings.introTitle} required />
          </div>
          <div className="ui-field">
            <label htmlFor="introBody">Intro section body</label>
            <textarea id="introBody" name="introBody" defaultValue={settings.introBody} />
          </div>
        </div>

        <button className="ui-button" type="submit">
          <Save size={18} />
          Save content
        </button>
      </form>

      <section className="grid-2" aria-label="Content readiness">
        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <span className="ui-badge ui-badge-warning">Partial</span>
          <h2 className="compact-title">Current content scope</h2>
          <p>{manifest.readiness.summary}</p>
        </div>
        <div className="ui-card ui-card-density-normal ui-card-min-md">
          <span className="ui-badge">Planned</span>
          <h2 className="compact-title">SEO foundation</h2>
          <p>{manifest.readiness.primaryGap}</p>
        </div>
      </section>
    </div>
  );
}
