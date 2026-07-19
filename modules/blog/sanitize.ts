import "server-only";

import sanitizeHtml from "sanitize-html";

const blogHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "ul",
    "ol",
    "li",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "sup",
    "sub",
    "a",
    "span",
    "br",
    "hr",
    "figure",
    "figcaption",
    "img"
  ],
  allowedAttributes: {
    "*": ["style"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "loading"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowedStyles: {
    "*": {
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i],
      "font-family": [/^[a-z0-9 ,"'-]+$/i],
      "font-size": [/^(?:1[0-9]|2[0-9]|3[0-9]|4[0-8])px$/],
      "text-align": [/^(?:left|center|right)$/]
    }
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }, true)
  }
};

export function sanitizeBlogHtml(source: string) {
  return sanitizeHtml(source, blogHtmlOptions).trim();
}
