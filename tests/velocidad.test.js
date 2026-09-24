'use strict';

/**
 * Checkpoint 6.5 — velocidad y ficha:
 * - el backend lee solo el tramo de filas de las fechas pedidas, y mantiene
 *   Bloques ordenada por fecha para que ese tramo sea corto;
 * - la verificación de estructura corre una vez, no en cada petición;
 * - la caché por semana del navegador y la ficha (duplicar).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./fake-google');

const COL_FECHA = 4;
const COL_INICIO = 5;

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-01T12:00:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}

function post(env, cuerpo) {
  const respuesta = env.post(Object.assign({ token: 'tk' }, cuerpo));
  assert.ok(respuesta.ok, respuesta.error);
  return respuesta.data;
}

function crear(env, fecha, inicio, titulo) {
  return post(env, {
    action: 'crearBloque',
    bloque: {
      titulo: titulo || 'B ' + fecha + ' ' + inicio, area: 'Startup', tipo: 'variable',
      fecha: fecha, inicio: inicio, fin: '23:00', etiqueta: '', notas: ''
    }
  });
}

function filas(env) {
  return env.libro.getSheetByName('Bloques').leerTodo().slice(1).filter((f) => f[0]);
}

function estaOrdenada(env) {
  const claves = filas(env).map((f) => f[COL_FECHA] + ' ' + f[COL_INICIO]);
  return claves.every((clave, i) => i === 0 || claves[i - 1] <= clave);
}

/** Un semestre generado: 4 reglas × 2-3 días × 15 semanas. */
function semestre(env) {
  [['Cálculo', 'Lun, Mié, Vie', '07:00'], ['Física', 'Mar, Jue', '10:00'],
    ['Clase', 'Lun, Mar, Mié, Jue, Vie', '19:30'], ['Standup', 'Lun, Mié', '09:00']
  ].forEach(([titulo, dias, inicio]) => {
    post(env, {
      action: 'crearRegla',
      regla: { titulo, area: 'Universidad', dias, inicio, fin: '23:00', desde: '2026-09-01', hasta: '2026-12-15', etiqueta: '', notas: '' }
    });
  });
  post(env, { action: 'generarHorario' });
}

// ---------------------------------------------------------------
// Backend: leer solo lo necesario
// ---------------------------------------------------------------

