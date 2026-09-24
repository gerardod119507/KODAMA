/**
 * Plantillas de bloques (Checkpoint 9): lo que se repite de un bloque
 * (área, tipo, tema, alumnos, duración, lugar, etiqueta) para crear otro
 * igual en un toque. Viven en la hoja Plantillas; acá hay una copia en el
 * dispositivo (solo lectura, como los bloques) para mostrarlas al instante.
 */
const KodamaPlantillas = (function () {
  const CLAVE_CACHE = 'kodama.cache.plantillas';
  let lista = leerGuardadas();
  const oyentes = [];

  function leerGuardadas() {
    try {
      const guardadas = JSON.parse(localStorage.getItem(CLAVE_CACHE));
      return Array.isArray(guardadas) ? guardadas : [];
    } catch (err) {
      return [];
    }
  }

  function fijar(nueva) {
    lista = nueva || [];
    try {
      localStorage.setItem(CLAVE_CACHE, JSON.stringify(lista));
    } catch (err) {
      // Sin caché no es grave: se vuelven a pedir la próxima vez.
    }
    oyentes.forEach(function (fn) { fn(lista); });
  }

  /** Lo que se guarda de un bloque: todo menos fecha, hora y estado. */
  function desdeBloque(bloque, nombre) {
    return {
      nombre: String(nombre || '').trim(),
      area: bloque.area,
      tipo: bloque.tipo || 'variable',
      titulo: bloque.titulo || '',
      alumno_id: bloque.alumno_id || '',
      duracion: KodamaFormas.duracion(bloque.inicio, bloque.fin),
      lugar: bloque.lugar || '',
      etiqueta: bloque.etiqueta || ''
    };
  }

  /** Valores para el formulario de un bloque nuevo, desde una plantilla. */
  function valoresDesde(plantilla, fecha, inicio) {
    return {
      titulo: plantilla.titulo || '',
      area: plantilla.area,
      tipo: plantilla.tipo || 'variable',
      fecha: fecha,
      inicio: inicio,
      fin: KodamaFormas.finPara(inicio, Number(plantilla.duracion) || 60),
      lugar: plantilla.lugar || '',
      etiqueta: plantilla.etiqueta || '',
      notas: '',
      alumno_id: plantilla.alumno_id || ''
    };
  }

  async function cargar(pedir) {
    fijar(await pedir('listarPlantillas'));
    return lista;
  }

  async function crear(pedir, datos) {
    const nueva = await pedir('crearPlantilla', { plantilla: datos });
    fijar(lista.concat([nueva]));
    return nueva;
  }

  async function archivar(pedir, id) {
    await pedir('archivarPlantilla', { id: id });
    fijar(lista.filter(function (p) { return p.id !== id; }));
  }

  return {
    actual: function () { return lista; },
    alCambiar: function (fn) { oyentes.push(fn); },
    desdeBloque: desdeBloque,
    valoresDesde: valoresDesde,
    cargar: cargar,
    crear: crear,
    archivar: archivar
  };
})();
