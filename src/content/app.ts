/* ---------------------------------------------------------------------------
   Content schema for the APP archetype.

   An application shell is a different shape of content from a landing page:
   no hero or pricing, but navigation groups, a page title, and a stack of
   cards that hold tiles, stats, tables or lists.

   Measurements that drive the layout live in the archetype, not here. This
   file only says what the app contains.
--------------------------------------------------------------------------- */

/**
 * Icons the shell can draw.
 *
 * The union is the set that ships, so you get autocomplete. The `(string & {})`
 * tail keeps it OPEN: a project can add its own icon to the table in
 * `archetypes/app/components/AppIcon.astro` and use it here without having to
 * edit this type. An unknown name renders a dashed placeholder, not nothing.
 */
export type BuiltInIconName =
  | 'home' | 'grid' | 'chart' | 'book' | 'layers' | 'file'
  | 'search' | 'bell' | 'help' | 'settings' | 'chevron' | 'sparkle'
  | 'plus' | 'arrow' | 'check' | 'dot' | 'menu'
  | 'sliders' | 'diff' | 'inspect' | 'clock' | 'upload' | 'download' | 'key' | 'table';

export type AppIconName = BuiltInIconName | (string & {});

export interface NavItem {
  label: string;
  icon: AppIconName;
  /** The view this item opens. The shell marks it active when it matches the
   *  view being rendered, so no content file hard-codes an active flag. */
  view?: string;
  /** For links that leave the app. Ignored when `view` is set. */
  href?: string;
  /** Small count pill at the item's end, e.g. a history total. */
  badge?: string | number;
}

/** Nav items under an optional small-caps heading, as Magnetic groups them. */
export interface NavGroup {
  /** Rendered as the `.pol-navigation__section-label` heading. Omit for the
   *  first, unlabelled group. */
  label?: string;
  items: NavItem[];
}

export interface Tenant {
  /** The product name beside the mark, top-left. */
  product: string;
  /** Shown in the header's tenant switcher. */
  user: string;
  org: string;
}

/** The button above the nav that switches workspace ("Home"). */
export interface Switcher {
  label: string;
  icon: AppIconName;
}

/* --- Card bodies ---------------------------------------------------------
   Every block on the canvas is a container card. What differs is the body. */

export interface TileItem {
  title: string;
  description: string;
  icon: AppIconName;
  href?: string;
}

