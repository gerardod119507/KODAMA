'use strict';

/**
 * Checkpoint 9: reglas de los formularios (js/formas.js) y plantillas
 * (js/plantillas.js, lógica pura) + la hoja Plantillas del backend.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./fake-google');

function cargar() {
  const almacen = {};
  const entorno = {
    console, Intl, Date,
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; }
    }
  };
  vm.createContext(entorno);
  ['js/fecha.js', 'js/formas.js', 'js/plantillas.js'].forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), entorno, { filename: archivo });
  });
  return (expresion, argumento) => {
    entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
    const r = vm.runInContext(expresion, entorno);
    return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
  };
}

// ---------------------------------------------------------------
// Duración y fin
// ---------------------------------------------------------------

test('duración por defecto: 90 min en clases (Universidad, Fractal), 60 en el resto', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaFormas.porArea("Universidad")'), { tipo: 'fijo', duracion: 90 });
  assert.deepStrictEqual(ej('KodamaFormas.porArea("Academia Fractal")'), { tipo: 'fijo', duracion: 90 });
  assert.deepStrictEqual(ej('KodamaFormas.porArea("Startup")'), { tipo: 'variable', duracion: 60 });
  assert.deepStrictEqual(ej('KodamaFormas.porArea("Personal")'), { tipo: 'variable', duracion: 60 });
  assert.deepStrictEqual(ej('KodamaFormas.porArea("otra")'), { tipo: 'variable', duracion: 60 });
});

test('el fin se calcula desde el inicio, sin pasar de medianoche', () => {
  const ej = cargar();
  assert.strictEqual(ej('KodamaFormas.finPara("15:00", 90)'), '16:30');
  assert.strictEqual(ej('KodamaFormas.finPara("06:45", 90)'), '08:15');
  assert.strictEqual(ej('KodamaFormas.finPara("23:00", 90)'), '23:59');
  assert.strictEqual(ej('KodamaFormas.duracion("15:00", "16:30")'), 90);
});

test('un fin antes o igual al inicio se corrige solo; uno válido no se toca', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaFormas.corregirFin("15:00", "14:00", 90)'), { fin: '16:30', corregido: true });
  assert.deepStrictEqual(ej('KodamaFormas.corregirFin("15:00", "15:00", 60)'), { fin: '16:00', corregido: true });
  assert.deepStrictEqual(ej('KodamaFormas.corregirFin("15:00", "15:30", 60)'), { fin: '15:30', corregido: false });
  // 23:59 no deja lugar: se marca corregido y la duración sigue siendo 0 (el formulario no deja guardar).
  const r = ej('KodamaFormas.corregirFin("23:59", "23:00", 60)');
  assert.deepStrictEqual(r, { fin: '23:59', corregido: true });
  assert.strictEqual(ej('KodamaFormas.duracion("23:59", "23:59")'), 0);
});

// ---------------------------------------------------------------
// Días como botones
// ---------------------------------------------------------------

test('días: del texto a botones y de vuelta, siempre en orden de la semana', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaFormas.diasDeTexto("mie, LUN - vie")'), [0, 2, 4]);
  assert.deepStrictEqual(ej('KodamaFormas.diasDeTexto("Sábado/sab, Domingo")'), [5, 6]);
  assert.deepStrictEqual(ej('KodamaFormas.diasDeTexto("")'), []);
  assert.strictEqual(ej('KodamaFormas.textoDeDias([4, 0, 2])'), 'Lun, Mié, Vie');
  assert.strictEqual(ej('KodamaFormas.textoDeDias([])'), '');
});

// ---------------------------------------------------------------
// Plantillas (navegador)
// ---------------------------------------------------------------

const BLOQUE = {
  id: 'b1', titulo: 'Física', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-09-24',
  inicio: '15:00', fin: '16:30', alumno_id: 'a1,a2', lugar: 'Casa', etiqueta: '', notas: 'no se copia', estado: 'dictada'
};

test('guardar un bloque como plantilla: área, alumnos, duración, lugar (nunca fecha, hora ni estado)', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaPlantillas.desdeBloque(__arg, "  Camila y Adriana ")', BLOQUE), {
    nombre: 'Camila y Adriana', area: 'Academia Fractal', tipo: 'fijo', titulo: 'Física',
    alumno_id: 'a1,a2', duracion: 90, lugar: 'Casa', etiqueta: ''
  });
});

test('crear desde una plantilla: todo listo con la fecha y el inicio que ya estaban', () => {
  const ej = cargar();
  const plantilla = { nombre: 'X', area: 'Academia Fractal', tipo: 'fijo', titulo: 'Física', alumno_id: 'a1', duracion: '90', lugar: 'Casa', etiqueta: '' };
  assert.deepStrictEqual(ej('KodamaPlantillas.valoresDesde(__arg, "2026-10-01", "17:00")', plantilla), {
    titulo: 'Física', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-01', inicio: '17:00',
    fin: '18:30', lugar: 'Casa', etiqueta: '', notas: '', alumno_id: 'a1'
  });
});

// ---------------------------------------------------------------
// Plantillas (backend)
// ---------------------------------------------------------------

function preparar() {
  const env = crearEntorno({ ahora: '2026-09-24T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  return env;
}
function post(env, cuerpo) { return env.post(Object.assign({ token: 'tk' }, cuerpo)); }

test('la hoja Plantillas: crear, listar y archivar (sin borrar)', () => {
  const env = preparar();
  const alumno = post(env, { action: 'crearAlumno', alumno: { nombre: 'Katy' } }).data;
  const r = post(env, { action: 'crearPlantilla', plantilla: {
    nombre: 'Katy 90', area: 'Academia Fractal', tipo: 'fijo', titulo: '', alumno_id: alumno.id, duracion: 90, lugar: 'Casa'
  } });
  assert.ok(r.ok, r.error);
  assert.match(r.data.id, /^t[0-9a-f]{8}$/);
  assert.deepStrictEqual(post(env, { action: 'listarPlantillas' }).data.map((p) => [p.nombre, p.duracion, p.alumno_id]),
    [['Katy 90', '90', alumno.id]]);

  assert.ok(post(env, { action: 'archivarPlantilla', id: r.data.id }).ok);
  assert.strictEqual(post(env, { action: 'listarPlantillas' }).data.length, 0, 'la archivada ya no se lista');
  const hoja = env.libro.getSheetByName('Plantillas').leerTodo();
  assert.strictEqual(hoja.length, 2, 'la fila sigue en la hoja');
  assert.strictEqual(hoja[1][10], 'TRUE');
});

test('plantillas: validaciones que fallan sin escribir', () => {
  const env = preparar();
  const base = { nombre: 'X', area: 'Universidad', tipo: 'fijo', titulo: 'Cálculo', duracion: 90 };
  const error = (extra) => post(env, { action: 'crearPlantilla', plantilla: Object.assign({}, base, extra) }).error;
  assert.match(error({ nombre: ' ' }), /falta_nombre/);
  assert.match(error({ area: 'Otra' }), /area_invalida/);
  assert.match(error({ tipo: 'clase' }), /tipo_invalido/);
  assert.match(error({ duracion: 0 }), /duracion_invalida/);
  assert.match(error({ duracion: '1h' }), /duracion_invalida/);
  assert.match(error({ titulo: '' }), /falta_titulo/);
  assert.match(error({ area: 'Academia Fractal', titulo: '', alumno_id: 'a99999999' }), /alumno_no_encontrado/);
  assert.strictEqual(post(env, { action: 'listarPlantillas' }).data.length, 0);
});

test('fuera de Fractal una plantilla no guarda alumnos; las acciones exigen token', () => {
  const env = preparar();
  const alumno = post(env, { action: 'crearAlumno', alumno: { nombre: 'Katy' } }).data;
  const r = post(env, { action: 'crearPlantilla', plantilla: { nombre: 'U', area: 'Universidad', tipo: 'fijo', titulo: 'Cálculo', duracion: 90, alumno_id: alumno.id } });
  assert.strictEqual(r.data.alumno_id, '');
  ['listarPlantillas', 'crearPlantilla', 'archivarPlantilla'].forEach((action) => {
    assert.deepStrictEqual(env.post({ token: 'otro', action }), { ok: false, error: 'no_autorizado' });
  });
});
