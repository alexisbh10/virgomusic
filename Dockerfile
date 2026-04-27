# Usamos un Linux base
FROM ubuntu:22.04

# Instalamos Java 17 y Node.js 18
RUN apt-get update && \
    apt-get install -y openjdk-17-jre curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

# Establecemos nuestra carpeta de trabajo
WORKDIR /app

# Copiamos primero los archivos de dependencias y las instalamos
COPY package*.json ./
RUN npm install

# Copiamos el resto de los archivos (bot, Lavalink, plugins)
COPY . .

# Le damos permiso de ejecución a nuestro script de arranque
RUN chmod +x start.sh

# Exponemos el puerto de Lavalink por si acaso Render lo necesita
EXPOSE 2333

# Comando para encender todo
CMD ["./start.sh"]