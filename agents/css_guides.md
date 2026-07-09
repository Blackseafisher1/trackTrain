Structure: Layered CSS with @layer for priority control — even though tokens.css loads first, @layer ensures utilities always wins over components over base, etc. Layering order (lowest→highest priority): tokens → reset → base → layouts → components → states → utilities.
File	Job
tokens.css	Design tokens only — CSS custom properties for spacing, colors, fonts, radii, sizes. No selectors except :root.
reset.css	Normalize browser defaults — box-sizing, margin/padding strip, font inheritance on form elements, scrollbar styling.
base.css	Bare element styles (a, :focus-visible) + generic .btn variants. No layout, no component specifics.
layouts.css	Grid/flex containers only — .app-layout, .tab-bar, .editor-pane-wrap, .results-container. Mobile breakpoints live here too.
components/	One file per UI domain — editor.css, schema.css, results.css, modal.css, dbmanager.css. Self-contained, scoped to that component.
states.css	State modifiers — .loading, :has(.modal), prefers-reduced-motion, animations. Overrides components.
utilities.css	Single-purpose helpers — .stack-sm, .cluster, .center, .text-muted. Carries !important implicitly via highest layer.
Rules to write CSS like this:
1. Tokens first. Every value goes through a custom property. No raw #hex or px outside tokens.css. Use light-dark() for color schemes.
2. One concern per layer. Tokens → Reset → Base → Layout → Components → States → Utilities. Never mix.
3. Components are standalone. Each component file contains everything that component needs — it should render correctly on a blank page if you drop in its HTML + CSS.
4. No layout in components. Padding/font/color inside components — yes. Grid placement, width, flex: 1 — no, that goes to layouts.css.
5. Modifiers are states, not variants. .active, .loading, .collapsed → states.css. Never duplicate component styles for a variant.
6. Utilities are the escape hatch. .stack-*, .cluster, .text-muted cover one-off spacing/text needs without polluting components.
7. Minimal cascade depth. Max 2 selectors deep (e.g. .schema-table-name:hover .schema-table-actions). Flat specificity beats nesting.
8. Media queries at the bottom of the file they belong to, mobile-first where possible.
9. Scrollbar + :focus-visible in reset/base — system-level concerns, not component-level.

how to do it similar but in  svelete there its diffren becaus css is writen inline into .svelte files and scoped to that componant anyway so what still applies and what can be globla and what changes ? 
For Svelte, the mental model shifts but the same principles hold. Here's what changes and what stays:
What goes global (app.css or :global()):
Layer	Where
tokens	Single app.css imported in root layout
reset	Same app.css, before tokens or after (doesn't matter with @layer)
utilities	app.css or a utilities.css imported globally
What becomes scoped (inside .svelte <style> blocks):
Layer	How
base	Mostly absorbed into individual components. The a and :focus-visible styles go in root app.css. .btn classes stay global since buttons are everywhere — keep in app.css or a shared Button.svelte.
layouts	Each layout level gets its own Svelte component. AppLayout.svelte owns .app-layout grid. TabBar.svelte owns .tab-bar. No global layout CSS.
components	Each .svelte file already scopes its CSS. You can still have component-specific .css files in $lib/css/components/ if the component is built imperatively (CodeMirror editor, context menus). Import those in onMount.
states	Trickiest part. .loading, .active, .collapsed are cross-component states. Two approaches:
States — the Svelte way:
<!-- DON'T: global state classes -->
<div class="loading">...</div>

<!-- DO: props or stores -->
<script>
  export let loading = false;
</script>
<div class:loading>...</div>
For states that genuinely need to cross component boundaries (like .active on a .tab-item), put them in a shared $lib/css/states.css imported globally. But 80% of state classes become Svelte class: directives or CSS :global() blocks inside the component that owns the state.
Layout no longer needs a CSS file:
<!-- AppLayout.svelte -->
<style>
  main {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    height: 100vh;
  }
</style>
The grid itself is the component. No .app-layout class needed.
Media queries: Move into the component that breaks. If .schema-panel becomes a drawer on mobile, that query lives in SchemaPanel.svelte, not in a global layouts.css.
The @layer trick becomes less critical because Svelte's scoped styles naturally cascade deterministically. You can still use layers in global CSS if you keep app.css for tokens+reset+utilities — but for scoped styles, specificity fights rarely happen since each component owns its DOM.
TL;DR rule of thumb:
- Global: tokens, reset, shared utilities, a few base element styles, a few cross-component state classes, and any CSS for imperatively-rendered things (CodeMirror, context menus).
- Scoped (.svelte): everything else — layout, component visuals, hover/focus states, per-component media queries, animations. What was layouts.css + components/*.css takes the biggest hit and mostly dissolves into .svelte files.