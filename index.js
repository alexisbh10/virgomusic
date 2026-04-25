require('dotenv').config();

// 1. MOTOR DE AUDIO (Forzamos la ruta exacta para que discord-player no se pierda)
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;
process.env.DP_FFMPEG_EXE = ffmpegPath;

// 2. REGLA DE RED CRÍTICA (Evita que Discord rechace el audio en silencio)
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0 - Railway Active'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// Al quitar skipNativeLibInstall, permitimos que Railway use sus propias herramientas nativas de Linux
const player = new Player(client);

// --- CHIVATOS DE ERRORES DE AUDIO ---
// --- CHIVATOS DE DIAGNÓSTICO PROFUNDO ---
player.events.on('error', (queue, error) => {
    console.log(`❌ [Error de Cola]:`, error);
});

player.events.on('playerError', (queue, error) => {
    console.log(`❌ [Error de Reproducción]:`, error);
});

// Esto nos dirá qué está haciendo el motor de red interno paso a paso
player.on('debug', (message) => {
    console.log(`🔍 [Player Debug]: ${message}`);
});

player.events.on('debug', (queue, message) => {
    console.log(`📡 [Voice Connection]: ${message}`);
});

client.on('clientReady', async () => {
    console.log(`✅ ${client.user.tag} online en Railway (V1.0).`);
    await player.extractors.loadMulti(DefaultExtractors.filter(e => e.name !== 'YouTubeExtractor'));
});

// 2. MANEJADOR DE COMANDOS Y BOTONES
client.on('interactionCreate', async (interaction) => {
    
    // -- LÓGICA DE LOS BOTONES --
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);
        
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ No hay música sonando ahora mismo.', ephemeral: true });
        }

        if (interaction.customId === 'btn_skip') {
            queue.node.skip();
            return interaction.reply({ content: '⏭️ Canción saltada.' });
        }

        if (interaction.customId === 'btn_stop') {
            queue.delete();
            return interaction.reply({ content: '⏹️ Música detenida y cola limpiada.' });
        }
        return;
    }

    // -- LÓGICA DE LOS COMANDOS (/play, /skip, /stop, /queue) --
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply().catch(() => {});

    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.editReply('❌ ¡Debes estar en un canal de voz para usarme!');

    const queue = player.nodes.get(interaction.guildId);

    switch (interaction.commandName) {
        case 'play':
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
                return interaction.editReply(`🎶 Añadida a la cola: **${track.title}**`);
            } catch (e) {
                console.error(e);
                return interaction.editReply(`❌ Error al intentar reproducir el audio.`);
            }

        case 'skip':
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay música sonando para saltar.');
            queue.node.skip();
            return interaction.editReply('⏭️ Canción saltada mediante comando.');

        case 'stop':
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay música sonando.');
            queue.delete();
            return interaction.editReply('⏹️ Me desconecto. ¡Nos vemos en Virgoland!');

        case 'queue':
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ La cola está vacía en este momento.');
            
            // Mostrar las próximas 10 canciones
            const tracks = queue.tracks.toArray().slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title}`).join('\n');
            
            const queueEmbed = new EmbedBuilder()
                .setTitle('📋 Cola de Virgoland')
                .setDescription(`**🎵 Sonando ahora:** ${queue.currentTrack.title}\n\n**Próximas en la cola:**\n${tracks || 'No hay más canciones en espera.'}`)
                .setColor('#2b2d31');
                
            return interaction.editReply({ embeds: [queueEmbed] });
    }
});

// 3. INTERFAZ VISUAL AL INICIAR CANCIÓN
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Sonando ahora en Virgoland')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

client.login(process.env.DISCORD_TOKEN);