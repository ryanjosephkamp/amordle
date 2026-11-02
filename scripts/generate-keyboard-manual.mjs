import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = resolve(root, 'src/config/keyboard-shortcuts.json');
const markdownPath = resolve(root, 'docs/keyboard-navigation.md');
const htmlPath = resolve(root, 'docs/keyboard-navigation.html');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function markdownTable(rows) {
  return [
    '| Keys | Action | Behavior |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| \`${row.keys}\` | ${row.label} | ${row.description} |`),
  ].join('\n');
}

function buildMarkdown() {
  return `# ${registry.title}

Schema version: ${registry.schemaVersion}

Last reviewed: ${registry.lastReviewed}

Authority: \`src/config/keyboard-shortcuts.json\`

Amordle remains fully usable with touch and pointer controls. This guide documents the optional physical-keyboard path for players who prefer to stay on the keys.

## Global navigation

Global navigation uses Shift chords so ordinary numbers and gameplay letters keep their normal meaning.

${markdownTable(registry.direct)}

## Standard interaction

${markdownTable(registry.patterns)}

## Operating rules

${registry.rules.map((rule) => `- ${rule}`).join('\n')}

## Active-game behavior

- Letter keys enter the corresponding letter into the current guess.
- Backspace or Delete removes the final letter.
- Enter submits a complete guess.
- The on-screen keyboard and physical keyboard always share the same current-puzzle evidence.
- In GO, keyboard evidence resets at a puzzle transition and is rebuilt from the current board and any seeded rows rescored for that puzzle.
- \`Shift + M\` opens Menu instead of entering an uppercase M. A normal lowercase \`m\` continues to enter M.

## Menus, dialogs, and forms

- Tab and Shift+Tab move through interactive controls.
- Enter and Space activate focused controls.
- Arrow keys operate composite controls such as menus, tabs, radio groups, and listboxes.
- Escape closes the topmost transient surface and restores focus to its trigger.
- Global route shortcuts pause while a text field, textarea, select, editable region, or modal dialog owns focus.

## Maintenance contract

Update \`src/config/keyboard-shortcuts.json\` whenever a direct shortcut or documented keyboard pattern changes. Then run:

\`\`\`sh
pnpm generate:keyboard-manual
pnpm verify:keyboard-manual
\`\`\`

The application Help surface and both committed manuals consume the same registry. \`pnpm check\` fails if either manual drifts.
`;
}

function tableRows(rows, group) {
  return rows
    .map(
      (row) => `<tr data-shortcut-row data-search="${escapeHtml(
        `${row.keys} ${row.label} ${row.description}`.toLowerCase(),
      )}">
  <td><button class="copy-key" type="button" data-copy="${escapeHtml(row.keys)}" aria-label="Copy ${escapeHtml(row.keys)}"><kbd>${escapeHtml(row.keys)}</kbd></button></td>
  <td>${escapeHtml(row.label)}</td>
  <td>${escapeHtml(row.description)}</td>
  <td><span class="scope">${escapeHtml(group)}</span></td>
</tr>`,
    )
    .join('\n');
}

