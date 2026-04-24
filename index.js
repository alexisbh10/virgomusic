require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. MOTOR DE AUDIO
process.env.DP_FFMPEG_EXE = ffmpeg;

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.7 Online.'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const player = new Player(client, { 
    skipNativeLibInstall: true,
    connectionTimeout: 60000 // Aumentamos el tiempo de espera de conexión
});

// Captura de errores para que el bot no muera nunca
process.on('unhandledRejection', error => console.error('⚠️ Error inesperado:', error));

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} listo.`);
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// 2. UNIFICADO: Comandos y Botones en un solo sitio
client.on('interactionCreate', async (interaction) => {
    
    // FILTRO ANTI-DUPLICADOS: Si ya respondimos, ignoramos el reintento de Discord
    if (interaction.deferred || interaction.replied) return;

    if (interaction.isChatInputCommand()) {
        try {
            await interaction.deferReply();
        } catch (e) { return; } // Si falla el defer por lag (10062), salimos

        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply('❌ ¡Entra a un canal de voz!');

        const query = interaction.options.getString('cancion');
        const queue = player.nodes.get(interaction.guildId);

        try {
            if (interaction.commandName === 'play') {
                const { track } = await player.play(channel, query, {
                    nodeOptions: {
                        metadata: { textChannel: interaction.channel },
                        selfDeaf: true,
                        leaveOnEnd: true,
                        bufferingTimeout: 15000,
                        connectionTimeout: 60000,
                        // Fix para el "entra y se va": forzamos el stream para que no espere
                        noRawStream: false 
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

            if (interaction.commandName === 'queue' && queue) {
                const list = queue.tracks.toArray().map((t, i) => `${i+1}. ${t.title}`).slice(0, 5).join('\n');
                return interaction.editReply(`🎶 **Cola:**\n${list || 'Vacía'}`);
            }

        } catch (e) {
            console.error("Error en ejecución:", e);
            return interaction.editReply(`❌ Error de conexión. Prueba de nuevo en unos segundos.`);
        }
    }

    // MANEJO DE BOTONES (Integrado)
    if (interaction.isButton()) {
        const q = player.nodes.get(interaction.guildId);
        if (!q) return;
        try {
            await interaction.deferUpdate();
            if (interaction.custom_id === 'btn_pause') q.node.setPaused(!q.node.isPaused());
            if (interaction.custom_id === 'btn_skip') q.node.skip();
            if (interaction.custom_id === 'btn_stop') q.delete();
        } catch (e) { }
    }
});

// 3. INTERFAZ Y EVENTOS
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Sonando ahora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

// LOGS DETALLADOS PARA RENDER
player.events.on('error', (q, e) => console.log(`[SISTEMA] ${e.message}`));
player.events.on('playerError', (q, e) => {
    console.log(`[AUDIO] Fallo al procesar stream: ${e.message}`);
    q.metadata.textChannel.send("⚠️ El stream de audio se cortó. Intentando saltar a la siguiente...");
    q.node.skip();
});

client.login(process.env.DISCORD_TOKEN);