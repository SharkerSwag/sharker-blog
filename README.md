# Clio

个人博客。随笔、布告牌、论文阅读、面经与八股。

站名取自希腊神话中的缪斯 Clio（克利俄），她掌管**历史与记录**。

## 本地运行

```
npm install
npm run dev
```

## 构建

```
npm run build         # 输出到 dist/
npm run build && npm run check:links   # 构建 + 站内链接自检
npm run preview       # 本地预览构建结果
```

## 写作

**不用命令行也能写。** 四条路，按"当时手上有什么"选：

| 场景 | 做法 |
| --- | --- |
| **想看着界面写** | 站上的 **写点东西**（`/write/`）——选板块、填内容，点「去发布」，GitHub 会带着填好的文件名和内容打开，按一下提交就上线。手机上同样能用。 |
| **手机上、想随手发一条** | 布告牌墙上那张空的贴纸位，或者仓库 → **Issues → New issue → 「写点东西」**。 |
| **电脑上写长文** | 在仓库页面按 `.` 键，会打开浏览器里的完整编辑器（github.dev）。左边改 Markdown，右边有预览，写完在左侧源代码管理面板里提交。 |
| **改个错别字** | 直接打开那个 `.md` 文件点铅笔图标，提交。 |
| **习惯命令行** | `npm run new`（见下） |

所有方式的结果完全一样：都是往 `src/content/` 里加一个 `.md` 文件。

### 「写点东西」页是怎么做到不用后端的

它不保存任何东西，只做一件事：把表单拼成一段 Markdown，再拼成 GitHub「新建文件」的地址——
`https://github.com/<owner>/<repo>/new/main/src/content/<板块>?filename=<文件名>&value=<内容>`。
GitHub 认这两个查询参数，会把新建文件页连内容一起填好。

有两个地方要注意：

- **`value` 有长度上限。** 网址太长时 GitHub 只回一句 "URL too long"，所以 `src/lib/compose.ts` 里设了
  `URL_LIMIT`（按**编码后**的地址长度算，一个汉字会变成 9 个字符）。超了就自动降级为
  「内容已复制到剪贴板，粘贴一下」，步骤多一步，但不会写到一半失败。
- **仓库坐标是从 `site.config.mjs` 反推的**（见 `src/lib/site.ts`），不写第二处。改仓库名只改那一个文件。

草稿自动存在浏览器的 localStorage 里，刷新不丢；「清空」才会抹掉。

### 文件名规则（三条链路共用一套）

文件名是「日期 + 标题里的英文词」，例如 `2026-09-18-attention-is-all-you-need.md`。
中文标题取不出英文词，这时**退到时分**（`2026-09-18-1856.md`），而不是退成空串——
退回空串的话同一天写第二条就会撞名，而网页那条路是在 GitHub 上新建文件，撞名会被直接拒绝。

`src/lib/compose.ts`（浏览器）和 `scripts/lib/note.mjs`（Node）是同一套规则的两种实现，
改一边记得同步另一边：前者不能引 Node API，后者要判重名，所以没法共用一份。

### Issue 表单是怎么工作的

`.github/ISSUE_TEMPLATE/publish.yml` 定义一张表单，`.github/workflows/pages.yml` 里的 `publish` 任务在 issue 打开时把它解析成 Markdown 并提交。逻辑在 `scripts/from-issue.mjs`。

两个细节值得知道：

- **推送用的是 `GITHUB_TOKEN`，而它推的提交不会触发新的 push 工作流**（GitHub 故意如此，防止工作流自我递归）。所以发布和构建必须在同一次运行里串起来做，不能"推完等下一次构建"。这就是 `publish` 和 `build` 写在同一个文件里的原因。
- **表单只在新建时生效。** 想改已经发出去的内容，去仓库改文件，别重新提交一张表单。

### 用脚手架新建（命令行）

```
npm run new                        # 交互式，会问写在哪、标题是什么
npm run new -- notes 又是一年秋天    # 直接给板块和标题
npm run new -- bulletin            # 布告牌不需要标题
```

生成的文件名是「日期 + 标题里的英文词」，中文标题退到时分（见上文「文件名规则」）。

### 手动新建

所有内容都是 `src/content/` 下的 Markdown 文件，按形态分成四个集合：

| 目录 | 用途 | 必填 |
| --- | --- | --- |
| `notes/` | 随笔长文 | `title`, `pubDate` |
| `bulletin/` | 布告牌短句（无标题） | `pubDate` |
| `papers/` | 论文阅读心得 | `title`, `pubDate` |
| `interview/` | 面经与八股 | `title`, `pubDate` |

可选字段：

