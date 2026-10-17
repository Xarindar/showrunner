import "./design-tokens.css";
import "./design-system.css";

export default function AdminDesignLayout({ children }: { children: React.ReactNode }) {
  return <div className="showrunner-admin">{children}</div>;
}
