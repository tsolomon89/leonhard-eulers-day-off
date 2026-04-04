# Leonhard Euler's Day Off — τ-Euler Atlas

> *τ is the substrate. e is infrastructure.*

An interactive Three.js proof that **τ (tau = 2π) is the unique constant where one unit of counting equals one full rotation** — and a live atlas of every mathematical structure that emerges from that single axiom.

---

## The Origin: Three Expressions in Desmos

The entire project started with a single Desmos notebook ([`euler_id_conversion.json`](agents_context/desmos-json/euler-id-conversion/euler_id_conversion.json)) that puts three expressions side by side:

```
e^{iτn}                          — Euler's identity (standard base-e rotation)
α^{i · nα / log_e(α)}           — Generalised rotation in arbitrary base α
τ^{i · nτ / log_e(τ)}           — The same thing, with α = τ
```

The third expression is algebraically identical to the first — same curve, same rate, same closure. That equivalence is the proof. When you substitute `α = τ` into the generalised form, you get Euler's formula back exactly. For any other value of `α`, the rate of rotation differs and the cycle doesn't close in one step.

The Desmos note attached to the graph says it plainly:

> *"you can have the form with alpha and it could be anything but only with alpha equal to tau is the rate of rotation equal to that of euler's identity"*

That observation — stated informally in a Desmos text box — is the axiom the rest of the project is built on. The Three.js atlas is what happens when you take that comparison and explore every dimension of the parameter space around it.

---

## The Axiom

The central equivalence, the core of the proof:

$$\tau^{i \cdot n\tau / \ln(\tau)} \equiv e^{i\tau n}$$

This is Euler's formula rewritten in τ-native form. Algebraically they are the same. What the τ-native form exposes is that **τ, not e, is the substrate of rotation** — the `ln(τ)` is just the coordinate converter from base-τ to base-e. Remove it and the structure becomes visible:

The generalised form `α^{i·nα/ln(α)}` closes at `n=1` — one unit of counting = one full rotation — **if and only if α = τ**. For any other base, one step is not one turn. The constant τ is *forced* by the geometry of counting and closure. It is not a convention. Not a preference. It is the only answer to the question.

The app renders this proof live. Drag the **α (base)** slider and watch the amber trace fail to close in one step. Set it to τ and it snaps closed. See [`agents_context/the-axiom.md`](agents_context/the-axiom.md) for the full philosophical and mathematical treatment.

---

## What the Atlas Shows

The atlas takes the core expression:

```
f = k₁ · τ^{i · τ^k / ln(τ)}
```

and the primary visual — `sin(n·f) · k₂` strand points — and then overlays every mathematically distinct variant across eight independent visibility axes (A–H). Each axis is a continuous opacity multiplier. Every rendered point satisfies:

```
visible(item) = A[a] × B[b] × C[c] × D[d] × E[e] × F[f] × G[g] × H[h]
```

The full combinatoric space is:

```
A(2) × G(4) × E(3) × D(4) × B(2) × C(2) × F(2) × H(8) = 6,144 distinct items
```


## Mathematical Axes (Visibility Groups)

| Group | Name | Dimensions | Description |
|-------|------|-----------|-------------|
| **A** | Render Primitive | A₁: Points, A₂: Lines | Controls whether geometry is rendered as a point cloud, strand lines, or both |
| **B** | Sign Family | B₁: Positive (+f), B₂: Negative (−f) | The positive and negative branches of each transformation |
| **C** | Representation | C₁: Base (raw), C₂: Log-wrapped | Applies `ln(z)` — maps the complex plane to its logarithmic coordinates |
| **D** | Transform | D₁: identity, D₂: sin, D₃: cos, D₄: tan | Trigonometric transforms of `sin(n·f)·k₂` spoke points |
| **E** | Geometry | E₁: F (point), E₂: V (vector), E₃: C (curve) | Point in the quadrant field, J-scaled vector, or C-curve variant |
| **F** | Branch | F₁: Branch A (f₁), F₂: Branch B (f₂) | Two complementary quadrant solutions of the τ-native form |
| **G** | Color Family | G₁: Red, G₂: Green, G₃: Blue, G₄: Purple | The four color quadrants: sign × i-sign pairings |
| **H** | Variant | H0–H7 | Eight transformation variants per base point (raw, k-scaled, n-scaled, inverted, J-scaled, J-inv, curve-raw, curve-k) |

### Color Quadrants (G group)

Each color corresponds to a sign pairing in the τ-native form:

| Color | Sign (s) | i-Sign (iS) | Hex |
|-------|----------|-------------|-----|
| 🔴 Red | −1 | −1 | `#ff3b30` |
| 🟢 Green | −1 | +1 | `#34c759` |
| 🔵 Blue | +1 | −1 | `#007aff` |
| 🟣 Purple | +1 | +1 | `#af52de` |

