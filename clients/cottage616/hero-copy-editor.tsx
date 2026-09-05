"use client";
import { useState } from "react";
import type { HeroPresentationEditor } from "@/modules/content/hero-presentation";
import { Fields } from "@/modules/content/studio/editor";
import { saveHeroCopy } from "./hero-copy-action";

export function HeroCopyEditor({ initialPresentation, profileKey, revision }: { initialPresentation: HeroPresentationEditor; profileKey: string; revision: string }) {
  const [slides, setSlides] = useState(initialPresentation.slides.map(slide => ({ id: slide.id || slide.clientId, headline: slide.headline, caption: slide.caption, imageUrl: slide.imageUrl, ctaLabel: slide.ctaLabel, ctaHref: slide.ctaHref })));
  const [version, setVersion] = useState(revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="card"><h2>Header / Hero</h2><form onSubmit={async event => {
    event.preventDefault(); setPending(true);
    try { const result = await saveHeroCopy({ profileKey, revision: version, slides }); setMessage(result.error || "Header saved."); if (result.revision) setVersion(result.revision); }
    catch { setMessage("Could not save. Your edits are still here."); } finally { setPending(false); }
  }}><fieldset disabled={pending} className="stack">
    {slides.map((slide, index) => <fieldset key={slide.id}><legend>Image {index + 1}</legend><Fields prefix={`${profileKey}-${slide.id}`} fields={{ headline: { kind: "text", label: "Headline", max: 500 }, caption: { kind: "multiline", label: "Copy", max: 10000 }, imageUrl: { kind: "url", label: "Image URL" }, ctaLabel: { kind: "text", label: "Button label" }, ctaHref: { kind: "url", label: "Button destination" } }} value={slide} onChange={next => setSlides(current => current.map((item, i) => i === index ? next as typeof slide : item))} /></fieldset>)}
    <button type="submit">{pending ? "Saving…" : "Save header"}</button>
  </fieldset><p role="status" aria-live="polite">{message}</p></form></section>;
}
