/**
 * El atractor de Lorenz, calculado con sus ecuaciones (Checkpoint 10). Lógica
 * pura, sin DOM, con pruebas: la usa la pantalla de carga (js/ui/carga.js).
 *
 *   dx/dt = σ (y − x)      dy/dt = x (ρ − z) − y      dz/dt = x y − β z
 *   con σ = 10, ρ = 28, β = 8/3 (los valores clásicos, los del "efecto mariposa").
 *
 * Se integra con Runge-Kutta de orden 4 (más preciso que sumar la derivada
 * a mano, y estable con pasos chicos).
 */
const KodamaLorenz = (function () {
  const SIGMA = 10;
  const RHO = 28;
  const BETA = 8 / 3;
  // La "mariposa" es la vista del plano x–z; se gira un poco para que se
  // parezca a la del símbolo, con las alas en diagonal.
  const GIRO = -20 * Math.PI / 180;

  function derivada(p) {
    return [SIGMA * (p[1] - p[0]), p[0] * (RHO - p[2]) - p[1], p[0] * p[1] - BETA * p[2]];
  }

  function sumar(p, k, f) {
    return [p[0] + k[0] * f, p[1] + k[1] * f, p[2] + k[2] * f];
  }

  /** Un paso de Runge-Kutta 4 de largo dt. */
  function paso(p, dt) {
    const k1 = derivada(p);
    const k2 = derivada(sumar(p, k1, dt / 2));
    const k3 = derivada(sumar(p, k2, dt / 2));
    const k4 = derivada(sumar(p, k3, dt));
    return [0, 1, 2].map(function (i) {
      return p[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    });
  }

  /** Un punto inicial al azar cerca del atractor: cada carga arranca distinta. */
  function puntoInicial(azar) {
    const r = azar || Math.random;
    return [-15 + 30 * r(), -20 + 40 * r(), 5 + 35 * r()];
  }

  /** Del espacio (x, y, z) al plano: x a lo ancho, z hacia arriba, centrado y girado. */
  function proyectar(p) {
    const x = p[0];
    const y = -(p[2] - 25);
    return [x * Math.cos(GIRO) - y * Math.sin(GIRO), x * Math.sin(GIRO) + y * Math.cos(GIRO)];
  }

  /** n puntos de la trayectoria desde "inicio" (para dibujarla de una, sin animación). */
  function trayectoria(inicio, n, dt) {
    const puntos = [];
    let p = inicio;
    for (let i = 0; i < n; i++) {
      p = paso(p, dt);
      puntos.push(p);
    }
    return puntos;
  }

  return { paso: paso, puntoInicial: puntoInicial, proyectar: proyectar, trayectoria: trayectoria, derivada: derivada };
})();
