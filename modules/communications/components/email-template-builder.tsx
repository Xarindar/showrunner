"use client";

import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import type { Content } from "@tiptap/core";
import { CheckCircle2, Copy, Eye, FileText, Heading1, Image as ImageIcon, Link as LinkIcon, List, Minus, Plus, Save, Settings, Type, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REACT_EMAIL_BUILDER_RENDERER,
  isReactEmailBuilderDocument,
  normalizeEmailBuilderDocument
} from "@/lib/email-builder/document";
import { Button } from "@/components/ui";

type SenderIdentityOption = {
  id: string;
  fromEmail: string;
  name: string;
};

type EmailTemplateBuilderProps = {
  availableTokens: string[];
  builderJson: unknown;
  htmlBody: string;
  id: string;
  idPrefix: string;
  isBuilderTemplate: boolean;
  previewText: string;
  purposeLabel: string;
  requiredTokens: string[];
  selectedSenderIdentityId?: string | null;
  senderIdentities: SenderIdentityOption[];
  subject: string;
  templateKey: string;
  templateName: string;
  textBody: string;
  updateAction: (formData: FormData) => Promise<void>;
};

type WizardStep = "setup" | "design" | "review";

const wizardSteps: { id: WizardStep; icon: LucideIcon; label: string }[] = [
  { id: "setup", icon: Settings, label: "Setup" },
  { id: "design", icon: Type, label: "Design" },
  { id: "review", icon: Eye, label: "Review" }
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return "<h1>{{businessName}}</h1><p>Hi {{customerName}},</p><p>Add your message here.</p>";
  }

  return paragraphs
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function firstPartyBuilderToHtml(builderJson: unknown, textBody: string) {
  try {
    const document = normalizeEmailBuilderDocument(builderJson);
    const html = document.blocks
      .map((block) => {
        if (block.type === "heading") {
          return `<${block.props.level}>${escapeHtml(block.props.text)}</${block.props.level}>`;
        }

        if (block.type === "text") {
          return textToHtml(block.props.text);
        }

        if (block.type === "button") {
          const href = escapeHtml(block.props.url || "https://example.com");
          return `<p><a href="${href}">${escapeHtml(block.props.text)}</a></p>`;
        }

        if (block.type === "image" && block.props.src) {
          return `<p><img src="${escapeHtml(block.props.src)}" alt="${escapeHtml(block.props.alt)}" width="${block.props.width}" /></p>`;
        }

        if (block.type === "divider") {
          return "<hr />";
        }

        if (block.type === "spacer") {
          return "<p><br /></p>";
        }

        return "";
      })
      .filter(Boolean)
      .join("");

    return html || textToHtml(textBody);
  } catch {
    return textToHtml(textBody);
  }
}

