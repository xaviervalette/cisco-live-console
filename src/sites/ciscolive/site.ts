import type { AppSite } from '~/content/app';

/* ---------------------------------------------------------------------------
   The Cisco Live console.

   THIS FILE IS THE APP. Two views:

     overview   the state of the next Cisco Live — who is going, what the
                credits cover, what it leaves room for
     settings   the two workbooks, the event, and the pass catalogue

   Every number below is a placeholder. The real figures arrive from the
   Python backend in src/pages/[view].astro, keyed on the `slot` names. The
   placeholders are plausible rather than zero on purpose: with the API down
   the console still reads as a console, and an em dash is visibly "not
   loaded" rather than visibly "none".
--------------------------------------------------------------------------- */

export const site: AppSite = {
  meta: {
    title: 'Cisco Live Console',
    description: 'Registrations and Cisco Learning Credits for the next Cisco Live.',
    lang: 'en',
  },

  tenant: { product: 'Cisco Live', user: 'Alex Moreau', org: 'Your Organisation' },

  switcher: { label: 'Cisco Live EMEA 2027', icon: 'calendar' },

  utilities: [
    { icon: 'refresh', label: 'Refresh' },
    { icon: 'help', label: 'Help' },
  ],

  nav: [
    {
      items: [{ label: 'Overview', icon: 'grid', view: 'overview' }],
    },
    {
      label: 'Configuration',
      items: [{ label: 'Settings', icon: 'settings', view: 'settings' }],
    },
  ],

  views: [
    /* ---------------------------------------------------------------- overview */
    {
      id: 'overview',
      title: 'Cisco Live EMEA 2027',
      subtitle: 'Registrations and credit cover for the next edition.',

      cards: [
        {
          title: 'The next edition',
          subtitle: 'Loading…',
          slot: 'event-headline',
          featured: true,
          body: {
            kind: 'stats',
            items: [
              { label: 'Registered', value: '—', delta: '—', trend: 'flat' },
              { label: 'Credits committed', value: '—' },
              { label: 'Credits available', value: '—' },
              { label: 'Days to the event', value: '—' },
            ],
          },
        },

        {
          title: 'What the balance still buys',
          subtitle: 'Additional passes the available credits would cover, per type.',
          slot: 'purchasing-power',
          body: {
            kind: 'table',
            columns: [
              { key: 'pass', label: 'Pass' },
              { key: 'price', label: 'Credits each', align: 'end' },
              { key: 'registered', label: 'Already registered', align: 'end' },
              { key: 'affordable', label: 'Still affordable', align: 'end' },
            ],
            rows: [
              { pass: 'Full Conference', price: '—', registered: '—', affordable: '—' },
              { pass: 'IT Leadership', price: '—', registered: '—', affordable: '—' },
            ],
          },
        },

        {
          title: 'Who is going',
          subtitle: 'One row per person, not per transaction.',
          slot: 'participants',
          body: {
            kind: 'table',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'pass', label: 'Pass' },
              { key: 'credits', label: 'Credits', align: 'end' },
              { key: 'registered', label: 'Registered' },
              { key: 'so', label: 'Debited from' },
            ],
            rows: [{ name: '—', email: '—', pass: '—', credits: '—', registered: '—', so: '—' }],
          },
        },

        {
          title: 'Cisco Learning Credits',
          subtitle: 'Across every SO on the account.',
          slot: 'credit-headline',
          body: {
            kind: 'stats',
            items: [
              { label: 'Purchased', value: '—' },
              { label: 'Used', value: '—' },
              { label: 'Available', value: '—' },
              { label: 'Expired', value: '—' },
            ],
          },
        },

        {
          title: 'Credits expiring',
          subtitle: 'Cumulative: each deadline includes the ones before it.',
          slot: 'expiry-bars',
          body: {
            kind: 'bars',
            empty: 'No credits are expiring in the configured windows.',
            items: [
              { label: 'Within 90 days', value: '—', pct: 0, tone: 'negative' },
              { label: 'Within 180 days', value: '—', pct: 0, tone: 'warning' },
              { label: 'Within 365 days', value: '—', pct: 0, tone: 'info' },
            ],
          },
        },

        {
          title: 'Credit pools',
          subtitle: 'Soonest expiry first.',
          slot: 'credit-pools',
          body: {
            kind: 'table',
            columns: [
              { key: 'so', label: 'SO number' },
              { key: 'purchased', label: 'Purchased', align: 'end' },
              { key: 'used', label: 'Used', align: 'end' },
              { key: 'balance', label: 'Balance', align: 'end' },
              { key: 'expires', label: 'Expires' },
              { key: 'remaining', label: 'Time left' },
            ],
            rows: [
              { so: '—', purchased: '—', used: '—', balance: '—', expires: '—', remaining: '—' },
            ],
          },
        },

        {
          title: 'Attendance by edition',
          subtitle: 'What this edition looks like next to the previous ones.',
          slot: 'edition-history',
          body: {
            kind: 'bars',
            empty: 'No Cisco Live registrations found in the transaction report.',
            items: [{ label: '—', value: '—', pct: 0, tone: 'info' }],
          },
        },
      ],
    },

    /* ---------------------------------------------------------------- settings */
    {
      id: 'settings',
      title: 'Settings',
      subtitle: 'The data the console reads, and the prices it reasons with.',

      cards: [
        {
          title: 'Source workbooks',
          subtitle: 'The two exports from the Cisco Learning Credits portal.',
          slot: 'uploads',
          body: {
            kind: 'uploads',
            zones: [
              {
                key: 'transactions',
                label: 'Transaction Report',
                hint: 'One row per debit, credit and refund. Carries the registrations.',
                accept: '.xlsx,.xlsm',
              },
              {
                key: 'credits',
                label: 'SO History',
                hint: 'One row per SO: purchased, balance, expired and the expiry date.',
                accept: '.xlsx,.xlsm',
              },
            ],
          },
        },

        {
          title: 'The event',
          subtitle: 'Which edition the Overview reports on.',
          slot: 'event-form',
          body: {
            kind: 'form',
            submitLabel: 'Save event',
            groups: [
              {
                title: 'Edition',
                fields: [
                  {
                    key: 'code',
                    label: 'Edition code',
                    value: 'CLEMEA2027',
                    hint: 'The prefix in CourseAcronym, e.g. CLEMEA2027 or CLSD2026.',
                  },
                  { key: 'name', label: 'Display name', value: 'Cisco Live EMEA 2027' },
                  {
                    key: 'location',
                    label: 'Location',
                    value: 'ExCeL London, United Kingdom',
                    span: 'full',
                  },
                  { key: 'startDate', label: 'Starts', type: 'date', value: '2027-02-08' },
                  { key: 'endDate', label: 'Ends', type: 'date', value: '2027-02-12' },
                ],
              },
              {
                title: 'Expiry windows',
                fields: [
                  {
                    key: 'horizons',
                    label: 'Deadlines to watch',
                    value: '90, 180, 365',
                    suffix: 'days',
                    span: 'full',
                    hint: 'Comma-separated. One bar per deadline on the Overview.',
                  },
                ],
              },
            ],
          },
        },

        {
          title: 'Pass catalogue',
          subtitle: 'What a pass costs in credits, and how to recognise it in the export.',
          slot: 'pass-catalogue',
          body: {
            kind: 'editrows',
            addLabel: 'Add a pass',
            submitLabel: 'Save catalogue',
            columns: [
              { key: 'label', label: 'Pass' },
              { key: 'credits', label: 'Credits', type: 'number' },
              { key: 'match', label: 'Acronym contains' },
            ],
            rows: [
              { label: 'Full Conference', credits: 36, match: 'FC' },
              { label: 'IT Leadership', credits: 43, match: 'ITL' },
            ],
          },
        },

        {
          title: 'How a pass is recognised',
          body: {
            kind: 'prose',
            paragraphs: [
              "Cisco encodes the edition and the pass type in one CourseAcronym — CLEMEA2027-ITL-EB, CLEMEA2026-FC-STD, CLEMEA2025FCST. The console strips the edition code off the front and tests what remains against the Acronym contains column above. The longest matching pattern wins, so ITL is never read as a Full Conference.",
              'A registration whose acronym matches nothing is still counted as a participant, under Unclassified. That is deliberate: a missing pattern shows up as a gap to fill rather than as a person who quietly vanished from the headline figure.',
              'Prices are what the credits actually buy, so they are worth revisiting each year. The Early Bird rate on this edition was 36 credits for a Full Conference pass and 43 for IT Leadership; the standard rate is higher.',
            ],
          },
        },

        {
          title: 'Backend',
          subtitle: 'Where the console reads and writes.',
          slot: 'backend-status',
          body: {
            kind: 'keyvalue',
            groups: [
              {
                title: 'Connection',
                pairs: [
                  { key: 'API base', value: '/api', mono: true },
                  { key: 'Status', value: 'Checking…' },
                  { key: 'Parser', value: 'openpyxl, server-side' },
                  { key: 'Stored in', value: 'data/ on the API host', mono: true },
                ],
              },
            ],
          },
        },
      ],
    },
  ],

  footer: {
    links: [
      { label: 'Cisco Live EMEA 2027', href: 'https://www.ciscolive.com/emea/cisco-live-2027.html' },
      { label: 'Learning Credits', href: 'https://www.cisco.com/c/en/us/training-events/training-certifications/training/training-services/cisco-learning-credits.html' },
    ],
    legal: 'Internal console. Figures come from the uploaded Cisco exports.',
  },
};

export default site;
