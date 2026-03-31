// ═══════════════════════════════════════════════════════════════
//  generators.js — Mathematical point generation (v6)
//  τ-Euler Atlas · Leonhard Euler's Day Off
//
//  The driving function in τ-native form:
//    f = k₁ · τ^{i · τ^k / ln(τ)}  ≡  k₁ · e^{iτ^k}
//
//  α-comparison:  α^{i · nα / ln(α)} closes at n=1  ⟺  α = τ
//
//  Visibility system (8-axis Desmos parity):
//    visible(item) = A[a]·B[b]·C[c]·D[d]·E[e]·F[f]·G[g]·H[h]
//    A = render primitive (handled in controls.js regenerate)
//    B–H = mathematical axes (handled here in generation loop)
//    Each group also has ptScale, lineW, lineOp multipliers.
//    When a group has all vals=0, its entire loop is skipped.
// ═══════════════════════════════════════════════════════════════

import {
  TAU, LN_TAU, QUADS, TRIG,
  cExp, cLog, cSin, cScl, cNeg, cInv, cTauPow, cAlphaPow, ok
} from './complex.js';

// ── Core τ-native computation ────────────────────────────────

export function computeF(k1, k) {
  const tauK = Math.pow(TAU, k);
  const tauNativeExp = [0, tauK / LN_TAU];
  return cScl(cTauPow(tauNativeExp), k1);
}

// ── α-base trace (the proof) ─────────────────────────────────

export function generateAlphaTrace(alpha, N, k) {
  const pts = [];
  const lnA = Math.log(alpha);
  if (lnA === 0 || !isFinite(lnA)) return pts;
  const alphaK = Math.pow(alpha, k);
  for (let i = 0; i <= N; i++) {
    const n = i / N;
    const theta = n * alphaK / lnA;
    const z = cAlphaPow(alpha, [0, theta]);
    if (ok(z)) pts.push(z);
  }
  return pts;
}

export function generateTauTrace(N, k) {
  const pts = [];
  const tauK = Math.pow(TAU, k);
  for (let i = 0; i <= N; i++) {
    const n = i / N;
    const theta = n * tauK / LN_TAU;
    const z = cTauPow([0, theta]);
    if (ok(z)) pts.push(z);
  }
  return pts;
}

// ── Quadrant generators (τ-native form) ──────────────────────

function quadF(quad, kv) {
  const theta1 = quad.iS * Math.pow(TAU, kv);
  const z1 = cTauPow([0, theta1 / LN_TAU]);
  const f1 = quad.s === -1 ? cNeg(z1) : z1;
  const theta2 = -quad.iS * Math.pow(TAU, -kv);
  const z2 = cTauPow([0, theta2 / LN_TAU]);
  const f2 = quad.s === -1 ? z2 : cNeg(z2);
  return { f1, f2 };
}

function quadC(quad, kv, nv) {
  if (nv === 0) return { c1: [NaN, NaN], c2: [NaN, NaN] };
  const theta1 = quad.iS * Math.pow(TAU / nv, kv);
  const c1z = cTauPow([0, theta1 / LN_TAU]);
  const c1 = quad.s === -1 ? cNeg(c1z) : c1z;
  const theta2 = -quad.iS * Math.pow(TAU / nv, -kv);
  const c2z = cTauPow([0, theta2 / LN_TAU]);
  const c2 = quad.s === -1 ? c2z : cNeg(c2z);
  return { c1, c2 };
}

// ── HSL hue → RGB ────────────────────────────────────────────

function hueToRGB(hue, satMul = 0.9, litAdd = 0.1) {
  const hr = hue * 6;
  const x = 1 - Math.abs(hr % 2 - 1);
  let r, g, b;
  if (hr < 1)      { r = 1; g = x; b = 0; }
  else if (hr < 2) { r = x; g = 1; b = 0; }
  else if (hr < 3) { r = 0; g = 1; b = x; }
  else if (hr < 4) { r = 0; g = x; b = 1; }
  else if (hr < 5) { r = x; g = 0; b = 1; }
  else              { r = 1; g = 0; b = x; }
  return [r * satMul + litAdd, g * satMul + litAdd, b * satMul + litAdd];
}

// ── Point budget ─────────────────────────────────────────────

