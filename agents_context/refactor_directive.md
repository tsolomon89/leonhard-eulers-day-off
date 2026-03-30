# Refactor Directive — Leonhard Euler's Day Off

## Summary
Add the parameter derivation layer from `euler_again.json` to the existing Three.js app.
This is NOT a rewrite. The app already has the correct mathematical core (`computeF`, `QUADS`, atlas visibility system). What it lacks is the **upstream derivation chain** that connects T, q, and k₁ — currently three independent sliders that should be linked by explicit equations.

---

## TASK 1: Add T as the primary traversal parameter

### Equation (from euler_again.json, expression 69)
```
k = log_τ(T · τ/2)
```
Equivalently: `k = log(T * TAU/2) / log(TAU)`

### What to do
- Add `T` to `state` in `controls.js`. Default: `T = 1.9999` (matching Desmos)
- Add a T slider in the UI, prominently placed
- When T changes, derive k from the equation above
- k slider remains visible (read-only in derived mode, or with a toggle for direct/derived)
- Always display current T value in the HUD diagnostics
- Inverse: `T = 2 * TAU^(k-1)` — display this when k is the free variable

### The dependency
T is the thing that "progresses." k is derived from T. This is the single most important structural change.

---

## TASK 2: Add the q-system for k₁ derivation

### Equations (from euler_again.json, expressions 287, 42, 21, 50)
```
q = q₁ · τ^q₂

k₁ = { 
  if q_a = 0:  q₁        (direct mode)
  if q_a = 1:  τ / ((q/2) · d)   (derived mode)
}

d = |2·cos(π·T)|         (correction factor)
```

### What to do
- Add `q1`, `q2`, `qMode` (direct vs derived) to state
- Add q₁ slider (default 26.3, range up to 71)
- Add q₂ slider (integer, default 0) — this is the tau-exponent
- Compute `q = q₁ * TAU^q₂`
- When qMode is 'derived': compute d from T, then k₁ from q and d
- When qMode is 'direct': k₁ = q₁ (bypass q/d)
- Display q, k₁, and d in the diagnostics HUD
- The zeta-zero source for q₁ can remain as an optional toggle (already in the Desmos as Z_eta boolean)

### Why this matters
k₁ is currently a free slider. In the Desmos original, it is often DERIVED from q and T. That derivation is what produces the recognisable constants (k₁ ≈ 1/√2 = sin(π/4), q₁ values near π, etc). Without it, the user is blindly sliding through parameter space instead of navigating a structured normalisation.

---

## TASK 3: Add the equality proof computation

### Equations (from euler_again.json, expressions 75, 279, 280)
```
n_x(x) = n + x·Z

P₁ = P · (1 + τ/Z)

E_proof = total(sin(n_x(P)·f)·k₂ − sin(n_x(P₁)·f)·k₂)
```

### What to do
- Add a "P" parameter (default 1) — the block offset for the comparison
- Compute P₁ = P * (1 + TAU/Z)
- Compute E_proof as the sum of differences between the P-offset strand and the P₁-offset strand
- Display E_proof value in the HUD
- Optionally render both the P-strand and P₁-strand visually (they already exist as strand offsets, this just makes the comparison explicit)

---

## TASK 4: Expose numerical diagnostics

### Add to the HUD (some already exist, extend them)
- `T` — current traversal value
- `k` — current exponent (and whether derived or manual)  
- `k₁` — current amplitude (and whether derived or manual)
- `q` — current q value = q₁·τ^q₂
- `q₁`, `q₂` — components
- `d` — correction factor |2cos(πT)|
- `f` — current seed value (already shown, keep it)
- `τ^k` — current tau-power
- `closureSteps` — τ/α (already shown, keep it)
- `E_proof` — equality proof residual
- Active quadrant/branch/variant labels when hovering or inspecting atlas points

---

## TASK 5: Group UI controls by derivation role

### Current problem
All sliders are at the same level. The user can't see what depends on what.

