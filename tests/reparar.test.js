'use strict';

/**
 * repararAlumnosFractal() / repararAlumnosFractalAplicar() (Setup.gs): la
 * reparación de lo que encontró auditarDatos(), sobre una copia armada
 * como los datos reales (alumnos cargados a mano sin id, reglas y bloques
 * con el nombre en el título). Además: ids automáticos al leer alumnos,
 * nombres ambiguos en la migración, y números enteros en el registro.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { crearEntorno } = require('./fake-google');

const HOY = '2026-09-24';

function preparar() {
  const env = crearEntorno({ ahora: HOY + 'T14:30:00Z', token: 'tk' });
  env.llamar('asegurarEstructura()');
  const registro = [];
  env.Logger = { log: (...args) => registro.push(args) };

  const hoja = (nombre) => env.libro.getSheetByName(nombre);
  const encabezado = (nombre) => hoja(nombre).leerTodo()[0];

  // Alumnos cargados a mano: sin id. La última fila no tiene nombre.
  const alumno = (nombre, apellido, curso) =>
    ['', nombre, apellido, curso || '4to de secundaria', 'Unidad Educativa San Agustín', '80', 'hora', 'hora', '', '', ''];
  hoja('Alumnos').sembrar([encabezado('Alumnos'),
    alumno('Santiago', 'Aliendre'), alumno('Santiago', 'Méndez'), alumno('Ignacio', 'Méndez'),
    alumno('Agustín', 'Aliendre'), alumno('Katy', ''), alumno('Camila', ''), alumno('Adriana', ''),
    alumno('Gustavo', 'Cejas', '3ero de secundaria'),
    ['', '', 'SinNombre', '', '', '', '', '', 'una nota suelta', '', '']
  ]);

  const regla = (id, titulo, area, archivado) =>
    [id, titulo, area || 'Academia Fractal', 'Lun', '15:00', '16:00', '2026-09-01', '2026-12-15', '', 'nota ' + id, archivado || '', '', ''];
  hoja('Horario').sembrar([encabezado('Horario'),
    regla('h00000001', 'Santiago Aliendre'),
    regla('h00000002', 'Camila y Adriana'),
    regla('h00000003', 'Clase con Katy'), // tiene algo más que el nombre: el título queda
    regla('h00000004', 'Cálculo II', 'Universidad'),
    regla('h00000005', 'Gustavo Cejas'),
    regla('h00000006', 'Pedro'), // no está en Alumnos: pendiente
    regla('h00000007', 'Ignacio Méndez', '', 'TRUE') // archivada: no se toca
  ]);

  const bloque = (id, titulo, fecha, extra) => {
    const e = extra || {};
    return [id, titulo, e.area || 'Academia Fractal', 'fijo', fecha, '15:00', '16:00', '', 'nota ' + id,
      'c', 'a', e.archivado || '', '', e.lugar || ''];
  };
  hoja('Bloques').sembrar([encabezado('Bloques'),
    bloque('h00000001-2026-09-14', 'Santiago Aliendre', '2026-09-14'), // pasado
    bloque('h00000001-2026-09-28', 'Santiago Aliendre', '2026-09-28', { lugar: 'Casa' }), // futuro
    bloque('h00000002-2026-09-14', 'Camila y Adriana', '2026-09-14'),
    bloque('h00000002-2026-09-21', 'Camila y Adriana - Física', '2026-09-21'), // tema: el título queda
    bloque('h00000003-2026-09-14', 'Clase con Katy', '2026-09-14'),
    bloque('h00000005-2026-09-28', 'Gustavo Cejas', '2026-09-28', { archivado: 'TRUE' }), // archivado
    bloque('h00000006-2026-09-28', 'Pedro', '2026-09-28'), // regla pendiente
    bloque('h00000004-2026-09-14', 'Cálculo II', '2026-09-14', { area: 'Universidad' }),
    bloque('b0000000a', 'Agustín Aliendre', '2026-09-22'), // suelto: por el título
    bloque('b0000000b', 'Santiago', '2026-09-23') // suelto y ambiguo: pendiente
  ]);
  return { env, registro, hoja };
}

const todo = (hoja) => ['Alumnos', 'Horario', 'Bloques'].map((n) => hoja(n).leerTodo());
const lineas = (registro) => registro.map((args) => args.join(' '));

function idsPorNombre(hoja) {
  const ids = {};
  hoja('Alumnos').leerTodo().slice(1).forEach((f) => { ids[(f[1] + ' ' + f[2]).trim()] = f[0]; });
  return ids;
}

test('vista previa: no escribe nada y anota todo lo que haría', () => {
  const { env, registro, hoja } = preparar();
  const antes = JSON.stringify(todo(hoja));

  const r = env.llamar('repararAlumnosFractal()');
  assert.strictEqual(JSON.stringify(todo(hoja)), antes, 'ninguna hoja cambió');
  assert.strictEqual(r.ids.length, 8);
  assert.strictEqual(r.cursos.length, 1);
  assert.strictEqual(r.reglas.length, 4);
  const texto = lineas(registro).join('\n');
  assert.match(texto, /VISTA PREVIA: no se cambió nada/);
  assert.match(texto, /repararAlumnosFractalAplicar\(\)/);
});

test('aplicar: id solo a los alumnos con nombre, y el curso al del catálogo', () => {
  const { env, hoja } = preparar();
  env.llamar('repararAlumnosFractalAplicar()');

  const filas = hoja('Alumnos').leerTodo().slice(1);
  const conNombre = filas.filter((f) => f[1]);
  assert.strictEqual(conNombre.length, 8);
  conNombre.forEach((f) => assert.match(f[0], /^a[0-9a-f]{8}$/));
  assert.strictEqual(new Set(conNombre.map((f) => f[0])).size, 8, 'ids distintos');
  assert.deepStrictEqual(filas.find((f) => !f[1]), ['', '', 'SinNombre', '', '', '', '', '', 'una nota suelta', '', ''],
    'la fila sin nombre no se convierte en alumno');
  assert.strictEqual(filas.find((f) => f[1] === 'Gustavo')[3], '3ro de secundaria');
  assert.deepStrictEqual(filas.find((f) => f[1] === 'Katy').slice(1), ['Katy', '', '4to de secundaria',
    'Unidad Educativa San Agustín', '80', 'hora', 'hora', '', '', ''], 'el resto de la fila no cambia');
});

test('aplicar: vincula las reglas y vacía el título solo si es exactamente el nombre', () => {
  const { env, hoja } = preparar();
  const r = env.llamar('repararAlumnosFractalAplicar()');
  const ids = idsPorNombre(hoja);
  const reglas = Object.fromEntries(hoja('Horario').leerTodo().slice(1).map((f) => [f[0], f]));

  assert.deepStrictEqual([reglas.h00000001[1], reglas.h00000001[11]], ['', ids['Santiago Aliendre']]);
  assert.deepStrictEqual([reglas.h00000002[1], reglas.h00000002[11]], ['', ids.Camila + ',' + ids.Adriana]);
  assert.deepStrictEqual([reglas.h00000003[1], reglas.h00000003[11]], ['Clase con Katy', ids.Katy],
    'tiene algo más que el nombre: queda tal cual');
  assert.deepStrictEqual([reglas.h00000005[1], reglas.h00000005[11]], ['', ids['Gustavo Cejas']]);
  assert.deepStrictEqual([reglas.h00000006[1], reglas.h00000006[11]], ['Pedro', ''], 'no encontrado: sin tocar');
  assert.deepStrictEqual([reglas.h00000007[1], reglas.h00000007[11]], ['Ignacio Méndez', ''], 'archivada: sin tocar');
  assert.deepStrictEqual([reglas.h00000004[1], reglas.h00000004[11]], ['Cálculo II', ''], 'Universidad: sin tocar');
  assert.strictEqual(reglas.h00000002[9], 'nota h00000002', 'las notas no se tocan');

  assert.ok(r.titulosQueQuedan.some((t) => t.hoja === 'Horario' && t.titulo === 'Clase con Katy'));
  assert.ok(r.pendientes.some((p) => p.hoja === 'Horario' && /"Pedro" no está en Alumnos/.test(p.motivo)));
});

test('aplicar: los bloques pasados y futuros heredan los alumnos de su regla', () => {
  const { env, hoja } = preparar();
  const r = env.llamar('repararAlumnosFractalAplicar()');
  const ids = idsPorNombre(hoja);
  const b = Object.fromEntries(hoja('Bloques').leerTodo().slice(1).map((f) => [f[0], f]));
  const titYIds = (id) => [b[id][1], b[id][12]];

  assert.deepStrictEqual(titYIds('h00000001-2026-09-14'), ['', ids['Santiago Aliendre']], 'pasado');
  assert.deepStrictEqual(titYIds('h00000001-2026-09-28'), ['', ids['Santiago Aliendre']], 'futuro');
  assert.strictEqual(b['h00000001-2026-09-28'][13], 'Casa', 'el lugar no se toca');
  assert.deepStrictEqual(titYIds('h00000002-2026-09-14'), ['', ids.Camila + ',' + ids.Adriana]);
  assert.deepStrictEqual(titYIds('h00000002-2026-09-21'), ['Camila y Adriana - Física', ids.Camila + ',' + ids.Adriana],
    'con tema: el título queda tal cual');
  assert.deepStrictEqual(titYIds('h00000003-2026-09-14'), ['Clase con Katy', ids.Katy]);
  assert.deepStrictEqual(titYIds('h00000005-2026-09-28'), ['Gustavo Cejas', ''], 'archivado: sin tocar');
  assert.deepStrictEqual(titYIds('h00000006-2026-09-28'), ['Pedro', ''], 'su regla quedó pendiente');
  assert.deepStrictEqual(titYIds('h00000004-2026-09-14'), ['Cálculo II', ''], 'Universidad: sin tocar');
  assert.deepStrictEqual(titYIds('b0000000a'), ['', ids['Agustín Aliendre']], 'suelto: por el título');
  assert.deepStrictEqual(titYIds('b0000000b'), ['Santiago', ''], 'suelto y ambiguo: sin tocar');
  assert.strictEqual(b.b0000000a[8], 'nota b0000000a', 'las notas no se tocan');

  assert.ok(r.pendientes.some((p) => p.hoja === 'Bloques' && /ambiguo \(Santiago Aliendre \/ Santiago Méndez\)/.test(p.motivo)));
  assert.ok(r.pendientes.some((p) => p.hoja === 'Bloques' && /su regla \(fila 7 de Horario\) quedó sin alumnos/.test(p.motivo)));
});

test('después de aplicar, la auditoría ya no encuentra alumnos sin id ni clases sin vincular (salvo lo pendiente)', () => {
  const { env } = preparar();
  env.llamar('repararAlumnosFractalAplicar()');
  const titulos = env.llamar('auditarDatos()').hallazgos.map((h) => h.titulo + ': ' + h.cantidad);
  assert.ok(!titulos.some((t) => /forma rara \(no es "a"/.test(t)), titulos.join('\n'));
  assert.ok(!titulos.some((t) => /Curso que no está/.test(t)), titulos.join('\n'));
  // Quedan solo los pendientes a propósito: la regla "Pedro" y sus bloques, y el bloque "Santiago".
  assert.ok(titulos.includes('Reglas de Academia Fractal sin alumnos vinculados: 1'), titulos.join('\n'));
  assert.ok(titulos.includes('Bloques de Academia Fractal sin alumnos vinculados: 2'), titulos.join('\n'));
});

test('correrla dos veces: la segunda no cambia nada', () => {
  const { env, hoja } = preparar();
  env.llamar('repararAlumnosFractalAplicar()');
  const despues = JSON.stringify(todo(hoja));
  const r = env.llamar('repararAlumnosFractalAplicar()');
  assert.strictEqual(JSON.stringify(todo(hoja)), despues);
  assert.deepStrictEqual([r.ids.length, r.cursos.length, r.reglas.length, r.bloques.length], [0, 0, 0, 0]);
});

test('el registro llega a Logger ya armado: números enteros, nunca "8.0"', () => {
  const { env, registro } = preparar();
  env.llamar('repararAlumnosFractal()');
  env.llamar('auditarDatos()');
  assert.ok(registro.length > 10);
  registro.forEach((args) => {
    assert.strictEqual(args.length, 1, 'un solo texto, sin valores para que Logger los formatee: ' + args.join(' | '));
    assert.strictEqual(typeof args[0], 'string');
  });
  const texto = lineas(registro).join('\n');
  assert.match(texto, /1\. Ids de alumnos: 8\./);
  assert.match(texto, /AUDITORÍA DE DATOS .* 8 alumnos, 7 reglas, 10 bloques\./);
  assert.match(texto, /✓ Camila, Adriana: 2 bloques, del 2026-09-14 al 2026-09-21 \(título vaciado en 1\)/);
});

test('cursoParecidoDelCatalogo: variantes del ordinal, sin inventar', () => {
  const env = crearEntorno({ token: 'tk' });
  env.llamar('asegurarEstructura()');
  const curso = (texto) => env.llamar('cursoParecidoDelCatalogo(leerCatalogo("cursos"), __arg)', texto);
  assert.strictEqual(curso('3ero de secundaria'), '3ro de secundaria');
  assert.strictEqual(curso('3° de Secundaria'), '3ro de secundaria');
  assert.strictEqual(curso('3ro'), '3ro de secundaria');
  assert.strictEqual(curso('1ro de universidad'), null, 'no se parece a ninguno');
  assert.strictEqual(curso('7mo de secundaria'), null);
});

// --- Ajuste (a): alumnos cargados a mano en el Sheet -------------------------

test('leer alumnos pone id a los que tienen nombre y no tienen id; los sin nombre se ignoran', () => {
  const { env, hoja } = preparar();
  const r = env.post({ token: 'tk', action: 'listarAlumnos' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.alumnos.length, 8, 'la app los ve a todos');
  r.data.alumnos.forEach((a) => assert.match(a.id, /^a[0-9a-f]{8}$/));
  const filas = hoja('Alumnos').leerTodo().slice(1);
  assert.deepStrictEqual(filas.map((f) => f[0]), r.data.alumnos.map((a) => a.id).concat(['']),
    'quedaron escritos en la hoja; la fila sin nombre sigue sin id');

  const otraVez = env.post({ token: 'tk', action: 'listarAlumnos' }).data.alumnos;
  assert.deepStrictEqual(otraVez.map((a) => a.id), r.data.alumnos.map((a) => a.id), 'el id es estable');
});

test('las vistas previas (importar y migrar) no escriben ids', () => {
  const { env, hoja } = preparar();
  const antes = JSON.stringify(hoja('Alumnos').leerTodo());
  let r = env.post({ token: 'tk', action: 'importar', modo: 'alumnos', texto: 'Katy\t\t\t\t90' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.filas[0].estado, 'actualizar', 'reconoce a Katy aunque no tenga id');
  r = env.post({ token: 'tk', action: 'importar', modo: 'horario',
    texto: '\tAcademia Fractal\tMar\t10:00\t11:00\t2026-09-01\t2026-12-01\t\t\tKaty' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.data.filas[0].estado, 'crear', 'encuentra a Katy por nombre: ' + r.data.filas[0].detalle);
  r = env.post({ token: 'tk', action: 'migrarAlumnosFractal' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(JSON.stringify(hoja('Alumnos').leerTodo()), antes);
});

// --- Ajuste (b): migración con un nombre de varios alumnos --------------------

test('migración: un nombre ambiguo no crea un alumno nuevo, queda sin resolver', () => {
  const { env, hoja } = preparar();
  const plan = env.post({ token: 'tk', action: 'migrarAlumnosFractal' }).data;
  assert.ok(!plan.alumnosNuevos.includes('Santiago'), plan.alumnosNuevos.join(', '));
  const santiago = plan.sinResolver.find((s) => s.id === 'b0000000b');
  assert.ok(santiago, 'el bloque "Santiago" queda sin resolver');
  assert.match(santiago.motivo, /varios alumnos con ese nombre \(Santiago Aliendre \/ Santiago Méndez\)/);
  assert.ok(!plan.filas.some((f) => f.id === 'b0000000b'));

  env.post({ token: 'tk', action: 'migrarAlumnosFractal', aplicar: true });
  const santiagos = hoja('Alumnos').leerTodo().filter((f) => f[1] === 'Santiago');
  assert.strictEqual(santiagos.length, 2, 'siguen siendo dos: no se creó un tercero');
  assert.strictEqual(hoja('Bloques').leerTodo().find((f) => f[0] === 'b0000000b')[1], 'Santiago', 'sin tocar');
});
