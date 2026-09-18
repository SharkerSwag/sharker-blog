#!/usr/bin/env node
/**
 * 生成站点图标：public/favicon.svg、public/favicon.ico、public/apple-touch-icon.png
 *
 *   npm run icons
 *
 * 为什么把图标做成"由脚本生成"而不是直接手写一个 svg 文件提交：
 * 同一个图形要出三种格式，而 .ico 和 apple-touch-icon.png 都得从矢量图重新光栅化。
 * 手改只改得动 svg，另外两个就会悄悄停在旧版本上（真发生过——改完图标，
 * 手机上还是老样子）。几何只写在这里一份，三种格式一起重建。
 *
 * ── 图形说明 ──────────────────────────────────────────────────────────
 * 一块米色的机壳，中间一块 CRT 深青屏，屏上是一个浅绿的 C。
 * 配色直接取自 src/layouts/Base.astro 的变量，和站内是同一套：
 *   #e4dfd1 机壳米色 (--shell)      #243c3b CRT 屏 (--screen)
 *   #c9dfcf 屏上浅绿 (--screen-ink)
 *
 * 米色厚边不是装饰，是必需的：方块若通体深青，在深色浏览器标签栏上会和
 * 背景糊成一片，轮廓整个消失；若通体米色，在白底标签栏上又太淡。
 * 深芯压浅底、米边压深底，两头才都立得住。
 *
 * 定稿形状是从几个方案里实测挑出来的：把候选逐个缩到 16px，用最近邻放大
 * 看真实像素，分别铺在浅色和深色标签栏底色上比对（favicon 的成败在 16px
 * 就定了，放大到 512px 好看没有意义）。C 的半径 16 / 笔画 11 是那一轮里
 * 16px 下开口最清楚的一组。
 * ─────────────────────────────────────────────────────────────────────
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public`;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('需要 sharp 才能把矢量图渲染成位图。它是 astro 的依赖，装在 node_modules 里，');
  console.error('如果找不到，先跑一次 npm install。');
  process.exit(1);
}

const COLOR = {
  shell: '#e4dfd1',
  screen: '#243c3b',
  ink: '#c9dfcf',
};

/**
 * 屏上那个 C。以 (32,32) 为圆心、半径 r、笔画 w、开口半角 gap 度，
 * 画一段开口朝右的圆弧。用极坐标算起点终点，改半径或开口角不用手推坐标。
 */
function cShape({ r, w, gap }) {
  const rad = (gap * Math.PI) / 180;
  const x = (32 + r * Math.cos(rad)).toFixed(2);
  const yTop = (32 - r * Math.sin(rad)).toFixed(2);
  const yBottom = (32 + r * Math.sin(rad)).toFixed(2);
  return `<path d="M${x} ${yTop}A${r} ${r} 0 1 0 ${x} ${yBottom}" fill="none" stroke="${COLOR.ink}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/**
 * 图标本体。rounded=false 时铺满整个画布、不留圆角——
 * apple-touch-icon 要的是满幅方图，iOS 会自己套圆角蒙版，
 * 自带圆角反而会在四角露出一圈透明。
 */
function iconSvg({ rounded = true, apple = false } = {}) {
  const caseRect = rounded
    ? `<rect width="64" height="64" rx="15" fill="${COLOR.shell}"/>`
    : `<rect width="64" height="64" fill="${COLOR.shell}"/>`;

  // 满幅版本边距收一点，免得 iOS 的圆角把边框削掉。
  const inset = apple ? 7 : 6;
  const screenSize = 64 - inset * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${caseRect}
  <rect x="${inset}" y="${inset}" width="${screenSize}" height="${screenSize}" rx="9" fill="${COLOR.screen}"/>
  ${cShape({ r: 16, w: 11, gap: 55 })}
</svg>
`;
}

const svg = iconSvg({ rounded: true });
const appleSvg = iconSvg({ apple: true, rounded: false });

/** 把 SVG 片段渲染成指定边长的 PNG。density 给高，避免 sharp 按 72dpi 先缩再放丢细节。 */
async function png(source, size) {
  return sharp(Buffer.from(source), { density: 384 })
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

/**
 * 拼一个 .ico 容器。
 *
 * 现代浏览器和 Windows Vista 之后都认「ICO 里直接塞 PNG」，所以不去手写
 * BMP + 掩码那套 1990 年代的格式。目录项 16 字节，字段含义见注释。
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 保留位，必须 0
  header.writeUInt16LE(1, 2); // 1 = 图标
  header.writeUInt16LE(entries.length, 4);

  const directories = [];
  let offset = 6 + entries.length * 16;

  for (const { size, data } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0); // 宽（256 记作 0）
    dir.writeUInt8(size >= 256 ? 0 : size, 1); // 高
    dir.writeUInt8(0, 2); // 调色板颜色数，0 = 真彩
    dir.writeUInt8(0, 3); // 保留位
    dir.writeUInt16LE(1, 4); // 色彩平面数
    dir.writeUInt16LE(32, 6); // 每像素位数
    dir.writeUInt32LE(data.length, 8); // 图像数据字节数
    dir.writeUInt32LE(offset, 12); // 数据在文件中的偏移
    offset += data.length;
    directories.push(dir);
  }

  return Buffer.concat([header, ...directories, ...entries.map((e) => e.data)]);
}

mkdirSync(OUT, { recursive: true });

writeFileSync(`${OUT}/favicon.svg`, svg);

// .ico 备一份 16/32/48：老一点的浏览器不认 SVG 图标，会退回到它。
const icoSizes = [16, 32, 48];
const ico = buildIco(
  await Promise.all(
    icoSizes.map(async (size) => ({ size, data: await png(svg, size) }))
  )
);
writeFileSync(`${OUT}/favicon.ico`, ico);

// iOS 加到主屏幕用的是这张，180×180 是当前机型的通用尺寸。
writeFileSync(`${OUT}/apple-touch-icon.png`, await png(appleSvg, 180));

console.log('已生成：');
console.log('  public/favicon.svg');
console.log(`  public/favicon.ico            ${icoSizes.join(' / ')}px，${ico.length} 字节`);
console.log('  public/apple-touch-icon.png   180×180');
