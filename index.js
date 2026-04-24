require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
// Importamos DefaultExtractors como pide el nuevo error
const { DefaultExtractors } = require('@discord-player/extractor'); 
const express = require('express');

// ==========================================
// 1. SERVIDOR WEB (UptimeRobot)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🚀 VirgoMusic V1.0.1 Online.'));
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

const player = new Player(client);

client.on('ready', async () => {
    console.log(`✅ Conectado como ${client.user.tag}`);
    
    // CORRECCIÓN CRÍTICA: Usamos loadMulti con un filtro para excluir YouTube
    await player.extractors.loadMulti(
        DefaultExtractors.filter((extractor) => extractor.name !== 'YouTubeExtractor')
    );
    
    console.log('🎧 Motores de audio (Spotify/SoundCloud/Apple) cargados con éxito.');
});

// ==========================================
// 3. COMANDOS Y BOTONES
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        try { await interaction.deferReply(); } catch (e) { return; }

        const channel = interaction.member.voice.channel;
        if (!channel) return interaction.editReply('❌ ¡Entra en un canal de voz!');

        const queue = player.nodes.get(interaction.guildId);

        if (interaction.commandName === 'play') {
            const query = interaction.options.getString('cancion');
            try {
                const { track } = await player.play(channel, query, {
                    nodeOptions: { metadata: { textChannel: interaction.channel } }
                });
                
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setDescription(`➕ Añadido: **${track.title}**`);
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return interaction.editReply('❌ Error al reproducir. Prueba con links de Spotify o nombres de canciones.');
            }
        }

        if (interaction.commandName === 'skip') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay música.');
            queue.node.skip();
            return interaction.editReply('⏭️ Saltada.');
        }

        if (interaction.commandName === 'stop') {
            if (queue) queue.delete();
            return interaction.editReply('⏹️ Detenido.');
        }

        if (interaction.commandName === 'queue') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ Cola vacía.');
            const list = queue.tracks.toArray().map((t, i) => `${i + 1}. ${t.title}`).slice(0, 5).join('\n');
            const embedQ = new EmbedBuilder()
                .setTitle('🎶 Cola')
                .setDescription(`**Sonando:** ${queue.currentTrack.title}\n\n${list}`)
                .setColor('#3498db');
            return interaction.editReply({ embeds: [embedQ] });
        }
    }

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
// 4. EVENTOS DEL REPRODUCTOR
// ==========================================
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎵 Ahora suena')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Autor', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true }
        );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [buttons] });
});

player.events.on('error', (queue, error) => console.log(`[Error] ${error.message}`));

client.login(process.env.DISCORD_TOKEN);