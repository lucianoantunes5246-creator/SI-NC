import numpy as np

def f_schwarzschild(r: np.ndarray, M: float) -> np.ndarray:
    return 1.0 - (2.0 * M) / r

def veff2_schwarzschild(r: np.ndarray, M: float, E: float, L: float, particle: str) -> np.ndarray:
    """
    Retorna V_eff^2 na forma compatível com a equação radial:

    Massive (timelike):
      (dr/dτ)^2 + V_eff^2(r) = E^2
      V_eff^2 = f(r) * (1 + L^2/r^2)

    Photon (null):
      (dr/dλ)^2 + V_eff^2(r) = E^2
      V_eff^2 = f(r) * (L^2/r^2)
      e b = L/E
    """
    f = f_schwarzschild(r, M)
    L2_over_r2 = (L * L) / (r * r)

    if particle == "massive":
        return f * (1.0 + L2_over_r2)
    if particle == "photon":
        return f * L2_over_r2

    raise ValueError("particle deve ser 'massive' ou 'photon'")
