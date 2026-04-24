require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const express = require('express');

// ==========================================
// 1. SERVIDOR WEB (Para UptimeRobot / Render)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0 está online y esquivando bloqueos.'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Servidor web listo.'));

// ==========================================
// 2. CONFIGURACIÓN DEL CLIENTE
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Inicializamos el reproductor
const player = new Player(client);

client.on('ready', async () => {
    console.log(`✅ Conectado como ${client.user.tag}`);
    
    // CARGA ANTI-BLOQUEOS: Cargamos todo menos YouTube
    // Esto hace que Spotify use SoundCloud como motor de audio automáticamente
    await player.extractors.loadDefault((ext) => ext !== 'YouTubeExtractor');
    
    console.log('🎧 Motores de audio listos (Modo Multiplataforma Estable).');
});

// ==========================================
// 3. GESTIÓN DE COMANDOS Y BOTONES
// ==========================================
client.on('interactionCreate', async (interaction) => {

    // --- COMANDOS DE BARRA (/) ---
    if (interaction.isChatInputCommand()) {
        try {
            await interaction.deferReply();
        } catch (e) {
            return;
        }

        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply('❌ ¡Entra en un canal de voz primero!');

        const queue = player.nodes.get(interaction.guildId);

        // COMANDO /PLAY
        if (interaction.commandName === 'play') {
            const query = interaction.options.getString('cancion');
            try {
                const { track } = await player.play(channel, query, {
                    nodeOptions: { metadata: { textChannel: interaction.channel } }
                });
                
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setDescription(`➕ Añadido a la cola: **${track.title}**`);
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                console.error(e);
                return interaction.editReply('❌ Error: No se pudo reproducir (puede ser un link de YouTube bloqueado). Usa nombres o links de Spotify/SoundCloud.');
            }
        }

        // COMANDO /SKIP
        if (interaction.commandName === 'skip') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay música sonando.');
            queue.node.skip();
            return interaction.editReply('⏭️ Saltando canción...');
        }

        // COMANDO /STOP
        if (interaction.commandName === 'stop') {
            if (!queue) return interaction.editReply('❌ No hay una cola activa.');
            queue.delete();
            return interaction.editReply('⏹️ Reproducción detenida.');
        }

        // COMANDO /QUEUE
        if (interaction.commandName === 'queue') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ La cola está vacía.');
            const list = queue.tracks.toArray().map((t, i) => `${i + 1}. ${t.title}`).slice(0, 5).join('\n');
            const embedQ = new EmbedBuilder()
                .setTitle('🎶 Cola Actual')
                .setDescription(`**Sonando:** ${queue.currentTrack.title}\n\n${list || 'No hay más canciones.'}`)
                .setColor('#3498db');
            return interaction.editReply({ embeds: [embedQ] });
        }
    }

    // --- INTERACCIÓN CON BOTONES ---
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);
        if (!queue || !queue.isPlaying()) return;

        await interaction.deferUpdate();

        if (interaction.customId === 'btn_pause') queue.node.setPaused(!queue.node.isPaused());
        if (interaction.customId === 'btn_skip') queue.node.skip();
        if (interaction.customId === 'btn_stop') queue.delete();
    }
});

// ==========================================
// 4. DISEÑO DEL REPRODUCTOR (EMBED + BOTONES)
// ==========================================
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Ahora suena')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Canal', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true }
        )
        .setFooter({ text: `Solicitado por: ${track.requestedBy?.username || 'Sistema'}` });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️ Pausa').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [buttons] });
});

// Manejo de errores para evitar que el bot se caiga
player.events.on('error', (queue, error) => console.log(`[Error] ${error.message}`));
player.events.on('playerError', (queue, error) => console.log(`[Audio Error] ${error.message}`));

client.login(process.env.DISCORD_TOKEN);