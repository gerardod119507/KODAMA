/**
 * Pantalla de estadísticas (Checkpoint 8 y ficha de estudiante): filtro por
 * rango de fechas, por área y por alumno; ficha de contacto del estudiante;
 * totales del periodo contra el periodo anterior del mismo largo; tabla por
 * alumno; y dos gráficas (horas por alumno, por área).
 *
 * Una sola llamada por rango (periodo anterior + actual juntos);
 * cambiar el área o el alumno no pide nada, se recalcula con lo que ya está.
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
  const estado = document.getElementById('estado-estadisticas');
  const zona = document.getElementById('zona-estadisticas');
  const desde = document.getElementById('filtro-desde');
  const hasta = document.getElementById('filtro-hasta');
  const area = document.getElementById('filtro-area');
  const filtroAlumno = document.getElementById('filtro-alumno');
  const fichaAlumno = document.getElementById('ficha-alumno-estadisticas');

  if (!KodamaApi.haySesion()) {
    estado.textContent = 'Falta iniciar sesión. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Iniciar sesión';
    estado.appendChild(enlace);
    KodamaCarga.listo();
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
    const respuesta = await KodamaApi.llamar(accion, parametros);
    if (!respuesta.ok) throw new Error(respuesta.error);
    return respuesta.data;
  }

  function actualizarSelectorAlumnos() {
    if (!filtroAlumno) return;
    const dir = KodamaAlumnos.actual();
    const valorActual = filtroAlumno.value;
    filtroAlumno.replaceChildren();
    const optTodos = el('option', null, 'Todos los alumnos');
    optTodos.value = '';
    filtroAlumno.appendChild(optTodos);

    const activos = (dir.alumnos || []).filter(function (a) { return a.archivado !== 'TRUE'; })
      .slice()
      .sort(function (a, b) {
        return KodamaAlumnos.nombreCompleto(a).localeCompare(KodamaAlumnos.nombreCompleto(b));
      });

    activos.forEach(function (alumno) {
      const opt = el('option', null, KodamaAlumnos.etiqueta(alumno, dir));
      opt.value = alumno.id;
      filtroAlumno.appendChild(opt);
    });

    if (valorActual && dir.alumnos.some(function (a) { return a.id === valorActual; })) {
      filtroAlumno.value = valorActual;
    }
  }

  function campoFicha(etiqueta, valor, enlaceTel) {
    if (!valor) return null;
    const campo = el('div', 'ficha-alumno__campo');
    campo.appendChild(el('span', 'ficha-alumno__etiqueta', etiqueta));
    const pValor = el('p', 'ficha-alumno__valor');
    if (enlaceTel) {
      const a = el('a', null, valor);
      a.href = 'tel:' + valor.replace(/\s+/g, '');
      pValor.appendChild(a);
    } else {
      pValor.textContent = valor;
    }
    campo.appendChild(pValor);
    return campo;
  }

  function pintarFicha(alumno, dir) {
    if (!fichaAlumno) return;
    fichaAlumno.replaceChildren();
    if (!alumno) {
      fichaAlumno.hidden = true;
      return;
    }

    const cabecera = el('div', 'ficha-alumno__cabecera');
    cabecera.appendChild(el('h2', 'ficha-alumno__nombre', KodamaAlumnos.nombreCompleto(alumno)));
    const badgeTexto = [
      alumno.curso ? KodamaAlumnos.corto(dir.cursos, alumno.curso) : '',
      alumno.colegio ? KodamaAlumnos.corto(dir.colegios, alumno.colegio) : ''
    ].filter(Boolean).join(' ');
    if (badgeTexto) {
      cabecera.appendChild(el('span', 'ficha-alumno__badge', badgeTexto));
    }
    fichaAlumno.appendChild(cabecera);

    const detalles = el('div', 'ficha-alumno__detalles');

    const cursoColegio = [alumno.curso, alumno.colegio].filter(Boolean).join(' · ');
    if (cursoColegio) {
      const c = campoFicha('Curso y colegio', cursoColegio);
      if (c) detalles.appendChild(c);
    }

    if (alumno.materias) {
      const c = campoFicha('Materias', alumno.materias);
      if (c) detalles.appendChild(c);
    }

    if (alumno.tutor_nombre) {
      const parentesco = alumno.tutor_parentesco ? ' (' + alumno.tutor_parentesco + ')' : '';
      const c = campoFicha('Tutor / Familia', alumno.tutor_nombre + parentesco);
      if (c) detalles.appendChild(c);
    }

    if (alumno.tutor_telefono) {
      const c = campoFicha('Teléfono tutor', alumno.tutor_telefono, true);
      if (c) detalles.appendChild(c);
    }

    if (alumno.fecha_inicio) {
      const fechaTexto = /^\d{4}-\d{2}-\d{2}$/.test(alumno.fecha_inicio)
        ? KodamaFecha.legible(alumno.fecha_inicio)
        : alumno.fecha_inicio;
      const c = campoFicha('Alumno desde', fechaTexto);
      if (c) detalles.appendChild(c);
    }

    const tarifaTexto = (alumno.tarifa_hora ? 'Bs ' + alumno.tarifa_hora + '/h' : 'Sin tarifa') +
      ' · ' + (alumno.forma_pago === 'mensual' ? 'Mensual' : 'Por hora');
    detalles.appendChild(campoFicha('Tarifa y pago', tarifaTexto));

    if (alumno.lugar) {
      const c = campoFicha('Lugar habitual', alumno.lugar);
      if (c) detalles.appendChild(c);
    }

    if (alumno.notas) {
      const c = campoFicha('Notas', alumno.notas);
      if (c) detalles.appendChild(c);
    }

    fichaAlumno.appendChild(detalles);
    fichaAlumno.hidden = false;
  }

  function pintar() {
    const dir = KodamaAlumnos.actual();
    const alumnos = dir.alumnos;
    const alumnoId = filtroAlumno ? filtroAlumno.value : '';
    const alumnoSeleccionado = alumnoId ? dir.alumnos.find(function (a) { return a.id === alumnoId; }) : null;

    pintarFicha(alumnoSeleccionado, dir);

    const anterior = KodamaEstadisticas.periodoAnterior(desde.value, hasta.value);
    const opciones = { area: area.value, areas: AREAS, alumnoId: alumnoId };
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
      const td = el('td', 'nota', alumnoId
        ? 'Sin clases con este alumno en este periodo.'
        : 'Sin clases con alumnos en este periodo.');
      td.colSpan = 6;
      tr.appendChild(td);
      tabla.appendChild(tr);
    }
    const sinTarifa = actual.porAlumno.filter(function (f) { return f.sinTarifa; }).length;
    document.getElementById('nota-alumnos').textContent = sinTarifa
      ? 'Los alumnos "sin tarifa" no suman monto: carga su tarifa en Alumnos.' : '';

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

  // Medición: desde que se empezó a abrir la página hasta ver las gráficas
  // (solo la primera carga; cambiar el rango después no es "abrir").
  let apertura = KodamaMedicion.empezar('estadisticas', { desdeNavegacion: true });

  async function cargar() {
    const op = apertura;
    apertura = null;
    if (!KodamaEstadisticas.rangoValido(desde.value, hasta.value)) {
      if (op) op.terminar(false);
      estado.textContent = 'Elige un rango válido: "desde" no puede ser posterior a "hasta".';
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
      if (op) op.cerrarRed();
      if (numero !== carga) {
        if (op) op.terminar(true);
        return; // llegó tarde: ya se pidió otro rango
      }
      bloques = datos[0];
      cargado = { desde: anterior.desde, hasta: hasta.value };
      estado.textContent = '';
      actualizarSelectorAlumnos();
      if (op) {
        op.render(pintar);
        op.pintado().then(function () { op.terminar(true); });
      } else {
        pintar();
      }
    } catch (error) {
      if (op) op.terminar(false);
      if (numero !== carga) return;
      estado.textContent = 'No se pudo cargar: ' + error.message;
    } finally {
      KodamaCarga.listo();
    }
  }

  desde.addEventListener('change', cargar);
  hasta.addEventListener('change', cargar);
  // El área y el alumno no piden nada: se recalculan con lo que ya está en memoria.
  area.addEventListener('change', function () { if (cargado) pintar(); });
  if (filtroAlumno) {
    filtroAlumno.addEventListener('change', function () { if (cargado) pintar(); });
  }

  // Si ya había alumnos en caché local, llenar el selector de inmediato
  actualizarSelectorAlumnos();
  cargar();
})();