'use strict';

/**
 * Esperas visibles (js/ui/espera.js): qué acciones avisan y con qué
 * palabras, que las lecturas no avisen, que KodamaApi.llamar avise al
 * empezar y al terminar (bien, con error o sin red), y que todas las
 * páginas carguen el script antes de js/api.js.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const leer = (r) => fs.readFileSync(path.join(raiz, r), 'utf8');

function cargarEspera() {
  const ctx = {};
  vm.runInNewContext(leer('js/ui/espera.js') + ';this.E = KodamaEspera;', ctx);
  return ctx.E;
}

test('las acciones que escriben avisan con su palabra', () => {
  const E = cargarEspera();
  assert.deepStrictEqual({ ...E.textos('crearAlumno') }, { espera: 'Guardando…', listo: 'Guardado' });
  assert.strictEqual(E.textos('actualizarBloque').espera, 'Guardando…');
  assert.strictEqual(E.textos('cambiarEstadoBloque').listo, 'Guardado');
  assert.strictEqual(E.textos('guardarCatalogo').espera, 'Guardando…');
  assert.strictEqual(E.textos('archivarPago').listo, 'Archivado');
  assert.strictEqual(E.textos('borrarRegla').espera, 'Borrando…');
  assert.strictEqual(E.textos('moverBloque').listo, 'Movido');
  assert.strictEqual(E.textos('generarHorario').espera, 'Generando horario…');
  assert.strictEqual(E.textos('importar', { aplicar: true }).espera, 'Importando…');
  assert.strictEqual(E.textos('importar', { aplicar: false }).espera, 'Revisando…');
});

test('las lecturas no avisan', () => {
  const E = cargarEspera();
  ['listarBloquesRango', 'listarAlumnos', 'listarPlantillas', 'ping', 'listarSeries'].forEach((a) => {
    assert.strictEqual(E.textos(a), null, a);
  });
});

test('cada acción de la lista o escribe con aviso o es una lectura', () => {
  const nombres = [...leer('js/backend/acciones.js').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  assert.ok(nombres.length > 10, 'se leyeron las acciones');
  const E = cargarEspera();
  nombres.forEach((a) => {
    const lectura = /^(listar|ping)/.test(a);
    assert.strictEqual(E.textos(a) === null, lectura, a);
  });
});

test('KodamaApi.llamar avisa al empezar y al terminar', async () => {
  const eventos = [];
  const ctx = {
    localStorage: { removeItem() {} },
    KodamaEspera: {
      empezar(accion) {
        eventos.push('empieza ' + accion);
        return (ok, sinRed) => eventos.push('termina ' + accion + ' ' + ok + ' ' + sinRed);
      }
    },
    KodamaBackend: {
      async ejecutar(accion) {
        if (accion === 'sinRed') throw new Error('red');
        return accion === 'malo' ? { ok: false, error: 'x' } : { ok: true, data: 1 };
      }
    },
    KodamaSupabase: { haySesion: () => true }
  };
  vm.runInNewContext(leer('js/api.js') + ';this.A = KodamaApi;', ctx);
  await ctx.A.llamar('crearAlumno', {});
  await ctx.A.llamar('malo', {});
  await assert.rejects(ctx.A.llamar('sinRed', {}));
  assert.deepStrictEqual(eventos, [
    'empieza crearAlumno', 'termina crearAlumno true false',
    'empieza malo', 'termina malo false false',
    'empieza sinRed', 'termina sinRed false true'
  ]);
});

test('cada página que usa la API carga espera.js justo antes', () => {
  fs.readdirSync(raiz).filter((f) => f.endsWith('.html')).forEach((pagina) => {
    const html = leer(pagina);
    if (!html.includes('js/api.js')) return;
    const i = html.indexOf('js/ui/espera.js');
    assert.ok(i !== -1, pagina + ' carga espera.js');
    assert.ok(i < html.indexOf('js/api.js'), pagina + ': espera.js va antes de api.js');
  });
});
