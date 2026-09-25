'use strict';

/**
 * Checkpoint 8 (navegador): cálculo de montos, estados de clase y rango de
 * fechas de Estadísticas y Cobros (js/estadisticas.js, js/cobros.js,
 * js/clases.js). Lógica pura, sin navegador.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargar() {
  const entorno = { console, Intl, Date };
  vm.createContext(entorno);
  ['js/fecha.js', 'js/clases.js', 'js/estadisticas.js', 'js/cobros.js'].forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), entorno, { filename: archivo });
  });
  return (expresion, argumento) => {
    entorno.__arg = argumento === undefined ? undefined : JSON.parse(JSON.stringify(argumento));
    const r = vm.runInContext(expresion, entorno);
    return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
  };
}

const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
const ALUMNOS = [
  { id: 'a1', nombre: 'Camila', apellido: 'Aliendre', tarifa_hora: '80', forma_pago: 'mensual', archivado: '' },
  { id: 'a2', nombre: 'Adriana', apellido: '', tarifa_hora: '60', forma_pago: 'hora', archivado: '' },
  { id: 'a3', nombre: 'Katy', apellido: '', tarifa_hora: '', forma_pago: 'mensual', archivado: '' }
];

let n = 0;
function clase(fecha, inicio, fin, alumnos, estado, extra) {
  return Object.assign({
    id: 'b' + (++n), titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha, inicio, fin,
    alumno_id: alumnos, estado: estado || '', fecha_original: '', archivado: ''
  }, extra || {});
}

function calcular(ejecutar, bloques, opciones) {
  return ejecutar('KodamaEstadisticas.calcular(__arg.b, __arg.a, __arg.o)',
    { b: bloques, a: ALUMNOS, o: Object.assign({ desde: '2026-09-01', hasta: '2026-09-30', areas: AREAS }, opciones) });
}

// ---------------------------------------------------------------
// Montos
// ---------------------------------------------------------------

test('monto = horas dictadas × tarifa de cada alumno; una clase compartida suma las dos tarifas', () => {
  const ej = cargar();
  const r = calcular(ej, [
    clase('2026-09-02', '15:00', '16:30', 'a1', 'dictada'), // 1,5 h × 80 = 120
    clase('2026-09-09', '15:00', '17:00', 'a1,a2', 'dictada') // 2 h: a1 160, a2 120
  ]);
  const a1 = r.porAlumno.find((f) => f.id === 'a1');
  const a2 = r.porAlumno.find((f) => f.id === 'a2');
  assert.deepStrictEqual([a1.dictadas, a1.horas, a1.monto], [2, 3.5, 280]);
  assert.deepStrictEqual([a2.dictadas, a2.horas, a2.monto], [1, 2, 120]);
  assert.deepStrictEqual([r.totales.dictadas, r.totales.horas, r.totales.monto], [2, 3.5, 400],
    'la clase compartida es UNA clase y 2 h en el total, pero suma el monto de las dos');
});

test('solo cuentan las dictadas: programadas, movidas sin dictar y canceladas no suman horas ni monto', () => {
  const ej = cargar();
  const r = calcular(ej, [
    clase('2026-09-02', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-09-03', '15:00', '16:00', 'a1', ''), // programada (vacío)
    clase('2026-09-04', '15:00', '16:00', 'a1', 'programada'),
    clase('2026-09-05', '15:00', '16:00', 'a1', 'movida', { fecha_original: '2026-09-04' }),
    clase('2026-09-06', '15:00', '16:00', 'a1', 'cancelada', { motivo: 'feriado' })
  ]);
  const a1 = r.porAlumno[0];
  assert.deepStrictEqual([a1.dictadas, a1.horas, a1.monto, a1.movidas, a1.canceladas], [1, 1, 80, 1, 1]);
  assert.deepStrictEqual(r.totales, { dictadas: 1, minutos: 60, monto: 80, movidas: 1, canceladas: 1, horas: 1 });
});

test('una movida que después se dictó cuenta como dictada Y como movida; una movida cancelada solo como cancelada', () => {
  const ej = cargar();
  const r = calcular(ej, [
    clase('2026-09-05', '15:00', '16:00', 'a1', 'dictada', { fecha_original: '2026-09-04' }),
    clase('2026-09-07', '15:00', '16:00', 'a1', 'cancelada', { fecha_original: '2026-09-06' })
  ]);
  assert.deepStrictEqual([r.totales.dictadas, r.totales.movidas, r.totales.canceladas, r.totales.monto], [1, 1, 1, 80]);
});

test('sin tarifa: suma horas pero no monto, y se marca', () => {
  const ej = cargar();
  const r = calcular(ej, [clase('2026-09-02', '15:00', '16:00', 'a3', 'dictada')]);
  assert.deepStrictEqual([r.porAlumno[0].horas, r.porAlumno[0].monto, r.porAlumno[0].sinTarifa], [1, 0, true]);
});

test('los montos se redondean a centavos (45 min a 70 Bs/h = 52,50)', () => {
  const ej = cargar();
  const alumnos = [{ id: 'x', nombre: 'X', apellido: '', tarifa_hora: '70' }];
  const r = ej('KodamaEstadisticas.calcular(__arg.b, __arg.a, __arg.o)', {
    b: [clase('2026-09-02', '15:00', '15:45', 'x', 'dictada'), clase('2026-09-03', '15:00', '15:20', 'x', 'dictada')],
    a: alumnos, o: { desde: '2026-09-01', hasta: '2026-09-30' }
  });
  assert.strictEqual(r.porAlumno[0].monto, 75.83); // 52,50 + 23,333…
  assert.strictEqual(r.porAlumno[0].horas, 1.08);
});

test('un id de alumno que no está en el directorio igual aparece, sin monto', () => {
  const ej = cargar();
  const r = calcular(ej, [clase('2026-09-02', '15:00', '16:00', 'a9', 'dictada')]);
  assert.deepStrictEqual([r.porAlumno[0].nombre, r.porAlumno[0].monto], ['(alumno a9)', 0]);
});

// ---------------------------------------------------------------
// Rango de fechas y área
// ---------------------------------------------------------------

test('el rango incluye los dos extremos y nada de afuera; los archivados no cuentan', () => {
  const ej = cargar();
  const r = calcular(ej, [
    clase('2026-08-31', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-09-01', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-09-30', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-10-01', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-09-15', '15:00', '16:00', 'a1', 'dictada', { archivado: 'TRUE' })
  ]);
  assert.strictEqual(r.totales.dictadas, 2);
});

test('filtro por área; horas por área = clases no canceladas, en el orden fijo de las áreas', () => {
  const ej = cargar();
  const bloques = [
    clase('2026-09-02', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-09-02', '08:00', '10:00', '', '', { area: 'Universidad' }),
    clase('2026-09-03', '08:00', '09:30', '', 'cancelada', { area: 'Universidad' }),
    clase('2026-09-03', '18:00', '19:00', '', '', { area: 'Personal' })
  ];
  const todas = calcular(ej, bloques);
  assert.deepStrictEqual(todas.porArea.map((a) => [a.area, a.horas]),
    [['Universidad', 2], ['Academia Fractal', 1], ['Personal', 1]]);

  const soloU = calcular(ej, bloques, { area: 'Universidad' });
  assert.deepStrictEqual(soloU.porArea.map((a) => a.area), ['Universidad']);
  assert.deepStrictEqual([soloU.totales.canceladas, soloU.totales.dictadas, soloU.porAlumno.length], [1, 0, 0]);
});

test('periodo anterior: mismo largo, justo antes (cruzando mes y año)', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaEstadisticas.periodoAnterior("2026-09-01", "2026-09-30")'),
    { desde: '2026-08-02', hasta: '2026-08-31' });
  assert.deepStrictEqual(ej('KodamaEstadisticas.periodoAnterior("2026-01-01", "2026-01-07")'),
    { desde: '2025-12-25', hasta: '2025-12-31' });
  assert.deepStrictEqual(ej('KodamaEstadisticas.periodoAnterior("2026-03-01", "2026-03-01")'),
    { desde: '2026-02-28', hasta: '2026-02-28' });
  assert.strictEqual(ej('KodamaEstadisticas.diasEntre("2024-02-01", "2024-02-29")'), 29, 'año bisiesto');
});

test('rango válido: formato y orden', () => {
  const ej = cargar();
  assert.strictEqual(ej('KodamaEstadisticas.rangoValido("2026-09-01", "2026-09-30")'), true);
  assert.strictEqual(ej('KodamaEstadisticas.rangoValido("2026-09-01", "2026-09-01")'), true);
  assert.strictEqual(ej('KodamaEstadisticas.rangoValido("2026-09-30", "2026-09-01")'), false);
  assert.strictEqual(ej('KodamaEstadisticas.rangoValido("", "2026-09-01")'), false);
  assert.strictEqual(ej('KodamaEstadisticas.rangoValido("1/9/2026", "2026-09-30")'), false);
});

test('comparar con el periodo anterior: actual, anterior y diferencia de cada total', () => {
  const ej = cargar();
  const r = ej('KodamaEstadisticas.comparar(__arg.a, __arg.b)', {
    a: { dictadas: 5, horas: 7.5, monto: 600, movidas: 1, canceladas: 0 },
    b: { dictadas: 4, horas: 8, monto: 640, movidas: 0, canceladas: 2 }
  });
  assert.deepStrictEqual(r.map((x) => [x.clave, x.diferencia]),
    [['dictadas', 1], ['horas', -0.5], ['monto', -40], ['movidas', 1], ['canceladas', -2]]);
});

// ---------------------------------------------------------------
// Estados (texto de la ficha)
// ---------------------------------------------------------------

test('estado: vacío = programada; textos de la ficha', () => {
  const ej = cargar();
  assert.strictEqual(ej('KodamaClases.estado({})'), 'programada');
  assert.strictEqual(ej('KodamaClases.textoEstado({ estado: "dictada", area: "Academia Fractal" })'), 'Dictada');
  assert.strictEqual(ej('KodamaClases.textoEstado({ estado: "cancelada", motivo: "feriado" })'), 'Cancelada · feriado');
  assert.strictEqual(ej('KodamaClases.textoEstado({ estado: "cancelada", motivo: "" })'), 'Cancelada');
});

test('"dictada" solo en Academia Fractal: en otra área se lee programada (o movida)', () => {
  const ej = cargar();
  assert.strictEqual(ej('KodamaClases.puedeDictarse({ area: "Academia Fractal" })'), true);
  ['Universidad', 'Startup', 'Personal'].forEach((area) => {
    assert.strictEqual(ej('KodamaClases.puedeDictarse(__arg)', { area }), false);
    assert.strictEqual(ej('KodamaClases.estado(__arg)', { area, estado: 'dictada' }), 'programada');
    assert.strictEqual(ej('KodamaClases.estado(__arg)', { area, estado: 'dictada', fecha_original: '2026-09-24' }), 'movida');
    assert.strictEqual(ej('KodamaClases.estado(__arg)', { area, estado: 'cancelada' }), 'cancelada', 'cancelar vale en todas');
  });
});

test('una "dictada" de otra área no suma en ningún resumen de dictadas, pero sí en horas por área', () => {
  const ej = cargar();
  const r = calcular(ej, [
    clase('2026-09-02', '15:00', '16:30', 'a1', 'dictada'),
    clase('2026-09-03', '08:00', '10:00', '', 'dictada', { area: 'Universidad' }),
    clase('2026-09-04', '08:00', '09:00', 'a2', 'dictada', { area: 'Startup' }) // alumno por error
  ]);
  assert.deepStrictEqual([r.totales.dictadas, r.totales.horas, r.totales.monto], [1, 1.5, 120]);
  assert.deepStrictEqual(r.porAlumno.filter((f) => f.dictadas).map((f) => f.id), ['a1']);
  assert.deepStrictEqual(r.porArea.filter((a) => a.horas).map((a) => [a.area, a.horas]),
    [['Universidad', 2], ['Academia Fractal', 1.5], ['Startup', 1]]);
});

test('"movida del jue 24 al sáb 26", o solo la hora si fue el mismo día', () => {
  const ej = cargar();
  assert.strictEqual(ej('KodamaClases.textoMovida(__arg)',
    { fecha: '2026-09-26', inicio: '15:00', fecha_original: '2026-09-24', inicio_original: '15:00' }),
  'Movida del jue 24 al sáb 26');
  assert.strictEqual(ej('KodamaClases.textoMovida(__arg)',
    { fecha: '2026-09-24', inicio: '17:00', fecha_original: '2026-09-24', inicio_original: '15:00' }),
  'Movida de 15:00 a 17:00 (jue 24)');
  assert.strictEqual(ej('KodamaClases.textoMovida({ fecha: "2026-09-24" })'), '');
});

// ---------------------------------------------------------------
// Cobros mensuales
// ---------------------------------------------------------------

test('rango del mes: último día correcto (30, 31, febrero)', () => {
  const ej = cargar();
  assert.deepStrictEqual(ej('KodamaCobros.rangoDelMes("2026-09")'), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepStrictEqual(ej('KodamaCobros.rangoDelMes("2026-12")'), { desde: '2026-12-01', hasta: '2026-12-31' });
  assert.deepStrictEqual(ej('KodamaCobros.rangoDelMes("2028-02")'), { desde: '2028-02-01', hasta: '2028-02-29' });
});

test('mensual: acumulado del mes por alumno y si ya pagó', () => {
  const ej = cargar();
  const bloques = [
    clase('2026-09-02', '15:00', '17:00', 'a1', 'dictada'),
    clase('2026-09-09', '15:00', '16:00', 'a1', 'dictada'),
    clase('2026-10-01', '15:00', '16:00', 'a1', 'dictada'), // otro mes
    clase('2026-09-10', '15:00', '16:00', 'a3', 'dictada')
  ];
  const pagos = [
    { id: 'p1', alumno_id: 'a1', desde: '2026-09-01', hasta: '2026-09-30', monto: '240', estado: 'pagado', fecha_pago: '2026-09-30', archivado: '' },
    { id: 'p2', alumno_id: 'a3', desde: '2026-08-01', hasta: '2026-08-31', monto: '100', estado: 'pagado', fecha_pago: '2026-08-31', archivado: '' }
  ];
  const r = ej('KodamaCobros.resumenMensual(__arg.b, __arg.a, __arg.p, "2026-09")', { b: bloques, a: ALUMNOS, p: pagos });
  assert.deepStrictEqual(r.map((f) => f.nombre), ['Camila Aliendre', 'Katy'], 'solo los de pago mensual');
  assert.deepStrictEqual([r[0].dictadas, r[0].horas, r[0].monto], [2, 3, 240]);
  assert.deepStrictEqual(r[0].situacion, { estado: 'pagado', monto: 240, fecha_pago: '2026-09-30' });
  assert.deepStrictEqual([r[1].monto, r[1].sinTarifa, r[1].situacion.estado], [0, true, 'sin_registrar'],
    'el pago de agosto no cuenta para septiembre');
});

test('situación de pago: pendiente, y los archivados no cuentan', () => {
  const ej = cargar();
  const pagos = [
    { id: 'p1', alumno_id: 'a1', desde: '2026-09-01', hasta: '2026-09-30', monto: '240', estado: 'pendiente', fecha_pago: '', archivado: '' },
    { id: 'p2', alumno_id: 'a1', desde: '2026-09-01', hasta: '2026-09-30', monto: '240', estado: 'pagado', fecha_pago: '2026-09-30', archivado: 'TRUE' }
  ];
  const r = ej('KodamaCobros.situacion(__arg, "a1", "2026-09-01", "2026-09-30")', pagos);
  assert.deepStrictEqual([r.estado, r.monto], ['pendiente', 240]);
});
