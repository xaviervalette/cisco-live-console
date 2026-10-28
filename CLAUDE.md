# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A starter for **internal consoles in Cisco's Magnetic design language** — the
one the Cisco IQ platform uses. Astro + Tailwind v4, static output, with the
backend plugged in over JSON at runtime.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/ (static HTML + CSS + a little JS)
```

No tests, no lint step.

## The one rule

**Structure and appearance are separate, and no component hard-codes either.**

```
src/systems/        SKIN — tokens, scoped to html[data-system='<id>']
src/archetypes/app/ BONES — Shell, Sidebar, Topbar, container cards
src/content/app.ts  the content schema
src/sites/<name>/   WHAT a given app says
src/pages/[view].astro  binds one site to one system, and hosts the API calls
```

A component may reference **only** the tokens declared in
`src/systems/contract.css`. Never a literal colour, radius, font or shadow.
That is what makes a reskin a one-file change.

This was learned the hard way: an earlier version abstracted only colours, and
the Cisco IQ language applied to the wrong structure looked nothing like Cisco
IQ. Its identity is mostly structural — 56px header, 280px sidenav, dense
canvas, glass cards. Keep the two apart.

## Building an app

`src/sites/example/site.ts` **is the app**. Rewrite it and the console changes.
Everything below is data, not code:

- **the menu** — `nav` is an array of groups, each with any number of items. A
  group with a `label` gets a small-caps heading. `badge` adds a count.
- **the views** — `views` is an array. Each becomes a sidebar destination and
  a URL segment. Two or twenty, the shell does not care.
- **the cards** — each view holds any number, each with a `body` of one kind.
- **the icons** — see below.

A nav item binds to a view with `view: '<id>'`. **Never mark an item active by
hand**: the shell works it out from the URL.

### Card bodies

`steps` `tiles` `stats` `table` `prose` `input` `diff` `keyvalue` `history`
`progress`

Adding a kind means editing two files — the union in `src/content/app.ts` and
the renderer in `src/archetypes/app/components/CardBody.astro`. That is the
intended path; this repo is a template, so each project owns its copy.

### Icons

The table at the top of `src/archetypes/app/components/AppIcon.astro` maps a
name to inner SVG markup. **Adding one is a single line.** Draw on a 24×24
grid with a 1.6 stroke to stay consistent with Magnetic's own set.

`AppIconName` is open (`BuiltInIconName | (string & {})`), so a new name type-checks
without touching the type. An unknown name renders a dashed placeholder rather
than nothing, so a typo is visible instead of silent.

## Plugging in a backend

The build is static; `src/lib/live.ts` fills cards after load. Any server that
returns JSON works — Flask, FastAPI, Express, or a CDN plus a separate API.

1. Give the card a `slot` in `site.ts`, with plausible placeholder values.
2. Fetch and write it in the `<script>` of `src/pages/[view].astro`.

```ts
const d = await getJSON<Fleet>('/fleet');
if (d) setStats('fleet-stats', [{ label: 'Devices', value: String(d.devices) }]);
```

Set `PUBLIC_API_BASE` in `.env` to point elsewhere; it defaults to `/api` on
the same origin.

Rules that matter here:

- **A dead endpoint must degrade to static, never to blank.** `getJSON`
  returns `null` instead of throwing, and the card keeps its placeholder.
- **Never write a response with `innerHTML`.** Backend output is data.
  `setRows` uses `textContent` for exactly this reason.
- `setStats` / `setRows` know `CardBody`'s markup through its `data-stat` and
  `data-rows` hooks. That coupling lives only in `live.ts` — if you restyle a
  body, keep those attributes.

### Runtime states

For work that takes time, `setState('running' | 'done' | 'error' | 'idle')`
sets `data-state` on the shell. A card with `states: ['running']` shows only
in that state, and a view's `statusPill` is toned from it. CSS only, no
framework.

## Gotchas specific to this codebase

- **Astro scopes styles per component.** A class passed *into* a child
  component lands on that child's root, outside the parent's scope, so the
  parent's rule never matches. Wrap it in an element the parent owns. This
  cost a bug once already, in the collapsed sidebar's chevron.
- **Inline `style` beats a stylesheet rule.** The sidebar's collapsed width
  lives in its `<style>` block, not an inline attribute, for this reason.
- **Verify layout by measuring, not by screenshot.** An 8.5px misalignment in
  the collapsed rail was invisible in a capture. Read `getBoundingClientRect()`
  and compare against the expected centre.
- `--bg` is the page, `--surface` is a card, `--surface-nav` is the floating
  navbar. They differ: Cisco IQ's cards are `rgba(255,255,255,0.7)` glass
  while its nav is opaque.
- Gradients are always gradients. A flat system writes
  `linear-gradient(90deg, #333, #333)` so `.grad-text` keeps working.

## Provenance

The `cisco-iq` tokens and the shell measurements were read from the live Cisco
IQ product in a signed-in browser, not guessed. Each value in
`src/systems/cisco-iq/tokens.css` is annotated with the Magnetic token it came
from. Magnetic is publicly documented at <https://magnetic.cisco.com>.

**Sharp Sans is a licensed Cisco typeface and is not bundled.** It is named
first in `--font-heading` so it resolves for anyone who has it installed;
everyone else falls back to Inter, which Magnetic uses for body text.

Two deliberate departures from Magnetic, documented in the tokens file: the
type scale follows Magnetic's *display* ramp rather than its app title sizes,
and heading leading uses 1.2 rather than the 1.42 that suits dense UI. Both
because a console built from this needs headings, not just table labels.

---

# This project: the Cisco Live Console

The kit above is the starting point; what follows is what this repository
made of it. See [README.md](README.md) for running it.

## Shape

Two processes. Astro builds a static frontend; a FastAPI backend reads the
two Cisco `.xlsx` exports with openpyxl and serves JSON on `/api`. In
development they are separate ports (4330 and 8000, bridged by
`.env.development` and a loopback CORS regex). In production `main.py`
mounts `dist/`, so one process serves both — the mount is conditional, so
the same command works before a build exists.

```
api/app/config.py      paths, defaults, the settings store
api/app/parsing.py     reading the exports
api/app/analytics.py   rows -> bookings -> people, and the KPIs
api/app/main.py        the JSON routes
```

## The rule that matters here

**A row in the transaction report is not a person.** One registration can be
split across several SO numbers and arrives as several rows sharing a
`TransactionId`; a denied or refunded debit leaves rows behind that never
became a pass. Anything counting participants goes through
`analytics.people()`, which groups by transaction and then by attendee
email. Counting rows gives the wrong answer, and it gives it plausibly —
which is worse.

The second trap is `CourseAcronym`: the spelling changed between editions
(`CLEMEA2027-ITL-EB` vs `CLEMEA2025FCST`), so always go through
`parsing.parse_acronym()` rather than slicing the string.

## Gotchas found while building this

- **openpyxl dispatches on the file name.** Validating an upload from a
  temp file named `.incoming` fails before it is read. Validate from
  `BytesIO`, then write to a staging path that keeps the `.xlsx` suffix and
  `replace()` it onto the target.
- **Astro picks the next free port** when its configured one is taken, so
  the backend's CORS allows any loopback origin rather than a fixed list.
- **`.env` is loaded in every mode.** The dev-only API base lives in
  `.env.development`, or it gets baked into the production build and the
  console breaks the moment it is served from one port.
- The `DaysRemaining` column in the SO export was computed on the day of the
  export. It is recomputed against today in `read_credit_pools`, never read.

## Adding to the UI

Four card bodies were added beyond the kit's ten — `uploads`, `form`,
`editrows`, `bars` — each by the path above: the union in
`src/content/app.ts`, the renderer in `CardBody.astro`, a writer in
`src/lib/live.ts`. Keep runtime state in a `data-*` attribute styled by CSS
(`data-dragging`, `data-tone`, `data-trend`) rather than toggling classes
from JavaScript; that is how the kit's own step chips and status pill work.

Writes throw, reads do not: `getJSON` returns null so a dead endpoint leaves
a placeholder, while `sendJSON` / `sendFile` / `sendDelete` throw an
`ApiError` carrying the backend's `detail` so a failed save can explain
itself in the card.