let _pointBudget = 200_000;
export function setPointBudget(n) { _pointBudget = n; }

// ── Variant labels (H group) ────────────────────────────────
//  H0: raw f/c
//  H1: k-scaled
//  H2: n-scaled
//  H3: inverted (1/f)
//  H4: J-scaled (nv/kVal)
//  H5: J-inv-scaled (kVal/nv)
//  H6: c raw
//  H7: c k-scaled / neg-k-scaled

export const H_LABELS = [
  'raw',        // H0
  'k-scaled',   // H1
  'n-scaled',   // H2
  'inverted',   // H3
  'J-scaled',   // H4
  'J-inv',      // H5
  'curve-raw',  // H6
  'curve-k',    // H7
];

// ── Main generator ───────────────────────────────────────────
//
//  params.vis = { A, B, C, D, E, F, G, H }
//  Each group: { vals: number[], ptScale: number, lineW: number, lineOp: number }
//  A-group (Point/Line) is handled in controls.js regenerate() for perf skip.
//  B–H groups are handled here in the inner generation loops.

export function generateAllPoints(params) {
  const t0 = performance.now();
  const {
    n: Z, k, k1, k2,
    numStrands, vis, ptSize
  } = params;

  const f = computeF(k1, k);
  const kVal = k;
  const kCeil = Math.max(1, Math.floor(Math.abs(kVal) + 1));

  // Check if any atlas dimensions are active
  const atlasActive = vis.G.vals.some(v => v > 0) &&
    vis.D.vals.some(v => v > 0) && vis.E.vals.some(v => v > 0) &&
    vis.B.vals.some(v => v > 0) && vis.C.vals.some(v => v > 0);

  // Budget: split between pure strand and atlas
  const purebudget = Math.min(numStrands * Z * 2, _pointBudget);
  const atlasBudget = atlasActive ? Math.min(_pointBudget - Math.min(purebudget, _pointBudget * 0.4), _pointBudget * 0.6) : 0;

  const maxPts = purebudget + atlasBudget;
  let positions = new Float32Array(maxPts * 3);
  let colors    = new Float32Array(maxPts * 3);
  let sizes     = new Float32Array(maxPts);
  let count = 0;

  // ── Pure strand points (primary sin(n·f)·k₂ visual) ────
  for (let strand = 0; strand < numStrands; strand++) {
    const offset = strand * Z;
    const [sr, sg, sb] = hueToRGB(strand / Math.max(1, numStrands));

    for (let i = 0; i < Z; i++) {
      if (count >= purebudget) break;
      const nv = i + offset;
      const nf = cScl(f, nv);
      const sinNf = cSin(nf);
      const val = cScl(sinNf, k2);

      if (!ok(val) || Math.abs(val[0]) > 100 || Math.abs(val[1]) > 100) continue;

      const idx3 = count * 3;
      positions[idx3] = val[0];
      positions[idx3 + 1] = val[1];
      positions[idx3 + 2] = 0;
      colors[idx3] = sr;
      colors[idx3 + 1] = sg;
      colors[idx3 + 2] = sb;
      sizes[count] = ptSize * 0.8;
      count++;
    }
  }

  // ── Atlas dimensional overlay points ────────────────────
  //  Each item is tagged: (B, C, D, E, F, G, H)
  //  visible(item) = Π group.vals[index]
  //  size(item) = ptSize × Π group.ptScale

  if (atlasActive) {
    for (let strand = 0; strand < numStrands && count < maxPts; strand++) {
      const offset = strand * Z;

      for (let gi = 0; gi < 4 && count < maxPts; gi++) {
        if (vis.G.vals[gi] <= 0) continue;
        const quad = QUADS[gi];
        const { f1, f2 } = quadF(quad, kVal);

        for (let i = 0; i < Z && count < maxPts; i++) {
          const nv = i + offset;
          const { c1, c2 } = quadC(quad, kVal, nv === 0 ? 0.001 : nv);
          const jScale = (i < kCeil && kVal !== 0) ? nv / kVal : null;

          // Build tagged variants: [z, eIdx, fIdx, hIdx]
          //   eIdx = E group index (0=F point, 1=V vector, 2=C curve)
          //   fIdx = F group index (0=branch A/f1, 1=branch B/f2)
          //   hIdx = H group index (variant type)
          const variants = [];

          // ── Branch A (f₁) — F=0 ──
          variants.push([f1, 0, 0, 0]);                              // H0: raw
          if (kVal !== 0) variants.push([cScl(f1, kVal), 0, 0, 1]); // H1: k-scaled
          variants.push([cScl(f1, nv), 0, 0, 2]);                   // H2: n-scaled
          variants.push([cInv(f1), 0, 0, 3]);                       // H3: inverted
          if (jScale !== null && jScale !== 0) {
            variants.push([cScl(f1, jScale), 1, 0, 4]);             // H4: J-scaled (V)
            variants.push([cScl(f1, 1 / jScale), 1, 0, 5]);         // H5: J-inv (V)
          }
          if (ok(c1)) {
            variants.push([c1, 2, 0, 6]);                           // H6: curve raw (C)
            if (kVal !== 0) variants.push([cScl(c1, -kVal), 2, 0, 7]); // H7: curve k (C)
            variants.push([cInv(c1), 2, 0, 6]);                     // H6 again: curve inv
          }

          // ── Branch B (f₂) — F=1 ──
          variants.push([f2, 0, 1, 0]);
          if (kVal !== 0) variants.push([cScl(f2, kVal), 0, 1, 1]);
          variants.push([cScl(f2, nv), 0, 1, 2]);
          variants.push([cInv(f2), 0, 1, 3]);
          if (jScale !== null && jScale !== 0) {
            variants.push([cScl(f2, jScale), 1, 1, 4]);
            variants.push([cScl(f2, 1 / jScale), 1, 1, 5]);
          }
          if (ok(c2)) {
            variants.push([c2, 2, 1, 6]);
            if (kVal !== 0) variants.push([cScl(c2, kVal), 2, 1, 7]);
            variants.push([cInv(c2), 2, 1, 6]);
          }

          for (const [baseZ, eIdx, fIdx, hIdx] of variants) {
            if (count >= maxPts) break;
            if (!ok(baseZ)) continue;

            // E and F filter
            if (vis.E.vals[eIdx] <= 0) continue;
            if (vis.F.vals[fIdx] <= 0) continue;
            // H filter
            if (vis.H.vals[hIdx] <= 0) continue;

            const nBase = cScl(baseZ, nv);
            const sinVal = cSin(nBase);
            const spokePoint = cScl(sinVal, k2);
            if (!ok(spokePoint)) continue;

            for (let di = 0; di < 4; di++) {
              if (count >= maxPts) break;
              if (vis.D.vals[di] <= 0) continue;
              const afterTrig = TRIG[di].fn(spokePoint);
              if (!ok(afterTrig)) continue;

              for (let ci = 0; ci < 2; ci++) {
                if (count >= maxPts) break;
                if (vis.C.vals[ci] <= 0) continue;
                const afterLog = ci === 0 ? afterTrig : cLog(afterTrig);
                if (!ok(afterLog)) continue;

                for (let bi = 0; bi < 2; bi++) {
                  if (count >= maxPts) break;
                  if (vis.B.vals[bi] <= 0) continue;
                  const final = bi === 0 ? afterLog : cNeg(afterLog);

                  // Product of all group opacities
                  const totalOp = vis.G.vals[gi] * vis.E.vals[eIdx] * vis.F.vals[fIdx]
                    * vis.H.vals[hIdx] * vis.D.vals[di] * vis.C.vals[ci] * vis.B.vals[bi];
                  if (totalOp <= 0.01) continue;
                  if (Math.abs(final[0]) > 100 || Math.abs(final[1]) > 100) continue;

                  // Product of all group ptScale multipliers
                  const ptMul = vis.G.ptScale * vis.E.ptScale * vis.F.ptScale
                    * vis.H.ptScale * vis.D.ptScale * vis.C.ptScale * vis.B.ptScale;

                  const idx3 = count * 3;
                  positions[idx3] = final[0];
                  positions[idx3 + 1] = final[1];
                  positions[idx3 + 2] = 0;
                  const br = Math.min(1, totalOp * 0.8);
                  colors[idx3] = quad.color[0] * br;
                  colors[idx3 + 1] = quad.color[1] * br;
                  colors[idx3 + 2] = quad.color[2] * br;
                  sizes[count] = ptSize * ptMul * (0.5 + Math.random() * 0.3);
                  count++;
                }
              }
            }
          }
        }
      }
    }
  }

  const computeMs = performance.now() - t0;

  return {
    positions: positions.subarray(0, count * 3),
    colors: colors.subarray(0, count * 3),
    sizes: sizes.subarray(0, count),
    count,
    meta: { k, k1, f, computeMs },
    budget: _pointBudget
  };
}

