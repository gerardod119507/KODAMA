# Configurar Google Sheets + Apps Script (Checkpoint 2)

Esta guía se hace **una sola vez**, desde una computadora (el editor de Apps
Script no funciona bien en el celular). La prueba final sí se hace en el
celular.

Nada de lo que crees acá (ID del Sheet, URL del Web App, token) se sube al
repositorio.

---

## A. Crear la hoja de cálculo

1. Entrá a <https://sheets.google.com> con tu cuenta de Google.
2. Hacé clic en **En blanco** para crear una hoja nueva.
3. Hacé clic en el título *Hoja de cálculo sin título* (arriba a la
   izquierda) y escribí `KODAMA`. Presioná Enter.

## B. Abrir el editor de Apps Script

4. En el menú de arriba, hacé clic en **Extensiones**.
5. Hacé clic en **Apps Script**. Se abre una pestaña nueva con el editor.
6. Hacé clic en el título *Proyecto sin título* (arriba a la izquierda),
   escribí `KODAMA API` y hacé clic en **Cambiar nombre**.

> **Por qué así:** al abrir Apps Script desde *dentro* de la hoja, el script
> queda "atado" a esa hoja. Eso significa que el código nunca necesita el ID
> del Sheet — usa `getActiveSpreadsheet()` y ya. Por eso el ID no aparece en
> ningún archivo del repositorio.

## C. Pegar el código

7. En el panel izquierdo, bajo **Archivos**, vas a ver un archivo llamado
   `Código.gs` (o `Code.gs`). Hacé clic en él.
8. Seleccioná todo el contenido del editor (Ctrl+A) y borralo.
9. Abrí [`apps-script/Code.gs`](../apps-script/Code.gs) en GitHub, copiá todo
   su contenido y pegalo en el editor.
10. En el panel izquierdo, al lado de **Archivos**, hacé clic en el **+**.
11. Hacé clic en **Secuencia de comandos**.
12. Escribí `Setup` como nombre y presioná Enter.
13. Abrí [`apps-script/Setup.gs`](../apps-script/Setup.gs) en GitHub, copiá
    todo su contenido y pegalo en el editor (reemplazando lo que haya).
14. Hacé clic en el ícono de **disquete** (Guardar proyecto), o Ctrl+S.

## D. Fijar la zona horaria del proyecto

15. En la barra lateral izquierda (los íconos), hacé clic en el engranaje
    **Configuración del proyecto**.
16. Marcá la casilla **Mostrar el archivo de manifiesto "appsscript.json" en
    el editor**.
17. Volvé al **Editor** (ícono `<>` en la barra lateral).
18. Hacé clic en el archivo `appsscript.json` que ahora aparece en la lista.
19. Buscá la línea `"timeZone": "..."` y cambiá el valor a
    `"America/La_Paz"`. Debe quedar así:
    `"timeZone": "America/La_Paz",`
20. Guardá con Ctrl+S.

> **Por qué:** si la zona del proyecto y la de la hoja no coinciden, los
> cálculos de fecha en Apps Script quedan desfasados varias horas y un bloque
> de las 23:00 puede terminar guardado en el día equivocado.

## E. Crear las hojas `Areas` y `Bloques`

21. En el editor, arriba, hay un menú desplegable con nombres de funciones.
    Abrilo y elegí **configurarHojas**.
22. Hacé clic en **Ejecutar**.
23. Google va a mostrar una ventana: **Se requiere autorización**. Hacé clic
    en **Revisar permisos**.
24. Elegí tu cuenta de Google.
25. Va a aparecer *Google no ha verificado esta aplicación*. Hacé clic en
    **Configuración avanzada** (abajo a la izquierda).
26. Hacé clic en **Ir a KODAMA API (no seguro)**.
27. Leé los permisos (ver explicación abajo) y hacé clic en **Permitir**.
28. Esperá a que abajo aparezca **Ejecución completada**.

### Qué permisos pide Google y por qué son seguros

Google va a pedir: **"Ver, editar, crear y eliminar todas tus hojas de cálculo
de Google Drive"**.

- Suena enorme, pero es el único permiso que Google ofrece para Sheets: no
  existe una versión "solo esta hoja" para este tipo de script.
- El código solo usa `getActiveSpreadsheet()`, que devuelve **únicamente la
  hoja a la que está atado el script**. Nunca lista ni abre otros archivos.
  Podés verificarlo: el código completo está en `apps-script/` en el repo.
