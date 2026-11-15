import NextImage from "next/image";
import Link from "next/link";
import { Upload, X } from "lucide-react";
import { AssetPicker, Button, EqualGrid, type AssetPickerAsset } from "@/components/ui";

type Logo = { alt: string; url: string } | null;

type BusinessSettingsProps = {
  attachFormId: string;
  canUploadLogo: boolean;
  logo: Logo;
  emailLogoFields: { key: string; name: string; formId: string; logo: Logo }[];
  logoAssets: AssetPickerAsset[];
  removeFormId: string;
  settings: {
    businessName: string;
    contactEmail: string;
    timezone: string;
    enabledModuleIds?: string[];
  };
  uploadFormId: string;
};

export function BusinessSettings({
  attachFormId,
  canUploadLogo,
  emailLogoFields,
  logo,
  logoAssets,
  removeFormId,
  settings,
  uploadFormId
}: BusinessSettingsProps) {
  const contactInContent = settings.enabledModuleIds?.includes("content");

  return (
    <section className="subpanel form-grid">
      <div>
        <h2 className="compact-title">Business</h2>
        <p>Identity, contact email, and the reusable logo shown across client-facing surfaces.</p>
      </div>

      <LogoField
        title="Site logo" logo={logo} alt={`${settings.businessName} logo`} assets={logoAssets} canUpload={canUploadLogo}
        attachFormId={attachFormId} uploadFormId={uploadFormId} removeFormId={removeFormId}
        help="Upload a reusable logo or choose one from the media library."
      />
      {emailLogoFields.map(brand => (
        <LogoField
          key={brand.key}
          title={emailLogoFields.length > 1 ? `${brand.name} email header logo` : "Email header logo"}
          logo={brand.logo} alt={`${brand.name} logo`} assets={logoAssets} canUpload={canUploadLogo}
          attachFormId={brand.formId} uploadFormId={brand.formId} removeFormId={`${brand.formId}-remove`}
          help="Uses the site logo or business name when left empty."
        />
      ))}

      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" name="businessName" defaultValue={settings.businessName} readOnly={contactInContent} required />
        </div>
        <div className="ui-field">
          <label htmlFor="contactEmail">Contact email</label>
          <input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} readOnly={contactInContent} required />
        </div>
      </EqualGrid>

      <input type="hidden" name="timezone" value={settings.timezone} />
      {contactInContent ? <Link href="/admin/modules/content?section=business-info">Edit contact details in Content → Contact / Business Info</Link> : null}
    </section>
  );
}

function LogoField({ title, logo, alt, assets, canUpload, attachFormId, uploadFormId, removeFormId, help }: {
  title: string; logo: Logo; alt: string; assets: AssetPickerAsset[]; canUpload: boolean;
  attachFormId: string; uploadFormId: string; removeFormId: string; help: string;
}) {
  const logoAlt = logo?.alt || alt;
  return (
    <div className="ui-logo-field">
        <AssetPicker
          assets={assets}
          attachFormId={attachFormId}
          canUpload={canUpload}
          defaultAlt={logoAlt}
          emptyLibraryMessage="No reusable logo assets yet."
          title={title}
          triggerClassName={logo ? "ui-logo-picker-trigger has-logo" : "ui-logo-picker-trigger"}
          triggerHint={logo ? `Replace ${title}` : ""}
          uploadFormId={uploadFormId}
          uploadUnavailableMessage="Uploads need Server asset folder, Railway/S3 bucket, R2, or Cloudflare Images. You can still choose from the library.">
          <span className="ui-logo-preview">
            {logo ? (
              <NextImage alt={logoAlt} fill sizes="160px" src={logo.url} unoptimized />
            ) : (
              <span className="ui-logo-preview-empty">
                <Upload aria-hidden="true" size={24} />
                <span>Pick an image</span>
              </span>
            )}
          </span>
        </AssetPicker>

        <div className="ui-logo-copy">
          <strong>{title}</strong>
          {!logo ? <small>{help}</small> : null}
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
          <Button aria-label={`Remove ${title}`} form={removeFormId} size="sm" title={`Remove ${title}`} type="submit" variant="ghost">
            <X size={15} />
          </Button>
        ) : null}
    </div>
  );
}
