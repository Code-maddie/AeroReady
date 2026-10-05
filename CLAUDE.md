# AeroReady — Project Rules

AeroReady is a defence maintenance-planning tool for SIH 2026 problem 26249. It is used by commanders, maintenance planners and technicians. It must look and read like serious operational software.

## Data
- Never hardcode numbers, names, or records in UI code. Everything shown comes from the API.
- Engine health is from NASA C-MAPSS. Fleet, spares, capacity, people and logs come from the seeded scenario generator and are labelled "Simulated fleet scenario" in the UI.
- Never invent maintenance procedures, technical order numbers, part numbers that look real, or regulatory text.
- If a value is missing, show "Not available" and why. No placeholders.

## Copy
- No emojis anywhere.
- No marketing language. Banned: revolutionize, seamless, cutting-edge, unleash, empower, game-changer, next-gen, harness, supercharge, effortless, intelligent insights, "at a glance", "your one-stop".
- Headings say what the section shows ("Aircraft awaiting parts"). Buttons say what they do ("Approve plan", "Mark complete"). No "Let's go", "Get started", "Explore".
- No welcome messages, taglines inside the app, or explanatory paragraphs that restate the obvious.
- Sentence case everywhere.

## Visual design
- Light theme across the whole site (decided 2026-10-05). The palette is drawn from the hero photograph (`frontend/public/img/hero.jpg`): mist-white ground #f3f4f1, white surfaces, lines #e1e2dc, cloud-shadow ink #1d2127, grey #5f6670. One accent, sunset gold #c7862c, for the plan series and attention; dusk sky blue #4f79a8 as the second series. Green / amber / red only for status.
- Landing page and sign-in follow the hero reference: full-bleed photograph, very large light wordmark "AeroReady*" bottom-left, short description and pill call-to-action bottom-right, small dark pill navigation top centre. Sections below the hero are light and typographic: no card grids, numbered markers only where the content is a sequence.
- Navigation everywhere is React Bits GooeyNav (`src/components/GooeyNav.tsx`) as a dark pill on the light page. Headers behind it must be opaque (the gooey blend layer smudges over translucent backgrounds).
- The section after the hero uses React Bits SideRays (`src/components/SideRays.tsx`, ogl), adapted to output tinted light on a pale background.
- Console: sticky header with wordmark, GooeyNav for the role's pages, notification and user pills. Each page opens with a two-tone heading: what it shows in ink, the context in grey.
- Font: Instrument Sans for everything, tabular numerals for all figures.
- Shapes: panels rounded 16px, inputs 10px, buttons, tabs, badges and filters as pills. Primary buttons are ink with white text. Shadows only for overlays and the nav pill; gradients only as the scrim over photos.
- Prefer tables over card grids for anything with more than 6 items. Table rows 40px (48px on technician pages).
- Use shared components from src/components/ui. Do not create one-off styled elements when a shared component exists.

## Process
- Build one page at a time. Before coding a page, write a short text wireframe (sections, top to bottom, with what data each shows) and follow it.
- After building a page, run the app, screenshot it, and review against these rules. Fix violations before reporting done.
- When in doubt, remove rather than add.
