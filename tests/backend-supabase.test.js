'use strict';

/**
 * Conexión con Supabase (Checkpoint 13): js/supabase.js (inicio de sesión,
 * renovación del token, peticiones REST, errores) y js/db.js (cómo se
 * arman las consultas y cómo se traducen los datos). Con un fetch falso
 * que contesta como Supabase: no sale nada a internet.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const URL_REST = 'https://jpceexuzagfyiqvoxmud.supabase.co/rest/v1/';
const URL_AUTH = 'https://jpceexuzagfyiqvoxmud.supabase.co/auth/v1/';

/** Respuesta HTTP mínima, como la de fetch. */
function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => (cuerpo === undefined ? '' : JSON.stringify(cuerpo)) };
}

const SESION_OK = { access_token: 'acceso-1', refresh_token: 'renueva-1', expires_in: 3600, user: { email: 'gerardo@ejemplo.com' } };

/**
 * contestar(pedido) → respuesta. Cada pedido queda anotado:
 * { url, metodo, cabeceras, cuerpo }.
 */
function cargar(contestar, opciones) {
  const almacen = Object.assign({}, (opciones && opciones.almacen) || {});
  const pedidos = [];
  const reloj = { t: Date.UTC(2026, 9, 16, 15, 0) };
  const contexto = {
    console, JSON, Intl, Promise,
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [reloj.t])); }
      static now() { return reloj.t; }
    },
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; }
    },
    fetch: async (url, init) => {
      const pedido = {
        url, metodo: init.method, cabeceras: init.headers,
        cuerpo: init.body === undefined ? undefined : JSON.parse(init.body)
      };
      pedidos.push(pedido);
      return contestar(pedido, pedidos.length);
    }
  };
  vm.createContext(contexto);
  ['js/supabase.js', 'js/db.js'].forEach((archivo) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'), contexto, { filename: archivo });
  });
  return {
    S: vm.runInContext('KodamaSupabase', contexto),
    DB: vm.runInContext('KodamaDB', contexto),
    almacen, pedidos, reloj,
    avanzar: (ms) => { reloj.t += ms; }
  };
}

function sesionGuardada(extra) {
  return { 'kodama.sesion': JSON.stringify(Object.assign({
    access_token: 'acceso-1', refresh_token: 'renueva-1', expira: Date.UTC(2026, 9, 16, 16, 0), correo: 'gerardo@ejemplo.com'
  }, extra || {})) };
}

// ---------------------------------------------------------------
// Inicio de sesión
// ---------------------------------------------------------------

test('iniciar sesión: pide el token con la clave pública y guarda la sesión en el dispositivo', async () => {
  const { S, almacen, pedidos } = cargar(() => respuesta(200, SESION_OK));
  assert.strictEqual(S.haySesion(), false);
  await S.iniciarSesion('  gerardo@ejemplo.com ', 'secreta');

  assert.strictEqual(pedidos[0].url, URL_AUTH + 'token?grant_type=password');
  assert.strictEqual(pedidos[0].metodo, 'POST');
  assert.match(pedidos[0].cabeceras.apikey, /^sb_publishable_/);
  assert.strictEqual(pedidos[0].cabeceras.Authorization, undefined, 'la clave pública nunca va como Bearer');
  assert.deepStrictEqual(pedidos[0].cuerpo, { email: 'gerardo@ejemplo.com', password: 'secreta' });

  assert.strictEqual(S.haySesion(), true);
  assert.strictEqual(S.correo(), 'gerardo@ejemplo.com');
  const guardada = JSON.parse(almacen['kodama.sesion']);
  assert.deepStrictEqual(Object.keys(guardada).sort(), ['access_token', 'correo', 'expira', 'refresh_token']);
  assert.ok(!JSON.stringify(guardada).includes('secreta'), 'la contraseña no se guarda');
  assert.strictEqual(guardada.expira, Date.UTC(2026, 9, 16, 16, 0), 'vence en una hora');
});

test('contraseña mal: mensaje claro, sin sesión (los dos formatos de error de Supabase)', async () => {
  for (const cuerpo of [
    { error: 'invalid_grant', error_description: 'Invalid login credentials' },
    { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }
  ]) {
    const { S } = cargar(() => respuesta(400, cuerpo));
    await assert.rejects(S.iniciarSesion('gerardo@ejemplo.com', 'mal'), /^Error: Correo o contraseña incorrectos\.$/);
    assert.strictEqual(S.haySesion(), false);
  }
  const { S, pedidos } = cargar(() => respuesta(200, SESION_OK));
  await assert.rejects(S.iniciarSesion('', ''), /Escribe tu correo y tu contraseña/);
  assert.strictEqual(pedidos.length, 0, 'sin datos ni siquiera se pregunta');
});

