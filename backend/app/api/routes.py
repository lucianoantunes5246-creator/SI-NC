import numpy as np
from fastapi import APIRouter, HTTPException

from app.schemas import (
    VeffRequest,
    VeffResponse,
    SimulateRequest,
    SimulateResponse,
    VeffNCRequest,
    VeffNCResponse,
    SimulateNCRequest,
    SimulateNCResponse,
)
from app.core.observables import veff2_schwarzschild, ueff_schwarzschild, veff2_nc_schwarzschild
from app.core.geodesics import orbit_u_phi, orbit_r_phi_nc

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/veff", response_model=VeffResponse)
def veff(req: VeffRequest):
    r_h = 2.0 * req.M
    if req.r_min <= r_h:
        raise HTTPException(status_code=400, detail=f"r_min deve ser > 2M. 2M={r_h:.6g}")

    r = np.linspace(req.r_min, req.r_max, req.n, dtype=np.float64)

    V2 = veff2_schwarzschild(r=r, M=req.M, E=req.E, L=req.L, particle=req.particle)
    U = ueff_schwarzschild(r=r, M=req.M, L=req.L, particle=req.particle)

    return VeffResponse(
        r=r.tolist(),
        U_eff=U.tolist(),
        V_eff2=V2.tolist(),
        meta={
            "metric": req.metric,
            "particle": req.particle,
            "M": req.M,
            "E": req.E,
            "L": req.L,
            "b": (req.L / req.E) if req.E != 0 else None,
            "E2": req.E * req.E,
            "r_horizon": r_h,
            "photon_sphere": 3.0 * req.M,
            "n": req.n,
        },
    )

@router.post("/veff_nc", response_model=VeffNCResponse)
def veff_nc(req: VeffNCRequest):
    r = np.linspace(req.r_min, req.r_max, req.n, dtype=np.float64)
    V2 = veff2_nc_schwarzschild(r=r, M=req.M, theta=req.theta, L=req.L, particle=req.particle)

    return VeffNCResponse(
        r=r.tolist(),
        V_eff2=V2.tolist(),
        meta={
            "metric": req.metric,
            "particle": req.particle,
            "M": req.M,
            "theta": req.theta,
            "E": req.E,
            "L": req.L,
            "b": (req.L / req.E) if req.E != 0 else None,
            "E2": req.E * req.E,
            "n": req.n,
        },
    )

@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    r_h = 2.0 * req.M
    if req.r0 <= r_h:
        raise HTTPException(status_code=400, detail=f"r0 deve ser > 2M. 2M={r_h:.6g}")

    try:
        phi, r = orbit_u_phi(
            M=req.M,
            L=req.L,
            r0=req.r0,
            E=req.E,
            radial_sign=req.radial_sign,
            phi_max=req.phi_max,
            n=req.n,
            particle=req.particle,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    x = r * np.cos(phi)
    y = r * np.sin(phi)

    valid = np.isfinite(r) & np.isfinite(x) & np.isfinite(y)
    if not np.all(valid):
        first_invalid = int(np.argmax(~valid))
        phi = phi[:first_invalid]
        r = r[:first_invalid]
        x = x[:first_invalid]
        y = y[:first_invalid]

    captured = bool(len(r) > 0 and np.min(r) <= (r_h * 1.0005))

    return SimulateResponse(
        phi=phi.tolist(),
        r=r.tolist(),
        x=x.tolist(),
        y=y.tolist(),
        meta={
            "metric": req.metric,
            "particle": req.particle,
            "M": req.M,
            "E": req.E,
            "E2": req.E * req.E,
            "L": req.L,
            "b": (req.L / req.E) if req.E != 0 else None,
            "r0": req.r0,
            "radial_sign": req.radial_sign,
            "phi_max": req.phi_max,
            "n": req.n,
            "r_horizon": r_h,
            "photon_sphere": 3.0 * req.M,
            "captured": captured,
            "points_returned": int(len(r)),
        },
    )

@router.post("/simulate_nc", response_model=SimulateNCResponse)
def simulate_nc(req: SimulateNCRequest):
    try:
        phi, r = orbit_r_phi_nc(
            M=req.M,
            theta=req.theta,
            L=req.L,
            r0=req.r0,
            E=req.E,
            radial_sign=req.radial_sign,
            phi_max=req.phi_max,
            n=req.n,
            particle=req.particle,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    x = r * np.cos(phi)
    y = r * np.sin(phi)

    valid = np.isfinite(r) & np.isfinite(x) & np.isfinite(y)
    if not np.all(valid):
        first_invalid = int(np.argmax(~valid))
        phi = phi[:first_invalid]
        r = r[:first_invalid]
        x = x[:first_invalid]
        y = y[:first_invalid]

    return SimulateNCResponse(
        phi=phi.tolist(),
        r=r.tolist(),
        x=x.tolist(),
        y=y.tolist(),
        meta={
            "metric": req.metric,
            "particle": req.particle,
            "M": req.M,
            "theta": req.theta,
            "E": req.E,
            "E2": req.E * req.E,
            "L": req.L,
            "b": (req.L / req.E) if req.E != 0 else None,
            "r0": req.r0,
            "radial_sign": req.radial_sign,
            "phi_max": req.phi_max,
            "n": req.n,
            "points_returned": int(len(r)),
        },
    )
