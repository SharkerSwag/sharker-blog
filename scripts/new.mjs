#!/usr/bin/env node
/**
 * 新建一篇内容（本地命令行）。
 *
 *   npm run new                       交互式，一路问下来
 *   npm run new -- notes 又是一年秋天   直接给板块和标题
 *
 * 不方便用命令行的话，网页上还有两条路，见 README：
 * 在 GitHub 上填一张 Issue 表单，或者把仓库当成编辑器打开。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { frontmatter, slugify, today, uniquePath } from './lib/note.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_DIR = join(ROOT, 'src', 'content');
const date = today();

const KINDS = {
  bulletin: { label: '布告牌', about: '一两句话，随手记的' },
  notes: { label: '随笔', about: '读完一篇论文、想清楚一件事之后写的那种' },
  papers: { label: '论文阅读', about: '读过的文献与当时的心得' },
  interview: { label: '面经与八股', about: '面试复盘与知识点沉淀' },
};

const ORDER = ['bulletin', 'notes', 'papers', 'interview'];

function buildFile(kind, title, summary) {
  const fields = kind === 'bulletin' ? [] : [['title', title]];
  if (summary) fields.push(['summary', summary]);
  fields.push(['pubDate', date]);

  if (kind === 'papers') {
    // 留下来的注释行是给人看的：填不填都不影响构建，schema 里都是可选项。
    fields.push(['# venue', '会议或期刊'], ['# year', '2026'], ['# link', 'https://']);
  }
  if (kind === 'interview') fields.push(['# topic', '主题']);

  return frontmatter(fields);
}

async function main() {
  const [argKind, ...argTitle] = process.argv.slice(2);
  const interactive = input.isTTY && !argKind;
  const rl = interactive ? readline.createInterface({ input, output }) : null;

  const ask = async (question, fallback = '') => {
    if (!rl) return fallback;
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  };

  let kind = argKind;
  let title = argTitle.join(' ').trim();
  let summary = '';

  if (interactive) {
    console.log('\n写在哪里？');
    ORDER.forEach((key, i) => {
      console.log(`  ${i + 1}. ${KINDS[key].label}   ${KINDS[key].about}`);
    });

    const picked = await ask('序号（回车 = 布告牌）: ', '1');
    kind = ORDER[Number(picked) - 1] ?? 'bulletin';

    if (kind !== 'bulletin') {
      title = await ask('标题: ');
      if (!title) {
        console.error('标题不能为空。');
        rl.close();
        process.exit(1);
      }
      summary = await ask('摘要（可留空，留空就从正文自动取）: ');
    }

    rl.close();
  } else if (kind !== 'bulletin' && !title) {
    console.error('用法：npm run new -- <板块> "标题"');
    console.error(`板块：${ORDER.join(' / ')}`);
    process.exit(1);
  }

  if (!KINDS[kind]) {
    console.error(`\n不认识的板块：${kind}\n可选：${ORDER.join(' / ')}`);
    process.exit(1);
  }

  const dir = join(CONTENT_DIR, kind);
  mkdirSync(dir, { recursive: true });

  const base = [date, slugify(title)].filter(Boolean).join('-');
  const target = uniquePath(dir, base);
  writeFileSync(target, buildFile(kind, title, summary), 'utf8');

  const rel = relative(ROOT, target).replace(/\\/g, '/');
  console.log(`\n建好了：${rel}`);
  console.log('写完后：git add . && git commit -m "新内容" && git push\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