test('una semana lee una fracción de la hoja, no la hoja entera', () => {
  const env = preparar();
  semestre(env);
  const hoja = env.libro.getSheetByName('Bloques');
  const celdasTotales = hoja.getLastRow() * 12;
  assert.ok(hoja.getLastRow() > 150, 'la hoja de prueba es grande');

  hoja.celdasLeidas = 0;
  const semana = post(env, { action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.strictEqual(semana.length, 12, '3 + 2 + 5 + 2 bloques esa semana');
  assert.ok(hoja.celdasLeidas < celdasTotales / 4,
    'leyó ' + hoja.celdasLeidas + ' celdas de ' + celdasTotales);
});

test('generarHorario deja la hoja Bloques ordenada por fecha y hora', () => {
  const env = preparar();
  semestre(env);
  assert.ok(estaOrdenada(env));
});

test('crear y mover un bloque mantienen la hoja ordenada', () => {
  const env = preparar();
  semestre(env);
  const nuevo = crear(env, '2026-10-14', '12:00', 'Suelto');
  assert.ok(estaOrdenada(env), 'después de crear');

  post(env, { action: 'actualizarBloque', id: nuevo.id, cambios: { fecha: '2026-11-20', inicio: '08:00' } });
  assert.ok(estaOrdenada(env), 'después de mover');
  const enNoviembre = post(env, { action: 'listarBloquesDia', fecha: '2026-11-20' });
  assert.ok(enNoviembre.some((b) => b.id === nuevo.id));
});

test('si la hoja se desordena a mano, igual devuelve todo lo de esas fechas', () => {
  const env = preparar();
  const cabecera = ['id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'creado', 'actualizado', 'archivado'];
  const fila = (id, fecha, inicio) => [id, 'T ' + id, 'Startup', 'variable', fecha, inicio, '23:00', '', '', '', '', ''];
  env.libro.getSheetByName('Bloques').sembrar([
    cabecera,
    fila('b1', '2026-10-15', '09:00'),
    fila('b2', '2026-12-01', '09:00'),
    fila('b3', '2026-09-02', '09:00'),
    fila('b4', '2026-10-13', '07:00'),
    fila('b5', '2026-11-30', '09:00'),
    fila('b6', '2026-10-18', '20:00')
  ]);
  const semana = post(env, { action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepStrictEqual(semana.map((b) => b.id), ['b4', 'b1', 'b6']);
  const dia = post(env, { action: 'listarBloquesDia', fecha: '2026-10-15' });
  assert.deepStrictEqual(dia.map((b) => b.id), ['b1']);
});

test('una hoja sin bloques devuelve una semana vacía sin error', () => {
  const env = preparar();
  assert.deepStrictEqual(post(env, { action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' }), []);
  assert.deepStrictEqual(post(env, { action: 'listarBloquesDia', fecha: '2026-10-12' }), []);
});

// ---------------------------------------------------------------
// Backend: la estructura se verifica una vez, no en cada petición
// ---------------------------------------------------------------

function contarVerificaciones(env) {
  env.llamar(
    'asegurarEstructura = (function (original) {' +
    '  return function () { globalThis.__verificaciones = (globalThis.__verificaciones || 0) + 1; return original(); };' +
    '})(asegurarEstructura); 0'
  );
  return () => env.llamar('globalThis.__verificaciones || 0');
}

test('la estructura se verifica en la primera petición y no en las siguientes', () => {
  const env = crearEntorno({ ahora: '2026-09-01T12:00:00Z', token: 'tk' });
  const verificaciones = contarVerificaciones(env);
  post(env, { action: 'ping' });
  post(env, { action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' });
  post(env, { action: 'listarAreas' });
  assert.strictEqual(verificaciones(), 1);
  assert.deepStrictEqual(env.libro.nombresDeHojas().sort(), ['Alumnos', 'Areas', 'Bloques', 'Colegios', 'Cursos', 'Horario', 'Pagos', 'Plantillas']);
});

test('después de un error, la próxima petición vuelve a verificar y repara', () => {
  const env = crearEntorno({ ahora: '2026-09-01T12:00:00Z', token: 'tk' });
  const verificaciones = contarVerificaciones(env);
  post(env, { action: 'ping' });

  env.libro.hojas.delete('Bloques'); // alguien borró la hoja a mano
  const fallida = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.strictEqual(fallida.ok, false);

  const reparada = env.post({ token: 'tk', action: 'listarBloquesRango', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.ok(reparada.ok, reparada.error);
  assert.ok(env.libro.getSheetByName('Bloques'), 'la hoja Bloques se volvió a crear');
  assert.strictEqual(verificaciones(), 2);
});

test('si cambian las columnas en el código, se vuelve a verificar sola', () => {
  const env = crearEntorno({ ahora: '2026-09-01T12:00:00Z', token: 'tk' });
  const verificaciones = contarVerificaciones(env);
  post(env, { action: 'ping' });
  // Simula un despliegue con otra estructura: la firma guardada ya no coincide.
  env.llamar('PropertiesService.getScriptProperties().setProperty(PROPIEDAD_ESTRUCTURA, "firma de una versión vieja"); 0');
  post(env, { action: 'ping' });
  assert.strictEqual(verificaciones(), 2);
});

test('un token incorrecto no marca la estructura como verificada', () => {
  const env = crearEntorno({ ahora: '2026-09-01T12:00:00Z', token: 'tk' });
  env.post({ token: 'otro', action: 'ping' });
  assert.deepStrictEqual(env.libro.nombresDeHojas(), [], 'sin token no se toca nada');
});

// ---------------------------------------------------------------
// Frontend: caché por semana
// ---------------------------------------------------------------

function cargarModulos(archivos) {
  const almacen = new Map();
  const entorno = {
    console,
    Intl,
    localStorage: {
      get length() { return almacen.size; },
      key: (i) => Array.from(almacen.keys())[i] || null,
      getItem: (clave) => (almacen.has(clave) ? almacen.get(clave) : null),
      setItem: (clave, valor) => { almacen.set(clave, String(valor)); },
      removeItem: (clave) => { almacen.delete(clave); }
    }
  };
  vm.createContext(entorno);
  archivos.forEach((archivo) => {
    const ruta = path.join(__dirname, '..', archivo);
    vm.runInContext(fs.readFileSync(ruta, 'utf8'), entorno, { filename: archivo });
  });
  return {
    almacen,
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const resultado = vm.runInContext(expresion, entorno);
      return resultado === undefined ? undefined : JSON.parse(JSON.stringify(resultado));
    }
  };
}

const MODULOS_STATE = ['js/api.js', 'js/state.js'];

test('la semana guardada se lee al instante, sin red', () => {
  const env = cargarModulos(MODULOS_STATE);
  assert.strictEqual(env.ejecutar('KodamaState.leerSemana("2026-09-21")'), null);
  env.ejecutar('KodamaState.guardarSemana("2026-09-21", __arg)', [{ id: 'b1', fecha: '2026-09-23', inicio: '09:00' }]);
  assert.deepStrictEqual(env.ejecutar('KodamaState.leerSemana("2026-09-21")').map((b) => b.id), ['b1']);
});

test('se guardan como mucho 12 semanas: las más viejas se borran', () => {
  const env = cargarModulos(MODULOS_STATE);
  for (let i = 0; i < 15; i++) {
    const lunes = '2026-' + String(1 + Math.floor(i / 4)).padStart(2, '0') + '-' + String(1 + (i % 4) * 7).padStart(2, '0');
    env.ejecutar('KodamaState.guardarSemana(__arg, [])', lunes);
  }
  const semanas = Array.from(env.almacen.keys()).filter((k) => k.startsWith('kodama.cache.semana.'));
  assert.strictEqual(semanas.length, 12);
  assert.ok(!semanas.includes('kodama.cache.semana.2026-01-01'), 'la primera guardada se borró');
});

test('las cachés de versiones anteriores se limpian; la configuración no', () => {
  const env = cargarModulos(MODULOS_STATE);
  env.almacen.set('kodama.cache.bloques.2026-09-23', '{}');
  env.almacen.set('kodama.cache.rango.2026-09-21.2026-09-27', '{}');
  env.almacen.set('kodama.config', '{"url":"x","token":"y"}');
  env.almacen.set('kodama.capa', 'Startup');
  env.ejecutar('KodamaState.limpiarCachesViejas()');
  assert.deepStrictEqual(Array.from(env.almacen.keys()).sort(), ['kodama.capa', 'kodama.config']);
});

test('un cambio guardado se aplica al instante en la semana en pantalla', () => {
  const env = cargarModulos(MODULOS_STATE);
  const semana = [
    { id: 'b1', fecha: '2026-09-22', inicio: '09:00', archivado: '' },
    { id: 'b2', fecha: '2026-09-24', inicio: '10:00', archivado: '' }
  ];
  const aplicar = (bloque) => env.ejecutar(
    'KodamaState.aplicarCambio(__arg.semana, __arg.bloque, "2026-09-21", "2026-09-27")',
    { semana, bloque }
  ).map((b) => b.id + '@' + b.fecha + ' ' + b.inicio);

  assert.deepStrictEqual(aplicar({ id: 'b3', fecha: '2026-09-23', inicio: '08:00', archivado: '' }),
    ['b1@2026-09-22 09:00', 'b3@2026-09-23 08:00', 'b2@2026-09-24 10:00'], 'nuevo: entra en orden');
  assert.deepStrictEqual(aplicar({ id: 'b2', fecha: '2026-09-21', inicio: '07:00', archivado: '' }),
    ['b2@2026-09-21 07:00', 'b1@2026-09-22 09:00'], 'movido dentro de la semana: se reubica');
  assert.deepStrictEqual(aplicar({ id: 'b2', fecha: '2026-10-05', inicio: '10:00', archivado: '' }),
    ['b1@2026-09-22 09:00'], 'movido a otra semana: sale');
  assert.deepStrictEqual(aplicar({ id: 'b1', fecha: '2026-09-22', inicio: '09:00', archivado: 'TRUE' }),
    ['b2@2026-09-24 10:00'], 'archivado: sale');
});

// ---------------------------------------------------------------
// Frontend: duplicar desde la ficha
// ---------------------------------------------------------------

test('duplicar copia los datos del bloque (alumnos incluidos) pero no su id ni sus fechas de registro', () => {
  const env = cargarModulos(['js/ui/formulario.js']);
  const copia = env.ejecutar('KodamaFormulario.valoresDuplicado(__arg)', {
    id: 'h1234abcd-2026-09-23', titulo: 'Cálculo II', area: 'Universidad', tipo: 'fijo',
    fecha: '2026-09-23', inicio: '06:45', fin: '08:15', etiqueta: 'aula 4', notas: 'traer calculadora',
    creado: '2026-09-01 10:00', actualizado: '2026-09-02 10:00', archivado: ''
  });
  assert.deepStrictEqual(copia, {
    titulo: 'Cálculo II', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-23',
    inicio: '06:45', fin: '08:15', lugar: '', etiqueta: 'aula 4', notas: 'traer calculadora', alumno_id: ''
  });
});
