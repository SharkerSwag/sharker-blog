#!/usr/bin/env node
/**
 * 构建后自检：把 dist 里所有站内链接刨一遍，看它们指向的文件在不在。
 *
 * 加这个是因为踩过一次：Astro 的 BASE_URL 不带结尾斜杠，而拼链接写的是
 * `${base}notes/`，结果全站内页地址都变成 `/sharker-blognotes/`。
 * 本地构建完全正常——因为构建只关心文件写出来了没有，不关心链接对不对。
 * 这种错只会在线上被点出来，所以必须由脚本守着。
 *
 *   npm run check:links
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_BASE } from '../site.config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const PREFIX = `${SITE_BASE}/`;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** 把站内地址映射到 dist 里应该存在的文件。 */
function resolveTarget(pathname) {
  const cleaned = decodeURIComponent(pathname.replace(/\/+$/, ''));
  const rel = cleaned.slice(SITE_BASE.length).replace(/^\/+/, '');
  const candidates = [];

  if (!rel) candidates.push(join(DIST, 'index.html'));
  else if (/\/[^/]+\.[a-z0-9]+$/i.test(rel)) candidates.push(join(DIST, rel));
  else {
    candidates.push(join(DIST, `${rel}.html`));
    candidates.push(join(DIST, rel, 'index.html'));
    candidates.push(join(DIST, rel));
  }

  return { rel, candidates };
}

const exists = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

if (!exists(join(DIST, 'index.html'))) {
  console.error('找不到 dist/。先跑 npm run build。');
  process.exit(1);
}

const files = walk(DIST).filter((file) => file.endsWith('.html'));
const broken = [];
const malformed = [];
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const from = relative(DIST, file).replace(/\\/g, '/');

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = match[1];

    // 只看站内绝对路径：外链、锚点、mailto、以及协议相对地址都不归这里管。
    if (!raw.startsWith('/') || raw.startsWith('//')) continue;

    const pathname = raw.split('#')[0].split('?')[0];
    if (!pathname) continue;

    // 根路径本身就等于 base（GitHub Pages 会补上结尾斜杠），不用查文件。
    if (pathname === SITE_BASE || pathname === `${SITE_BASE}/`) {
      checked += 1;
      continue;
    }

    checked += 1;

    /*
     * 关键分支：以 base 开头、但紧接着不是斜杠的地址。
     * 这正是 `/sharker-blog` + `notes/` 拼成 `/sharker-blognotes/` 的形态——
     * 它指向一个根本不存在的路径，但它不以 `${base}/` 开头，会被"只查站内链接"
     * 的写法顺手漏掉。所以这里单独拦一道。
     */
    if (!raw.startsWith(PREFIX)) {
      malformed.push({ from, raw });
      continue;
    }

    const { rel, candidates } = resolveTarget(pathname);
    if (!candidates.some(exists)) broken.push({ from, raw, rel });
  }
}

if (malformed.length) {
  console.error(`\n发现 ${malformed.length} 条地址拼错的站内链接：\n`);
  for (const item of malformed.slice(0, 40)) {
    console.error(`  ${item.from}  →  ${item.raw}`);
  }
  console.error(
    `\n这类地址少了 ${SITE_BASE} 后面那个斜杠。拼内部地址请一律用 src/lib/site.ts 里的 base（它保证以 / 结尾）。\n`,
  );
  process.exit(1);
}

if (broken.length) {
  console.error(`\n发现 ${broken.length} 条失效的站内链接：\n`);
  for (const item of broken.slice(0, 40)) {
    console.error(`  ${item.from}  →  ${item.raw}`);
  }
  if (broken.length > 40) console.error(`  ……还有 ${broken.length - 40} 条`);
  console.error('\n指向的页面不存在，检查内容集合与路由是否对得上。\n');
  process.exit(1);
}

console.log(`链接自检通过：${files.length} 个页面，${checked} 条站内链接。`);
