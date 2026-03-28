import { useState, useRef, useEffect, useCallback } from "react";

// ── Complex arithmetic ──
const C = (r, i) => [r, i];
const cAdd = (a, b) => [a[0]+b[0], a[1]+b[1]];
const cSub = (a, b) => [a[0]-b[0], a[1]-b[1]];
const cMul = (a, b) => [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]];
const cDiv = (a, b) => { const d=b[0]*b[0]+b[1]*b[1]; return d===0?[NaN,NaN]:[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d]; };
const cAbs = z => Math.hypot(z[0], z[1]);
const cArg = z => Math.atan2(z[1], z[0]);
const cExp = z => { const r=Math.exp(z[0]); return [r*Math.cos(z[1]), r*Math.sin(z[1])]; };
const cLog = z => [Math.log(cAbs(z)), cArg(z)];
const cPow = (b, e) => cExp(cMul(e, cLog(b)));
const cSin = z => { const a=cExp([-z[1],z[0]]), b=cExp([z[1],-z[0]]); return [(a[1]-b[1])/2,-(a[0]-b[0])/2]; };
const cCos = z => { const a=cExp([-z[1],z[0]]), b=cExp([z[1],-z[0]]); return [(a[0]+b[0])/2,(a[1]+b[1])/2]; };
const cTan = z => cDiv(cSin(z), cCos(z));
const cNeg = z => [-z[0],-z[1]];
const cInv = z => cDiv([1,0], z);
const cScl = (z, s) => [z[0]*s, z[1]*s];
const ok = z => isFinite(z[0]) && isFinite(z[1]) && !isNaN(z[0]) && !isNaN(z[1]);

const TAU = 2*Math.PI;

// ── Primes up to 997 ──
const PRIMES = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];

/* ── The 4 Color Quadrants ──
   Each quadrant is defined by (overallSign, iSign):
     RED:    (−1, −1)  →  −e^{−iτ^k}   paired with  e^{+iτ^{−k}}
     GREEN:  (−1, +1)  →  −e^{+iτ^k}   paired with  e^{−iτ^{−k}}
     BLUE:   (+1, −1)  →  +e^{−iτ^k}   paired with  −e^{+iτ^{−k}}
     PURPLE: (+1, +1)  →  +e^{+iτ^k}   paired with  −e^{−iτ^{−k}}
*/
const QUADS = [
  { name: "RED",    s: -1, iS: -1, color: "#ff3b30", dim: "#661a16" },
  { name: "GREEN",  s: -1, iS: +1, color: "#34c759", dim: "#1a5a2e" },
  { name: "BLUE",   s: +1, iS: -1, color: "#007aff", dim: "#003366" },
  { name: "PURPLE", s: +1, iS: +1, color: "#af52de", dim: "#4a2260" },
];

// Compute base F for a quadrant at given k
function quadF(q, kv) {
  // Half 1: s·e^{iS·i·τ^k}
  const angle1 = q.iS * Math.pow(TAU, kv);
  const z1 = cExp([0, angle1]);
  const f1 = q.s === -1 ? cNeg(z1) : z1;
  // Half 2: paired form with −k, conjugate signs
  const angle2 = -q.iS * Math.pow(TAU, -kv);
  const z2 = cExp([0, angle2]);
  const f2 = q.s === -1 ? z2 : cNeg(z2); // sign flips
  return { f1, f2 };
}

// Curve variant C: uses (τ/n)^k instead of τ^k
function quadC(q, kv, nv) {
  if (nv === 0) return { c1: [NaN,NaN], c2: [NaN,NaN] };
  const angle1 = q.iS * Math.pow(TAU / nv, kv);
  const z1 = cExp([0, angle1]);
  const c1 = q.s === -1 ? cNeg(z1) : z1;
  const angle2 = -q.iS * Math.pow(TAU / nv, -kv);
  const z2 = cExp([0, angle2]);
  const c2 = q.s === -1 ? z2 : cNeg(z2);
  return { c1, c2 };
}

