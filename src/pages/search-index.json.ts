import type { APIRoute } from 'astro';
import { COLLECTION_LABELS } from '../lib/collections';
import { excerpt, fmtDate, isVisible, loadEverything } from '../lib/entries';

/**
 * 构建时生成一份全文索引，供 /search/ 页面在浏览器里检索。
 *
 * 为什么不用 Pagefind：
 * 一是它对中文的分词是弱项，而这站上的内容大部分是中文；这里用朴素子串匹配，
 * 中文反而更准。二是它要在构建后再跑一遍外部二进制、多一个依赖和一个版本风险。
 * 站点规模只有几十上百篇，一个 JSON 完全够用，也更可控。
 *
 * 正文截到 2000 字：再长的部分检索价值很低，但索引体积会线性涨上去。
 * 这个文件只在搜索页里按需拉取，不拖累其他页面。
 */
export const GET: APIRoute = async () => {
  const entries = await loadEverything();

  const items = entries.map((entry: any) => ({
    /** 站内路径，不含 base，前端自己拼。 */
    p: `${entry.type}/${entry.id}/`,
    /** 标题。便签没有标题，前端会退回显示日期。 */
    t: entry.data.title ?? '',
    /** 板块 key 与显示名。 */
    c: entry.type,
    l: COLLECTION_LABELS[entry.type] ?? '记录',
    /** 日期。 */
    d: fmtDate(entry.data.pubDate),
    /** 标签。 */
    g: entry.data.tags ?? [],
    /** 手写摘要。 */
    s: entry.data.summary ?? '',
    /** 正文纯文本，检索用。 */
    x: excerpt(entry.body ?? '', 2000),
  }));

  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
