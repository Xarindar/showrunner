import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import "./theme.css";

/** Tenant branding is confined to public routes; admin owns its own tokens. */
export async function PublicTheme({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return <div className="public-theme" style={themeToCssVars(settings)}>{children}</div>;
}
