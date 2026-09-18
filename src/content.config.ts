import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 四类内容共用的字段。
//
// lang 只用来给非中文内容打一个语言角标，不参与翻译——
// 文章写什么语言，就原样呈现什么语言。
//
// pinned 把条目钉在列表最前，每个板块最多 3 篇（见 lib/config.ts）。
// 在布告牌里，置顶还有第二层含义：这张便利贴不过期，永远留在墙上。
const shared = {
  pubDate: z.coerce.date(),
  updated: z.coerce.date().optional(),
  lang: z.enum(['zh', 'en']).default('zh'),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  pinned: z.boolean().default(false),
};

// 随笔：有标题的长文。读完一篇论文、想清楚一件事之后写的那种。
const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().optional(),
    ...shared,
  }),
});

// 布告牌：一两句话，只有时间和正文，不设标题。
// ttl 是这张便签在墙上停留的天数，不写就用 lib/config.ts 里的默认值。
const bulletin = defineCollection({
  loader: glob({ base: './src/content/bulletin', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ttl: z.number().positive().optional(),
    ...shared,
  }),
});

// 论文阅读：比随笔多几个文献信息字段。
const papers = defineCollection({
  loader: glob({ base: './src/content/papers', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    venue: z.string().optional(),
    year: z.number().optional(),
    link: z.string().optional(),
    summary: z.string().optional(),
    ...shared,
  }),
});

// 面经与八股：按主题归类，方便回头查。
const interview = defineCollection({
  loader: glob({ base: './src/content/interview', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    topic: z.string().optional(),
    summary: z.string().optional(),
    ...shared,
  }),
});

export const collections = { notes, bulletin, papers, interview };
