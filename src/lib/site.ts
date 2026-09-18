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
