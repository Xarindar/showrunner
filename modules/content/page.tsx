import { Save } from "lucide-react";
import { getSiteSettings } from "@/lib/site";
import { updateContentAction } from "./actions";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const [{ saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Content</p>
          <h1 style={{ fontSize: "2.4rem" }}>Editable public content</h1>
          <p>Keep this intentionally simple so clients can change copy and imagery without changing layout.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Content saved.</div> : null}

      <form action={updateContentAction} className="card form-grid">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="heroHeadline">Hero headline</label>
            <input id="heroHeadline" name="heroHeadline" defaultValue={settings.heroHeadline} required />
          </div>

          <div className="field">
            <label htmlFor="heroImageUrl">Hero image URL</label>
            <input id="heroImageUrl" name="heroImageUrl" defaultValue={settings.heroImageUrl} required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="heroSubheadline">Hero supporting copy</label>
          <textarea id="heroSubheadline" name="heroSubheadline" defaultValue={settings.heroSubheadline} />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="introTitle">Intro section title</label>
            <input id="introTitle" name="introTitle" defaultValue={settings.introTitle} required />
          </div>
          <div className="field">
            <label htmlFor="introBody">Intro section body</label>
            <textarea id="introBody" name="introBody" defaultValue={settings.introBody} />
          </div>
        </div>

        <button className="button" type="submit">
          <Save size={18} />
          Save content
        </button>
      </form>
    </div>
  );
}
