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
- Dense, calm, functional: closer to an operations console than a SaaS landing page.
- Background slate-950, surfaces slate-900, borders slate-800. One accent: amber-500, used only for primary actions and attention. Status colours green/amber/red only for status.
- Fonts: Barlow Condensed for headings and numbers, Inter for body, tabular numerals for all figures.
- Radius 4px max. No shadows except for overlays. No gradients, glow, glassmorphism, blobs, or decorative illustrations.
- Prefer tables over card grids for anything with more than 6 items. Table rows 40px.
- Spacing on a 4px scale. Page padding 24px.
- Use shared components from src/components/ui. Do not create one-off styled elements when a shared component exists.

## Process
- Build one page at a time. Before coding a page, write a short text wireframe (sections, top to bottom, with what data each shows) and follow it.
- After building a page, run the app, screenshot it, and review against these rules. Fix violations before reporting done.
- When in doubt, remove rather than add.