- `summary` —— 列表页显示的一句话摘要。**不写也行**：会自动从正文裁一段当摘要
- `tags` —— 字符串数组。会显示在文章开头，可点击进入 `/tags/` 里对应的聚合页
- `lang` —— `zh` / `en`，只用来给非中文内容打一个 `EN` 角标，**不参与翻译**
- `draft: true` —— 不发布（本地 `npm run dev` 时仍然可见，方便预览）
- `updated` —— 修订日期，会在日期旁显示「改于 …」
- `pinned: true` —— 置顶，见下文
- `bulletin` 另有 `ttl`：这张便签在墙上停留的天数
- `papers` 另有 `venue`、`year`、`link`
- `interview` 另有 `topic`

## 站内导航

四个板块之外，还有三个"找东西"的页面，外加一个"写东西"的页面：

| 页面 | 说明 |
| --- | --- |
| `/write/` | 写作台。选板块、填内容，点「去发布」跳到填好的 GitHub 新建文件页。头部右上角那个「写点东西」按钮进这里；布告牌墙上那张空白贴纸位也进这里（带 `?board=bulletin`）。 |
| `/search/` | 全文检索。**没有后端**：构建时生成一份 `search-index.json`，索引在浏览器里按需拉取（先碰搜索框才会下载），所以不影响其他页面。按 `/` 键可以直接跳到搜索框。 |
| `/tags/` | 标签总览，按使用频次排。每个标签有自己的页面，页脚还会列出"相邻标签"（和它同时出现的其他标签）。 |
| `/archive/` | 全部内容按年份摊开。已过期的便利贴也在这里，**过期只是从墙上摘下来，不是删除**。 |

页脚只留 RSS。归档/标签/搜索在头部各有一个入口，同一批链接在页脚再出现一次没有增量，
而且四个连着的行内链接之间没有间距，看着像"一整句话"，实际却是四个独立链接——既误导点击也显乱。

### 搜索为什么不用 Pagefind

Pagefind 是对的选择，但对**这个站**不是：它的分词对中文是弱项，而这里大部分内容是中文；它还要在构建后再跑一遍外部二进制，多一个依赖和版本风险。站点只有几十上百篇，用朴素子串匹配中文反而更准，也更好控样式。

索引体积随内容线性增长。如果哪天到几千篇、索引大得明显了，再换 Pagefind 不迟——那是替换 `src/pages/search-index.json.ts` 和一个前端文件的事。

## 两个自己长出来的机制

### 置顶

在任意一篇的 frontmatter 里加 `pinned: true`，它会排到所在板块列表的最前面，并带一个「置顶」标记。

**每个板块最多 3 篇**，超出的部分会自动降级成普通文章（不会丢），构建时终端里会提示。首页三个板块也遵循同样的排序。

在**布告牌**里，`pinned` 还有第二层含义：这张便签**不过期**，永远留在墙上。

### 便利贴过期

布告牌墙上只贴「还在有效期」的便签，默认 7 天（`src/lib/config.ts` 里的 `bulletinTtlDays`，单条也可用 `ttl` 覆盖）。

过期**不删文件**——它只是不再贴在墙上，仍然存在于 `/bulletin/` 归档页、`/archive/` 和自己的固定链接里。

静态站只在构建时算日期，所以仓库里配了一个每天自动重建的定时任务（`.github/workflows/pages.yml` 里的 `schedule`）。没有它，过了期的便签会一直挂在墙上。定时任务只在默认分支上生效。

## 可调参数

`src/lib/config.ts`：

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| `pageSize` | 10 | 列表页每页条数 |
| `homeLimit` | 3 | 首页每个板块展示条数 |
| `pinLimit` | 3 | 每个板块最多置顶几篇 |
| `wallLimit` | 18 | 布告牌墙上最多贴几张。贴纸 112px 起，宽屏一屏排得下六列，18 张正好三行 |
| `bulletinTtlDays` | 7 | 便利贴默认停留天数 |

## 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布到 GitHub Pages。

### 三个前提

1. **仓库要在 Settings → Pages 里启用一次。** 建库后从没发过 Pages 时，workflow 跑到 `configure-pages` 必红，而且**这一步在 workflow 里无解**——创建 Pages 站点是仓库管理操作，`GITHUB_TOKEN` 按设计永远没有该权限（所以 `enablement: true` 只会把错误换成另一句 `Resource not accessible by integration`）。

   一次性操作：仓库 → **Settings → Pages → Build and deployment → Source 选 "GitHub Actions"**。站点创建过一次之后，本仓库的 workflow 原样工作，不需要任何 token。

   症状特别容易误判：`npm ci`、`npm run build`、`npm run check:links` 一路全绿，只有最后一步红。这跟你的代码和构建配置无关。