function parseBuilderJson(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function initialEditorContent(builderJson: unknown, htmlBody: string, textBody: string) {
  const parsed = parseBuilderJson(builderJson);

  if (isReactEmailBuilderDocument(parsed)) {
    return parsed.editorJson;
  }

  return firstPartyBuilderToHtml(parsed, textBody) || htmlBody || textToHtml(textBody);
}

function reactEmailBuilderJson(editorJson: unknown) {
  return JSON.stringify({
    version: 2,
    renderer: REACT_EMAIL_BUILDER_RENDERER,
    editorJson
  });
}

function emptyEditorJson() {
  return {
    type: "doc",
    content: []
  };
}

export function EmailTemplateBuilder(props: EmailTemplateBuilderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<EmailEditorRef>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);
  const builderJsonInputRef = useRef<HTMLInputElement>(null);
  const htmlBodyInputRef = useRef<HTMLInputElement>(null);
  const textBodyInputRef = useRef<HTMLInputElement>(null);

  const [initialContent] = useState(() => initialEditorContent(props.builderJson, props.htmlBody, props.textBody));
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("setup");
  const [editorReady, setEditorReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [subject, setSubject] = useState(props.subject);
  const [previewText, setPreviewText] = useState(props.previewText);
  const [textBody, setTextBody] = useState(props.textBody);
  const [textFallbackDirty, setTextFallbackDirty] = useState(false);
  const [htmlBody, setHtmlBody] = useState(props.htmlBody || textToHtml(props.textBody));
  const [builderJsonValue, setBuilderJsonValue] = useState(() => reactEmailBuilderJson(emptyEditorJson()));

  const tokenLabel = useMemo(() => props.availableTokens.join(", ") || "No tokens available", [props.availableTokens]);

  const writeHiddenValues = useCallback((next: { builderJson: string; htmlBody: string; textBody: string }) => {
    if (builderJsonInputRef.current) builderJsonInputRef.current.value = next.builderJson;
    if (htmlBodyInputRef.current) htmlBodyInputRef.current.value = next.htmlBody;
    if (textBodyInputRef.current) textBodyInputRef.current.value = next.textBody;
  }, []);

  const exportEditorDocument = useCallback(
    async (ref = editorRef.current, options?: { preserveTextFallback?: boolean }) => {
      if (!ref) {
        setEditorError("The editor is still loading.");
        return false;
      }

      const editorJson = ref.getJSON();
      const email = await ref.getEmail();
      const shouldKeepTextFallback = options?.preserveTextFallback || textFallbackDirty || textBody.trim().length > 0;
      const nextTextBody = shouldKeepTextFallback ? textBody : email.text;
      const nextBuilderJson = reactEmailBuilderJson(editorJson);

      if (!email.html.trim()) {
        setEditorError("Add at least one renderable block before saving.");
        return false;
      }

      setEditorError("");
      setBuilderJsonValue(nextBuilderJson);
      setHtmlBody(email.html);
      setTextBody(nextTextBody);
      writeHiddenValues({
        builderJson: nextBuilderJson,
        htmlBody: email.html,
        textBody: nextTextBody
      });
      return true;
    },
    [textBody, textFallbackDirty, writeHiddenValues]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    writeHiddenValues({
      builderJson: builderJsonValue,
      htmlBody,
      textBody
    });
  }, [builderJsonValue, htmlBody, textBody, writeHiddenValues]);

  async function goToStep(nextStep: WizardStep) {
    if (nextStep === "review") {
      const exported = await exportEditorDocument();
      if (!exported) return;
    }

    setStep(nextStep);
  }

  function insertHtml(html: string) {
    editorRef.current?.editor?.chain().focus().insertContent(html).run();
    void exportEditorDocument();
  }

  function insertToken(token: string) {
    editorRef.current?.editor?.chain().focus().insertContent(`{{${token}}}`).run();
    void navigator.clipboard?.writeText(`{{${token}}}`);
    void exportEditorDocument();
  }

  function updateTextFallback(value: string) {
    setTextFallbackDirty(true);
    setTextBody(value);
    if (textBodyInputRef.current) textBodyInputRef.current.value = value;
  }

  async function handleSave() {
    if (!formRef.current?.reportValidity()) return;

    setIsSaving(true);
    const exported = await exportEditorDocument(undefined, { preserveTextFallback: true });
    if (!exported) {
      setIsSaving(false);
      return;
    }

    allowSubmitRef.current = true;
    formRef.current?.requestSubmit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) {
      allowSubmitRef.current = false;
      return;
    }

    event.preventDefault();
    void handleSave();
  }

  return (
    <form action={props.updateAction} className="email-template-launcher-form" onSubmit={handleSubmit} ref={formRef}>
      <input name="id" type="hidden" value={props.id} readOnly />
      <input name="builderJson" type="hidden" defaultValue={builderJsonValue} ref={builderJsonInputRef} />
      <input name="htmlBody" type="hidden" defaultValue={htmlBody} ref={htmlBodyInputRef} />
      <input name="textBody" type="hidden" defaultValue={textBody} ref={textBodyInputRef} />

      <div className="email-template-launcher-row">
        <div className="email-template-launcher-main">
          <span className={props.isBuilderTemplate ? "ui-badge ui-badge-success" : "ui-badge"}>{props.isBuilderTemplate ? "builder" : "text"}</span>
          <div>
            <strong>{props.templateName}</strong>
            <small className="muted-text">{props.templateKey || props.purposeLabel}</small>
          </div>
        </div>
        <div className="email-template-launcher-meta">
          <small className="muted-text">Required: {props.requiredTokens.join(", ") || "none"}</small>
          <Button type="button" onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Open playground
          </Button>
        </div>
      </div>

      <dialog className="email-playground-dialog" onClose={() => setIsOpen(false)} ref={dialogRef}>
        <div className="email-playground-shell">
          <header className="email-playground-header">
            <div>
              <span className="eyebrow">{props.templateKey || props.purposeLabel}</span>
              <h2>{props.templateName}</h2>
            </div>
            <div className="email-playground-header-actions">
              <Button type="button" variant="secondary" onClick={() => void goToStep("review")}>
                <Eye size={16} />
                Preview
              </Button>
              <Button type="button" onClick={handleSave} disabled={!editorReady || isSaving}>
                <Save size={16} />
                {isSaving ? "Saving" : "Save"}
              </Button>
              <Button type="button" variant="ghost" aria-label="Close playground" onClick={() => setIsOpen(false)}>
                <X size={18} />
              </Button>
            </div>
          </header>

          <div className="email-playground-steps" aria-label="Builder steps">
            {wizardSteps.map((item) => {
              const Icon = item.icon;
              const isActive = step === item.id;
              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={isActive ? "is-active" : ""}
                  key={item.id}
                  onClick={() => void goToStep(item.id)}
                  type="button">
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="email-playground-body">
            <aside className="email-playground-sidebar">
              <div>
                <h3>Blocks</h3>
                <div className="email-block-tools">
                  <button type="button" onClick={() => insertHtml("<h2>New heading</h2>")}>
                    <Heading1 size={16} />
                    Heading
                  </button>
                  <button type="button" onClick={() => insertHtml("<p>New paragraph</p>")}>
                    <Type size={16} />
                    Text
                  </button>
                  <button type="button" onClick={() => insertHtml('<p><a href="https://example.com">Call to action</a></p>')}>
                    <LinkIcon size={16} />
                    Link
                  </button>
                  <button type="button" onClick={() => insertHtml('<p><img src="https://placehold.co/640x320" alt="Email image" /></p>')}>
                    <ImageIcon size={16} />
                    Image
                  </button>
                  <button type="button" onClick={() => insertHtml("<ul><li>List item</li></ul>")}>
                    <List size={16} />
                    List
                  </button>
                  <button type="button" onClick={() => insertHtml("<hr />")}>
                    <Minus size={16} />
                    Divider
                  </button>
                </div>
              </div>

              <div>
                <h3>Tokens</h3>
                <p className="muted-text">Click to insert at the cursor and copy.</p>
                <div className="email-token-list" aria-label={tokenLabel}>
                  {props.availableTokens.map((token) => (
                    <button type="button" key={token} onClick={() => insertToken(token)}>
                      <Copy size={14} />
                      {`{{${token}}}`}
                    </button>
                  ))}
                  {!props.availableTokens.length ? <span className="muted-text">No tokens configured.</span> : null}
                </div>
              </div>
            </aside>

            <main className="email-playground-stage">
              <section className={step === "setup" ? "email-playground-panel is-active" : "email-playground-panel"} aria-hidden={step !== "setup"}>
                <div className="email-playground-settings">
                  <div className="ui-field">
                    <label htmlFor={`${props.idPrefix}-subject`}>Subject</label>
                    <input id={`${props.idPrefix}-subject`} name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`${props.idPrefix}-preview`}>Preview text</label>
                    <input id={`${props.idPrefix}-preview`} name="previewText" value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`${props.idPrefix}-sender`}>Sender</label>
                    <select id={`${props.idPrefix}-sender`} name="senderIdentityId" defaultValue={props.selectedSenderIdentityId || ""}>
                      <option value="">Default sender</option>
                      {props.senderIdentities.map((sender) => (
                        <option key={sender.id} value={sender.id}>
                          {sender.name} &lt;{sender.fromEmail}&gt;
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="email-playground-note">
                    <CheckCircle2 size={18} />
                    <span>Required tokens: {props.requiredTokens.join(", ") || "none"}</span>
                  </div>
                </div>
              </section>

              <section className={step === "design" ? "email-playground-panel is-active" : "email-playground-panel"} aria-hidden={step !== "design"}>
                <EmailEditor
                  className="email-react-editor"
                  content={initialContent as Content}
                  onReady={(ref) => {
                    editorRef.current = ref;
                    setEditorReady(true);
                    void exportEditorDocument(ref);
                  }}
                  onUpdate={(ref) => {
                    editorRef.current = ref;
                    void exportEditorDocument(ref);
                  }}
                  placeholder="Press '/' for blocks"
                  ref={editorRef}
                  theme="basic" />
              </section>

              <section className={step === "review" ? "email-playground-panel is-active" : "email-playground-panel"} aria-hidden={step !== "review"}>
                <div className="email-review-grid">
                  <iframe title={`${props.templateName} email preview`} sandbox="" srcDoc={htmlBody} />
                  <div className="email-review-fallback">
                    <div>
                      <h3>Text fallback</h3>
                      <p className="muted-text">Plain text is sent alongside the HTML for accessibility and stricter inboxes.</p>
                    </div>
                    <textarea value={textBody} onChange={(event) => updateTextFallback(event.target.value)} />
                  </div>
                </div>
              </section>
            </main>
          </div>

          <footer className="email-playground-footer">
            <span className={editorError ? "email-playground-error" : "muted-text"}>
              {editorError || (editorReady ? "Editor ready" : "Loading editor")}
            </span>
            <div>
              <Button type="button" variant="secondary" onClick={() => void goToStep(step === "review" ? "design" : "setup")}>
                <FileText size={16} />
                {step === "review" ? "Back to design" : "Setup"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void goToStep("design")}>
                <Type size={16} />
                Design
              </Button>
              <Button type="button" onClick={() => void goToStep("review")}>
                <Eye size={16} />
                Review
              </Button>
            </div>
          </footer>
        </div>
      </dialog>
    </form>
  );
}
