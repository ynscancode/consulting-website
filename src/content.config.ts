import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { HERO_VARIANTS } from './lib/heroVariants';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional().default(false),
    tags: z.array(z.string()).optional().default([]),
  }),
});

const ctaSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const contactLinkType = z.enum(['email', 'linkedin', 'github', 'other']);

const site = defineCollection({
  loader: file('src/data/site.json'),
  schema: z.object({
    // "home" entry
    hero: z
      .object({
        eyebrow: z.string(),
        headlineHtml: z.string(),
        lede: z.string(),
        primaryCta: ctaSchema,
        ghostCta: ctaSchema,
        // Chosen animated hero-graphic variant. Optional so pre-existing
        // site.json (written before this field existed) still validates;
        // absent => the public page falls back to DEFAULT_HERO_VARIANT.
        graphic: z.enum(HERO_VARIANTS).optional(),
      })
      .optional(),
    // "about" entry
    // `lede` is ALSO used by the "contact" entry (kept there), so it stays
    // valid on the shared union schema even though it's no longer an about
    // field on its own — only `paragraphs` was fully removed.
    lede: z.string().optional(),
    body: z.string().optional(),
    image: z.string().nullable().optional(),
    // "contact" entry
    links: z
      .array(
        z.object({
          id: z.string(),
          type: contactLinkType,
          label: z.string(),
          value: z.string(),
        })
      )
      .optional(),
    // "emptyStates" entry
    projects: z.string().optional(),
    experience: z.string().optional(),
    blog: z.string().optional(),
    contact: z.string().optional(),
    // "highlights" collides across two entries on this shared flat schema:
    // the "home" entry stores an ORDERED ARRAY of refs, while the
    // "emptyStates" entry stores a STRING (the editable empty-copy). Union
    // both branches so neither entry gets its value stripped by zod's
    // unknown-key stripping on read (tech-lead-20260720T113459Z 1c).
    // Consumers narrow with Array.isArray() / typeof === 'string'.
    highlights: z
      .union([
        z.array(z.object({ type: z.enum(['project', 'blog']), ref: z.string() })),
        z.string(),
      ])
      .optional(),
    // "ordering" entry (tech-lead-20260729T162747) — the ONE canonical
    // category display order per collection. Deliberately NOT a repeat of the
    // `highlights` collision above: `categoryOrder` is a brand-new flat key,
    // and its `projects`/`experience` sub-keys are NESTED inside its object,
    // so they never touch the flat `projects`/`experience` string keys the
    // "emptyStates" entry uses. Optional at every level, so all four existing
    // entries validate byte-identically and nothing is stripped. Absent
    // entirely today (site.json has no `ordering` entry and must NOT be
    // seeded with one) => no persisted order => first-appearance order.
    categoryOrder: z
      .object({
        projects: z.array(z.string()).optional(),
        experience: z.array(z.string()).optional(),
      })
      .optional(),
  }),
});

const projects = defineCollection({
  loader: file('src/data/projects.json'),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    category: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    detail: z.string().optional(),
    href: z.string().optional(),
  }),
});

const experience = defineCollection({
  loader: file('src/data/experience.json'),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    category: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    detail: z.string().optional(),
    href: z.string().optional(),
  }),
});

export const collections = { blog, site, projects, experience };
