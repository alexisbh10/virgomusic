require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder().setName('play').setDescription('Reproduce una canción en tu canal de voz').addStringOption(option => option.setName('cancion').setDescription('El nombre o URL de la canción').setRequired(true)),
    new SlashCommandBuilder().setName('stop').setDescription('Detiene la reproducción de la canción'),    
    new SlashCommandBuilder().setName('skip').setDescription('Salta a la siguiente canción en la cola'),  
    new SlashCommandBuilder().setName('queue').setDescription('Muestra la cola de canciones actuales')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const CLIENT_ID = '1496947209529463035'; 

(async () => {
    try {
        console.log('Iniciando despliegue de comandos de barra...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('✅ Comandos de barra desplegados exitosamente.');
        
        // CRÍTICO: Cierra el script para que el start.sh pueda continuar
        process.exit(0); 
    } catch (error) {
        console.error('❌ Error al desplegar comandos de barra:', error);
        process.exit(1);
    }  
})();