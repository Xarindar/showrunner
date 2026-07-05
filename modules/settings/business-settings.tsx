import NextImage from "next/image";
import { ImageIcon, Upload, X } from "lucide-react";
import { AssetPicker, Button, EqualGrid, type AssetPickerAsset } from "@/components/ui";

type BusinessSettingsProps = {
  attachFormId: string;
  canUploadLogo: boolean;
  logo: {
    alt: string;
    url: string;
  } | null;
  logoAssets: AssetPickerAsset[];
  removeFormId: string;
  settings: {
    businessName: string;
    contactEmail: string;
    timezone: string;
  };
  uploadFormId: string;
};

export function BusinessSettings({
  attachFormId,
  canUploadLogo,
  logo,
  logoAssets,
  removeFormId,
  settings,
  uploadFormId
}: BusinessSettingsProps) {
  const logoAlt = logo?.alt || `${settings.businessName} logo`;

  return (
    <section className="subpanel form-grid">
      <div>
        <h2 className="compact-title">Business</h2>
        <p>Identity, contact email, timezone, and the reusable logo shown across client-facing surfaces.</p>
      </div>

      <div className="ui-logo-field">
        <AssetPicker
          assets={logoAssets}
          attachFormId={attachFormId}
          canUpload={canUploadLogo}
          defaultAlt={logoAlt}
          emptyLibraryMessage="No reusable logo assets yet."
          title="Site logo"
          triggerClassName={logo ? "ui-logo-picker-trigger has-logo" : "ui-logo-picker-trigger"}
          triggerHint={logo ? "Replace logo" : "Upload logo"}
          uploadFormId={uploadFormId}
          uploadUnavailableMessage="Uploads need Server asset folder, R2, or Cloudflare Images. You can still choose from the library.">
          <span className="ui-logo-preview">
            {logo ? (
              <NextImage alt={logoAlt} fill sizes="160px" src={logo.url} unoptimized />
            ) : (
              <span className="ui-logo-preview-empty">
                <ImageIcon size={24} />
              </span>
            )}
          </span>
        </AssetPicker>

        <div className="ui-logo-copy">
          <strong>Logo</strong>
          <small>{logo ? "Active logo is ready for brand surfaces." : "Upload a reusable logo or choose one from the media library."}</small>
          <span className="ui-logo-actions">
            <span className={logo ? "ui-badge ui-badge-success" : "ui-badge"}>{logo ? "Active" : "Not set"}</span>
            {!logo ? (
              <span className="ui-badge">
                <Upload size={13} />
                Brand asset
              </span>
            ) : null}
          </span>
        </div>

        {logo ? (
          <Button aria-label="Remove logo" form={removeFormId} size="sm" title="Remove logo" type="submit" variant="ghost">
            <X size={15} />
          </Button>
        ) : null}
      </div>

      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" name="businessName" defaultValue={settings.businessName} required />
        </div>
        <div className="ui-field">
          <label htmlFor="contactEmail">Contact email</label>
          <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} required />
        </div>
      </EqualGrid>

      <div className="ui-field">
        <label htmlFor="timezone">Timezone</label>
        <input id="timezone" name="timezone" defaultValue={settings.timezone} required />
      </div>
    </section>
  );
}
