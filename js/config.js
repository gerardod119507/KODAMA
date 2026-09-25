const campoUrl = document.getElementById('url');
const campoToken = document.getElementById('token');
const resultado = document.getElementById('resultado');
const listaAreas = document.getElementById('areas');
const continuarEnvoltorio = document.getElementById('continuar-envoltorio');

const configGuardada = KodamaApi.leerConfig();
campoUrl.value = configGuardada.url;
campoToken.value = configGuardada.token;
document.getElementById('bienvenida').hidden = Boolean(configGuardada.url && configGuardada.token);

function mostrar(mensaje) {
  resultado.textContent = mensaje;
}

function pintarAreas(areas) {
  listaAreas.replaceChildren();
  areas.forEach(function (area) {
    const item = document.createElement('li');
    item.textContent = area.nombre + ' — ' + area.color;
    listaAreas.appendChild(item);
  });
}

document.getElementById('formulario').addEventListener('submit', async function (evento) {
  evento.preventDefault();
  listaAreas.replaceChildren();
  continuarEnvoltorio.hidden = true;
  mostrar('Probando...');
  try {
    const respuesta = await KodamaApi.llamar(campoUrl.value, campoToken.value, 'listarAreas');
    if (!respuesta.ok) {
      mostrar('El servidor rechazó la petición: ' + respuesta.error);
      return;
    }
    KodamaApi.guardarConfig(campoUrl.value, campoToken.value);
    mostrar('Conexión correcta. Datos guardados en este dispositivo.');
    pintarAreas(respuesta.data);
    continuarEnvoltorio.hidden = false;
  } catch (error) {
    mostrar('Error: ' + error.message);
  }
});

document.getElementById('olvidar').addEventListener('click', function () {
  if (!confirm('¿Olvidar la URL y el token guardados en este dispositivo?')) {
    return;
  }
  KodamaApi.guardarConfig('', '');
  campoUrl.value = '';
  campoToken.value = '';
  listaAreas.replaceChildren();
  continuarEnvoltorio.hidden = true;
  mostrar('Conexión olvidada en este dispositivo.');
});

document.getElementById('probar-malo').addEventListener('click', async function () {
  listaAreas.replaceChildren();
  mostrar('Probando con un token incorrecto...');
  try {
    const respuesta = await KodamaApi.llamar(campoUrl.value, 'token-incorrecto', 'listarAreas');
    mostrar(respuesta.ok
      ? 'ATENCIÓN: el servidor aceptó un token incorrecto. Revisa el código de Apps Script.'
      : 'Correcto: el servidor rechazó el token incorrecto (' + respuesta.error + ').');
  } catch (error) {
    mostrar('Error: ' + error.message);
  }
});

document.getElementById('generar-horario').addEventListener('click', async function () {
  const resultadoHorario = document.getElementById('resultado-horario');
  resultadoHorario.textContent = 'Generando...';
  const op = KodamaMedicion.empezar('generar');
  try {
    const respuesta = await KodamaApi.llamar(campoUrl.value, campoToken.value, 'generarHorario');
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
    const respuesta = await KodamaApi.llamar(campoUrl.value, campoToken.value, 'listarSeries');
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
      const respuesta = await KodamaApi.llamar(
        campoUrl.value, campoToken.value, 'borrarSerie', { idSerie: idSerie });
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
