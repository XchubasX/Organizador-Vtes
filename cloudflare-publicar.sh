#!/bin/bash
# Lo ejecuta Cloudflare (Workers) cada vez que hay un cambio en GitHub.
# Copia SOLO los archivos del sitio a la carpeta "publicado" (la que Cloudflare pone en línea);
# deja fuera las pruebas automáticas y los archivos internos del repositorio.
# Configuración en Cloudflare: comando de construcción "bash cloudflare-publicar.sh",
# comando de despliegue "npx wrangler deploy" (la carpeta "publicado" se indica en wrangler.jsonc).
set -e
rm -rf publicado
mkdir publicado
for f in *; do
  case "$f" in
    publicado|pruebas|README.md|_config.yml|cloudflare-publicar.sh|wrangler.jsonc|worker.js|avisos-servidor.js|node_modules) ;;
    *) cp -r "$f" publicado/ ;;
  esac
done
echo "Archivos publicados:"; ls -R publicado
