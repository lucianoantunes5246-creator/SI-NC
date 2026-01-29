import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { simulateOrbit } from "./api/simulate";
import { fetchVeff } from "./api/veff";
import { simulateOrbitNC } from "./api/simulate_nc";
import { fetchVeffNC } from "./api/veff_nc";

function PlanetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Planeta">
      <circle cx="32" cy="32" r="16" fill="currentColor" />
      <ellipse cx="32" cy="36" rx="26" ry="8" fill="none" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

function PhotonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Foton">
      <circle cx="16" cy="32" r="6" fill="currentColor" />
      <path d="M26 32H56" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M26 20c6-6 12-6 18 0s12 6 18 0" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

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
    E: 1.05,
    L: 4.2,
    r0: 20.0,
    radial_sign: "in",
    turns: 6,
    n: 4000,

    r_min: 2.2,
    r_max: 50.0,
    n_veff: 2000,
  });

  const [traj, setTraj] = useState(null);
  const [veff, setVeff] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [useEnergyParam, setUseEnergyParam] = useState(true);
  const [autoRange, setAutoRange] = useState(true);
  const [nc, setNc] = useState({
    metric: "nc-schwarzschild",
    particle: "massive",
    M: 1.0,
    theta: 1.0,
    E: 1.0,
    L: 7.0,
    r0: 20.0,
    radial_sign: "in",
    turns: 6,
    n: 4000,
    r_min: 2.2,
    r_max: 50.0,
    n_veff: 2000,
  });
  const [ncTraj, setNcTraj] = useState(null);
  const [ncVeff, setNcVeff] = useState(null);
  const [ncErr, setNcErr] = useState("");
  const [ncLoading, setNcLoading] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  const setNum = (k) => (e) => setP((s) => ({ ...s, [k]: Number(e.target.value) }));
  const setStr = (k) => (e) => setP((s) => ({ ...s, [k]: e.target.value }));
  const setNcNum = (k) => (e) => setNc((s) => ({ ...s, [k]: Number(e.target.value) }));
  const setNcStr = (k) => (e) => setNc((s) => ({ ...s, [k]: e.target.value }));

  const phi_max = useMemo(() => 2 * Math.PI * Math.max(1, Math.min(20, p.turns)), [p.turns]);
  const horizon = 2 * p.M;
  const photonSphere = 3 * p.M;
  const useEnergyParamForMassive = useEnergyParam && p.particle === "massive";
  const E_spec = useMemo(() => {
    if (useEnergyParamForMassive) {
      const inside = 2 * p.E + 1;
      return inside > 0 ? Math.sqrt(inside) : NaN;
    }
    return p.E;
  }, [p.E, useEnergyParamForMassive]);
  const E2 = E_spec * E_spec;
  const energyParam = useMemo(() => {
    if (p.particle === "massive") {
      return useEnergyParamForMassive ? p.E : (E2 - 1) / 2;
    }
    if (!p.L) return 0;
    return (E_spec / p.L) ** 2;
  }, [E2, E_spec, p.E, p.L, p.particle, useEnergyParamForMassive]);
  const energyLabel = p.particle === "massive" ? "Ē" : "k";
  const b = E_spec !== 0 ? (p.L / E_spec) : Infinity;
  const bcrit = 3 * Math.sqrt(3) * p.M;

  const potentialStats = useMemo(() => {
    if (p.particle !== "massive") return null;
    if (!Number.isFinite(p.M) || !Number.isFinite(p.L) || p.M <= 0 || p.L <= 0) return null;
    const disc = 1 - (12 * p.M * p.M) / (p.L * p.L);
    if (disc <= 0) return null;
    const sqrtDisc = Math.sqrt(disc);
    const u1 = (1 - sqrtDisc) / (6 * p.M);
    const u2 = (1 + sqrtDisc) / (6 * p.M);
    const toUeff = (u) => (-p.M * u) + 0.5 * (p.L * p.L) * (u * u) - (p.M * p.L * p.L) * (u * u * u);
    const v1 = toUeff(u1);
    const v2 = toUeff(u2);
    return {
      points: [
        { r: 1 / u1, v: v1 },
        { r: 1 / u2, v: v2 },
      ],
      vmin: Math.min(v1, v2),
      vmax: Math.max(v1, v2),
      umin: Math.min(u1, u2),
    };
  }, [p.M, p.L, p.particle]);

  const critPoints = potentialStats?.points ?? [];

  const autoRangeValues = useMemo(() => {
    const rMin = Math.max(2.05 * p.M, 2.05);
    let rMax = 30 * p.M;
    if (p.particle === "massive" && potentialStats?.umin) {
      rMax = 2 / potentialStats.umin;
    }
    return { rMin, rMax };
  }, [p.M, p.particle, potentialStats]);

  const rMinUsed = autoRange ? autoRangeValues.rMin : p.r_min;
  const rMaxUsed = autoRange ? autoRangeValues.rMax : p.r_max;
  const energyParamInvalid = useEnergyParamForMassive && p.E < -0.5;
  const ncPhiMax = useMemo(() => 2 * Math.PI * Math.max(1, Math.min(20, nc.turns)), [nc.turns]);
  const ncE2 = nc.E * nc.E;
  const ncB = nc.E !== 0 ? (nc.L / nc.E) : Infinity;

  const plotTheme = useMemo(() => {
    if (darkMode) {
      return {
        paper: "#181F2F",
        plot: "#181F2F",
        grid: "#353549",
        text: "#ffffff",
        accent: "#FFC700",
        horizonFill: "rgba(255,255,255,0.08)",
      };
    }
    return {
      paper: "#f6f6f6",
      plot: "#f6f6f6",
      grid: "#c1bfbf",
      text: "#000000",
      accent: "#ffdb57",
      horizonFill: "rgba(0,0,0,0.08)",
    };
  }, [darkMode]);

  async function run() {
    setErr("");
    if (energyParamInvalid || !Number.isFinite(E_spec)) {
      setErr("Energia inválida. Para corpos massivos, use Ē ≥ -0.5.");
      return;
    }
    if (!Number.isFinite(rMinUsed) || !Number.isFinite(rMaxUsed) || rMaxUsed <= rMinUsed) {
      setErr("Intervalo de r inválido. Ajuste r_min/r_max.");
      return;
    }
    setLoading(true);
    try {
      const [t, v] = await Promise.all([
        simulateOrbit({
          metric: p.metric,
          particle: p.particle,
          M: p.M,
          E: E_spec,
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
          E: E_spec,
          L: p.L,
          r_min: rMinUsed,
          r_max: rMaxUsed,
          n: p.n_veff,
        }),
      ]);

      setTraj(t);
      setVeff(v);
    } catch (e) {
      setErr(String(e.message || e));
      setTraj(null);
      setVeff(null);
    } finally {
      setLoading(false);
    }
  }

  async function runNC() {
    setNcErr("");
    if (!Number.isFinite(nc.theta) || nc.theta <= 0) {
      setNcErr("Theta inválido. Use θ > 0.");
      return;
    }
    if (!Number.isFinite(nc.r_min) || !Number.isFinite(nc.r_max) || nc.r_max <= nc.r_min) {
      setNcErr("Intervalo de r inválido. Ajuste r_min/r_max.");
      return;
    }
    setNcLoading(true);
    try {
      const [t, v] = await Promise.all([
        simulateOrbitNC({
          metric: nc.metric,
          particle: nc.particle,
          M: nc.M,
          theta: nc.theta,
          E: nc.E,
          L: nc.L,
          r0: nc.r0,
          radial_sign: nc.radial_sign,
          phi_max: ncPhiMax,
          n: nc.n,
        }),
        fetchVeffNC({
          metric: nc.metric,
          particle: nc.particle,
          M: nc.M,
          theta: nc.theta,
          E: nc.E,
          L: nc.L,
          r_min: nc.r_min,
          r_max: nc.r_max,
          n: nc.n_veff,
        }),
      ]);

      setNcTraj(t);
      setNcVeff(v);
    } catch (e) {
      setNcErr(String(e.message || e));
      setNcTraj(null);
      setNcVeff(null);
    } finally {
      setNcLoading(false);
    }
  }

  useEffect(() => {
    run();
    runNC();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const xRaw = traj?.x ?? [];
  const yRaw = traj?.y ?? [];
  const { x: xPlot, y: yPlot } = downsampleXY(xRaw, yRaw, 7000);
  const ranges = computeRange(xPlot, yPlot);

  const x0 = xPlot?.[0], y0 = yPlot?.[0];
  const xF = xPlot?.[xPlot.length - 1], yF = yPlot?.[yPlot.length - 1];

  const ncXRaw = ncTraj?.x ?? [];
  const ncYRaw = ncTraj?.y ?? [];
  const { x: ncXPlot, y: ncYPlot } = downsampleXY(ncXRaw, ncYRaw, 7000);
  const ncRanges = computeRange(ncXPlot, ncYPlot);
  const ncX0 = ncXPlot?.[0], ncY0 = ncYPlot?.[0];
  const ncXF = ncXPlot?.[ncXPlot.length - 1], ncYF = ncYPlot?.[ncYPlot.length - 1];

  const baseLayout = {
    paper_bgcolor: plotTheme.paper,
    plot_bgcolor: plotTheme.plot,
    font: { family: "Roboto, sans-serif", color: plotTheme.text },
    height: 520,
    margin: { l: 60, r: 30, t: 50, b: 50 },
    colorway: [plotTheme.accent, "#4f8cc9", "#10b981"],
  };

  const axisBase = {
    gridcolor: plotTheme.grid,
    zerolinecolor: plotTheme.grid,
    linecolor: plotTheme.grid,
    tickfont: { color: plotTheme.text },
    titlefont: { color: plotTheme.text },
  };

  return (
    <div className="page">
      <button className="botao" onClick={() => setDarkMode((v) => !v)} aria-label="Alternar modo">
        <span>{darkMode ? "LIGHT" : "DARK"}</span>
      </button>

      <header className="hero">
        <h1>ÓRBITAS<br />RELATIVÍSTICAS</h1>
        <p className="subtitle">
          Simulador interativo para comparar trajetórias relativísticas e potencial efetivo.
        </p>
      </header>

      <div className="menu">
        <button
          type="button"
          className={`card ${p.particle === "massive" ? "selected" : ""}`}
          onClick={() => setP((s) => ({ ...s, particle: "massive" }))}
        >
          <h2>Órbitas de<br /><strong>corpos<br />massivos</strong></h2>
          <PlanetIcon className="icons" />
        </button>

        <button
          type="button"
          className={`card ${p.particle === "photon" ? "selected" : ""}`}
          onClick={() => setP((s) => ({ ...s, particle: "photon" }))}
        >
          <h2>Órbitas de<br /><strong>raios<br />de luz</strong></h2>
          <PhotonIcon className="icons" />
        </button>
      </div>

      <div className="meta-row">
        <label className="field">
          <span>Modo do site (Ē)</span>
          <input
            type="checkbox"
            checked={useEnergyParam}
            onChange={(e) => setUseEnergyParam(e.target.checked)}
          />
        </label>
        <label className="field">
          <span>Auto r_min/r_max</span>
          <input
            type="checkbox"
            checked={autoRange}
            onChange={(e) => setAutoRange(e.target.checked)}
          />
        </label>
      </div>

      <article>
        <div className="programa">
          <h5>1. Ajuste os parâmetros da órbita</h5>
          <div className="input">
            <div className="input-grid">
              <label className="field">
                Massa central (M)
                <input className="css-input" type="number" step="0.1" value={p.M} onChange={setNum("M")} />
              </label>

              <label className="field">
                Energia {useEnergyParamForMassive ? "(Ē)" : "(E)"}
                <input className="css-input" type="number" step="0.01" value={p.E} onChange={setNum("E")} />
                {useEnergyParamForMassive && (
                  <small>Ē = (E² − 1)/2</small>
                )}
              </label>

              <label className="field">
                Momento angular (L)
                <input className="css-input" type="number" step="0.1" value={p.L} onChange={setNum("L")} />
                <small>Para fóton, b = L / E</small>
              </label>

              <label className="field">
                Raio inicial (r0)
                <input className="css-input" type="number" step="0.1" value={p.r0} onChange={setNum("r0")} />
              </label>

              <label className="field">
                Direção radial
                <select className="css-input" value={p.radial_sign} onChange={setStr("radial_sign")}>
                  <option value="in">in (cair)</option>
                  <option value="out">out (sair)</option>
                </select>
              </label>

              <label className="field">
                Voltas (1–20)
                <input className="css-input" type="number" min="1" max="20" step="1" value={p.turns} onChange={setNum("turns")} />
              </label>

              <label className="field">
                Pontos da órbita (n)
                <input className="css-input" type="number" step="100" value={p.n} onChange={setNum("n")} />
              </label>

              <label className="field">
                r_min (Veff)
                <input
                  className="css-input"
                  type="number"
                  step="0.1"
                  value={autoRange ? rMinUsed : p.r_min}
                  onChange={setNum("r_min")}
                  disabled={autoRange}
                />
              </label>

              <label className="field">
                r_max (Veff)
                <input
                  className="css-input"
                  type="number"
                  step="1"
                  value={autoRange ? rMaxUsed : p.r_max}
                  onChange={setNum("r_max")}
                  disabled={autoRange}
                />
              </label>

              <label className="field">
                Pontos Veff (n)
                <input className="css-input" type="number" step="100" value={p.n_veff} onChange={setNum("n_veff")} />
              </label>
            </div>
          </div>

          <button onClick={run} disabled={loading} className="click">
            {loading ? "Calculando..." : "Gerar Órbita"}
          </button>

          <div className="valor">
            φ_max = <strong>{phi_max.toFixed(3)}</strong> rad (turns = {p.turns}) | b = L/E =
            <strong> {Number.isFinite(b) ? b.toFixed(3) : "∞"}</strong>
            {p.particle === "massive" && (
              <> | Ē = <strong>{Number.isFinite(energyParam) ? energyParam.toFixed(3) : "—"}</strong></>
            )}
            {p.particle === "photon" && (
              <> | b_crit ≈ <strong>{bcrit.toFixed(3)}</strong></>
            )}
          </div>

          {err && <pre className="error">{err}</pre>}
        </div>
      </article>

      <article>
        <div className="programa" id="titulo2">
          <h5>Gráfico da Órbita</h5>
          <div className="graf1 plot-card">
            <Plot
              data={[
                {
                  x: xPlot,
                  y: yPlot,
                  type: "scatter",
                  mode: "lines",
                  name: "trajetória",
                  line: { color: plotTheme.accent, width: 2 },
                },
                {
                  x: Number.isFinite(x0) ? [x0] : [],
                  y: Number.isFinite(y0) ? [y0] : [],
                  type: "scatter",
                  mode: "markers",
                  name: "início",
                  marker: { size: 8, color: plotTheme.text },
                },
                {
                  x: Number.isFinite(xF) ? [xF] : [],
                  y: Number.isFinite(yF) ? [yF] : [],
                  type: "scatter",
                  mode: "markers",
                  name: "fim",
                  marker: { size: 9, symbol: "x", color: plotTheme.text },
                },
                {
                  x: [0],
                  y: [0],
                  type: "scatter",
                  mode: "markers",
                  name: "BH",
                  marker: { size: 10, color: plotTheme.text },
                },
              ]}
              layout={{
                ...baseLayout,
                title: "Trajetória (x,y)",
                xaxis: { title: "x", range: ranges?.xRange, ...axisBase },
                yaxis: { title: "y", scaleanchor: "x", range: ranges?.yRange, ...axisBase },
                hovermode: "closest",
                uirevision: "keep-zoom",
                shapes: [
                  {
                    type: "circle",
                    xref: "x",
                    yref: "y",
                    x0: -horizon,
                    y0: -horizon,
                    x1: horizon,
                    y1: horizon,
                    line: { width: 2, dash: "dot", color: plotTheme.accent },
                    fillcolor: plotTheme.horizonFill,
                  },
                  {
                    type: "circle",
                    xref: "x",
                    yref: "y",
                    x0: -photonSphere,
                    y0: -photonSphere,
                    x1: photonSphere,
                    y1: photonSphere,
                    line: { width: 1, dash: "dash", color: plotTheme.grid },
                  },
                ],
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%" }}
            />
          </div>

          {traj?.meta && (
            <div className="valor">
              points_returned: <strong>{traj.meta.points_returned}</strong> | captured:
              <strong> {String(traj.meta.captured)}</strong>
            </div>
          )}

          <p className="note">
            Horizonte (2M) sombreado; esfera de fótons (3M) tracejada; início/fim marcados.
          </p>
        </div>
      </article>

      <article>
        <div className="programa">
          <h5>Energia potencial efetiva</h5>
          <div className="graf1 plot-card">
            <Plot
              data={[
                {
                  x: veff?.r ?? [],
                  y: veff?.U_eff ?? veff?.V_eff2 ?? [],
                  type: "scatter",
                  mode: "lines",
                  name: "U_eff(r)",
                },
                {
                  x: veff?.r ?? [],
                  y: (veff?.r ?? []).map(() => energyParam),
                  type: "scatter",
                  mode: "lines",
                  name: energyLabel,
                },
                ...(critPoints.length
                  ? [{
                      x: critPoints.map((point) => point.r),
                      y: critPoints.map((point) => point.v),
                      type: "scatter",
                      mode: "markers",
                      name: "extremos",
                      marker: { size: 8, color: plotTheme.accent },
                    }]
                  : []),
              ]}
              layout={{
                ...baseLayout,
                title: "Energia potencial efetiva",
                xaxis: { title: "r", ...axisBase },
                yaxis: {
                  title: "U_eff",
                  ...axisBase,
                  range: p.particle === "massive"
                    ? [
                        -0.5,
                        (potentialStats?.vmax ?? 0) + 0.1,
                      ]
                    : undefined,
                },
                shapes: [
                  {
                    type: "line",
                    x0: horizon,
                    x1: horizon,
                    y0: 0,
                    y1: 1,
                    xref: "x",
                    yref: "paper",
                    line: { width: 2, dash: "dot", color: plotTheme.accent },
                  },
                  {
                    type: "line",
                    x0: photonSphere,
                    x1: photonSphere,
                    y0: 0,
                    y1: 1,
                    xref: "x",
                    yref: "paper",
                    line: { width: 1, dash: "dash", color: plotTheme.grid },
                  },
                ],
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%" }}
            />
          </div>

          {veff && (
            <div className="valor">
              potencial points: <strong>{veff.r?.length ?? 0}</strong>
              {veff.meta?.n ? <> | n: <strong>{veff.meta.n}</strong></> : null}
            </div>
          )}

          <p className="note">
            Se der “sem órbita”, normalmente é porque <strong>{energyLabel} &lt; U_eff(r0)</strong> (região proibida).
          </p>
        </div>
      </article>

      <article>
        <div className="programa">
          <h5>Buraco negro não comutativo (NCSBH)</h5>
          <p className="note">
            Modelo com massa efetiva m(r) espalhada por θ. Use θ &gt; 0 (unidades de L²).
          </p>
          <div className="input">
            <div className="input-grid">
              <label className="field">
                Tipo
                <select className="css-input" value={nc.particle} onChange={setNcStr("particle")}>
                  <option value="massive">Corpo massivo</option>
                  <option value="photon">Fóton</option>
                </select>
              </label>

              <label className="field">
                Massa (M)
                <input className="css-input" type="number" step="0.1" value={nc.M} onChange={setNcNum("M")} />
              </label>

              <label className="field">
                Parâmetro θ
                <input className="css-input" type="number" step="0.1" value={nc.theta} onChange={setNcNum("theta")} />
                <small>θ controla o espalhamento</small>
              </label>

              <label className="field">
                Energia (E)
                <input className="css-input" type="number" step="0.01" value={nc.E} onChange={setNcNum("E")} />
              </label>

              <label className="field">
                Momento angular (L)
                <input className="css-input" type="number" step="0.1" value={nc.L} onChange={setNcNum("L")} />
              </label>

              <label className="field">
                Raio inicial (r0)
                <input className="css-input" type="number" step="0.1" value={nc.r0} onChange={setNcNum("r0")} />
              </label>

              <label className="field">
                Direção radial
                <select className="css-input" value={nc.radial_sign} onChange={setNcStr("radial_sign")}>
                  <option value="in">in (cair)</option>
                  <option value="out">out (sair)</option>
                </select>
              </label>

              <label className="field">
                Voltas (1–20)
                <input className="css-input" type="number" min="1" max="20" step="1" value={nc.turns} onChange={setNcNum("turns")} />
              </label>

              <label className="field">
                Pontos da órbita (n)
                <input className="css-input" type="number" step="100" value={nc.n} onChange={setNcNum("n")} />
              </label>

              <label className="field">
                r_min (Veff)
                <input className="css-input" type="number" step="0.1" value={nc.r_min} onChange={setNcNum("r_min")} />
              </label>

              <label className="field">
                r_max (Veff)
                <input className="css-input" type="number" step="1" value={nc.r_max} onChange={setNcNum("r_max")} />
              </label>

              <label className="field">
                Pontos Veff (n)
                <input className="css-input" type="number" step="100" value={nc.n_veff} onChange={setNcNum("n_veff")} />
              </label>
            </div>
          </div>

          <button onClick={runNC} disabled={ncLoading} className="click">
            {ncLoading ? "Calculando..." : "Gerar Órbita NC"}
          </button>

          <div className="valor">
            φ_max = <strong>{ncPhiMax.toFixed(3)}</strong> rad (turns = {nc.turns}) | b = L/E =
            <strong> {Number.isFinite(ncB) ? ncB.toFixed(3) : "∞"}</strong>
          </div>

          {ncErr && <pre className="error">{ncErr}</pre>}
        </div>
      </article>

      <article>
        <div className="programa">
          <h5>Órbita não comutativa</h5>
          <div className="graf1 plot-card">
            <Plot
              data={[
                {
                  x: ncXPlot,
                  y: ncYPlot,
                  type: "scatter",
                  mode: "lines",
                  name: "trajetória",
                  line: { color: plotTheme.accent, width: 2 },
                },
                {
                  x: Number.isFinite(ncX0) ? [ncX0] : [],
                  y: Number.isFinite(ncY0) ? [ncY0] : [],
                  type: "scatter",
                  mode: "markers",
                  name: "início",
                  marker: { size: 8, color: plotTheme.text },
                },
                {
                  x: Number.isFinite(ncXF) ? [ncXF] : [],
                  y: Number.isFinite(ncYF) ? [ncYF] : [],
                  type: "scatter",
                  mode: "markers",
                  name: "fim",
                  marker: { size: 9, symbol: "x", color: plotTheme.text },
                },
                {
                  x: [0],
                  y: [0],
                  type: "scatter",
                  mode: "markers",
                  name: "BH",
                  marker: { size: 10, color: plotTheme.text },
                },
              ]}
              layout={{
                ...baseLayout,
                title: "Trajetória (x,y) — NC",
                xaxis: { title: "x", range: ncRanges?.xRange, ...axisBase },
                yaxis: { title: "y", scaleanchor: "x", range: ncRanges?.yRange, ...axisBase },
                hovermode: "closest",
                uirevision: "keep-zoom",
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%" }}
            />
          </div>

          {ncTraj?.meta && (
            <div className="valor">
              points_returned: <strong>{ncTraj.meta.points_returned}</strong>
            </div>
          )}
        </div>
      </article>

      <article>
        <div className="programa">
          <h5>Potencial efetivo (NC)</h5>
          <div className="graf1 plot-card">
            <Plot
              data={[
                {
                  x: ncVeff?.r ?? [],
                  y: ncVeff?.V_eff2 ?? [],
                  type: "scatter",
                  mode: "lines",
                  name: "V_eff²(r)",
                },
                {
                  x: ncVeff?.r ?? [],
                  y: (ncVeff?.r ?? []).map(() => ncE2),
                  type: "scatter",
                  mode: "lines",
                  name: "E²",
                },
              ]}
              layout={{
                ...baseLayout,
                title: "Potencial efetivo (NCSBH)",
                xaxis: { title: "r", ...axisBase },
                yaxis: { title: "V_eff²", ...axisBase },
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: "100%" }}
            />
          </div>

          {ncVeff && (
            <div className="valor">
              potencial points: <strong>{ncVeff.r?.length ?? 0}</strong>
              {ncVeff.meta?.n ? <> | n: <strong>{ncVeff.meta.n}</strong></> : null}
            </div>
          )}

          <p className="note">
            Para órbitas reais, precisa <strong>E² ≥ V_eff²(r)</strong>.
          </p>
        </div>
      </article>
    </div>
  );
}
