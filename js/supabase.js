/**
 * KODAMA — conexión con Supabase (Checkpoint 13).
 *
 * Sin librerías: el inicio de sesión (Supabase Auth) y los datos (la API
 * REST que Supabase arma sola sobre las tablas, PostgREST) son peticiones
 * HTTP normales, así que alcanza con fetch. Motivo: la regla del proyecto
 * de no sumar dependencias sin necesidad, y no cargar en la página código
 * de terceros que podría leer los datos de los alumnos.
 *
 * Qué protege los datos: la clave pública de abajo NO abre nada por sí
 * sola (por eso puede estar en un repo público). Cada petición lleva además
 * la sesión de Gerardo, un token que dura una hora y se renueva solo, y la
 * base de datos solo deja ver y tocar las filas de quien inició sesión
 * (Row Level Security, ver supabase/migraciones/001_esquema_inicial.sql).
 */
const KodamaSupabase = (function () {
  const URL_PROYECTO = 'https://jpceexuzagfyiqvoxmud.supabase.co';
  const CLAVE_PUBLICA = 'sb_publishable_TQtkWZqiUwLOgP0UAwAtAQ_iCBXNoNt';
  const CLAVE_SESION = 'kodama.sesion';
  // Se renueva un minuto antes de que venza: una petición que sale justo en
  // el límite no debe llegar con el token ya vencido.
  const MARGEN_MS = 60 * 1000;

  // --- Sesión guardada en el dispositivo -----------------------------

  // Respaldo por si localStorage no deja escribir (modo privado estricto):
  // la sesión dura lo que dure la página.
  let sesionEnMemoria = null;

  function leerSesion() {
    try {
      const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION));
      return sesion && sesion.access_token && sesion.refresh_token ? sesion : null;
    } catch (error) {
      return null;
    }
  }

  function guardarSesion(datos) {
    const anterior = leerSesion();
    const sesion = {
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      expira: Date.now() + Number(datos.expires_in || 3600) * 1000,
      correo: (datos.user && datos.user.email) || (anterior && anterior.correo) || ''
    };
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch (error) {
      // Sin almacenamiento: queda solo en memoria.
    }
    sesionEnMemoria = sesion;
    return sesion;
  }

  function sesionActual() {
    return leerSesion() || sesionEnMemoria;
  }

  function borrarSesion() {
    sesionEnMemoria = null;
    try {
      localStorage.removeItem(CLAVE_SESION);
    } catch (error) {
      // nada que borrar
    }
  }

  function haySesion() {
    return Boolean(sesionActual());
  }

  function correo() {
    const sesion = sesionActual();
    return sesion ? sesion.correo : '';
  }

  // --- Errores ---------------------------------------------------------

  /**
   * Sin red (o el servidor no contesta): el error se marca, así quien llama
   * puede mostrar lo guardado en el dispositivo con "Sin conexión", igual
   * que cuando el Web App de Google no respondía.
   */
  function deRed(error) {
    const marcado = error instanceof Error ? error : new Error(String(error));
    marcado.red = true;
    return marcado;
  }

  async function leerJson(respuesta) {
    let texto;
    try {
      texto = await respuesta.text();
    } catch (error) {
      throw deRed(error);
    }
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch (error) {
      return null;
    }
  }

  function mensajeDeAuth(datos, status) {
    const texto = (datos && (datos.error_description || datos.msg || datos.message || datos.error)) || ('HTTP ' + status);
    const codigo = (datos && (datos.error_code || datos.error)) || '';
    if (codigo === 'invalid_credentials' || codigo === 'invalid_grant' || /invalid login credentials/i.test(texto)) {
      return 'Correo o contraseña incorrectos.';
    }
    if (codigo === 'email_not_confirmed' || /email not confirmed/i.test(texto)) {
      return 'Falta confirmar ese correo en Supabase (Authentication → Users).';
    }
    return texto;
  }

  /**
   * Errores de la base de datos con un prefijo corto, como los del Apps
   * Script ("dato_invalido: …"). Lo normal es que nunca aparezcan: la app
   * valida todo antes de escribir; la base es la última red.
   */
  function errorDeDatos(status, datos) {
    const codigo = (datos && datos.code) || '';
    const detalle = (datos && (datos.message || datos.msg)) || ('HTTP ' + status);
    let prefijo = 'error_base_datos';
    if (status === 401 || codigo === '42501') prefijo = 'no_autorizado';
    else if (codigo === '23505') prefijo = 'duplicado';
    else if (codigo === '23503') prefijo = 'referencia_invalida';
    else if (['23514', '23502', '22P02', '22007', '22008', '22023'].indexOf(codigo) !== -1) prefijo = 'dato_invalido';
    else if (status >= 500) prefijo = 'servidor_no_disponible';

    let mensaje = prefijo + ': ' + detalle;
    if (prefijo === 'no_autorizado') {
      mensaje += ' (inicia sesión de nuevo en Configuración)';
    } else if (prefijo === 'servidor_no_disponible') {
      mensaje += ' (si pasó más de una semana sin usar KODAMA, el proyecto puede estar en pausa: ' +
        'reactívalo en supabase.com)';
    }
    const error = new Error(mensaje);
    error.codigo = codigo;
    error.status = status;
    // Un servidor caído o en pausa se trata como "sin conexión": la app
    // muestra lo último guardado en vez de una pantalla vacía.
    if (status >= 500) error.red = true;
    return error;
  }

  // --- Inicio de sesión (Supabase Auth) ------------------------------

  async function pedirAuth(ruta, cuerpo, token) {
    const cabeceras = { apikey: CLAVE_PUBLICA, 'Content-Type': 'application/json' };
    if (token) cabeceras.Authorization = 'Bearer ' + token;
    let respuesta;
    try {
      respuesta = await fetch(URL_PROYECTO + '/auth/v1/' + ruta, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo || {})
      });
    } catch (error) {
      throw deRed(error);
    }
    const datos = await leerJson(respuesta);
    if (!respuesta.ok) {
      const error = new Error(mensajeDeAuth(datos, respuesta.status));
      error.status = respuesta.status;
      if (respuesta.status >= 500) error.red = true;
      throw error;
    }
    return datos;
  }

  async function iniciarSesion(correoIngresado, clave) {
    const correoLimpio = String(correoIngresado || '').trim();
    if (!correoLimpio || !clave) throw new Error('Escribe tu correo y tu contraseña.');
    const datos = await pedirAuth('token?grant_type=password', { email: correoLimpio, password: clave });
    return guardarSesion(datos);
  }

  // Si varias peticiones necesitan renovar a la vez, se renueva una sola
  // vez y todas esperan la misma respuesta.
  let renovando = null;

  function renovar(sesion) {
    if (!renovando) {
      renovando = pedirAuth('token?grant_type=refresh_token', { refresh_token: sesion.refresh_token })
        .then(guardarSesion)
        .catch(function (error) {
          if (error.red) throw error; // sin red: la sesión sigue guardada
          borrarSesion();
          throw new Error('sesion_vencida: vuelve a iniciar sesión en Configuración.');
        })
        .finally(function () { renovando = null; });
    }
    return renovando;
  }

  async function tokenVigente(forzarRenovacion) {
    const sesion = sesionActual();
    if (!sesion) throw new Error('sin_sesion: inicia sesión en Configuración.');
    if (!forzarRenovacion && sesion.expira - MARGEN_MS > Date.now()) return sesion.access_token;
    return (await renovar(sesion)).access_token;
  }

  async function cerrarSesion() {
    const sesion = sesionActual();
    borrarSesion();
    if (!sesion) return;
    try {
      await pedirAuth('logout', {}, sesion.access_token);
    } catch (error) {
      // Ya se borró del dispositivo; si el aviso al servidor falla, el
      // token igual vence solo en una hora.
    }
  }

  // --- Datos (API REST) -------------------------------------------------

  /**
   * Una petición a la API REST: metodo, ruta (tabla + filtros, ej.
   * "bloques?fecha=gte.2026-10-12") y opciones { cuerpo, prefer }. Si el
   * token venció antes de lo esperado (401), se renueva y se reintenta una
   * sola vez.
   */
  async function rest(metodo, ruta, opciones) {
    const o = opciones || {};
    for (let intento = 0; ; intento++) {
      const token = await tokenVigente(intento > 0);
      const cabeceras = { apikey: CLAVE_PUBLICA, Authorization: 'Bearer ' + token };
      if (o.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
      if (o.prefer) cabeceras.Prefer = o.prefer;
      let respuesta;
      try {
        respuesta = await fetch(URL_PROYECTO + '/rest/v1/' + ruta, {
          method: metodo,
          headers: cabeceras,
          body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo)
        });
      } catch (error) {
        throw deRed(error);
      }
      const datos = await leerJson(respuesta);
      if (respuesta.status === 401 && intento === 0) continue;
      if (!respuesta.ok) throw errorDeDatos(respuesta.status, datos);
      return datos;
    }
  }

  return {
    URL_PROYECTO: URL_PROYECTO,
    haySesion: haySesion,
    correo: correo,
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    rest: rest
  };
})();
