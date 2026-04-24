require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. MOTOR DE AUDIO
process.env.DP_FFMPEG_EXE = ffmpeg;

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.8 - Railway Active'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const player = new Player(client, { 
    skipNativeLibInstall: true // Railway usa Nixpacks y esto evita conflictos de librerías
});

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} online en Railway.`);
    // Cargamos extractores (Spotify/SoundCloud/Apple)
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// MANEJADOR DE COMANDOS (Optimizado para Railway)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.replied) return;

    await interaction.deferReply().catch(() => {});

    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.editReply('❌ ¡Entra a un canal de voz!');

    if (interaction.commandName === 'play') {
        const query = interaction.options.getString('cancion');
        try {
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: { textChannel: interaction.channel },
                    selfDeaf: true,
                    bufferingTimeout: 15000,
                    connectionTimeout: 60000 
                }
            });
            return interaction.editReply(`🎶 Añadida: **${track.title}**`);
        } catch (e) {
            return interaction.editReply(`❌ Error de audio. Railway intentó procesarlo pero falló.`);
        }
    }
    // (Añade aquí tus comandos de skip/stop si los necesitas)
});

// INTERFAZ VISUAL
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Sonando ahora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

client.login(process.env.DISCORD_TOKEN);