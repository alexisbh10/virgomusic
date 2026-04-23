require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const nodes = [
    {
        name: 'Main Lavalink Node',
        url: 'localhost:2333', // Reemplaza con la URL de tu nodo Lavalink
        auth: process.env.LAVALINK_PASSWORD, // Reemplaza con la contraseña de tu nodo Lavalink
    } // Puedes agregar más nodos aquí si lo deseas
];

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
    moveOnDisconnect: false,
    resume: true,
    reconnectTries: 40, 
    reconnectInterval: 5, 
});

const queues = new Map();

shoukaku.on('error', (_, error) => console.error('Error en Lavalink:', error));
shoukaku.on('ready', (name) => console.log(`Nodo Lavalink ${name} está listo.`));

client.on('ready', () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // 1. SOLO UN DEFER AL PRINCIPIO
    await interaction.deferReply();
    
    const { commandName } = interaction;

    if (commandName === 'play') {
        const query = interaction.options.getString('cancion');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('¡Debes estar en un canal de voz!');
        }

        const node = shoukaku.getIdealNode();
        if (!node) {
            // El bot responde esto si Lavalink aún está cargando sus plugins
            return interaction.editReply('⏳ El servidor de música se está encendiendo (tarda aprox. 1 minuto). ¡Por favor, inténtalo de nuevo en unos segundos!');
        }

        // Si YouTube falla por IP en Render, intenta cambiar 'ytsearch:' por 'scsearch:' (SoundCloud)
        const search = (query.startsWith('http')) ? query : `ytsearch:${query}`;

        try {
            const result = await node.rest.resolve(search);
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.editReply('No encontré resultados. Intenta con un link directo.');
            }

            // Ajuste de tracks para Lavalink v4
            let tracksToAdd = [];
            if (result.loadType === 'playlist') {
                tracksToAdd = result.data.tracks;
            } else if (result.loadType === 'search') {
                tracksToAdd = [result.data[0]];
            } else {
                tracksToAdd = [result.data];
            }
            
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

                await player.playTrack({ track: firstTrack.encoded });
                interaction.editReply(`Reproduciendo: **${firstTrack.info.title}**`);

                // Manejo de eventos del player...
                player.on('end', async (data) => {
                    if (['REPLACED', 'STOPPED', 'FINISHED'].includes(data.reason)) {
                        const q = queues.get(interaction.guildId);
                        if (q && q.tracks.length > 0) {
                            const nextTrack = q.tracks.shift();
                            await player.playTrack({ track: nextTrack.encoded });
                            q.textChannel.send(`Reproduciendo: **${nextTrack.info.title}**`);
                        } else {
                            shoukaku.leaveVoiceChannel(interaction.guildId);
                            queues.delete(interaction.guildId);
                        }
                    }
                });
            } else {
                const serverQueue = queues.get(interaction.guildId);
                serverQueue.tracks.push(...tracksToAdd);
                interaction.editReply(result.loadType === 'playlist' ? `Añadidas **${tracksToAdd.length}** canciones.` : `Añadida: **${tracksToAdd[0].info.title}**`);
            }
        } catch (error) {
            console.error(error);
            interaction.editReply('Error al intentar reproducir.');
        }

    } else if (commandName === 'skip') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply('No hay música sonando.');
        await player.stopTrack();
        interaction.editReply('Canción saltada.');

    } else if (commandName === 'queue') {
        const serverQueue = queues.get(interaction.guildId);
        if (!serverQueue || serverQueue.tracks.length === 0) return interaction.editReply('La cola está vacía.');
        const upNext = serverQueue.tracks.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.info.title}`).join('\n');
        interaction.editReply(`**Cola:**\n${upNext}`);

    } else if (commandName === 'stop') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.editReply('No hay música sonando.');
        queues.delete(interaction.guildId);
        await shoukaku.leaveVoiceChannel(interaction.guildId);
        interaction.editReply('Reproducción detenida.');
    }
});

client.login(process.env.DISCORD_TOKEN);