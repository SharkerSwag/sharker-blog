// 标签的归一化与聚合。
//
// 单独成一个模块，是因为 getStaticPaths 会被 Astro 提成独立模块执行，
// 拿不到 .astro 文件 frontmatter 里定义的变量（这个坑踩过两次了）。

/**
 * 把标签变成能安全放进 URL 和文件名的片段。
 *
 * 做法是"白名单"而不是"黑名单"：只保留字母、数字和 CJK，
 * 其余一律压成连字符。这样中文标签能保住可读性（`/tags/算法/`），
 * 而 `C++`、`C#`、`/`、`?` 这些既不能进 URL 也不能进 Windows 文件名的字符会被吃掉。
 */
export function tagSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** 标签全是符号时（比如只有一个 emoji），给一个稳定的兜底片段。 */
function fallbackSlug(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return `t-${h.toString(36)}`;
}

export type TagBucket = {
  /** 标签原文，显示用。 */
  tag: string;
  /** URL 片段。 */
  slug: string;
  /** 带这个标签的条目，已按时间倒序。 */
  items: any[];
  count: number;
};

/**
 * 把全部条目按标签归堆。
 *
 * 归一化之后可能撞车：`C++` 和 `C#` 都会变成 `c`。撞车时给后来者补 `-2`、`-3`，
 * 保证"标签 → 地址"始终是一对一，不会两拨文章混进同一个页面。
 */
export function buildTags(entries: any[]): TagBucket[] {
  const buckets = new Map<string, TagBucket>();
  const owners = new Map<string, string>();

  for (const entry of entries) {
    const raw: unknown = entry.data?.tags ?? [];
    if (!Array.isArray(raw)) continue;

    for (const value of raw) {
      const tag = String(value).trim();
      if (!tag) continue;

      let slug = tagSlug(tag) || fallbackSlug(tag);
      const owner = owners.get(slug);
      if (owner !== undefined && owner !== tag) {
        let n = 2;
        while (owners.has(`${slug}-${n}`)) n += 1;
        slug = `${slug}-${n}`;
      }
      owners.set(slug, tag);

      let bucket = buckets.get(slug);
      if (!bucket) {
        bucket = { tag, slug, items: [], count: 0 };
        buckets.set(slug, bucket);
      }
      bucket.items.push(entry);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, count: bucket.items.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
}

/** 标签在站内的地址。 */
export const tagHref = (base: string, slug: string) => `${base}tags/${slug}/`;
