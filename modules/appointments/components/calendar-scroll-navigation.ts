// Keep the guard across calendar remounts so momentum cannot skip periods.
let lastNavigationAt = 0;

export function bindCalendarScrollNavigation(root: HTMLElement, navigate: (href: string) => void) {
  let pending = false;
  let total = 0;
  let lastWheel = 0;
  let lastDirection = 0;
  let eligible = false;
  let touch: { x: number; y: number; top: boolean; bottom: boolean } | null = null;
  const scrollerFor = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('.appointment-day-overview[data-view="week"], .fc-timegrid .fc-scroller')
    : null;
  const atTop = (el: HTMLElement) => el.scrollTop <= 1;
  const atBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  const move = (direction: number) => {
    if (pending || Date.now() - lastNavigationAt < 1200) return;
    const link = root.querySelector<HTMLAnchorElement>(`a[aria-label="${direction > 0 ? "Next" : "Previous"} range"]`);
    const href = link?.getAttribute("href");
    if (!href) return;
    pending = true;
    lastNavigationAt = Date.now();
    navigate(href);
  };
  const wheel = (event: WheelEvent) => {
    if (window.innerWidth > 860 || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const scroller = scrollerFor(event.target);
    if (!scroller || !event.deltaY) return;
    const direction = Math.sign(event.deltaY);
    const now = Date.now();
    // Start a fresh gesture at the edge; reaching it mid-scroll must not change dates.
    if (now - lastWheel > 200 || lastDirection !== direction) {
      total = 0;
      eligible = direction > 0 ? atBottom(scroller) : atTop(scroller);
    }
    lastWheel = now;
    lastDirection = direction;
    if (!eligible) return;
    event.preventDefault();
    total += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1);
    if (Math.abs(total) >= 80) move(direction);
  };
  const touchStart = (event: TouchEvent) => {
    touch = null;
    if (window.innerWidth > 860 || event.touches.length !== 1) return;
    const scroller = scrollerFor(event.target);
    if (scroller) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, top: atTop(scroller), bottom: atBottom(scroller) };
  };
  const touchEnd = (event: TouchEvent) => {
    const start = touch;
    touch = null;
    if (!start || !event.changedTouches.length) return;
    const delta = start.y - event.changedTouches[0].clientY;
    const horizontal = Math.abs(start.x - event.changedTouches[0].clientX);
    if (Math.abs(delta) >= 80 && Math.abs(delta) > horizontal * 1.3 && (delta > 0 ? start.bottom : start.top)) move(delta);
  };
  const cancel = () => { touch = null; };
  root.addEventListener("wheel", wheel, { passive: false });
  root.addEventListener("touchstart", touchStart, { passive: true });
  root.addEventListener("touchend", touchEnd, { passive: true });
  root.addEventListener("touchcancel", cancel);
  return () => {
    root.removeEventListener("wheel", wheel);
    root.removeEventListener("touchstart", touchStart);
    root.removeEventListener("touchend", touchEnd);
    root.removeEventListener("touchcancel", cancel);
  };
}
