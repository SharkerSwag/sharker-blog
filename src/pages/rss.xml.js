import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { excerpt, isVisible } from '../lib/entries';
import { base } from '../lib/site';

// 订阅源只收三类有标题的内容。
// 布告牌是碎片，一两条句子，塞进 feed 会把长文冲散；
// 想看便签直接去站上，那里本来就是一整面墙。
const FEED = ['notes', 'papers', 'interview'];

export async function GET(context) {
  const groups = await Promise.all(
    FEED.map(async (name) => {
      const entries = await getCollection(name, ({ data }) => isVisible(data));
      return entries.map((entry) => ({
        type: name,
        id: entry.id,
        date: entry.data.pubDate,
        title: entry.data.title ?? excerpt(entry.body, 40),
        description: entry.data.summary ?? excerpt(entry.body, 140),
      }));
    }),
  );

  const items = groups
    .flat()
    .sort((a, b) => b.date.valueOf() - a.date.valueOf())
    .slice(0, 60)
    .map((item) => ({
      title: item.title,
      pubDate: item.date,
      description: item.description,
      link: `${base}${item.type}/${item.id}/`,
    }));

  return rss({
    title: 'Clio',
    description: '随笔、论文阅读、面经与八股。',
    site: context.site,
    items,
    customData: '<language>zh-cn</language>',
  });
}
