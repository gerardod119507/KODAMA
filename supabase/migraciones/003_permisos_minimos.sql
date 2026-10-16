-- =====================================================================
-- KODAMA · Migración 003: permisos mínimos
-- =====================================================================
-- Ya aplicada (16 oct 2026).
--
-- Supabase da por defecto todos los permisos sobre las tablas a
-- "authenticated" (cualquiera con sesión). La app solo necesita leer,
-- crear, editar y borrar filas, y eso siempre pasa por las reglas de RLS
-- (solo las filas propias). TRUNCATE vacía una tabla entera sin pasar por
-- RLS: la API REST no lo ofrece, pero igual se quita, por si acaso.
-- =====================================================================

revoke truncate, references, trigger on public.areas, public.cursos, public.colegios, public.alumnos,
  public.horario, public.bloques, public.pagos, public.plantillas from authenticated, anon;
