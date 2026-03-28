// ═══════════════════════════════════════════════════════════════
//  generators.js — Mathematical point generation
//  Applies Model2 sin-spoke formula through Model1's
//  full dimensional pipeline (G×E×D×B×C)
// ═══════════════════════════════════════════════════════════════

import {
  TAU, ZETA_ZEROS, QUADS, TRIG,
  cExp, cLog, cSin, cCos, cTan, cScl, cNeg, cInv, cDiv, cMul,
  cAbs, cArg, ok
} from './complex.js';

// ── Model2 core computations ──────────────────────────────────

/** k = log_l(T·τ/2) / log_l(τ) */
export function computeK(T, lFunc) {
  const logL = x => Math.log(x) / Math.log(lFunc);
  return logL(T * TAU / 2) / logL(TAU);
}

/** f = k₁ · e^{iτ^k} — base complex frequency */
export function computeF(k1, k) {
  const tauK = Math.pow(TAU, k);
  return cScl(cExp([0, tauK]), k1);
}

/** Full k₁ derivation from q-system */
export function computeK1(params) {
  const { qA, q1Mode, q1A, q2, zetaIdx, qCorr, T } = params;
  const q1 = q1Mode === 1 ? ZETA_ZEROS[zetaIdx] : q1A;
  const q = q1 * Math.pow(TAU, q2);
  const d = Math.abs(2 * Math.cos(TAU / 2 * T));

  let k1;
  if (qA === 0) {
    k1 = q1;
  } else {
    const corrFactor = qCorr === 0 ? 2 : (d === 0 ? 1 : d);
    k1 = TAU / ((q / 2) * corrFactor);
  }
  return { k1, q, q1, d };
}

// ── Model1 quadrant generators ────────────────────────────────

/** Compute base F for a quadrant at given k (half-1 / half-2 pairs) */
function quadF(quad, kv) {
  const angle1 = quad.iS * Math.pow(TAU, kv);
  const z1 = cExp([0, angle1]);
  const f1 = quad.s === -1 ? cNeg(z1) : z1;

  const angle2 = -quad.iS * Math.pow(TAU, -kv);
  const z2 = cExp([0, angle2]);
  const f2 = quad.s === -1 ? z2 : cNeg(z2);
  return { f1, f2 };
}

/** Curve variant C: uses (τ/n)^k instead of τ^k */
function quadC(quad, kv, nv) {
  if (nv === 0) return { c1: [NaN, NaN], c2: [NaN, NaN] };
  const angle1 = quad.iS * Math.pow(TAU / nv, kv);
  const z1 = cExp([0, angle1]);
  const c1 = quad.s === -1 ? cNeg(z1) : z1;

  const angle2 = -quad.iS * Math.pow(TAU / nv, -kv);
  const z2 = cExp([0, angle2]);
  const c2 = quad.s === -1 ? z2 : cNeg(z2);
  return { c1, c2 };
}

// ── Unified point generator ──────────────────────────────────

/**
 * Generates all visualization points by applying the Model1 dimensional
 * pipeline to Model2's sin-spoke output.
 *
 * The pipeline is: for each quadrant G × expression E × trig D × log C × sign B:
 *   1. Compute base values from quadrant (f1/f2 halves, scaled variants, curve variants)
 *   2. Apply model2 formula: sin(n · baseZ) · k₂
 *   3. Apply trig function (id/sin/cos/tan)
 *   4. Apply log wrapping (raw/log)
 *   5. Apply sign (positive/negative)
 *   6. Output point with color from quadrant, opacity from dimension weights
 *
 * @param {Object} params - All visualization parameters
 * @returns {{ positions: Float32Array, colors: Float32Array, sizes: Float32Array, count: number }}
 */
