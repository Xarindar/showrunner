import { NotificationProvider } from "@/components/ui/notifications";
import "./design-tokens.css";
import "./design-system.css";
import "./loading.css";
import "./notifications.css";

export default function AdminDesignLayout({ children }: { children: React.ReactNode }) {
  return <div className="showrunner-admin"><NotificationProvider>{children}</NotificationProvider></div>;
}