---

## The Proof: α-Base Comparison

The app renders two ghost traces at all times:

- **Cyan trace** — `τ^{i·nτ^k/ln(τ)}` — always closes at n=1. This is the τ-native unit circle.
- **Amber trace** — `α^{i·nα/ln(α)}` — visible when `α ≠ τ`. This is the generalised base.

Drag the **α (base)** slider to any value. The amber trace will require `n = τ/α` steps to close. Only when `α = τ` does one step equal one turn. The proof is visible in real time.

Landmarks:
- **α = τ ≈ 6.283** — closure in exactly 1 step
- **α = e ≈ 2.718** — closure in τ/e ≈ 2.310 steps
- **α = π ≈ 3.142** — closure in τ/π = 2 steps (the diameter ratio)

---

## Controls

### Global Parameters

| Control | Key | Description |
|---------|-----|-------------|
| **k** (exponent) | `k` | Scales the τ-power: `τ^k`. At k=0 the unit circle; at k=1 the 1/τ orbit |
| **k₁** (amplitude) | `k1` | Amplitude of the seed function `f = k₁ · τ^{i·τ^k/ln(τ)}` |
| **k₂** (spoke scale) | `k2` | Scales the spoke point positions via `sin(n·f) · k₂` |
| **n** (points) | `n` | Number of sample points per strand |
| **# strands** | `numStrands` | How many offset strand copies to render (1–28) |
| **α (base)** | `alpha` | Base for the comparison trace — shows the proof |
| **bloom** | `bloomStrength` | Intensity of the cinematic glow post-process |

### Presets

| Preset | State |
|--------|-------|
| **τ = 1 turn** | Default. k=k₁=k₂=1, α=τ, 6 strands — the fundamental closure |
| **The Proof** | α=e, single strand — directly shows e ≠ closure |
| **Concentric** | k=0.5 — produces concentric orbit families |
| **Full Atlas** | All A–H axes enabled at full opacity |
| **All 28** | 28 strands at thin line settings |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause animation |
| `Escape` | Stop animation, return to start |
| `Tab` | Collapse / expand control panel |
| `R` | Reset camera |
| `Double-click` | Reset camera (on canvas) |

---

## Portable Animation System

Every slider in the control panel participates in the **Portable Scroll-Animation System**:

### Linking a Parameter

1. Click the **⚯** (link) icon beside any slider. It lights up green when active.
2. The slider gains a second (blue) thumb — this is the **animation target** (endValue).
3. Drag the blue thumb, or **Shift+drag** on the base slider to set the target.
4. Press **▶** in the transport bar. The parameter sweeps from its base value to the target over the configured **Duration**.

### Transport Controls

The bottom-centre transport bar is always visible:

| Button | Action |
|--------|--------|
| **▶ / ⏸** | Play / pause the animation |
| **■** | Stop and reset progress to 0 |
| **⚙** | Expand / collapse the full control panel |
| **Scrub bar** | Drag to manually seek through the animation |

### Playback Settings

In the **Playback Control** section:

- **Duration** — sweep length in seconds (1–120s)
- **Loop mode** — none, wrap (loop), or bounce (ping-pong) — configured in `animation.js`
- **Easing** — per-link easing curves (linear, ease-in, ease-out, ease-in-out, sine)

Multiple parameters can be linked simultaneously. Each sweeps independently from its own base value to its own target value, all driven by the same global progress cursor.

---

## Architecture

```
tau-euler-atlas/
├── index.html          # Entry. importmap for Three.js CDN. No build step.
├── styles.css          # Full glassmorphism UI, DM Sans/DM Mono. Dark/light via CSS invert.
└── js/
    ├── main.js         # Boot: initScene → initControls → startRenderLoop
    ├── complex.js      # Complex arithmetic: [re, im] pairs, τ-native ops, QUADS, TRIG
    ├── generators.js   # Mathematical point generation — pure sin(n·f)·k₂ strands + full A–H atlas
    ├── scene.js        # Three.js: cameras, renderer, bloom, OrbitControls, Line2 fat lines
    ├── controls.js     # Polymorphic UIBuilder, state, history of vis groups, transport
    ├── animation.js    # ProgressEngine (0..1), NumberParam links, onStateChange callbacks
    └── modes.js        # Theme/render/view mode state and listeners
```

### Module Responsibilities

**`complex.js`** — The mathematical bedrock. All arithmetic operates on `[re, im]` 2-tuples. Key exports:

