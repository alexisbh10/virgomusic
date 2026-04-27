require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce una canción en tu canal de voz')
        .addStringOption(option => 
            option.setName('cancion')
            .setDescription('Nombre de la canción o URL (Spotify, YouTube, SoundCloud...)')
            .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Salta a la siguiente canción en la cola'),  
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Detiene la música y vacía la cola'),    
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la lista de canciones actuales'),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa la canción actual'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Reanuda la canción pausada'),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ajusta el volumen del bot (1-100)')
        .addIntegerOption(option => 
            option.setName('nivel')
            .setDescription('Nivel de volumen')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
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
        process.exit(0); 
    } catch (error) {
        console.error('❌ Error al desplegar comandos de barra:', error);
        process.exit(1);
    }  
})();