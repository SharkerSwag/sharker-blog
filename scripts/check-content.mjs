#!/usr/bin/env node
/**
 * 构建前的内容自检：扫一遍 src/content 里的源文件，看有没有会被浏览器执行的东西。
 *
 * 为什么要有这一道
 * ----------------
 * Astro 会把 Markdown 里的 HTML **原样输出**。实测把下面三样写进 .md，
 * 构建出的页面里就是它们本身，在读者浏览器上照常跑：
 *
 *     <script>…</script>
 *     <img src=x onerror=…>
 *     [点这里](javascript:…)
 *
 * 这不是配置错了，是 Astro 的默认行为——它假设内容作者可信。
 *
 * 本站的主要边界其实在发布通道上：能往 src/content/ 写东西的只有作者本人
 * （.github/workflows/pages.yml 的 publish job 会核对 issue 作者是不是仓库主人，
 * scripts/from-issue.mjs 里还有第二道同样的校验）。所以这一道不是主防线，
 * 它挡的是另一件事——**顺手的复制粘贴**：从网页、PDF、别人的笔记里拷一段
 * Markdown 过来是常事，里面藏一个 javascript: 链接，点一下就会执行。
 *
 * 为什么不改渲染，而是报错
 * ------------------------
 * 挂个 rehype 插件把 href 摘掉，问题是安静：内容被改了，谁也不知道。
 * 而这类事情出错的方式本来就很安静。宁可构建失败并指出是哪一篇哪一行，
 * 让人看一眼再决定——和 check-links 一样，把问题摆出来，不替人做决定。
 *
 * 什么不算
 * --------
 * 围栏代码块（``` 或 ~~~ 包起来）里的内容会被转义成文本，`<script>` 在那儿
 * 就是个例句。所以写安全笔记、贴 XSS 例子时不会误伤。行内代码同理。
 * 真要在代码块外面写一段这样的 HTML，在那行加上 `<!-- allow-html -->` 就跳过。
 *
 *   npm run check:content
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_DIR = join(ROOT, 'src', 'content');

/** 行内写了这个标记就跳过该行。给"我就是要写这段 HTML"留的出口。 */
const ALLOW = '<!-- allow-html -->';

const RULES = [
  {
    re: /(?:javascript|vbscript)\s*:/i,
    why: '危险协议的链接：点一下就会执行里面的脚本',
  },
  {
    re: /data\s*:\s*text\/html/i,
    why: 'data:text/html 常常整页都是脚本',
  },
  {
    re: /<\s*(?:script|iframe|object|embed|base)\b/i,
    why: '这些标签会自己加载并执行内容',
  },
  {
    re: /\bsrcdoc\s*=/i,
    why: 'iframe 的 srcdoc 可以塞进一整页 HTML',
  },
  {
    re: /<[a-z][^>]*\son[a-z]+\s*=/i,
    why: '标签上的事件属性（onerror、onclick…）就是一段待执行的脚本',
  },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/i.test(name)) out.push(full);
  }
  return out;
}

if (!statSync(CONTENT_DIR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`找不到 ${relative(ROOT, CONTENT_DIR)}，检查目录结构。`);
  process.exit(1);
}

const files = walk(CONTENT_DIR);
const hits = [];

for (const file of files) {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const from = relative(ROOT, file).replace(/\\/g, '/');
  let fence = null;

  lines.forEach((line, i) => {
    // 围栏代码块要整块跳过，而且 ``` 与 ~~~ 是两套，别互相干扰。
    const fenceMark = /^\s*(```|~~~)/.exec(line)?.[1];
    if (fenceMark) {
      if (fence === null) fence = fenceMark;
      else if (fence === fenceMark) fence = null;
      return;
    }
    if (fence !== null) return;
    if (line.includes(ALLOW)) return;

    // 行内代码会被转义成文本，从这一行里去掉再查。
    const bare = line.replace(/`[^`]*`/g, '');

    for (const rule of RULES) {
      if (rule.re.test(bare)) {
        hits.push({ from, line: i + 1, why: rule.why, text: line.trim().slice(0, 120) });
        break;
      }
    }
  });
}

if (hits.length) {
  console.error(`\n内容自检发现 ${hits.length} 处会被浏览器执行的东西：\n`);
  for (const hit of hits) {
    console.error(`  ${hit.from}:${hit.line}`);
    console.error(`    ${hit.text}`);
    console.error(`    → ${hit.why}\n`);
  }
  console.error(
    [
      '如果这确实是内容的一部分（比如正在写一篇讲 XSS 的笔记），把那一段放进 ``` 代码块里，',
      `它就不会被当成 HTML 渲染；确实需要原样写，就在那一行末尾加 ${ALLOW}。`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`内容自检通过：${files.length} 个文件，没有发现可执行的片段。`);
