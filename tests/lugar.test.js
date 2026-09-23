'use strict';

/**
 * Campo "lugar" (cierre del Checkpoint 7): en bloques, reglas y alumnos,
 * el generador lo lleva de la regla a los bloques, y moverAulasALugar()
 * pasa el aula de "notas" a "lugar" en las reglas de Universidad.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./fake-google');

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  env.registro = [];
  env.Logger = { log: (formato, ...v) => env.registro.push(String(formato).replace(/%s/g, () => String(v.shift()))) };
  return env;
}

function ok(env, cuerpo) {
  const r = env.post(Object.assign({ token: 'tk' }, cuerpo));
  assert.ok(r.ok, r.error);
  return r.data;
}

const hoja = (env, nombre) => env.libro.getSheetByName(nombre).leerTodo();

test('las tres hojas tienen "lugar" al final, y una hoja vieja lo recibe sin mover nada', () => {
  const env = crearEntorno({});
  env.libro.insertSheet('Alumnos').sembrar([
    ['id', 'nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_calculo', 'forma_pago', 'notas', 'archivado'],
    ['a00000001', 'Agustín', 'Aliendre', '', '', '80', 'hora', 'mensual', 'nota', '']
  ]);
  env.llamar('asegurarEstructura()');
  assert.strictEqual(hoja(env, 'Bloques')[0][13], 'lugar');
  assert.strictEqual(hoja(env, 'Horario')[0][12], 'lugar');
  const alumnos = hoja(env, 'Alumnos');
  assert.strictEqual(alumnos[0][10], 'lugar');
  assert.deepStrictEqual(alumnos[1].slice(0, 10), ['a00000001', 'Agustín', 'Aliendre', '', '', '80', 'hora', 'mensual', 'nota', '']);
});

test('bloques, reglas y alumnos guardan y editan el lugar', () => {
  const env = preparar();
  const bloque = ok(env, { action: 'crearBloque', bloque: {
    titulo: 'Cálculo', area: 'Universidad', tipo: 'fijo', fecha: '2026-09-24', inicio: '09:00', fin: '10:00', lugar: '  Aula E511 '
  } });
  assert.strictEqual(bloque.lugar, 'Aula E511');
  assert.strictEqual(ok(env, { action: 'actualizarBloque', id: bloque.id, cambios: { lugar: 'Aula E103' } }).lugar, 'Aula E103');
  assert.strictEqual(ok(env, { action: 'listarBloquesDia', fecha: '2026-09-24' })[0].lugar, 'Aula E103');

  const alumno = ok(env, { action: 'crearAlumno', alumno: { nombre: 'Camila', apellido: 'Rojas', lugar: 'Su casa (Av. América)' } });
  assert.strictEqual(alumno.lugar, 'Su casa (Av. América)');
  assert.strictEqual(ok(env, { action: 'actualizarAlumno', id: alumno.id, cambios: { lugar: 'Fractal' } }).lugar, 'Fractal');
});

test('el generador copia el lugar de la regla a cada bloque y lo refresca si cambia', () => {
  const env = preparar();
  const regla = ok(env, { action: 'crearRegla', regla: {
    titulo: 'Cálculo II', area: 'Universidad', dias: 'Jue', inicio: '09:00', fin: '10:30',
    desde: '2026-09-24', hasta: '2026-10-01', lugar: 'Aula E511'
  } });
  ok(env, { action: 'generarHorario' });
  let bloques = ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(bloques.map((b) => b.lugar), ['Aula E511', 'Aula E511']);

  ok(env, { action: 'actualizarRegla', id: regla.id, cambios: { lugar: 'Aula E522' } });
  ok(env, { action: 'generarHorario' });
  bloques = ok(env, { action: 'listarBloquesRango', desde: '2026-09-21', hasta: '2026-10-04' });
  assert.deepStrictEqual(bloques.map((b) => b.lugar), ['Aula E522', 'Aula E522']);
});

// ---------------------------------------------------------------
// moverAulasALugar()
// ---------------------------------------------------------------

const ENCABEZADO = ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumno_id', 'lugar'];
function regla(id, titulo, area, notas, lugar) {
  return [id, titulo, area, 'Lun', '09:00', '10:00', '2026-09-01', '2026-12-15', '', notas, '', '', lugar || ''];
}

test('mueve el aula de notas a lugar solo en reglas de Universidad', () => {
  const env = preparar();
  env.libro.getSheetByName('Horario').sembrar([ENCABEZADO,
    regla('h00000001', 'Cálculo II', 'Universidad', 'Aula E511'),
    regla('h00000002', 'Física', 'Universidad', 'aula e 522 - traer calculadora'),
    regla('h00000003', 'Química', 'Universidad', 'Aula E526 y Aula E525'),
    regla('h00000004', 'Álgebra', 'Universidad', 'Aula E103', 'Aula E999'), // ya tiene lugar
    regla('h00000005', 'Inglés', 'Personal', 'Aula E525'), // otra área
    regla('h00000006', 'Programación', 'Universidad', 'sin aula todavía')
  ]);
  const antes = hoja(env, 'Horario');

  const r = env.llamar('moverAulasALugar()');
  const despues = hoja(env, 'Horario');
  assert.deepStrictEqual([despues[1][9], despues[1][12]], ['', 'Aula E511']);
  assert.deepStrictEqual([despues[2][9], despues[2][12]], ['traer calculadora', 'Aula e 522']);
  assert.deepStrictEqual(despues[3], antes[3], 'dos aulas: sin tocar');
  assert.deepStrictEqual(despues[4], antes[4], 'ya tenía lugar: sin tocar');
  assert.deepStrictEqual(despues[5], antes[5], 'otra área: sin tocar');
  assert.deepStrictEqual(despues[6], antes[6], 'sin aula: sin tocar');
  [1, 2].forEach((i) => assert.deepStrictEqual(despues[i].slice(0, 9), antes[i].slice(0, 9), 'el resto de la fila igual'));

  assert.strictEqual(r.movidas.length, 2);
  assert.deepStrictEqual(r.pendientes.map((p) => p.fila), [4]);
  assert.strictEqual(env.registro[0], 'Aulas movidas a "lugar": 2. Pendientes: 1.');
  assert.ok(env.registro.some((l) => l.includes('Cálculo II') && l.includes('Aula E511')));

  const otraVez = env.llamar('moverAulasALugar()');
  assert.strictEqual(otraVez.movidas.length, 0, 'correrla de nuevo no hace nada');
});

test('después de mover y regenerar, los bloques muestran el aula', () => {
  const env = preparar();
  env.libro.getSheetByName('Horario').sembrar([ENCABEZADO, regla('', 'Cálculo II', 'Universidad', 'Aula E511')]);
  env.llamar('moverAulasALugar()');
  ok(env, { action: 'generarHorario' });
  const bloques = ok(env, { action: 'listarBloquesRango', desde: '2026-09-28', hasta: '2026-10-04' });
  assert.strictEqual(bloques[0].lugar, 'Aula E511');
  assert.strictEqual(bloques[0].notas, '');
});

// ---------------------------------------------------------------
// Frontend: el lugar habitual del alumno elegido
// ---------------------------------------------------------------

test('lugarDeAlumnos: el lugar habitual del primer alumno elegido que tenga uno', () => {
  const entorno = { console, localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(entorno);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/alumnos.js'), 'utf8'), entorno);
  entorno.__dir = {
    cursos: [], colegios: [],
    alumnos: [{ id: 'a1', nombre: 'A', lugar: '' }, { id: 'a2', nombre: 'B', lugar: 'Su casa' }, { id: 'a3', nombre: 'C', lugar: 'Fractal' }]
  };
  const lugar = (ids) => vm.runInContext('KodamaAlumnos.lugarDeAlumnos(' + JSON.stringify(ids) + ', __dir)', entorno);
  assert.strictEqual(lugar('a1,a2,a3'), 'Su casa');
  assert.strictEqual(lugar('a1'), '');
  assert.strictEqual(lugar(''), '');
});
