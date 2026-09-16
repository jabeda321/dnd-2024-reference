import type { SearchDoc } from '../pages/search-index.json';
import { escapeHtml, highlight, search } from './search';
import { getFavourites, getRecent, getTheme, loadIndex, pushRecent, setTheme, toggleFavourite } from './store';

const KIND_LABEL: Record<SearchDoc['kind'], string> = {
  rule: 'Rule',
  weapon: 'Weapon',
  mastery: 'Mastery',
  property: 'Property',
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function initTheme() {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');

  const sync = () => {
    const resolved = getTheme() ?? (media.matches ? 'dark' : 'light');
    root.dataset.resolvedTheme = resolved;
    button?.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };

  button?.addEventListener('click', () => {
    const next = root.dataset.resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    root.dataset.theme = next;
    sync();
  });
  media.addEventListener('change', sync);
  sync();
}

// ---------------------------------------------------------------------------
// Search palette
// ---------------------------------------------------------------------------

function initPalette() {
  const dialog = document.querySelector<HTMLDialogElement>('#search-palette');
  if (!dialog) return;
  const input = dialog.querySelector<HTMLInputElement>('#palette-input')!;
  const list = dialog.querySelector<HTMLUListElement>('#palette-results')!;
  const status = dialog.querySelector<HTMLElement>('#palette-status')!;
  const kindButtons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-kind]')].filter((b) => b.tagName === 'BUTTON');
  const icons = dialog.querySelector<HTMLTemplateElement>('#kind-icons')!.content;

  let docs: SearchDoc[] = [];
  let results: SearchDoc[] = [];
  let active = 0;
  let kind = '';

  const iconFor = (k: string) => icons.querySelector(`[data-kind="${k}"]`)?.innerHTML ?? '';

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  document.querySelectorAll('[data-shortcut-hint]').forEach((el) => (el.textContent = isMac ? '⌘ K' : 'Ctrl K'));

  function setActive(i: number) {
    const items = list.querySelectorAll<HTMLLIElement>('[role="option"]');
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, idx) => el.setAttribute('aria-selected', String(idx === active)));
    const current = items[active];
    input.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    const query = input.value;
    const recentMode = !query.trim();
    if (recentMode) {
      const byId = new Map(docs.map((d) => [d.id, d]));
      results = getRecent()
        .map((id) => byId.get(id))
        .filter((d): d is SearchDoc => !!d && (!kind || d.kind === kind));
    } else {
      results = search(docs, query, kind);
    }

    list.innerHTML = results
      .map(
        (d, i) => `<li class="palette-result" role="option" id="result-${i}" aria-selected="false" data-index="${i}">
          <span class="kind-icon" aria-hidden="true">${iconFor(recentMode ? 'recent' : d.kind)}</span>
          <span class="r-title">${highlight(d.title, query)}</span>
          <span class="r-summary">${escapeHtml(d.summary)}</span>
          <span class="badge${d.kind === 'mastery' ? ' badge-gold' : ''}">${escapeHtml(d.kind === 'rule' ? d.label : KIND_LABEL[d.kind])}</span>
        </li>`,
      )
      .join('');

    if (recentMode) {
      status.textContent = results.length ? 'Recently viewed' : 'Start typing to search every rule, weapon, mastery and property.';
      list.prepend(status);
    } else {
      status.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : `No results for “${query}”`;
      if (!results.length) list.append(status);
    }
    status.hidden = !!(results.length && !recentMode);
    if (results.length) setActive(0);
    else input.removeAttribute('aria-activedescendant');
  }

  async function open() {
    if (dialog!.open) return;
    dialog!.showModal();
    input.select();
    try {
      docs = await loadIndex();
    } catch {
      status.textContent = 'Search is unavailable offline until the site has been loaded once.';
    }
    render();
  }

  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-open-search]')) open();
    if ((e.target as Element).closest('[data-close-search]')) dialog.close();
  });

  // Close when clicking the backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      dialog.open ? dialog.close() : open();
    } else if (e.key === '/' && !typing && !dialog.open) {
      e.preventDefault();
      open();
    }
  });

  // Options are not links (a link inside role=option is nested-interactive), so navigate on click.
  list.addEventListener('click', (e) => {
    const option = (e.target as Element).closest<HTMLElement>('[role="option"]');
    const doc = option && results[Number(option.dataset.index)];
    if (doc) location.href = doc.url;
  });

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === 'Escape') {
      // type="search" would otherwise swallow the first Escape to clear itself.
      e.preventDefault();
      dialog.close();
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      location.href = results[active].url;
    }
  });

  kindButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      kind = btn.dataset.kind ?? '';
      kindButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      render();
      input.focus();
    }),
  );
}

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

