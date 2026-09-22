const config = KodamaApi.leerConfig();
document.getElementById('status').textContent = config.url && config.token
  ? 'Conexión configurada en este dispositivo.'
  : 'Falta configurar la conexión.';
