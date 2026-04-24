require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. MOTOR DE AUDIO
process.env.DP_FFMPEG_EXE = ffmpeg;

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.6 - Keep Alive Activo'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const player = new Player(client, { skipNativeLibInstall: true });

// Captura de errores globales para evitar que el proceso muera (node:events error)
client.on('error', console.error);
process.on('unhandledRejection', error => console.error('⚠️ Error no manejado:', error));

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} Online.`);
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// 2. MANEJADOR DE INTERACCIONES CON ESCUDO ANTI-LAG
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // EL ESCUDO: Si tarda más de 3 segundos, el error se captura aquí y NO mata el bot
    try {
        await interaction.deferReply();
    } catch (err) {
        if (err.code === 10062) {
            console.log("❌ Error 10062 detectado: El bot tardó demasiado en despertar. Ignorando para evitar crasheo.");
            return; // Salimos pacíficamente
        }
        console.error("Error al deferir:", err);
        return;
    }

    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.editReply('❌ ¡Entra a un canal de voz!');

    const query = interaction.options.getString('cancion');
    const queue = player.nodes.get(interaction.guildId);

    // Lógica de Comandos
    try {
        if (interaction.commandName === 'play') {
            const { track } = await player.play(channel, query, {
                nodeOptions: {
                    metadata: { textChannel: interaction.channel },
                    selfDeaf: true,
                    bufferingTimeout: 15000,
                    connectionTimeout: 60000 
                }
            });
            return interaction.editReply(`🎶 Añadida: **${track.title}**`);
        }

        if (interaction.commandName === 'skip' && queue?.isPlaying()) {
            queue.node.skip();
            return interaction.editReply('⏭️ Saltada.');
        }

        if (interaction.commandName === 'stop' && queue) {
            queue.delete();
            return interaction.editReply('⏹️ Detenido.');
        }
    } catch (e) {
        console.error("Fallo en ejecución:", e);
        if (interaction.deferred) await interaction.editReply('❌ Hubo un error procesando el audio.');
    }
});

// 3. INTERFAZ Y EVENTOS
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Ahora suena')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

// Manejo de botones con try/catch para evitar crasheos por interacciones expiradas
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const q = player.nodes.get(i.guildId);
    if (!q) return;
    try {
        await i.deferUpdate();
        if (i.customId === 'btn_pause') q.node.setPaused(!q.node.isPaused());
        if (i.customId === 'btn_skip') q.node.skip();
        if (i.customId === 'btn_stop') q.delete();
    } catch (e) { console.log("Botón ignorado por lag."); }
});

client.login(process.env.DISCORD_TOKEN);