// ── Strand paths for Line2 rendering ─────────────────────────

export function generateStrandPaths(params) {
  const { n: Z, k, k1, k2, numStrands } = params;
  const f = computeF(k1, k);

  const paths = [];

  for (let strand = 0; strand < numStrands; strand++) {
    const offset = strand * Z;
    const hue = strand / Math.max(1, numStrands);
    const [r, g, b] = hueToRGB(hue);

    const allPts = [];
    for (let i = 0; i < Z; i++) {
      const nv = i + offset;
      const nf = cScl(f, nv);
      const sinNf = cSin(nf);
      const val = cScl(sinNf, k2);

      if (!ok(val) || Math.abs(val[0]) > 100 || Math.abs(val[1]) > 100) {
        allPts.push(null);
      } else {
        allPts.push(val);
      }
    }

    let segment = [];
    const flushSegment = () => {
      if (segment.length >= 2) {
        const pos = new Float32Array(segment.length * 3);
        for (let j = 0; j < segment.length; j++) {
          pos[j * 3] = segment[j][0];
          pos[j * 3 + 1] = segment[j][1];
          pos[j * 3 + 2] = 0;
        }
        paths.push({ strandIdx: strand, positions: pos, color: [r, g, b], pointCount: segment.length });
      }
      segment = [];
    };

    for (let i = 0; i < allPts.length; i++) {
      if (allPts[i]) {
        segment.push(allPts[i]);
      } else {
        flushSegment();
      }
    }
    flushSegment();
  }

  return paths;
}

