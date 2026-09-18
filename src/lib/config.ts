// 站点级可调参数。
// 想改「一页几篇」「便利贴贴几天」这类行为，只动这个文件，不用翻组件。

export const SITE = {
  /** 列表页每页条数。 */
  pageSize: 10,
  /** 首页每个板块展示的条数。 */
  homeLimit: 3,
  /** 每个板块最多允许置顶的篇数，超出的部分会按普通文章处理。 */
  pinLimit: 3,
  /** 布告牌墙上最多同时贴几张。 */
  wallLimit: 9,
  /** 便利贴在墙上停留的天数，超过就摘下来——文件不删，仍在归档页里。 */
  bulletinTtlDays: 7,
} as const;

/** 天数换算成毫秒。 */
export const days = (n: number) => n * 24 * 60 * 60 * 1000;
