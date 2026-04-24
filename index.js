require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const ffmpeg = require('ffmpeg-static');
const express = require('express');

// 1. CONFIGURACIÓN INICIAL Y MOTOR DE AUDIO
process.env.DP_FFMPEG_EXE = ffmpeg; // Forzamos el motor de audio

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.2 Online y Estable.'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Servidor web activo.'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Inicializamos el Player con optimizaciones para Render
const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    }
});

// 2. EVENTO DE ARRANQUE
client.on('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    
    // Cargamos todo excepto YouTube para evitar bloqueos de IP en Render
    await player.extractors.loadMulti(
        DefaultExtractors.filter((e) => e.name !== 'YouTubeExtractor')
    );
    
    console.log('🎧 Motores Multiplataforma cargados (Spotify/SoundCloud/Apple).');
});

// 3. COMANDOS DE BARRA Y BOTONES
client.on('interactionCreate', async (interaction) => {
    
    // --- MANEJO DE COMANDOS (/) ---
    if (interaction.isChatInputCommand()) {
        try { await interaction.deferReply(); } catch (e) { return; }

        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply('❌ ¡Debes estar en un canal de voz!');

        const queue = player.nodes.get(interaction.guildId);

        // COMANDO: /play
        if (interaction.commandName === 'play') {
            const query = interaction.options.getString('cancion');
            try {
                const { track } = await player.play(channel, query, {
                    nodeOptions: { 
                        metadata: { textChannel: interaction.channel },
                        selfDeaf: true,
                        leaveOnEnd: true,
                        bufferingTimeout: 15000,
                        connectionTimeout: 30000,
                        noRawStream: true // Estabilidad para servidores con poca CPU
                    }
                });
                
                return interaction.editReply({ embeds: [
                    new EmbedBuilder().setColor('#5865F2').setDescription(`➕ Añadido a la cola: **${track.title}**`)
                ]});
            } catch (e) {
                console.log("Error en Play:", e);
                return interaction.editReply('❌ Error: Intenta con un link de Spotify o nombre de canción (YouTube está desactivado).');
            }
        }

        // COMANDO: /skip
        if (interaction.commandName === 'skip') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay nada sonando.');
            queue.node.skip();
            return interaction.editReply('⏭️ Canción saltada.');
        }

        // COMANDO: /stop
        if (interaction.commandName === 'stop') {
            if (queue) queue.delete();
            return interaction.editReply('⏹️ Música detenida y bot desconectado.');
        }

        // COMANDO: /queue
        if (interaction.commandName === 'queue') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ La cola está vacía.');
            const list = queue.tracks.toArray().map((t, i) => `**${i + 1}.** ${t.title}`).slice(0, 5).join('\n');
            return interaction.editReply({ embeds: [
                new EmbedBuilder()
                    .setTitle('🎶 Cola de Reproducción')
                    .setDescription(`**Sonando:** ${queue.currentTrack.title}\n\n${list || 'No hay más canciones en espera.'}`)
                    .setColor('#3498db')
            ]});
        }
    }

    // --- MANEJO DE BOTONES ---
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);
        if (!queue || !queue.isPlaying()) return;

        await interaction.deferUpdate();

        if (interaction.customId === 'btn_pause') queue.node.setPaused(!queue.node.isPaused());
        if (interaction.customId === 'btn_skip') queue.node.skip();
        if (interaction.customId === 'btn_stop') queue.delete();
    }
});

// 4. INTERFAZ DEL REPRODUCTOR (EMBED + BOTONES)
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Ahora suena')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Artista', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true }
        )
        .setFooter({ text: `Solicitado por: ${track.requestedBy?.username || 'Usuario'}` });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️ Pausa/Play').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [buttons] });
});

// 5. MANEJO DE ERRORES Y DEBUG PARA RENDER
player.events.on('error', (queue, error) => console.log(`[Error] ${error.message}`));
player.events.on('playerError', (queue, error) => {
    console.log(`[Audio Error] ${error.message}`);
    // Si hay error de audio, intentamos saltar a la siguiente para que el bot no se muera
    queue.node.skip();
});

client.login(process.env.DISCORD_TOKEN);