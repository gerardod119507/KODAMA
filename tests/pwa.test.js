'use strict';

/**
 * Checkpoint 9: la PWA. Que el service worker guarde TODOS los archivos que
 * usan las páginas (si falta uno, esa pantalla no abre sin conexión), que
 * todo lo que lista exista, y que el manifest tenga lo que pide Android/iOS.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PAGINAS = ['index.html', 'horario.html', 'alumnos.html', 'config.html', 'cobros.html', 'estadisticas.html'];

function listaDelServiceWorker() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const bloque = /const ARCHIVOS = \[([\s\S]*?)\];/.exec(codigo)[1];
  return bloque.match(/'[^']+'/g).map((s) => s.slice(1, -1).replace(/^\.\//, ''));
}

test('cada script, estilo e ícono que usa una página está guardado para usar sin conexión', () => {
  const guardados = listaDelServiceWorker();
  PAGINAS.forEach((pagina) => {
    assert.ok(guardados.includes(pagina), pagina + ' no está en sw.js');
    const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
    const usados = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1])
      .filter((ref) => !ref.endsWith('.html'));
    usados.forEach((ref) => assert.ok(guardados.includes(ref), pagina + ' usa ' + ref + ', que falta en sw.js'));
  });
});

test('todo lo que lista el service worker existe', () => {
  listaDelServiceWorker().filter(Boolean).forEach((archivo) => {
    assert.ok(fs.existsSync(path.join(RAIZ, archivo)), 'no existe ' + archivo);
  });
});

test('el manifest: nombre, pantalla completa, colores de la paleta e íconos 192/512/maskable que existen', () => {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.name, 'KODAMA');
  assert.strictEqual(m.display, 'standalone');
  assert.strictEqual(m.start_url, './index.html');
  assert.strictEqual(m.background_color, '#F5F1E8');
  assert.strictEqual(m.theme_color, '#16372B');
  const tamanios = m.icons.map((i) => i.sizes + (i.purpose ? ' ' + i.purpose : ''));
  ['192x192', '512x512', '512x512 maskable'].forEach((t) => assert.ok(tamanios.includes(t), 'falta ícono ' + t));
  m.icons.forEach((i) => assert.ok(fs.existsSync(path.join(RAIZ, i.src)), 'no existe ' + i.src));
});

test('todas las páginas tienen manifest, tema temprano y registran el service worker', () => {
  PAGINAS.forEach((pagina) => {
    const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest"/, pagina);
    const cabeza = html.split('</head>')[0];
    assert.match(cabeza, /<script src="js\/tema.js"><\/script>/, pagina + ': el tema se aplica en el <head>, antes de pintar');
    assert.match(html, /<script src="js\/pwa.js"><\/script>/, pagina);
    assert.match(html, /class="boton-tema/, pagina + ': botón de tema');
  });
});
