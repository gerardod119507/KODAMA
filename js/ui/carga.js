/**
 * Pantalla de carga (Checkpoint 10): el atractor de Lorenz dibujándose en
 * tiempo real, con tres esferas que recorren la trayectoria a distinta
 * velocidad, cada una con su estela. Canvas propio, sin librerías.
 *
 * - Cada carga arranca de un punto inicial al azar: nunca se ve igual.
 * - Con "reducir movimiento" (prefers-reduced-motion) se dibuja la figura
 *   entera de una vez, quieta.
 * - No demora la app: la página llama a KodamaCarga.listo() apenas tiene
 *   algo que mostrar (si ya estaba guardado, es enseguida) y se desvanece.
 *   Por las dudas, se va sola a los 8 segundos.
 */
const KodamaCarga = (function () {
  const raiz = document.getElementById('carga');
  if (!raiz) return { listo: function () {} };

  const lienzo = raiz.querySelector('canvas');
  const ctx = lienzo.getContext('2d');
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const estilo = getComputedStyle(document.documentElement);
  const tinta = estilo.getPropertyValue('--fg').trim() || '#071743';
  const fondo = estilo.getPropertyValue('--bg').trim() || '#F5F1E8';

  const DT = 0.008;
  const PASOS_POR_CUADRO = 18; // en ~2 s ya se ven las dos alas
  const MAX_PUNTOS = 6000;
  const LARGO_ESTELA = 70;

  let ancho = 0;
  let alto = 0;
  let escala = 1;
  let trazo = null; // lienzo aparte con la trayectoria ya dibujada (no se redibuja)
  let tctx = null;
  let estado = KodamaLorenz.puntoInicial();
  const puntos = []; // en pantalla
  // Tres esferas, cada una a su velocidad (puntos de la trayectoria por cuadro).
  const esferas = [
    { i: 0, velocidad: 6, radio: 4.5 },
    { i: 0, velocidad: 9.5, radio: 3.5 },
    { i: 0, velocidad: 14, radio: 2.8 }
  ];
  let cuadro = null;
  let terminado = false;

  function medir() {
    const dpr = window.devicePixelRatio || 1;
    ancho = window.innerWidth;
    alto = window.innerHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trazo = document.createElement('canvas');
    trazo.width = lienzo.width;
    trazo.height = lienzo.height;
    tctx = trazo.getContext('2d');
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.strokeStyle = tinta;
    tctx.lineWidth = 0.8;
    tctx.globalAlpha = 0.45;
    escala = Math.min(ancho, alto) * 0.44 / 30;
  }

  function aPantalla(p) {
    const q = KodamaLorenz.proyectar(p);
    return [ancho / 2 + q[0] * escala, alto / 2 + q[1] * escala];
  }

  function avanzarTrazo(pasos) {
    tctx.beginPath();
    let anterior = puntos[puntos.length - 1];
    if (anterior) tctx.moveTo(anterior[0], anterior[1]);
    for (let k = 0; k < pasos && puntos.length < MAX_PUNTOS; k++) {
      estado = KodamaLorenz.paso(estado, DT);
      const s = aPantalla(estado);
      if (anterior) tctx.lineTo(s[0], s[1]); else tctx.moveTo(s[0], s[1]);
      puntos.push(s);
      anterior = s;
    }
    tctx.stroke();
  }

  function dibujarEsfera(e, conEstela) {
    const n = puntos.length;
    if (n < 2) return;
    const i = Math.floor(e.i);
    if (conEstela) {
      // Estela: los últimos tramos, cada vez más transparentes.
      for (let k = 1; k < LARGO_ESTELA && i - k >= 0; k += 2) {
        const a = puntos[i - k + 1];
        const b = puntos[Math.max(0, i - k - 1)];
        ctx.globalAlpha = 0.55 * (1 - k / LARGO_ESTELA);
        ctx.lineWidth = e.radio * 0.9 * (1 - k / LARGO_ESTELA) + 0.4;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    // La esfera: un brillo del color del fondo hacia la tinta, para que se vea redonda.
    const p = puntos[Math.min(i, n - 1)];
    const g = ctx.createRadialGradient(p[0] - e.radio / 3, p[1] - e.radio / 3, e.radio / 5, p[0], p[1], e.radio);
    g.addColorStop(0, fondo);
    g.addColorStop(0.35, tinta);
    g.addColorStop(1, tinta);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p[0], p[1], e.radio, 0, 2 * Math.PI);
    ctx.fill();
  }

  function pintar(conEstela) {
    ctx.clearRect(0, 0, ancho, alto);
    ctx.globalAlpha = 1;
    ctx.drawImage(trazo, 0, 0, ancho, alto);
    ctx.strokeStyle = tinta;
    ctx.lineCap = 'round';
    esferas.forEach(function (e) { dibujarEsfera(e, conEstela); });
  }

  function animar() {
    if (terminado) return;
    avanzarTrazo(PASOS_POR_CUADRO);
    // Las esferas recorren lo ya dibujado; al llegar a la punta vuelven al inicio.
    esferas.forEach(function (e) {
      e.i += e.velocidad;
      if (e.i >= puntos.length - 1) e.i = e.i % Math.max(1, puntos.length - 1);
    });
    pintar(true);
    cuadro = requestAnimationFrame(animar);
  }

  function listo() {
    if (terminado) return;
    terminado = true;
    if (cuadro) cancelAnimationFrame(cuadro);
    raiz.classList.add('carga--fuera');
    setTimeout(function () { raiz.hidden = true; }, quieto ? 0 : 260);
  }

  medir();
  if (quieto) {
    // Figura estática: la trayectoria completa y las tres esferas en su lugar.
    avanzarTrazo(MAX_PUNTOS);
    esferas.forEach(function (e, k) { e.i = Math.floor(puntos.length * (0.3 + 0.25 * k)); });
    pintar(false);
  } else {
    // Las esferas arrancan escalonadas, así no salen las tres juntas.
    esferas.forEach(function (e, k) { e.i = k * 7; });
    cuadro = requestAnimationFrame(animar);
  }
  setTimeout(listo, 8000);

  return { listo: listo };
})();
