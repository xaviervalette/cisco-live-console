/* ---------------------------------------------------------------------------
   The design system registry.

   This kit ships one system. Adding another is three steps and no changes
   anywhere else:
     1. src/systems/<id>/tokens.css — tokens scoped to html[data-system='<id>']
     2. an entry below
     3. an import in src/layouts/Base.astro
--------------------------------------------------------------------------- */

export interface DesignSystem {
  id: string;
  name: string;
  description: string;
  /** Google Fonts stylesheet to load, or null for system fonts. */
  fontHref: string | null;
}

export const SYSTEMS = {
  'cisco-iq': {
    id: 'cisco-iq',
    name: 'Cisco IQ',
    description:
      "Cisco's Magnetic design language: slate neutrals, interact blue, the blue-to-cyan AI gradient, and translucent glass cards with an inset bevel.",
    // Sharp Sans is a licensed Cisco face and is not bundled. It is named
    // first in --font-heading so it resolves for anyone who has it installed;
    // everyone else falls back to Inter, Magnetic's own body face.
    fontHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
} as const satisfies Record<string, DesignSystem>;

export type SystemId = keyof typeof SYSTEMS;
