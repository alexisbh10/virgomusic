require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. MOTOR DE AUDIO - Configuración prioritaria
process.env.DP_FFMPEG_EXE = ffmpeg;

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.5 - Estable'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent 
    ]
});

const player = new Player(client, {
    skipNativeLibInstall: true // Evita errores de compilación en Render
});

// EVENTO READY
client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} operativo.`);
    // Cargamos extractores (Spotify/SoundCloud/Apple) - YouTube excluido para evitar bloqueos
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// 2. ÚNICO MANEJADOR DE INTERACCIONES (Evita el error 10062)
client.on('interactionCreate', async (interaction) => {
    
    // --- MANEJO DE COMANDOS (/) ---
    if (interaction.isChatInputCommand()) {
        // RESPUESTA INMEDIATA: Intentamos responder en el ms 1
        try {
            await interaction.deferReply();
        } catch (err) {
            console.error("⚠️ Error 10062: Render tardó demasiado en despertar al bot.");
            return;
        }

        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply('❌ ¡Entra a un canal de voz!');

        const queue = player.nodes.get(interaction.guildId);

        // COMANDO PLAY
        if (interaction.commandName === 'play') {
            const query = interaction.options.getString('cancion');
            try {
                const { track } = await player.play(channel, query, {
                    nodeOptions: {
                        metadata: { textChannel: interaction.channel },
                        selfDeaf: true,
                        leaveOnEnd: true,
                        // Configuración agresiva para servidores lentos:
                        bufferingTimeout: 20000, 
                        connectionTimeout: 60000 
                    }
                });
                return interaction.editReply(`🎶 Añadida: **${track.title}**`);
            } catch (e) {
                console.error(e);
                return interaction.editReply(`❌ Fallo de audio. Prueba de nuevo (a veces el primer intento falla por lag).`);
            }
        }

        // COMANDOS SKIP/STOP/QUEUE
        if (interaction.commandName === 'skip' && queue?.isPlaying()) {
            queue.node.skip();
            return interaction.editReply('⏭️ Saltada.');
        }
        if (interaction.commandName === 'stop' && queue) {
            queue.delete();
            return interaction.editReply('⏹️ Detenido.');
        }
    }

    // --- MANEJO DE BOTONES ---
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);
        if (!queue) return;
        try {
            await interaction.deferUpdate();
            if (interaction.customId === 'btn_skip') queue.node.skip();
            if (interaction.customId === 'btn_stop') queue.delete();
            if (interaction.customId === 'btn_pause') queue.node.setPaused(!queue.node.isPaused());
        } catch (e) { console.error("Error en botón:", e); }
    }
});

// 3. INTERFAZ VISUAL
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Reproduciendo')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields({ name: 'Autor', value: track.author, inline: true }, { name: 'Duración', value: track.duration, inline: true });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

// 4. LOGS DE ERROR (Para que nada sea silencioso)
player.events.on('error', (q, e) => console.log(`[SISTEMA] ${e.message}`));
player.events.on('playerError', (q, e) => console.log(`[AUDIO] ${e.message}`));

client.login(process.env.DISCORD_TOKEN);