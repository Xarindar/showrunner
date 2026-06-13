"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { normalizeValidationRules } from "@/modules/forms/validation-rules";

type SignatureFieldProps = {
  fieldId: string;
  helpText?: string;
  isRequired: boolean;
  label: string;
  name: string;
  placeholder?: string;
  validationRules?: unknown;
};

const consentStatement =
  "I agree that this electronic signature is the legal equivalent of my handwritten signature and that the information submitted with this form is accurate.";

function signaturePayload(input: { drawnDataUrl: string; mode: "TYPED" | "DRAWN"; typedName: string }) {
  return JSON.stringify({
    consentStatement,
    capturedSignature: input.mode === "DRAWN" ? input.drawnDataUrl : input.typedName.trim(),
    signerName: input.typedName.trim(),
    type: input.mode
  });
}

export function SignatureField({ fieldId, helpText, isRequired, label, name, placeholder, validationRules: rawValidationRules }: SignatureFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [mode, setMode] = useState<"TYPED" | "DRAWN">("TYPED");
  const [typedName, setTypedName] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState("");
  const helpId = helpText ? `${fieldId}-help` : undefined;
  const consentId = `${fieldId}-consent`;
  const validationRules = normalizeValidationRules(rawValidationRules);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#111827";
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function beginDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(current.x, current.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    setDrawnDataUrl(event.currentTarget.toDataURL("image/png"));
  }

  function endDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawnDataUrl(event.currentTarget.toDataURL("image/png"));
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnDataUrl("");
  }

  return (
    <div className="field">
      <label htmlFor={`${fieldId}-typed`}>{label}{isRequired ? <span aria-hidden="true"> *</span> : null}</label>
      <input type="hidden" name={name} value={signaturePayload({ drawnDataUrl, mode, typedName })} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input checked={mode === "TYPED"} onChange={() => setMode("TYPED")} name={`${name}-mode`} type="radio" value="TYPED" />
          Type
        </label>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input checked={mode === "DRAWN"} onChange={() => setMode("DRAWN")} name={`${name}-mode`} type="radio" value="DRAWN" />
          Draw
        </label>
      </div>
      <input
        id={`${fieldId}-typed`}
        aria-describedby={helpId}
        autoComplete="name"
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          setTypedName(event.target.value);
        }}
        onInvalid={(event) => {
          if (!event.currentTarget.value.trim() && validationRules.requiredMessage) {
            event.currentTarget.setCustomValidity(validationRules.requiredMessage);
          }
        }}
        placeholder={placeholder || "Type your full legal name"}
        required={isRequired}
        value={typedName}
      />
      {mode === "DRAWN" ? (
        <div className="form-grid">
          <canvas
            aria-label={`${label} drawing area`}
            onPointerDown={beginDrawing}
            onPointerMove={draw}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
            ref={canvasRef}
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              height: 150,
              touchAction: "none",
              width: "100%"
            }}
          />
          <button className="button secondary" onClick={clearDrawing} type="button">
            Clear signature
          </button>
        </div>
      ) : null}
      {helpText ? (
        <small id={helpId} style={{ color: "var(--muted)" }}>
          {helpText}
        </small>
      ) : null}
      <label htmlFor={consentId} style={{ alignItems: "flex-start", display: "flex", gap: 8 }}>
        <input id={consentId} name={`${name}-consent`} required={isRequired || Boolean(typedName || drawnDataUrl)} type="checkbox" />
        <span>{consentStatement}</span>
      </label>
    </div>
  );
}

export { consentStatement as signatureConsentStatement };
