/**
 * 「写点东西」页面的纯逻辑：由一份草稿算出文件名、frontmatter 和最终的 Markdown。
 *
 * 这里和 scripts/lib/note.mjs 是同一套规则的两种实现，必须保持一致：
 * 两边生成的文件名格式、frontmatter 字段顺序、引号风格都要一样，
 * 否则网页上建的条目和命令行建的会长得不一样，站里出现两种风格。
 *
 * 不共用一份代码是因为 scripts/lib/note.mjs 依赖 node:fs（用来判重名），
 * 进不了浏览器包。**改任何一边都要同步另一边。**
 *
 * 这个文件里不能出现任何 Node API——它会被打进浏览器。
 */
import { COLLECTIONS, type CollectionName } from './collections';

export const BOARD_ORDER: CollectionName[] = ['bulletin', 'notes', 'papers', 'interview'];

/** 写作页上每个板块的一句话说明，和命令行里问「写在哪里」时给的提示一致。 */
export const BOARD_HINTS: Record<CollectionName, string> = {
  bulletin: '一两句话，随手记的。不用标题。',
  notes: '读完一篇论文、想清楚一件事之后写的那种。',
  papers: '读过的文献与当时的心得。',
  interview: '面试复盘与知识点沉淀。',
};

export interface Draft {
  board: CollectionName;
  title: string;
  body: string;
  summary: string;
  tags: string[];
  pinned: boolean;
  lang: 'zh' | 'en';
  venue: string;
  year: string;
  link: string;
}

export const emptyDraft = (board: CollectionName = 'bulletin'): Draft => ({
  board,
  title: '',
  body: '',
  summary: '',
  tags: [],
  pinned: false,
  lang: 'zh',
  venue: '',
  year: '',
  link: '',
});

/**
 * 北京时间日期，形如 2026-09-18。
 * 固定 UTC+8 而不是取本机时区：和 scripts/lib/note.mjs 同理——
 * 人在国外、或者机器时区不对时，文件名不该跟着漂一天。
 */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/**
 * 标题 → 文件名片段。只留 ASCII 字母数字：
 * 中文标题直接进网址会变成一串 %E5%8F%88…，既不好看也不好念。
 * 标题原样写在 frontmatter 的 title 里，不受影响。
 */
export const slugify = (text = '') =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/**
 * 时分，形如 1622。只做文件名兜底用，不进 frontmatter——
 * 条目的时间仍是 pubDate 那个日期，站上展示的也是它。
 */
export const timeTag = (now = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(now)
    .replace(/[^0-9]/g, '');

/**
 * 文件名：日期 + 标题里的英文词；标题里一个英文词都没有时退到时分。
 *
 * 兜底不能是空串：中文标题很常见，一旦退回空串，文件名就只剩日期，
 * 同一天写第二条时路径和上一条完全一样——而网页那条路是在 GitHub 上新建文件，
 * 撞名会被直接拒绝（"file already exists"），表现为"点了发布但什么也没发生"。
 * 带上时分，同一天写多少条都不会撞。
 */
export function fileName(draft: Draft): string {
  return [today(), slugify(draft.title) || timeTag()].join('-') + '.md';
}

/** 相对于仓库根目录的路径，GitHub 新建文件页要用它。 */
export function filePath(draft: Draft): string {
  return `src/content/${draft.board}/${fileName(draft)}`;
}

/** 字符串一律走 JSON 引号，省得为 `:`、`#`、`[` 这些字符单独写一套转义。 */
const scalar = (value: unknown) =>
  typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(String(value));

/** 按给定顺序生成 frontmatter。空值跳过，不写 `venue: ''` 这种噪音。 */
export function frontmatter(fields: [string, unknown][]): string {
  const lines = ['---'];
  for (const [key, value] of fields) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}: [${value.map(scalar).join(', ')}]`);
      continue;
    }
    lines.push(`${key}: ${scalar(value)}`);
  }
  lines.push('---', '', '');
  return lines.join('\n');
}

/** 标签输入是逗号分隔的一串，中英文逗号都认。 */
export const parseTags = (raw: string) =>
  raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

export function markdown(draft: Draft): string {
  const fields: [string, unknown][] = [];

  // 布告牌不设标题：它是一句话，不是一篇文章。
  if (draft.board !== 'bulletin') fields.push(['title', draft.title.trim()]);
  if (draft.board !== 'bulletin') fields.push(['summary', draft.summary.trim()]);

  if (draft.board === 'papers') {
    // 年份只在确实是数字时才写成数字：schema 里 year 是 z.number()，
    // 写成 "2026" 能过（会被 coerce），但写成 "春季" 会直接让构建失败。
    const year = draft.year.trim();
    fields.push(['venue', draft.venue.trim()]);
    fields.push(['year', /^\d{4}$/.test(year) ? Number(year) : '']);
    fields.push(['link', draft.link.trim()]);
  }

  fields.push(['pubDate', today()]);
  // lang 只有非中文才写：默认值就是 zh，写了只是噪音。
  if (draft.lang === 'en') fields.push(['lang', 'en']);
  fields.push(['tags', draft.tags]);
  if (draft.pinned) fields.push(['pinned', true]);

  const body = draft.body.replace(/\s+$/, '');
  return `${frontmatter(fields)}${body}\n`;
}

/**
 * GitHub「新建文件」的地址：路径放在 /new/<分支>/ 后面，
 * 文件名由 filename 参数带，内容由 value 参数带。
 *
 * 官方从来没把这个写法写进文档，但它是 GitHub 前端自己用的入口
 * （2012 年的官方博客里提过 ?filename=，后来社区发现 value 也能预填）。
 * 所以别用它做任何不可替代的事——内容太长时 GitHub 会直接报 URL too long，
 * 调用方要准备好降级方案（见 URL_LIMIT）。
 */
export function newFileUrl(
  draft: Draft,
  repo: { owner: string; name: string; branch: string },
  options: { withValue?: boolean } = {},
): string {
  const dir = `src/content/${draft.board}`;
  const params = new URLSearchParams({ filename: fileName(draft) });
  if (options.withValue !== false) params.set('value', markdown(draft));

  return `https://github.com/${repo.owner}/${repo.name}/new/${repo.branch}/${dir}?${params}`;
}

/**
 * 带 value 的地址长度上限，超过就不塞内容了。
 *
 * 判的是**编码后的地址长度**而不是原文长度：一个汉字会被百分号编码成 9 个字符，
 * 拿原文长度判断会低估三倍。2000 是保守值——浏览器和中间代理对 URL 的容忍度
 * 从 2KB 到 8KB 不等，而 GitHub 超限时只说一句 "URL too long"，
 * 谁也不希望写完一篇东西才发现发不出去。
 *
 * 超限时走"内容已复制，粘贴一下"的降级路径，功能不丢，只多一次 Ctrl+V。
 */
export const URL_LIMIT = 2000;

export const boardLabel = (board: CollectionName) => COLLECTIONS[board].label;
