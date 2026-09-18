/**
 * 「写点东西」页面的交互。
 *
 * 它做的其实是一件很朴素的事：把表单里的内容拼成一段 Markdown，
 * 再拼成一个 GitHub「新建文件」的地址，让用户在浏览器里按下提交。
 * 没有后端、没有令牌、没有第三方服务——静态站能给的交互上限就在这里，
 * 但对"随手记一句"来说已经够了：打开网页，写，点两下，上线。
 */
import {
  BOARD_ORDER,
  emptyDraft,
  filePath,
  markdown,
  newFileUrl,
  parseTags,
  URL_LIMIT,
  type Draft,
} from '../lib/compose';
import type { CollectionName } from '../lib/collections';

/** 草稿在浏览器里的存放键。换格式时改这个版本号，别让旧数据把新页面搞崩。 */
const KEY = 'clio.draft.v1';

type Tone = 'ok' | 'bad' | '';

export function initWrite(form: HTMLFormElement) {
  const repo = {
    owner: form.dataset.owner ?? '',
    name: form.dataset.repo ?? '',
    branch: form.dataset.branch ?? 'main',
  };

  const pathOut = form.querySelector<HTMLElement>('[data-path]');
  const preview = document.querySelector<HTMLElement>('[data-preview]');
  const status = form.querySelector<HTMLElement>('[data-status]');
  const manual = form.querySelector<HTMLTextAreaElement>('[data-manual]');

  const field = (name: string) => form.elements.namedItem(name);
  const input = (name: string) => {
    const el = field(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  };

  const setStatus = (text: string, tone: Tone = '') => {
    if (!status) return;
    status.textContent = text;
    if (tone) status.dataset.tone = tone;
    else status.removeAttribute('data-tone');
  };

  const read = (): Draft => {
    const data = new FormData(form);
    const board = String(data.get('board') ?? 'bulletin') as CollectionName;
    return {
      board,
      title: String(data.get('title') ?? ''),
      body: String(data.get('body') ?? ''),
      summary: String(data.get('summary') ?? ''),
      tags: parseTags(String(data.get('tags') ?? '')),
      pinned: data.get('pinned') === 'on',
      lang: data.get('lang') === 'en' ? 'en' : 'zh',
      venue: String(data.get('venue') ?? ''),
      year: String(data.get('year') ?? ''),
      link: String(data.get('link') ?? ''),
    };
  };

  const render = () => {
    const draft = read();
    // 这个属性驱动 CSS：便签没有标题，随笔没有期刊。
    form.dataset.board = draft.board;
    if (pathOut) pathOut.textContent = filePath(draft);
    if (preview) preview.textContent = markdown(draft);
  };

  // ---------- 草稿：写长文时一次误刷新不该把东西全冲掉 ----------

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(read()));
    } catch {
      // 无痕模式或存储被禁用，草稿功能静默失效，不影响发布。
    }
  };

  const load = (): Partial<Draft> | null => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const apply = (draft: Draft) => {
    // 逐项设值而不是整体赋值：某个字段哪天被拿掉，这里只是少填一项，
    // 不会让整个页面在初始化时抛错——那时候用户看到的是白屏，最难查。
    const setValue = (name: string, value: string) => {
      const el = input(name);
      if (el) el.value = value;
    };
    const setChecked = (name: string, checked: boolean) => {
      const el = field(name);
      if (el instanceof HTMLInputElement) el.checked = checked;
    };

    const radio = form.querySelector<HTMLInputElement>(
      `input[name="board"][value="${draft.board}"]`,
    );
    if (radio) radio.checked = true;

    setValue('title', draft.title);
    setValue('body', draft.body);
    setValue('summary', draft.summary);
    setValue('tags', draft.tags.join(', '));
    setValue('venue', draft.venue);
    setValue('year', draft.year);
    setValue('link', draft.link);
    setChecked('pinned', draft.pinned);
    setChecked('lang', draft.lang === 'en');
  };

  // ---------- 复制 ----------

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 剪贴板 API 要 https 或 localhost，权限也可能被拒。
      // 兜底把内容摆出来让人自己选，总比点了没反应好。
      if (manual) {
        manual.hidden = false;
        manual.value = text;
        manual.focus();
        manual.select();
      }
      return false;
    }
  };

  const open = (url: string) => {
    const win = window.open(url, '_blank');
    // 不让新页面通过 window.opener 反过来操作这个页。
    if (win) win.opener = null;
    return Boolean(win);
  };

  // ---------- 启动 ----------

  const saved = load();
  if (saved && (saved.body || saved.title)) apply({ ...emptyDraft(), ...saved });

  // 从布告牌墙上的空贴纸位点进来时带 ?board=bulletin，
  // 它比上次存的草稿优先——用户点的是"贴一张"，意图明确。
  const wanted = new URLSearchParams(location.search).get('board');
  if (wanted && (BOARD_ORDER as string[]).includes(wanted)) {
    const radio = form.querySelector<HTMLInputElement>(
      `input[name="board"][value="${wanted}"]`,
    );
    if (radio) radio.checked = true;
  }

  render();
  if (saved && (saved.body || saved.title)) setStatus('已恢复上次没写完的草稿。');

  let timer: number | undefined;
  const onEdit = () => {
    render();
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 500);
  };

  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = read();

    if (draft.board !== 'bulletin' && !draft.title.trim()) {
      setStatus('这个板块需要标题。', 'bad');
      input('title')?.focus();
      return;
    }
    if (!draft.body.trim()) {
      setStatus('正文还是空的。', 'bad');
      input('body')?.focus();
      return;
    }

    save();
    const full = newFileUrl(draft, repo, { withValue: true });

    if (full.length <= URL_LIMIT) {
      // 短内容直接塞进地址带走，用户只需要按一下提交。
      if (open(full)) {
        setStatus('已在 GitHub 打开，内容填好了——按 Commit changes 就上线。');
      } else {
        setStatus('新窗口被浏览器挡住了，用「复制 Markdown」自己建一个文件吧。', 'bad');
      }
      return;
    }

    // 长文的正文塞不进地址，GitHub 会报 URL too long。
    // 这里改成"内容已复制，粘一下"：步骤多一步，但不会写到一半失败。
    void copyText(markdown(draft));
    open(newFileUrl(draft, repo, { withValue: false }));
    setStatus('内容较长，装不进网址里，已复制到剪贴板——在打开的页面里粘贴一下即可。');
  });

  form.querySelector('[data-copy]')?.addEventListener('click', async () => {
    const ok = await copyText(markdown(read()));
    setStatus(
      ok ? '已复制完整 Markdown（含 frontmatter）。' : '浏览器不让自动复制，下面是内容，手动选一下。',
      ok ? 'ok' : '',
    );
  });

  form.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (!window.confirm('清空当前草稿？清掉就找不回来了。')) return;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 存不了也就删不了，忽略 */
    }
    // 保留当前选的板块：清空的是内容，不是"我打算写到哪儿"。
    // 顺手把板块也重置回便签的话，正在写随笔的人清一下再写，
    // 内容会悄悄进到布告牌里——而且看着一切正常。
    apply(emptyDraft(read().board));
    if (manual) manual.hidden = true;
    render();
    setStatus('已清空。');
  });
}
