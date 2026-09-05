import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(), category: z.enum(['games', 'mods', 'websites', 'design']),
    status: z.enum(['Released', 'In development', 'Ongoing maintenance', 'Completed']),
    summary: z.string(), platforms: z.array(z.string()).default([]), technologies: z.array(z.string()).default([]),
    role: z.string(), cover: z.string().optional(), icon: z.string().optional(), imageNote: z.string().optional(),
    featured: z.boolean().default(false), order: z.number(),
    gallery: z.array(z.object({ image: z.string(), caption: z.string(), alt: z.string() })).default([]),
    links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
    related: z.array(z.string()).default([]), published: z.boolean().default(true),
  })
});
// Existing posts remain the source of truth, including their original URLs.
const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './_posts', generateId: ({ entry }) => entry.replace(/\.md$/, '') }),
  schema: z.object({
    title: z.string(), subtitle: z.string().optional(), tags: z.array(z.string()).default([]),
    'cover-img': z.string().optional(), 'thumbnail-img': z.string().optional(), 'share-img': z.string().optional(),
    related_projects: z.array(z.string()).default([]),
    image: z.string().optional(), 'wide-image': z.string().optional()
  })
});
const pages = defineCollection({
  loader: glob({ pattern: 'privacypolicy.md', base: '.' }),
  schema: z.object({ title: z.string(), subtitle: z.string().optional() }),
});
export const collections = { projects, posts, pages };
