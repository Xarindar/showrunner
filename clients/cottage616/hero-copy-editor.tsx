"use client";
import { useState } from "react";
import type { HeroPresentationEditor } from "@/modules/content/hero-presentation";
import { VisualBlock } from "@/modules/content/studio/visual-block";
import { configuredBlock } from "@/modules/content/studio/manifest";
import styles from "@/modules/content/studio/studio.module.css";
import { saveHeroCopy } from "./hero-copy-action";

export function HeroCopyEditor({ initialPresentation, profileKey, revision, canUpload = false }: { initialPresentation: HeroPresentationEditor; profileKey: string; revision: string; canUpload?: boolean }) {
  const [slides, setSlides] = useState(initialPresentation.slides.map(slide => ({ id: slide.id || slide.clientId, headline: slide.headline, caption: slide.caption, imageUrl: slide.imageUrl, ctaLabel: slide.ctaLabel, ctaHref: slide.ctaHref })));
  const [version, setVersion] = useState(revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <section className={styles.card}><h2>Header / Hero</h2><form onSubmit={async event => {
    event.preventDefault(); setPending(true);
    try { const result = await saveHeroCopy({ profileKey, revision: version, slides }); setMessage(result.error || "Header saved."); if (result.revision) setVersion(result.revision); }
    catch { setMessage("Could not save. Your edits are still here."); } finally { setPending(false); }
  }}><fieldset disabled={pending} className={styles.fields}>
    {slides.map((slide, index) => <VisualBlock key={slide.id} block={configuredBlock(`${profileKey}-${slide.id}`, "hero", [], { label: `Slide ${index + 1}`, presentation: { variant: "hero-slide", assetBaseUrl: "https://cottage616-production.up.railway.app/" } })} canUpload={canUpload} choices={[]} fields={{ headline: { kind: "text", label: "Headline", max: 500 }, caption: { kind: "multiline", label: "Copy", max: 10000 }, imageUrl: { kind: "url", label: "Image URL" }, ctaLabel: { kind: "text", label: "Button label" }, ctaHref: { kind: "url", label: "Button destination" } }} payload={slide} onChange={next => setSlides(current => current.map((item, i) => i === index ? next as typeof slide : item))} />)}
    <button type="submit">{pending ? "Saving…" : "Save header"}</button>
  </fieldset><p role="status" aria-live="polite">{message}</p></form></section>;
}