- **No** pide acceso a Gmail, contactos, calendario ni al resto de tu Drive.
- El aviso *"no verificada"* solo significa que este script no pasó por la
  revisión pública de Google — algo que aplica a apps que se distribuyen a
  terceros. Acá vos sos el autor y el único usuario.
- Podés revocar el acceso cuando quieras en
  <https://myaccount.google.com/permissions>.

29. Volvé a la pestaña de la hoja de cálculo y recargá la página (F5).
30. Confirmá que abajo aparecen dos pestañas nuevas: **Areas** y **Bloques**.
31. Hacé clic en **Areas**: debe tener los encabezados `nombre` y `color`, y
    las 4 áreas con sus colores.
32. Hacé clic en **Bloques**: debe tener los 11 encabezados y ninguna fila de
    datos.
33. Si sobró la pestaña original vacía (*Hoja 1*), hacé clic derecho sobre
    ella y elegí **Eliminar**.
34. Verificá la zona horaria de la hoja: menú **Archivo** → **Configuración**
    → el campo **Zona horaria** debe decir `(GMT-04:00) La Paz`. Cerrá con
    **Guardar configuración**.

> Las columnas `fecha`, `inicio` y `fin` ya quedaron con formato **Texto sin
> formato**, aplicado por el script antes de escribir nada. Por eso
> `2026-09-22` se queda como texto y Sheets no lo convierte a fecha.

## F. Crear el token secreto

35. Volvé a la pestaña del editor de Apps Script.
36. En el desplegable de funciones, elegí **generarToken**.
37. Hacé clic en **Ejecutar**.
38. Abajo, en **Registro de ejecución**, vas a ver una línea con el token
    (32 caracteres). Copialo y guardalo en un lugar seguro (el gestor de
    contraseñas del celular, por ejemplo).
39. Para verificar dónde quedó guardado: barra lateral → **Configuración del
    proyecto** → sección **Propiedades de la secuencia de comandos**. Debe
    existir `KODAMA_TOKEN` con ese valor.

> **Por qué así:** el token vive en las Propiedades del script, que son parte
> de tu proyecto de Apps Script, no del código. Por eso el token nunca entra
> al repositorio público aunque el código sí esté ahí.
>
> Nota menor: el token queda también en el registro de ejecución de tu
> proyecto por unos días. Es tu propia cuenta, así que no es un problema real,
> pero por eso `generarToken` no vuelve a imprimirlo si ya existe uno.

## G. Publicar el Web App

40. Arriba a la derecha, hacé clic en **Implementar**.
41. Hacé clic en **Nueva implementación**.
42. Hacé clic en el engranaje **Seleccionar tipo** y elegí **Aplicación web**.
43. En **Descripción**, escribí `v1`.
44. En **Ejecutar como**, elegí **Yo (tu-correo@gmail.com)**.
45. En **Quién tiene acceso**, elegí **Cualquier usuario**.
46. Hacé clic en **Implementar**.
47. Si pide autorización otra vez, repetí los pasos 23 a 27.
48. Copiá la **URL de la aplicación web**. Termina en `/exec`. Guardala junto
    al token.
49. Hacé clic en **Listo**.

> **Por qué "Cualquier usuario":** tu app corre en GitHub Pages, sin login de
> Google. Si eligieras *"Cualquier usuario con cuenta de Google"*, el
> navegador recibiría una pantalla de login en vez de datos y nada
> funcionaría.
>
> **Ese es exactamente el motivo del token:** la URL queda abierta a Internet,
> así que quien la tenga puede mandarle peticiones. Sin un token válido en el
> cuerpo del POST, el Web App responde `no_autorizado` y no toca la hoja.
> La URL es larga y aleatoria, pero eso no es seguridad — el token sí.

## H. Probar (esto sí, desde el celular)

50. Abrí en el celular: `https://gerardod119507.github.io/KODAMA/config.html`
51. En **URL del Web App**, pegá la URL del paso 48.
52. En **Token**, pegá el token del paso 38.
53. Tocá **Probar y guardar**.

**Qué debe pasar:** aparece *"Conexión correcta. Datos guardados en este
dispositivo."* y debajo la lista de las 4 áreas con sus colores. Eso confirma
que un token correcto devuelve datos reales de la hoja.

54. Ahora tocá **Probar con token incorrecto**.

**Qué debe pasar:** aparece *"Correcto: el servidor rechazó el token
incorrecto (no_autorizado)."* y **no** aparece ninguna área. Eso confirma que
sin el token no se puede leer nada.

Si las dos pruebas dan ese resultado, el Checkpoint 2 está aprobado.