- `cTauPow(exp)` — `τ^exp = e^{exp · ln(τ)}` — the τ-native rotation primitive
- `cAlphaPow(alpha, exp)` — same for arbitrary base, used for the proof trace
- `QUADS` — the four sign/i-sign quadrant descriptors with their Three.js colors
- `TRIG` — the `[id, sin, cos, tan]` pipeline applied in the D-group

**`generators.js`** — Pure computation, no DOM or Three.js. Takes `params` (the `state` object) and returns typed arrays for the point cloud renderer. Two outputs:

- `generateAllPoints(params)` — primary strand points + the full A–H atlas overlay, respects all visibility multipliers, returns `{positions, colors, sizes, count, meta}`.
- `generateStrandPaths(params)` — strand segments for Line2 fat-line rendering with null-gap splitting.
- `generateTauTrace` / `generateAlphaTrace` — ghost proof traces.

**`scene.js`** — Three.js scene management. Cinematic mode uses `UnrealBloomPass`. Performance mode strips bloom and reduces particle size. Both `PerspectiveCamera` (3D) and `OrthographicCamera` (2D) cameras are maintained; `OrbitControls` switches between them. Stars use additive blending with per-frame drift physics.

**`animation.js`** — The **ProgressEngine**. A single `progress` value (0..1) drives all linked parameters:

```js
// Register any state field as animatable:
const link = animation.registerLink(obj, key, index);

// Link it to the sweep:
link.isLinked = true;
link.baseValue = 1.0;   // rest position
link.endValue  = 3.0;   // animation target

// Drive from the render loop:
animation.update();     // advances progress, writes interpolated values
```

**`controls.js`** — The **UIBuilder** class generates the entire control panel from a handful of chainable calls. All sliders are automatically registered with the ProgressEngine on build. `buildControls()` can be called at any time to fully rebuild the panel from current state.

---

## Running Locally

No build step. No npm install. Pure ES modules via CDN importmap.

```powershell
# Serve with any static server
npx serve -l 8080 tau-euler-atlas

# Or Python
python -m http.server 8080 --directory tau-euler-atlas
```

Open `http://localhost:8080/`.

> **Note:** Must be served over HTTP, not opened as a `file://` path (browser blocks ES module imports from file:// for security).

Safe shutdown runbook for local dev listeners (ports `5173/8080/3000`): [docs/local-dev-shutdown-runbook.md](docs/local-dev-shutdown-runbook.md)

---

## Browser Compatibility

Requires a browser that supports:
- ES Modules (`type="module"`)
- Import maps (`type="importmap"`)
- WebGL 2

Tested on Chrome 120+, Edge 120+, Firefox 120+.

---

## Performance Notes

- **Cinematic mode** — Full bloom pass, additive star field, fat Line2 strands. Targets ~60fps on a capable GPU.
- **Performance mode** — Bloom disabled, simplified particle texture, no star field. Targets 60fps on integrated graphics.
- The point generator respects a **200,000 point budget** in cinematic mode and **50,000** in performance mode. The budget is split between primary strand points (~40%) and the atlas dimensional overlay (~60%).
- Idle detection throttles to ~10fps when the viewport has been inactive for 2 seconds.

---

## Mathematical Background

The core paper is in [`agents_context/the-axiom.md`](agents_context/the-axiom.md).

Key results:

1. **τ is symbolically necessary** — the concept of "one full turn" cannot be expressed without it, in any metric geometry.
2. **e is infrastructure** — Euler's formula `e^{iτ} = 1` reveals e as the base-converter, not the substrate. The rotation belongs to τ; e is how you compute it.
3. **The proof is constructive** — for any `α ≠ τ`, the expression `α^{i·nα/ln(α)}` requires `n = τ/α` steps to close. This is not asserted — it is rendered and verifiable in the app.
4. **The atlas is complete** — the 8-axis visibility system generates every mathematically distinct variant of the τ-native form across sign, branch, geometry type, trig transform, representation, and variant scaling.

The extended philosophical treatment — including the relationship to Gödel incompleteness, Turing uncomputability, the Bekenstein bound, and the exclusion of e as a symbolically necessary constant — is in [`agents_context/symbolic-necessity-unified.md`](agents_context/symbolic-necessity-unified.md).

---

## Desmos Origin

The atlas began as a Desmos interactive proof. The original JSON definitions for the key expressions are preserved in [`agents_context/desmos-json/`](agents_context/desmos-json/) for reference. The Three.js implementation faithfully maps each Desmos expression to a code path in `generators.js`.

---

## Project Name

**Leonhard Euler's Day Off** — because Euler's formula is usually told as Euler's story. This project gives the day off to the storyteller and lets τ speak for itself.

---

*τ is the substrate. e is infrastructure.*  
*One unit of counting. One full rotation. No other constant closes the cycle.*
