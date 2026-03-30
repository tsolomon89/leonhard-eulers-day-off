# Atlas Paths Directive — Connected Lines for Every Expression

## The Problem

The Desmos original (`euler_please_full.txt`) treats every expression as a **connected curve** through n=[0...Z]. Each F, V, C variant across all 4 colour groups, both branches, piped through sin/cos/tan/log and negatives — every one of these is a plottable curve you can show and hide.

The Three.js app currently:
- ✅ Generates **points** for all atlas variants (in `generateAllPoints`, the atlas overlay loop)
- ✅ Generates **connected Line2 paths** for the primary `sin(n·f)·k₂` strands (in `generateStrandPaths`)
- ❌ Does NOT generate connected paths for atlas variants — they appear only as scattered dots

This means: when you turn on Red quadrant + Branch B + curve variant, you see disconnected red dots. In the Desmos original, you see a connected red curve.

## What Each Expression Actually Is

From `euler_please_full.txt`, every "expression" is a unique tuple:

```
(G: colour/quadrant, F: branch, E: geometry type, H: variant, D: trig transform, C: representation, B: sign)
```

For a given tuple, the expression is evaluated at every n in [0...Z], producing a sequence of complex values. Plotting those values as a connected path gives you the curve. The existing point generation already computes these values — it just doesn't connect them.

### The expression families from euler_please_full.txt:

For EACH colour group (G), there are TWO sub-groups (branches F₁ and F₂):

**Frame (E₁) expressions — "F" in the Desmos naming:**
- H0: raw seed (e.g. `F_eitk = e^{iτ^k}`)
- H1: k-scaled (`kF_eitk`)  
- H2: n-scaled (`nF_eitk`)
- H3: inverted/reciprocal (`F_eitk^{-1}`)

**Vector (E₂) expressions — "V" in the Desmos naming:**
- H4: J-scaled (`JF_eitk = n[0..k+1]/k · F`)
- H5: J-inverse (`J^{-1}F_eitk`)

**Curve (E₃) expressions — "C" in the Desmos naming:**
- H6: curve raw (`e^{i(τ/n)^k}`)
- H7: curve k-scaled (`k·e^{i(τ/n)^k}`)
- Plus curve reciprocals

Then EACH of these base expressions gets piped through:
- D₁: identity (base)
- D₂: sin
- D₃: cos  
- D₄: tan

Then EACH gets:
- C₁: raw
- C₂: log-wrapped

Then EACH gets:
- B₁: positive
- B₂: negative

**Total: 4 colours × 2 branches × ~8 H-variants × 4 D-transforms × 2 C-reps × 2 B-signs = up to 1024 distinct expressions**

Most are hidden by default (vis axes set to 0). But any that are turned on should render as connected paths, not just dots.

## The Fix

### 1. Add `generateAtlasPaths()` to `generators.js`

This function mirrors the atlas overlay loop in `generateAllPoints()` but outputs connected path segments instead of individual points.

```javascript
export function generateAtlasPaths(params) {
  const { n: Z, k, k1, k2, numStrands, vis } = params;
  const kVal = k;
  const kCeil = Math.max(1, Math.floor(Math.abs(kVal) + 1));
  const paths = [];

  // For each active combination of (G, F, H, D, C, B):
  //   iterate through n=[0...Z] for each strand
  //   collect connected points into path segments
  //   tag path with its combination for colouring

  for (let gi = 0; gi < 4; gi++) {
    if (vis.G.vals[gi] <= 0) continue;
    const quad = QUADS[gi];

    // For each (eIdx, fIdx, hIdx) variant:
    for (let fIdx = 0; fIdx < 2; fIdx++) {
      if (vis.F.vals[fIdx] <= 0) continue;
      
      for (let hIdx = 0; hIdx < 8; hIdx++) {
        if (vis.H.vals[hIdx] <= 0) continue;
        
        // Skip E-filtered variants
        const eIdx = getEIndexForH(hIdx); // H0-3→E0(point), H4-5→E1(vector), H6-7→E2(curve)
        if (vis.E.vals[eIdx] <= 0) continue;

        for (let di = 0; di < 4; di++) {
          if (vis.D.vals[di] <= 0) continue;

          for (let ci = 0; ci < 2; ci++) {
            if (vis.C.vals[ci] <= 0) continue;

            for (let bi = 0; bi < 2; bi++) {
              if (vis.B.vals[bi] <= 0) continue;

              // This combination is active — generate a connected path
              const totalOp = vis.G.vals[gi] * vis.E.vals[eIdx] * vis.F.vals[fIdx]
                * vis.H.vals[hIdx] * vis.D.vals[di] * vis.C.vals[ci] * vis.B.vals[bi];
              if (totalOp <= 0.01) continue;

              for (let strand = 0; strand < numStrands; strand++) {
                const offset = strand * Z;
                const segment = [];

                for (let i = 0; i < Z; i++) {
                  const nv = i + offset;
                  
                  // Compute the base value for this variant
                  // (same math as generateAllPoints atlas loop)
                  const baseZ = computeVariantBase(quad, kVal, nv, fIdx, hIdx, kCeil);
                  if (!baseZ || !ok(baseZ)) { 
                    // null gap
                    if (segment.length >= 2) {
                      paths.push(buildPathSegment(segment, quad, totalOp, gi, fIdx, hIdx, di, ci, bi));
                    }
                    segment.length = 0;
                    continue;
                  }

                  // Apply the downstream pipeline: n-multiply → sin → k₂ → trig → log → sign
                  const nBase = cScl(baseZ, nv);
                  const sinVal = cSin(nBase);
                  const spokePoint = cScl(sinVal, k2);
                  if (!ok(spokePoint)) { /* flush segment */ continue; }

                  const afterTrig = TRIG[di].fn(spokePoint);
                  if (!ok(afterTrig)) { /* flush */ continue; }

                  const afterLog = ci === 0 ? afterTrig : cLog(afterTrig);
                  if (!ok(afterLog)) { /* flush */ continue; }

                  const final = bi === 0 ? afterLog : cNeg(afterLog);
                  if (!ok(final) || Math.abs(final[0]) > 100 || Math.abs(final[1]) > 100) {
                    /* flush */ continue;
                  }

                  segment.push(final);
                }

                // Flush remaining segment
                if (segment.length >= 2) {
                  paths.push(buildPathSegment(segment, quad, totalOp, gi, fIdx, hIdx, di, ci, bi));
                }
              }
            }
          }
        }
      }
    }
  }

  return paths;
}
```