function buildHtml() {
  const allRows = [
    ...registry.direct.map((row) => ({ ...row, group: 'Global' })),
    ...registry.patterns.map((row) => ({ ...row, group: 'Standard' })),
  ];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(registry.title)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#f5f8f8; --surface:#e6eeee; --ink:#172328; --muted:#465a62; --rule:#82969e; --accent:#087f93; --focus:#00a9c5; }
    @media (prefers-color-scheme: dark) { :root { --bg:#0c1317; --surface:#182329; --ink:#edf5f5; --muted:#a6b8bd; --rule:#50646c; --accent:#68d8e8; --focus:#75e7f4; } }
    * { box-sizing:border-box; }
    html { background:var(--bg); scroll-behavior:smooth; }
    body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 ui-monospace,SFMono-Regular,"SF Mono",Menlo,Monaco,Consolas,monospace; }
    a { color:var(--accent); }
    button,input { font:inherit; }
    .skip { position:absolute; left:-999rem; top:.5rem; }
    .skip:focus { left:.5rem; z-index:10; background:var(--ink); color:var(--bg); padding:.6rem; }
    header { position:sticky; top:0; z-index:2; border-bottom:1px solid var(--rule); background:color-mix(in srgb,var(--bg) 94%,transparent); padding:1rem max(1rem,env(safe-area-inset-left)); backdrop-filter:blur(12px); }
    header strong { display:block; font-size:clamp(1rem,4vw,1.35rem); }
    header span { color:var(--muted); font-size:.78rem; }
    .layout { width:min(74rem,100%); margin:auto; padding:1rem; }
    nav { display:flex; flex-wrap:wrap; gap:.35rem; margin-bottom:1.2rem; }
    nav a { border:1px solid var(--rule); padding:.45rem .65rem; color:var(--ink); text-decoration:none; }
    main { min-width:0; }
    h1,h2 { line-height:1.2; text-wrap:balance; }
    h1 { font-size:clamp(1.5rem,6vw,2.25rem); margin:1rem 0 .5rem; }
    h2 { margin-top:2rem; font-size:1.1rem; }
    p,li { max-width:72ch; }
    .search { display:grid; gap:.35rem; max-width:34rem; margin:1.25rem 0; }
    .search input { min-height:2.75rem; border:1px solid var(--rule); background:var(--surface); color:var(--ink); padding:.6rem .75rem; }
    input:focus-visible,button:focus-visible,a:focus-visible,summary:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
    .table-wrap { overflow-x:auto; border:1px solid var(--rule); }
    table { width:100%; border-collapse:collapse; min-width:44rem; }
    th,td { border-bottom:1px solid var(--rule); padding:.65rem; text-align:left; vertical-align:top; }
    th { background:var(--surface); }
    .copy-key { border:0; background:transparent; color:inherit; padding:0; cursor:copy; }
    kbd,.scope { display:inline-block; border:1px solid var(--rule); background:var(--surface); padding:.15rem .35rem; white-space:nowrap; }
    details { border-block:1px solid var(--rule); padding:.75rem 0; }
    summary { cursor:pointer; font-weight:700; }
    footer { margin-top:2rem; border-top:1px solid var(--rule); padding:1rem 0; color:var(--muted); font-size:.8rem; }
    [hidden] { display:none !important; }
    @media (max-width:46rem) {
      .table-wrap { overflow:visible; border:0; }
      table,tbody,tr,td { display:block; min-width:0; width:100%; }
      thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
      tr { border:1px solid var(--rule); margin-bottom:.65rem; padding:.65rem; }
      td { border:0; padding:.25rem 0; }
      td:nth-child(2) { font-weight:700; }
    }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
    @media print { header { position:static; } nav,.search,.copy-key { display:none; } .layout { width:100%; } }
  </style>
</head>
<body>
  <a class="skip" href="#content">Skip to manual</a>
  <header>
    <strong>amordle / keyboard manual</strong>
    <span>schema ${registry.schemaVersion} · reviewed ${escapeHtml(registry.lastReviewed)}</span>
  </header>
  <div class="layout">
    <nav aria-label="Manual contents">
      <a href="#shortcuts">Shortcuts</a>
      <a href="#gameplay">Gameplay</a>
      <a href="#surfaces">Menus and forms</a>
      <a href="#maintenance">Maintenance</a>
    </nav>
    <main id="content">
      <h1>${escapeHtml(registry.title)}</h1>
      <p>Amordle remains fully usable with touch and pointer controls. This manual is for keyboard diehards who prefer to stay on the keys.</p>
      <section id="shortcuts">
        <h2>Shortcut reference</h2>
        <label class="search">
          <span>Filter shortcuts</span>
          <input id="shortcut-filter" type="search" autocomplete="off" placeholder="Try: combat, menu, focus, submit">
        </label>
        <p id="filter-status" role="status" aria-live="polite">${allRows.length} shortcuts shown.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Keys</th><th>Action</th><th>Behavior</th><th>Scope</th></tr></thead>
            <tbody>
${tableRows(registry.direct, 'Global')}
${tableRows(registry.patterns, 'Standard')}
            </tbody>
          </table>
        </div>
      </section>
      <section id="gameplay">
        <h2>Active-game behavior</h2>
        <details open><summary>Typing and submitting</summary><p>Letter keys enter the current guess. Backspace or Delete removes the final letter. Enter submits a complete guess. Shift + M is reserved for Menu; lowercase m still enters M.</p></details>
        <details><summary>Evidence and GO</summary><p>The physical and on-screen keyboards share the current board’s evidence. GO resets at a puzzle transition, then rebuilds evidence from current accepted guesses and any seeded rows rescored for that puzzle.</p></details>
      </section>
      <section id="surfaces">
        <h2>Menus, dialogs, and forms</h2>
        <ul>${registry.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
        <p>Tab and Shift+Tab move focus. Enter and Space activate. Arrow keys operate composite controls. Escape closes the topmost transient surface and restores its trigger.</p>
      </section>
      <section id="maintenance">
        <h2>Maintenance contract</h2>
        <p>The canonical registry is <code>src/config/keyboard-shortcuts.json</code>. Update it, then run <code>pnpm generate:keyboard-manual</code> and <code>pnpm verify:keyboard-manual</code>. The application Help surface consumes the same registry.</p>
      </section>
    </main>
    <footer>Generated from the Amordle keyboard registry. No account, game, or service data is embedded.</footer>
  </div>
  <script>
    const filter = document.querySelector('#shortcut-filter');
    const rows = [...document.querySelectorAll('[data-shortcut-row]')];
    const status = document.querySelector('#filter-status');
    filter.addEventListener('input', () => {
      const query = filter.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const match = !query || row.dataset.search.includes(query);
        row.hidden = !match;
        if (match) visible += 1;
      }
      status.textContent = visible + (visible === 1 ? ' shortcut shown.' : ' shortcuts shown.');
    });
    for (const button of document.querySelectorAll('[data-copy]')) {
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(button.dataset.copy);
          const original = button.getAttribute('aria-label');
          button.setAttribute('aria-label', 'Copied ' + button.dataset.copy);
          setTimeout(() => button.setAttribute('aria-label', original), 1200);
        } catch {
          button.setAttribute('aria-label', 'Copy unavailable');
        }
      });
    }
  </script>
</body>
</html>
`;
}

const outputs = [
  [markdownPath, buildMarkdown()],
  [htmlPath, buildHtml()],
];
const checking = process.argv.includes('--check');
let failed = false;

for (const [path, content] of outputs) {
  if (checking) {
    let existing = '';
    try {
      existing = readFileSync(path, 'utf8');
    } catch {
      // The missing artifact is reported through the comparison below.
    }
    if (existing !== content) {
      console.error(`Keyboard manual drift: ${path}`);
      failed = true;
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (failed) process.exitCode = 1;
else console.log(checking ? 'PASS keyboard manuals match registry' : 'Generated keyboard manuals');
