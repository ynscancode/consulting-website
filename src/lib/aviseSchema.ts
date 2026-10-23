import { z } from 'astro/zod';

// Schema for src/data/avise.json, the single content file behind the Avisé &
// Co. public pages. Shared by the build-time loader (aviseContent.ts) and the
// editor's write path (api/content/[area].ts), which validates the WHOLE
// document after applying an edit, so a save can never leave the file in a
// shape the public build would reject.
//
// Rich fields (see richText.ts) are plain text in which `<em>…</em>` marks the
// one emphasised phrase; every other character is literal and escaped at
// render time. They are the headlines, receipt findings and principle titles.

const text = (max = 2000) => z.string().max(max);
const lines = (max = 30) => z.array(text(500)).max(max);

const receiptLine = z.object({
  l: text(200),
  v: text(200).optional(),
  hl: z.boolean().optional(),
  empty: z.boolean().optional(),
});

const receipt = z.object({
  title: text(120).optional(),
  number: text(60).optional(),
  lines: z.array(receiptLine).max(12),
  finding: text(300).optional(),
  source: text(300).optional(),
  footer: text(300).optional(),
});

export const AREAS = ['profit', 'ops', 'market'] as const;
const area = z.enum(AREAS);

const faq = z.array(z.object({ q: text(300), a: text(2000) })).max(20);

// Insight ids become public URLs (/insights/<id>) and must stay stable.
export const insightIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be lowercase letters, digits and hyphens');

export const aviseSchema = z.object({
  header: z.object({ cta: text(60) }),
  footer: z.object({
    ctaHeadline: text(300),
    ctaLede: text(),
    ctaButton: text(60),
    tagline: text(300),
    contact: lines(6),
    legal: text(300),
    note: text(300),
  }),
  home: z.object({
    hero: z.object({
      label: text(200),
      headline: text(300),
      lede: text(),
      primary: text(60),
      secondary: text(60),
      caption: text(300),
    }),
    services: z.object({
      label: text(200),
      headline: text(300),
      more: text(60),
      noteStrong: text(200),
      noteText: text(),
    }),
    selfcheck: z.object({
      label: text(200),
      headline: text(300),
      lede: text(),
      book: text(80),
      clear: text(40),
    }),
    how: z.object({ label: text(200), headline: text(300), lede: text(), button: text(60) }),
    insights: z.object({ label: text(200), headline: text(300), link: text(60) }),
  }),
  servicesPage: z.object({
    label: text(200),
    headline: text(300),
    lede: text(),
    whenTitle: text(120),
    getTitle: text(120),
    dontLabel: text(200),
    dontHeadline: text(300),
    dont: lines(12),
    dontNote: text(),
    pricingLabel: text(200),
    pricingHeadline: text(300),
    pricingBody: text(),
  }),
  approachPage: z.object({
    label: text(200),
    headline: text(300),
    lede: text(),
    stepsLabel: text(200),
    stepsHeadline: text(300),
    staysLabel: text(200),
    staysHeadline: text(300),
  }),
  insightsPage: z.object({
    label: text(200),
    headline: text(300),
    lede: text(),
    empty: text(300),
    cardFooter: text(200),
    back: text(80),
    draftNote: text(300),
  }),
  aboutPage: z.object({
    label: text(200),
    headline: text(300),
    // Same public-path whitelist as the profile upload endpoint writes.
    image: z
      .string()
      .regex(/^\/about\/profile-[a-f0-9]{16}\.(jpg|png|webp)$/)
      .nullable(),
    lede: text(),
    body: text(5000),
  }),
  contactPage: z.object({
    label: text(200),
    headline: text(300),
    lede: text(),
    nameLabel: text(80),
    bizLabel: text(80),
    typeLabel: text(80),
    contactLabel: text(80),
    problemLabel: text(80),
    problemHint: text(300),
    slotLegend: text(120),
    slotHint: text(300),
    submit: text(60),
    submitNote: text(200),
    messageLabel: text(120),
    handle: text(60),
    copyButton: text(40),
    messageBody: text(),
    nextLabel: text(120),
    next: lines(8),
  }),
  heroReceipt: receipt,
  // Fixed set of three: ids drive the /services anchors and the self-check areas.
  services: z
    .array(
      z.object({
        id: area,
        name: text(120),
        short: text(),
        items: lines(8),
        when: lines(10),
        get: lines(10),
      })
    )
    .length(3),
  steps: z.array(z.object({ t: text(200), b: text(), tag: text(60).optional() })).max(10),
  principles: z.array(z.object({ t: text(200), b: text() })).max(10),
  faqServices: faq,
  faqContact: faq,
  insights: z
    .array(
      z.object({
        id: insightIdSchema,
        sector: text(60),
        meta: text(120),
        tone: z.enum(['card', 'forest']),
        headline: text(300),
        lede: text(),
        // Paragraphs; an entry starting with "## " is a subheading.
        body: z.array(text(5000)).max(60),
        receipt,
      })
    )
    .max(60)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((item, i) => {
        if (seen.has(item.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: 'duplicate id' });
        seen.add(item.id);
      });
    }),
  symptoms: z
    .array(z.object({ id: z.string().min(1).max(60), label: text(200), fix: text(120), area }))
    .max(20),
  areas: z.record(area, text(120)),
  findings: z.record(area, text(300)),
  // Filter chips with no insight yet (shows the empty state).
  extraSectors: lines(10),
});

export type AviseContent = z.infer<typeof aviseSchema>;
export type Insight = AviseContent['insights'][number];
