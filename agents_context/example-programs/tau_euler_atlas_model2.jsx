import { useState, useRef, useEffect, useCallback } from "react";

// ── Complex arithmetic (as [re, im] pairs) ──
const C = (r, i) => [r, i];
const cAdd = (a, b) => [a[0]+b[0], a[1]+b[1]];
const cMul = (a, b) => [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]];
const cDiv = (a, b) => { const d=b[0]*b[0]+b[1]*b[1]; return d<1e-30?[NaN,NaN]:[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d]; };
const cAbs = z => Math.hypot(z[0], z[1]);
const cArg = z => Math.atan2(z[1], z[0]);
const cExp = z => { const r=Math.exp(z[0]); return [r*Math.cos(z[1]), r*Math.sin(z[1])]; };
const cLog = z => [Math.log(cAbs(z)), cArg(z)];
const cSin = z => { const a=cExp([-z[1],z[0]]), b=cExp([z[1],-z[0]]); return [(a[1]-b[1])/2,-(a[0]-b[0])/2]; };
const cScl = (z, s) => [z[0]*s, z[1]*s];
const cNeg = z => [-z[0],-z[1]];
const ok = z => isFinite(z[0]) && isFinite(z[1]);

const TAU = 2 * Math.PI;

// ── Zeta zeros (first 13 imaginary parts) ──
const ZETA_ZEROS = [14.134725141734694,21.022039638771555,25.010857580145689,30.424876125859513,32.935061587739190,40.918719012147495,43.327073280915000,48.005150881167160,49.773832477672302,52.970321477714461,56.446247697063395,59.347044002602353,60.831778524609810];

// ── 24-step rainbow ──
function rainbow(i, total) {
  const h = (i / Math.max(1, total)) * 360;
  return `hsl(${h}, 90%, 55%)`;
}
function rainbowDim(i, total) {
  const h = (i / Math.max(1, total)) * 360;
  return `hsl(${h}, 60%, 35%)`;
}