2. **仓库名必须和 `site.config.mjs` 里的 `SITE_BASE` 一致。** 现在写的是 `/sharker-blog`，所以仓库名应为 `sharker-blog`，线上地址即 `https://sharkerswag.github.io/sharker-blog/`。仓库改名只改这一行。

3. **私有仓库要发 Pages，账号需具备 Pro 及以上**（学生可免费申请 GitHub Student Developer Pack 获得）。本仓库是公开的，不受此限；但注意**私有仓库只保护源码，站点本身仍然是全网上可访问的**。

### 关于内部链接，有一条硬约定

**拼任何站内地址，一律用 `src/lib/site.ts` 导出的 `base`，不要直接用 `import.meta.env.BASE_URL`。**

原因：Astro 的 `BASE_URL` **不带结尾斜杠**（base 配成 `/sharker-blog` 时它就是这个值），而全站拼链接的写法是 `` `${base}notes/` ``。两者一凑就成了 `/sharker-blognotes/`——页面照样构建成功，但线上点任何内页都是 404。

`src/lib/site.ts` 把结尾斜杠补齐了，让「base 一定以 `/` 结尾」成为全站唯一的约定。`npm run check:links` 会在构建后把整个 `dist/` 里的站内链接刨一遍，专门抓这类错误，CI 里也会跑。

## 目录结构

```
site.config.mjs            站点地址（astro.config.mjs 与发文脚本共用）
src/
  content.config.ts        四个集合的字段定义（zod schema）
  content/                 所有 Markdown 内容
  layouts/Base.astro       站点外壳（麦金塔机身 + 全局样式 + 导航）
  components/
    BulletinWall.astro     软木板 + 便利贴 + 点击弹出的对话框
    CollectionView.astro   列表页正文（首页与分页页共用）
    EntryList.astro        文章条目列表
    Pagination.astro       分页控件
  lib/
    config.ts              可调参数
    site.ts                带结尾斜杠的 base（拼链接一律用它）+ 从地址反推的仓库坐标
    collections.ts         四个板块的名称与说明
    entries.ts             排序、置顶、过期、分页、摘要提取
    taxonomy.ts            标签归一化与聚合
    compose.ts             草稿 → Markdown / 文件名 / GitHub 新建文件地址
  scripts/
    search.ts              搜索页的前端逻辑
    write.ts               写作台的前端逻辑
  pages/
    index.astro                  首页
    [collection]/index.astro     列表第 1 页
    [collection]/page/[page].astro 列表第 2 页起
    [collection]/[slug].astro    文章详情
    write.astro                  写作台
    search.astro                 搜索
    tags/index.astro             标签总览
    tags/[tag].astro             单标签列表
    archive/index.astro          按年份归档
    search-index.json.ts         搜索索引（构建时生成）
    rss.xml.js                   订阅源
scripts/
  new.mjs                  命令行写作脚手架
  from-issue.mjs           把 Issue 表单变成 Markdown
  check-links.mjs          构建后的站内链接自检
  lib/note.mjs             三个发文入口共用的零件（与 src/lib/compose.ts 规则一致）
.github/
  ISSUE_TEMPLATE/publish.yml   「写点东西」表单
  workflows/pages.yml          发布 / 构建 / 部署 / 每日重建
```

### 几个绕不开的坑

**分页为什么放在 `/notes/page/2/` 而不是 `/notes/2/`：** `[slug].astro` 的路由优先级高于 rest 参数，`/notes/2/` 会被当成一篇名为 `2` 的文章而 404。所以第 2 页起走 `/page/N/`。

**`getStaticPaths` 读不到本文件 frontmatter 里的变量。** Astro 会把它提成独立模块执行。所以板块名、标签聚合这类数据必须放在 `src/lib/` 下，再 import 进来。这条踩过两次。

**端点用 `.ts` 后缀，不要用 `.js`。** `src/pages/search-index.json.ts` 可以写 TypeScript；写成 `.js` 的话里面不能用 TS 语法，会构建失败。

**窄屏上布告牌只显示前 5 张。** `BulletinWall.astro` 里有一条 `.wall > li:nth-child(n + 6):not(.note-new) { display: none }`。
原因是 360px 的手机上板子内宽只有约 244px，排两列刚好，18 张贴纸要滚九屏——那就不是"一眼扫过去"的墙了。
`not(.note-new)` 不能省：省掉的话"贴一张"的入口会被自己这条规则藏起来。

**量布局别靠看截图。** Chrome 命令行那个 `--screenshot` 不带移动端模拟，出来的图和真机不是一回事
（会看起来像横向溢出，其实没有）。要看真机效果，用调试协议里的 `Emulation.setDeviceMetricsOverride`
配 `mobile: true`，顺便还能把 `gridTemplateColumns` 读出来数一下排了几列。
