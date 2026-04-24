require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const express = require('express');

// ==========================================
// SERVIDOR WEB (Para mantenerlo 24/7 en Render)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('¡Bot de música V1.0 Online y funcionando!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Servidor web iniciado para UptimeRobot.'));

// ==========================================
// CONFIGURACIÓN DEL CLIENTE Y EL REPRODUCTOR
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates // Vital para unirse a los canales de voz
    ]
});

const player = new Player(client);

client.on('ready', async () => {
    console.log(`✅ ¡Bot conectado a Discord como ${client.user.tag}!`);
    await player.extractors.loadMulti(DefaultExtractors);
    console.log('🎧 Extractores multiplataforma cargados con éxito.');
});

// ==========================================
// SISTEMA DE COMANDOS Y BOTONES
// ==========================================
client.on('interactionCreate', async (interaction) => {

    // --- MANEJO DE COMANDOS DE BARRA ---
    if (interaction.isChatInputCommand()) {
        
        // Escudo anti-crasheos de Render
        try {
            await interaction.deferReply();
        } catch (e) {
            return console.error('⚠️ Interacción caducada por lag de Discord.');
        }

        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.editReply('❌ ¡Debes estar dentro de un canal de voz para invocarme!');
        }

        const queue = player.nodes.get(interaction.guildId);

        // COMANDO: /play
        if (interaction.commandName === 'play') {
            const query = interaction.options.getString('cancion');
            try {
                const { track } = await player.play(channel, query, {
                    nodeOptions: { metadata: { textChannel: interaction.channel } }
                });
                
                const embedCola = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setDescription(`✅ **${track.title}** se ha añadido a la cola.`);
                return interaction.editReply({ embeds: [embedCola] });

            } catch (e) {
                console.error(e);
                return interaction.editReply('❌ ¡Vaya! Hubo un error al intentar reproducir esa canción. Puede ser un link privado o no válido.');
            }
        }

        // COMANDO: /skip
        if (interaction.commandName === 'skip') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay ninguna canción sonando ahora mismo.');
            queue.node.skip();
            return interaction.editReply('⏭️ ¡Canción saltada!');
        }

        // COMANDO: /stop
        if (interaction.commandName === 'stop') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay ninguna canción sonando.');
            queue.delete();
            return interaction.editReply('⏹️ Música detenida y cola borrada. ¡Me voy a dormir!');
        }

        // COMANDO: /queue
        if (interaction.commandName === 'queue') {
            if (!queue || !queue.isPlaying()) return interaction.editReply('❌ No hay música en la cola.');
            
            const tracks = queue.tracks.toArray().map((t, i) => `**${i + 1}.** ${t.title}`).slice(0, 10).join('\n');
            const embedQueue = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('🎶 Cola de Reproducción')
                .setDescription(`**Sonando ahora:** ${queue.currentTrack.title}\n\n${tracks || 'No hay más canciones en la cola.'}`);
                
            return interaction.editReply({ embeds: [embedQueue] });
        }
    }

    // --- MANEJO DE BOTONES (Interfaz Gráfica) ---
    if (interaction.isButton()) {
        const queue = player.nodes.get(interaction.guildId);
        
        if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '❌ No hay ninguna canción sonando ahora mismo.', ephemeral: true });
        }

        await interaction.deferUpdate();

        if (interaction.customId === 'btn_pause') queue.node.setPaused(!queue.node.isPaused());
        else if (interaction.customId === 'btn_skip') queue.node.skip();
        else if (interaction.customId === 'btn_stop') queue.delete();
    }
});

// ==========================================
// EVENTOS DEL REPRODUCTOR (Diseño Embed)
// ==========================================
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎶 Reproduciendo Ahora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Autor', value: track.author, inline: true },
            { name: 'Duración', value: track.duration, inline: true }
        )
        .setFooter({ text: `Motor Node.js V1.0` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏸️ Pausa/Play').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Saltar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Parar').setStyle(ButtonStyle.Danger)
    );

    queue.metadata.textChannel.send({ embeds: [embed], components: [row] });
});

player.events.on('error', (queue, error) => {
    console.error(`❌ Error en el reproductor: ${error.message}`);
});

// ==========================================
// ENCENDIDO
// ==========================================
client.login(process.env.DISCORD_TOKEN);