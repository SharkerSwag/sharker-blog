import { defineConfig } from 'astro/config';
import { SITE_BASE, SITE_ORIGIN } from './site.config.mjs';

// GitHub Pages 的项目站点会发布在 https://<用户名>.github.io/<仓库名>/，
// 所以 base 必须和仓库名一致，否则线上样式和内部链接会全部 404。
// 地址本身写在 site.config.mjs，改仓库名只动那一处。
export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,

  markdown: {
    // 代码高亮用浅色主题，跟纸张底色和窗口这一套视觉一致。
    // 默认是 github-dark，在这套界面里会显得突兀。
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
