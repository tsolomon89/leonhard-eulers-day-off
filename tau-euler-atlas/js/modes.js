// ═══════════════════════════════════════════════════════════════
//  modes.js — Rendering mode manager
//  Theme (light/dark) × Render (perf/cinematic) × View (2D/3D)
//  + Collapsible UI state
// ═══════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────

const modes = {
  theme: 'dark',           // 'dark' | 'light'
  render: 'cinematic',     // 'cinematic' | 'performance'
  view: '3d',              // '3d' | '2d'
  collapsed: false,
};

// Callbacks registered by scene.js and controls.js
let _onThemeChange = null;
let _onRenderChange = null;
let _onViewChange = null;
let _onCollapseChange = null;

// ── Getters ──────────────────────────────────────────────────

export function getTheme()     { return modes.theme; }
export function getRenderMode(){ return modes.render; }
export function getViewMode()  { return modes.view; }
export function isCollapsed()  { return modes.collapsed; }
export function isPerformance(){ return modes.render === 'performance'; }
export function isCinematic()  { return modes.render === 'cinematic'; }
export function is2D()         { return modes.view === '2d'; }
export function is3D()         { return modes.view === '3d'; }
export function isDark()       { return modes.theme === 'dark'; }
export function isLight()      { return modes.theme === 'light'; }

// ── Setters ──────────────────────────────────────────────────

export function setTheme(theme) {
  modes.theme = theme;
  document.body.setAttribute('data-theme', theme);
  // CSS body[data-theme="light"] handles all variable overrides —
  // no inline style overrides needed (v5 variable system).
  if (_onThemeChange) _onThemeChange(theme);
}

export function setRenderMode(mode) {
  modes.render = mode;
  document.body.setAttribute('data-render', mode);
  if (_onRenderChange) _onRenderChange(mode);
}

export function setViewMode(mode) {
  modes.view = mode;
  if (_onViewChange) _onViewChange(mode);
}

export function toggleCollapse() {
  modes.collapsed = !modes.collapsed;
  document.body.setAttribute('data-collapsed', modes.collapsed);
  if (_onCollapseChange) _onCollapseChange(modes.collapsed);
}

export function setCollapsed(v) {
  modes.collapsed = v;
  document.body.setAttribute('data-collapsed', v);
  if (_onCollapseChange) _onCollapseChange(v);
}

// ── Callback registration ────────────────────────────────────

export function onThemeChange(cb)    { _onThemeChange = cb; }
export function onRenderChange(cb)   { _onRenderChange = cb; }
export function onViewChange(cb)     { _onViewChange = cb; }
export function onCollapseChange(cb) { _onCollapseChange = cb; }
