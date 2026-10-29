"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import { consumeNotification, notificationDuration, type NotificationTone } from "@/lib/admin-notifications";
import { Button } from "./button";

type Notice = { id: number; message: string; tone: NotificationTone };
type Notify = (message: string, tone?: NotificationTone) => void;
const NotificationContext = createContext<Notify | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    // Native modal dialogs make the rest of the page inert, including a shell toast.
    const update = () => setDialog(Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1) ?? null);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    update();
    return () => observer.disconnect();
  }, []);
  const notify = useCallback<Notify>((message, tone = "success") => {
    if (!message.trim()) return;
    const notice = { id: ++sequence.current, message, tone };
    setNotices(current => [...current.filter(item => item.message !== message || item.tone !== tone), notice]);
  }, []);
  const dismiss = useCallback((id: number) => setNotices(current => current.filter(item => item.id !== id)), []);
  const region = <div className="admin-notifications" aria-label="Notifications" role="region">
      {notices.map(notice => <NotificationItem key={notice.id} notice={notice} dismiss={dismiss} />)}
    </div>;
  return <NotificationContext.Provider value={notify}>
    {children}
    {dialog ? createPortal(region, dialog) : region}
  </NotificationContext.Provider>;
}

export function useNotify() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("Notifications require NotificationProvider.");
  return notify;
}

function NotificationItem({ notice, dismiss }: { notice: Notice; dismiss: (id: number) => void }) {
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "danger" ? AlertTriangle : Info;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const duration = notificationDuration(notice.tone, notice.message);
    if (duration === null || hovered || focused || hidden) return;
    const timer = window.setTimeout(() => dismiss(notice.id), duration);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss, hovered, focused, hidden]);
  return <div className={`admin-notification admin-notification-${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <Icon size={18} aria-hidden="true" />
    <strong>{notice.message}</strong>
    <Button type="button" variant="ghost" className="admin-notification-dismiss" aria-label="Dismiss notification"
      onClick={event => {
        if (event.currentTarget === document.activeElement) (event.currentTarget.closest("dialog") ?? document.getElementById("admin-main"))?.focus({ preventScroll: true });
        dismiss(notice.id);
      }}><X size={18} aria-hidden="true" /></Button>
  </div>;
}

/** Pass an action result as eventKey so identical responses from later attempts are announced again. */
export function Notification({ children, tone = "success", queryKey, eventKey }: {
  children: string; tone?: NotificationTone; queryKey?: string; eventKey?: object;
}) {
  const notify = useNotify();
  const delivered = useRef<{ signature: string; eventKey?: object } | null>(null);
  useEffect(() => {
    const signature = `${tone}:${children}`;
    if (queryKey) {
      const nextUrl = consumeNotification(window.location.href, queryKey);
      if (!nextUrl) return;
      window.history.replaceState(window.history.state, "", nextUrl);
    } else if (delivered.current?.signature === signature && delivered.current.eventKey === eventKey) return;
    delivered.current = { signature, eventKey };
    notify(children, tone);
  }); // Recheck flash flags on each server navigation, including identical saves.
  return null;
}
