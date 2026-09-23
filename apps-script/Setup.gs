/**
 * KODAMA — funciones de un solo uso.
 * Se ejecutan a mano desde el editor de Apps Script (botón "Ejecutar").
 */

function configurarHojas() {
  // Misma lógica que corre sola en cada POST (Code.gs). Esta función queda
  // como atajo manual, por si querés forzar el chequeo sin esperar a que
  // la app haga una petición.
  asegurarEstructura();
  Logger.log('Listo. Hojas "%s", "%s" y "%s" verificadas, zona horaria %s.',
    HOJA_AREAS, HOJA_BLOQUES, HOJA_HORARIO, ZONA_HORARIA);
}

function generarToken() {
  const propiedades = PropertiesService.getScriptProperties();
  if (propiedades.getProperty(PROPIEDAD_TOKEN)) {
    Logger.log('Ya existe un token. Para crear uno nuevo, borrá primero la propiedad %s ' +
      'en Configuración del proyecto.', PROPIEDAD_TOKEN);
    return;
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  propiedades.setProperty(PROPIEDAD_TOKEN, token);
  Logger.log('Token creado y guardado en Propiedades del script. Copialo:');
  Logger.log(token);
}
