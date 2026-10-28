# Cisco Live Console

An internal dashboard for the next Cisco Live: who is registered, what the
Cisco Learning Credits cover, and how many more passes the balance leaves
room for.

Built on [cisco-iq-kit](https://github.com/xaviervalette/cisco-iq-kit) —
Astro + Tailwind v4 in Cisco's Magnetic design language — with a small
FastAPI backend that reads the two Cisco exports with openpyxl.

```
┌──────────────┐   JSON over /api   ┌──────────────┐   openpyxl   ┌─────────────┐
│  Astro SPA   │ ◀───────────────▶  │   FastAPI    │ ◀──────────▶ │ .xlsx files │
│  (static)    │                    │              │              │  data/      │
└──────────────┘                    └──────────────┘              └─────────────┘
```

## Run it

```bash
npm install          # frontend
npm run setup        # .venv + FastAPI, openpyxl
```

Two processes in development, because Astro serves the frontend with hot
reload and Python serves the data:

```bash
npm run api          # http://localhost:8000  — the JSON backend
npm run dev          # http://localhost:4330  — the console
```

Open <http://localhost:4330>. `.env.development` points the frontend at port
8000; it is development-only, so the production build keeps the default
same-origin `/api`.

For a single process, build the frontend and let the API serve it:

```bash
npm run build && npm start     # http://localhost:8000 — everything
```

`main.py` mounts `dist/` only when it exists, so the same command works
before and after a build.

## The two views

**Overview** — registrations for the configured edition, what the credits
still buy, the credit pools ordered by how soon they die, and attendance
across previous editions for context.

**Settings** — upload the two workbooks, set the edition and its dates,
maintain the pass catalogue, and watch the backend's health.

## The two workbooks

Both are exports from the Cisco Learning Credits portal. They are **not in
this repository** — they name real people and real credit balances. Drop your
own exports into `examples/` (gitignored) and they are seeded into `data/` on
a cold start, matched on the filename prefix the portal uses; otherwise the
console starts empty and says so until the first upload.

| Dataset | Export | Key columns |
|---|---|---|
| **Transaction Report** | One row per debit, credit and refund | `TransactionId`, `CourseAcronym`, `Attendees`, `Credits`, `DebitStatus` |
| **SO History** | One row per SO | `Purchased`, `Balance`, `Expired`, `ExpirationDate` |

### What counts as a participant

This is the only real judgement in the backend, and it is why the headline
figure is not a row count:

- **A registration can be split across SO numbers.** A 43-credit IT
  Leadership pass can be debited 24 credits from one pool and 19 from another
  — two rows, one person. Rows are grouped by `TransactionId` first.
- **Not every debit became a pass.** `SEND_MANUAL` and `DEBITED(Approved)`
  are live; `DEBITED(Denied)` and `DEBITED(Canceled - LP Refunded)` are not,
  and a `REFUND` row gives the credits back. A person counts when their live
  bookings, net of refunds, still carry credits.
- **People are identified by attendee email**, falling back to the name for
  the older rows that carry no email.

### How a pass is recognised

Cisco puts the edition and the pass type in one acronym, and the spelling
changed between years: `CLEMEA2027-ITL-EB`, `CLEMEA2026-FC-STD`,
`CLEMEA2025FCST`, `CLSD2025EXPGPST`. The backend splits off the edition code
and tests what remains against the **Acronym contains** patterns in the pass
catalogue, longest first — so `ITL` is never read as a Full Conference.

A registration matching no pattern is still counted, under *Unclassified*.
A missing pattern should look like a gap to fill, not like a person who
quietly vanished from the headline.

## Configuration

Everything the Settings view changes lands in `data/config.json`; the
workbooks land in `data/uploads/`. Nothing else holds state, so deleting
`data/` resets the console to the defaults and the example exports. The
directory is gitignored — it is local state, and the exports name real
people.

## What was added to the kit

The kit ships ten card bodies; this project adds four, by the path
`CLAUDE.md` describes — the union in `src/content/app.ts` and the renderer
in `CardBody.astro`:

| Body | What it is for |
|---|---|
| `uploads` | A labelled drop target per file, with its own status line |
| `form` | Named fields in groups, with a save button |
| `editrows` | A small editable table — add, change, remove |
| `bars` | A labelled horizontal bar per item |

`src/lib/live.ts` gained the matching writers and readers (`setBars`,
`readFields`, `readEditRows`, …) plus `sendJSON` / `sendFile` /
`sendDelete`. Those three throw where `getJSON` returns null, on purpose: a
read that fails should leave a placeholder in place quietly, but a save that
fails has to reach the person who pressed the button.

## Layout

```
api/app/
  config.py      paths, defaults, the settings store
  parsing.py     reading the two exports
  analytics.py   rows -> bookings -> people, and the KPIs
  main.py        the JSON routes
src/
  sites/ciscolive/site.ts   the app: nav, views, cards
  pages/[view].astro        one route per view + every API call
  content/app.ts            the content schema
  archetypes/app/           the shell and the card bodies
  systems/cisco-iq/         the Magnetic tokens
data/                       local state (gitignored)
examples/                   drop your own exports here (gitignored)
```
