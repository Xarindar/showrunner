import sanitizeHtml from "sanitize-html";

const allowedCssValue = [/^(?!.*(?:url\s*\(|expression\s*\(|javascript:)).{0,500}$/i];

const emailHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul"
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["alt", "height", "src", "width"],
    table: ["align", "border", "cellpadding", "cellspacing", "role", "width"],
    tbody: ["align", "valign"],
    td: ["align", "colspan", "height", "rowspan", "valign", "width"],
    tfoot: ["align", "valign"],
    th: ["align", "colspan", "height", "rowspan", "scope", "valign", "width"],
    thead: ["align", "valign"],
    tr: ["align", "valign"],
    "*": ["class", "style"]
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowedStyles: {
    "*": {
      "background-color": allowedCssValue,
      color: allowedCssValue,
      "font-family": allowedCssValue,
      "font-size": allowedCssValue,
      "font-weight": allowedCssValue,
      "line-height": allowedCssValue,
      margin: allowedCssValue,
      "margin-bottom": allowedCssValue,
      "margin-left": allowedCssValue,
      "margin-right": allowedCssValue,
      "margin-top": allowedCssValue,
      padding: allowedCssValue,
      "padding-bottom": allowedCssValue,
      "padding-left": allowedCssValue,
      "padding-right": allowedCssValue,
      "padding-top": allowedCssValue,
      "text-align": allowedCssValue,
      "text-decoration": allowedCssValue
    },
    table: {
      "border-collapse": allowedCssValue,
      width: allowedCssValue
    },
    td: {
      "vertical-align": allowedCssValue,
      width: allowedCssValue
    },
    th: {
      "vertical-align": allowedCssValue,
      width: allowedCssValue
    }
  },
  allowProtocolRelative: false,
  parseStyleAttributes: true,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true)
  }
};

export function sanitizeEmailHtml(value: string) {
  const source = value.trim();
  if (!source) return "";

  return sanitizeHtml(source, emailHtmlOptions).trim();
}
