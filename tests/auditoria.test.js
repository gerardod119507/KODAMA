'use strict';

/**
 * auditarDatos() (Auditoria.gs): encuentra cada tipo de problema del
 * modelo de datos, cuenta las filas afectadas y NO escribe nada.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const H_ALUMNOS = ['id', 'nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_calculo', 'forma_pago', 'notas', 'archivado', 'lugar'];
const H_HORARIO = ['id', 'título', 'área', 'días', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado', 'alumno_id', 'lugar'];
const H_BLOQUES = ['id', 'título', 'área', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'creado', 'actualizado', 'archivado', 'alumno_id', 'lugar'];

const SA = 'Unidad Educativa San Agustín';
function alumno(id, nombre, apellido, extra) {
  const e = Object.assign({ curso: '4to de secundaria', colegio: SA, tarifa: '80', pago: 'hora' }, extra || {});
  return [id, nombre, apellido, e.curso, e.colegio, e.tarifa, 'hora', e.pago, '', e.archivado || '', ''];
}
function regla(id, titulo, area, alumnos) {
  return [id, titulo, area, 'Lun', '15:00', '16:00', '2026-09-01', '2026-12-15', '', '', '', alumnos || '', ''];
}
function bloque(id, titulo, area, fecha, alumnos) {
  return [id, titulo, area, 'fijo', fecha, '15:00', '16:00', '', '', '', '', '', alumnos || '', ''];
}

function preparar(datos) {
  const env = crearEntorno({ ahora: '2026-09-23T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  env.registro = [];
  env.Logger = { log: (f, ...v) => env.registro.push(String(f).replace(/%s/g, () => String(v.shift()))) };
  if (datos.alumnos) env.libro.getSheetByName('Alumnos').sembrar([H_ALUMNOS].concat(datos.alumnos));
  if (datos.horario) env.libro.getSheetByName('Horario').sembrar([H_HORARIO].concat(datos.horario));
  if (datos.bloques) env.libro.getSheetByName('Bloques').sembrar([H_BLOQUES].concat(datos.bloques));
  return env;
}

function hallazgo(resultado, texto) {
  return resultado.hallazgos.find((h) => h.titulo.includes(texto));
}

const DATOS = {
  alumnos: [
    alumno('a00000001', 'Santiago', 'Aliendre'),
    alumno('a00000002', 'Santiago', 'Méndez'),
    alumno('a00000003', 'Santiago', '', { curso: '', colegio: '', tarifa: '' }), // creado por la migración
    alumno('a00000004', 'Agustín', 'Aliendre'),
    alumno('a00000005', 'agustin', 'ALIENDRE'), // repetido
    alumno('a00000006', 'Camila', 'Rojas', { colegio: 'San Agustin' }), // texto suelto
    alumno('a00000007', 'Adriana', 'Vega', { tarifa: '' }),
    alumno('a00000008', 'Lucía', 'Paz', { tarifa: '', archivado: 'TRUE' }) // archivada: la tarifa no importa
  ],
  horario: [
    regla('h00000001', 'Camila y Adriana', 'Academia Fractal', 'a00000006'), // falta Adriana + nombre en el título
    regla('h00000002', 'Clase con Valentina', 'Academia Fractal', ''), // sin vincular
    regla('h00000003', 'Cálculo II', 'Universidad', 'a00000001'), // Universidad con alumno
    regla('h00000004', '', 'Academia Fractal', 'a00000001') // bien
  ],
  bloques: [
    bloque('h00000004-2026-09-14', '', 'Academia Fractal', '2026-09-14', ''), // pasado sin heredar
    bloque('h00000004-2026-09-28', '', 'Academia Fractal', '2026-09-28', ''), // futuro sin heredar
    bloque('h00000004-2026-10-05', '', 'Academia Fractal', '2026-10-05', 'a00000001'), // bien
    bloque('h99999999-2026-09-28', 'Vieja', 'Universidad', '2026-09-28', ''), // huérfano
    bloque('(vacío)-2026-09-22', 'Prueba', 'Universidad', '2026-09-22', ''), // serie inválida
    bloque('b1', 'Café con inversionista', 'Startup', '2026-09-10', ''), // prueba vieja
    bloque('b12345678', 'Clase con Santiago Aliendre', 'Academia Fractal', '2026-09-25', 'a00000001') // nombre en el título
  ]
};

test('encuentra cada problema y cuenta las filas afectadas', () => {
  const env = preparar(DATOS);
  const r = env.llamar('auditarDatos()');

  assert.strictEqual(hallazgo(r, 'Alumnos repetidos').cantidad, 2, 'Agustín Aliendre dos veces');
  const homonimo = hallazgo(r, 'sin apellido con el mismo nombre');
  assert.strictEqual(homonimo.cantidad, 1);
  assert.match(homonimo.ejemplos[0], /"Santiago" sin apellido, y hay Santiago Aliendre, Santiago Méndez/);
  assert.match(hallazgo(r, 'Colegio que no está en el catálogo').ejemplos[0], /Camila Rojas → "San Agustin"/);
  assert.strictEqual(hallazgo(r, 'sin curso o sin colegio').cantidad, 1);
  assert.deepStrictEqual(hallazgo(r, 'Alumno activo sin tarifa').ejemplos.map((e) => e.replace(/^fila \d+: /, '')).sort(),
    ['Adriana Vega', 'Santiago'], 'la archivada no cuenta');

  const [reglasSinVincular, bloquesSinVincular] = r.hallazgos.filter((h) => h.titulo.includes('sin alumnos vinculados'));
  assert.strictEqual(reglasSinVincular.seccion, 'Horario');
  assert.strictEqual(reglasSinVincular.cantidad, 1);
  assert.strictEqual(bloquesSinVincular.cantidad, 2, 'los dos bloques de la serie que no heredaron');
  assert.match(hallazgo(r, 'El título nombra más alumnos').ejemplos[0], /"Camila y Adriana" con 1 alumno/);
  assert.strictEqual(r.hallazgos.filter((h) => h.titulo.includes('otras áreas con alumnos'))[0].cantidad, 1);
  const nombreEnTitulo = r.hallazgos.filter((h) => h.titulo.includes('sigue escrito en el título'));
  assert.deepStrictEqual(nombreEnTitulo.map((h) => h.seccion + ':' + h.cantidad), ['Horario:1', 'Bloques:1']);

  assert.strictEqual(hallazgo(r, 'Bloques FUTUROS').cantidad, 1);
  assert.strictEqual(hallazgo(r, 'Bloques PASADOS').cantidad, 1);
  assert.match(hallazgo(r, 'huérfanos').ejemplos[0], /serie "h99999999": 1 bloques/);
  assert.match(hallazgo(r, 'id de serie inválido').ejemplos[0], /\(vacío\)/);
  assert.match(hallazgo(r, 'id de forma rara (probablemente de prueba').ejemplos[0], /"b1" "Café con inversionista"/);
  assert.strictEqual(hallazgo(r, 'título de ejemplo').cantidad, 1);
});

test('no escribe nada en ninguna hoja', () => {
  const env = preparar(DATOS);
  const antes = env.libro.nombresDeHojas().map((n) => JSON.stringify(env.libro.getSheetByName(n).leerTodo()));
  env.llamar('auditarDatos()');
  const despues = env.libro.nombresDeHojas().map((n) => JSON.stringify(env.libro.getSheetByName(n).leerTodo()));
  assert.deepStrictEqual(despues, antes);
});

test('el informe queda en el registro, con propuesta para cada problema', () => {
  const env = preparar(DATOS);
  env.llamar('auditarDatos()');
  assert.match(env.registro[0], /^AUDITORÍA DE DATOS \(solo lectura, no se cambió nada\)\. 8 alumnos, 4 reglas, 7 bloques\./);
  assert.ok(env.registro.some((l) => /\[Alumnos\] Alumnos repetidos .* — 2 fila\(s\)\./.test(l)));
  assert.ok(env.registro.filter((l) => l.includes('Propuesta:')).length >= 10);
  assert.match(env.registro[env.registro.length - 1], /^Total: \d+ problemas en \d+ filas\.$/);
});

test('con datos coherentes dice que está todo en orden', () => {
  const env = preparar({
    alumnos: [alumno('a00000001', 'Santiago', 'Aliendre'), alumno('a00000002', 'Santiago', 'Méndez')],
    horario: [regla('h00000001', '', 'Academia Fractal', 'a00000001'), regla('h00000002', 'Cálculo II', 'Universidad', '')],
    bloques: [bloque('h00000001-2026-09-28', '', 'Academia Fractal', '2026-09-28', 'a00000001'), bloque('b12345678', 'Gimnasio', 'Personal', '2026-09-28', '')]
  });
  const r = env.llamar('auditarDatos()');
  assert.deepStrictEqual(r.hallazgos, []);
  assert.strictEqual(env.registro[1], 'Todo en orden: no se encontró ningún problema.');
});
