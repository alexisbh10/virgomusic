require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce una canción en tu canal de voz')
        .addStringOption(option =>
            option.setName('cancion')
                .setDescription('El nombre o URL de la canción')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detiene la reproducción de la canción'),    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta a la siguiente canción en la cola'),  
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola de canciones actuales')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const GUILD_ID = 'TU_GUILD_ID'; // Reemplaza con tu ID de servidor
const CLIENT_ID = 'TU_CLIENT_ID'; // Reemplaza con tu ID de aplicación

(async () => {
    try {
        console.log('Iniciando despliegue de comandos de barra...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('Comandos de barra desplegados exitosamente.');
    } catch (error) {
        console.error('Error al desplegar comandos de barra:', error);
    }  
})();