export function generateAllPoints(params) {
  const {
    Z, T, lFunc, k2,
    qA, q1Mode, q1A, q2, zetaIdx, qCorr,
    numStrands,
    dG, dD, dE, dB, dC,
    ptSize, lBase, showLogPlot
  } = params;

  const k = computeK(T, lFunc);
  const { k1, q, q1, d } = computeK1(params);
  const f = computeF(k1, k);
  const kVal = k;

  // Pre-allocate generous buffers (we'll trim at the end)
  // Max possible points: numStrands * Z * 4quads * ~14variants * 4trig * 2log * 2sign
  // But most dimension opacities are 0, so true count is much smaller
  const maxPts = numStrands * Z * 4 * 20 * 4 * 2 * 2;
  const estPts = Math.min(maxPts, 2_000_000); // cap for sanity

  let positions = new Float32Array(estPts * 3);
  let colors = new Float32Array(estPts * 3);
  let sizes = new Float32Array(estPts);
  let count = 0;

  const kCeil = Math.max(1, Math.floor(kVal + 1));

  // For each strand
  for (let strand = 0; strand < numStrands; strand++) {
    const offset = strand * Z;

    // For each quadrant G
    for (let gi = 0; gi < 4; gi++) {
      const gOpacity = dG[gi];
      if (gOpacity <= 0) continue;
      const quad = QUADS[gi];

      // Compute quadrant base values
      const { f1, f2 } = quadF(quad, kVal);

      // For each n value in this strand
      for (let i = 0; i < Z; i++) {
        const nv = i + offset;
        const nIdx = i; // index within strand for J-scaling

        // Compute curve variant
        const { c1, c2 } = quadC(quad, kVal, nv === 0 ? 0.001 : nv);

        // J scaling
        const jScale = (nIdx < kCeil && kVal !== 0) ? nv / kVal : null;

        // Build all expression variants (E dimension)
        const variants = [];

        // Half 1 (τ^k forms)
        variants.push([f1, 0]);
        if (kVal !== 0) variants.push([cScl(f1, kVal), 0]);
        variants.push([cScl(f1, nv), 0]);
        variants.push([cInv(f1), 0]);
        if (jScale !== null) {
          variants.push([cScl(f1, jScale), 1]);
          variants.push([cScl(f1, 1 / jScale), 1]);
        }
        if (ok(c1)) {
          variants.push([c1, 2]);
          if (kVal !== 0) variants.push([cScl(c1, -kVal), 2]);
          variants.push([cInv(c1), 2]);
        }

        // Half 2 (τ^{-k} forms)
        variants.push([f2, 0]);
        if (kVal !== 0) variants.push([cScl(f2, kVal), 0]);
        variants.push([cScl(f2, nv), 0]);
        variants.push([cInv(f2), 0]);
        if (jScale !== null) {
          variants.push([cScl(f2, jScale), 1]);
          variants.push([cScl(f2, 1 / jScale), 1]);
        }
        if (ok(c2)) {
          variants.push([c2, 2]);
          if (kVal !== 0) variants.push([cScl(c2, kVal), 2]);
          variants.push([cInv(c2), 2]);
        }

        // Now apply Model2 sin-spoke to each variant, then full pipeline
        for (const [baseZ, eIdx] of variants) {
          if (!ok(baseZ)) continue;
          const eOp = dE[eIdx];
          if (eOp <= 0) continue;

          // Apply model2 formula: sin(n · baseZ) · k₂
          const nBase = cScl(baseZ, nv);
          const sinVal = cSin(nBase);
          const spokePoint = cScl(sinVal, k2);
          if (!ok(spokePoint)) continue;

          // D: trig pipeline
          for (let di = 0; di < 4; di++) {
            if (dD[di] <= 0) continue;
            const afterTrig = TRIG[di].fn(spokePoint);
            if (!ok(afterTrig)) continue;

            // C: base / log
            for (let ci = 0; ci < 2; ci++) {
              if (dC[ci] <= 0) continue;
              const afterLog = ci === 0 ? afterTrig : cLog(afterTrig);
              if (!ok(afterLog)) continue;

              // B: positive / negative
              for (let bi = 0; bi < 2; bi++) {
                if (dB[bi] <= 0) continue;
                const final = bi === 0 ? afterLog : cNeg(afterLog);

                const totalOp = gOpacity * eOp * dD[di] * dC[ci] * dB[bi];
                if (totalOp <= 0.01) continue;

                // Bounds check
                if (Math.abs(final[0]) > 100 || Math.abs(final[1]) > 100) continue;

                // Emit point
                if (count >= estPts) break;

                const idx3 = count * 3;
                positions[idx3]     = final[0];     // Re → X
                positions[idx3 + 1] = final[1];     // Im → Y
                positions[idx3 + 2] = 0;            // flat complex plane

                // Color from quadrant, modulated by opacity
                const brightness = Math.min(1, totalOp * 0.8);
                colors[idx3]     = quad.color[0] * brightness;
                colors[idx3 + 1] = quad.color[1] * brightness;
                colors[idx3 + 2] = quad.color[2] * brightness;

                sizes[count] = ptSize * (0.6 + Math.random() * 0.4);
                count++;
              }
            }
          }
        }
      }
    }
  }

  // Also generate the "pure model2" strand points (the sin-spoke without atlas pipeline)
  // These are the primary visual — the atlas pipeline adds dimensional overlays
  const pureF = f;
  for (let strand = 0; strand < numStrands; strand++) {
    const offset = strand * Z;
    // Rainbow hue for this strand
    const hue = (strand / Math.max(1, numStrands));
    const hr = hue * 6;
    const hx = 1 - Math.abs(hr % 2 - 1);
    let sr, sg, sb;
    if (hr < 1)      { sr = 1; sg = hx; sb = 0; }
    else if (hr < 2) { sr = hx; sg = 1; sb = 0; }
    else if (hr < 3) { sr = 0; sg = 1; sb = hx; }
    else if (hr < 4) { sr = 0; sg = hx; sb = 1; }
    else if (hr < 5) { sr = hx; sg = 0; sb = 1; }
    else              { sr = 1; sg = 0; sb = hx; }
    // Boost saturation/lightness
    sr = sr * 0.9 + 0.1;
    sg = sg * 0.9 + 0.1;
    sb = sb * 0.9 + 0.1;

    for (let i = 0; i < Z; i++) {
      const nv = i + offset;
      const nf = cScl(pureF, nv);
      const sinNf = cSin(nf);
      const val = cScl(sinNf, k2);

      if (!ok(val)) continue;
      if (Math.abs(val[0]) > 100 || Math.abs(val[1]) > 100) continue;
      if (count >= estPts) break;

      const idx3 = count * 3;
      positions[idx3]     = val[0];
      positions[idx3 + 1] = val[1];
      positions[idx3 + 2] = 0;

      colors[idx3]     = sr;
      colors[idx3 + 1] = sg;
      colors[idx3 + 2] = sb;

      sizes[count] = ptSize * 0.8;
      count++;

      // Optional log overlay
      if (showLogPlot) {
        const lg = cLog(val);
        const scaled = cScl(lg, 1 / Math.log(lBase));
        if (ok(scaled) && Math.abs(scaled[0]) < 100 && Math.abs(scaled[1]) < 100) {
          if (count < estPts) {
            const li3 = count * 3;
            positions[li3]     = scaled[0];
            positions[li3 + 1] = scaled[1];
            positions[li3 + 2] = 0;
            colors[li3]     = sr * 0.4;
            colors[li3 + 1] = sg * 0.4;
            colors[li3 + 2] = sb * 0.4;
            sizes[count] = ptSize * 0.5;
            count++;
          }
        }
      }
    }
  }

  // Trim to actual count
  return {
    positions: positions.slice(0, count * 3),
    colors: colors.slice(0, count * 3),
    sizes: sizes.slice(0, count),
    count,
    // Expose computed values for HUD
    meta: { k, k1, f, q: q1 * Math.pow(TAU, q2), d, q1 }
  };
}

/**
 * Generate line segments for model2's strand connectivity.
 * Returns pairs of points for THREE.LineSegments.
 */
export function generateLineSegments(params) {
  const { Z, T, lFunc, k2, numStrands } = params;
  const k = computeK(T, lFunc);
  const { k1 } = computeK1(params);
  const f = computeF(k1, k);

  const segments = [];

  for (let strand = 0; strand < numStrands; strand++) {
    const offset = strand * Z;
    const hue = strand / Math.max(1, numStrands);

    let prev = null;
    for (let i = 0; i < Z; i++) {
      const nv = i + offset;
      const nf = cScl(f, nv);
      const sinNf = cSin(nf);
      const val = cScl(sinNf, k2);

      if (!ok(val) || Math.abs(val[0]) > 100 || Math.abs(val[1]) > 100) {
        prev = null;
        continue;
      }

      if (prev) {
        segments.push({
          x1: prev[0], y1: prev[1],
          x2: val[0],  y2: val[1],
          hue
        });
      }
      prev = val;
    }
  }

  return segments;
}
