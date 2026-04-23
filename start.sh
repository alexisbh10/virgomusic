#!/bin/bash
# 1. Registrar comandos y cerrar
node deploy.js

# 2. Iniciar Lavalink en segundo plano
java -jar Lavalink.jar &

# 3. Iniciar el bot INMEDIATAMENTE
# El bot estará en Discord al instante. Shoukaku esperará pacientemente
# a que Lavalink despierte en el fondo.
node index.js