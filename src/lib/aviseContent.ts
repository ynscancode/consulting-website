import { z } from 'astro/zod';
import raw from '../data/avise.json';

// Content for the Avisé & Co. public pages, validated at build time. Fields
// documented as HTML (principle titles, receipt findings, area findings)
// carry the <em> emphasis and are rendered with set:html; everything else is
// plain text.

const receiptLine = z.object({
  l: z.string(),
  v: z.string().optional(),
  hl: z.boolean().optional(),
  empty: z.boolean().optional(),
});

const receipt = z.object({
  title: z.string().optional(),
  number: z.string().optional(),
  lines: z.array(receiptLine),
  finding: z.string().optional(),
  source: z.string().optional(),
  footer: z.string().optional(),
});

const area = z.enum(['profit', 'ops', 'market']);

const faq = z.array(z.object({ q: z.string(), a: z.string() }));

const schema = z.object({
  heroReceipt: receipt,
  services: z.array(
    z.object({
      id: area,
      name: z.string(),
      short: z.string(),
      items: z.array(z.string()),
      when: z.array(z.string()),
      get: z.array(z.string()),
    })
  ),
  steps: z.array(z.object({ t: z.string(), b: z.string(), tag: z.string().optional() })),
  principles: z.array(z.object({ t: z.string(), b: z.string() })),
  faqServices: faq,
  faqContact: faq,
  insights: z.array(
    z.object({
      id: z.string(),
      sector: z.string(),
      meta: z.string(),
      tone: z.enum(['card', 'forest']),
      headline: z.string(),
      lede: z.string(),
      // Paragraphs; an entry starting with "## " is a subheading.
      body: z.array(z.string()),
      receipt,
    })
  ),
  symptoms: z.array(z.object({ id: z.string(), label: z.string(), fix: z.string(), area })),
  areas: z.record(area, z.string()),
  findings: z.record(area, z.string()),
  // Filter chips with no insight yet (shows the empty state).
  extraSectors: z.array(z.string()),
});

export type AviseContent = z.infer<typeof schema>;
export type Insight = AviseContent['insights'][number];

export const content: AviseContent = schema.parse(raw);
