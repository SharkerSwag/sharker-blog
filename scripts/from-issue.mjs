#!/usr/bin/env node
/**
 * 把一张 GitHub Issue 表单，变成 `src/content/` 里的一篇 Markdown。
 *
 * 为什么要有这个：
 * 之前发文只有「写文件 → git push」一条路，等于必须开电脑、开终端。
 * 而便利贴这种东西的价值全在"想到就发"，流程一重就不发了。
 * Issue 表单是 GitHub 自带的可视化界面，手机上就能填，提交即发布。
 *
 * 本地调试：
 *   node scripts/from-issue.mjs --event ./tmp-event.json
 * 事件载荷的形状见 https://docs.github.com/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#issues
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL } from '../site.config.mjs';
import { fileStem, frontmatter, today, uniquePath } from './lib/note.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_DIR = join(ROOT, 'src', 'content');
const COMMENT_FILE = join(ROOT, '.publish-comment.md');

/**
 * 表单字段的标题。
 * 必须和 .github/ISSUE_TEMPLATE/publish.yml 里的 label 完全一致——
 * Issue 表单渲染成 Markdown 之后，字段名就是 `### <label>`。
 */
const FIELDS = ['板块', '标签', '正文', '置顶', '期刊 / 会议', '年份', '原文链接', '主题'];

const COLLECTION_LABELS = {
  notes: '随笔',
  bulletin: '布告牌',
  papers: '论文阅读',
  interview: '面经与八股',
};

function die(reason) {
  console.error(`[clio] ${reason}`);
  process.exit(1);
}

/** 表单里没填的可选项会渲染成 `_No response_`，得当成空值。 */
const clean = (value) => {
  const text = String(value ?? '').trim();
  return text === '_No response_' || text === 'No response' ? '' : text;
};

/**
 * 按 `### 字段名` 把正文切开。
 *
 * 只在标题命中已知字段名时才认为是新字段——否则文章正文里自己写的
 * `### 小节` 会被误当成表单字段，把内容切碎。
 */
function parseSections(body) {
  const found = new Map();
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) found.set(current, clean(buffer.join('\n')));
    buffer = [];
  };

  for (const line of String(body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading && FIELDS.includes(heading[1])) {
      flush();
      current = heading[1];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return found;
}

/** 「标签」一栏的容错：逗号、顿号、空格、井号都能当分隔符。 */
const parseTags = (raw) =>
  clean(raw)
    .split(/[,，、\s#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const argValue = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH || argValue('--event');
  if (!eventPath) die('没找到事件载荷：请设置 GITHUB_EVENT_PATH，或用 --event <文件> 指定。');
  if (!existsSync(eventPath)) die(`事件载荷不存在：${eventPath}`);

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const issue = event.issue;
  if (!issue) die('事件载荷里没有 issue 字段，这个脚本只能处理 issues 事件。');

  const sections = parseSections(issue.body ?? '');

  // 板块决定落到哪个目录。表单选项写成「随笔（notes）」这样的形式，这里把英文名抠出来。
  const picked = clean(sections.get('板块'));
  const collection = /\b(notes|bulletin|papers|interview)\b/.exec(picked)?.[1];
  if (!collection) {
    die(`认不出板块（读到的是「${picked || '空'}」）。表单里的「板块」必须保留括号中的英文名。`);
  }

  // 标题就取 issue 标题，去掉 `[发布] ` 前缀。
  const title = String(issue.title ?? '')
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .trim();

  const body = clean(sections.get('正文'));
  if (!body) die('「正文」是空的，没什么可发的。');

  const tags = parseTags(sections.get('标签'));
  const pinned = /\[[xX]\]/.test(clean(sections.get('置顶')));

  const yearText = clean(sections.get('年份'));
  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : '';

  const fields = [];
  if (collection !== 'bulletin') fields.push(['title', title || '无题']);
  fields.push(['pubDate', today()]);
  if (pinned) fields.push(['pinned', true]);
  if (tags.length) fields.push(['tags', tags]);
  if (collection === 'papers') {
    fields.push(['venue', clean(sections.get('期刊 / 会议'))]);
    fields.push(['year', year]);
    fields.push(['link', clean(sections.get('原文链接'))]);
  }
  if (collection === 'interview') fields.push(['topic', clean(sections.get('主题'))]);

  const dir = join(CONTENT_DIR, collection);
  mkdirSync(dir, { recursive: true });

  // 中文标题里可能一个英文词都没有，那就退到时分兜底（和命令行、网页写作台同一套规则）。
  // 这里还有 uniquePath 兜第二层：同一分钟提交两条也不会互相覆盖。
  const target = uniquePath(dir, fileStem(today(), title));
  const relative_ = `src/content/${collection}/${target.split(/[\\/]/).pop()}`;

  writeFileSync(target, `${frontmatter(fields)}${body}\n`, 'utf8');

  const url = `${SITE_URL}${collection}/${target.split(/[\\/]/).pop().replace(/\.md$/, '')}/`;

  writeFileSync(
    COMMENT_FILE,
    [
      `已收下，落到 ${relative_}。`,
      '',
      `**上线地址**：${url}`,
      '',
      '构建大约一分钟，刷新就能看到。',
      '',
      '这个 issue 会自动关闭——它只是一张投稿单，内容已经进仓库了。',
      '要改的话，直接去仓库改那个 Markdown 文件；要补发，就再开一张。',
      '',
    ].join('\n'),
    'utf8',
  );

  // 提交信息交给 git 自己读文件，避免标题里的引号把 shell 命令拆坏。
  writeFileSync(join(ROOT, '.publish-message.txt'), `content: ${title || '便签'}\n`, 'utf8');

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `changed=true\npath=${relative_}\n`);
  }

  console.log(`[clio] 已写入 ${relative_}`);
  console.log(`[clio] 上线地址 ${url}`);
}

main();
