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
        url: '0.0.0.0:2333', // Reemplaza con la URL de tu nodo Lavalink
        auth: process.env.LAVALINK_PASSWORD, // Reemplaza con la contraseña de tu nodo Lavalink
    } // Puedes agregar más nodos aquí si lo deseas
];

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
    moveOnDisconnect: false,
    resume: true,
    reconnectTries: 10,
    reconnectInterval: 10000, // Lo intenta cada 10 segundos
});

const queues = new Map();

shoukaku.on('error', (_, error) => console.error('Error en Lavalink:', error));
shoukaku.on('ready', (name) => console.log(`Nodo Lavalink ${name} está listo.`));

client.on('ready', () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {
        await interaction.deferReply();

        const query = interaction.options.getString('cancion');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('¡Debes estar en un canal de voz para usar este comando!');
        }

        const node = shoukaku.getIdealNode();
        if (!node) {
            return interaction.editReply('No hay nodos de Lavalink disponibles. Por favor, inténtalo más tarde.');
        }

        const search = (query.startsWith('http://') || query.startsWith('https://')) ? query : `ytsearch:${query}`;

        try {
            const result = await node.rest.resolve(search);
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.editReply('No se encontraron resultados para tu búsqueda.');
            }

            const tracksToAdd = result.loadType === 'playlist' ? result.data.tracks : [result.loadType === 'search' ? result.data[0] : result.data];
            
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

                await player.playTrack ({track: firstTrack.encoded});
                interaction.editReply(`Reproduciendo: **${firstTrack.info.title}**`);

                player.on('end', async (data) => {
                    if (data.reason === 'REPLACED' || data.reason === 'STOPPED' || data.reason === 'FINISHED') {
                        const q = queues.get(interaction.guildId);

                        if (q && q.tracks.length > 0) {
                            const nextTrack = q.tracks.shift();
                            await player.playTrack({ track: nextTrack.encoded });
                            q.textChannel.send(`Reproduciendo: **${nextTrack.info.title}**`);
                        } else {
                            await shoukaku.leaveVoiceChannel(interaction.guildId);
                            queues.delete(interaction.guildId);
                            q.textChannel.send('La cola ha terminado. Me he desconectado del canal de voz.');
                        }
                    }
                });
            } else {
                const serverQueue = queues.get(interaction.guildId);
                if (!serverQueue) return interaction.editReply('Error al acceder a la cola de reproducción.');

                serverQueue.tracks.push(...tracksToAdd);
                if (result.loadType === 'playlist') {
                    interaction.editReply(`Se han añadido **${tracksToAdd.length}** canciones a la cola.`);
                } else {
                    interaction.editReply(`Se ha añadido **${tracksToAdd[0].info.title}** a la cola.`);
                }
            }
        } catch (error) {
            console.error('Error al reproducir la canción:', error);
            interaction.editReply('Ocurrió un error al intentar reproducir la canción. Por favor, inténtalo de nuevo.');
        }
    } else if (commandName === 'skip') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.reply('No estoy reproduciendo nada en este momento.');
        
        await player.stopTrack();
        interaction.reply('Canción actual saltada.');
    } else if (commandName === 'queue') {
        const serverQueue = queues.get(interaction.guildId);

        if (!serverQueue || serverQueue.tracks.length === 0) {
            return interaction.reply('La cola de reproducción está vacía.');
        }

        const upNext = serverQueue.tracks.slice(0, 10).map((track, index) => {
            return `**${index + 1}.** ${track.info.title}`;
        }).join('\n');
        interaction.reply(`**Cola de reproducción:**\n${upNext}${serverQueue.tracks.length > 10 ? `\n...y ${serverQueue.tracks.length - 10} más` : ''}`);
    } else if (commandName === 'stop') {
        const player = shoukaku.players.get(interaction.guildId);
        if (!player) return interaction.reply('No estoy reproduciendo nada en este momento.');

        queues.delete(interaction.guildId);
        await shoukaku.leaveVoiceChannel(interaction.guildId);
        interaction.reply('Reproducción detenida y me he desconectado del canal de voz.');
    }
});

client.login(process.env.DISCORD_TOKEN);