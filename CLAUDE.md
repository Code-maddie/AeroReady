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
- Follows the team's reference images (decided 2026-10-05; these rules replace the earlier slate console rules).
- Landing page and sign-in: full-bleed photographic hero (`frontend/public/img`), large light wordmark "AeroReady*", floating pill navigation. Photos are the only imagery; no illustrations, blobs or glow.
- Console: sticky header with wordmark, centred GooeyNav pill navigation (React Bits, `src/components/GooeyNav.tsx`) for the role's pages, notification and user pills. The landing page section nav uses the same component. Each page opens with a two-tone heading: what it shows in ink, the context in grey.
- Palette: warm charcoal background #0e0e0d, panels #1a1a19 / #232322, lines #2c2b29, ink #f1eee8, grey #8c8984. One accent, dusk amber #e9a15b, for the plan series and attention. Green / amber / red only for status.
- Font: Inter Tight for everything, tabular numerals for all figures.
- Shapes: panels rounded 16px, inputs 10px, buttons, tabs, badges and filters as pills. Primary buttons are ink on charcoal. Shadows only for overlays; gradients only as the dark scrim over photos.
- Prefer tables over card grids for anything with more than 6 items. Table rows 40px (48px on technician pages).
- Use shared components from src/components/ui. Do not create one-off styled elements when a shared component exists.

## Process
- Build one page at a time. Before coding a page, write a short text wireframe (sections, top to bottom, with what data each shows) and follow it.
- After building a page, run the app, screenshot it, and review against these rules. Fix violations before reporting done.
- When in doubt, remove rather than add.
