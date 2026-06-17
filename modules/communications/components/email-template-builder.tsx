"use client";

import { ArrowDown, ArrowUp, Image as ImageIcon, Minus, Plus, Square, Trash2, Type } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type EmailBuilderBlock,
  type EmailBuilderDocument,
  emailBuilderDocumentFromText,
  normalizeEmailBuilderDocument
} from "@/lib/email-builder/document";

type EmailTemplateBuilderProps = {
  availableTokens: string[];
  builderJson: unknown;
  idPrefix: string;
  previewText: string;
  requiredTokens: string[];
  subject: string;
  textBody: string;
};

type BlockType = EmailBuilderBlock["type"];

function blockId(type: BlockType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${type}-${crypto.randomUUID()}`;
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newBlock(type: BlockType): EmailBuilderBlock {
  if (type === "heading") {
    return { id: blockId(type), type, props: { align: "left", level: "h2", text: "New heading" } };
  }
  if (type === "button") {
    return { id: blockId(type), type, props: { align: "left", backgroundColor: "#116466", text: "Open link", textColor: "#ffffff", url: "" } };
  }
  if (type === "image") {
    return { id: blockId(type), type, props: { align: "center", alt: "", src: "", width: 560 } };
  }
  if (type === "divider") {
    return { id: blockId(type), type, props: { color: "#d1d5db" } };
  }
  if (type === "spacer") {
    return { id: blockId(type), type, props: { height: 24 } };
  }
  return { id: blockId(type), type: "text", props: { align: "left", text: "New paragraph" } };
}

function blockLabel(block: EmailBuilderBlock) {
  if (block.type === "heading") return "Heading";
  if (block.type === "button") return "Button";
  if (block.type === "image") return "Image";
  if (block.type === "divider") return "Divider";
  if (block.type === "spacer") return "Spacer";
  return "Text";
}

function blockIcon(type: BlockType) {
  if (type === "heading" || type === "text") return <Type size={16} />;
  if (type === "image") return <ImageIcon size={16} />;
  if (type === "divider") return <Minus size={16} />;
  if (type === "spacer") return <Square size={16} />;
  return <Plus size={16} />;
}

function textBodyFromDocument(document: EmailBuilderDocument) {
  return document.blocks
    .map((block) => {
      if (block.type === "heading" || block.type === "text" || block.type === "button") return block.props.text;
      if (block.type === "image") return block.props.alt;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function withAlign(block: EmailBuilderBlock, align: "left" | "center" | "right"): EmailBuilderBlock {
  if (block.type === "heading") return { ...block, props: { ...block.props, align } };
  if (block.type === "text") return { ...block, props: { ...block.props, align } };
  if (block.type === "button") return { ...block, props: { ...block.props, align } };
  if (block.type === "image") return { ...block, props: { ...block.props, align } };
  return block;
}

export function EmailTemplateBuilder(props: EmailTemplateBuilderProps) {
  const initialDocument = useMemo(() => {
    try {
      return normalizeEmailBuilderDocument(props.builderJson);
    } catch {
      return emailBuilderDocumentFromText(props.textBody);
    }
  }, [props.builderJson, props.textBody]);
  const [document, setDocument] = useState<EmailBuilderDocument>(initialDocument);
  const [subject, setSubject] = useState(props.subject);
  const [previewText, setPreviewText] = useState(props.previewText);
  const [textBody, setTextBody] = useState(props.textBody || textBodyFromDocument(initialDocument));

  const serializedDocument = JSON.stringify(document);

  function updateBlock(blockId: string, next: EmailBuilderBlock) {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? next : block))
    }));
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    setDocument((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.blocks.length) return current;
      const blocks = [...current.blocks];
      const [item] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, item);
      return { ...current, blocks };
    });
  }

  function removeBlock(blockId: string) {
    setDocument((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }));
  }

  function addBlock(type: BlockType) {
    setDocument((current) => ({ ...current, blocks: [...current.blocks, newBlock(type)] }));
  }

  function syncTextFallback() {
    setTextBody(textBodyFromDocument(document));
  }

  return (
    <div className="form-grid">
      <input name="builderJson" type="hidden" value={serializedDocument} readOnly />
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${props.idPrefix}-subject`}>Subject</label>
          <input id={`${props.idPrefix}-subject`} name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${props.idPrefix}-preview`}>Preview text</label>
          <input id={`${props.idPrefix}-preview`} name="previewText" value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${props.idPrefix}-background`}>Background</label>
          <input
            id={`${props.idPrefix}-background`}
            type="color"
            value={document.body.backgroundColor}
            onChange={(event) =>
              setDocument((current) => ({ ...current, body: { ...current.body, backgroundColor: event.target.value } }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor={`${props.idPrefix}-text-color`}>Text color</label>
          <input
            id={`${props.idPrefix}-text-color`}
            type="color"
            value={document.body.textColor}
            onChange={(event) => setDocument((current) => ({ ...current, body: { ...current.body, textColor: event.target.value } }))}
          />
        </div>
      </div>

      <div className="subpanel form-grid">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["heading", "text", "button", "image", "divider", "spacer"] as BlockType[]).map((type) => (
            <button className="button secondary" key={type} type="button" onClick={() => addBlock(type)}>
              {blockIcon(type)}
              {type}
            </button>
          ))}
        </div>

        {document.blocks.map((block) => (
          <div className="subpanel form-grid" key={block.id}>
            <div className="page-header" style={{ marginBottom: 4 }}>
              <strong>{blockLabel(block)}</strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="button secondary" type="button" onClick={() => moveBlock(block.id, -1)} aria-label="Move up">
                  <ArrowUp size={16} />
                </button>
                <button className="button secondary" type="button" onClick={() => moveBlock(block.id, 1)} aria-label="Move down">
                  <ArrowDown size={16} />
                </button>
                <button className="button danger" type="button" onClick={() => removeBlock(block.id)} aria-label="Delete block">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {block.type === "heading" && (
              <>
                <div className="field">
                  <label htmlFor={`${block.id}-level`}>Level</label>
                  <select
                    id={`${block.id}-level`}
                    value={block.props.level}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, level: event.target.value as "h1" | "h2" | "h3" } })}
                  >
                    <option value="h1">h1</option>
                    <option value="h2">h2</option>
                    <option value="h3">h3</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${block.id}-text`}>Text</label>
                  <textarea
                    id={`${block.id}-text`}
                    value={block.props.text}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, text: event.target.value } })}
                  />
                </div>
              </>
            )}

            {block.type === "text" && (
              <div className="field">
                <label htmlFor={`${block.id}-text`}>Text</label>
                <textarea
                  id={`${block.id}-text`}
                  value={block.props.text}
                  onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, text: event.target.value } })}
                />
              </div>
            )}

            {block.type === "button" && (
              <div className="grid-2">
                <div className="field">
                  <label htmlFor={`${block.id}-button-text`}>Button text</label>
                  <input
                    id={`${block.id}-button-text`}
                    value={block.props.text}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, text: event.target.value } })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${block.id}-button-url`}>Button URL</label>
                  <input
                    id={`${block.id}-button-url`}
                    value={block.props.url}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, url: event.target.value } })}
                  />
                </div>
              </div>
            )}

            {block.type === "image" && (
              <div className="grid-2">
                <div className="field">
                  <label htmlFor={`${block.id}-image-src`}>Image URL</label>
                  <input
                    id={`${block.id}-image-src`}
                    value={block.props.src}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, src: event.target.value } })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${block.id}-image-alt`}>Alt text</label>
                  <input
                    id={`${block.id}-image-alt`}
                    value={block.props.alt}
                    onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, alt: event.target.value } })}
                  />
                </div>
              </div>
            )}

            {block.type === "divider" && (
              <div className="field">
                <label htmlFor={`${block.id}-divider-color`}>Divider color</label>
                <input
                  id={`${block.id}-divider-color`}
                  type="color"
                  value={block.props.color}
                  onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, color: event.target.value } })}
                />
              </div>
            )}

            {block.type === "spacer" && (
              <div className="field">
                <label htmlFor={`${block.id}-spacer-height`}>Height</label>
                <input
                  id={`${block.id}-spacer-height`}
                  type="number"
                  min="8"
                  max="80"
                  value={block.props.height}
                  onChange={(event) => updateBlock(block.id, { ...block, props: { ...block.props, height: Number(event.target.value) } })}
                />
              </div>
            )}

            {"align" in block.props ? (
              <div className="field">
                <label htmlFor={`${block.id}-align`}>Align</label>
                <select
                  id={`${block.id}-align`}
                  value={block.props.align}
                  onChange={(event) => updateBlock(block.id, withAlign(block, event.target.value as "left" | "center" | "right"))}
                >
                  <option value="left">left</option>
                  <option value="center">center</option>
                  <option value="right">right</option>
                </select>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="field">
        <label htmlFor={`${props.idPrefix}-text-fallback`}>Text fallback</label>
        <textarea id={`${props.idPrefix}-text-fallback`} name="textBody" value={textBody} onChange={(event) => setTextBody(event.target.value)} required />
      </div>
      <button className="button secondary" type="button" onClick={syncTextFallback}>
        <Type size={16} />
        Sync text fallback
      </button>
      <small className="muted-text">
        Required tokens: {props.requiredTokens.join(", ") || "none"}. Available tokens: {props.availableTokens.join(", ") || "none"}.
      </small>
    </div>
  );
}