test('cerrar sesión: se borra del dispositivo y se avisa al servidor; si el aviso falla, igual queda cerrada', async () => {
  const { S, almacen, pedidos } = cargar(() => { throw new TypeError('Failed to fetch'); }, { almacen: sesionGuardada() });
  assert.strictEqual(S.haySesion(), true);
  await S.cerrarSesion();
  assert.strictEqual(S.haySesion(), false);
  assert.strictEqual(almacen['kodama.sesion'], undefined);
  assert.strictEqual(pedidos[0].url, URL_AUTH + 'logout');
  assert.strictEqual(pedidos[0].cabeceras.Authorization, 'Bearer acceso-1');
});

// ---------------------------------------------------------------
// Peticiones REST y renovación del token
// ---------------------------------------------------------------

test('una petición lleva la clave pública y el token de la sesión', async () => {
  const { S, pedidos } = cargar(() => respuesta(200, [{ nombre: 'Universidad' }]), { almacen: sesionGuardada() });
  const datos = await S.rest('GET', 'areas?select=*');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(datos)), [{ nombre: 'Universidad' }]);
  assert.strictEqual(pedidos[0].url, URL_REST + 'areas?select=*');
  assert.match(pedidos[0].cabeceras.apikey, /^sb_publishable_/);
  assert.strictEqual(pedidos[0].cabeceras.Authorization, 'Bearer acceso-1');
});

test('sin sesión no sale ninguna petición', async () => {
  const { S, pedidos } = cargar(() => respuesta(200, []));
  await assert.rejects(S.rest('GET', 'areas'), /^Error: sin_sesion/);
  assert.strictEqual(pedidos.length, 0);
});

test('a un minuto de vencer, se renueva antes de pedir; varias peticiones juntas renuevan una sola vez', async () => {
  const { S, pedidos, almacen, avanzar } = cargar((p) => {
    if (p.url.startsWith(URL_AUTH)) return respuesta(200, Object.assign({}, SESION_OK, { access_token: 'acceso-2', refresh_token: 'renueva-2' }));
    return respuesta(200, []);
  }, { almacen: sesionGuardada() });
  avanzar(59.5 * 60 * 1000); // faltan 30 s

  await Promise.all([S.rest('GET', 'areas'), S.rest('GET', 'cursos'), S.rest('GET', 'colegios')]);

  const renovaciones = pedidos.filter((p) => p.url.startsWith(URL_AUTH));
  assert.strictEqual(renovaciones.length, 1);
  assert.strictEqual(renovaciones[0].url, URL_AUTH + 'token?grant_type=refresh_token');
  assert.deepStrictEqual(renovaciones[0].cuerpo, { refresh_token: 'renueva-1' });
  pedidos.filter((p) => p.url.startsWith(URL_REST)).forEach((p) => assert.strictEqual(p.cabeceras.Authorization, 'Bearer acceso-2'));
  const guardada = JSON.parse(almacen['kodama.sesion']);
  assert.deepStrictEqual([guardada.access_token, guardada.refresh_token, guardada.correo], ['acceso-2', 'renueva-2', 'gerardo@ejemplo.com']);
});

test('si el servidor dice 401 (token vencido antes de tiempo), se renueva y se reintenta una sola vez', async () => {
  const { S, pedidos } = cargar((p, n) => {
    if (p.url.startsWith(URL_AUTH)) return respuesta(200, Object.assign({}, SESION_OK, { access_token: 'acceso-2' }));
    return n === 1 ? respuesta(401, { code: 'PGRST301', message: 'JWT expired' }) : respuesta(200, [{ ok: 1 }]);
  }, { almacen: sesionGuardada() });
  const datos = await S.rest('GET', 'areas');
  assert.strictEqual(datos.length, 1);
  assert.deepStrictEqual(pedidos.map((p) => p.url.replace(/^https:\/\/[^/]+/, '')), ['/rest/v1/areas', '/auth/v1/token?grant_type=refresh_token', '/rest/v1/areas']);
});

