#!/usr/bin/env node
/**
 * 量一下构建耗时随文章数量的增长。
 *
 *   npm run bench            # 默认 100 / 300 篇两档
 *   npm run bench -- 50 200  # 自己指定档位
 *
 * 关心的是"写了一两年、几百篇之后，每次发布是不是要等很久"。
 * 做法：临时生成 N 篇笔记，各构建一次，记录墙钟耗时，跑完删掉。
 *
 * ★ 它会往 src/content/notes/ 里写文件（文件名带 zz-bench- 前缀，一眼认得出），
 *   所以：
 *   - 启动时先清一遍同名残留，结束时再清一遍；
 *   - 被 Ctrl-C 或超时打断时也会清（信号处理里挂了清理）。
 *
 * 计时只算墙钟，不解析 astro 的输出——输出量随篇数增长，解析容易受格式变化影响，
 * 页数直接从 dist 里数 HTML 文件，更直接。
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = `${ROOT}src/content/notes`;
const PREFIX = 'zz-bench-';

const batches = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const SIZES = batches.length ? batches : [100, 300];

const BODY = `
## 缘起

这类记录的价值在于延迟。写下来的那一刻通常还没想清楚，过一段时间回头看，
才发现当时到底卡在哪个环节上。把当时的判断原样留下，比事后总结更有用。

## 做法

先把问题缩小到可以验证的粒度。凡是"我觉得应该是这样"的句子，都换成一次实测——
本地跑一遍、或者把中间结果打出来看。多数误解在这一步就散了。

## 结果

- 定位问题花的时间，通常远多于修它的时间。
- 报错信息本身经常是误导，要看它是在哪一层抛出来的。
`;

function makeNotes(count) {
  mkdirSync(DIR, { recursive: true });
  for (let i = 0; i < count; i += 1) {
    const n = String(i).padStart(4, '0');
    writeFileSync(
      `${DIR}/${PREFIX}${n}.md`,
      `---
title: "压测样本 ${n}"
pubDate: "2026-08-${String((i % 28) + 1).padStart(2, '0')}"
tags: ["压测", "样本${i % 7}"]
summary: "用于测量构建耗时的临时样本。"
---

${BODY}
`
    );
  }
}

function clean() {
  if (!existsSync(DIR)) return 0;
  let n = 0;
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(PREFIX) && f.endsWith('.md')) {
      rmSync(`${DIR}/${f}`);
      n += 1;
    }
  }
  return n;
}

/** 数 dist 里的页面数。比解析构建输出可靠。 */
function pageCount() {
  const dist = `${ROOT}dist`;
  if (!existsSync(dist)) return null;
  let n = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      try {
        if (readdirSync(full).length >= 0) walk(full);
      } catch {
        if (name.endsWith('.html')) n += 1;
      }
    }
  };
  walk(dist);
  return n;
}

function build() {
  const t0 = Date.now();
  try {
    // 输出量随篇数增长，正常跑时丢掉；只在失败时回放，否则出错原因会被一起吞掉。
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  } catch (err) {
    console.error('\n构建失败，回放这次输出：\n');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    throw err;
  }
  return Date.now() - t0;
}

// 被打断也要把临时文件收干净——否则会留下几百个假文章，混在真实内容里。
let cleaned = false;
const cleanupOnce = () => {
  if (cleaned) return;
  cleaned = true;
  const n = clean();
  if (n) console.log(`\n已清理 ${n} 个压测文件。`);
};
process.on('SIGINT', () => { cleanupOnce(); process.exit(130); });
process.on('SIGTERM', () => { cleanupOnce(); process.exit(143); });
process.on('exit', cleanupOnce);

const leftover = clean();
if (leftover) console.log(`清掉上次残留的 ${leftover} 个压测文件。`);

const rows = [];

console.log('基线（当前实际内容）…');
rows.push({ label: '当前实际内容', extra: 0, ms: build(), pages: pageCount() });

for (const extra of SIZES) {
  clean();
  makeNotes(extra);
  console.log(`再加 ${extra} 篇…`);
  const ms = build();
  rows.push({ label: `再加 ${extra} 篇`, extra, ms, pages: pageCount() });
  clean();
}

// 每篇的边际耗时：固定开销（Vite 启动、依赖加载）之后，多一篇要多花多少毫秒。
const base = rows[0];
console.log('\n情况            页数    构建墙钟    相对基线    每篇边际');
for (const r of rows) {
  const marginal = r.extra ? ((r.ms - base.ms) / r.extra).toFixed(1) + ' ms' : '—';
  console.log(
    String(r.label).padEnd(14),
    String(r.pages ?? '—').padEnd(6),
    `${(r.ms / 1000).toFixed(1)}s`.padEnd(10),
    `+${((r.ms - base.ms) / 1000).toFixed(1)}s`.padEnd(10),
    marginal
  );
}
