-- =====================================================================
-- KODAMA · Migración 004: recordatorio de cada bloque
-- =====================================================================
-- Ya aplicada (23 oct 2026).
--
-- Cuántos minutos antes de empezar avisa el celular (0 = al comenzar;
-- null = sin recordatorio). Antes vivía solo en el dispositivo
-- (localStorage), así que la computadora y el celular no lo compartían
-- y se perdía al reinstalar la APK.
--
-- Solo agrega una columna vacía: no cambia ninguna fila existente.
-- =====================================================================

alter table public.bloques add column recordatorio integer
  check (recordatorio is null or recordatorio between 0 and 1440);
