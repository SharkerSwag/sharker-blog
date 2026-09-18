// 新建内容时共用的零件。
//
// `npm run new`（本地命令行）和 scripts/from-issue.mjs（网页表单自动发文）都走这一份，
// 免得两处的文件名规则、frontmatter 引号规则各自演化，最后同一个站里出现两种风格。
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 北京时间日期，形如 2026-09-18。
 * 固定用 UTC+8，不取构建机时区——否则 GitHub 的 UTC 机器上会写成前一天。
 */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/**
 * 标题 → 文件名片段。
 *
 * 只取 ASCII 字母数字：中文标题直接进网址会变成一串 %E5%8F%88…，
 * 既不好看也不好念。中文标题原样写在 frontmatter 的 title 里，不受影响。
 * 标题里一个英文词都没有时返回空串，由调用方决定兜底方案。
 */
export const slugify = (text = '') =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** 同名时往后加序号，绝不覆盖已有文件。 */
export function uniquePath(dir, base) {
  let name = base;
  let i = 2;
  while (existsSync(join(dir, `${name}.md`))) {
    name = `${base}-${i}`;
    i += 1;
  }
  return join(dir, `${name}.md`);
}

/** 字符串一律走 JSON 引号，省得为 `:`、`#`、`[` 这些字符单独写一套 YAML 转义规则。 */
const scalar = (value) => {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
};

/** 按给定顺序生成 frontmatter。空值跳过，不写 `venue: ''` 这种噪音。 */
export function frontmatter(fields) {
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
