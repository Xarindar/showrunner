import mjml2html from "mjml";
import type { MJMLParseResults, MJMLParsingOptions } from "mjml-core";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { type EmailBuilderBlock, type EmailBuilderDocument, normalizeEmailBuilderDocument } from "./document";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim().replaceAll("\n", "<br />"))
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px 0;">${paragraph}</p>`)
    .join("");
}

function mjmlText(value: string) {
  return textToHtml(value);
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("{{")) return trimmed;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return "";
}

function blockAlign(align: string) {
  return align === "center" || align === "right" ? align : "left";
}

function renderMjmlBlock(block: EmailBuilderBlock, document: EmailBuilderDocument) {
  if (block.type === "heading") {
    const fontSize = block.props.level === "h1" ? 32 : block.props.level === "h2" ? 24 : 18;
    return `<mj-text align="${blockAlign(block.props.align)}" color="${document.body.textColor}" font-family="${escapeHtml(document.body.fontFamily)}" font-size="${fontSize}px" line-height="1.2" padding="0 0 16px 0"><${block.props.level} style="margin:0;">${escapeHtml(block.props.text)}</${block.props.level}></mj-text>`;
  }

  if (block.type === "text") {
    return `<mj-text align="${blockAlign(block.props.align)}" color="${document.body.textColor}" font-family="${escapeHtml(document.body.fontFamily)}" font-size="16px" line-height="1.55" padding="0 0 8px 0">${mjmlText(block.props.text)}</mj-text>`;
  }

  if (block.type === "button") {
    const url = safeUrl(block.props.url);
    if (!url) return "";
    return `<mj-button align="${blockAlign(block.props.align)}" background-color="${block.props.backgroundColor}" border-radius="6px" color="${block.props.textColor}" font-family="${escapeHtml(document.body.fontFamily)}" font-size="16px" font-weight="700" href="${escapeHtml(url)}" padding="12px 0 20px 0">${escapeHtml(block.props.text)}</mj-button>`;
  }

  if (block.type === "image") {
    const src = safeUrl(block.props.src);
    if (!src) return "";
    return `<mj-image align="${blockAlign(block.props.align)}" alt="${escapeHtml(block.props.alt)}" padding="8px 0 20px 0" src="${escapeHtml(src)}" width="${block.props.width}px" />`;
  }

  if (block.type === "divider") {
    return `<mj-divider border-color="${block.props.color}" border-width="1px" padding="16px 0" />`;
  }

  if (block.type === "spacer") {
    return `<mj-spacer height="${block.props.height}px" />`;
  }

  return "";
}

export async function renderEmailBuilderHtml(value: unknown) {
  const document = normalizeEmailBuilderDocument(value);
  const content = document.blocks.map((block) => renderMjmlBlock(block, document)).join("");
  const mjml = [
    `<mjml>`,
    `<mj-body background-color="${document.body.backgroundColor}" width="${document.body.contentWidth}px">`,
    `<mj-section background-color="#ffffff" padding="32px">`,
    `<mj-column>`,
    content,
    `</mj-column>`,
    `</mj-section>`,
    `</mj-body>`,
    `</mjml>`
  ].join("");
  const renderMjml = mjml2html as unknown as (input: string, options?: MJMLParsingOptions) => Promise<MJMLParseResults>;
  const { html, errors } = await renderMjml(mjml, { minify: false, validationLevel: "soft" });

  if (errors.length) {
    const fatalError = errors.find((error) => error.formattedMessage);
    if (fatalError) {
      throw new Error(`Email builder MJML render failed: ${fatalError.formattedMessage}`);
    }
  }

  return sanitizeEmailHtml(html);
}
