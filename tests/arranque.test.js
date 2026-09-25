'use strict';

/**
 * Pantalla de arranque: cuándo aparece (solo la primera pantalla de la
 * sesión, decidido en el <head> por js/tema.js), sus fases, cómo se
 * asienta el trazo sobre el logo, que el marino sea el de la bienvenida de
 * Android y que el símbolo tenga marcadas las partes que se animan.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = (archivo) => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');

function cargarCarga() {
  const entorno = { console, Math };
  vm.createContext(entorno);
  vm.runInContext(leer('js/ui/carga.js'), entorno, { filename: 'js/ui/carga.js' });
  return (expresion) => JSON.parse(JSON.stringify(vm.runInContext(expresion, entorno)));
}

/** js/tema.js con un <head> falso; la sesión se comparte entre "páginas". */
function abrirPagina(sesion) {
  const meta = { content: '', setAttribute(k, v) { this[k] = v; } };
  const html = { dataset: {} };
  const entorno = {
    console,
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: sesion,
    document: {
      documentElement: html,
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
      querySelectorAll: () => [],
      addEventListener() {}
    }
  };
  vm.createContext(entorno);
  vm.runInContext(leer('js/tema.js'), entorno, { filename: 'js/tema.js' });
  return { html, meta };
}

function sesionNueva() {
  const datos = {};
  return { getItem: (k) => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); } };
}

test('solo la primera pantalla de la sesión lleva el arranque (y la barra del sistema en marino)', () => {
  const sesion = sesionNueva();
  const primera = abrirPagina(sesion);
  assert.strictEqual(primera.html.dataset.arranque, 'si');
  assert.strictEqual(primera.meta.content, '#071743');
  const segunda = abrirPagina(sesion);
  assert.strictEqual(segunda.html.dataset.arranque, undefined, 'moverse entre pantallas no lo repite');
  assert.strictEqual(segunda.meta.content, '#F5F1E8', 'barra del tema claro');
  const otraSesion = abrirPagina(sesionNueva());
  assert.strictEqual(otraSesion.html.dataset.arranque, 'si', 'abrir la app de nuevo sí');
});

test('sin sessionStorage igual se muestra (nunca demora nada)', () => {
  const bloqueada = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.strictEqual(abrirPagina(bloqueada).html.dataset.arranque, 'si');
});

test('fases: atractor, asentar, circunferencia, palabra, quieto', () => {
  const ej = cargarCarga();
  const T = ej('KodamaCarga.TIEMPOS');
  assert.ok(T.asentar < T.circulo && T.circulo < T.palabra && T.palabra < T.fin);
  assert.ok(T.fin <= 3000, 'la secuencia completa dura como mucho 3 s');
  assert.strictEqual(ej('KodamaCarga.fase(0)'), 'atractor');
  assert.strictEqual(ej('KodamaCarga.fase(' + T.asentar + ')'), 'asentar');
  assert.strictEqual(ej('KodamaCarga.fase(' + T.circulo + ')'), 'circulo');
  assert.strictEqual(ej('KodamaCarga.fase(' + T.palabra + ')'), 'palabra');
  assert.strictEqual(ej('KodamaCarga.fase(' + (T.fin + 1) + ')'), 'quieto');
});

test('suavizar: de 0 a 1, sin pasarse, siempre avanzando', () => {
  const ej = cargarCarga();
  const valores = ej('[-1, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 2].map(KodamaCarga.suavizar)');
  assert.deepStrictEqual([valores[0], valores[1], valores[4], valores[7], valores[8]], [0, 0, 0.5, 1, 1]);
  for (let i = 1; i < valores.length; i++) assert.ok(valores[i] >= valores[i - 1]);
});

test('asentarse: el trazo queda centrado sobre el atractor del logo, entero y sin deformarse', () => {
  const ej = cargarCarga();
  const trazo = { x: 40, y: 200, w: 300, h: 400 };
  const logo = { x: 120, y: 300, w: 150, h: 100 };
  const a = ej('KodamaCarga.ajuste(' + JSON.stringify(trazo) + ', ' + JSON.stringify(logo) + ')');
  assert.strictEqual(a.k, 0.25, 'la escala que entra en los dos sentidos');
  const centro = [(trazo.x + trazo.w / 2) * a.k + a.tx, (trazo.y + trazo.h / 2) * a.k + a.ty];
  assert.deepStrictEqual(centro, [logo.x + logo.w / 2, logo.y + logo.h / 2]);
  assert.ok(trazo.w * a.k <= logo.w && trazo.h * a.k <= logo.h);
});

test('el marino del arranque es el de la bienvenida de Android', () => {
  const manifest = JSON.parse(leer('manifest.webmanifest'));
  const css = leer('css/styles.css');
  assert.strictEqual(manifest.background_color, '#071743');
  assert.match(css, /--marino: #071743;/);
  assert.match(/\.carga \{([^}]*)\}/.exec(css)[1], /background: var\(--marino\)/);
  assert.match(css, /html\[data-arranque="si"\] body \{\s*background: var\(--marino\)/,
    'la página también, desde el primer cuadro (sin destello de otro color)');
});

test('el símbolo marca lo que se anima: circunferencia, línea, atractor y los 3 puntos (uno por esfera)', () => {
  const svg = leer('icons/simbolo.svg');
  const cuenta = (parte) => (svg.match(new RegExp('data-parte="' + parte + '"', 'g')) || []).length;
  assert.strictEqual(cuenta('circulo'), 1);
  assert.strictEqual(cuenta('linea'), 1);
  assert.ok(cuenta('atractor') >= 8);
  assert.strictEqual(cuenta('punto'), 3);
  assert.strictEqual(cuenta('punto'), (leer('js/ui/carga.js').match(/velocidad:/g) || []).length, 'tres esferas, tres puntos');
});

test('todas las pantallas tienen el arranque antes del encabezado, y Configuración lo suelta enseguida', () => {
  ['index.html', 'horario.html', 'alumnos.html', 'cobros.html', 'estadisticas.html', 'config.html'].forEach((pagina) => {
    const html = leer(pagina);
    const i = html.indexOf('id="carga"');
    assert.ok(i !== -1 && i < html.indexOf('<header'), pagina + ': #carga antes del encabezado');
    assert.match(html, /<script src="js\/lorenz.js"><\/script>\s*<script src="js\/ui\/carga.js"><\/script>/, pagina);
  });
  assert.match(leer('js/config.js'), /KodamaCarga\.listo\(\);\s*$/);
});
