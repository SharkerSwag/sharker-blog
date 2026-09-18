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

    // 这里原本想挂一个 rehype 插件，把 `javascript:` 这类链接的 href 摘掉。
    // 没做成，记一笔免得下次再试一遍：
    // Astro 7 的默认 Markdown 处理器换成了 Sätteri，markdown.remarkPlugins /
    // rehypePlugins 要额外装 @astrojs/markdown-remark 才生效（不装就直接构建失败，
    // 报错在 config/validate.js 的 coerceLegacyMarkdownPlugins）。装它等于为了
    // 一个小过滤把整条渲染管线换掉，不值。
    //
    // 替代方案见 scripts/check-content.mjs：构建前扫一遍内容源文件，
    // 发现可疑片段就报错退出，和链接自检是同一套做法——不悄悄改渲染结果，
    // 而是把问题摆出来。那道检查也在 CI 里跑。
  },
});
