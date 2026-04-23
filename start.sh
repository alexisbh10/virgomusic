#!/bin/bash
# 1. Registrar los comandos en Discord antes de empezar
node deploy.js

# 2. Iniciar Lavalink en segundo plano
java -jar Lavalink.jar &

# 3. Esperar a que Lavalink cargue
echo "Esperando a que Lavalink arranque..."
sleep 100

# 4. Iniciar el bot
node index.js