function syncFavButtons() {
  const favs = new Set(getFavourites());
  document.querySelectorAll<HTMLButtonElement>('[data-fav]').forEach((btn) => {
    const on = favs.has(btn.dataset.fav!);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${btn.dataset.favName ?? 'entry'} ${on ? 'from' : 'to'} favourites`);
  });
}

function initFavourites() {
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    toggleFavourite(btn.dataset.fav!);
  });
  document.addEventListener('favourites-change', syncFavButtons);
  syncFavButtons();

  const docId = document.querySelector<HTMLElement>('[data-doc-id]')?.dataset.docId;
  if (docId) pushRecent(docId);
}

// ---------------------------------------------------------------------------
// Term tooltips
// ---------------------------------------------------------------------------

function initTooltips() {
  const tip = document.querySelector<HTMLElement>('#term-tip');
  if (!tip || !('showPopover' in tip)) return;

  let showTimer: number | undefined;
  let hideTimer: number | undefined;
  let anchor: HTMLAnchorElement | null = null;

  function place(link: HTMLElement) {
    const r = link.getBoundingClientRect();
    const t = tip!.getBoundingClientRect();
    const margin = 8;
    let top = r.bottom + margin;
    if (top + t.height > innerHeight - margin && r.top - t.height - margin > margin) top = r.top - t.height - margin;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - margin);
    tip!.style.top = `${top}px`;
    tip!.style.left = `${left}px`;
  }

  async function show(link: HTMLAnchorElement, withLink: boolean) {
    let docs: SearchDoc[];
    try {
      docs = await loadIndex();
    } catch {
      return;
    }
    const doc = docs.find((d) => d.id === link.dataset.term);
    if (!doc) return;
    anchor = link;
    tip!.innerHTML = `<div class="tip-kind">${escapeHtml(doc.kind === 'rule' ? doc.label : KIND_LABEL[doc.kind])}</div>
      <div class="tip-title">${escapeHtml(doc.title)}</div>
      <div class="tip-summary">${escapeHtml(doc.summary)}</div>
      ${withLink ? `<a class="tip-open" href="${doc.url}">Open ${escapeHtml(doc.title)} →</a>` : ''}`;
    tip!.id = 'term-tip';
    link.setAttribute('aria-describedby', 'term-tip');
    if (!tip!.matches(':popover-open')) tip!.showPopover();
    place(link);
  }

  function hide() {
    if (tip!.matches(':popover-open')) tip!.hidePopover();
    anchor?.removeAttribute('aria-describedby');
    anchor = null;
  }

  const termFrom = (e: Event) => (e.target as Element).closest?.<HTMLAnchorElement>('a.term') ?? null;

  document.addEventListener('pointerover', (e) => {
    const link = termFrom(e);
    if (e.pointerType !== 'mouse') return;
    if (link) {
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
      showTimer = window.setTimeout(() => show(link, false), 220);
    } else if ((e.target as Element).closest('#term-tip')) {
      clearTimeout(hideTimer);
    }
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (termFrom(e) || (e.target as Element).closest('#term-tip')) {
      clearTimeout(showTimer);
      hideTimer = window.setTimeout(hide, 150);
    }
  });
  document.addEventListener('focusin', (e) => {
    const link = termFrom(e);
    if (link) show(link, false);
    else if (!(e.target as Element).closest('#term-tip')) hide();
  });

  // Touch: first tap previews, the "Open" link inside the tip navigates.
  document.addEventListener('click', (e) => {
    const link = termFrom(e);
    const pointer = (e as PointerEvent).pointerType;
    if (link && pointer && pointer !== 'mouse' && anchor !== link) {
      e.preventDefault();
      show(link, true);
    } else if (!link && !(e.target as Element).closest('#term-tip')) {
      hide();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  addEventListener('scroll', hide, { passive: true });
}

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

function initBackButtons() {
  let cameFromSite = false;
  try {
    cameFromSite = !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1;
  } catch {
    /* malformed referrer */
  }
  document.querySelectorAll<HTMLAnchorElement>('[data-back]').forEach((btn) => {
    if (!cameFromSite) return;
    btn.querySelector('[data-back-label]')!.textContent = 'Back';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      history.back();
    });
  });
}

// ---------------------------------------------------------------------------

function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register(`${document.body.dataset.base}sw.js`).catch(() => {});
    });
  }
}

export function initShell() {
  initTheme();
  initPalette();
  initFavourites();
  initTooltips();
  initBackButtons();
  registerServiceWorker();
}