---

## Cuando cambiemos el código de Apps Script

**Ya no hace falta hacer nada de esto a mano.** Desde que se agregó el
despliegue automático (ver "Despliegue de Apps Script (CI/CD)" en
`CLAUDE.md`), cada vez que se mergea a `main` un cambio en `apps-script/`,
un workflow de GitHub Actions pega el código nuevo y actualiza el
despliegue existente solo. La URL del Web App no cambia. No hace falta
volver a abrir el editor de Apps Script para esto.

El editor sigue siendo necesario solo para: generar el token (una vez, ver
paso 38) y revisar el registro de ejecución (`Ver` → `Registros de
ejecución`) si algo falla.

### Cómo se armaron los secrets del despliegue automático (referencia)

Esto ya está hecho — queda documentado por si hay que rehacerlo alguna vez
(por ejemplo, si las credenciales vencen):

1. En una computadora, con Node instalado: `npm install -g @google/clasp`,
   después `clasp login`. Abre el navegador, pide autorizar la cuenta de
   Google, y genera `~/.clasprc.json`.
2. El contenido completo de ese archivo se pegó como el secret
   `CLASPRC_JSON` del repo (`Settings` → `Secrets and variables` →
   `Actions`).
   > **Importante:** el número de versión de `clasp` que instalaste en el
   > paso 1 (`clasp --version`) tiene que coincidir con la versión fijada en
   > `.github/workflows/deploy-apps-script.yml` (ver "Despliegue de Apps
   > Script (CI/CD)" en `CLAUDE.md`). Versiones mayores distintas guardan
   > `~/.clasprc.json` con formatos incompatibles entre sí. Si volvés a
   > correr `clasp login` con una versión de `clasp` distinta a la del
   > workflow, actualizá los dos juntos (el secret y el número en el
   > workflow) en el mismo PR.
3. `SCRIPT_ID`: **Configuración del proyecto** en el editor de Apps Script
   → **ID del proyecto de Secuencia de comandos**.
4. `DEPLOYMENT_ID`: **Implementar** → **Administrar implementaciones** → el
   ícono de información (ⓘ) junto al despliegue del paso 46 → **ID de
   implementación**.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "La respuesta no es JSON" | El acceso quedó en *Cualquier usuario con cuenta de Google* | Paso 45, volvé a implementar a mano una vez (esto no lo toca el despliegue automático) |
| "La respuesta no es JSON" | La URL termina en `/dev` en vez de `/exec` | Usá la URL del paso 48 |
| `no_autorizado` con el token correcto | El token se copió con un espacio de más | Copialo de nuevo desde Propiedades del script (paso 39) |
| Cambiaste el código, lo mergeaste, y no pasa nada | Revisá la pestaña **Actions** del repo en GitHub: el workflow "Deploy Apps Script" tiene que terminar en verde | Si falla, el error suele estar en algún secret vencido o mal copiado |
| El workflow dice `Invalid deployment ID` | El secret `DEPLOYMENT_ID` está mal copiado o trae un espacio | Ver "Cómo verificar el DEPLOYMENT_ID" abajo |
| Una hoja nueva no aparece en el Sheet | El código se subió pero el **despliegue** no se actualizó | Mismo caso de arriba: el Web App sigue sirviendo la versión vieja |

### Cómo verificar el DEPLOYMENT_ID

El deployment ID es lo que identifica al Web App publicado. Es **la parte
del medio de tu propia URL**:

```
https://script.google.com/macros/s/ESTO-DE-ACA-ES-EL-DEPLOYMENT-ID/exec
```

1. En el editor de Apps Script: **Implementar** → **Administrar
   implementaciones**.
2. Clic en el ícono de información (ⓘ) del despliegue activo → copiá el
   **ID de implementación**.
3. Confirmá que sea idéntico al pedazo entre `/macros/s/` y `/exec` de la
   URL que usás en `config.html`. Si no coinciden, el que vale es el de la
   URL que realmente funciona.
4. En GitHub: `Settings` → `Secrets and variables` → `Actions` →
   `DEPLOYMENT_ID` → **Update** → pegalo **sin espacios ni saltos de línea**
   antes ni después.
5. Volvé a la pestaña **Actions** → workflow "Deploy Apps Script" → botón
   **Run workflow**.

> El workflow ahora **falla en rojo** si el deployment ID es inválido. Antes
> se quedaba en verde aunque no hubiera desplegado nada, que fue lo que hizo
> que el Checkpoint 4 pareciera terminado sin estarlo.
