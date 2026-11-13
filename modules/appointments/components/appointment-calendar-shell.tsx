"use client";

import { Notification } from "@/components/ui/notifications";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ListChecks, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tab, Tabs } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";

type AppointmentsModalKey = "filters" | "waitlist" | null;

type AppointmentCalendarShellProps = {
  searchQuery: string;
  children: ReactNode;
  errorMessage?: string;
  filterPanel: ReactNode;
  initialPanel?: AppointmentsModalKey;
  savedMessage?: string;
  view: string;
  waitlistCount: number;
  waitlistPanel: ReactNode;
};

export function AppointmentCalendarShell({
  searchQuery,
  children,
  errorMessage,
  filterPanel,
  initialPanel = null,
  savedMessage,
  view,
  waitlistCount,
  waitlistPanel
}: AppointmentCalendarShellProps) {
  const router = useRouter();
  const [openPanel, setOpenPanel] = useState<AppointmentsModalKey>(initialPanel);
  const [searchOpen, setSearchOpen] = useState(Boolean(searchQuery));
  const [draft, setDraft] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousSearchOpen = useRef(searchOpen);
  const searchText = draft ?? searchQuery;
  if (draft !== null && draft === searchQuery) setDraft(null);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
    else if (previousSearchOpen.current) searchButton.current?.focus();
    previousSearchOpen.current = searchOpen;
  }, [searchOpen]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function applySearch(text: string) {
    const url = new URL(window.location.href);
    if (text.trim()) url.searchParams.set("q", text.trim());
    else url.searchParams.delete("q");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }
  function closeSearch() {
    clearTimeout(searchTimer.current);
    setDraft("");
    setSearchOpen(false);
    applySearch("");
  }


  return (
    <section className="appointments-calendar-shell" aria-label="Appointment scheduler">
      <input id="appointment-calendar-view-input" form="appointments-filter-form" name="view" type="hidden" value={view} readOnly />
      <header className="page-header appointments-subtle-header" data-admin-page-header>
        <div className="appointments-subtle-title">
          <h1>Appointments</h1>
        </div>

      </header>

      <div className="appointments-calendar-canvas" data-search-open={searchOpen ? "true" : undefined}>
      <div className="appointments-toolbar" data-search-open={searchOpen ? "true" : undefined}>
        <div className="appointments-toolbar-leading">
        <div className="appointments-toolbar-search" data-search-open={searchOpen ? "true" : undefined}>
          {!searchOpen ? <Button ref={searchButton} type="button" variant="secondary" size="sm" aria-label="Search appointments" aria-expanded={searchOpen} aria-controls={searchOpen ? "appointment-search" : undefined} onClick={() => { setSearchOpen(true); searchInput.current?.focus(); }}>
            <Search size={15} aria-hidden="true" />
          </Button> : null}
          {searchOpen ? <div className="appointments-search-expanded">
            <Search className="appointments-search-glyph" size={15} aria-hidden="true" />
            <input ref={searchInput} id="appointment-search" type="search" aria-label="Search appointments" placeholder="Search appointments" maxLength={200} value={searchText}
              onChange={event => {
                const text = event.target.value;
                setDraft(text);
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => applySearch(text), 250);
              }}
              onKeyDown={event => {
                if (event.key === "Escape") { event.preventDefault(); closeSearch(); }
                if (event.key === "Enter") { event.preventDefault(); clearTimeout(searchTimer.current); applySearch(searchText); }
              }} />
            <Button type="button" variant="ghost" size="sm" aria-label="Close search" className="appointments-search-close" onClick={closeSearch}><X size={15} aria-hidden="true" /></Button>
          </div> : null}
        </div>
          <Button variant="secondary" size="sm" aria-label="Open filters" className="appointments-action-button" onClick={() => setOpenPanel("filters")} title="Filters" type="button">
            <SlidersHorizontal size={16} />
            <span>Filters</span>
          </Button>
        </div>
        <Tabs aria-label="Calendar view" className="appointment-calendar-view-tabs">
          {(["day", "week", "month"] as const).map(item => <Tab key={item} aria-selected={view === item} onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("view", item);
            router.replace(`${url.pathname}${url.search}`);
          }}>{item === "month" ? "Month" : item === "week" ? "Week" : "Day"}</Tab>)}
        </Tabs>
        <div className="appointments-toolbar-actions">


          <Button variant="secondary" size="sm" aria-label={`Open waitlist, ${waitlistCount} waiting`} className="appointments-action-button" onClick={() => setOpenPanel("waitlist")} title="Waitlist" type="button">
            <ListChecks size={16} />
            <span>Waitlist</span>
            <span className="ui-badge">{waitlistCount}</span>
          </Button>
          <ButtonLink className="appointments-new-session" href="/admin/appointments/new" aria-label="New session" title="New session"><Plus className="appointments-new-session-icon" size={16} aria-hidden="true" /><span className="appointments-new-session-label">New session</span></ButtonLink>
        </div>
      </div>

      {savedMessage ? <Notification tone="success" queryKey="saved">{savedMessage}</Notification> : null}
      {errorMessage ? <Notification tone="danger" queryKey="error">{errorMessage}</Notification> : null}
      {children}
      </div>

      <Modal bodyClassName="appointments-modal-body" className="appointments-modal" onClose={() => setOpenPanel(null)} open={openPanel === "filters"} title="Filters">
        {filterPanel}
      </Modal>
      <Modal bodyClassName="appointments-modal-body" className="appointments-modal" onClose={() => setOpenPanel(null)} open={openPanel === "waitlist"} title="Waitlist">
        {waitlistPanel}
      </Modal>
    </section>
  );
}