// ── Atlas path generator — connected curves per expression ────
//
//  For each active (gi, fIdx, hIdx, di, ci, bi) combination,
//  iterates through n=[0...Z] per strand and outputs a connected
//  Float32Array path segment. Mirrors the atlas overlay loop in
//  generateAllPoints() but connection-first instead of point-first.

function getEIndexForH(hIdx) {
  if (hIdx <= 3) return 0; // F (point) geometry
  if (hIdx <= 5) return 1; // V (vector) geometry
  return 2;                 // C (curve) geometry
}

function computeVariantBase(quad, kVal, nv, fIdx, hIdx, kCeil) {
  const { f1, f2 } = quadF(quad, kVal);
  const f = fIdx === 0 ? f1 : f2;

  // J-scale factor (only valid in the early range)
  const atJ = nv < kCeil && kVal !== 0 && nv !== 0;
  const jScale = atJ ? nv / kVal : null;

  // Curve variants
  const safeNv = nv === 0 ? 0.001 : nv;
  const { c1, c2 } = quadC(quad, kVal, safeNv);
  const c = fIdx === 0 ? c1 : c2;

  switch (hIdx) {
    case 0: return f;
    case 1: return kVal !== 0 ? cScl(f, kVal) : null;
    case 2: return cScl(f, nv);
    case 3: return cInv(f);
    case 4: return (jScale !== null) ? cScl(f, jScale)     : null;
    case 5: return (jScale !== null) ? cScl(f, 1 / jScale) : null;
    case 6: return ok(c) ? c : null;
    case 7: return (ok(c) && kVal !== 0) ? cScl(c, -kVal) : null;
    default: return null;
  }
}

const ATLAS_PATH_BUDGET = 200; // default if not specified in params

