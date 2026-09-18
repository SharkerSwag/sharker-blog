// 四个内容集合的显示信息。
// 单独放在这里，是因为 getStaticPaths 会被 Astro 提成独立模块执行，
// 拿不到 .astro 文件 frontmatter 里定义的变量。
export const COLLECTIONS = {
  notes: { label: '随笔', blurb: '读完一篇论文、想清楚一件事之后写的那种。' },
  bulletin: { label: '布告牌', blurb: '一两句话，随手记下的。墙上只留最近的，更早的沉到下面归档。' },
  papers: { label: '论文阅读', blurb: '读过的文献与当时的心得。' },
  interview: { label: '面经与八股', blurb: '面试复盘与知识点沉淀。' },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export const COLLECTION_LABELS: Record<string, string> = {
  notes: '随笔',
  bulletin: '布告牌',
  papers: '论文阅读',
  interview: '面经与八股',
};
