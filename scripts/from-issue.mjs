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
 * 表单字段，**顺序必须和 .github/ISSUE_TEMPLATE/publish.yml 里出现的顺序一致**。
 * 必须和模板里的 label 完全一致——Issue 表单渲染成 Markdown 之后，字段名就是 `### <label>`。
 *
 * 顺序不只是给人看的：下面 parseSections 靠它来判断"这一行到底是表单字段，
 * 还是作者自己在正文里写的小节标题"。改模板顺序时这个数组要同步改。
 */
const FIELDS = ['板块', '标签', '置顶', '期刊 / 会议', '年份', '原文链接', '主题', '正文'];

/**
 * 正文长度上限。放这么宽是因为这个值不该在正常写作时被碰到，
 * 它挡的是"手滑把一整份文档粘进来"——那会直接进仓库历史，事后清理很麻烦。
 */
const MAX_BODY = 40000;

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
 * 两道判定缺一不可：
 *   1. 名字得在 FIELDS 里——否则文章正文里自己写的 `### 小节` 会被误当成表单字段；
 *   2. 位置必须比上一个已接受的字段更靠后。
 *
 * 第 2 条是真正兜住的那一层。正文里写 `### 年份`、`### 主题` 这类小节标题完全
 * 可能（八股笔记里"年份"就是个自然的小节名），只查名字的话，那一行之后的内容
 * 会被整段算到「年份」字段里——正文从中间被切断，而且切掉的部分不会报错，
 * 只是安静地消失。加上"顺序只能往前走"，任何回退的标题都退回普通正文。
 * 模板里也把「正文」放在最后一个字段，两道加起来才真正安全。
 */
function parseSections(body) {
  const found = new Map();
  let current = null;
  let buffer = [];
  /** 已接受的最后一个字段在 FIELDS 中的位置。初始 -1 表示还没开始。 */
  let cursor = -1;

  const flush = () => {
    if (current) found.set(current, clean(buffer.join('\n')));
    buffer = [];
  };

  for (const line of String(body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    const at = heading ? FIELDS.indexOf(heading[1]) : -1;
    if (at > cursor) {
      flush();
      current = heading[1];
      cursor = at;
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

  // 第二道闸：workflow 的 if 已经校验过一次作者，这里再校验一次。
  // 冗余是有意的——这个脚本一跑就会把内容写进仓库并 commit 上线，
  // 单点判断一旦哪天被改错（比如有人顺手把 if 里的条件删掉"简化"），
  // 后果是博客对全网开放写入。两份判断都写着，改错一处的代价只是这个 job 不跑。
  //
  // 比的是 issue.user.login 和仓库所有者，两者都来自 GitHub 的服务端载荷，
  // 不是 issue 正文里能伪造的东西。
  const owner = event.repository?.owner?.login ?? '';
  const author = issue.user?.login ?? '';
  if (!owner || author !== owner) {
    die(
      `拒绝发布：这张 issue 的作者是「${author || '未知'}」，而仓库主人是「${owner || '未知'}」。` +
        '这个发布通道只服务站点作者本人。',
    );
  }

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
  if (body.length > MAX_BODY) {
    die(`正文 ${body.length} 字，超过 ${MAX_BODY} 字上限，像是整份文档被粘进来了。拆开发吧。`);
  }

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
