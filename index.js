require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Configuración de Shoukaku
const nodes = []; 
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
    moveOnDisconnect: false,
    resume: true,
    reconnectTries: 10,
    reconnectInterval: 5,
});

const queues = new Map();

// --- FUNCIÓN DE EMBEDS PERSONALIZADOS ---
function createEmbed({ title, description, color = '#2b2d31', thumbnail = null }) {
    const embed = new EmbedBuilder()
        .setColor(color) // Color elegante por defecto (Dark Mode Discord)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: 'Bot de Música Premium 🎧' });
    
    if (thumbnail) embed.setThumbnail(thumbnail);
    return embed;
}

// --- FUNCIÓN DE BÚSQUEDA MULTI-PLATAFORMA ACTUALIZADA ---
async function smartSearch(node, query) {
    // Si es una URL directa, que Shoukaku la resuelva tal cual
    if (query.match(/^https?:\/\//)) {
        return await node.rest.resolve(query);
    }

    // Orden de prioridad: Spotify -> Apple Music -> YouTube -> SoundCloud
    // Añadimos 'amsearch:' para Apple Music
    const searchPrefixes = ['spsearch:', 'amsearch:'];
    
    for (const prefix of searchPrefixes) {
        const result = await node.rest.resolve(`${prefix}${query}`);
        if (result && !['empty', 'error'].includes(result.loadType)) {
            return result; // Devuelve el primer resultado exitoso
        }
    }
    return null; // Si todo falla en todas las plataformas
}

shoukaku.on('error', (_, error) => console.error('Error en Lavalink:', error));
shoukaku.on('ready', (name) => console.log(`✅ ¡POR FIN! Nodo Lavalink ${name} está listo.`));

client.on('ready', () => {
    console.log(`Bot conectado a Discord como ${client.user.tag}`);
    setTimeout(() => {
        console.log(`🔌 Conectando a Lavalink ahora...`);
        shoukaku.addNode({
            name: 'Main Lavalink Node',
            url: '127.0.0.1:2333',
            auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        });
    }, 10000); // Reducido a 10s para pruebas, puedes volver a 100s si tu server es lento
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply();
    
    const { commandName } = interaction;
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
        return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: '¡Debes estar en un canal de voz para usar música!', color: '#ff0000' })] });
    }

    const node = shoukaku.getIdealNode();
    if (!node) {
        return interaction.editReply({ embeds: [createEmbed({ title: '⏳ Cargando...', description: 'El servidor de música se está encendiendo. Inténtalo en unos segundos.', color: '#ffcc00' })] });
    }

    // COMANDO PLAY
    if (commandName === 'play') {
        const query = interaction.options.getString('cancion');

        try {
            const result = await smartSearch(node, query);
            
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.editReply({ embeds: [createEmbed({ title: '🔍 Sin resultados', description: 'No encontré la canción en ninguna plataforma. Intenta con un enlace directo.', color: '#ff0000' })] });
            }

            let tracksToAdd = result.loadType === 'playlist' ? result.data.tracks : (result.loadType === 'search' ? [result.data[0]] : [result.data]);
            let player = shoukaku.players.get(interaction.guildId);

            if (!player) {
                player = await shoukaku.joinVoiceChannel({
                    guildId: interaction.guildId,
                    channelId: voiceChannel.id,
                    shardId: 0
                });
            
                queues.set(interaction.guildId, {
                    tracks: [...tracksToAdd],
                    textChannel: interaction.channel,
                });

                const serverQueue = queues.get(interaction.guildId);
                const firstTrack = serverQueue.tracks.shift();

                await player.playTrack({ track: { encoded: firstTrack.encoded } });
                
                interaction.editReply({ embeds: [createEmbed({ 
                    title: '▶️ Reproduciendo ahora', 
                    description: `**[${firstTrack.info.title}](${firstTrack.info.uri || ''})**\n👤 Autor: ${firstTrack.info.author}`,
                    thumbnail: firstTrack.info.artworkUrl || null,
                    color: '#00ffaa'
                })] });

                // Lógica sólida de salto automático y finalización de pista
                player.on('end', async (data) => {
                    const reason = data.reason ? data.reason.toUpperCase() : '';
                    if (['STOPPED', 'FINISHED'].includes(reason)) {
                        const q = queues.get(interaction.guildId);
                        
                        if (q && q.tracks.length > 0) {
                            const nextTrack = q.tracks.shift(); 
                            try {
                                await player.playTrack({ track: { encoded: nextTrack.encoded } });
                                q.textChannel.send({ embeds: [createEmbed({ 
                                    title: '🎶 Siguiente pista', 
                                    description: `**[${nextTrack.info.title}](${nextTrack.info.uri || ''})**`,
                                    thumbnail: nextTrack.info.artworkUrl || null
                                })] });
                            } catch (err) {
                                console.error('❌ Error reproduciendo la siguiente pista:', err);
                            }
                        } else {
                            await shoukaku.leaveVoiceChannel(interaction.guildId);
                            queues.delete(interaction.guildId);
                            q.textChannel.send({ embeds: [createEmbed({ title: '👋 Cola terminada', description: 'No hay más canciones en la lista. ¡Hasta pronto!' })] });
                        }
                    }
                });
            } else {
                const serverQueue = queues.get(interaction.guildId);
                serverQueue.tracks.push(...tracksToAdd);
                
                const titleText = result.loadType === 'playlist' ? `Playlist añadida (**${tracksToAdd.length}** canciones)` : `**${tracksToAdd[0].info.title}** añadida a la cola`;
                interaction.editReply({ embeds: [createEmbed({ title: '📝 Añadido a la cola', description: titleText, color: '#00aaff' })] });
            }
        } catch (error) {
            console.error(error);
            interaction.editReply({ embeds: [createEmbed({ title: '❌ Error fatal', description: 'Ocurrió un problema al reproducir la música.', color: '#ff0000' })] });
        }
    } 
    
    // COMANDO SKIP
    else if (commandName === 'skip') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando para saltar.', color: '#ff0000' })] });
        
        await player.stopTrack(); // Al detenerla, el evento 'end' se encarga de poner la siguiente
        interaction.editReply({ embeds: [createEmbed({ title: '⏭️ Canción saltada', description: 'Pasando a la siguiente...' })] });
    } 
    
    // COMANDO QUEUE
    else if (commandName === 'queue') {
        const serverQueue = queues.get(interaction.guildId);
        if (!serverQueue || serverQueue.tracks.length === 0) {
            return interaction.editReply({ embeds: [createEmbed({ title: '📋 Cola de reproducción', description: 'La cola está completamente vacía.' })] });
        }
        
        const upNext = serverQueue.tracks.slice(0, 10).map((t, i) => `**${i + 1}.** [${t.info.title}](${t.info.uri || '#'})`).join('\n');
        const footerText = serverQueue.tracks.length > 10 ? `\n\n*...y ${serverQueue.tracks.length - 10} canciones más.*` : '';
        
        interaction.editReply({ embeds: [createEmbed({ title: '📋 Cola de reproducción', description: `${upNext}${footerText}` })] });
    } 
    
    // COMANDO STOP
    else if (commandName === 'stop') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });
        
        queues.delete(interaction.guildId);
        await shoukaku.leaveVoiceChannel(interaction.guildId);
        interaction.editReply({ embeds: [createEmbed({ title: '⏹️ Reproducción detenida', description: 'He vaciado la cola y me he desconectado.' })] });
    }

    // COMANDO PAUSE
    else if (commandName === 'pause') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });
        
        await player.setPaused(true);
        interaction.editReply({ embeds: [createEmbed({ title: '⏸️ Pausado', description: 'La música ha sido pausada.' })] });
    }

    // COMANDO RESUME
    else if (commandName === 'resume') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });
        
        await player.setPaused(false);
        interaction.editReply({ embeds: [createEmbed({ title: '▶️ Reanudado', description: 'La música sigue sonando.' })] });
    }

    // COMANDO VOLUME
    else if (commandName === 'volume') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });
        
        const volume = interaction.options.getInteger('nivel');
        await player.setGlobalVolume(volume);
        interaction.editReply({ embeds: [createEmbed({ title: '🔊 Volumen ajustado', description: `El volumen se ha establecido al **${volume}%**.` })] });
    }
});

client.login(process.env.DISCORD_TOKEN);