export default function TauEulerExplorer() {
  const cvRef = useRef(null);

  // ── Core parameters ──
  const [Z, setZ] = useState(710);
  const [T, setT] = useState(1.9999);
  const [lFunc, setLFunc] = useState(10);
  const [lBase, setLBase] = useState(10);
  const [k2, setK2] = useState(1);

  // ── q system ──
  const [qA, setQA] = useState(1);         // 0 = use q₁ directly as k₁, 1 = use τ/(q/2·corr)
  const [q1Mode, setQ1Mode] = useState(0);  // 0 = manual q1A, 1 = zeta zero
  const [q1A, setQ1A] = useState(26.3);
  const [q2, setQ2] = useState(0);
  const [zetaIdx, setZetaIdx] = useState(0);
  const [qCorr, setQCorr] = useState(1);    // correction toggle

  // ── Strands ──
  const [numStrands, setNumStrands] = useState(6);
  const [showLogPlot, setShowLogPlot] = useState(false);

  // ── Rendering ──
  const [lineWidth, setLineWidth] = useState(0.8);
  const [lineOpacity, setLineOpacity] = useState(0.5);
  const [ptSize, setPtSize] = useState(1.5);
  const [ptOpacity, setPtOpacity] = useState(0.7);

  // ── Stepping ──
  const [stepB, setStepB] = useState(360);

  // ── View ──
  const [zoom, setZoom] = useState(2.5);
  const [pan, setPan] = useState([0, 0]);
  const [drag, setDrag] = useState(null);

  const W = 620, H = 620;

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

    // ── Background ──
    ctx.fillStyle = "#060610";
    ctx.fillRect(0, 0, W, H);

    // ── Grid ──
    ctx.strokeStyle = "#0e0e22"; ctx.lineWidth = 0.5;
    const gStep = zoom < 1 ? 0.25 : zoom < 5 ? 1 : zoom < 20 ? 5 : 10;
    for (let v = Math.floor((-zoom + pan[0]) / gStep) * gStep; v <= zoom + pan[0] + gStep; v += gStep) {
      const p = toS([v, 0]);
      ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H); ctx.stroke();
    }
    for (let v = Math.floor((-zoom + pan[1]) / gStep) * gStep; v <= zoom + pan[1] + gStep; v += gStep) {
      const p = toS([0, v]);
      ctx.beginPath(); ctx.moveTo(0, p[1]); ctx.lineTo(W, p[1]); ctx.stroke();
    }

    // ── Axes ──
    ctx.strokeStyle = "#1a1a3a"; ctx.lineWidth = 1;
    let a = toS([-99, 0]), b = toS([99, 0]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    a = toS([0, -99]); b = toS([0, 99]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();

    // ── Reference circles ──
    const drawCirc = (r, col, dash) => {
      const c = toS([0,0]), e = toS([r,0]);
      const rad = Math.abs(e[0]-c[0]);
      if (rad < 1 || rad > 5000) return;
      ctx.beginPath(); ctx.setLineDash(dash);
      ctx.arc(c[0], c[1], rad, 0, TAU);
      ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.setLineDash([]);
    };
    drawCirc(1, "#222255", []);
    drawCirc(1/TAU, "#552222", [4,4]);

    // ── Compute k ──
    const logL = (x) => Math.log(x) / Math.log(lFunc);
    const k = logL(T * TAU / 2) / logL(TAU);

    // ── Compute q₁ ──
    const q1 = q1Mode === 1 ? ZETA_ZEROS[zetaIdx] : q1A;

    // ── Compute q ──
    const q = q1 * Math.pow(TAU, q2);

    // ── Compute d ──
    const d = Math.abs(2 * Math.cos(TAU / 2 * T));

    // ── Compute k₁ ──
    let k1;
    if (qA === 0) {
      k1 = q1;
    } else {
      const corrFactor = qCorr === 0 ? 2 : (d === 0 ? 1 : d);
      k1 = TAU / ((q / 2) * corrFactor);
    }

    // ── Compute f = k₁ · e^{iτ^k} ──
    const tauK = Math.pow(TAU, k);
    const f = cScl(cExp([0, tauK]), k1);

    // ── Generate n values ──
    const n = Array.from({ length: Z }, (_, i) => i);
    const s = stepB > 0 ? 1 / stepB : 1;

    // ── Plot strands ──
    for (let strand = 0; strand < numStrands; strand++) {
      const offset = strand * Z;
      const col = rainbow(strand, numStrands);
      const colDim = rainbowDim(strand, numStrands);

      // Compute all points for this strand
      const pts = [];
      for (let i = 0; i < Z; i++) {
        const nv = i + offset;
        const nf = cScl(f, nv);  // n·f
        const sinNf = cSin(nf);  // sin(n·f)
        const val = cScl(sinNf, k2);
        if (ok(val)) {
          pts.push(val);
        } else {
          pts.push(null);
        }
      }

      // Draw lines connecting sequential points
      if (lineOpacity > 0.01 && lineWidth > 0.01) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = lineOpacity;
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i < pts.length; i++) {
          if (!pts[i]) { drawing = false; continue; }
          const sc = toS(pts[i]);
          if (sc[0] < -200 || sc[0] > W+200 || sc[1] < -200 || sc[1] > H+200) {
            drawing = false; continue;
          }
          if (!drawing) { ctx.moveTo(sc[0], sc[1]); drawing = true; }
          else { ctx.lineTo(sc[0], sc[1]); }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw points
      if (ptSize > 0.1 && ptOpacity > 0.01) {
        ctx.fillStyle = col;
        ctx.globalAlpha = ptOpacity;
        for (let i = 0; i < pts.length; i++) {
          if (!pts[i]) continue;
          const sc = toS(pts[i]);
          if (sc[0] < -20 || sc[0] > W+20 || sc[1] < -20 || sc[1] > H+20) continue;
          ctx.beginPath();
          ctx.arc(sc[0], sc[1], ptSize, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ── Optional log plot (overlay) ──
      if (showLogPlot) {
        const logPts = pts.map(p => {
          if (!p) return null;
          const sinVal = p; // already sin(nf)·k₂
          const lg = cLog(sinVal);
          // Use log base lBase: log_b(z) = ln(z)/ln(b)
          const scaled = cScl(lg, 1 / Math.log(lBase));
          return ok(scaled) ? scaled : null;
        });

        if (lineOpacity > 0.01) {
          ctx.strokeStyle = colDim;
          ctx.lineWidth = lineWidth * 0.6;
          ctx.globalAlpha = lineOpacity * 0.4;
          ctx.beginPath();
          let drawing = false;
          for (let i = 0; i < logPts.length; i++) {
            if (!logPts[i]) { drawing = false; continue; }
            const sc = toS(logPts[i]);
            if (sc[0] < -200 || sc[0] > W+200 || sc[1] < -200 || sc[1] > H+200) {
              drawing = false; continue;
            }
            if (!drawing) { ctx.moveTo(sc[0], sc[1]); drawing = true; }
            else { ctx.lineTo(sc[0], sc[1]); }
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // ── Labels ──
    ctx.font = "10px 'SF Mono','Menlo',monospace";
    ctx.fillStyle = "#333";
    const ul = toS([1,0]); ctx.fillStyle="#222255"; ctx.fillText("r=1", ul[0]+2, ul[1]-3);
    const al = toS([1/TAU,0]); ctx.fillStyle="#552222"; ctx.fillText("r=1/τ", al[0]+2, al[1]+10);

    // ── Info overlay ──
    ctx.fillStyle = "#333"; ctx.font = "9px 'SF Mono',monospace";
    ctx.fillText(`k=${k.toFixed(6)}  k₁=${k1.toFixed(6)}  f=(${f[0].toFixed(4)}, ${f[1].toFixed(4)}i)`, 6, H-24);
    ctx.fillText(`q=${q.toFixed(6)}  d=${d.toFixed(8)}  710/113τ=${(710/(113*TAU)).toFixed(6)}`, 6, H-12);

  }, [Z, T, lFunc, lBase, k2, qA, q1Mode, q1A, q2, zetaIdx, qCorr, numStrands, showLogPlot, lineWidth, lineOpacity, ptSize, ptOpacity, stepB, zoom, pan, toS]);

  // ── Mouse ──
  const onWheel = e => { e.preventDefault(); setZoom(z => Math.max(0.01, Math.min(500, z * (e.deltaY > 0 ? 1.12 : 0.89)))); };
  const onDown = e => setDrag({ x: e.clientX, y: e.clientY, p: [...pan] });
  const onMove = e => { if (!drag) return; setPan([drag.p[0]-(e.clientX-drag.x)/(W/2)*zoom, drag.p[1]+(e.clientY-drag.y)/(H/2)*zoom]); };
  const onUp = () => setDrag(null);

  return (
    <div style={{ background: "#060610", color: "#aaa", fontFamily: "'SF Mono','Menlo','Fira Code',monospace", minHeight: "100vh", padding: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: "#ccc", margin: 0, letterSpacing: "0.08em" }}>τ-EULER SIN SPOKE EXPLORER</h1>
        <div style={{ fontSize: 9, color: "#333", marginTop: 2 }}>f = k₁·e<sup>iτᵏ</sup> · sin(n·f)·k₂ — strand/spoke structure with 710-stepping</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
        <canvas ref={cvRef}
          style={{ width: W, height: H, cursor: drag ? "grabbing" : "grab", borderRadius: 2, border: "1px solid #111128" }}
          onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        />

        <div style={{ width: 270, fontSize: 10, maxHeight: H, overflowY: "auto", paddingRight: 4 }}>
          {/* Core Parameters */}
          <Sec title="Core Parameters">
            <Sl label="Z" val={Z} set={setZ} min={1} max={2000} step={1} fmt={v => v} />
            <Sl label="T" val={T} set={setT} min={0.01} max={4} step={0.0001} fmt={v => v.toFixed(4)} />
            <Sl label="log base (l)" val={lFunc} set={setLFunc} min={2} max={100} step={0.1} />
            <Sl label="k₂ (scale)" val={k2} set={setK2} min={0.01} max={5} step={0.01} />
          </Sec>

          {/* q System / k₁ */}
          <Sec title="k₁ System">
            <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
              <Tog label="qₐ=0 (k₁=q₁)" on={qA===0} set={() => setQA(0)} />
              <Tog label="qₐ=1 (k₁=τ/…)" on={qA===1} set={() => setQA(1)} />
            </div>

            <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
              <Tog label="Manual q₁" on={q1Mode===0} set={() => setQ1Mode(0)} />
              <Tog label="Zeta zero" on={q1Mode===1} set={() => setQ1Mode(1)} />
            </div>

            {q1Mode === 0 ? (
              <Sl label="q₁" val={q1A} set={setQ1A} min={0.01} max={100} step={0.001} />
            ) : (
              <Sl label="ζ zero #" val={zetaIdx} set={setZetaIdx} min={0} max={12} step={1} fmt={v => `${v+1}: ${ZETA_ZEROS[v].toFixed(4)}`} />
            )}

            <Sl label="q₂ (τ^q₂)" val={q2} set={setQ2} min={-5} max={2} step={1} fmt={v => v} />

            {qA === 1 && (
              <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                <Tog label="No correction" on={qCorr===0} set={() => setQCorr(0)} />
                <Tog label="d-correction" on={qCorr===1} set={() => setQCorr(1)} />
              </div>
            )}
          </Sec>

          {/* Strands */}
          <Sec title="Strands (n + j·Z bands)">
            <Sl label="# strands" val={numStrands} set={setNumStrands} min={1} max={28} step={1} fmt={v => v} />
            <div style={{ color: "#444", fontSize: 9 }}>
              n = [0..{Z-1}], then n+{Z}, n+{2*Z}, … up to n+{(numStrands-1)*Z}
            </div>
            <div style={{ marginTop: 4 }}>
              <Tog label="Show log overlay" on={showLogPlot} set={setShowLogPlot} />
              {showLogPlot && <Sl label="log base" val={lBase} set={setLBase} min={2} max={100} step={0.1} />}
            </div>
          </Sec>

          {/* Rendering */}
          <Sec title="Rendering">
            <Sl label="line width" val={lineWidth} set={setLineWidth} min={0} max={4} step={0.1} />
            <Sl label="line opacity" val={lineOpacity} set={setLineOpacity} min={0} max={1} step={0.05} />
            <Sl label="point size" val={ptSize} set={setPtSize} min={0} max={6} step={0.25} />
            <Sl label="point opacity" val={ptOpacity} set={setPtOpacity} min={0} max={1} step={0.05} />
          </Sec>

          {/* Stepping */}
          <Sec title="Stepping (s = 1/b)">
            <Sl label="b" val={stepB} set={setStepB} min={1} max={720} step={1} fmt={v => `${v}  (s=${(1/v).toFixed(6)})`} />
            <div style={{ color: "#444", fontSize: 9 }}>For rational-interval fine tuning of scaling variables</div>
          </Sec>

          {/* View */}
          <Sec title="View">
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Btn onClick={() => { setZoom(2.5); setPan([0,0]); }}>Reset</Btn>
              <Btn onClick={() => setZoom(z => z*0.65)}>Zoom +</Btn>
              <Btn onClick={() => setZoom(z => z*1.5)}>Zoom −</Btn>
            </div>
          </Sec>

          {/* Presets */}
          <Sec title="Presets">
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <Btn onClick={() => { setZ(710); setT(1.9999); setQ1A(26.3); setQ2(0); setQA(1); setQCorr(1); setNumStrands(6); setLFunc(10); }}>
                Default (Z=710)
              </Btn>
              <Btn onClick={() => { setZ(710); setT(1.9999); setQ1Mode(1); setZetaIdx(0); setQA(1); setQCorr(1); }}>
                Zeta ζ₁=14.13
              </Btn>
              <Btn onClick={() => { setZ(710); setQ1A(3.052072); setQ2(-3); setQA(1); setQCorr(1); }}>
                3 spokes
              </Btn>
              <Btn onClick={() => { setZ(710); setQ1A(3.1374845); setQ2(-4); setQA(1); setQCorr(1); }}>
                4 spokes
              </Btn>
              <Btn onClick={() => { setZ(710); setQ1A(3.1371689); setQ2(-4); setQA(1); setQCorr(1); }}>
                5 spokes
              </Btn>
              <Btn onClick={() => { setNumStrands(28); setLineWidth(0.3); setLineOpacity(0.3); setPtSize(0.5); }}>
                All 28 strands
              </Btn>
            </div>
          </Sec>

          {/* Notes */}
          <Sec title="Architecture">
            <div style={{ color: "#444", fontSize: 9, lineHeight: 1.6 }}>
              <div>f = k₁ · e<sup>iτᵏ</sup></div>
              <div>k = log<sub>l</sub>(T·τ/2) / log<sub>l</sub>(τ)</div>
              <div style={{ marginTop: 3 }}>qₐ=0: k₁ = q₁ directly</div>
              <div>qₐ=1: k₁ = τ / (q/2 · corr)</div>
              <div style={{ marginTop: 3 }}>q = q₁ · τ<sup>q₂</sup></div>
              <div>d = |2cos(τT/2)| correction</div>
              <div style={{ marginTop: 3 }}>C_a = 710/(113τ) ≈ {(710/(113*TAU)).toFixed(6)}</div>
              <div style={{ marginTop: 3 }}>Each strand: sin((n + j·Z) · f) · k₂</div>
              <div>Spoke count ↔ rational divisions of τ via k₁</div>
            </div>
          </Sec>
        </div>
      </div>
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div style={{ marginBottom: 6, borderTop: "1px solid #0e0e22", paddingTop: 5 }}>
      <div style={{ color: "#555", fontWeight: 700, fontSize: 9, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {children}
    </div>
  );
}

function Sl({ label, val, set, min, max, step, fmt }) {
  const display = fmt ? fmt(val) : (Number.isInteger(step) || step >= 1 ? val : val.toFixed(Math.max(1, -Math.floor(Math.log10(step)))));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
      <span style={{ color: "#444", width: 80, fontSize: 9, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => set(parseFloat(e.target.value))}
        style={{ flex: 1, height: 10 }} />
      <span style={{ color: "#555", fontSize: 8, width: 70, textAlign: "right", flexShrink: 0 }}>{display}</span>
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
      border: "1px solid #111128", padding: "2px 6px", fontSize: 8,
      cursor: "pointer", fontFamily: "inherit", borderRadius: 2,
    }}>{children}</button>
  );
}
