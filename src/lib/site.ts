/**
 * 站点根路径。全站拼链接一律从这里取，不要直接用 import.meta.env.BASE_URL。
 *
 * 原因：Astro 的 BASE_URL 不带结尾斜杠（base 配成 `/sharker-blog` 时它是 `/sharker-blog`），
 * 而全站拼链接的写法是 `${base}notes/`。两者一凑就变成 `/sharker-blognotes/`，
 * 本地构建不报错，线上点任何内页都是 404。
 *
 * 所以在这里补齐斜杠，让「base 一定以 / 结尾」成为全站唯一的约定。
 */
const raw = import.meta.env.BASE_URL;

export const base = raw.endsWith('/') ? raw : `${raw}/`;

/**
 * GitHub 仓库坐标，用来拼「在网页上新建一个文件」的地址（见 /write/）。
 *
 * 从 site 和 base 反推，不写第二处：项目站点的地址固定是
 * <用户名>.github.io/<仓库名>/，所以这两个值本来就藏在站点地址里。
 * 仓库改名时只改 site.config.mjs，这里跟着变。
 */
const origin = new URL(import.meta.env.SITE ?? 'https://sharkerswag.github.io');

export const REPO = {
  owner: origin.hostname.split('.')[0],
  name: base.replace(/\//g, ''),
  /** 默认分支。GitHub 新建文件页要在地址里带上它。 */
  branch: 'main',
} as const;
