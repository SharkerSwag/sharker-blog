/**
 * 站内搜索的前端部分。
 *
 * 索引用构建时生成的 /search-index.json，这里只负责匹配、排序和渲染。
 * 没有后端，没有依赖，索引按需拉取——不打开搜索页就不会下载它。
 */
type Item = {
  p: string;
  t: string;
  c: string;
  l: string;
  d: string;
  g: string[];
  s: string;
  x: string;
};

/**
 * 命中强度与展示需要的上下文。
 * 导出只为让逻辑能在 Node 里单独验证，站点代码不从这个模块取它。
 */
export type Hit = { item: Item; score: number; where: string };

const lower = (value: string) => value.toLowerCase();

/** 查询串切词。中英文标点都当分隔符，因为中文输入法下很容易打出全角逗号。 */
export const splitTerms = (query: string) =>
  lower(query)
    .split(/[\s,，、/]+/)
    .map((term) => term.trim())
    .filter(Boolean);

/**
 * 命中规则是"宽进严排"：只要有一个词命中就进结果，命中词越多分越高。
 * 不要求全部命中，是因为人会漏字、会想不起来完整说法；
 * 但全命中的条目要明显排在前面，不然多打一个词反而找不到东西。
 */
export function scoreItem(item: Item, terms: string[]): Hit | null {
  const title = lower(item.t);
  const label = lower(item.l);
  const summary = lower(item.s);
  const body = lower(item.x);
  const tags = item.g.map(lower);

  let score = 0;
  let matched = 0;
  let anchor = -1;

  for (const term of terms) {
    let hit = 0;

    if (title.includes(term)) {
      hit += 12;
      if (title.startsWith(term)) hit += 6;
    }
    if (tags.some((tag) => tag.includes(term))) hit += 6;
    if (label.includes(term)) hit += 3;
    if (summary.includes(term)) hit += 3;
    if (item.d.includes(term)) hit += 2;

    const at = body.indexOf(term);
    if (at >= 0) {
      hit += 1;
      // 越靠前出现，越可能是这篇在讲的事
      if (at < 240) hit += 1;
      if (anchor < 0 || at < anchor) anchor = at;
    }

    if (hit > 0) {
      matched += 1;
      score += hit;
    }
  }

  if (matched === 0) return null;

  // 命中词更多、标题命中的，靠前
  score += matched * 5;

  const source = summary.length > 40 ? item.s : item.x;
  const where =
    anchor >= 0 && summary.length <= 40
      ? item.x.slice(Math.max(0, anchor - 34), anchor + 96)
      : source.slice(0, 130);

  return { item, score, where };
}

