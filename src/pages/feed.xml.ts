import rss from '@astrojs/rss';
import { allPosts, postUrl, postDate } from '../lib/catalogue';
import type { APIContext } from 'astro';
export async function GET(context: APIContext) {
  const posts = await allPosts();
  return rss({ title: 'SimplyShapedGames', description: 'Release news and updates from SimplyShapedGames.', site: context.site!, items: posts.map(post => ({ title: post.data.title, pubDate: postDate(post.id), description: post.data.subtitle || post.data.title, link: postUrl(post.id), categories: post.data.tags })), customData: '<language>en</language>' });
}
