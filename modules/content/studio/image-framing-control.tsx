"use client";

import { createContext, useContext, useId, useRef, useState } from "react";
import { Crop, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { centeredFraming, cropFrame, moveFrame, type ImageFraming } from "./image-framing";
import styles from "./image-framing.module.css";

export const HeaderFrameRatios = createContext<Record<string, number>>({});

export function ImageFramingControl({ source, blockId, ratio, value, onChange }: { source: string; blockId?: string; ratio?: number; value: Record<string, unknown>; onChange: (framing: ImageFraming) => void }) {
  const [open, setOpen] = useState(false);
  const ratios = useContext(HeaderFrameRatios);
  const original = source && typeof window !== "undefined" ? new URL(source, window.location.href) : null;
  if (original && original.origin === window.location.origin && /^\/api\/media\/assets\/[^/]+$/.test(original.pathname)) original.searchParams.set("variant", "DOWNLOAD");
  return <>
    <Button type="button" variant="secondary" disabled={!source} onClick={() => setOpen(true)}><Crop size={16} aria-hidden="true" />Adjust framing</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Adjust image framing" className={styles.dialog}>
      <FramingEditor source={original?.href || source} ratio={ratio || (blockId ? ratios[blockId] : undefined)} initial={{ imagePositionX: Number(value.imagePositionX ?? 50), imagePositionY: Number(value.imagePositionY ?? 50), imageZoom: Number(value.imageZoom ?? 1) }} onCancel={() => setOpen(false)} onApply={framing => { onChange(framing); setOpen(false); }} />
    </Modal>
  </>;
}

function FramingEditor({ source, ratio, initial, onCancel, onApply }: { source: string; ratio?: number; initial: ImageFraming; onCancel: () => void; onApply: (framing: ImageFraming) => void }) {
  const [framing, setFraming] = useState(initial);
  const [imageRatio, setImageRatio] = useState(0);
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; framing: ImageFraming } | null>(null);
  const instructions = useId();
  const frame = cropFrame(imageRatio || 1, ratio || 16 / 9, framing);
  return <div className={styles.editor}>
    <p id={instructions}>Drag the frame to choose what shows. Use arrow keys for small adjustments. The crop follows the current website preview size.</p>
    {failed ? <p role="alert">This photo could not load. Close this window and choose the image again.</p> : <div className={styles.canvas}>
      <div ref={stage} className={styles.stage}>
        {/* The editor needs the original dimensions and must display the entire photo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} alt="Full photo" draggable={false} onLoad={event => setImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} onError={() => setFailed(true)} />
        {imageRatio > 0 && <button type="button" className={styles.frame} aria-label="Move crop frame" aria-describedby={instructions}
          style={{ width: `${frame.width * 100}%`, height: `${frame.height * 100}%`, left: `${frame.left * 100}%`, top: `${frame.top * 100}%` }}
          onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, framing }; }}
          onPointerMove={event => { if (!drag.current || !stage.current) return; const bounds = stage.current.getBoundingClientRect(); const start = drag.current; setFraming(moveFrame(start.framing, cropFrame(imageRatio, ratio || 16 / 9, start.framing), (event.clientX - start.x) / bounds.width, (event.clientY - start.y) / bounds.height)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={event => { const delta = event.shiftKey ? 0.05 : 0.01; const directions: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }; if (directions[event.key]) { event.preventDefault(); setFraming(moveFrame(framing, frame, ...directions[event.key])); } }}>
          <span className={styles.grid} aria-hidden="true" />
        </button>}
      </div>
    </div>}
    <label className={styles.zoom}>Zoom <output>{framing.imageZoom.toFixed(1)}×</output><input type="range" min="1" max="3" step="0.05" value={framing.imageZoom} disabled={!imageRatio || failed} onChange={event => setFraming({ ...framing, imageZoom: Number(event.target.value) })} /></label>
    <div className={styles.actions}>
      <Button type="button" variant="ghost" onClick={() => setFraming({ ...centeredFraming })}><RotateCcw size={16} aria-hidden="true" />Reset</Button>
      <div className="module-modal-actions"><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="button" disabled={!imageRatio || failed || !ratio} onClick={() => onApply(framing)}>Apply framing</Button></div>
    </div>
    {!ratio && <p role="status">Waiting for the website preview to measure this image…</p>}
  </div>;
}
