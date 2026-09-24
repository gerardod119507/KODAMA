/**
 * Pantalla de cobros (Checkpoint 8): para el mes elegido, lo acumulado por
 * cada alumno de pago mensual y si ya pagó; los pagos registrados del mes;
 * y registrar / editar / archivar pagos (hoja Pagos).
 *
 * El monto de un pago se calcula (horas dictadas × tarifa) pero se puede
 * corregir, y queda guardado fijo en la hoja.
 */
(async function () {
  const config = KodamaApi.leerConfig();
  const estado = document.getElementById('estado-cobros');
  const zona = document.getElementById('zona-cobros');
  const mes = document.getElementById('filtro-mes');
  const dialogo = document.getElementById('dialogo-pago');
  const campos = {
    alumno_id: document.getElementById('pago-alumno'),
    desde: document.getElementById('pago-desde'),
    hasta: document.getElementById('pago-hasta'),
    monto: document.getElementById('pago-monto'),
    estado: document.getElementById('pago-estado'),
    fecha_pago: document.getElementById('pago-fecha'),
    notas: document.getElementById('pago-notas')
  };
  const TEXTO_SITUACION = { pagado: 'Pagado', pendiente: 'Pendiente', sin_registrar: 'Sin registrar' };

  if (!config.url || !config.token) {
    estado.textContent = 'Falta configurar la conexión con tu hoja. ';
    const enlace = document.createElement('a');
    enlace.href = 'config.html';
    enlace.textContent = 'Configurar';
    estado.appendChild(enlace);
    return;
  }

  mes.value = KodamaFecha.hoy().slice(0, 7);
  let bloques = [];
  let pagos = [];
  let idEnEdicion = null;
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

  function nombreDe(id) {
    const a = KodamaAlumnos.porId(id);
    return a ? KodamaAlumnos.nombreCompleto(a) : '(alumno ' + id + ')';
  }

  function textoSituacion(s) {
    if (s.estado === 'pagado') {
      return '✓ Pagado ' + KodamaEstadisticas.textoMonto(s.monto) + (s.fecha_pago ? ' el ' + s.fecha_pago : '');
    }
    if (s.estado === 'pendiente') return '… Pendiente ' + KodamaEstadisticas.textoMonto(s.monto);
    return 'Sin registrar';
  }

  function pintar() {
    const rango = KodamaCobros.rangoDelMes(mes.value);
    const alumnos = KodamaAlumnos.actual().alumnos;

    const mensual = document.getElementById('lista-mensual');
    mensual.replaceChildren();
    const filas = KodamaCobros.resumenMensual(bloques, alumnos, pagos, mes.value);
    if (!filas.length) {
      mensual.appendChild(el('p', 'nota', 'Ningún alumno con forma de pago mensual.'));
    }
    filas.forEach(function (f) {
      const tarjeta = el('div', 'regla cobro');
      tarjeta.dataset.situacion = f.situacion.estado;
      tarjeta.appendChild(el('p', 'regla__titulo', f.nombre));
      tarjeta.appendChild(el('p', 'regla__meta',
        f.dictadas + (f.dictadas === 1 ? ' clase · ' : ' clases · ') + KodamaEstadisticas.textoHoras(f.horas) +
        ' · ' + (f.sinTarifa ? 'sin tarifa' : KodamaEstadisticas.textoMonto(f.monto))));
      tarjeta.appendChild(el('p', 'cobro__situacion', textoSituacion(f.situacion)));
      if (f.situacion.estado !== 'pagado') {
        const boton = el('button', 'secundario', f.situacion.estado === 'pendiente' ? 'Marcar pagado' : 'Registrar pago');
        boton.type = 'button';
        boton.addEventListener('click', function () {
          if (f.situacion.estado === 'pendiente') {
            abrir(f.situacion.pago, { estado: 'pagado', fecha_pago: KodamaFecha.hoy() });
          } else {
            abrir(null, {
              alumno_id: f.alumno.id, desde: rango.desde, hasta: rango.hasta,
              monto: String(f.monto), estado: 'pagado', fecha_pago: KodamaFecha.hoy()
            });
          }
        });
        tarjeta.appendChild(boton);
      }
      mensual.appendChild(tarjeta);
    });

    const lista = document.getElementById('lista-pagos');
    lista.replaceChildren();
    const delMes = KodamaCobros.pagosDelPeriodo(pagos, rango.desde, rango.hasta)
      .sort(function (a, b) { return nombreDe(a.alumno_id).localeCompare(nombreDe(b.alumno_id)); });
    if (!delMes.length) lista.appendChild(el('p', 'nota', 'Todavía no hay pagos registrados en este mes.'));
    delMes.forEach(function (p) {
      const tarjeta = el('button', 'regla cobro');
      tarjeta.type = 'button';
      tarjeta.dataset.situacion = p.estado;
      tarjeta.appendChild(el('p', 'regla__titulo', nombreDe(p.alumno_id) + ' · ' + KodamaEstadisticas.textoMonto(Number(p.monto))));
      tarjeta.appendChild(el('p', 'regla__meta', 'Del ' + p.desde + ' al ' + p.hasta + (p.notas ? ' · ' + p.notas : '')));
      tarjeta.appendChild(el('p', 'cobro__situacion',
        p.estado === 'pagado' ? '✓ Pagado' + (p.fecha_pago ? ' el ' + p.fecha_pago : '') : '… Pendiente'));
      tarjeta.addEventListener('click', function () { abrir(p); });
      lista.appendChild(tarjeta);
    });
    zona.hidden = false;
  }

  async function cargar() {
    if (!/^\d{4}-\d{2}$/.test(mes.value)) return;
    const rango = KodamaCobros.rangoDelMes(mes.value);
    const numero = ++carga;
    estado.textContent = 'Cargando…';
    try {
      const datos = await Promise.all([
        pedir('listarBloquesRango', { desde: rango.desde, hasta: rango.hasta }),
        pedir('listarPagos'),
        KodamaAlumnos.cargar()
      ]);
      if (numero !== carga) return;
      bloques = datos[0];
      pagos = datos[1];
      estado.textContent = '';
      pintar();
    } catch (error) {
      if (numero !== carga) return;
      estado.textContent = 'No se pudo cargar: ' + error.message;
    }
  }

  // --- Diálogo de pago ---------------------------------------------------

  function llenarAlumnos(elegido) {
    campos.alumno_id.replaceChildren();
    const vacio = el('option', null, '— Elegí un alumno —');
    vacio.value = '';
    campos.alumno_id.appendChild(vacio);
    KodamaAlumnos.buscar('', null, { incluirArchivados: false }).forEach(function (a) {
      const o = el('option', null, KodamaAlumnos.etiqueta(a));
      o.value = a.id;
      campos.alumno_id.appendChild(o);
    });
    // Un pago viejo de un alumno archivado igual se puede editar.
    const opciones = Array.prototype.map.call(campos.alumno_id.options, function (o) { return o.value; });
    if (elegido && opciones.indexOf(elegido) === -1) {
      const o = el('option', null, nombreDe(elegido));
      o.value = elegido;
      campos.alumno_id.appendChild(o);
    }
  }

  function abrir(pago, cambios) {
    const rango = KodamaCobros.rangoDelMes(mes.value);
    const valores = Object.assign({
      alumno_id: '', desde: rango.desde, hasta: rango.hasta, monto: '', estado: 'pendiente', fecha_pago: '', notas: ''
    }, pago || {}, cambios || {});
    idEnEdicion = pago ? pago.id : null;
    llenarAlumnos(valores.alumno_id);
    Object.keys(campos).forEach(function (clave) { campos[clave].value = valores[clave] || ''; });
    document.getElementById('titulo-dialogo-pago').textContent = pago ? 'Editar pago' : 'Registrar pago';
    document.getElementById('archivar-pago').hidden = !pago;
    document.getElementById('error-pago').textContent = '';
    document.getElementById('detalle-monto').textContent = '';
    dialogo.showModal();
  }

  /** Monto del periodo: horas dictadas × tarifa del alumno (pide ese rango). */
  async function calcularMonto() {
    const detalle = document.getElementById('detalle-monto');
    const alumno = KodamaAlumnos.porId(campos.alumno_id.value);
    if (!alumno) { detalle.textContent = 'Elegí un alumno.'; return; }
    if (!KodamaEstadisticas.rangoValido(campos.desde.value, campos.hasta.value)) {
      detalle.textContent = 'Revisá el periodo.';
      return;
    }
    detalle.textContent = 'Calculando…';
    try {
      const enRango = await pedir('listarBloquesRango', { desde: campos.desde.value, hasta: campos.hasta.value });
      const r = KodamaEstadisticas.calcular(enRango, KodamaAlumnos.actual().alumnos,
        { desde: campos.desde.value, hasta: campos.hasta.value });
      const fila = r.porAlumno.find(function (f) { return f.id === alumno.id; });
      if (KodamaEstadisticas.tarifaDe(alumno) === null) {
        detalle.textContent = 'No tiene tarifa cargada: completala en Alumnos.';
        return;
      }
      campos.monto.value = String(fila ? fila.monto : 0);
      const n = fila ? fila.dictadas : 0;
      detalle.textContent = n + (n === 1 ? ' clase dictada · ' : ' clases dictadas · ') +
        KodamaEstadisticas.textoHoras(fila ? fila.horas : 0) + ' × Bs ' + alumno.tarifa_hora + '/h';
    } catch (error) {
      detalle.textContent = 'No se pudo calcular: ' + error.message;
    }
  }

  async function guardar(evento) {
    evento.preventDefault();
    const datos = {};
    Object.keys(campos).forEach(function (clave) { datos[clave] = campos[clave].value; });
    const error = document.getElementById('error-pago');
    if (!datos.alumno_id) { error.textContent = 'Elegí un alumno.'; return; }
    const boton = document.getElementById('guardar-pago');
    boton.disabled = true;
    try {
      const guardado = idEnEdicion
        ? await pedir('actualizarPago', { id: idEnEdicion, cambios: datos })
        : await pedir('crearPago', { pago: datos });
      pagos = pagos.filter(function (p) { return p.id !== guardado.id; }).concat([guardado]);
      dialogo.close();
      pintar();
    } catch (e) {
      // Queda abierto con lo escrito, para corregir y reintentar.
      error.textContent = 'No se pudo guardar: ' + e.message;
    } finally {
      boton.disabled = false;
    }
  }

  async function archivar() {
    if (!idEnEdicion || !confirm('¿Archivar este pago? Deja de contar, pero no se borra.')) return;
    try {
      const archivado = await pedir('archivarPago', { id: idEnEdicion });
      pagos = pagos.filter(function (p) { return p.id !== archivado.id; }).concat([archivado]);
      dialogo.close();
      pintar();
    } catch (e) {
      document.getElementById('error-pago').textContent = 'No se pudo archivar: ' + e.message;
    }
  }

  campos.estado.addEventListener('change', function () {
    if (campos.estado.value === 'pagado' && !campos.fecha_pago.value) campos.fecha_pago.value = KodamaFecha.hoy();
  });
  document.getElementById('form-pago').addEventListener('submit', guardar);
  document.getElementById('calcular-monto').addEventListener('click', calcularMonto);
  document.getElementById('cancelar-pago').addEventListener('click', function () { dialogo.close(); });
  document.getElementById('archivar-pago').addEventListener('click', archivar);
  document.getElementById('nuevo-pago').addEventListener('click', function () { abrir(null); });
  mes.addEventListener('change', cargar);

  cargar();
})();
