"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Focus,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Minus,
  Palette,
  Plus,
  Quote,
  Redo2,
  Save,
  Smile,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  Upload,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import { AssetPicker, Button, Card, Modal, type AssetPickerAsset } from "@/components/ui";
import type { BlogPostDraft } from "./data";

type BlogAction = (formData: FormData) => void | Promise<void>;

type BlogEditorProps = {
  canUpload: boolean;
  categories: BlogCategoryOption[];
  deleteAction: BlogAction;
  editing: boolean;
  mediaAssets: AssetPickerAsset[];
  post: BlogPostDraft;
  posts: BlogPostDraft[];
  saveAction: BlogAction;
};

type BlogCategoryOption = { id: string; name: string };

const emojiGroups = [
  { label: "Popular", values: ["✨", "❤️", "📸", "🎉", "🌿", "☀️", "💫", "🥂", "😊", "🙌", "🤍", "📍"] },
  { label: "Story", values: ["✍️", "📖", "💡", "💬", "📌", "🗓️", "🔗", "⭐", "🎨", "🌸", "🏡", "🎁"] }
];

const fontFamilies = [
  { label: "Modern", value: "Arial, sans-serif" },
  { label: "Editorial", value: "Georgia, serif" },
  { label: "Classic", value: "Times New Roman, serif" },
  { label: "Clean", value: "Helvetica, Arial, sans-serif" },
  { label: "Mono", value: "Courier New, monospace" }
];

export function BlogEditor({ canUpload, categories, deleteAction, editing, mediaAssets, post, posts, saveAction }: BlogEditorProps) {
  if (!editing) {
    return <BlogLibrary deleteAction={deleteAction} posts={posts} />;
  }

  return (
    <BlogComposer
      canUpload={canUpload}
      categories={categories}
      deleteAction={deleteAction}
      key={post.id || "new"}
      mediaAssets={mediaAssets}
      post={post}
      saveAction={saveAction}
    />
  );
}

function BlogLibrary({ deleteAction, posts }: { deleteAction: BlogAction; posts: BlogPostDraft[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollLeft(rail.scrollLeft > 4);
    setCanScrollRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      rail.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [posts.length, updateScrollState]);

  function scroll(direction: 1 | -1) {
    railRef.current?.scrollBy({ behavior: "smooth", left: direction * Math.max(320, (railRef.current?.clientWidth || 500) * 0.72) });
  }

  const toolbar = (
    <div className="content-hero-toolbar">
      <div className="content-hero-toolbar-left">
        <span className="content-section-eyebrow">Stories</span>
        <span className="ui-badge">{posts.length}</span>
      </div>
      <div className="content-hero-toolbar-actions">
        <span className="content-testimonial-toolbar-note">{posts.filter((item) => item.status === "PUBLISHED").length} live</span>
      </div>
    </div>
  );

  return (
    <Card className="blog-library-shell" minHeight="none" reservedHeader={toolbar}>
      <div className="blog-library-summary">
        <div>
          <span className="blog-summary-icon"><BookOpen aria-hidden="true" size={19} /></span>
          <div><strong>Your editorial shelf</strong><span>Draft quietly, publish confidently.</span></div>
        </div>
        <ButtonLink href="/admin/modules/blog?new=1"><Plus aria-hidden="true" size={16} />New story</ButtonLink>
      </div>

      <div className="content-proof-rail blog-proof-rail">
        <button aria-label="Scroll stories left" className="content-rail-arrow" data-side="left" disabled={!canScrollLeft} onClick={() => scroll(-1)} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <div className="content-proof-rail-viewport blog-story-rail" ref={railRef}>
          <Link className="blog-add-card" href="/admin/modules/blog?new=1">
            <span className="content-testimonial-add-icon"><Plus aria-hidden="true" size={20} /></span>
            <strong>Start a story</strong>
            <span>Write with rich type, images, links, and a polished article header.</span>
          </Link>
          {posts.map((item) => <BlogStoryCard deleteAction={deleteAction} key={item.id} post={item} />)}
        </div>
        <button aria-label="Scroll stories right" className="content-rail-arrow" data-side="right" disabled={!canScrollRight} onClick={() => scroll(1)} type="button">
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <p className="content-hero-hint">Select a story to edit it. Drafts stay private; published stories are available to the client website.</p>
    </Card>
  );
}

function BlogStoryCard({ deleteAction, post }: { deleteAction: BlogAction; post: BlogPostDraft }) {
  const image = post.thumbnailUrl || post.headerImageUrl;
  return (
    <article className="blog-story-card">
      <Link aria-label={`Edit ${post.title} (${post.status === "DRAFT" ? "draft" : "published"})`} className="blog-story-card-link" href={`/admin/modules/blog?post=${post.id}`}>
        <span className="blog-story-image">
          {image ? <Image alt="" fill sizes="280px" src={image} unoptimized /> : <span><ImageIcon aria-hidden="true" size={24} /></span>}
          {post.status === "DRAFT" ? <span aria-label="Draft" className="blog-story-status" title="Draft"><FileText aria-hidden="true" size={15} /></span> : null}
        </span>
        <span className="blog-story-copy">
          <strong>{post.title}</strong>
          <small>{post.category || "Uncategorized"}</small>
          <time dateTime={post.updatedAt}><Clock3 aria-hidden="true" size={13} />Last edited {formatShortDate(post.updatedAt)}</time>
        </span>
      </Link>
      <form action={deleteAction} className="blog-story-delete">
        <input name="id" type="hidden" value={post.id} />
        <button
          aria-label={`Delete ${post.title}`}
          onClick={(event) => {
            if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) event.preventDefault();
          }}
          type="submit">
          <Trash2 aria-hidden="true" size={14} />
        </button>
      </form>
    </article>
  );
}

