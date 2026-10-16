'use strict';

/**
 * Base de datos falsa en memoria, para probar js/backend/ con Node sin
 * tocar Supabase (Checkpoint 13).
 *
 * Implementa el mismo "transporte" que js/db.js usa con la API REST:
 * seleccionar, insertar, guardar (upsert), actualizar y borrar, con los
 * mismos filtros (eq, neq, gt, gte, lt, lte, in, is, not_null, like).
 * Las filas están en formato de la BASE (booleanos, listas, null), así las
 * pruebas también ejercitan la conversión de js/db.js.
 *
 * Imita a propósito lo que haría la base real y rompería en producción
 * (ver supabase/migraciones/): clave repetida (23505), columna obligatoria
 * vacía (23502), valor fuera de lo permitido (23514), fecha imposible
 * (22008), área/curso/colegio/alumno que no existe (23503), renombrar un
 * curso o colegio cambia a sus alumnos (on update cascade), la serie de un
 * bloque sale sola de su id, "actualizado" se pone solo al editar, y todas
 * las filas de un mismo envío tienen que traer las mismas columnas (lo
 * exige la API REST al insertar varias juntas). Cada envío es todo o nada.
 */

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// Lo mismo que el esquema: obligatorias (not null sin valor por defecto),
// valores por defecto, reglas y enlaces.
const ESQUEMA = {
  areas: {
    clave: 'nombre',
    columnas: ['nombre', 'color', 'posicion'],
    obligatorias: ['nombre', 'color'],
    porDefecto: { posicion: 0 },
    reglas: [(f) => /^#[0-9A-Fa-f]{6}$/.test(f.color) || 'color']
  },
  cursos: { clave: 'nombre', columnas: ['nombre', 'corto'], obligatorias: ['nombre'], porDefecto: {} },
  colegios: { clave: 'nombre', columnas: ['nombre', 'corto'], obligatorias: ['nombre'], porDefecto: {} },
  alumnos: {
    clave: 'id',
    columnas: ['id', 'nombre', 'apellido', 'curso', 'colegio', 'tarifa_hora', 'forma_calculo', 'forma_pago', 'notas',
      'lugar', 'archivado', 'materias', 'tutor_nombre', 'tutor_parentesco', 'tutor_telefono', 'fecha_inicio'],
    obligatorias: ['id', 'nombre'],
    porDefecto: { archivado: false },
    enlaces: { curso: 'cursos', colegio: 'colegios' },
    reglas: [
      (f) => /^a[0-9a-f]{8}$/.test(f.id) || 'id',
      (f) => f.tarifa_hora === null || f.tarifa_hora >= 0 || 'tarifa_hora'
    ],
    fechas: ['fecha_inicio']
  },
  horario: {
    clave: 'id',
    columnas: ['id', 'titulo', 'area', 'dias', 'inicio', 'fin', 'desde', 'hasta', 'etiqueta', 'notas', 'archivado',
      'alumno_ids', 'lugar', 'creado'],
    momentos: ['creado'],
    obligatorias: ['id', 'area', 'dias', 'inicio', 'fin', 'desde', 'hasta'],
    porDefecto: { archivado: false, alumno_ids: [] },
    enlaces: { area: 'areas' },
    reglas: [
      (f) => /^h[0-9a-f]{8}$/.test(f.id) || 'id',
      (f) => (HORA.test(f.inicio) && HORA.test(f.fin)) || 'hora',
      (f) => f.fin > f.inicio || 'fin > inicio',
      (f) => f.hasta >= f.desde || 'hasta >= desde'
    ],
    fechas: ['desde', 'hasta']
  },
  bloques: {
    clave: 'id',
    columnas: ['id', 'titulo', 'area', 'tipo', 'fecha', 'inicio', 'fin', 'etiqueta', 'notas', 'creado', 'actualizado',
      'archivado', 'alumno_ids', 'lugar', 'estado', 'fecha_original', 'inicio_original', 'fin_original', 'motivo'],
    obligatorias: ['id', 'area', 'tipo', 'fecha', 'inicio', 'fin'],
    porDefecto: { archivado: false, alumno_ids: [], estado: 'programada' },
    momentos: ['creado', 'actualizado'],
    enlaces: { area: 'areas' },
    reglas: [
      (f) => ['fijo', 'variable', 'reunión'].indexOf(f.tipo) !== -1 || 'tipo',
      (f) => ['programada', 'dictada', 'movida', 'cancelada'].indexOf(f.estado) !== -1 || 'estado',
      (f) => (HORA.test(f.inicio) && HORA.test(f.fin)) || 'hora',
      (f) => f.inicio_original === null || f.inicio_original === undefined || HORA.test(f.inicio_original) || 'inicio_original',
      (f) => f.fin_original === null || f.fin_original === undefined || HORA.test(f.fin_original) || 'fin_original',
      (f) => f.fin > f.inicio || 'fin > inicio'
    ],
    fechas: ['fecha', 'fecha_original'],
    tocarAlEditar: 'actualizado',
    generadas: { serie_id: (f) => (/^h[0-9a-f]{8}-/.test(f.id) ? f.id.slice(0, 9) : null) }
  },
  pagos: {
    clave: 'id',
    columnas: ['id', 'alumno_id', 'desde', 'hasta', 'monto', 'fecha_pago', 'estado', 'notas', 'creado', 'archivado'],
    obligatorias: ['id', 'alumno_id', 'desde', 'hasta', 'monto'],
    porDefecto: { archivado: false, estado: 'pendiente' },
    momentos: ['creado'],
    enlaces: { alumno_id: 'alumnos' },
    reglas: [
      (f) => f.monto >= 0 || 'monto',
      (f) => ['pendiente', 'pagado'].indexOf(f.estado) !== -1 || 'estado',
      (f) => f.hasta >= f.desde || 'hasta >= desde'
    ],
    fechas: ['desde', 'hasta', 'fecha_pago']
  },
  plantillas: {
    clave: 'id',
    columnas: ['id', 'nombre', 'area', 'tipo', 'titulo', 'alumno_ids', 'duracion', 'lugar', 'etiqueta', 'creado', 'archivado'],
    obligatorias: ['id', 'nombre', 'area', 'tipo'],
    porDefecto: { archivado: false, alumno_ids: [] },
    momentos: ['creado'],
    enlaces: { area: 'areas' },
    reglas: [
      (f) => ['fijo', 'variable', 'reunión'].indexOf(f.tipo) !== -1 || 'tipo',
      (f) => f.duracion === null || f.duracion === undefined || f.duracion > 0 || 'duracion'
    ]
  }
};

// Quién se renombra solo cuando cambia el nombre de su catálogo.
const CASCADAS = {
  areas: [['horario', 'area'], ['bloques', 'area'], ['plantillas', 'area']],
  cursos: [['alumnos', 'curso']],
  colegios: [['alumnos', 'colegio']]
};

function clonar(valor) {
  return valor === undefined ? undefined : JSON.parse(JSON.stringify(valor));
}

function errorDeBase(codigo, mensaje) {
  const prefijos = { 23505: 'duplicado', 23502: 'dato_invalido', 23514: 'dato_invalido', 22008: 'dato_invalido', 23503: 'referencia_invalida', 42703: 'error_base_datos' };
  const error = new Error((prefijos[codigo] || 'error_base_datos') + ': ' + mensaje);
  error.codigo = String(codigo);
  return error;
}

function fechaReal(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function cumple(fila, filtro) {
  const [columna, operador, valor] = filtro;
  const actual = fila[columna];
  switch (operador) {
    case 'eq': return actual !== null && actual !== undefined && String(actual) === String(valor);
    case 'neq': return actual !== null && actual !== undefined && String(actual) !== String(valor);
    case 'gt': return actual !== null && actual !== undefined && actual > valor;
    case 'gte': return actual !== null && actual !== undefined && actual >= valor;
    case 'lt': return actual !== null && actual !== undefined && actual < valor;
    case 'lte': return actual !== null && actual !== undefined && actual <= valor;
    case 'in': return actual !== null && actual !== undefined && valor.map(String).indexOf(String(actual)) !== -1;
    case 'is': return valor === null ? actual === null || actual === undefined : actual === valor;
    case 'not_null': return actual !== null && actual !== undefined;
    case 'like': {
      const patron = new RegExp('^' + String(valor).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      return actual !== null && actual !== undefined && patron.test(String(actual));
    }
    default: throw new Error('operador desconocido en la base falsa: ' + operador);
  }
}

function ordenar(filas, orden) {
  const criterios = String(orden || '').split(',').filter(Boolean).map((c) => {
    const [columna, sentido] = c.split('.');
    return { columna, desc: sentido === 'desc' };
  });
  return filas.slice().sort((a, b) => {
    for (const c of criterios) {
      const x = a[c.columna];
      const y = b[c.columna];
      if (x === y) continue;
      if (x === null || x === undefined) return 1; // nulls al final, como Postgres en asc
      if (y === null || y === undefined) return -1;
      const r = x < y ? -1 : 1;
      return c.desc ? -r : r;
    }
    return 0;
  });
}

/**
 * opciones.ahora: función que devuelve el instante actual (ISO), para
 * "creado"/"actualizado" por defecto.
 */
function crearBaseFalsa(opciones) {
  const ahora = (opciones && opciones.ahora) || (() => new Date().toISOString());
  const tablas = {};
  Object.keys(ESQUEMA).forEach((t) => { tablas[t] = []; });
  let siguienteOrden = 1;
  const peticiones = [];

  function esquema(tabla) {
    if (!ESQUEMA[tabla]) throw errorDeBase(42703, 'no existe la tabla ' + tabla);
    return ESQUEMA[tabla];
  }

  /** Una columna que no existe (o que calcula la base, como serie_id) no se puede escribir. */
  function exigirColumnasConocidas(tabla, fila) {
    const e = esquema(tabla);
    Object.keys(fila).forEach((c) => {
      if (e.columnas.indexOf(c) === -1) {
        throw errorDeBase(42703, 'no se puede escribir la columna ' + tabla + '.' + c);
      }
    });
  }

  function completar(tabla, fila) {
    const e = esquema(tabla);
    exigirColumnasConocidas(tabla, fila);
    const completa = Object.assign({}, fila);
    Object.keys(e.porDefecto).forEach((c) => {
      if (completa[c] === undefined) completa[c] = clonar(e.porDefecto[c]);
    });
    (e.momentos || []).forEach((c) => {
      if (completa[c] === undefined || completa[c] === null) completa[c] = ahora();
    });
    completa.owner = 'yo';
    completa.orden = siguienteOrden++;
    return completa;
  }

  function calcularGeneradas(tabla, fila) {
    const e = esquema(tabla);
    Object.keys(e.generadas || {}).forEach((c) => { fila[c] = e.generadas[c](fila); });
  }

  function validar(tabla, fila, contenido) {
    const e = esquema(tabla);
    e.obligatorias.forEach((c) => {
      if (fila[c] === null || fila[c] === undefined || fila[c] === '') {
        throw errorDeBase(23502, 'falta la columna obligatoria ' + tabla + '.' + c);
      }
    });
    (e.fechas || []).forEach((c) => {
      if (fila[c] !== null && fila[c] !== undefined && !fechaReal(fila[c])) {
        throw errorDeBase(22008, 'fecha imposible en ' + tabla + '.' + c + ': ' + fila[c]);
      }
    });
    (e.reglas || []).forEach((regla) => {
      const r = regla(fila);
      if (r !== true) throw errorDeBase(23514, 'no cumple ' + tabla + ' (' + r + '): ' + JSON.stringify(fila));
    });
    Object.keys(e.enlaces || {}).forEach((c) => {
      const destino = e.enlaces[c];
      if (fila[c] === null || fila[c] === undefined) return;
      const claveDestino = ESQUEMA[destino].clave;
      if (!contenido[destino].some((otra) => otra[claveDestino] === fila[c])) {
        throw errorDeBase(23503, tabla + '.' + c + ' = "' + fila[c] + '" no existe en ' + destino);
      }
    });
  }

  function exigirMismasColumnas(tabla, filas) {
    if (!filas.length) return;
    const primera = Object.keys(filas[0]).sort().join(',');
    filas.forEach((f, i) => {
      if (Object.keys(f).sort().join(',') !== primera) {
        throw new Error('la fila ' + i + ' de un envío a ' + tabla + ' trae otras columnas que la primera (la API REST lo rechaza)');
      }
    });
  }

  function exigirUnica(tabla, contenido) {
    const clave = esquema(tabla).clave;
    const vistas = {};
    contenido[tabla].forEach((f) => {
      if (vistas[f[clave]]) throw errorDeBase(23505, 'clave repetida en ' + tabla + ': ' + f[clave]);
      vistas[f[clave]] = true;
    });
  }

  /** Aplica un cambio sobre una copia; si algo falla, no queda nada a medias. */
  function enTransaccion(cambiar) {
    const copia = clonar(tablas);
    const resultado = cambiar(copia);
    Object.keys(copia).forEach((t) => { tablas[t] = copia[t]; });
    return resultado;
  }

  function validarTodo(contenido, tocadas) {
    tocadas.forEach((t) => {
      exigirUnica(t, contenido);
      contenido[t].forEach((f) => validar(t, f, contenido));
    });
  }

  function anotar(op, tabla, filtros) {
    peticiones.push({ op, tabla, filtros: clonar(filtros || []) });
  }

  const transporte = {
    async seleccionar(tabla, filtros, orden) {
      anotar('seleccionar', tabla, filtros);
      esquema(tabla);
      const filas = tablas[tabla].filter((f) => (filtros || []).every((filtro) => cumple(f, filtro)));
      return clonar(ordenar(filas, orden));
    },
    async insertar(tabla, filas) {
      anotar('insertar', tabla);
      exigirMismasColumnas(tabla, filas);
      enTransaccion((copia) => {
        filas.forEach((fila) => {
          const nueva = completar(tabla, clonar(fila));
          calcularGeneradas(tabla, nueva);
          copia[tabla].push(nueva);
        });
        validarTodo(copia, [tabla]);
      });
    },
    async guardar(tabla, filas, clave) {
      anotar('guardar', tabla);
      exigirMismasColumnas(tabla, filas);
      const e = esquema(tabla);
      if (clave !== e.clave) throw new Error('guardar por ' + clave + ' en ' + tabla + ': la clave es ' + e.clave);
      filas.forEach((fila) => exigirColumnasConocidas(tabla, fila));
      enTransaccion((copia) => {
        filas.forEach((fila) => {
          const existente = copia[tabla].find((f) => f[clave] === fila[clave]);
          if (existente) {
            Object.assign(existente, clonar(fila));
            if (e.tocarAlEditar) existente[e.tocarAlEditar] = ahora();
            calcularGeneradas(tabla, existente);
          } else {
            const nueva = completar(tabla, clonar(fila));
            calcularGeneradas(tabla, nueva);
            copia[tabla].push(nueva);
          }
        });
        validarTodo(copia, [tabla]);
      });
    },
    async actualizar(tabla, filtros, cambios) {
      anotar('actualizar', tabla, filtros);
      if (!filtros || !filtros.length) throw new Error('actualizar sin filtro');
      const e = esquema(tabla);
      exigirColumnasConocidas(tabla, cambios);
      enTransaccion((copia) => {
        const tocadas = [tabla];
        copia[tabla].filter((f) => filtros.every((filtro) => cumple(f, filtro))).forEach((fila) => {
          const anterior = fila[e.clave];
          Object.assign(fila, clonar(cambios));
          if (e.tocarAlEditar) fila[e.tocarAlEditar] = ahora();
          calcularGeneradas(tabla, fila);
          if (fila[e.clave] !== anterior) {
            (CASCADAS[tabla] || []).forEach(([otra, columna]) => {
              copia[otra].forEach((f) => { if (f[columna] === anterior) f[columna] = fila[e.clave]; });
              tocadas.push(otra);
            });
          }
        });
        validarTodo(copia, tocadas);
      });
    },
    async borrar(tabla, filtros) {
      anotar('borrar', tabla, filtros);
      if (!filtros || !filtros.length) throw new Error('borrar sin filtro');
      esquema(tabla);
      return enTransaccion((copia) => {
        const borradas = copia[tabla].filter((f) => filtros.every((filtro) => cumple(f, filtro)));
        copia[tabla] = copia[tabla].filter((f) => borradas.indexOf(f) === -1);
        return clonar(borradas);
      });
    }
  };

  return {
    transporte,
    /** Filas tal como están guardadas (formato de la base). */
    filas(tabla) {
      esquema(tabla);
      return clonar(tablas[tabla]);
    },
    /** Mete filas (formato de la base) sin pasar por el backend ni contar como petición. */
    sembrar(tabla, filas) {
      filas.forEach((fila) => {
        const nueva = completar(tabla, clonar(fila));
        calcularGeneradas(tabla, nueva);
        tablas[tabla].push(nueva);
      });
      validarTodo(tablas, [tabla]);
    },
    peticiones() { return clonar(peticiones); },
    olvidarPeticiones() { peticiones.length = 0; }
  };
}

module.exports = { crearBaseFalsa, clonar };