test('si la renovación es rechazada, la sesión se borra y el error lo dice', async () => {
  const { S } = cargar((p) => {
    if (p.url.startsWith(URL_AUTH)) return respuesta(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    return respuesta(401, { message: 'JWT expired' });
  }, { almacen: sesionGuardada({ expira: 0 }) });
  await assert.rejects(S.rest('GET', 'areas'), /sesion_vencida: vuelve a iniciar sesión en Configuración/);
  assert.strictEqual(S.haySesion(), false);
});

test('sin red: el error queda marcado como "red" y la sesión no se toca', async () => {
  const { S } = cargar(() => { throw new TypeError('Failed to fetch'); }, { almacen: sesionGuardada({ expira: 0 }) });
  const error = await S.rest('GET', 'areas').catch((e) => e);
  assert.strictEqual(error.red, true);
  assert.strictEqual(S.haySesion(), true, 'sin red no se pierde la sesión');
});

test('errores de la base con un prefijo claro y su código; un servidor caído cuenta como sin conexión', async () => {
  const casos = [
    [409, { code: '23505', message: 'duplicate key value' }, /^Error: duplicado: duplicate key value$/, '23505', undefined],
    [409, { code: '23503', message: 'violates foreign key' }, /^Error: referencia_invalida: /, '23503', undefined],
    [400, { code: '23514', message: 'violates check constraint' }, /^Error: dato_invalido: /, '23514', undefined],
    [403, { code: '42501', message: 'new row violates row-level security policy' }, /^Error: no_autorizado: .*inicia sesión de nuevo/, '42501', undefined],
    [503, { message: 'Service Unavailable' }, /^Error: servidor_no_disponible: .*en pausa/, '', true]
  ];
  for (const [status, cuerpo, mensaje, codigo, red] of casos) {
    const { S } = cargar(() => respuesta(status, cuerpo), { almacen: sesionGuardada() });
    const error = await S.rest('POST', 'bloques', { cuerpo: [] }).catch((e) => e);
    assert.match(String(error), mensaje);
    assert.strictEqual(error.codigo, codigo);
    assert.strictEqual(error.red, red);
  }
});

// ---------------------------------------------------------------
// js/db.js: consultas y traducción de datos
// ---------------------------------------------------------------

test('filtros: igual, rango, sí/no, lista entre comillas, patrón y "no vacío"', () => {
  const { DB } = cargar(() => respuesta(200, []));
  assert.strictEqual(DB.consulta([['fecha', 'gte', '2026-10-12'], ['fecha', 'lte', '2026-10-18'], ['archivado', 'is', false]]),
    'fecha=gte.2026-10-12&fecha=lte.2026-10-18&archivado=is.false');
  assert.strictEqual(DB.consulta([['area', 'eq', 'Academia Fractal']]), 'area=eq.Academia%20Fractal');
  assert.strictEqual(DB.consulta([['id', 'in', ['a1', 'a"2', 'a,3']]]), 'id=in.' + encodeURIComponent('("a1","a\\"2","a,3")'));
  assert.strictEqual(DB.consulta([['id', 'like', 'b*'], ['serie_id', 'not_null'], ['fecha_pago', 'is', null]]),
    'id=like.b*&serie_id=not.is.null&fecha_pago=is.null');
  assert.strictEqual(DB.consulta([], { select: '*', order: 'fecha.asc,inicio.asc', limit: 1000, offset: undefined }),
    'select=*&order=fecha.asc,inicio.asc&limit=1000');
});

test('leer pide de a 1000 filas hasta que vienen menos (Supabase no da más de 1000 por petición)', async () => {
  const fila = { id: 'b1', fecha: '2026-10-12', inicio: '09:00', fin: '10:00', area: 'Personal', tipo: 'variable', archivado: false, alumno_ids: [], estado: 'programada' };
  const { DB, pedidos } = cargar((p, n) => respuesta(200, Array(n === 1 ? 1000 : 3).fill(fila)), { almacen: sesionGuardada() });
  const filas = await DB.leer('bloques', [['archivado', 'is', false]]);
  assert.strictEqual(filas.length, 1003);
  assert.deepStrictEqual(pedidos.map((p) => p.url.slice(URL_REST.length)), [
    'bloques?archivado=is.false&select=*&order=fecha.asc,inicio.asc,orden.asc&limit=1000',
    'bloques?archivado=is.false&select=*&order=fecha.asc,inicio.asc,orden.asc&limit=1000&offset=1000'
  ]);
});

test('escribir: insertar, guardar (upsert por la clave) y editar, sin pedir la fila de vuelta; muchas filas van en lotes', async () => {
  const { DB, pedidos } = cargar(() => respuesta(201), { almacen: sesionGuardada() });
  const bloque = { id: 'b1', titulo: 'X', area: 'Personal', tipo: 'variable', fecha: '2026-10-12', inicio: '09:00', fin: '10:00' };
  await DB.insertar('bloques', Array(1200).fill(bloque));
  await DB.guardar('alumnos', [{ id: 'a1', nombre: 'Katy' }]);
  await DB.actualizar('cursos', [['nombre', 'eq', '1ro']], { nombre: '1ro de secundaria' });

  const inserciones = pedidos.filter((p) => p.url === URL_REST + 'bloques');
  assert.deepStrictEqual(inserciones.map((p) => p.cuerpo.length), [500, 500, 200]);
  inserciones.forEach((p) => assert.deepStrictEqual([p.metodo, p.cabeceras.Prefer], ['POST', 'return=minimal']));
  const upsert = pedidos.find((p) => p.url.startsWith(URL_REST + 'alumnos'));
  assert.strictEqual(upsert.url, URL_REST + 'alumnos?on_conflict=id');
  assert.strictEqual(upsert.cabeceras.Prefer, 'resolution=merge-duplicates,return=minimal');
  const patch = pedidos.find((p) => p.metodo === 'PATCH');
  assert.strictEqual(patch.url, URL_REST + 'cursos?nombre=eq.1ro');
  assert.deepStrictEqual(patch.cuerpo, { nombre: '1ro de secundaria' }, 'al editar solo van los campos que cambian');
});

test('editar o borrar sin filtro se niega (nunca toca una tabla entera)', async () => {
  const { DB, pedidos } = cargar(() => respuesta(200, []), { almacen: sesionGuardada() });
  await assert.rejects(DB.actualizar('bloques', [], { archivado: 'TRUE' }), /falta_filtro/);
  await assert.rejects(DB.borrar('bloques', []), /falta_filtro/);
  assert.strictEqual(pedidos.length, 0);
});

test('traducción: de la base a la app todo es texto como en el Sheet, y de vuelta', () => {
  const { DB } = cargar(() => respuesta(200, []));
  const deLaBase = {
    id: 'h1234abcd-2026-10-15', titulo: null, area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-15',
    inicio: '15:00', fin: '16:30', etiqueta: null, notas: null, creado: '2026-09-25T20:32:00+00:00',
    actualizado: '2026-10-01T03:05:00+00:00', archivado: false, alumno_ids: ['a1', 'a2'], lugar: 'CAFESA',
    estado: 'dictada', fecha_original: null, inicio_original: null, fin_original: null, motivo: null,
    serie_id: 'h1234abcd', owner: 'u1', orden: 42
  };
  const app = JSON.parse(JSON.stringify(DB.aApp('bloques', deLaBase)));
  assert.deepStrictEqual(app, {
    id: 'h1234abcd-2026-10-15', titulo: '', area: 'Academia Fractal', tipo: 'fijo', fecha: '2026-10-15',
    inicio: '15:00', fin: '16:30', etiqueta: '', notas: '', creado: '2026-09-25 16:32',
    actualizado: '2026-09-30 23:05', archivado: '', alumno_id: 'a1,a2', lugar: 'CAFESA',
    estado: 'dictada', fecha_original: '', inicio_original: '', fin_original: '', motivo: ''
  }, 'sin serie_id, owner ni orden; la hora es la de La Paz');

  const vuelta = JSON.parse(JSON.stringify(DB.aBase('bloques', app)));
  assert.deepStrictEqual(vuelta.alumno_ids, ['a1', 'a2']);
  assert.strictEqual(vuelta.archivado, false);
  assert.strictEqual(vuelta.titulo, null);
  assert.strictEqual(vuelta.creado, '2026-09-25T16:32:00-04:00');
  assert.ok(!('serie_id' in vuelta) && !('owner' in vuelta) && !('orden' in vuelta), 'lo que calcula la base no se manda');

  assert.strictEqual(DB.aBase('bloques', Object.assign({}, app, { estado: '' })).estado, 'programada', 'vacío = programada, como en el Sheet');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(DB.aBase('alumnos', { tarifa_hora: '80.5', archivado: 'TRUE' }, true))), { tarifa_hora: 80.5, archivado: true });
  assert.strictEqual(DB.aApp('alumnos', { tarifa_hora: 80 }).tarifa_hora, '80');
  assert.strictEqual(DB.aApp('pagos', { monto: 640.5 }).monto, '640.5');
  assert.strictEqual(DB.aApp('plantillas', { duracion: 90 }).duracion, '90');
});

// ---------------------------------------------------------------
// Las pantallas cargan todo, en orden
// ---------------------------------------------------------------

test('cada pantalla carga la conexión y el backend antes de api.js, en el orden en que se necesitan', () => {
  const orden = [
    'js/supabase.js', 'js/db.js', 'js/backend/comun.js', 'js/backend/bloques.js', 'js/backend/horario.js',
    'js/backend/alumnos.js', 'js/backend/importar.js', 'js/backend/pagos.js', 'js/backend/acciones.js', 'js/api.js'
  ];
  ['index.html', 'horario.html', 'alumnos.html', 'config.html', 'cobros.html', 'estadisticas.html'].forEach((pagina) => {
    const html = fs.readFileSync(path.join(__dirname, '..', pagina), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => orden.includes(s));
    assert.deepStrictEqual(scripts, orden, pagina);
    assert.ok(!/script\.google\.com|leerConfig/.test(html), pagina + ' ya no habla del Web App');
  });
});