### Target layout
```
┌─ Traversal ─────────────────────────┐
│  T  ████████████████░░░░  1.9999    │
│  k  ████████████████████  0.9998    │ (derived from T, or toggle to manual)
│  mode: [derived] [manual]           │
└─────────────────────────────────────┘

┌─ Amplitude / q-system ──────────────┐
│  q₁ ████████████░░░░░░░  26.3      │
│  q₂ ██░░░░░░░░░░░░░░░░░  0         │
│  q  = 26.3                          │
│  k₁ = 1.0000  (derived from q,T)   │ (or toggle to manual)
│  d  = 1.9999                        │
│  mode: [derived] [direct q₁] [manual k₁] │
└─────────────────────────────────────┘

┌─ Output Scaling ────────────────────┐
│  k₂ ████████████████████  1.0       │
│  n (points) ████████████  710       │
│  strands ████░░░░░░░░░░░  6         │
└─────────────────────────────────────┘

┌─ Proof ─────────────────────────────┐
│  α  ████████████████████  6.283     │
│  P  ██████░░░░░░░░░░░░░░  1.0       │
│  closure: 1 step = 1 turn           │
│  E_proof: 0.0000                    │
└─────────────────────────────────────┘

┌─ Atlas Visibility (A–H) ───────────┐
│  (existing system, unchanged)       │
└─────────────────────────────────────┘
```

---

## TASK 6: Preserve what works — do NOT change these

- `complex.js` — untouched, it's correct
- `generators.js` — `computeF`, `quadF`, `quadC`, atlas loop, trace generators — all correct
- `animation.js` — progress engine is correct, keep it
- `scene.js` — rendering pipeline is correct, keep it
- The atlas visibility system (A–H axes) — correct, keep it
- The proof overlay (cyan τ-trace, amber α-trace) — correct, strengthen it

---

## What NOT to add

- Do not add arbitrary-α as a primary mode. α-comparison is a proof overlay, not the architecture centre.
- Do not add new experimental branches (zeta-zero integration can remain as an optional q₁ source, nothing more)
- Do not flatten the existing atlas into something simpler — it's already correct
- Do not replace the animation engine
- Do not treat this as a greenfield rewrite

---

## Acceptance criteria

1. **T exists and derives k.** Moving T computes k via `log_τ(T·τ/2)`. Moving k in manual mode back-computes T via `T = 2·τ^(k-1)`. Both are always displayed.

2. **k₁ can be derived from q.** When qMode='derived', k₁ = τ/((q/2)·d) with d = |2cos(πT)|. When qMode='direct', k₁ = q₁. When qMode='manual', k₁ is a free slider. All three modes produce the same downstream f = k₁·e^{iτ^k}.

3. **The dependency chain is visible.** The user can see: T → k, and q₁,q₂,T → d → k₁ → f. Arrows or grouping in the UI make this clear.

4. **Equality proof computes.** E_proof = Σ|sin(n_x(P)·f)·k₂ − sin(n_x(P₁)·f)·k₂| is computed and displayed. P is adjustable.

5. **All existing atlas behaviour is preserved.** The 8-axis visibility system, QUADS, branches, variants, strands, proof traces — all unchanged.

6. **Diagnostics show the numerical state.** T, k, k₁, q, q₁, q₂, d, f, τ^k, closureSteps, E_proof are all readable in the HUD.

---

## Implementation order

1. Add T to state and the T↔k derivation (bidirectional). Add T slider, make k derived-by-default.
2. Add q₁, q₂, qMode to state. Add the k₁ derivation path. Wire up d = |2cos(πT)|.
3. Add P, P₁, E_proof computation to the regenerate cycle.
4. Regroup the UI into Traversal / Amplitude / Output / Proof / Atlas sections.
5. Extend the HUD with all diagnostic values.
6. Test: verify that setting T=1.9999, q₁=26.3, q₂=0, qMode='derived' produces the same visual as the Desmos graph with those parameters.