export function generateAtlasPaths(params) {
  const { n: Z, k, k2, numStrands, vis, atlasBudget = ATLAS_PATH_BUDGET } = params;
  const kVal = k;
  const kCeil = Math.max(1, Math.floor(Math.abs(kVal) + 1));
  const paths = [];

  // Early-out if no colour group is active
  if (!vis.G.vals.some(v => v > 0)) return paths;

  // Collect candidate combinations, sorted by totalOp descending
  const combos = [];

  for (let gi = 0; gi < 4; gi++) {
    if (vis.G.vals[gi] <= 0) continue;
    for (let fIdx = 0; fIdx < 2; fIdx++) {
      if (vis.F.vals[fIdx] <= 0) continue;
      for (let hIdx = 0; hIdx < 8; hIdx++) {
        if (vis.H.vals[hIdx] <= 0) continue;
        const eIdx = getEIndexForH(hIdx);
        if (vis.E.vals[eIdx] <= 0) continue;
        for (let di = 0; di < 4; di++) {
          if (vis.D.vals[di] <= 0) continue;
          for (let ci = 0; ci < 2; ci++) {
            if (vis.C.vals[ci] <= 0) continue;
            for (let bi = 0; bi < 2; bi++) {
              if (vis.B.vals[bi] <= 0) continue;
              // ── Opacity product (c_ system) ──────────────────
              const totalOp = vis.G.vals[gi] * vis.E.vals[eIdx] * vis.F.vals[fIdx]
                * vis.H.vals[hIdx] * vis.D.vals[di] * vis.C.vals[ci] * vis.B.vals[bi];
              if (totalOp <= 0.01) continue;
              // ── Width product (s_ system) — Global × Group × Member ──
              const sz = (grp, idx) => (grp.sizes && grp.sizes[idx] != null) ? grp.sizes[idx] : 1;
              const widthMul = sz(vis.G, gi) * sz(vis.F, fIdx) * sz(vis.H, hIdx)
                * sz(vis.E, eIdx) * sz(vis.D, di) * sz(vis.C, ci) * sz(vis.B, bi)
                * (vis.G.lineW ?? 1);
              combos.push({ gi, fIdx, hIdx, eIdx, di, ci, bi, totalOp, widthMul });
            }
          }
        }
      }
    }
  }

  // Sort highest opacity first so budget preserves the most visible paths
  combos.sort((a, b) => b.totalOp - a.totalOp);

  let pathCount = 0;

  for (const { gi, fIdx, hIdx, di, ci, bi, totalOp, widthMul } of combos) {
    if (pathCount >= atlasBudget) break;

    const quad = QUADS[gi];
    const br = Math.min(1, totalOp * 0.85);
    const color = [quad.color[0] * br, quad.color[1] * br, quad.color[2] * br];

    for (let strand = 0; strand < numStrands; strand++) {
      if (pathCount >= ATLAS_PATH_BUDGET) break;
      const offset = strand * Z;

      // Accumulate connected points for this (combo, strand)
      let segment = [];

      const flushSeg = () => {
        if (segment.length >= 2) {
          const pos = new Float32Array(segment.length * 3);
          for (let j = 0; j < segment.length; j++) {
            pos[j * 3]     = segment[j][0];
            pos[j * 3 + 1] = segment[j][1];
            pos[j * 3 + 2] = 0;
          }
          paths.push({
            positions: pos,
            color,
            widthMul,  // s_ system: caller multiplies atlasLineWidth × widthMul
            pointCount: segment.length,
            tag: { gi, fIdx, hIdx, di, ci, bi }
          });
          pathCount++;
        }
        segment = [];
      };

      for (let i = 0; i < Z; i++) {
        const nv = i + offset;

        const baseZ = computeVariantBase(quad, kVal, nv, fIdx, hIdx, kCeil);
        if (!baseZ || !ok(baseZ)) { flushSeg(); continue; }

        const nBase    = cScl(baseZ, nv);
        const sinVal   = cSin(nBase);
        const spoke    = cScl(sinVal, k2);
        if (!ok(spoke)) { flushSeg(); continue; }

        const afterTrig = TRIG[di].fn(spoke);
        if (!ok(afterTrig)) { flushSeg(); continue; }

        const afterLog  = ci === 0 ? afterTrig : cLog(afterTrig);
        if (!ok(afterLog)) { flushSeg(); continue; }

        const final = bi === 0 ? afterLog : cNeg(afterLog);
        if (!ok(final) || Math.abs(final[0]) > 100 || Math.abs(final[1]) > 100) {
          flushSeg(); continue;
        }

        segment.push(final);
      }

      flushSeg();
    }
  }

  return paths;
}

