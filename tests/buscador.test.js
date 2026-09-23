'use strict';

/**
 * Checkpoint 7 — el buscador del autocompletado de alumnos y el nombre que
 * se ve de un bloque armado desde sus alumnos (js/alumnos.js, en el
 * navegador).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargar() {
  const almacen = {};
  const entorno = {
    console,
    localStorage: {
      getItem: (clave) => (clave in almacen ? almacen[clave] : null),
      setItem: (clave, valor) => { almacen[clave] = String(valor); },
      removeItem: (clave) => { delete almacen[clave]; }
    }
  };
  vm.createContext(entorno);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/alumnos.js'), 'utf8'), entorno, { filename: 'js/alumnos.js' });
  return {
    ejecutar(expresion, argumento) {
      entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
      const r = vm.runInContext(expresion, entorno);
      return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
    }
  };
}

const DIRECTORIO = {
  cursos: [
    { nombre: '4to de secundaria', corto: '4to' },
    { nombre: '2do de secundaria', corto: '2do' },
    { nombre: '1er año universidad', corto: '1er univ' }
  ],
  colegios: [
    { nombre: 'Unidad Educativa San Agustín', corto: 'SA' },
    { nombre: 'Colegio Poveda', corto: 'Poveda' },
    { nombre: 'Universidad Católica Boliviana', corto: 'UCB' }
  ],
  alumnos: [
    { id: 'a1', nombre: 'Agustín', apellido: 'Aliendre', curso: '4to de secundaria', colegio: 'Unidad Educativa San Agustín', archivado: '' },
    { id: 'a2', nombre: 'Camila', apellido: 'Aliendre', curso: '2do de secundaria', colegio: 'Unidad Educativa San Agustín', archivado: '' },
    { id: 'a3', nombre: 'Santiago', apellido: 'Rojas', curso: '1er año universidad', colegio: 'Universidad Católica Boliviana', archivado: '' },
    { id: 'a4', nombre: 'Lucía', apellido: 'Paz', curso: '', colegio: 'Colegio Poveda', archivado: '' },
    { id: 'a5', nombre: 'Agustina', apellido: 'Vega', curso: '', colegio: '', archivado: 'TRUE' }
  ]
};

function buscar(env, consulta, opciones) {
  return env.ejecutar('KodamaAlumnos.buscar(__arg.c, __arg.d, __arg.o).map(function (a) { return a.id; })',
    { c: consulta, d: DIRECTORIO, o: opciones || {} });
}

test('"ag" encuentra a Agustín primero (empieza con "ag") y Santiago después (solo lo contiene)', () => {
  const env = cargar();
  assert.deepStrictEqual(buscar(env, 'ag'), ['a1', 'a2', 'a3']);
});

test('sin distinguir tildes ni mayúsculas', () => {
  const env = cargar();
  assert.deepStrictEqual(buscar(env, 'AGUSTIN'), ['a1', 'a2'], 'Agustín por nombre; Camila por colegio San Agustín');
  assert.deepStrictEqual(buscar(env, 'lucia'), ['a4']);
  assert.deepStrictEqual(buscar(env, 'LÚCÍA'), ['a4']);
});

test('busca por apellido y por colegio (nombre completo o código)', () => {
  const env = cargar();
  assert.deepStrictEqual(buscar(env, 'aliendre'), ['a1', 'a2']);
  assert.deepStrictEqual(buscar(env, 'poveda'), ['a4']);
  assert.deepStrictEqual(buscar(env, 'ucb'), ['a3']);
});

test('varias palabras: tienen que coincidir todas', () => {
  const env = cargar();
  assert.deepStrictEqual(buscar(env, 'cam ali'), ['a2']);
  assert.deepStrictEqual(buscar(env, 'agustin rojas'), []);
});

test('los archivados no se sugieren (salvo que se pida) y se pueden excluir los ya elegidos', () => {
  const env = cargar();
  assert.ok(!buscar(env, 'agus').includes('a5'));
  assert.ok(buscar(env, 'agus', { incluirArchivados: true }).includes('a5'));
  assert.deepStrictEqual(buscar(env, 'aliendre', { excluir: ['a1'] }), ['a2']);
  assert.strictEqual(buscar(env, '', { limite: 2 }).length, 2);
});

test('la etiqueta usa los códigos cortos: "Agustín Aliendre — 4to SA"', () => {
  const env = cargar();
  assert.strictEqual(env.ejecutar('KodamaAlumnos.etiqueta(__arg.a, __arg.d)', { a: DIRECTORIO.alumnos[0], d: DIRECTORIO }),
    'Agustín Aliendre — 4to SA');
  assert.strictEqual(env.ejecutar('KodamaAlumnos.etiqueta(__arg.a, __arg.d)', { a: DIRECTORIO.alumnos[3], d: DIRECTORIO }),
    'Lucía Paz — Poveda');
});

test('el título que se ve de un bloque se arma desde sus alumnos', () => {
  const env = cargar();
  const titulo = (bloque) => env.ejecutar('KodamaAlumnos.tituloDeBloque(__arg.b, __arg.d)', { b: bloque, d: DIRECTORIO });
  assert.strictEqual(titulo({ titulo: '', alumno_id: 'a1' }), 'Agustín Aliendre — 4to SA');
  assert.strictEqual(titulo({ titulo: '', alumno_id: 'a1,a2' }), 'Agustín Aliendre, Camila Aliendre');
  assert.strictEqual(titulo({ titulo: 'Física', alumno_id: 'a2' }), 'Camila Aliendre — 2do SA · Física');
  assert.strictEqual(titulo({ titulo: 'Cálculo II', alumno_id: '' }), 'Cálculo II', 'sin alumnos, el título de siempre');
  assert.strictEqual(titulo({ titulo: '', alumno_id: 'a999' }), '(alumno)', 'un id desconocido no rompe');
});
