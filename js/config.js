const campoUrl = document.getElementById('url');
const campoToken = document.getElementById('token');
const resultado = document.getElementById('resultado');
const listaAreas = document.getElementById('areas');

const configGuardada = KodamaApi.leerConfig();
campoUrl.value = configGuardada.url;
campoToken.value = configGuardada.token;

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
  } catch (error) {
    mostrar('Error: ' + error.message);
  }
});

document.getElementById('probar-malo').addEventListener('click', async function () {
  listaAreas.replaceChildren();
  mostrar('Probando con un token incorrecto...');
  try {
    const respuesta = await KodamaApi.llamar(campoUrl.value, 'token-incorrecto', 'listarAreas');
    mostrar(respuesta.ok
      ? 'ATENCIÓN: el servidor aceptó un token incorrecto. Revisá el código de Apps Script.'
      : 'Correcto: el servidor rechazó el token incorrecto (' + respuesta.error + ').');
  } catch (error) {
    mostrar('Error: ' + error.message);
  }
});
