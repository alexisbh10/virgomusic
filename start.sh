#!/bin/bash
# 1. Registrar comandos y cerrar
node deploy.js

# 2. Iniciar Lavalink con un LÍMITE DE RAM (256 MB máximo)
java -Xmx256m -jar Lavalink.jar &

# 3. Iniciar el bot INMEDIATAMENTE
node index.js