import { getCollection } from 'astro:content';
export const categories = [
  { id: 'all', title: 'All', href: '/' }, { id: 'games', title: 'Games', href: '/games/' },
  { id: 'mods', title: 'Mods', href: '/mods/' }, { id: 'websites', title: 'Websites', href: '/websites/' },
  { id: 'design', title: 'Design', href: '/design/' },
] as const;
export type Category = typeof categories[number]['id'];
export const categoryLabels = { games: 'Game', mods: 'Mod', websites: 'Website', design: 'Design' };
export const allProjects = async () => (await getCollection('projects', ({ data }) => data.published && data.status !== 'In development')).sort((a,b) => a.data.order - b.data.order);
export const allPosts = async () => (await getCollection('posts')).sort((a,b) => b.id.localeCompare(a.id));
export const postUrl = (id: string) => `/${id}/`;
export const postDate = (id: string) => new Date(`${id.slice(0,10)}T12:00:00Z`);
export const formatDate = (date: Date) => date.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
