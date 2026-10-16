const formulario = document.getElementById('formulario');
const campoCorreo = document.getElementById('correo');
const campoClave = document.getElementById('clave');
const resultado = document.getElementById('resultado');
const listaAreas = document.getElementById('areas');
const continuarEnvoltorio = document.getElementById('continuar-envoltorio');
const zonaSesion = document.getElementById('sesion-iniciada');

function mostrar(mensaje) {
  resultado.textContent = mensaje;
}

/** Con sesión: quién está y "Cerrar sesión". Sin sesión: el formulario. */
function pintarSesion() {
  const conSesion = KodamaApi.haySesion();
  zonaSesion.hidden = !conSesion;
  formulario.hidden = conSesion;
  document.getElementById('sesion-correo').textContent = KodamaSupabase.correo();
}

function pintarAreas(areas) {
  listaAreas.replaceChildren();
  areas.forEach(function (area) {
    const item = document.createElement('li');
    item.textContent = area.nombre + ' — ' + area.color;
    listaAreas.appendChild(item);
  });
}

pintarSesion();

formulario.addEventListener('submit', async function (evento) {
  evento.preventDefault();
  listaAreas.replaceChildren();
  continuarEnvoltorio.hidden = true;
  mostrar('Entrando...');
  try {
    await KodamaSupabase.iniciarSesion(campoCorreo.value, campoClave.value);
    campoClave.value = '';
    // Prueba de que la base responde con esta sesión: leer las áreas.
    const respuesta = await KodamaApi.llamar('listarAreas');
    pintarSesion();
    if (!respuesta.ok) {
      mostrar('Entraste, pero la base rechazó la lectura: ' + respuesta.error);
      return;
    }
    mostrar('Listo: sesión iniciada en este dispositivo.');
    pintarAreas(respuesta.data);
    continuarEnvoltorio.hidden = false;
  } catch (error) {
    mostrar(error.red ? 'Sin conexión: revisa internet y vuelve a intentar.' : error.message);
  }
});

document.getElementById('cerrar-sesion').addEventListener('click', async function () {
  if (!confirm('¿Cerrar la sesión en este dispositivo? Para volver a entrar vas a necesitar tu contraseña.')) {
    return;
  }
  await KodamaSupabase.cerrarSesion();
  listaAreas.replaceChildren();
  continuarEnvoltorio.hidden = true;
  pintarSesion();
  mostrar('Sesión cerrada en este dispositivo.');
});

document.getElementById('generar-horario').addEventListener('click', async function () {
  const resultadoHorario = document.getElementById('resultado-horario');
  resultadoHorario.textContent = 'Generando...';
  const op = KodamaMedicion.empezar('generar');
  try {
    const respuesta = await KodamaApi.llamar('generarHorario');
    op.cerrarRed();
    if (!respuesta.ok) {
      op.terminar(false);
      resultadoHorario.textContent = 'Error: ' + respuesta.error;
      return;
    }
    const datos = respuesta.data;
    op.render(function () {
      resultadoHorario.textContent = 'Listo: ' + datos.creados + ' creados, ' +
        datos.actualizados + ' actualizados, ' + datos.archivados + ' archivados.';
    });
    op.pintado().then(function () {
      op.terminar(true);
      KodamaRendimiento.pintar(); // la medición nueva ya se ve aquí mismo
    });
  } catch (error) {
    op.terminar(false);
    resultadoHorario.textContent = 'Error: ' + error.message;
  }
});

const zonaSeries = document.getElementById('zona-series');
const selectorSerie = document.getElementById('serie');
const resultadoSeries = document.getElementById('resultado-series');
const TODAS = '__todas__';

let seriesCargadas = [];

document.getElementById('ver-series').addEventListener('click', async function () {
  resultadoSeries.textContent = 'Buscando series...';
  selectorSerie.replaceChildren();
  zonaSeries.hidden = true;
  try {
    const respuesta = await KodamaApi.llamar('listarSeries');
    if (!respuesta.ok) {
      resultadoSeries.textContent = 'Error: ' + respuesta.error;
      return;
    }
    seriesCargadas = respuesta.data;
    if (seriesCargadas.length === 0) {
      resultadoSeries.textContent = 'No hay bloques generados por ninguna serie.';
      return;
    }

    const total = seriesCargadas.reduce(function (suma, serie) { return suma + serie.cantidad; }, 0);
    const opcionTodas = document.createElement('option');
    opcionTodas.value = TODAS;
    opcionTodas.textContent = 'Todas las series (' + total + ' bloques)';
    selectorSerie.appendChild(opcionTodas);

    seriesCargadas.forEach(function (serie) {
      const opcion = document.createElement('option');
      opcion.value = serie.idSerie;
      opcion.textContent = (serie.titulo || '(sin fila en Horario)') + ' — ' + serie.cantidad + ' bloques';
      selectorSerie.appendChild(opcion);
    });

    zonaSeries.hidden = false;
    resultadoSeries.textContent = seriesCargadas.length + ' serie(s) encontrada(s).';
  } catch (error) {
    resultadoSeries.textContent = 'Error: ' + error.message;
  }
});

document.getElementById('borrar-serie').addEventListener('click', async function () {
  const elegida = selectorSerie.value;
  const aBorrar = elegida === TODAS
    ? seriesCargadas.map(function (serie) { return serie.idSerie; })
    : [elegida];

  const cuantos = seriesCargadas
    .filter(function (serie) { return aBorrar.indexOf(serie.idSerie) !== -1; })
    .reduce(function (suma, serie) { return suma + serie.cantidad; }, 0);

  if (!confirm('Se van a borrar ' + cuantos + ' bloques. Esto no se puede deshacer. ¿Seguir?')) {
    return;
  }

  resultadoSeries.textContent = 'Borrando...';
  let borrados = 0;
  try {
    for (const idSerie of aBorrar) {
      const respuesta = await KodamaApi.llamar('borrarSerie', { idSerie: idSerie });
      if (!respuesta.ok) {
        resultadoSeries.textContent = 'Error: ' + respuesta.error;
        return;
      }
      borrados += respuesta.data.borrados;
    }
    resultadoSeries.textContent = 'Listo: ' + borrados + ' bloques borrados.';
    zonaSeries.hidden = true;
    seriesCargadas = [];
  } catch (error) {
    resultadoSeries.textContent = 'Error: ' + error.message;
  }
});

// Configuración no espera datos: la pantalla de arranque (si la app se abrió
// aquí) se va enseguida.
KodamaCarga.listo();
