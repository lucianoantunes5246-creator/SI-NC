import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { simulateOrbit } from "./api/simulate";
import { fetchVeff } from "./api/veff";

function downsampleXY(x, y, maxPoints = 7000) {
  const n = Math.min(x.length, y.length);
  if (n <= maxPoints) return { x, y };
  const step = Math.ceil(n / maxPoints);
  const xd = [];
  const yd = [];
  for (let i = 0; i < n; i += step) {
    xd.push(x[i]);
    yd.push(y[i]);
  }
  return { x: xd, y: yd };
}

function computeRange(x, y, padFrac = 0.08) {
  if (!x.length || !y.length) return null;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (xi < xmin) xmin = xi;
    if (xi > xmax) xmax = xi;
    if (yi < ymin) ymin = yi;
    if (yi > ymax) ymax = yi;
  }
  if (!Number.isFinite(xmin)) return null;
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const half = Math.max(xmax - xmin, ymax - ymin) / 2 || 1;
  const r = half * (1 + padFrac);
  return { xRange: [cx - r, cx + r], yRange: [cy - r, cy + r] };
}

export default function App() {
  const [p, setP] = useState({
    metric: "schwarzschild",
    particle: "massive",
    M: 1.0,
    E: 0.95,
    L: 4.2,
    r0: 20.0,
    radial_sign: "in",
    turns: 6,       // <-- em vez de phi_max
    n: 4000,

    r_min: 2.2,
    r_max: 50.0,
    n_veff: 2000,
  });

  const [traj, setTraj] = useState(null);
  const [veff, setVeff] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const setNum = (k) => (e) => setP((s) => ({ ...s, [k]: Number(e.target.value) }));
  const setStr = (k) => (e) => setP((s) => ({ ...s, [k]: e.target.value }));

  const phi_max = useMemo(() => 2 * Math.PI * Math.max(1, Math.min(20, p.turns)), [p.turns]);
  const horizon = 2 * p.M;
  const photonSphere = 3 * p.M;
  const E2 = p.E * p.E;
  const b = p.E !== 0 ? (p.L / p.E) : Infinity;
  const bcrit = 3 * Math.sqrt(3) * p.M;

  async function run() {
    setErr("");
    setLoading(true);
    try {
      const [t, v] = await Promise.all([
        simulateOrbit({
          metric: p.metric,
          particle: p.particle,
          M: p.M,
          E: p.E,
          L: p.L,
          r0: p.r0,
          radial_sign: p.radial_sign,
          phi_max,
          n: p.n,
        }),
        fetchVeff({
          metric: p.metric,
          particle: p.particle,
          M: p.M,
          E: p.E,
          L: p.L,
          r_min: p.r_min,
          r_max: p.r_max,
          n: p.n_veff,
        }),
      ]);

      setTraj(t);
      setVeff(v);
      console.log("Veff keys:", Object.keys(v||{}));
      console.log("Veff sample:", {r: v?.r?.slice?.(0,5), V_eff2: v?.V_eff2?.slice?.(0,5), meta: v?.meta});
    } catch (e) {
      setErr(String(e.message || e));
      setTraj(null);
      setVeff(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const xRaw = traj?.x ?? [];
  const yRaw = traj?.y ?? [];
  const { x: xPlot, y: yPlot } = downsampleXY(xRaw, yRaw, 7000);
  const ranges = computeRange(xPlot, yPlot);

  const x0 = xPlot?.[0], y0 = yPlot?.[0];
  const xF = xPlot?.[xPlot.length - 1], yF = yPlot?.[yPlot.length - 1];

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1300, margin: "0 auto" }}>
      <h2 style={{ margin: "8px 0" }}>Órbita + Potencial efetivo</h2>

      <div style={{ color: "#444", marginBottom: 10 }}>
        φ_max = <b>{phi_max.toFixed(3)}</b> rad (turns = {p.turns}) | b = L/E = <b>{Number.isFinite(b) ? b.toFixed(3) : "∞"}</b>
        {p.particle === "photon" && (
          <span> | b_crit ≈ <b>{bcrit.toFixed(3)}</b></span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <label>
          Tipo
          <select value={p.particle} onChange={setStr("particle")} style={{ width: "100%" }}>
            <option value="massive">Corpo massivo</option>
            <option value="photon">Fóton</option>
          </select>
        </label>

        <label>
          M
          <input type="number" step="0.1" value={p.M} onChange={setNum("M")} style={{ width: "100%" }} />
        </label>

        <label>
          E
          <input type="number" step="0.01" value={p.E} onChange={setNum("E")} style={{ width: "100%" }} />
        </label>

        <label>
          L (fóton: b=L/E)
          <input type="number" step="0.1" value={p.L} onChange={setNum("L")} style={{ width: "100%" }} />
        </label>

        <label>
          r0
          <input type="number" step="0.1" value={p.r0} onChange={setNum("r0")} style={{ width: "100%" }} />
        </label>

        <label>
          Direção radial
          <select value={p.radial_sign} onChange={setStr("radial_sign")} style={{ width: "100%" }}>
            <option value="in">in (cair)</option>
            <option value="out">out (sair)</option>
          </select>
        </label>

        <label>
          Voltas (1–20)
          <input type="number" min="1" max="20" step="1" value={p.turns} onChange={setNum("turns")} style={{ width: "100%" }} />
        </label>

        <label>
          n (traj)
          <input type="number" step="100" value={p.n} onChange={setNum("n")} style={{ width: "100%" }} />
        </label>

        <label>
          r_min (Veff)
          <input type="number" step="0.1" value={p.r_min} onChange={setNum("r_min")} style={{ width: "100%" }} />
        </label>

        <label>
          r_max (Veff)
          <input type="number" step="1" value={p.r_max} onChange={setNum("r_max")} style={{ width: "100%" }} />
        </label>

        <label>          n (Veff)
          <input type="number" step="100" value={p.n_veff} onChange={setNum("n_veff")} style={{ width: "100%" }} />
        </label>
      </div>

      <button onClick={run} disabled={loading} style={{ padding: "8px 14px", marginBottom: 12 }}>
        {loading ? "Calculando..." : "Rodar"}
      </button>

      {traj?.meta && (
        <div style={{ marginBottom: 10, color: "#333" }}>
          points_returned: <b>{traj.meta.points_returned}</b> | captured: <b>{String(traj.meta.captured)}</b>
        </div>
      )}
      {veff && (
        <div style={{ marginBottom: 10, color: "#333" }}>
          veff points: <b>{veff.r?.length ?? 0}</b>
          {veff.meta?.n ? <> | n: <b>{veff.meta.n}</b></> : null}
        </div>
      )}

      {err && (
        <pre style={{ background: "#fee", border: "1px solid #f99", padding: 12, whiteSpace: "pre-wrap" }}>
          {err}
        </pre>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
          <Plot
            data={[
              { x: xPlot, y: yPlot, type: "scatter", mode: "lines", name: "trajetória" },
              { x: Number.isFinite(x0) ? [x0] : [], y: Number.isFinite(y0) ? [y0] : [], type: "scatter", mode: "markers", name: "início", marker: { size: 8 } },
              { x: Number.isFinite(xF) ? [xF] : [], y: Number.isFinite(yF) ? [yF] : [], type: "scatter", mode: "markers", name: "fim", marker: { size: 9, symbol: "x" } },
              { x: [0], y: [0], type: "scatter", mode: "markers", name: "BH", marker: { size: 10 } },
            ]}
            layout={{
              title: "Trajetória (x,y)",
              xaxis: { title: "x", range: ranges?.xRange },
              yaxis: { title: "y", scaleanchor: "x", range: ranges?.yRange },
              height: 560,
              margin: { l: 50, r: 20, t: 50, b: 45 },
              hovermode: "closest",
              uirevision: "keep-zoom",
              shapes: [
                { type: "circle", xref: "x", yref: "y", x0: -horizon, y0: -horizon, x1: horizon, y1: horizon, line: { width: 2, dash: "dot" }, fillcolor: "rgba(0,0,0,0.08)" },
                { type: "circle", xref: "x", yref: "y", x0: -photonSphere, y0: -photonSphere, x1: photonSphere, y1: photonSphere, line: { width: 1, dash: "dash" } },
              ],
            }}
            config={{ responsive: true }}
            style={{ width: "100%" }}
          />
          <div style={{ color: "#666", fontSize: 12 }}>
            Horizonte (2M) sombreado; esfera de fótons (3M) tracejada; início/fim marcados.
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
          <Plot
            data={[
              { x: veff?.r ?? [], y: veff?.V_eff2 ?? [], type: "scatter", mode: "lines", name: "V_eff²(r)" },
              { x: veff?.r ?? [], y: (veff?.r ?? []).map(() => E2), type: "scatter", mode: "lines", name: "E²" },
            ]}
            layout={{
              title: "Potencial efetivo (compatível com E²)",
              xaxis: { title: "r" },
              yaxis: { title: "V_eff²" },
              height: 560,
              margin: { l: 60, r: 20, t: 50, b: 45 },
              shapes: [
                { type: "line", x0: horizon, x1: horizon, y0: 0, y1: 1, xref: "x", yref: "paper", line: { width: 2, dash: "dot" } },
                { type: "line", x0: photonSphere, x1: photonSphere, y0: 0, y1: 1, xref: "x", yref: "paper", line: { width: 1, dash: "dash" } },
              ],
            }}
            config={{ responsive: true }}
            style={{ width: "100%" }}
          />
          <div style={{ color: "#666", fontSize: 12 }}>
            Se der “sem órbita”, normalmente é porque <b>E² &lt; V_eff²(r0)</b> (região proibida).
          </div>
        </div>
      </div>
    </div>
  );
}