/** 把命中词包进 <mark>。用文本节点拼，不走 innerHTML。 */
function highlight(text: string, terms: string[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  const use = terms.filter(Boolean);

  if (!use.length) {
    frag.append(document.createTextNode(text));
    return frag;
  }

  const pattern = [...use]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const wanted = new Set(use);
  for (const part of text.split(new RegExp(`(${pattern})`, 'gi'))) {
    if (!part) continue;
    if (wanted.has(part.toLowerCase())) {
      const mark = document.createElement('mark');
      mark.textContent = part;
      frag.append(mark);
    } else {
      frag.append(document.createTextNode(part));
    }
  }
  return frag;
}

export function initSearch(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('[data-search-input]');
  const results = root.querySelector<HTMLElement>('[data-search-results]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const filterBar = root.querySelector<HTMLElement>('[data-search-filters]');
  const indexUrl = root.dataset.index;
  const base = root.dataset.base ?? '';

  if (!input || !results || !status || !indexUrl) return;

  let index: Item[] | null = null;
  let loading: Promise<Item[]> | null = null;
  let collection = '';

  const load = () => {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(indexUrl)
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => [])
        .then((data: Item[]) => {
          index = Array.isArray(data) ? data : [];
          return index;
        });
    }
    return loading;
  };

  const setStatus = (text: string) => {
    status.textContent = text;
  };

  function render(query: string) {
    const terms = splitTerms(query);
    results!.replaceChildren();

    if (!query.trim()) {
      setStatus(index ? `索引里共 ${index.length} 条记录。` : '输入关键词开始检索。');
      return;
    }

    if (!index) {
      setStatus('正在载入索引…');
      return;
    }

    const pool = collection ? index.filter((item) => item.c === collection) : index;
    const hits = pool
      .map((item) => scoreItem(item, terms))
      .filter((hit): hit is Hit => hit !== null)
      .sort((a, b) => b.score - a.score || (a.item.d < b.item.d ? 1 : -1));

    if (!hits.length) {
      setStatus(`没有找到「${query.trim()}」${collection ? '（当前只搜了选中的板块）' : ''}。`);
      return;
    }

    const shown = hits.slice(0, 40);
    setStatus(
      `${hits.length} 条结果${hits.length > shown.length ? `，显示前 ${shown.length} 条` : ''}。`,
    );

    for (const hit of shown) {
      const li = document.createElement('li');
      li.className = 'hit';

      const link = document.createElement('a');
      link.className = 'hit-link';
      link.href = `${base}${hit.item.p}`;

      const head = document.createElement('span');
      head.className = 'hit-head';

      const when = document.createElement('span');
      when.className = 'hit-date';
      when.textContent = hit.item.d;
      head.append(when);

      const badge = document.createElement('span');
      badge.className = 'hit-kind';
      badge.textContent = hit.item.l;
      head.append(badge);

      const title = document.createElement('span');
      title.className = 'hit-title';
      const label = hit.item.t || `（${hit.item.d} 的便签）`;
      title.append(highlight(label, terms));
      head.append(title);

      link.append(head);

      if (hit.where) {
        const snippet = document.createElement('p');
        snippet.className = 'hit-snippet';
        snippet.append(highlight(hit.where, terms));
        link.append(snippet);
      }

      if (hit.item.g.length) {
        const tagRow = document.createElement('p');
        tagRow.className = 'hit-tags';
        for (const tag of hit.item.g) {
          const chip = document.createElement('span');
          chip.className = 'hit-tag';
          chip.textContent = tag;
          tagRow.append(chip);
        }
        link.append(tagRow);
      }

      li.append(link);
      results!.append(li);
    }
  }

  let timer = 0;
  const run = (updateAddress = true) => {
    const query = input.value;
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (query.trim()) await load();
      render(query);
      if (updateAddress) {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (collection) params.set('c', collection);
        const search = params.toString();
        history.replaceState(null, '', search ? `?${search}` : location.pathname);
      }
    }, 120);
  };

  // 第一次碰输入框才去拉索引，不打开搜索页的人不受影响。
  input.addEventListener('focus', () => void load());
  input.addEventListener('input', () => run());

  filterBar?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-collection]');
    if (!button) return;
    const next = button.dataset.collection ?? '';
    collection = collection === next ? '' : next;
    filterBar.querySelectorAll<HTMLButtonElement>('[data-collection]').forEach((item) => {
      item.classList.toggle('is-on', (item.dataset.collection ?? '') === collection);
    });
    run();
  });

  // 按 / 直接跳到搜索框，是老站点的习惯，也省一次鼠标移动。
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    input.focus();
  });

  const params = new URLSearchParams(location.search);
  const preset = params.get('q') ?? '';
  const presetCollection = params.get('c') ?? '';
  if (presetCollection) {
    collection = presetCollection;
    filterBar?.querySelectorAll<HTMLButtonElement>('[data-collection]').forEach((item) => {
      item.classList.toggle('is-on', (item.dataset.collection ?? '') === presetCollection);
    });
  }
  if (preset) {
    input.value = preset;
    void load().then(() => render(preset));
  } else {
    render('');
  }

  input.focus();
}
