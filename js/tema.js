/**
 * Tema claro/oscuro (Checkpoint 9). Se carga en el <head> de cada página,
 * antes de pintar nada, para que no haya un destello del tema equivocado.
 *
 * - Si nunca elegiste, sigue al del sistema (y cambia si el sistema cambia).
 * - Si elegiste con el botón, queda recordado en este dispositivo
 *   (localStorage "kodama.tema": "claro" | "oscuro").
 *
 * También decide, antes de pintar, si esta es la PRIMERA pantalla de la
 * sesión (abrir la app): ahí va la pantalla de arranque (js/ui/carga.js),
 * sobre marino desde el primer cuadro, igual que la bienvenida de Android,
 * y la barra del sistema también en marino. Al moverse entre pantallas no
 * se repite (sessionStorage "kodama.arranque").
 */
const KodamaTema = (function () {
  const CLAVE = 'kodama.tema';
  const COLOR_BARRA = { claro: '#F5F1E8', oscuro: '#070F28' };
  const MARINO = '#071743';
  const CLAVE_ARRANQUE = 'kodama.arranque';

  function primeraDeLaSesion() {
    try {
      if (sessionStorage.getItem(CLAVE_ARRANQUE)) return false;
      sessionStorage.setItem(CLAVE_ARRANQUE, '1');
      return true;
    } catch (err) {
      return true; // sin sessionStorage: se muestra (igual nunca demora nada)
    }
  }
  const sistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function guardado() {
    try {
      const v = localStorage.getItem(CLAVE);
      return v === 'claro' || v === 'oscuro' ? v : null;
    } catch (err) {
      return null;
    }
  }

  function actual() {
    return guardado() || (sistema && sistema.matches ? 'oscuro' : 'claro');
  }

  function aplicar() {
    const tema = actual();
    document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    const arrancando = document.documentElement.dataset.arranque === 'si';
    if (meta) meta.setAttribute('content', arrancando ? MARINO : COLOR_BARRA[tema]);
    document.querySelectorAll('.boton-tema').forEach(pintarBoton);
  }

  function pintarBoton(boton) {
    const oscuro = actual() === 'oscuro';
    // El botón dice a qué tema pasa, con ícono y texto (nunca solo el ícono).
    boton.textContent = oscuro ? '☀ Claro' : '☾ Oscuro';
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  }

  function alternar() {
    try {
      localStorage.setItem(CLAVE, actual() === 'oscuro' ? 'claro' : 'oscuro');
    } catch (err) {
      // Sin almacenamiento: cambia solo mientras la página esté abierta.
      document.documentElement.dataset.theme = actual() === 'oscuro' ? 'light' : 'dark';
      return;
    }
    aplicar();
  }

  if (primeraDeLaSesion()) document.documentElement.dataset.arranque = 'si';
  aplicar();
  if (sistema && sistema.addEventListener) {
    sistema.addEventListener('change', function () { if (!guardado()) aplicar(); });
  }
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.boton-tema').forEach(function (boton) {
      pintarBoton(boton);
      boton.addEventListener('click', alternar);
    });
  });

  return { actual: actual, alternar: alternar, aplicar: aplicar };
})();