The key helper `computeVariantBase()` should extract the variant computation from the current inner loop of `generateAllPoints()` — it's already there, just needs factoring out:

```javascript
function computeVariantBase(quad, kVal, nv, fIdx, hIdx, kCeil) {
  const { f1, f2 } = quadF(quad, kVal);
  const { c1, c2 } = quadC(quad, kVal, nv === 0 ? 0.001 : nv);
  const f = fIdx === 0 ? f1 : f2;
  const c = fIdx === 0 ? c1 : c2;
  const jScale = (nv < kCeil * (/* Z factor */) && kVal !== 0) ? nv / kVal : null;

  switch (hIdx) {
    case 0: return f;                                    // raw
    case 1: return kVal !== 0 ? cScl(f, kVal) : null;   // k-scaled
    case 2: return cScl(f, nv);                          // n-scaled
    case 3: return cInv(f);                              // inverted
    case 4: return jScale ? cScl(f, jScale) : null;      // J-scaled
    case 5: return jScale ? cScl(f, 1/jScale) : null;    // J-inv
    case 6: return ok(c) ? c : null;                     // curve raw
    case 7: return ok(c) && kVal !== 0 ? cScl(c, -kVal) : null; // curve k
    default: return null;
  }
}

function getEIndexForH(hIdx) {
  if (hIdx <= 3) return 0;  // F (point) geometry
  if (hIdx <= 5) return 1;  // V (vector) geometry
  return 2;                  // C (curve) geometry
}
```

### 2. Call `generateAtlasPaths()` from `regenerate()` in controls.js

In the `regenerate()` function, after the primary strand paths:

```javascript
if (linesEnabled && state.showLines && state.lineOpacity > 0.01) {
  const primaryPaths = generateStrandPaths(state);
  const atlasPaths = generateAtlasPaths(state);  // NEW
  const allPaths = [...primaryPaths, ...atlasPaths];
  updateStrandPaths(allPaths, state.lineWidth, state.lineOpacity * state.vis.A.vals[1], true);
}
```

### 3. Each atlas path segment carries its colour and opacity

The path object returned should include:
```javascript
{
  positions: Float32Array,
  color: [r, g, b],       // from QUADS[gi].color, modulated by totalOp
  pointCount: number,
  tag: { gi, fIdx, hIdx, di, ci, bi }  // for debugging/inspection
}
```

This is already compatible with `updateStrandPaths()` in scene.js — it just creates Line2 objects from whatever path segments it receives.

### 4. Performance guard

The atlas can generate many paths. Add a path budget:
- Primary strands: unlimited (they're cheap, few paths)
- Atlas paths: cap at ~200 paths total, skip remaining combinations if exceeded
- When atlas is mostly off (few axes active), this is a non-issue
- When many axes are on, prioritise paths by totalOp (highest visibility first)

### 5. What this fixes

After this change:
- Turning on Red + Branch A + curve raw shows a CONNECTED RED CURVE, not dots
- Turning on all 4 colours shows 4 colour families as connected curves
- The atlas visibility system (A-H axes) controls which curves appear
- Each expression from euler_please_full.txt has a visual path representation
- Lines and points are independently toggleable via the A-group (A₁: Points, A₂: Lines)

### 6. What NOT to change

- `generateAllPoints()` — keep it for the point cloud, untouched
- `generateStrandPaths()` — keep it for primary strands, untouched
- The visibility axis system — it already works, just needs to control paths too
- `scene.js` `updateStrandPaths()` — already handles arbitrary path arrays, no change needed

## Acceptance criteria

1. When any atlas variant combination has nonzero visibility product AND A₂ (Lines) is on, connected line paths appear for that variant
2. Path colour matches the quadrant colour (red/green/blue/purple) from QUADS
3. Paths respect all 8 visibility axes — turning an axis to 0 removes those paths
4. Performance stays acceptable with a path budget
5. The primary strand paths continue to work exactly as before
