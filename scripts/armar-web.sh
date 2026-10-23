#!/usr/bin/env bash
# Copia SOLO los archivos de la app (páginas, estilos, scripts, íconos) a
# la carpeta que se le pasa. La usan los dos workflows: el de GitHub Pages
# (la PWA + el bundle.zip del actualizador) y el de la APK. Así no se
# publican las pruebas, las migraciones ni CLAUDE.md.
set -euo pipefail
destino="${1:?uso: scripts/armar-web.sh <carpeta>}"
rm -rf "$destino"
mkdir -p "$destino"
cp ./*.html manifest.webmanifest sw.js "$destino"/
cp -r css js icons "$destino"/
