/* ---------------------------------------------------------------------------
   Live data.

   The build is static: pages ship as HTML, then this fills the cards that
   declared a `slot`. That keeps the kit independent of your backend — any
   server that can hand back JSON will do, and the same `dist/` works behind
   Flask, FastAPI, Express or a CDN with a separate API.

   The two writers below know the markup that `CardBody.astro` renders, via
   the `data-stat` / `data-rows` hooks. They are the only place that coupling
   exists: if you restyle a card body, keep those attributes and these keep
   working.
--------------------------------------------------------------------------- */

/** Override with PUBLIC_API_BASE in .env; defaults to a same-origin /api. */
export const API_BASE = import.meta.env.PUBLIC_API_BASE ?? '/api';

/** Fetch JSON, returning null instead of throwing so one dead endpoint cannot
 *  blank the whole page. The card keeps whatever placeholder it shipped with. */
export async function getJSON<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      ...init,
    });
    if (!res.ok) {
      console.warn(`[live] ${path} → HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[live] ${path} failed`, err);
    return null;
  }
}

/** An error the backend explained. `detail` is FastAPI's convention, and
 *  showing it is the difference between "save failed" and "credits must be
 *  above zero". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function reason(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === 'string') return body.detail;
  } catch {
    /* A non-JSON error body tells us nothing useful; fall through. */
  }
  return `HTTP ${res.status}`;
}

/**
 * Send JSON and expect JSON back.
 *
 * Unlike `getJSON` this THROWS on failure, on purpose: a read that fails
 * should leave the placeholder in place silently, but a write that fails has
 * to reach the person who pressed Save.
 */
export async function sendJSON<T>(path: string, body: unknown, method = 'PUT'): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(await reason(res), res.status);
  return (await res.json()) as T;
}

/** Send one file as multipart. Throws with the backend's reason on refusal. */
export async function sendFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw new ApiError(await reason(res), res.status);
  return (await res.json()) as T;
}

/** DELETE, with the same throwing contract as the writes above. */
export async function sendDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new ApiError(await reason(res), res.status);
  return (await res.json()) as T;
}

/** Find the card that declared this `slot`. */
export function card(slot: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
}

export interface Stat {
  label: string;
  value: string;
  /** Only written if the tile shipped with a delta placeholder — CardBody
   *  renders that span conditionally, so declare one in site.ts to use it. */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

/**
 * Replace a `stats` body's values in place.
 *
 * Writes into the existing tiles rather than rebuilding them, so the layout
 * never reflows and there is no flash. Extra stats beyond the tiles that
 * shipped are ignored — declare as many placeholders in `site.ts` as the API
 * returns.
 */
export function setStats(slot: string, stats: Stat[]): void {
  const root = card(slot);
  if (!root) return;
  const tiles = root.querySelectorAll<HTMLElement>('[data-stat]');
  stats.forEach((s, i) => {
    const tile = tiles[i];
    if (!tile) return;
    const label = tile.querySelector<HTMLElement>('[data-stat-label]');
    const value = tile.querySelector<HTMLElement>('[data-stat-value]');
    if (label) label.textContent = s.label;
    if (value) value.textContent = s.value;

    const delta = tile.querySelector<HTMLElement>('[data-stat-delta]');
    if (delta) {
      // Hide rather than empty: an empty span still occupies its line and
      // leaves the tile taller than its neighbours.
      delta.hidden = !s.delta;
      delta.textContent = s.delta ?? '';
      if (s.trend) delta.setAttribute('data-trend', s.trend);
    }
  });
}

export type Cell = string | { text: string; tone: 'neutral' | 'positive' | 'warning' | 'negative' | 'info' };

const TONES: Record<string, string> = {
  neutral: 'bg-[var(--surface-2)] text-[var(--ink-muted)]',
  positive: 'bg-[color-mix(in_srgb,#00a63e_12%,transparent)] text-[#007a2f]',
  warning: 'bg-[color-mix(in_srgb,#e17100_14%,transparent)] text-[#b45309]',
  negative: 'bg-[color-mix(in_srgb,#e7000b_12%,transparent)] text-[#c10007]',
  info: 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]',
};

/**
 * Replace a `table` body's rows.
 *
 * Column order comes from the markup that shipped, so the API only supplies
 * values. Cells are written with textContent, never innerHTML — a response
 * from your backend is data, and must not be able to inject markup here.
 */
export function setRows(
  slot: string,
  rows: Array<Record<string, Cell>>,
  keys: string[],
  empty?: string,
): void {
  const root = card(slot);
  const tbody = root?.querySelector('[data-rows]');
  if (!tbody) return;

  // An empty result is an answer, not a failure — a table that silently
  // collapses to nothing reads as a broken card.
  if (rows.length === 0 && empty) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = keys.length;
    td.className = 'px-3 py-6 text-center text-[13px] text-[var(--ink-muted)]';
    td.textContent = empty;
    tr.append(td);
    tbody.replaceChildren(tr);
    return;
  }

  tbody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]';
      for (const key of keys) {
        const td = document.createElement('td');
        td.className = 'px-3 py-2.5 text-[var(--ink)]';
        const cell = row[key];
        if (cell && typeof cell === 'object') {
          const pill = document.createElement('span');
          pill.className =
            'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] leading-[18px] font-medium ' +
            (TONES[cell.tone] ?? TONES.neutral);
          pill.textContent = cell.text;
          td.append(pill);
        } else {
          td.textContent = cell ?? '—';
        }
        tr.append(td);
      }
      return tr;
    }),
  );
}

/** Set the shell's `data-state`, which tones the status pill and shows or
 *  hides any card that declared `states`. */
