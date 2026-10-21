/**
 * Pantalla de estadísticas de KODAMA (Refactor completo):
 * - 4 Estados de navegación según Área y Alumno
 * - Visualización estricta de fechas en DD/MM/AAAA
 * - Buscador inteligente de alumnos con autocompletado
 * - Totales interactivos para movidas y canceladas
 * - Calendario mensual real del estudiante con colores pastel accesibles
 * - Exportación de clases a PNG con Canvas
 * - Estadístico de compromiso y comparativa por colegios
 */
(async function () {
  const AREAS = ['Universidad', 'Academia Fractal', 'Startup', 'Personal'];
  const COLOR_AREA = {
    Universidad: 'var(--area-universidad)',
    'Academia Fractal': 'var(--area-fractal)',
    Startup: 'var(--area-startup)',
    Personal: 'var(--area-personal)'
  };
  const MESES_NOMBRES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const DIAS_CABECERA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const FILAS_TOTALES = [
    { clave: 'dictadas', nombre: 'Clases dictadas' },
    { clave: 'horas', nombre: 'Horas dictadas', formato: KodamaEstadisticas.textoHoras },
    { clave: 'monto', nombre: 'Monto', formato: KodamaEstadisticas.textoMonto },
    { clave: 'movidas', nombre: 'Movidas', interactivo: true },
    { clave: 'canceladas', nombre: 'Canceladas', interactivo: true }
  ];

  // Elementos del DOM
  const estado = document.getElementById('estado-estadisticas');
  const zona = document.getElementById('zona-estadisticas');
  const desde = document.getElementById('filtro-desde');
  const hasta = document.getElementById('filtro-hasta');
  const area = document.getElementById('filtro-area');
  const grupoAlumno = document.getElementById('filtro-alumno-grupo');
  const inputAlumno = document.getElementById('filtro-alumno-input');
  const hiddenAlumnoId = document.getElementById('filtro-alumno-id');
  const btnLimpiarAlumno = document.getElementById('filtro-alumno-limpiar');
  const listaSugerencias = document.getElementById('filtro-alumno-sugerencias');

  // Secciones
  const fichaAlumno = document.getElementById('ficha-alumno-estadisticas');
  const zonaCompromiso = document.getElementById('zona-compromiso');
  const zonaCalendarios = document.getElementById('zona-calendarios');
  const contenedorCalendarios = document.getElementById('contenedor-calendarios');
  const zonaTotales = document.getElementById('zona-totales');
  const detalleClasesContenedor = document.getElementById('detalle-clases-contenedor');
  const zonaDesgloseAreas = document.getElementById('zona-desglose-areas');
  const tablaDesgloseAreas = document.getElementById('tabla-desglose-areas');
  const zonaColegios = document.getElementById('zona-colegios');
  const tablaColegios = document.getElementById('tabla-colegios');
  const zonaPorAlumno = document.getElementById('zona-por-alumno');
  const tablaAlumnos = document.getElementById('tabla-alumnos');
  const zonaGraficaAlumnos = document.getElementById('zona-grafica-alumnos');
  const zonaGraficaAreas = document.getElementById('zona-grafica-areas');

  if (!KodamaApi.haySesion()) {
    estado.textContent = 'Falta iniciar sesión. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Iniciar sesión';
    estado.appendChild(enlace);
    KodamaCarga.listo();
    return;
  }

  // Rango por defecto: mes actual
  const hoy = KodamaFecha.hoy();
  desde.value = hoy.slice(0, 8) + '01';
  const siguienteMes = KodamaFecha.sumarDias(hoy.slice(0, 8) + '28', 4).slice(0, 8) + '01';
  hasta.value = KodamaFecha.sumarDias(siguienteMes, -1);

  let bloques = [];
  let cargado = null;
  let carga = 0;
  let tipoDetalleActivo = null;

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

  // --- Buscador inteligente de alumnos ---

  function cerrarSugerencias() {
    if (listaSugerencias) {
      listaSugerencias.hidden = true;
      listaSugerencias.replaceChildren();
    }
  }

  function seleccionarAlumno(alumno) {
    if (alumno) {
      hiddenAlumnoId.value = alumno.id;
      inputAlumno.value = KodamaAlumnos.nombreCompleto(alumno);
      btnLimpiarAlumno.hidden = false;
    } else {
      hiddenAlumnoId.value = '';
      inputAlumno.value = '';
      btnLimpiarAlumno.hidden = true;
    }
    cerrarSugerencias();
    if (cargado) pintar();
  }

  function mostrarSugerencias() {
    const dir = KodamaAlumnos.actual();
    const consulta = inputAlumno.value.trim();
    listaSugerencias.replaceChildren();

    // Opción para ver todos
    const liTodos = el('li', null, '— Todos los alumnos —');
    liTodos.addEventListener('mousedown', function (e) {
      e.preventDefault();
      seleccionarAlumno(null);
    });
    listaSugerencias.appendChild(liTodos);

    const encontrados = KodamaAlumnos.buscar(consulta, dir, {
      limite: 10,
      incluirArchivados: false
    });

    encontrados.forEach(function (alumno) {
      const li = el('li', null, KodamaAlumnos.etiqueta(alumno, dir));
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        seleccionarAlumno(alumno);
      });
      listaSugerencias.appendChild(li);
    });

    listaSugerencias.hidden = false;
  }

  if (inputAlumno) {
    inputAlumno.addEventListener('focus', mostrarSugerencias);
    inputAlumno.addEventListener('input', mostrarSugerencias);
    inputAlumno.addEventListener('blur', function () {
      setTimeout(cerrarSugerencias, 200);
    });
  }

  if (btnLimpiarAlumno) {
    btnLimpiarAlumno.addEventListener('click', function () {
      seleccionarAlumno(null);
      inputAlumno.focus();
    });
  }

  // --- Ficha de contacto del alumno (Estado 4) ---

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
      const fechaTexto = KodamaFecha.fechaCorta(alumno.fecha_inicio);
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

  // --- Detalle interactivo de movidas y canceladas (Estado 4) ---

  function mostrarDetalleClases(tipo, alumnoId) {
    if (tipoDetalleActivo === tipo) {
      tipoDetalleActivo = null;
      detalleClasesContenedor.hidden = true;
      detalleClasesContenedor.replaceChildren();
      return;
    }
    tipoDetalleActivo = tipo;

    const dir = KodamaAlumnos.actual();
    const lista = KodamaEstadisticas.detalleClases(bloques, dir.alumnos, {
      desde: desde.value,
      hasta: hasta.value,
      area: 'Academia Fractal',
      alumnoId: alumnoId
    }, tipo);

    detalleClasesContenedor.replaceChildren();

    const cabecera = el('div', 'estad-detalle-clases__cabecera');
    const tituloTexto = tipo === 'movida'
      ? 'Detalle de clases movidas (' + lista.length + ')'
      : 'Detalle de clases canceladas (' + lista.length + ')';
    cabecera.appendChild(el('h3', 'estad-detalle-clases__titulo', tituloTexto));

    const btnCerrar = el('button', 'estad-detalle-clases__cerrar', '✕');
    btnCerrar.type = 'button';
    btnCerrar.setAttribute('aria-label', 'Cerrar detalle');
    btnCerrar.addEventListener('click', function () {
      tipoDetalleActivo = null;
      detalleClasesContenedor.hidden = true;
      detalleClasesContenedor.replaceChildren();
    });
    cabecera.appendChild(btnCerrar);
    detalleClasesContenedor.appendChild(cabecera);

    if (lista.length === 0) {
      detalleClasesContenedor.appendChild(el('p', 'nota', 'Ninguna clase registrada con este estado.'));
    } else {
      lista.forEach(function (c) {
        const item = el('div', 'estad-detalle-clases__item');
        const horario = c.inicio && c.fin ? ' (' + c.inicio + ' - ' + c.fin + ')' : '';
        const p1 = el('p', null, c.fechaFormateada + horario + ' — ' + c.titulo);
        p1.style.fontWeight = '600';
        p1.style.margin = '0 0 var(--espacio-0) 0';
        item.appendChild(p1);

        if (tipo === 'movida' && c.fechaOriginalFormateada) {
          const p2 = el('p', 'nota', 'Fecha original planeada: ' + c.fechaOriginalFormateada);
          p2.style.margin = '0';
          item.appendChild(p2);
        }
        if (c.motivo) {
          const p3 = el('p', 'nota', 'Motivo registrado: ' + c.motivo);
          p3.style.margin = '0';
          item.appendChild(p3);
        }
        detalleClasesContenedor.appendChild(item);
      });
    }

    detalleClasesContenedor.hidden = false;
  }

  // --- Estadístico de Compromiso (Estado 4) ---

  function pintarCompromiso(alumnoId) {
    const dir = KodamaAlumnos.actual();
    const clasesAlumno = bloques.filter(function (b) {
      if (b.archivado === 'TRUE' || b.fecha < desde.value || b.fecha > hasta.value) return false;
      if (b.area !== 'Academia Fractal') return false;
      const ids = KodamaAlumnos.idsDe(b.alumno_id);
      return ids.indexOf(alumnoId) !== -1;
    });

    let dictadasPuntuales = 0;
    let dictadasMovidas = 0;
    let canceladas = 0;

    clasesAlumno.forEach(function (b) {
      const e = KodamaClases.estado(b);
      const movida = Boolean(b.fecha_original) && e !== 'cancelada';
      if (e === 'dictada') {
        if (movida) dictadasMovidas++;
        else dictadasPuntuales++;
      } else if (e === 'cancelada') {
        canceladas++;
      }
    });

    const totalDictadas = dictadasPuntuales + dictadasMovidas;
    const totalAgendadas = dictadasPuntuales + dictadasMovidas + canceladas;

    const segDictadas = document.getElementById('compromiso-seg-dictadas');
    const segMovidas = document.getElementById('compromiso-seg-movidas');
    const segCanceladas = document.getElementById('compromiso-seg-canceladas');
    const txtPuntual = document.getElementById('compromiso-pct-puntual');
    const txtEfectivo = document.getElementById('compromiso-pct-efectivo');
    const txtResumen = document.getElementById('compromiso-resumen-cantidades');
    const txtDesc = document.getElementById('compromiso-descripcion');

    if (totalAgendadas === 0) {
      segDictadas.style.width = '0%';
      segMovidas.style.width = '0%';
      segCanceladas.style.width = '0%';
      txtPuntual.textContent = '0%';
      txtEfectivo.textContent = '0%';
      txtResumen.textContent = 'Sin clases agendadas en el periodo';
      txtDesc.textContent = 'No hay clases registradas para este alumno en el rango de fechas seleccionado.';
      zonaCompromiso.hidden = false;
      return;
    }

    const pctPuntual = Math.round((dictadasPuntuales / totalAgendadas) * 100);
    const pctEfectivo = Math.round((totalDictadas / totalAgendadas) * 100);

    segDictadas.style.width = ((dictadasPuntuales / totalAgendadas) * 100) + '%';
    segMovidas.style.width = ((dictadasMovidas / totalAgendadas) * 100) + '%';
    segCanceladas.style.width = ((canceladas / totalAgendadas) * 100) + '%';

    txtPuntual.textContent = pctPuntual + '%';
    txtEfectivo.textContent = pctEfectivo + '%';
    txtResumen.textContent = dictadasPuntuales + ' puntuales · ' + dictadasMovidas + ' movidas · ' + canceladas + ' canceladas';

    txtDesc.textContent = 'De ' + totalAgendadas + ' clases agendadas: ' +
      dictadasPuntuales + ' se dictaron en su fecha original (' + pctPuntual + '% puntualidad), ' +
      dictadasMovidas + ' fueron reprogramadas y ' + canceladas + ' se cancelaron.';

    zonaCompromiso.hidden = false;
  }

  // --- Calendarios mensuales reales del estudiante (Estado 4) ---

  function obtenerMesesEnRango(fechaDesde, fechaHasta) {
    const meses = [];
    let anio = Number(fechaDesde.slice(0, 4));
    let mes = Number(fechaDesde.slice(5, 7));
    const anioFin = Number(fechaHasta.slice(0, 4));
    const mesFin = Number(fechaHasta.slice(5, 7));

    while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
      const claveMes = anio + '-' + String(mes).padStart(2, '0');
      meses.push({ anio: anio, mes: mes, clave: claveMes });
      mes++;
      if (mes > 12) {
        mes = 1;
        anio++;
      }
    }
    return meses;
  }

  function pintarCalendarios(alumno, alumnoId) {
    contenedorCalendarios.replaceChildren();

    const meses = obtenerMesesEnRango(desde.value, hasta.value);
    if (meses.length === 0) {
      zonaCalendarios.hidden = true;
      return;
    }

    const dir = KodamaAlumnos.actual();
    const clasesAlumno = bloques.filter(function (b) {
      if (b.archivado === 'TRUE') return false;
      if (b.area !== 'Academia Fractal') return false;
      const ids = KodamaAlumnos.idsDe(b.alumno_id);
      return ids.indexOf(alumnoId) !== -1;
    });

    meses.forEach(function (m) {
      const bloqueMes = el('div', 'estad-mes-bloque');
      const nombreMesCompleto = MESES_NOMBRES[m.mes - 1] + ' ' + m.anio;
      bloqueMes.appendChild(el('h3', 'estad-mes-bloque__titulo', nombreMesCompleto));

      const cuerpo = el('div', 'estad-mes-bloque__cuerpo');

      // 1. Grilla mensual de 7 columnas
      const tablaCal = el('table', 'estad-calendario');
      const thead = el('thead');
      const trH = el('tr');
      DIAS_CABECERA.forEach(function (d) {
        trH.appendChild(el('th', null, d));
      });
      thead.appendChild(trH);
      tablaCal.appendChild(thead);

      const tbody = el('tbody');

      const primerDia = new Date(Date.UTC(m.anio, m.mes - 1, 1, 12));
      let diaSemana = primerDia.getUTCDay();
      if (diaSemana === 0) diaSemana = 7;
      const ultimoDiaMes = new Date(Date.UTC(m.anio, m.mes, 0, 12)).getUTCDate();

      const clasesPorDia = {};
      let dictadasMes = 0;
      let minutosMes = 0;
      let montoMes = 0;
      let movidasMes = 0;
      let canceladasMes = 0;
      const tarifa = KodamaEstadisticas.tarifaDe(alumno);

      clasesAlumno.forEach(function (b) {
        if (b.fecha.slice(0, 7) !== m.clave) return;
        if (b.fecha < desde.value || b.fecha > hasta.value) return;

        (clasesPorDia[b.fecha] || (clasesPorDia[b.fecha] = [])).push(b);

        const e = KodamaClases.estado(b);
        const movida = Boolean(b.fecha_original) && e !== 'cancelada';
        const dur = KodamaEstadisticas.duracion(b);

        if (e === 'dictada') {
          dictadasMes++;
          minutosMes += dur;
          if (tarifa !== null) montoMes += dur * tarifa / 60;
        }
        if (e === 'cancelada') canceladasMes++;
        if (movida) movidasMes++;
      });

      let tr = el('tr');
      for (let i = 1; i < diaSemana; i++) {
        const td = el('td');
        const div = el('div', 'estad-dia estad-dia--vacio');
        td.appendChild(div);
        tr.appendChild(td);
      }

      let columnaActual = diaSemana;
      for (let dia = 1; dia <= ultimoDiaMes; dia++) {
        if (columnaActual > 7) {
          tbody.appendChild(tr);
          tr = el('tr');
          columnaActual = 1;
        }

        const fechaIso = m.clave + '-' + String(dia).padStart(2, '0');
        const enRango = fechaIso >= desde.value && fechaIso <= hasta.value;
        const clasesDia = clasesPorDia[fechaIso] || [];

        const td = el('td');
        const div = el('div', 'estad-dia');
        div.appendChild(el('span', null, String(dia)));

        if (enRango && clasesDia.length > 0) {
          const tieneDictada = clasesDia.some(b => KodamaClases.estado(b) === 'dictada');
          const tieneCancelada = clasesDia.some(b => KodamaClases.estado(b) === 'cancelada');
          const tieneMovida = clasesDia.some(b => Boolean(b.fecha_original) && KodamaClases.estado(b) !== 'cancelada');

          if (tieneDictada) {
            div.classList.add('estad-dia--dictada');
            div.appendChild(el('span', 'estad-dia__simbolo', '✓'));
            div.title = 'Clase dictada';
          } else if (tieneCancelada) {
            div.classList.add('estad-dia--cancelada');
            div.appendChild(el('span', 'estad-dia__simbolo', '✕'));
            div.title = 'Clase cancelada';
          } else if (tieneMovida) {
            div.classList.add('estad-dia--movida');
            div.appendChild(el('span', 'estad-dia__simbolo', '→'));
            div.title = 'Clase movida';
          }
        } else if (!enRango) {
          div.style.opacity = '0.75';
          div.style.color = 'var(--borde)';
        }

        td.appendChild(div);
        tr.appendChild(td);
        columnaActual++;
      }

      while (columnaActual <= 7) {
        const td = el('td');
        const div = el('div', 'estad-dia estad-dia--vacio');
        td.appendChild(div);
        tr.appendChild(td);
        columnaActual++;
      }
      tbody.appendChild(tr);
      tablaCal.appendChild(tbody);
      cuerpo.appendChild(tablaCal);

      // 2. Indicador lateral y leyenda
      const indicador = el('div', 'estad-mes-indicador');
      const ul = el('ul', 'estad-mes-indicador__metricas');

      const li1 = el('li');
      li1.appendChild(el('span', null, 'Clases dictadas:'));
      li1.appendChild(el('strong', null, String(dictadasMes)));
      ul.appendChild(li1);

      const li2 = el('li');
      li2.appendChild(el('span', null, 'Horas dictadas:'));
      li2.appendChild(el('strong', null, KodamaEstadisticas.textoHoras(Math.round(minutosMes / 60 * 100) / 100)));
      ul.appendChild(li2);

      const li3 = el('li');
      li3.appendChild(el('span', null, 'Monto:'));
      li3.appendChild(el('strong', null, tarifa === null ? 'Sin tarifa' : KodamaEstadisticas.textoMonto(Math.round(montoMes * 100) / 100)));
      ul.appendChild(li3);

      const li4 = el('li');
      li4.appendChild(el('span', null, 'Movidas:'));
      li4.appendChild(el('strong', null, String(movidasMes)));
      ul.appendChild(li4);

      const li5 = el('li');
      li5.appendChild(el('span', null, 'Canceladas:'));
      li5.appendChild(el('strong', null, String(canceladasMes)));
      ul.appendChild(li5);

      indicador.appendChild(ul);

      // Leyenda
      const leyenda = el('div', 'estad-leyenda');
      const l1 = el('div', 'estad-leyenda__item');
      l1.appendChild(el('span', 'estad-leyenda__muestra estad-dia--dictada', '✓'));
      l1.appendChild(el('span', null, 'Dictada'));
      leyenda.appendChild(l1);

      const l2 = el('div', 'estad-leyenda__item');
      l2.appendChild(el('span', 'estad-leyenda__muestra estad-dia--movida', '→'));
      l2.appendChild(el('span', null, 'Movida'));
      leyenda.appendChild(l2);

      const l3 = el('div', 'estad-leyenda__item');
      l3.appendChild(el('span', 'estad-leyenda__muestra estad-dia--cancelada', '✕'));
      l3.appendChild(el('span', null, 'Cancelada'));
      leyenda.appendChild(l3);

      indicador.appendChild(leyenda);

      // Botón exportar PNG para este mes
      const btnExportar = el('button', 'estad-boton-exportar secundario', 'Exportar clases');
      btnExportar.type = 'button';
      btnExportar.addEventListener('click', function () {
        exportarClasesPNG(alumno, m, clasesPorDia, {
          dictadas: dictadasMes,
          horas: Math.round(minutosMes / 60 * 100) / 100,
          monto: Math.round(montoMes * 100) / 100,
          nombreMes: nombreMesCompleto
        });
      });
      indicador.appendChild(btnExportar);

      cuerpo.appendChild(indicador);
      bloqueMes.appendChild(cuerpo);
      contenedorCalendarios.appendChild(bloqueMes);
    });

    zonaCalendarios.hidden = false;
  }

  // --- Exportar clases a PNG con Canvas ---

  function exportarClasesPNG(alumno, infoMes, clasesPorDia, resumen) {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#F9F8F5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#D8D4CA';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    function dibujarContenido() {
      ctx.fillStyle = '#071743';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('ACADEMIA FRACTAL', 80, 58);

      ctx.fillStyle = '#8A5A00';
      ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Registro mensual de clases dictadas', 80, 82);

      ctx.strokeStyle = '#D8D4CA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, 106);
      ctx.lineTo(920, 106);
      ctx.stroke();

      const rx = 660;
      const ry = 130;
      const rw = 260;
      const rh = 490;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#D8D4CA';
      ctx.strokeRect(rx, ry, rw, rh);

      ctx.fillStyle = '#071743';
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Resumen', rx + 20, ry + 36);

      ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#5A574E';
      ctx.fillText('Estudiante:', rx + 20, ry + 75);

      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#071743';
      const nombreEstudiante = KodamaAlumnos.nombreCompleto(alumno);
      ctx.fillText(nombreEstudiante, rx + 20, ry + 98);

      ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#5A574E';
      ctx.fillText('Periodo:', rx + 20, ry + 138);

      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#071743';
      ctx.fillText(resumen.nombreMes, rx + 20, ry + 158);

      ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#5A574E';
      ctx.fillText('Rango de fechas:', rx + 20, ry + 195);
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#071743';
      ctx.fillText(KodamaFecha.rangoCorto(desde.value, hasta.value), rx + 20, ry + 215);

      ctx.strokeStyle = '#E8E5DD';
      ctx.beginPath();
      ctx.moveTo(rx + 20, ry + 240);
      ctx.lineTo(rx + rw - 20, ry + 240);
      ctx.stroke();

      ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#5A574E';
      ctx.fillText('Clases dictadas:', rx + 20, ry + 275);
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#155724';
      ctx.fillText(String(resumen.dictadas), rx + rw - 50, ry + 276);

      ctx.font = 'normal 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#5A574E';
      ctx.fillText('Total horas:', rx + 20, ry + 325);
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#071743';
      ctx.fillText(KodamaEstadisticas.textoHoras(resumen.horas), rx + rw - 70, ry + 326);

      ctx.fillStyle = '#D4EDDA';
      ctx.fillRect(rx + 20, ry + 420, 24, 24);
      ctx.strokeStyle = '#C3E6CB';
      ctx.strokeRect(rx + 20, ry + 420, 24, 24);

      ctx.fillStyle = '#155724';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('✓', rx + 26, ry + 437);

      ctx.fillStyle = '#071743';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Clase dictada confirmada', rx + 55, ry + 437);

      const gx = 40;
      const gy = 130;
      const gw = 600;
      const colW = gw / 7;
      const rowH = 68;

      ctx.fillStyle = '#071743';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(resumen.nombreMes, gx, gy);

      const headerY = gy + 30;
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#6E6B62';
      DIAS_CABECERA.forEach(function (d, idx) {
        ctx.fillText(d, gx + (idx * colW) + (colW / 2) - 12, headerY);
      });

      const primerDia = new Date(Date.UTC(infoMes.anio, infoMes.mes - 1, 1, 12));
      let diaSemana = primerDia.getUTCDay();
      if (diaSemana === 0) diaSemana = 7;
      const ultimoDiaMes = new Date(Date.UTC(infoMes.anio, infoMes.mes, 0, 12)).getUTCDate();

      let fila = 0;
      let col = diaSemana - 1;
      const startGridY = headerY + 15;

      for (let dia = 1; dia <= ultimoDiaMes; dia++) {
        const cx = gx + (col * colW);
        const cy = startGridY + (fila * rowH);
        const fechaIso = infoMes.clave + '-' + String(dia).padStart(2, '0');
        const clasesDia = clasesPorDia[fechaIso] || [];
        const tieneDictada = clasesDia.some(b => KodamaClases.estado(b) === 'dictada');

        if (tieneDictada) {
          ctx.fillStyle = '#D4EDDA';
          ctx.fillRect(cx + 2, cy + 2, colW - 4, rowH - 4);
          ctx.strokeStyle = '#28A745';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 2, cy + 2, colW - 4, rowH - 4);

          ctx.fillStyle = '#155724';
          ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(String(dia), cx + 8, cy + 22);

          ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText('✓', cx + (colW / 2) - 6, cy + 45);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(cx + 2, cy + 2, colW - 4, rowH - 4);
          ctx.strokeStyle = '#E8E5DD';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 2, cy + 2, colW - 4, rowH - 4);

          ctx.fillStyle = '#8C897E';
          ctx.font = 'normal 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(String(dia), cx + 8, cy + 22);
        }

        col++;
        if (col >= 7) {
          col = 0;
          fila++;
        }
      }

      canvas.toBlob(function (blob) {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        const nombreArchivo = 'clases-' + KodamaAlumnos.normalizar(nombreEstudiante).replace(/\s+/g, '-') + '-' + infoMes.clave + '.png';
        enlace.href = url;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }, 'image/png');
    }

    const imgLogo = new Image();
    imgLogo.crossOrigin = 'anonymous';
    imgLogo.onload = function () {
      ctx.drawImage(imgLogo, 40, 42, 32, 32);
      dibujarContenido();
    };
    imgLogo.onerror = function () {
      ctx.fillStyle = '#8A5A00';
      ctx.beginPath();
      ctx.arc(56, 58, 16, 0, Math.PI * 2);
      ctx.fill();
      dibujarContenido();
    };
    imgLogo.src = 'icons/icono-192.png';
  }

  // --- Renderizado principal según estado ---

  function pintar() {
    const dir = KodamaAlumnos.actual();
    const alumnos = dir.alumnos;
    const areaActual = area.value;
    const esFractal = areaActual === 'Academia Fractal';

    if (grupoAlumno) {
      grupoAlumno.hidden = !esFractal;
      if (!esFractal) {
        hiddenAlumnoId.value = '';
        inputAlumno.value = '';
        btnLimpiarAlumno.hidden = true;
        cerrarSugerencias();
      }
    }

    const alumnoId = esFractal ? hiddenAlumnoId.value : '';
    const alumnoSeleccionado = alumnoId ? alumnos.find(a => a.id === alumnoId) : null;

    const estadoNumero = !areaActual ? 1
      : (!esFractal ? 2
      : (!alumnoId ? 3 : 4));

    const anterior = KodamaEstadisticas.periodoAnterior(desde.value, hasta.value);
    const opcionesCalculo = {
      desde: desde.value,
      hasta: hasta.value,
      area: areaActual,
      areas: AREAS,
      alumnoId: alumnoId
    };
    const actual = KodamaEstadisticas.calcular(bloques, alumnos, opcionesCalculo);
    const previo = KodamaEstadisticas.calcular(bloques, alumnos, Object.assign({}, opcionesCalculo, {
      desde: anterior.desde,
      hasta: anterior.hasta
    }));

    document.getElementById('nota-anterior').textContent =
      'Actual: ' + KodamaFecha.rangoCorto(desde.value, hasta.value) +
      '. Anterior (mismo largo, justo antes): ' + KodamaFecha.rangoCorto(anterior.desde, anterior.hasta) + '.';

    // Tabla de totales
    const comparacion = KodamaEstadisticas.comparar(actual.totales, previo.totales);
    const cuerpoTotales = document.getElementById('tabla-totales');
    cuerpoTotales.replaceChildren();

    FILAS_TOTALES.forEach(function (fila, i) {
      const c = comparacion[i];
      const formato = fila.formato || String;
      const tr = el('tr');
      tr.appendChild(el('th', null, fila.nombre)).scope = 'row';

      const tdActual = el('td', 'numero');
      if (fila.interactivo && estadoNumero === 4 && c.actual > 0) {
        const btn = el('button', 'estad-numero-interactivo', formato(c.actual));
        btn.type = 'button';
        btn.title = 'Toca para ver el detalle de clases';
        btn.addEventListener('click', function () {
          mostrarDetalleClases(fila.clave === 'movidas' ? 'movida' : 'cancelada', alumnoId);
        });
        tdActual.appendChild(btn);
      } else {
        tdActual.textContent = formato(c.actual);
      }
      tr.appendChild(tdActual);

      tr.appendChild(el('td', 'numero', formato(c.anterior)));
      tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoDiferencia(c.diferencia,
        fila.formato ? function (v) { return formato(v); } : null)));
      cuerpoTotales.appendChild(tr);
    });

    if (estadoNumero !== 4) {
      tipoDetalleActivo = null;
      detalleClasesContenedor.hidden = true;
      detalleClasesContenedor.replaceChildren();
    }

    // ESTADO 1: General
    if (estadoNumero === 1) {
      zonaDesgloseAreas.hidden = false;
      tablaDesgloseAreas.replaceChildren();
      const datosAreas = KodamaEstadisticas.calcularDesgloseAreas(bloques, {
        desde: desde.value,
        hasta: hasta.value,
        areas: AREAS
      });
      datosAreas.forEach(function (da) {
        const tr = el('tr');
        tr.appendChild(el('th', null, da.area)).scope = 'row';
        tr.appendChild(el('td', 'numero', da.area === 'Academia Fractal' ? String(da.dictadas) : '—'));
        tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoHoras(da.horas)));
        tr.appendChild(el('td', 'numero', String(da.movidas)));
        tr.appendChild(el('td', 'numero', String(da.canceladas)));
        tablaDesgloseAreas.appendChild(tr);
      });
    } else {
      zonaDesgloseAreas.hidden = true;
    }

    // ESTADO 3: Fractal + Todos
    if (estadoNumero === 3) {
      zonaColegios.hidden = false;
      const datosColegios = KodamaEstadisticas.calcularPorColegio(actual.porAlumno, alumnos, dir.colegios);
      tablaColegios.replaceChildren();
      datosColegios.forEach(function (col) {
        const tr = el('tr');
        const etiquetaColegio = col.corto && col.corto !== col.colegio ? col.colegio + ' (' + col.corto + ')' : col.colegio;
        tr.appendChild(el('th', null, etiquetaColegio)).scope = 'row';
        tr.appendChild(el('td', 'numero', String(col.alumnos)));
        tr.appendChild(el('td', 'numero', String(col.dictadas)));
        tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoHoras(col.horas)));
        tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoMonto(col.monto)));
        tablaColegios.appendChild(tr);
      });

      KodamaGraficas.barras(document.getElementById('grafica-colegios'),
        datosColegios.filter(c => c.horas > 0).map(c => ({
          etiqueta: c.corto || c.colegio,
          valor: c.horas,
          color: 'var(--area-fractal)'
        })),
        {
          descripcion: 'Horas dictadas por colegio',
          formato: KodamaEstadisticas.textoHoras,
          vacio: 'Sin clases dictadas con colegios en este periodo.'
        }
      );

      zonaPorAlumno.hidden = false;
      tablaAlumnos.replaceChildren();
      actual.porAlumno.forEach(function (f) {
        const tr = el('tr');
        tr.appendChild(el('th', null, f.nombre)).scope = 'row';
        tr.appendChild(el('td', 'numero', String(f.dictadas)));
        tr.appendChild(el('td', 'numero', KodamaEstadisticas.textoHoras(f.horas)));
        tr.appendChild(el('td', 'numero', f.sinTarifa ? 'sin tarifa' : KodamaEstadisticas.textoMonto(f.monto)));
        tr.appendChild(el('td', 'numero', String(f.movidas)));
        tr.appendChild(el('td', 'numero', String(f.canceladas)));
        tablaAlumnos.appendChild(tr);
      });
      if (!actual.porAlumno.length) {
        const tr = el('tr');
        const td = el('td', 'nota', 'Sin clases con alumnos en este periodo.');
        td.colSpan = 6;
        tr.appendChild(td);
        tablaAlumnos.appendChild(tr);
      }
      const sinTarifa = actual.porAlumno.filter(f => f.sinTarifa).length;
      document.getElementById('nota-alumnos').textContent = sinTarifa
        ? 'Los alumnos "sin tarifa" no suman monto: carga su tarifa en Alumnos.' : '';

      zonaGraficaAlumnos.hidden = false;
      KodamaGraficas.barras(document.getElementById('grafica-alumnos'),
        actual.porAlumno.filter(f => f.horas > 0).map(f => ({
          etiqueta: f.nombre,
          valor: f.horas,
          color: 'var(--area-fractal)'
        })),
        {
          descripcion: 'Horas dictadas por alumno',
          formato: KodamaEstadisticas.textoHoras,
          vacio: 'Ninguna clase marcada como dictada en este periodo.'
        }
      );
    } else {
      zonaColegios.hidden = true;
      zonaPorAlumno.hidden = true;
      zonaGraficaAlumnos.hidden = true;
    }

    // ESTADO 4: Fractal + Alumno específico
    if (estadoNumero === 4 && alumnoSeleccionado) {
      pintarFicha(alumnoSeleccionado, dir);
      pintarCompromiso(alumnoId);
      pintarCalendarios(alumnoSeleccionado, alumnoId);
    } else {
      fichaAlumno.hidden = true;
      zonaCompromiso.hidden = true;
      zonaCalendarios.hidden = true;
    }

    // Horas por área (Estados 1 y 2)
    if (estadoNumero === 1 || estadoNumero === 2) {
      zonaGraficaAreas.hidden = false;
      KodamaGraficas.barras(document.getElementById('grafica-areas'),
        actual.porArea.map(a => ({
          etiqueta: a.area,
          valor: a.horas,
          color: COLOR_AREA[a.area]
        })),
        {
          descripcion: 'Horas por área',
          formato: KodamaEstadisticas.textoHoras,
          vacio: 'Sin horas registradas en este periodo.'
        }
      );
    } else {
      zonaGraficaAreas.hidden = true;
    }

    zona.hidden = false;
  }

  // Carga de datos
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
        return;
      }
      bloques = datos[0];
      cargado = { desde: anterior.desde, hasta: hasta.value };
      estado.textContent = '';
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
  area.addEventListener('change', function () {
    if (area.value !== 'Academia Fractal') {
      hiddenAlumnoId.value = '';
      if (inputAlumno) inputAlumno.value = '';
      if (btnLimpiarAlumno) btnLimpiarAlumno.hidden = true;
    }
    if (cargado) pintar();
  });

  cargar();
})();
