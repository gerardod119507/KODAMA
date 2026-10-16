/**
 * KODAMA — backend en el navegador (Checkpoint 13): lo común.
 *
 * Hasta el Checkpoint 12 esta lógica vivía en Apps Script (apps-script/*.gs)
 * y corría en los servidores de Google. Ahora corre en la página y lee y
 * escribe Supabase por KodamaDB. Se pasó función por función, con los
 * mismos nombres, las mismas reglas y los mismos mensajes de error, así el
 * resto de la app no notó el cambio. Lo único que cambió es de dónde salen
 * los datos: cada "leer la hoja" es ahora una consulta a una tabla.
 *
 * Los archivos de js/backend/ comparten el objeto KodamaBackend (B):
 * comun.js lo crea y cada uno le agrega sus funciones. acciones.js arma la
 * lista de acciones que pide la app (la misma que ACCIONES en Code.gs).
 */
const KodamaBackend = (function () {
  const B = {};

  B.ZONA_HORARIA = 'America/La_Paz';
  B.AREA_FRACTAL = 'Academia Fractal';

  // El reloj se puede cambiar en las pruebas (un instante fijo).
  B.reloj = function () { return new Date(); };

  /** "2026-09-23 14:30" en La Paz, como Utilities.formatDate en el Apps Script. */
  B.ahora = function () {
    return KodamaDB.momentoATexto(B.reloj());
  };

  /** "2026-09-23" en La Paz. */
  B.hoy = function () {
    return B.ahora().slice(0, 10);
  };

  /** 8 caracteres hexadecimales al azar (lo que daba Utilities.getUuid recortado). */
  B.aleatorioHex = function () {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  /** "b" + 8 hexadecimales, "a…", "h…", "p…", "t…". */
  B.nuevoId = function (prefijo) {
    return prefijo + B.aleatorioHex();
  };

  /**
   * Inserta una fila nueva con un id al azar. Si justo ese id ya existe
   * (muy improbable con 4 mil millones de combinaciones, pero posible), se
   * reintenta con otro: la base lo rechaza por ser la clave de la tabla.
   */
  B.insertarConIdNuevo = async function (tabla, objeto, prefijo) {
    for (let intento = 0; ; intento++) {
      try {
        await KodamaDB.insertar(tabla, [objeto]);
        return objeto;
      } catch (error) {
        if (error.codigo !== '23505' || intento >= 2) throw error;
        objeto.id = B.nuevoId(prefijo);
      }
    }
  };

  /**
   * Texto para comparar sin que importen tildes, mayúsculas ni espacios de
   * más: "  Agustín  ALIENDRE " → "agustin aliendre".
   */
  B.normalizarTexto = function (texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  };

  B.validarHora = function (texto, titulo, campo) {
    if (!/^\d{2}:\d{2}$/.test(texto || '')) {
      throw new Error('horario_hora_invalida: "' + titulo + '", campo "' + campo + '" (usa HH:mm, ej. 09:00)');
    }
  };

  B.validarFecha = function (texto, titulo, campo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) {
      throw new Error('horario_fecha_invalida: "' + titulo + '", campo "' + campo + '" (usa YYYY-MM-DD, ej. 2026-09-22)');
    }
  };

  /** "a1, a2  a1" → "a1,a2": sin repetidos, en el orden en que llegaron. */
  B.normalizarIdsAlumnos = function (texto) {
    const vistos = {};
    return String(texto == null ? '' : texto).split(/[\s,;]+/)
      .filter(function (id) {
        if (!id || vistos[id]) return false;
        vistos[id] = true;
        return true;
      })
      .join(',');
  };

  /** Cada id tiene que ser de un alumno que existe (archivado también vale). */
  B.validarIdsAlumnos = async function (texto) {
    if (!texto) return;
    const ids = texto.split(',');
    const encontrados = await KodamaDB.leer('alumnos', [['id', 'in', ids]]);
    const existentes = {};
    encontrados.forEach(function (a) { existentes[a.id] = true; });
    ids.forEach(function (id) {
      if (!existentes[id]) throw new Error('alumno_no_encontrado: ' + id);
    });
  };

  // --- Áreas -------------------------------------------------------------
  // Las 4 áreas casi nunca cambian (no hay pantalla para editarlas): se
  // leen una vez por página y se reusan para validar cada bloque y regla.

  let areasGuardadas = null;

  B.listarAreas = async function () {
    if (!areasGuardadas) {
      areasGuardadas = KodamaDB.leer('areas').catch(function (error) {
        areasGuardadas = null;
        throw error;
      });
    }
    const areas = await areasGuardadas;
    return areas.map(function (a) { return { nombre: a.nombre, color: a.color }; });
  };

  B.olvidarAreas = function () {
    areasGuardadas = null;
  };

  B.nombresDeAreas = async function () {
    return (await B.listarAreas()).map(function (area) { return area.nombre; });
  };

  B.validarArea = async function (area) {
    const validas = await B.nombresDeAreas();
    if (validas.indexOf(String(area || '').trim()) === -1) {
      throw new Error('area_invalida: "' + area + '" (usa ' + validas.join(', ') + ')');
    }
  };

  return B;
})();