// ── Expression type (E dimension) ──
// 1=F (point), 2=V (vector: J·F), 3=C (curve: (τ/n)^k)
// Scalers within each: identity, ×k, ×n, inverse

// ── Outer pipeline ──
const TRIG = [
  { label: "id", fn: z => z },
  { label: "sin", fn: cSin },
  { label: "cos", fn: cCos },
  { label: "tan", fn: cTan },
];

export default function Atlas() {
  const cvRef = useRef(null);
  // Parameters
  const [kVal, setKVal] = useState(2);
  const [Z, setZ] = useState(36);
  const [usePrimes, setUsePrimes] = useState(false);
  const [unit, setUnit] = useState(1);
  // 8D filter: opacity sliders
  const [dA, setDA] = useState([1, 0.3]);       // A: Point / Line
  const [dB, setDB] = useState([1, 0]);          // B: Positive / Negative
  const [dC, setDC] = useState([1, 0]);          // C: Base / Log
  const [dD, setDD] = useState([1, 0, 0, 0]);    // D: id / sin / cos / tan
  const [dE, setDE] = useState([1, 1, 0.5]);     // E: F(point) / V(vector) / C(curve)
  const [dG, setDG] = useState([1, 1, 1, 1]);    // G: RED / GREEN / BLUE / PURPLE
  // Size
  const [ptSize, setPtSize] = useState(3);
  // View
  const [zoom, setZoom] = useState(2.5);
  const [pan, setPan] = useState([0, 0]);
  const [drag, setDrag] = useState(null);
  // Reference
  const [showR1, setShowR1] = useState(true);
  const [showRTau, setShowRTau] = useState(true);
  const [showTauGrid, setShowTauGrid] = useState(false);

  const W = 560, H = 560;

  const toS = useCallback(z => [
    (z[0] - pan[0]) / zoom * (W/2) + W/2,
    -(z[1] - pan[1]) / zoom * (H/2) + H/2,
  ], [zoom, pan]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = W*dpr; cv.height = H*dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#060610";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "#0e0e22";
    ctx.lineWidth = 0.5;
    const gStep = zoom < 1 ? 0.5 : zoom < 5 ? 1 : zoom < 20 ? 5 : 10;
    for (let v = Math.floor((-zoom + pan[0]) / gStep) * gStep; v <= zoom + pan[0]; v += gStep) {
      const p = toS([v, 0]), q2 = toS([v, 1]);
      ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H); ctx.stroke();
    }
    for (let v = Math.floor((-zoom + pan[1]) / gStep) * gStep; v <= zoom + pan[1]; v += gStep) {
      const p = toS([0, v]);
      ctx.beginPath(); ctx.moveTo(0, p[1]); ctx.lineTo(W, p[1]); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#1a1a3a"; ctx.lineWidth = 1;
    let a = toS([-99, 0]), b = toS([99, 0]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    a = toS([0, -99]); b = toS([0, 99]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();

    // τ-power grid
    if (showTauGrid) {
      ctx.strokeStyle = "#12122a"; ctx.lineWidth = 0.3;
      for (let g = -3; g <= 3; g++) {
        const v = Math.pow(TAU, g);
        for (const sv of [v, -v]) {
          a = toS([sv, -99]); b = toS([sv, 99]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          a = toS([-99, sv]); b = toS([99, sv]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      }
    }

    // Reference circles
    const drawCirc = (r, col, dash) => {
      const c = toS([0,0]), e = toS([r,0]);
      const rad = Math.abs(e[0]-c[0]);
      if (rad < 2 || rad > 3000) return;
      ctx.beginPath(); ctx.setLineDash(dash);
      ctx.arc(c[0], c[1], rad, 0, TAU);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
    };
    if (showR1) drawCirc(1, "#222255", []);
    if (showRTau) drawCirc(1/TAU, "#552222", [4,4]);

    // ── Generate n values ──
    const nRaw = usePrimes ? PRIMES.filter(p => p <= Z) : Array.from({length: Z+1}, (_, i) => i);
    const nVals = nRaw.map(v => v * unit);

    // ── Compute J = n[0..floor(k+1)] / k (the vector scaling list) ──
    // J is a list: for each n value, J_i = n[i] / k (first floor(k+1) values)
    const kCeil = Math.max(1, Math.floor(kVal + 1));

    // ── Render all active expressions ──
    for (let gi = 0; gi < 4; gi++) {
      const gOpacity = dG[gi];
      if (gOpacity <= 0) continue;
      const quad = QUADS[gi];

      const { f1, f2 } = quadF(quad, kVal);

      for (const nv of nVals) {
        // Compute curve variant
        const { c1, c2 } = quadC(quad, kVal, nv);
        
        // J scaling: J = nVals[0..kCeil] / kVal
        const jIdx = nVals.indexOf(nv);
        const jScale = (jIdx >= 0 && jIdx < kCeil && kVal !== 0) ? nv / kVal : null;

        // Expression variants for each half:
        // [z, type_E_index]: E1=point(F), E2=vector, E3=curve
        const variants = [];
        
        // Half 1 (τ^k forms)
        variants.push([f1, 0]);                                    // F
        if (kVal !== 0) variants.push([cScl(f1, kVal), 0]);       // kF
        variants.push([cScl(f1, nv), 0]);                          // nF
        variants.push([cInv(f1), 0]);                              // F⁻¹
        if (jScale !== null) {
          variants.push([cScl(f1, jScale), 1]);                    // JF (vector)
          variants.push([cScl(f1, 1/jScale), 1]);                  // J⁻¹F
        }
        if (ok(c1)) {
          variants.push([c1, 2]);                                   // C
          if (kVal !== 0) variants.push([cScl(c1, -kVal), 2]);    // -kC
          variants.push([cInv(c1), 2]);                            // C⁻¹
        }

        // Half 2 (τ^{-k} forms)
        variants.push([f2, 0]);
        if (kVal !== 0) variants.push([cScl(f2, kVal), 0]);
        variants.push([cScl(f2, nv), 0]);
        variants.push([cInv(f2), 0]);
        if (jScale !== null) {
          variants.push([cScl(f2, jScale), 1]);
          variants.push([cScl(f2, 1/jScale), 1]);
        }
        if (ok(c2)) {
          variants.push([c2, 2]);
          if (kVal !== 0) variants.push([cScl(c2, kVal), 2]);
          variants.push([cInv(c2), 2]);
        }

        for (const [baseZ, eIdx] of variants) {
          if (!ok(baseZ)) continue;
          const eOp = dE[eIdx];
          if (eOp <= 0) continue;

          // D: trig functions
          for (let di = 0; di < 4; di++) {
            if (dD[di] <= 0) continue;
            const afterTrig = TRIG[di].fn(baseZ);
            if (!ok(afterTrig)) continue;

            // C dimension: base / log
            for (let ci = 0; ci < 2; ci++) {
              if (dC[ci] <= 0) continue;
              const afterLog = ci === 0 ? afterTrig : cLog(afterTrig);
              if (!ok(afterLog)) continue;

              // B dimension: positive / negative
              for (let bi = 0; bi < 2; bi++) {
                if (dB[bi] <= 0) continue;
                const final = bi === 0 ? afterLog : cNeg(afterLog);
                
                const totalOp = gOpacity * eOp * dD[di] * dC[ci] * dB[bi] * dA[0];
                if (totalOp <= 0.01) continue;

                const s = toS(final);
                if (s[0] < -20 || s[0] > W+20 || s[1] < -20 || s[1] > H+20) continue;

                ctx.beginPath();
                ctx.arc(s[0], s[1], ptSize * (dA[0]), 0, TAU);
                ctx.fillStyle = quad.color;
                ctx.globalAlpha = Math.min(1, totalOp * 0.7);
                ctx.fill();
                ctx.globalAlpha = 1;
              }
            }
          }
        }
      }
    }

    // Labels
    ctx.font = "10px 'SF Mono',monospace";
    if (showR1) { const u=toS([1,0]); ctx.fillStyle="#222255"; ctx.fillText("r=1",u[0]+3,u[1]-4); }
    if (showRTau) { const u=toS([1/TAU,0]); ctx.fillStyle="#552222"; ctx.fillText("r=1/τ",u[0]+3,u[1]+12); }

  }, [kVal, Z, usePrimes, unit, dA, dB, dC, dD, dE, dG, ptSize, zoom, pan, showR1, showRTau, showTauGrid, toS]);

  // Mouse
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.max(0.01, Math.min(500, z * (e.deltaY > 0 ? 1.12 : 0.89)))); };
  const onDown = e => setDrag({ x: e.clientX, y: e.clientY, p: [...pan] });
  const onMove = e => { if (!drag) return; setPan([drag.p[0]-(e.clientX-drag.x)/(W/2)*zoom, drag.p[1]+(e.clientY-drag.y)/(H/2)*zoom]); };
  const onUp = () => setDrag(null);

  const setDim = (setter, idx, val) => setter(prev => { const n = [...prev]; n[idx] = val; return n; });

  return (
    <div style={{ background: "#060610", color: "#aaa", fontFamily: "'SF Mono','Menlo','Fira Code',monospace", minHeight: "100vh", padding: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: "#ccc", margin: 0, letterSpacing: "0.08em" }}>τ-EULER SYMMETRY ATLAS</h1>
        <div style={{ fontSize: 9, color: "#333", marginTop: 2 }}>4 quadrants · 8-dimensional filter · complex plane</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
        <canvas ref={cvRef}
          style={{ width: W, height: H, cursor: drag ? "grabbing" : "grab", borderRadius: 2, border: "1px solid #111128" }}
          onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        />

        <div style={{ width: 260, fontSize: 10 }}>
          {/* Parameters */}
          <Sec title="Parameters">
            <Sl label="k" val={kVal} set={setKVal} min={-4} max={4} step={0.01} />
            <Sl label="Z (n max)" val={Z} set={setZ} min={1} max={200} step={1} />
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
              <Tog label="Primes" on={usePrimes} set={setUsePrimes} />
              <span style={{ color: "#333" }}>|</span>
              <Sl label="unit" val={unit} set={setUnit} min={0.01} max={5} step={0.01} />
            </div>
            <Sl label="point size" val={ptSize} set={setPtSize} min={0.5} max={8} step={0.5} />
          </Sec>

          {/* G: Color Quadrants */}
          <Sec title="G: Quadrant (sign × i-sign)">
            {QUADS.map((q, i) => (
              <DimSlider key={i} label={`${q.name} (${q.s<0?"−":"+"})(${q.iS<0?"−i":"+i"})`} color={q.color}
                val={dG[i]} set={v => setDim(setDG, i, v)} />
            ))}
          </Sec>

          {/* D: Trig */}
          <Sec title="D: Trig function">
            {["identity","sin","cos","tan"].map((l, i) => (
              <DimSlider key={i} label={l} val={dD[i]} set={v => setDim(setDD, i, v)} />
            ))}
          </Sec>

          {/* E: Expression type */}
          <Sec title="E: Expression type">
            {["F (point)","V (vector: J·F)","C (curve: (τ/n)ᵏ)"].map((l, i) => (
              <DimSlider key={i} label={l} val={dE[i]} set={v => setDim(setDE, i, v)} />
            ))}
          </Sec>

          {/* B, C */}
          <Sec title="B×C: Sign × Log">
            <DimSlider label="B₁: positive (+f)" val={dB[0]} set={v => setDim(setDB, 0, v)} />
            <DimSlider label="B₂: negative (−f)" val={dB[1]} set={v => setDim(setDB, 1, v)} />
            <DimSlider label="C₁: base (raw)" val={dC[0]} set={v => setDim(setDC, 0, v)} />
            <DimSlider label="C₂: log-wrapped" val={dC[1]} set={v => setDim(setDC, 1, v)} />
          </Sec>

          {/* A: rendering */}
          <Sec title="A: Rendering">
            <DimSlider label="A₁: point opacity" val={dA[0]} set={v => setDim(setDA, 0, v)} />
          </Sec>

          {/* View controls */}
          <Sec title="View">
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Btn onClick={() => { setZoom(2.5); setPan([0,0]); }}>Reset</Btn>
              <Btn onClick={() => setZoom(z => z*0.65)}>Zoom +</Btn>
              <Btn onClick={() => setZoom(z => z*1.5)}>Zoom −</Btn>
              <Tog label="r=1" on={showR1} set={setShowR1} />
              <Tog label="r=1/τ" on={showRTau} set={setShowRTau} />
              <Tog label="τⁿ grid" on={showTauGrid} set={setShowTauGrid} />
            </div>
          </Sec>

          {/* Presets */}
          <Sec title="Presets">
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Btn onClick={() => { setDD([1,0,0,0]); setDC([1,0]); setDB([1,0]); setDE([1,0,0]); setKVal(2); setZ(72); }}>
                Base only
              </Btn>
              <Btn onClick={() => { setDD([0,1,0,0]); setDC([0.45,0]); setDB([1,0]); setDE([1,1,1]); setKVal(10); setZ(7); }}>
                euler_full state
              </Btn>
              <Btn onClick={() => { setDD([1,1,1,1]); setDC([1,1]); setDB([1,1]); setDE([1,1,1]); setDG([1,1,1,1]); }}>
                Everything
              </Btn>
              <Btn onClick={() => { setDD([1,0,0,0]); setDC([1,0]); setDB([1,0]); setDE([1,0,0]); setDG([0,0,0,1]); setKVal(1); setZ(72); }}>
                Purple e^{"{"}iτᵏ{"}"}
              </Btn>
            </div>
          </Sec>
        </div>
      </div>
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div style={{ marginBottom: 8, borderTop: "1px solid #0e0e22", paddingTop: 6 }}>
      <div style={{ color: "#555", fontWeight: 700, fontSize: 9, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {children}
    </div>
  );
}

function Sl({ label, val, set, min, max, step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{ color: "#444", width: 70, fontSize: 9 }}>{label} = {typeof val === "number" ? (Number.isInteger(step) ? val : val.toFixed(2)) : val}</span>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => set(parseFloat(e.target.value))}
        style={{ flex: 1, height: 12 }} />
    </div>
  );
}

function DimSlider({ label, val, set, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", opacity: val }} />}
      <span style={{ color: val > 0 ? "#777" : "#2a2a2a", width: 120, fontSize: 9 }}>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={val}
        onChange={e => set(parseFloat(e.target.value))}
        style={{ flex: 1, height: 10 }} />
      <span style={{ color: "#333", width: 24, fontSize: 8, textAlign: "right" }}>{val.toFixed(1)}</span>
    </div>
  );
}

function Tog({ label, on, set }) {
  return (
    <button onClick={() => set(!on)} style={{
      background: on ? "#0a1a0a" : "transparent", color: on ? "#5a5" : "#2a2a2a",
      border: `1px solid ${on ? "#1a3a1a" : "#111128"}`, padding: "2px 6px", fontSize: 9,
      cursor: "pointer", fontFamily: "inherit", borderRadius: 2,
    }}>{label}</button>
  );
}

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: "transparent", color: "#555",
      border: "1px solid #111128", padding: "2px 7px", fontSize: 9,
      cursor: "pointer", fontFamily: "inherit", borderRadius: 2,
    }}>{children}</button>
  );
}