export interface StatItem {
  label: string;
  value: string;
  /** e.g. '+12%'. Rendered in the positive or negative tone. */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface TableColumn {
  key: string;
  label: string;
  /** Right-align numeric columns. */
  align?: 'start' | 'end';
}

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

export interface TableRow {
  [key: string]: string | { text: string; tone: BadgeTone };
}

export interface StepItem {
  title: string;
  description: string;
  icon: AppIconName;
  done?: boolean;
}

/* --- Tool bodies ---------------------------------------------------------
   A console that does work, rather than only reporting it, needs a few more
   card shapes. These cover the EOL assistant's flow. */

export interface InputBody {
  kind: 'input';
  /** Placeholder for the monospace entry area. */
  placeholder?: string;
  /** Example lines shown greyed inside the field. */
  sample?: string[];
  hint?: string;
  /** The drop target under the "or" divider. */
  upload?: { label: string; hint: string };
  /** Buttons at the foot. The first is the primary. */
  actions?: Array<{ label: string; icon?: AppIconName; secondary?: boolean; badge?: string | number }>;
}

/** A single field's before/after in a comparison. */
export interface DiffRow {
  id: string;
  field: string;
  before?: string;
  after?: string;
  state: 'added' | 'removed' | 'changed' | 'same';
}

export interface KeyValueGroup {
  title: string;
  pairs: Array<{ key: string; value: string; mono?: boolean }>;
}

/* --- Runtime state ------------------------------------------------------
   A console that runs a job has to report it running. That is the one thing
   static content cannot express, so it is expressed as structure instead: the
   shape of the progress card is declared here, and whatever drives the app
   sets `data-state` on the shell root and writes into the card's slots. The
   archetype styles the states; it does not own the transport. */

export interface ProgressBody {
  kind: 'progress';
  /** Named phases, drawn as chips that fill in as each completes. The `key`
   *  is what runtime code reports back as done; the `label` is what is read. */
  steps: Array<{ key: string; label: string }>;
  /** First message, before anything has run. */
  idle?: string;
}

export interface HistoryEntry {
  label: string;
  timestamp: string;
  total: string;
  /** Named coverage percentages, each drawn as a bar. */
  coverage: Array<{ label: string; pct: number }>;
  tags?: string[];
}

/* --- Console bodies -----------------------------------------------------
   A console that is configured rather than only read needs bodies that take
   input back. These three cover the Settings view: dropping a workbook in,
   editing a handful of named fields, and maintaining a small catalogue.

   They are regular card bodies, so a settings page is still a `views` entry
   with cards in it — no second layout, no form framework. */

/** A labelled drop target. One per file the console expects. */
export interface UploadZone {
  /** Sent as the path segment when posting the file. */
  key: string;
  label: string;
  hint: string;
  /** `accept` on the file input, e.g. '.xlsx'. */
  accept?: string;
}

export interface UploadsBody {
  kind: 'uploads';
  zones: UploadZone[];
}

export interface FormField {
  /** Read back by runtime code as the field's name. */
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
  value?: string;
  /** Unit rendered inside the field's trailing edge, e.g. 'credits'. */
  suffix?: string;
  hint?: string;
  placeholder?: string;
  /** Fraction of the row this field takes. Defaults to a half. */
  span?: 'half' | 'full';
}

export interface FormBody {
  kind: 'form';
  groups: Array<{ title: string; fields: FormField[] }>;
  submitLabel?: string;
}

/** A small editable table — add a row, change a cell, remove a row. */
export interface EditRowsBody {
  kind: 'editrows';
  columns: Array<{ key: string; label: string; type?: 'text' | 'number'; suffix?: string; hint?: string }>;
  rows: Array<Record<string, string | number>>;
  addLabel?: string;
  submitLabel?: string;
}

/** A labelled horizontal bar per item — a proportion that wants reading at a
 *  glance rather than a figure that wants reading exactly. */
export interface BarsBody {
  kind: 'bars';
  items: Array<{ label: string; value: string; pct: number; tone?: BadgeTone }>;
  /** Shown in place of the bars when runtime data leaves the list empty. */
  empty?: string;
}

export type CardBody =
  | { kind: 'steps'; items: StepItem[] }
  | { kind: 'tiles'; items: TileItem[]; columns?: number }
  | { kind: 'stats'; items: StatItem[] }
  | { kind: 'table'; columns: TableColumn[]; rows: TableRow[] }
  | { kind: 'prose'; paragraphs: string[] }
  | InputBody
  | { kind: 'diff'; rows: DiffRow[] }
  | { kind: 'keyvalue'; groups: KeyValueGroup[] }
  | { kind: 'history'; entries: HistoryEntry[] }
  | ProgressBody
  | UploadsBody
  | FormBody
  | EditRowsBody
  | BarsBody;

export interface Card {
  title?: string;
  /** Small muted line under the title. */
  subtitle?: string;
  /** Text link rendered at the card's top-right. */
  action?: { label: string; href: string };
  /** Paints the AI gradient border and glow. Use sparingly — one per page. */
  featured?: boolean;
  /** A stable hook on the card's root, as `data-slot`. Runtime code targets
   *  this to replace a body's contents with live data; nothing in the
   *  archetype reads it. Omit for a card that is only ever static. */
  slot?: string;
  /** Show this card only while the shell is in one of these `data-state`
   *  values. Omit to always show it. */
  states?: string[];
  body: CardBody;
}

/** One destination in the sidebar: a page title and a stack of cards. */
export interface AppView {
  /** Matches a NavItem's `view`, and becomes the URL segment. */
  id: string;
  title: string;
  subtitle?: string;
  /** A pill beside the title whose text runtime code owns. The archetype
   *  renders it and tones it from the shell's `data-state`. */
  statusPill?: { idle: string };
  cards: Card[];
}

export interface AppSite {
  meta: { title: string; description: string; lang?: string };
  tenant: Tenant;
  switcher?: Switcher;
  nav: NavGroup[];
  /** Icon-only buttons at the header's right. */
  utilities?: Array<{ icon: AppIconName; label: string }>;
  /** Every destination. The first is the default route. */
  views: AppView[];
  footer?: { links: Array<{ label: string; href: string }>; legal?: string };
}
