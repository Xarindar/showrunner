import { z } from "zod";

const tokenPattern = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;

const alignSchema = z.enum(["left", "center", "right"]);
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .catch("#111827");
const optionalColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .catch("#ffffff")
  .optional()
  .default("#ffffff");
const fontFamilySchema = z
  .enum([
    "Arial, sans-serif",
    "Georgia, serif",
    "Helvetica, Arial, sans-serif",
    "Tahoma, sans-serif",
    "Times New Roman, serif",
    "Verdana, sans-serif"
  ])
  .catch("Arial, sans-serif");

const blockBaseSchema = z.object({
  id: z.string().trim().min(1)
});

const headingBlockSchema = blockBaseSchema.extend({
  type: z.literal("heading"),
  props: z.object({
    align: alignSchema.catch("left"),
    level: z.enum(["h1", "h2", "h3"]).catch("h2"),
    text: z.string().trim().max(300).catch("Heading")
  })
});

const textBlockSchema = blockBaseSchema.extend({
  type: z.literal("text"),
  props: z.object({
    align: alignSchema.catch("left"),
    text: z.string().trim().max(2000).catch("Body text")
  })
});

const buttonBlockSchema = blockBaseSchema.extend({
  type: z.literal("button"),
  props: z.object({
    align: alignSchema.catch("left"),
    backgroundColor: colorSchema.catch("#116466"),
    text: z.string().trim().max(120).catch("Open link"),
    textColor: optionalColorSchema,
    url: z.string().trim().max(500).catch("")
  })
});

const imageBlockSchema = blockBaseSchema.extend({
  type: z.literal("image"),
  props: z.object({
    align: alignSchema.catch("center"),
    alt: z.string().trim().max(200).catch(""),
    src: z.string().trim().max(500).catch(""),
    width: z.number().int().min(120).max(640).catch(560)
  })
});

const dividerBlockSchema = blockBaseSchema.extend({
  type: z.literal("divider"),
  props: z.object({
    color: colorSchema.catch("#d1d5db")
  })
});

const spacerBlockSchema = blockBaseSchema.extend({
  type: z.literal("spacer"),
  props: z.object({
    height: z.number().int().min(8).max(80).catch(24)
  })
});

export const emailBuilderBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  textBlockSchema,
  buttonBlockSchema,
  imageBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema
]);

export const emailBuilderDocumentSchema = z.object({
  version: z.literal(1).catch(1),
  body: z
    .object({
      backgroundColor: colorSchema.catch("#f3f4f6"),
      contentWidth: z.number().int().min(480).max(680).catch(600),
      fontFamily: fontFamilySchema,
      textColor: colorSchema.catch("#111827")
    })
    .catch({
      backgroundColor: "#f3f4f6",
      contentWidth: 600,
      fontFamily: "Arial, sans-serif",
      textColor: "#111827"
    }),
  blocks: z.array(emailBuilderBlockSchema).max(40).catch([])
});

export type EmailBuilderBlock = z.infer<typeof emailBuilderBlockSchema>;
export type EmailBuilderDocument = z.infer<typeof emailBuilderDocumentSchema>;

export function defaultEmailBuilderDocument(): EmailBuilderDocument {
  return {
    version: 1,
    body: {
      backgroundColor: "#f3f4f6",
      contentWidth: 600,
      fontFamily: "Arial, sans-serif",
      textColor: "#111827"
    },
    blocks: [
      {
        id: "heading-1",
        type: "heading",
        props: {
          align: "left",
          level: "h1",
          text: "{{businessName}}"
        }
      },
      {
        id: "text-1",
        type: "text",
        props: {
          align: "left",
          text: "Hi {{customerName}},\n\nAdd your message here."
        }
      }
    ]
  };
}

export function normalizeEmailBuilderDocument(value: unknown): EmailBuilderDocument {
  if (!value || (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)) {
    return defaultEmailBuilderDocument();
  }

  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return emailBuilderDocumentSchema.parse(parsed);
}

export function emailBuilderDocumentFromText(textBody: string): EmailBuilderDocument {
  const document = defaultEmailBuilderDocument();
  const paragraphs = textBody
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!paragraphs.length) return document;

  return {
    ...document,
    blocks: paragraphs.map((text, index) => ({
      id: `text-${index + 1}`,
      type: "text",
      props: {
        align: "left",
        text
      }
    }))
  };
}

export function extractEmailBuilderTokens(document: EmailBuilderDocument) {
  const tokens = new Set<string>();
  const scan = (value: string) => {
    for (const match of value.matchAll(tokenPattern)) {
      tokens.add(match[1]);
    }
  };

  for (const block of document.blocks) {
    for (const value of Object.values(block.props)) {
      if (typeof value === "string") scan(value);
    }
  }

  return Array.from(tokens);
}
