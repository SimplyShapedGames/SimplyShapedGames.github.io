import { getCollection } from 'astro:content';
export const categories = [
  { id: 'all', title: 'All', href: '/#games-mods' }, { id: 'games', title: 'Games', href: '/games/' },
  { id: 'mods', title: 'Mods', href: '/mods/' },
] as const;
export type Category = typeof categories[number]['id'];
export const categoryLabels = { games: 'Game', mods: 'Mod', websites: 'Website', design: 'Design' };
// Explicit public catalogue: the parent portfolio owns website and design work.
export const gameProjectIds = ['shapedash', 'pieceperfect', 'slide', 'copycat-expansion', 'the-witch-who-laughs'] as const;
export const gamePostIds = ['2020-06-16-SSG-Published-Slide', '2025-08-31-SSG-The-Witch-Who-Laughs', '2026-03-18-SSG-Published-PiecePerfect', '2026-08-17-SSG-Published-ShapeDash', '2026-09-01-SSG-Copycat-Expansion', '2026-09-02-SSG-Witch-Audio-Update'] as const;
export const allProjects = async () => (await getCollection('projects', ({ id, data }) => gameProjectIds.some(publicId => publicId === id) && data.published && data.status !== 'In development')).sort((a,b) => a.data.order - b.data.order);
export const allPosts = async () => (await getCollection('posts', ({ id }) => gamePostIds.some(publicId => publicId === id))).sort((a,b) => b.id.localeCompare(a.id));
export const postUrl = (id: string) => `/${id}/`;
export const postDate = (id: string) => new Date(`${id.slice(0,10)}T12:00:00Z`);
export const formatDate = (date: Date) => date.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
