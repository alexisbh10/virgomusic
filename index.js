require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. FORZAR MOTOR DE AUDIO (FFMPEG)
process.env.DP_FFMPEG_EXE = ffmpeg;

// Servidor para UptimeRobot
const app = express();
app.get('/', (req, res) => res.send('Bot Online'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent // Asegúrate de tenerlo en el Dev Portal
    ]
});

// Inicialización del Player con configuración de estabilidad
const player = new Player(client, {
    skipNativeLibInstall: true // Evita que intente buscar librerías binarias que rompen en Render
});

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} está listo.`);
    // Cargamos todo menos YouTube para evitar el baneo de IP de Render
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// 2. COMANDO /PLAY CON CAJA NEGRA
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        await interaction.deferReply();
        const channel = interaction.member.voice.channel;
        
        if (!channel) return interaction.editReply('❌ ¡Entra a un canal de voz!');

        const query = interaction.options.getString('cancion');
        
        try {
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: { textChannel: interaction.channel },
                    selfDeaf: true,
                    leaveOnEnd: true,
                    // Estos tiempos son clave para servidores gratuitos lentos
                    bufferingTimeout: 3000,
                    connectionTimeout: 45000 
                }
            });

            return interaction.editReply(`🎶 **${track.title}** añadida correctamente.`);

        } catch (e) {
            console.error("Error detallado:", e);
            // Si el bot se sale, el error aparecerá aquí en el log de Render
            return interaction.editReply(`❌ El bot no pudo procesar el audio: ${e.message}`);
        }
    }
});

// 3. INTERFAZ DE USUARIO (REPRODUCTOR)
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Reproduciendo ahora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Autor', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

// Manejo de botones
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const q = player.nodes.get(i.guildId);
    if (!q) return;
    if (i.customId === 'skip') q.node.skip();
    if (i.customId === 'stop') q.delete();
    await i.deferUpdate();
});

// Captura de errores silenciosos
player.events.on('error', (q, e) => console.log(`[Error] ${e.message}`));
player.events.on('playerError', (q, e) => console.log(`[Player Error] ${e.message}`));

client.login(process.env.DISCORD_TOKEN);