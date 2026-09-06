// A deliberately small formatting vocabulary: paragraphs, bold, emphasis and bullet lists.
// Raw HTML is always escaped. Site renderers may use the returned sanitized HTML.
export function renderContentRichText(value: string) {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const inline = (text: string) => escape(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/_([^_\n]+)_/g, "<em>$1</em>");
  return value.split(/\n\s*\n/).filter(Boolean).map(paragraph => {
    const lines = paragraph.split("\n");
    return lines.every(line => line.startsWith("- ")) ? `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>` : `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}
