import { getCollection } from 'astro:content';
import { SITE, days } from './config';
import { COLLECTION_NAMES, type CollectionName } from './collections';

/** 带日期的条目，排序、置顶、分页都只依赖这些字段。 */
export type Dated = {
  id: string;
  body?: string;
  data: { pubDate: Date; pinned?: boolean; draft?: boolean; ttl?: number };
};

/**
 * 格式化日期。
 * 刻意用 UTC 取值：`2026-09-18` 这种只写日期的写法会被解析成 UTC 零点，
 * 若改用本地时区取值，东八区之外构建时会显示成前一天。
 */
export const fmtDate = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;

/** 本地开发时把草稿也显示出来，方便预览；线上构建时过滤掉。 */
export const isVisible = (data: { draft?: boolean }) =>
  import.meta.env.DEV ? true : !data.draft;

export function sortByDateDesc<T extends Dated>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** 置顶条目：最多保留 pinLimit 篇，其余降级为普通文章，不会丢失。 */
export function withPinned<T extends Dated>(entries: T[]) {
  const sorted = sortByDateDesc(entries);
  const pinnedAll = sorted.filter((e) => e.data.pinned);
  const pinned = pinnedAll.slice(0, SITE.pinLimit);
  const pinnedIds = new Set(pinned.map((e) => e.id));
  const rest = sorted.filter((e) => !pinnedIds.has(e.id));
  return {
    pinned,
    rest,
    all: [...pinned, ...rest],
    /** 超出置顶上限的篇数，构建时会打印提醒。 */
    overflow: pinnedAll.length - pinned.length,
  };
}

/** 便利贴是否还在墙上。置顶的永久保留，其余按 ttl（默认取全局天数）过期。 */
export function isLive(entry: Dated, now: Date = new Date()) {
  if (entry.data.pinned) return true;
  const ttl = entry.data.ttl ?? SITE.bulletinTtlDays;
  return now.getTime() - entry.data.pubDate.valueOf() < days(ttl);
}

/** 从 Markdown 正文里剥出一段纯文本，用于便利贴预览与 RSS 描述。 */
export function excerpt(body = '', len = 60) {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, len);
}

/**
 * 列表页那行小字：写了 summary 就用它，没写就从正文自动裁一段。
 * 不这么做的话，papers / interview 忘了写 summary 就只剩一行光标题。
 */
export function autoSummary(entry: { data: { summary?: string }; body?: string }, len = 76) {
  const written = entry.data.summary?.trim();
  if (written) return written;
  const derived = excerpt(entry.body ?? '', len);
  return derived ? `${derived}…` : '';
}

/** 粗略估算阅读时长：中文按 350 字/分钟，西文按 200 词/分钟。 */
export function readingTime(body = '') {
  const cn = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (body.match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(cn / 350 + words / 200));
}

/** 取某集合排序后的全部可见条目。列表页与首页共用同一套排序，避免两处不一致。 */
export async function loadCollection(name: CollectionName) {
  const entries = await getCollection(name as any, ({ data }: any) => isVisible(data));
  return withPinned(entries as any as Dated[]);
}

/** 四个集合的全部条目，每条带上 `type` 标明出自哪个板块。标签页、归档页、搜索索引用它。 */
export async function loadEverything() {
  const groups = await Promise.all(
    COLLECTION_NAMES.map(async (name) => {
      const entries = await getCollection(name as any, ({ data }: any) => isVisible(data));
      return (entries as any[]).map((entry) => ({ ...entry, type: name }));
    }),
  );
  return sortByDateDesc(groups.flat());
}

/** 分页切片。页码越界时收敛到有效范围，不会生成空页。 */
export function slicePage<T>(items: T[], page: number, size = SITE.pageSize) {
  const total = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), total);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), current, total, count: items.length };
}

export { COLLECTION_NAMES, type CollectionName };
