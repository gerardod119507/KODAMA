'use strict';

/**
 * Navegación minimalista: arriba solo logo, fecha y tema; abajo (celular)
 * Día, Semana, Alumnos y Más; "Más" con Horario, Cobros, Estadísticas y
 * Configuración. Qué destino queda activo en cada pantalla, que todas las
 * páginas carguen la navegación igual y respeten el área segura.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const PAGINAS = {
  'index.html': 'inicio',
  'horario.html': 'horario',
  'alumnos.html': 'alumnos',
  'cobros.html': 'cobros',
  'estadisticas.html': 'estadisticas',
  'config.html': 'config'
};

function cargar(archivos) {
  const entorno = { console };
  vm.createContext(entorno);
  archivos.forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), 'utf8'), entorno, { filename: archivo });
  });
  return (expresion) => JSON.parse(JSON.stringify(vm.runInContext(expresion, entorno)));
}

const leer = (pagina) => fs.readFileSync(path.join(RAIZ, pagina), 'utf8');

test('los destinos: abajo Día, Semana, Alumnos (+ Más); en Más, Horario, Cobros, Estadísticas y Configuración', () => {
  const ej = cargar(['js/ui/navegacion.js']);
  assert.deepStrictEqual(ej('KodamaNavegacion.PRINCIPALES.map((d) => d.nombre)'), ['Día', 'Semana', 'Alumnos']);
  assert.deepStrictEqual(ej('KodamaNavegacion.MAS.map((d) => d.nombre)'), ['Horario', 'Cobros', 'Estadísticas', 'Configuración']);
  const todos = ej('KodamaNavegacion.PRINCIPALES.concat(KodamaNavegacion.MAS)');
  const iconos = ej('Object.keys(KodamaNavegacion.ICONOS)');
  todos.forEach((d) => {
    assert.ok(iconos.includes(d.id), 'falta el ícono de ' + d.nombre);
    assert.ok(fs.existsSync(path.join(RAIZ, d.href.split('#')[0])), d.href + ' no existe');
  });
  assert.ok(iconos.includes('mas'));
});

test('qué queda activo: en la principal, el modo; en las demás, la página (las de "Más" encienden "Más")', () => {
  const ej = cargar(['js/ui/navegacion.js']);
  assert.strictEqual(ej('KodamaNavegacion.activo("inicio", "semana")'), 'semana');
  assert.strictEqual(ej('KodamaNavegacion.activo("inicio", "dia")'), 'dia');
  assert.strictEqual(ej('KodamaNavegacion.activo("inicio", null)'), 'dia');
  assert.strictEqual(ej('KodamaNavegacion.activo("alumnos", "semana")'), 'alumnos');
  ['horario', 'cobros', 'estadisticas', 'config'].forEach((p) => {
    assert.strictEqual(ej('KodamaNavegacion.estaEnMas("' + p + '")'), true, p);
  });
  ['dia', 'semana', 'alumnos'].forEach((p) => {
    assert.strictEqual(ej('KodamaNavegacion.estaEnMas("' + p + '")'), false, p);
  });
});

test('index.html#semana / #dia eligen el modo; otra cosa no', () => {
  const ej = cargar(['js/vista.js']);
  assert.strictEqual(ej('KodamaVista.desdeHash("#semana")'), 'semana');
  assert.strictEqual(ej('KodamaVista.desdeHash("#dia")'), 'dia');
  assert.strictEqual(ej('KodamaVista.desdeHash("")'), null);
  assert.strictEqual(ej('KodamaVista.desdeHash("#mes")'), null);
});

test('cada página: encabezado con solo logo, fecha y tema; la navegación se carga justo después', () => {
  Object.keys(PAGINAS).forEach((pagina) => {
    const html = leer(pagina);
    assert.match(html, new RegExp('<body data-pagina="' + PAGINAS[pagina] + '">'), pagina);
    const cabecera = /<header class="cabecera">([\s\S]*?)<\/header>/.exec(html)[1];
    const enlaces = cabecera.match(/<a /g) || [];
    assert.strictEqual(enlaces.length, 1, pagina + ': el único enlace arriba es el logo');
    assert.match(cabecera, /class="logo" href="index.html"/, pagina);
    assert.match(cabecera, /class="cabecera__fecha"/, pagina);
    assert.match(cabecera, /class="boton-tema/, pagina);
    assert.doesNotMatch(cabecera, /<nav/, pagina + ': sin menú en el HTML del encabezado');
    assert.match(html, /<\/header>\s*<script src="js\/ui\/navegacion.js"><\/script>/, pagina + ': navegación justo después del encabezado');
    assert.doesNotMatch(html, /enlaces-cabecera|selector-vista|id="modo-dia"/, pagina + ': restos del menú viejo');
  });
});

test('la principal muestra el día o la semana vista; las demás, la fecha de hoy y su título', () => {
  const index = /<header class="cabecera">([\s\S]*?)<\/header>/.exec(leer('index.html'))[1];
  assert.match(index, /id="fecha"/);
  assert.match(index, /id="actualizando"/);
  Object.keys(PAGINAS).filter((p) => p !== 'index.html').forEach((pagina) => {
    const html = leer(pagina);
    assert.match(html, /data-fecha-hoy/, pagina);
    assert.match(html, /<main[^>]*>\s*<h1 class="titulo-pagina">/, pagina + ': título de la pantalla');
  });
});

test('área segura: viewport-fit=cover en todas y la barra/el encabezado usan env(safe-area-inset-*)', () => {
  Object.keys(PAGINAS).forEach((pagina) => {
    assert.match(leer(pagina), /name="viewport" content="[^"]*viewport-fit=cover/, pagina);
  });
  const css = fs.readFileSync(path.join(RAIZ, 'css', 'styles.css'), 'utf8');
  const regla = (selector) => new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css)[1];
  assert.match(regla('.barra-inferior'), /safe-area-inset-bottom/);
  assert.match(regla('.cabecera'), /safe-area-inset-top/);
  assert.match(regla('body.con-barra-inferior .acciones-flotantes'), /safe-area-inset-bottom/, 'el + queda arriba de la barra');
  assert.match(regla('.hoja__contenido'), /safe-area-inset-bottom/);
});