export function setState(state: 'idle' | 'running' | 'done' | 'error'): void {
  document.getElementById('shell')?.setAttribute('data-state', state);
}

/** Set the text of the view's status pill. */
export function setStatus(text: string): void {
  const el = document.querySelector<HTMLElement>('[data-status-text]');
  if (el) el.textContent = text;
}

/* ---------------------------------------------------------------------------
   Writers and readers for the console bodies added in this project.

   Same contract as `setStats` / `setRows` above: the coupling to CardBody's
   markup lives here and nowhere else, through the `data-*` hooks.
--------------------------------------------------------------------------- */

export interface Bar {
  label: string;
  value: string;
  pct: number;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
}

/**
 * Replace a `bars` body.
 *
 * Unlike `setStats` the rows are rebuilt, because the number of bars is data
 * — one per expiry deadline, one per edition — not a fixed set of tiles. The
 * first bar in the list keeps its own markup as the template so the classes
 * stay in CardBody.astro rather than being duplicated here.
 */
export function setBars(slot: string, bars: Bar[]): void {
  const root = card(slot);
  const host = root?.querySelector<HTMLElement>('[data-bars]');
  if (!host) return;

  const template = host.querySelector<HTMLElement>('[data-bar]');
  if (!template) return;

  if (bars.length === 0) {
    const note = document.createElement('p');
    note.className = 'text-[13px] leading-[18px] text-[var(--ink-muted)]';
    note.textContent = host.dataset.empty ?? 'Nothing to show.';
    host.replaceChildren(note);
    return;
  }

  host.replaceChildren(
    ...bars.map((bar) => {
      const row = template.cloneNode(true) as HTMLElement;
      const label = row.querySelector<HTMLElement>('[data-bar-label]');
      const value = row.querySelector<HTMLElement>('[data-bar-value]');
      const fill = row.querySelector<HTMLElement>('[data-bar-fill]');
      if (label) {
        label.textContent = bar.label;
        label.title = bar.label;
      }
      if (value) value.textContent = bar.value;
      if (fill) {
        fill.style.width = `${Math.max(0, Math.min(100, bar.pct))}%`;
        fill.setAttribute('data-tone', bar.tone ?? 'info');
      }
      return row;
    }),
  );
}

/** Write a one-line message under a form or catalogue, toned by outcome. */
export function setNote(el: HTMLElement | null, text: string, tone: 'ok' | 'error' | 'muted' = 'muted'): void {
  if (!el) return;
  el.textContent = text;
  el.style.color = tone === 'ok' ? '#007a2f' : tone === 'error' ? '#c10007' : 'var(--ink-muted)';
}

/** Every `data-field` in a `form` body, as a plain object. */
export function readFields(root: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  root.querySelectorAll<HTMLInputElement>('[data-field]').forEach((input) => {
    out[input.dataset.field!] = input.value.trim();
  });
  return out;
}

/** Fill a `form` body from an object, leaving absent keys untouched. */
export function writeFields(root: HTMLElement, values: Record<string, string | number>): void {
  root.querySelectorAll<HTMLInputElement>('[data-field]').forEach((input) => {
    const value = values[input.dataset.field!];
    if (value !== undefined && value !== null) input.value = String(value);
  });
}

/** Every row of an `editrows` body, blank rows dropped. */
export function readEditRows(root: HTMLElement): Array<Record<string, string>> {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-editrows-row]'))
    .map((tr) => {
      const row: Record<string, string> = {};
      tr.querySelectorAll<HTMLInputElement>('[data-cell]').forEach((input) => {
        row[input.dataset.cell!] = input.value.trim();
      });
      return row;
    })
    // A row the user added and then left alone should not reach the backend
    // and be rejected as nameless.
    .filter((row) => Object.values(row).some((v) => v !== ''));
}

/** Rebuild an `editrows` body's rows from data, cloning the shipped row. */
export function writeEditRows(root: HTMLElement, rows: Array<Record<string, string | number>>): void {
  const body = root.querySelector<HTMLElement>('[data-editrows-body]');
  const template = root.querySelector<HTMLTemplateElement>('[data-editrows-template]');
  if (!body || !template) return;

  body.replaceChildren(
    ...rows.map((row) => {
      const tr = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      tr.querySelectorAll<HTMLInputElement>('[data-cell]').forEach((input) => {
        input.value = String(row[input.dataset.cell!] ?? '');
      });
      return tr;
    }),
  );
}

/** Add one blank row to an `editrows` body and focus its first cell. */
export function addEditRow(root: HTMLElement): void {
  const body = root.querySelector<HTMLElement>('[data-editrows-body]');
  const template = root.querySelector<HTMLTemplateElement>('[data-editrows-template]');
  if (!body || !template) return;
  const tr = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  body.append(tr);
  tr.querySelector<HTMLInputElement>('[data-cell]')?.focus();
}

/** Replace a card's subtitle, for a line that reports what the data covers. */
export function setSubtitle(slot: string, text: string): void {
  const el = card(slot)?.querySelector<HTMLElement>('[data-card-subtitle]');
  if (el) el.textContent = text;
}

/**
 * Name the account in the header from the data rather than from content.
 *
 * Which organisation a console is showing is a property of whatever was
 * uploaded, not of the build — so it is written here at runtime, and no
 * deployment ships someone else's name in its source. An empty name leaves
 * the placeholder alone, which is what a console with no data should show.
 */
export function setTenant(name: string, subtitle?: string): void {
  if (!name) return;
  const primary = document.querySelector<HTMLElement>('[data-tenant-user]');
  const secondary = document.querySelector<HTMLElement>('[data-tenant-org]');
  if (primary) primary.textContent = name;
  if (secondary && subtitle) secondary.textContent = subtitle;
}
