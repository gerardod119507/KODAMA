'use strict';

/**
 * Materias de la universidad vs. clases de Fractal en el navegador: qué
 * bloque es una "materia" (su ficha es otra), cómo se dice que no hubo
 * clase, y cómo se reparten las reglas de Horario en Materias, Alumnos
 * fijos (por mes) y Otros.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargar() {
  const entorno = { console, Intl, Date };
  vm.createContext(entorno);
  ['js/fecha.js', 'js/clases.js', 'js/horario-secciones.js'].forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), entorno, { filename: archivo });
  });
  return (expresion, argumento) => {
    entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
    return JSON.parse(JSON.stringify(vm.runInContext(expresion, entorno)));
  };
}

test('una materia es un bloque de Universidad que sale de una regla de Horario', () => {
  const ej = cargar();
  const es = (b) => ej('KodamaClases.esMateria(__arg)', b);
  assert.strictEqual(es({ id: 'h1a2b3c4d-2026-10-05', area: 'Universidad' }), true);
  assert.strictEqual(es({ id: 'b1a2b3c4d', area: 'Universidad' }), false, 'una suelta (examen, reunión) no');
  assert.strictEqual(es({ id: 'h1a2b3c4d-2026-10-05', area: 'Academia Fractal' }), false, 'un fijo de Fractal no');
  assert.strictEqual(es(null), false);
});

test('en una materia, cancelada se dice "No hubo clase"; en Fractal sigue "Cancelada"', () => {
  const ej = cargar();
  const texto = (b) => ej('KodamaClases.textoEstado(__arg)', b);
  assert.strictEqual(texto({ id: 'h1a2b3c4d-2026-10-05', area: 'Universidad', estado: 'cancelada' }), 'No hubo clase');
  assert.strictEqual(texto({ id: 'b1a2b3c4d', area: 'Academia Fractal', estado: 'cancelada', motivo: 'feriado' }), 'Cancelada · feriado');
});

const reglas = [
  { id: 'h1', titulo: 'Física', area: 'Universidad', inicio: '11:00', desde: '2026-08-01', hasta: '2026-12-15', archivado: '' },
  { id: 'h2', titulo: 'Cálculo', area: 'Universidad', inicio: '09:00', desde: '2026-08-01', hasta: '2026-12-15', archivado: '' },
  { id: 'h3', titulo: 'Vieja', area: 'Universidad', inicio: '07:00', desde: '2026-02-01', hasta: '2026-06-30', archivado: 'TRUE' },
  { id: 'h4', titulo: '', area: 'Academia Fractal', inicio: '15:00', desde: '2026-10-01', hasta: '2026-10-31', alumno_id: 'a1', archivado: '' },
  { id: 'h5', titulo: '', area: 'Academia Fractal', inicio: '17:00', desde: '2026-09-01', hasta: '2026-09-30', alumno_id: 'a2', archivado: '' },
  { id: 'h6', titulo: '', area: 'Academia Fractal', inicio: '08:00', desde: '2026-09-20', hasta: '2026-10-05', alumno_id: 'a3', archivado: '' },
  { id: 'h7', titulo: 'Gimnasio', area: 'Personal', inicio: '18:00', desde: '2026-10-01', hasta: '2026-12-31', archivado: '' }
];

test('las reglas se reparten: Materias (U), Alumnos fijos (Fractal), Otros; archivadas al final', () => {
  const ej = cargar();
  const ids = (seccion) => ej('KodamaSeccionesHorario.deSeccion(__arg, "' + seccion + '").map((r) => r.id)', reglas);
  assert.deepStrictEqual(ids('materias'), ['h2', 'h1', 'h3']);
  assert.deepStrictEqual(ids('fijos'), ['h6', 'h4', 'h5']);
  assert.deepStrictEqual(ids('otros'), ['h7']);
});

test('alumnos fijos del mes: los que tienen clases ese mes (también los que cruzan de mes)', () => {
  const ej = cargar();
  const delMes = (mes) => ej('KodamaSeccionesHorario.fijosDelMes(__arg, "' + mes + '").map((r) => r.id)', reglas);
  assert.deepStrictEqual(delMes('2026-10'), ['h6', 'h4']);
  assert.deepStrictEqual(delMes('2026-09'), ['h6', 'h5']);
  assert.deepStrictEqual(delMes('2026-11'), []);
});

test('límites del mes: 30, 31, febrero y bisiesto', () => {
  const ej = cargar();
  const lim = (mes) => ej('KodamaSeccionesHorario.limitesDelMes("' + mes + '")');
  assert.deepStrictEqual(lim('2026-10'), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepStrictEqual(lim('2026-11'), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepStrictEqual(lim('2026-02'), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepStrictEqual(lim('2028-02'), { desde: '2028-02-01', hasta: '2028-02-29' });
});

test('la página de Horario: tres secciones, sin botón flotante, y la ficha de materia enlaza a Materias', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'horario.html'), 'utf8');
  ['materias', 'fijos', 'otros'].forEach((s) => {
    assert.match(html, new RegExp('data-seccion="' + s + '"'));
    assert.match(html, new RegExp('id="seccion-' + s + '"'));
  });
  assert.doesNotMatch(html, /class="fab"/);
  assert.match(html, /id="borrar-regla"/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(index, /href="horario.html#materias"/);
  assert.match(index, /id="ficha-sin-clase"[^>]*>No hubo clase</);
});
