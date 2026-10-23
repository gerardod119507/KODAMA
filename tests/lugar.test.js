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
