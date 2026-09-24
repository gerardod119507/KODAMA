/**
 * Pantalla de estadísticas (Checkpoint 8): filtro por rango de fechas y
 * por área; totales del periodo contra el periodo anterior del mismo
 * largo; tabla por alumno; y dos gráficas (horas por alumno, por área).
 *
 * Una sola llamada al Web App por rango (periodo anterior + actual juntos);
 * cambiar el área no pide nada, se recalcula con lo que ya está.
 */
(async function () {
  const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
  const COLOR_AREA = {
    Universidad: 'var(--area-universidad)',
    'Academia Fractal': 'var(--area-fractal)',
    Startup: 'var(--area-startup)',
    Personal: 'var(--area-personal)'
  };
  const FILAS_TOTALES = [
    { clave: 'dictadas', nombre: 'Clases dictadas' },
    { clave: 'horas', nombre: 'Horas dictadas', formato: KodamaEstadisticas.textoHoras },
    { clave: 'monto', nombre: 'Monto', formato: KodamaEstadisticas.textoMonto },
    { clave: 'movidas', nombre: 'Movidas' },
    { clave: 'canceladas', nombre: 'Canceladas' }
  ];

  const config = KodamaApi.leerConfig();
  const estado = document.getElementById('estado-estadisticas');
  const zona = document.getElementById('zona-estadisticas');
  const desde = document.getElementById('filtro-desde');
  const hasta = document.getElementById('filtro-hasta');
  const area = document.getElementById('filtro-area');

  if (!config.url || !config.token) {
    estado.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    estado.appendChild(enlace);
    return;
  }

  // Por defecto, el mes en curso.
  const hoy = KodamaFecha.hoy();
  desde.value = hoy.slice(0, 8) + '01';
  const siguienteMes = KodamaFecha.sumarDias(hoy.slice(0, 8) + '28', 4).slice(0, 8) + '01';
  hasta.value = KodamaFecha.sumarDias(siguienteMes, -1);

  let bloques = [];
  let cargado = null; // { desde, hasta } de lo que está en memoria
  let carga = 0;

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  async function pedir(accion, parametros) {
    const respuesta = await KodamaApi.llamar(config.url, config.token, accion, parametros);
    if (!respuesta.ok) throw new Error(respuesta.error);
    return respuesta.data;
  }

  function pintar() {
    const alumnos = KodamaAlumnos.actual().alumnos;
    const anterior = KodamaEstadisticas.periodoAnterior(desde.value, hasta.value);
    const opciones = { area: area.value, areas: AREAS };
    const actual = KodamaEstadisticas.calcular(bloques, alumnos,
      Object.assign({ desde: desde.value, hasta: hasta.value }, opciones));
    const previo = KodamaEstadisticas.calcular(bloques, alumnos,
      Object.assign({ desde: anterior.desde, hasta: anterior.hasta }, opciones));

    // Totales, con el periodo anterior al lado.
    document.getElementById('nota-anterior').textContent =
      'Actual: ' + KodamaFecha.rangoLegible(desde.value, hasta.value) +
      '. Anterior (mismo largo, justo antes): ' + KodamaFecha.rangoLegible(anterior.desde, anterior.hasta) + '.';
    const comparacion = KodamaEstadisticas.comparar(actual.totales, previo.totales);
    const cuerpo = document.getElementById('tabla-totales');
    cuerpo.replaceChildren();
    FILAS_TOTALES.forEach(function (fila, i) {
      const c = comparacion[i];
      const formato = fila.formato || String;
      const tr = el('tr');
      tr.appendChild(el('th', null, fila.nombre)).scope = 'row';
      tr.appendChild(el('td', 'numero', formato(c.actual)));
      tr.appendChild(el('td', 'numero', formato(c.anterior)));
      tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoDiferencia(c.diferencia,
        fila.formato ? function (v) { return formato(v); } : null)));
      cuerpo.appendChild(tr);
    });

    // Por alumno.
    const tabla = document.getElementById('tabla-alumnos');
    tabla.replaceChildren();
    actual.porAlumno.forEach(function (f) {
      const tr = el('tr');
      tr.appendChild(el('th', null, f.nombre)).scope = 'row';
      tr.appendChild(el('td', 'numero', String(f.dictadas)));
      tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoHoras(f.horas)));
      tr.appendChild(el('td', 'numero', f.sinTarifa ? 'sin tarifa' : KodamaEstadisticas.textoMonto(f.monto)));
      tr.appendChild(el('td', 'numero', String(f.movidas)));
      tr.appendChild(el('td', 'numero', String(f.canceladas)));
      tabla.appendChild(tr);
    });
    if (!actual.porAlumno.length) {
      const tr = el('tr');
      const td = el('td', 'nota', 'Sin clases con alumnos en este periodo.');
      td.colSpan = 6;
      tr.appendChild(td);
      tabla.appendChild(tr);
    }
    const sinTarifa = actual.porAlumno.filter(function (f) { return f.sinTarifa; }).length;
    document.getElementById('nota-alumnos').textContent = sinTarifa
      ? 'Los alumnos "sin tarifa" no suman monto: cargá su tarifa en Alumnos.' : '';

    // Gráficas.
    KodamaGraficas.barras(document.getElementById('grafica-alumnos'),
      actual.porAlumno.filter(function (f) { return f.horas > 0; }).map(function (f) {
        return { etiqueta: f.nombre, valor: f.horas, color: 'var(--area-fractal)' };
      }),
      { descripcion: 'Horas dictadas por alumno', formato: KodamaEstadisticas.textoHoras,
        vacio: 'Ninguna clase marcada como dictada en este periodo.' });
    KodamaGraficas.barras(document.getElementById('grafica-areas'),
      actual.porArea.map(function (a) { return { etiqueta: a.area, valor: a.horas, color: COLOR_AREA[a.area] }; }),
      { descripcion: 'Horas por área', formato: KodamaEstadisticas.textoHoras });

    zona.hidden = false;
  }

  async function cargar() {
    if (!KodamaEstadisticas.rangoValido(desde.value, hasta.value)) {
      estado.textContent = 'Elegí un rango válido: "desde" no puede ser posterior a "hasta".';
      zona.hidden = true;
      return;
    }
    const anterior = KodamaEstadisticas.periodoAnterior(desde.value, hasta.value);
    const numero = ++carga;
    estado.textContent = 'Cargando…';
    try {
      const datos = await Promise.all([
        pedir('listarBloquesRango', { desde: anterior.desde, hasta: hasta.value }),
        KodamaAlumnos.cargar()
      ]);
      if (numero !== carga) return; // llegó tarde: ya se pidió otro rango
      bloques = datos[0];
      cargado = { desde: anterior.desde, hasta: hasta.value };
      estado.textContent = '';
      pintar();
    } catch (error) {
      if (numero !== carga) return;
      estado.textContent = 'No se pudo cargar: ' + error.message;
    }
  }

  desde.addEventListener('change', cargar);
  hasta.addEventListener('change', cargar);
  // El área no pide nada: se recalcula con lo que ya está en memoria.
  area.addEventListener('change', function () { if (cargado) pintar(); });

  cargar();
})();
