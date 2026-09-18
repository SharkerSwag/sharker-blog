// 站点地址。
//
// astro.config.mjs（构建）和 scripts/from-issue.mjs（自动发文后拼链接）都要用，
// 写死两处迟早会走偏，所以放在这里共享。
//
// SITE_BASE 必须和 GitHub 仓库名一致：项目站点发布在 <用户名>.github.io/<仓库名>/。
// 仓库改名时只改这一行。
export const SITE_ORIGIN = 'https://sharkerswag.github.io';
export const SITE_BASE = '/sharker-blog';

/** 带结尾斜杠的整站前缀，拼任何站内地址都用它。 */
export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE}/`;
