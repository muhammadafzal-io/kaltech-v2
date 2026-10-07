import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const para = z.array(z.string());

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    standfirst: z.string(),
    industry: z.string(),
    industryShort: z.string(),
    constraintFound: z.string(),
    imageCaption: z.string(),
    imageGround: z.enum(['sand', 'slate', 'deep']).default('sand'),

    // Work-index row copy.
    cardParas: para,
    cardFigure: z.string(),
    cardFigureLabel: z.string(),
    cardCount: z.number().nullable().default(null),
    cardSuffix: z.string().default(''),

    snapshot: z.array(z.object({ label: z.string(), value: z.string() })).length(5),

    situation: para,

    constraint: z.object({
      figure: z.string(),
      figureLabel: z.string(),
      paras: para,
    }),

    setAside: z
      .array(
        z.object({
          heading: z.string(),
          body: z.string(),
          taken: z.boolean().default(false),
        })
      )
      .length(3),

    built: z.array(z.object({ num: z.string(), heading: z.string(), body: z.string() })),

    difference: para,

    outcome: z.object({
      primary: z.string(),
      primaryLabel: z.string(),
      secondary: z.array(z.object({ value: z.string(), label: z.string() })).length(3),
      footnote: z.string(),
    }),

    seo: z.object({ title: z.string(), description: z.string() }),
  }),
});

const insights = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/insights' }),
  schema: z.object({
    title: z.string(),
    titleAccent: z.string().optional(),
    kicker: z.string(),
    // Unwritten entries carry a title and a kicker only. No copy is invented
    // for them, so these fields default empty rather than being required.
    standfirst: z.string().default(''),
    author: z.string().default(''),
    readingTime: z.string(),
    featured: z.boolean().default(false),
    published: z.boolean().default(true),
    order: z.number(),
    imageCaption: z.string().default(''),
    contents: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
    closing: z
      .object({
        paras: para,
        ctaLabel: z.string(),
        ctaHref: z.string(),
      })
      .nullable()
      .default(null),
    seo: z
      .object({ title: z.string(), description: z.string() })
      .nullable()
      .default(null),
  }),
});

export const collections = { work, insights };
