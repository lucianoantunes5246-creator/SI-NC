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

def _erf_approx(x: np.ndarray) -> np.ndarray:
    # Abramowitz & Stegun 7.1.26 approximation (vectorized)
    p = 0.3275911
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    sign = np.sign(x)
    ax = np.abs(x)
    t = 1.0 / (1.0 + p * ax)
    y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * np.exp(-ax * ax))
    return sign * y

def _lower_gamma_3half(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, None)
    sqrt_x = np.sqrt(x)
    return 0.5 * np.sqrt(np.pi) * _erf_approx(sqrt_x) - sqrt_x * np.exp(-x)

def f_nc_schwarzschild(r: np.ndarray, M: float, theta: float) -> np.ndarray:
    x = (r * r) / (4.0 * theta)
    m = (2.0 * M / np.sqrt(np.pi)) * _lower_gamma_3half(x)
    return 1.0 - (2.0 * m) / r

def veff2_nc_schwarzschild(r: np.ndarray, M: float, theta: float, L: float, particle: str) -> np.ndarray:
    f = f_nc_schwarzschild(r, M, theta)
    L2_over_r2 = (L * L) / (r * r)
    if particle == "massive":
        return f * (1.0 + L2_over_r2)
    if particle == "photon":
        return f * L2_over_r2
    raise ValueError("particle deve ser 'massive' ou 'photon'")

def ueff_schwarzschild(r: np.ndarray, M: float, L: float, particle: str) -> np.ndarray:
    """
    Energia potencial efetiva U_eff na forma:
      (L^2/2) (du/dφ)^2 + U_eff(u) = (E^2 - 1)/2   (massivo)
      (du/dφ)^2 + U_eff(u) = 1/b^2               (fóton)
    com u = 1/r e unidades G=c=1.
    """
    u = 1.0 / r
    if particle == "massive":
        return (-M * u) + 0.5 * (L * L) * (u * u) - (M * L * L) * (u * u * u)
    if particle == "photon":
        return (u * u) - 2.0 * M * (u * u * u)
    raise ValueError("particle deve ser 'massive' ou 'photon'")