function BlogComposer({
  canUpload,
  categories,
  deleteAction,
  mediaAssets,
  post,
  saveAction
}: {
  canUpload: boolean;
  categories: BlogCategoryOption[];
  deleteAction: BlogAction;
  mediaAssets: AssetPickerAsset[];
  post: BlogPostDraft;
  saveAction: BlogAction;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inlineUploadRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLInputElement>(null);
  const thumbnailUploadRef = useRef<HTMLInputElement>(null);
  const headerUploadRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [title, setTitle] = useState(post.title);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [contentHtml, setContentHtml] = useState(post.contentHtml);
  const [authorName, setAuthorName] = useState(post.authorName);
  const [category, setCategory] = useState(post.category);
  const [tags, setTags] = useState(post.tags.join(", "));
  const [thumbnailUrl, setThumbnailUrl] = useState(post.thumbnailUrl);
  const [headerImageUrl, setHeaderImageUrl] = useState(post.headerImageUrl);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [headerPreview, setHeaderPreview] = useState("");
  const [view, setView] = useState<"write" | "preview">("write");
  const [focusMode, setFocusMode] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadingInline, setUploadingInline] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [fontSize, setFontSize] = useState(18);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== post.contentHtml) {
      editorRef.current.innerHTML = post.contentHtml;
    }
  }, [post.contentHtml]);

  useEffect(() => () => {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
  }, [thumbnailPreview]);

  useEffect(() => () => {
    if (headerPreview) URL.revokeObjectURL(headerPreview);
  }, [headerPreview]);

  const metrics = useMemo(() => {
    const words = textFromHtml(contentHtml).split(/\s+/).filter(Boolean).length;
    return { minutes: Math.max(1, Math.ceil(words / 220)), words };
  }, [contentHtml]);

  function syncEditor() {
    setContentHtml(editorRef.current?.innerHTML || "");
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) {
      editorRef.current?.focus();
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function command(name: string, value?: string) {
    restoreSelection();
    document.execCommand(name, false, value);
    normalizeLegacyFontNodes();
    editorRef.current?.focus();
    rememberSelection();
    syncEditor();
  }

  function formatBlock(tag: string) {
    command("formatBlock", tag);
  }

  function applyFontSize(next: number) {
    const size = Math.max(12, Math.min(48, Math.round(next || 18)));
    setFontSize(size);
    restoreSelection();
    document.execCommand("fontSize", false, "7");
    editorRef.current?.querySelectorAll("font[size='7']").forEach((node) => {
      const element = node as HTMLElement;
      element.removeAttribute("size");
      element.style.fontSize = `${size}px`;
    });
    normalizeLegacyFontNodes();
    syncEditor();
  }

  function normalizeLegacyFontNodes() {
    editorRef.current?.querySelectorAll("font").forEach((node) => {
      const font = node as HTMLElement;
      const span = document.createElement("span");
      const face = font.getAttribute("face");
      const color = font.getAttribute("color");
      if (face) span.style.fontFamily = face;
      if (color) span.style.color = color;
      if (font.style.fontSize) span.style.fontSize = font.style.fontSize;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
  }

  function addLink() {
    rememberSelection();
    const href = window.prompt("Paste a link URL");
    if (!href) return;
    command("createLink", safeHref(href));
  }

  function insertEmoji(emoji: string) {
    command("insertText", emoji);
    setEmojiOpen(false);
  }

  function insertImage(asset: Pick<AssetPickerAsset, "alt" | "url" | "thumbnailUrl">) {
    const src = asset.url || asset.thumbnailUrl;
    restoreSelection();
    const figure = `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(asset.alt || "")}" loading="lazy"><figcaption>Write a caption…</figcaption></figure><p><br></p>`;
    document.execCommand("insertHTML", false, figure);
    editorRef.current?.focus();
    syncEditor();
  }

  async function uploadInlineImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploadingInline(true);
    setInlineError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("alt", title || file.name);
      const response = await fetch("/api/media/blog", { body, method: "POST" });
      const payload = (await response.json()) as { alt?: string; error?: string; url?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Image upload failed.");
      insertImage({ alt: payload.alt || file.name, thumbnailUrl: payload.url, url: payload.url } as AssetPickerAsset);
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploadingInline(false);
    }
  }

  function previewFile(event: ChangeEvent<HTMLInputElement>, kind: "thumbnail" | "header") {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    if (kind === "thumbnail") {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
      setThumbnailPreview(objectUrl);
      setThumbnailUrl("");
    } else {
      if (headerPreview) URL.revokeObjectURL(headerPreview);
      setHeaderPreview(objectUrl);
      setHeaderImageUrl("");
    }
  }

  function chooseFeatureImage(asset: AssetPickerAsset, kind: "thumbnail" | "header") {
    const url = asset.url || asset.thumbnailUrl;
    if (kind === "thumbnail") {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
      if (thumbnailUploadRef.current) thumbnailUploadRef.current.value = "";
      setThumbnailPreview("");
      setThumbnailUrl(url);
    } else {
      if (headerPreview) URL.revokeObjectURL(headerPreview);
      if (headerUploadRef.current) headerUploadRef.current.value = "";
      setHeaderPreview("");
      setHeaderImageUrl(url);
    }
  }

  function submitSync() {
    const value = editorRef.current?.innerHTML || contentHtml;
    if (contentInputRef.current) contentInputRef.current.value = value;
    setContentHtml(value);
  }

  const toolbar = (
    <div className="blog-composer-topbar">
      <Link className="blog-back-link" href="/admin/modules/blog"><ChevronLeft aria-hidden="true" size={16} />All stories</Link>
      <div className="blog-save-state"><span />Ready to save</div>
      <div className="blog-composer-actions">
        <Button aria-pressed={view === "preview"} onClick={() => setView(view === "write" ? "preview" : "write")} size="sm" type="button" variant="secondary">
          {view === "write" ? <Eye aria-hidden="true" size={15} /> : <FileText aria-hidden="true" size={15} />}
          {view === "write" ? "Preview" : "Write"}
        </Button>
        <Button name="intent" size="sm" type="submit" value={post.status === "PUBLISHED" ? "save" : "draft"} variant="secondary">
          <Save aria-hidden="true" size={15} />{post.status === "PUBLISHED" ? "Save changes" : "Save draft"}
        </Button>
        <Button name="intent" size="sm" type="submit" value="publish">
          <BookOpen aria-hidden="true" size={15} />{post.status === "PUBLISHED" ? "Update live" : "Publish"}
        </Button>
      </div>
    </div>
  );

  return (
    <form action={saveAction} className="blog-composer-form" data-focus={focusMode} onSubmit={submitSync}>
      <input name="id" type="hidden" value={post.id} />
      <input defaultValue={contentHtml} name="contentHtml" ref={contentInputRef} type="hidden" />
      <input name="currentStatus" readOnly type="hidden" value={post.status} />
      <input name="thumbnailUrl" readOnly type="hidden" value={thumbnailUrl} />
      <input name="headerImageUrl" readOnly type="hidden" value={headerImageUrl} />
      <input accept="image/*" className="ui-hidden" name="thumbnailUpload" onChange={(event) => previewFile(event, "thumbnail")} ref={thumbnailUploadRef} type="file" />
      <input accept="image/*" className="ui-hidden" name="headerImageUpload" onChange={(event) => previewFile(event, "header")} ref={headerUploadRef} type="file" />
      <input accept="image/*" className="ui-hidden" onChange={uploadInlineImage} ref={inlineUploadRef} type="file" />

      <Card bodyClassName="blog-composer-card-body" className="blog-composer-card" minHeight="none" reservedHeader={toolbar}>
        <div className="blog-composer-layout">
          <main className="blog-writing-pane">
            {view === "write" ? (
              <>
                <div className="blog-title-fields">
                  <textarea
                    aria-label="Story title"
                    autoFocus={!post.id}
                    className="blog-title-input"
                    maxLength={180}
                    name="title"
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder="Give your story a memorable title"
                    required
                    rows={1}
                    value={title}
                  />
                  <textarea
                    aria-label="Story excerpt"
                    className="blog-dek-input"
                    maxLength={320}
                    name="excerpt"
                    onChange={(event) => setExcerpt(event.currentTarget.value)}
                    placeholder="Add a short introduction for the blog listing and search previews…"
                    rows={2}
                    value={excerpt}
                  />
                </div>

                <RichTextToolbar
                  canUpload={canUpload}
                  emojiOpen={emojiOpen}
                  fontSize={fontSize}
                  mediaAssets={mediaAssets}
                  onAddLink={addLink}
                  onCommand={command}
                  onEmoji={insertEmoji}
                  onEmojiOpen={() => setEmojiOpen((current) => !current)}
                  onFocus={() => setFocusMode((current) => !current)}
                  onFontSize={applyFontSize}
                  onFormatBlock={formatBlock}
                  onInlineUpload={() => inlineUploadRef.current?.click()}
                  onInsertImage={insertImage}
                  onRememberSelection={rememberSelection}
                  uploadingInline={uploadingInline}
                />
                {inlineError ? <div className="blog-inline-error"><X aria-hidden="true" size={14} />{inlineError}</div> : null}
                <div
                  aria-label="Story body"
                  aria-multiline="true"
                  className="blog-rich-editor blog-prose"
                  contentEditable
                  data-empty={!textFromHtml(contentHtml)}
                  onBlur={rememberSelection}
                  onInput={syncEditor}
                  onKeyUp={rememberSelection}
                  onMouseUp={rememberSelection}
                  ref={editorRef}
                  role="textbox"
                  spellCheck
                  suppressContentEditableWarning
                />
                <div className="blog-writing-metrics">
                  <span>{metrics.words.toLocaleString()} words</span>
                  <span><Clock3 aria-hidden="true" size={13} />{metrics.minutes} min read</span>
                  <span>{contentHtml.length ? "Story in progress" : "Start with a thought, scene, or useful answer."}</span>
                </div>
              </>
            ) : (
              <ArticlePreview
                authorName={authorName}
                category={category}
                contentHtml={contentHtml}
                excerpt={excerpt}
                headerImageUrl={headerPreview || headerImageUrl}
                metrics={metrics}
                title={title}
              />
            )}
          </main>

          <aside className="blog-settings-rail">
            <div className="blog-settings-heading">
              <div><span>Story details</span><small>For the listing and opened article</small></div>
              <button aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"} onClick={() => setFocusMode((current) => !current)} type="button">
                <Focus aria-hidden="true" size={17} />
              </button>
            </div>

            <ImageSetting
              assetUrl={thumbnailPreview || thumbnailUrl}
              canUpload={canUpload}
              description="Shown on blog cards and search results."
              label="Thumbnail"
              mediaAssets={mediaAssets}
              onChoose={(asset) => chooseFeatureImage(asset, "thumbnail")}
              onRemove={() => {
                setThumbnailUrl("");
                setThumbnailPreview("");
                if (thumbnailUploadRef.current) thumbnailUploadRef.current.value = "";
              }}
              onUpload={() => thumbnailUploadRef.current?.click()}
              ratio="thumbnail"
            />
            <ImageSetting
              assetUrl={headerPreview || headerImageUrl}
              canUpload={canUpload}
              description="Revealed when a client opens the story."
              label="Article header"
              mediaAssets={mediaAssets}
              onChoose={(asset) => chooseFeatureImage(asset, "header")}
              onRemove={() => {
                setHeaderImageUrl("");
                setHeaderPreview("");
                if (headerUploadRef.current) headerUploadRef.current.value = "";
              }}
              onUpload={() => headerUploadRef.current?.click()}
              ratio="header"
            />

            <label className="blog-setting-field">
              <span>Author</span>
              <input name="authorName" onChange={(event) => setAuthorName(event.currentTarget.value)} placeholder="Your name" value={authorName} />
            </label>
            <BlogCategoryField
              categories={categories}
              initialCategoryId={post.categoryId}
              onChange={setCategory}
            />
            <label className="blog-setting-field">
              <span>Tags</span>
              <input name="tags" onChange={(event) => setTags(event.currentTarget.value)} placeholder="weddings, planning, studio" value={tags} />
              <small>Separate tags with commas.</small>
            </label>

            <div className="blog-publish-note">
              <span data-status={post.status.toLowerCase()}>{post.status === "PUBLISHED" ? <Check size={13} /> : <FileText size={13} />}{post.status === "PUBLISHED" ? "Published" : "Private draft"}</span>
              <p>{post.status === "PUBLISHED" ? "Updates replace the live version when you save." : "Only your team can see this story until you publish."}</p>
            </div>

            {post.id ? (
              <div className="blog-danger-zone">
                {post.status === "PUBLISHED" ? <Button name="intent" size="sm" type="submit" value="draft" variant="ghost">Move to draft</Button> : null}
                <button
                  formAction={deleteAction}
                  formNoValidate
                  onClick={(event) => {
                    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) event.preventDefault();
                  }}
                  type="submit">
                  <Trash2 aria-hidden="true" size={14} />Delete story
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      </Card>
    </form>
  );
}

function RichTextToolbar({
  canUpload,
  emojiOpen,
  fontSize,
  mediaAssets,
  onAddLink,
  onCommand,
  onEmoji,
  onEmojiOpen,
  onFocus,
  onFontSize,
  onFormatBlock,
  onInlineUpload,
  onInsertImage,
  onRememberSelection,
  uploadingInline
}: {
  canUpload: boolean;
  emojiOpen: boolean;
  fontSize: number;
  mediaAssets: AssetPickerAsset[];
  onAddLink: () => void;
  onCommand: (name: string, value?: string) => void;
  onEmoji: (emoji: string) => void;
  onEmojiOpen: () => void;
  onFocus: () => void;
  onFontSize: (value: number) => void;
  onFormatBlock: (tag: string) => void;
  onInlineUpload: () => void;
  onInsertImage: (asset: AssetPickerAsset) => void;
  onRememberSelection: () => void;
  uploadingInline: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const keepSelection = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("button")) {
      onRememberSelection();
    }
  };

  return (
    <div aria-label="Story formatting" className="blog-editor-toolbar" onMouseDown={keepSelection} role="toolbar">
      <div className="blog-tool-group blog-history-tools">
        <Tool label="Undo" onClick={() => onCommand("undo")}><Undo2 size={16} /></Tool>
        <Tool label="Redo" onClick={() => onCommand("redo")}><Redo2 size={16} /></Tool>
      </div>
      <div className="blog-tool-group blog-type-selects">
        <select aria-label="Text style" defaultValue="p" onChange={(event) => onFormatBlock(event.currentTarget.value)}>
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>
        <select aria-label="Font family" className="blog-font-family-select" defaultValue={fontFamilies[0].value} onChange={(event) => onCommand("fontName", event.currentTarget.value)}>
          {fontFamilies.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
        </select>
        <label className="blog-font-size-control">
          <input aria-label="Font size in pixels" max={48} min={12} onChange={(event) => onFontSize(Number(event.currentTarget.value))} type="number" value={fontSize} />
          <span>px</span>
        </label>
      </div>
      <div className="blog-tool-group blog-format-tools">
        <Tool label="Bold" onClick={() => onCommand("bold")}><Bold size={16} /></Tool>
        <Tool label="Italic" onClick={() => onCommand("italic")}><Italic size={16} /></Tool>
        <Tool label="Underline" onClick={() => onCommand("underline")}><Underline size={16} /></Tool>
        <span className="blog-strike-tool"><Tool label="Strikethrough" onClick={() => onCommand("strikeThrough")}><Strikethrough size={16} /></Tool></span>
        <span className="blog-link-tool"><Tool label="Link" onClick={onAddLink}><Link2 size={16} /></Tool></span>
      </div>
      <div className="blog-tool-group blog-insert-tools">
        <AssetPicker
          assets={mediaAssets}
          canUpload={canUpload}
          confirmLabel="Insert image"
          onSelectAsset={onInsertImage}
          onUploadRequest={onInlineUpload}
          title="Insert an image"
          triggerClassName="blog-tool-button">
          <ImageIcon aria-hidden="true" size={16} /><span>Image</span>
        </AssetPicker>
        <div className="blog-emoji-wrap">
          <button aria-expanded={emojiOpen} className="blog-tool-button" onClick={onEmojiOpen} type="button"><Smile size={16} /><span>Emoji</span></button>
          {emojiOpen ? (
            <div className="blog-emoji-popover">
              {emojiGroups.map((group) => (
                <div key={group.label}><span>{group.label}</span><div>{group.values.map((emoji) => <button key={emoji} onClick={() => onEmoji(emoji)} type="button">{emoji}</button>)}</div></div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="blog-more-wrap">
          <button
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label="More formatting"
            className="blog-tool-icon"
            onClick={() => setMoreOpen((current) => !current)}
            title="More formatting"
            type="button">
            <MoreHorizontal size={17} />
          </button>
          {moreOpen ? (
            <div aria-label="More formatting" className="blog-more-menu" role="dialog">
              <div className="blog-more-section blog-more-type">
                <span>Typography</span>
                <select aria-label="Font family in more formatting" defaultValue={fontFamilies[0].value} onChange={(event) => onCommand("fontName", event.currentTarget.value)}>
                  {fontFamilies.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                </select>
              </div>
              <div className="blog-more-section">
                <span>Color</span>
                <div className="blog-more-color-row">
                  <label className="blog-more-color">
                    <Palette size={15} />
                    <span>Text</span>
                    <input aria-label="Text color" onChange={(event) => onCommand("foreColor", event.currentTarget.value)} type="color" />
                  </label>
                  <label className="blog-more-color">
                    <Highlighter size={15} />
                    <span>Highlight</span>
                    <input aria-label="Highlight color" defaultValue="#fff0a8" onChange={(event) => onCommand("hiliteColor", event.currentTarget.value)} type="color" />
                  </label>
                </div>
              </div>
              <div className="blog-more-section">
                <span>Layout</span>
                <div className="blog-more-grid">
                  <MoreTool icon={<AlignLeft size={15} />} label="Align left" onClick={() => onCommand("justifyLeft")} />
                  <MoreTool icon={<AlignCenter size={15} />} label="Center" onClick={() => onCommand("justifyCenter")} />
                  <MoreTool icon={<AlignRight size={15} />} label="Align right" onClick={() => onCommand("justifyRight")} />
                  <MoreTool icon={<List size={15} />} label="Bullets" onClick={() => onCommand("insertUnorderedList")} />
                  <MoreTool icon={<ListOrdered size={15} />} label="Numbered" onClick={() => onCommand("insertOrderedList")} />
                  <MoreTool icon={<Quote size={15} />} label="Quote" onClick={() => onFormatBlock("blockquote")} />
                  <MoreTool icon={<Minus size={15} />} label="Divider" onClick={() => onCommand("insertHorizontalRule")} />
                  <MoreTool icon={<Strikethrough size={15} />} label="Strike" onClick={() => onCommand("strikeThrough")} />
                  <MoreTool icon={<Link2 size={15} />} label="Link" onClick={onAddLink} />
                </div>
              </div>
              <div className="blog-more-section blog-more-utilities">
                <button disabled={!canUpload || uploadingInline} onClick={onInlineUpload} type="button">
                  {uploadingInline ? <LoaderCircle className="blog-spin" size={15} /> : <Upload size={15} />}
                  {uploadingInline ? "Adding image…" : "Upload image"}
                </button>
                <button onClick={onFocus} type="button"><Focus size={15} />Focus mode</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tool({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="blog-tool-icon" onClick={onClick} title={label} type="button">{children}</button>;
}

function MoreTool({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button">{icon}<span>{label}</span></button>;
}

function ImageSetting({
  assetUrl,
  canUpload,
  description,
  label,
  mediaAssets,
  onChoose,
  onRemove,
  onUpload,
  ratio
}: {
  assetUrl: string;
  canUpload: boolean;
  description: string;
  label: string;
  mediaAssets: AssetPickerAsset[];
  onChoose: (asset: AssetPickerAsset) => void;
  onRemove: () => void;
  onUpload: () => void;
  ratio: "thumbnail" | "header";
}) {
  return (
    <section className="blog-image-setting">
      <div><span>{label}</span><small>{description}</small></div>
      <div className="blog-image-setting-preview" data-ratio={ratio}>
        {assetUrl ? <Image alt="" fill sizes="300px" src={assetUrl} unoptimized /> : <span><ImageIcon aria-hidden="true" size={22} />No image selected</span>}
        {assetUrl ? <button aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove} type="button"><X aria-hidden="true" size={14} /></button> : null}
      </div>
      <div className="blog-image-setting-actions">
        <AssetPicker assets={mediaAssets} canUpload={canUpload} confirmLabel={`Use as ${label.toLowerCase()}`} onSelectAsset={onChoose} onUploadRequest={onUpload} title={`Choose ${label.toLowerCase()}`} triggerClassName="blog-image-choose">
          <ImageIcon aria-hidden="true" size={14} />Library
        </AssetPicker>
        <button disabled={!canUpload} onClick={onUpload} type="button"><Upload aria-hidden="true" size={14} />Upload</button>
      </div>
    </section>
  );
}

const newCategoryValue = "__new_category__";
const customCategoryValue = "__custom_category__";

function BlogCategoryField({
  categories,
  initialCategoryId,
  onChange
}: {
  categories: BlogCategoryOption[];
  initialCategoryId: string;
  onChange: (name: string) => void;
}) {
  const [selectedValue, setSelectedValue] = useState(initialCategoryId);
  const [customName, setCustomName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  function closeModal() {
    setDraftName("");
    setModalOpen(false);
  }

  function addCategory() {
    const nextName = draftName.trim().slice(0, 80);
    if (!nextName) return;
    setCustomName(nextName);
    setSelectedValue(customCategoryValue);
    onChange(nextName);
    closeModal();
  }

  function selectCategory(value: string) {
    if (value === newCategoryValue) {
      setDraftName("");
      setModalOpen(true);
      return;
    }
    setSelectedValue(value);
    onChange(value === customCategoryValue ? customName : categories.find((category) => category.id === value)?.name || "");
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCategory();
  }

  return (
    <div className="blog-setting-field blog-category-field">
      <label htmlFor="blog-category">Category</label>
      <select id="blog-category" onChange={(event) => selectCategory(event.currentTarget.value)} value={selectedValue}>
        <option value="">Uncategorized</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        {customName ? <option value={customCategoryValue}>{customName}</option> : null}
        <option value={newCategoryValue}>New Category…</option>
      </select>
      <input name="categoryId" readOnly type="hidden" value={selectedValue === customCategoryValue ? "" : selectedValue} />
      <input name="newCategoryName" readOnly type="hidden" value={selectedValue === customCategoryValue ? customName : ""} />
      <Modal
        bodyClassName="service-preset-modal-body"
        className="service-preset-modal"
        closeLabel="Close new category dialog"
        onClose={closeModal}
        open={modalOpen}
        title="New Category">
        <div className="ui-field">
          <input
            aria-label="Category name"
            autoComplete="off"
            autoFocus
            maxLength={80}
            onChange={(event) => setDraftName(event.currentTarget.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder="Behind the scenes"
            value={draftName}
          />
        </div>
        <div className="module-modal-actions">
          <Button onClick={closeModal} type="button" variant="ghost">Cancel</Button>
          <Button disabled={!draftName.trim()} onClick={addCategory} type="button">Add</Button>
        </div>
      </Modal>
    </div>
  );
}

function ArticlePreview({
  authorName,
  category,
  contentHtml,
  excerpt,
  headerImageUrl,
  metrics,
  title
}: {
  authorName: string;
  category: string;
  contentHtml: string;
  excerpt: string;
  headerImageUrl: string;
  metrics: { minutes: number; words: number };
  title: string;
}) {
  return (
    <article className="blog-article-preview">
      <header>
        <span>{category || "Journal"}</span>
        <h1>{title || "Your story title"}</h1>
        <p>{excerpt || "Your introduction will invite readers into the story."}</p>
        <div>{authorName || "Author"}<i />{metrics.minutes} min read</div>
      </header>
      <div className="blog-preview-hero">
        {headerImageUrl ? <Image alt="" fill sizes="900px" src={headerImageUrl} unoptimized /> : <span><ImageIcon aria-hidden="true" size={28} />Article header</span>}
      </div>
      {contentHtml ? <div className="blog-prose blog-preview-content" dangerouslySetInnerHTML={{ __html: contentHtml }} /> : <div className="blog-preview-empty">Your formatted story will appear here.</div>}
    </article>
  );
}

function ButtonLink({ children, href }: { children: ReactNode; href: string }) {
  return <Link className="ui-button ui-button-sm" href={href}>{children}</Link>;
}

function textFromHtml(value: string) {
  if (typeof window !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = value;
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function safeHref(value: string) {
  const trimmed = value.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
