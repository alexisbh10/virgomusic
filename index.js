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
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Bot de Música Premium 🎧' });

  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

// --- FUNCIÓN DE BÚSQUEDA MULTI-PLATAFORMA ---
// Soporta: URLs directas (Spotify, YouTube, SoundCloud, Apple Music, Deezer),
// búsqueda por nombre en Spotify, Apple Music, YouTube y SoundCloud como fallback.
async function smartSearch(node, query) {
  // Si es una URL directa, que Lavalink/LavaSrc la resuelva tal cual
  if (query.match(/^https?:\/\//)) {
    return await node.rest.resolve(query);
  }

  // Búsqueda por nombre: Spotify -> Apple Music -> YouTube -> SoundCloud
  const searchPrefixes = ['spsearch:', 'amsearch:', 'ytsearch:', 'scsearch:'];

  for (const prefix of searchPrefixes) {
    try {
      const result = await node.rest.resolve(`${prefix}${query}`);
      if (result && !['empty', 'error'].includes(result.loadType)) {
        return result;
      }
    } catch (_) {
      // Silenciar errores de plataformas individuales y seguir con la siguiente
    }
  }

  return null;
}

// --- FUNCIÓN DE REPRODUCCIÓN Y REGISTRO DE EVENTOS DE COLA ---
// CORRECCIÓN PRINCIPAL: Los listeners 'end' se registraban dentro del bloque
// "si no hay player" lo que hacía que al añadir canciones a una cola ya activa
// nunca se registraran los eventos. Ahora se centraliza aquí.
function setupPlayerListeners(player, guildId) {
  // Evitar duplicar listeners si el player ya existe
  player.removeAllListeners('end');
  player.removeAllListeners('exception');
  player.removeAllListeners('stuck');

  player.on('end', async (data) => {
    const reason = data.reason ? data.reason.toUpperCase() : '';

    // Solo avanzar la cola si la pista terminó naturalmente o fue saltada (STOPPED)
    if (!['STOPPED', 'FINISHED'].includes(reason)) return;

    const q = queues.get(guildId);

    if (q && q.tracks.length > 0) {
      const nextTrack = q.tracks.shift();
      try {
        await player.playTrack({ track: { encoded: nextTrack.encoded } });
        q.textChannel.send({ embeds: [createEmbed({
          title: '🎶 Siguiente pista',
          description: `**[${nextTrack.info.title}](${nextTrack.info.uri || ''})**\n👤 Autor: ${nextTrack.info.author}`,
          thumbnail: nextTrack.info.artworkUrl || null,
          color: '#00ffaa'
        })] });
      } catch (err) {
        console.error('❌ Error reproduciendo la siguiente pista:', err);
      }
    } else {
      // Cola vacía: desconectar
      try {
        await shoukaku.leaveVoiceChannel(guildId);
      } catch (_) {}
      if (q) {
        q.textChannel.send({ embeds: [createEmbed({ title: '👋 Cola terminada', description: 'No hay más canciones en la lista. ¡Hasta pronto!' })] });
      }
      queues.delete(guildId);
    }
  });

  player.on('exception', async (data) => {
    console.error('❌ Excepción en el player:', data);
    const q = queues.get(guildId);
    if (q) {
      q.textChannel.send({ embeds: [createEmbed({ title: '❌ Error de reproducción', description: 'Hubo un error con esta pista. Saltando...', color: '#ff0000' })] });
    }
    // Intentar saltar a la siguiente pista automáticamente
    const q2 = queues.get(guildId);
    if (q2 && q2.tracks.length > 0) {
      const nextTrack = q2.tracks.shift();
      try { await player.playTrack({ track: { encoded: nextTrack.encoded } }); } catch (_) {}
    }
  });

  player.on('stuck', async () => {
    console.warn('⚠️ Player atascado, saltando pista...');
    try { await player.stopTrack(); } catch (_) {}
  });
}

shoukaku.on('error', (_, error) => console.error('Error en Lavalink:', error));
shoukaku.on('ready', (name) => console.log(`✅ Nodo Lavalink ${name} listo.`));

client.on('ready', () => {
  console.log(`Bot conectado a Discord como ${client.user.tag}`);
  setTimeout(() => {
    console.log('🔌 Conectando a Lavalink...');
    shoukaku.addNode({
      name: 'Main Lavalink Node',
      url: '127.0.0.1:2333',
      auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    });
  }, 10000);
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

  // --- COMANDO PLAY ---
  if (commandName === 'play') {
    const query = interaction.options.getString('cancion');

    try {
      const result = await smartSearch(node, query);

      if (!result || result.loadType === 'empty' || result.loadType === 'error') {
        return interaction.editReply({ embeds: [createEmbed({ title: '🔍 Sin resultados', description: 'No encontré la canción en ninguna plataforma. Intenta con un enlace directo.', color: '#ff0000' })] });
      }

      let tracksToAdd = [];
      if (result.loadType === 'playlist') {
        tracksToAdd = result.data.tracks;
      } else if (result.loadType === 'search') {
        tracksToAdd = [result.data[0]];
      } else {
        // loadType === 'track' o similar
        tracksToAdd = [result.data];
      }

      let player = shoukaku.players.get(interaction.guildId);

      if (!player) {
        // No hay player: crear uno, iniciar cola y reproducir la primera pista
        player = await shoukaku.joinVoiceChannel({
          guildId: interaction.guildId,
          channelId: voiceChannel.id,
          shardId: 0
        });

        // Registrar listeners ANTES de empezar a reproducir
        setupPlayerListeners(player, interaction.guildId);

        // Inicializar cola con las pistas restantes (la primera se reproduce ya)
        queues.set(interaction.guildId, {
          tracks: tracksToAdd.slice(1), // Las demás van a la cola
          textChannel: interaction.channel,
        });

        const firstTrack = tracksToAdd[0];
        await player.playTrack({ track: { encoded: firstTrack.encoded } });

        const playlistInfo = result.loadType === 'playlist'
          ? `\n📋 Playlist: **${result.data.info?.name || 'Sin nombre'}** (${tracksToAdd.length} canciones)`
          : '';

        interaction.editReply({ embeds: [createEmbed({
          title: '▶️ Reproduciendo ahora',
          description: `**[${firstTrack.info.title}](${firstTrack.info.uri || ''})**\n👤 Autor: ${firstTrack.info.author}${playlistInfo}`,
          thumbnail: firstTrack.info.artworkUrl || null,
          color: '#00ffaa'
        })] });

      } else {
        // Ya hay un player activo: añadir a la cola
        const serverQueue = queues.get(interaction.guildId);
        if (serverQueue) {
          serverQueue.tracks.push(...tracksToAdd);
        } else {
          // Seguridad: si el player existe pero no hay cola, crearla
          queues.set(interaction.guildId, {
            tracks: [...tracksToAdd],
            textChannel: interaction.channel,
          });
          setupPlayerListeners(player, interaction.guildId);
        }

        const titleText = result.loadType === 'playlist'
          ? `Playlist añadida: **${result.data.info?.name || 'Sin nombre'}** (**${tracksToAdd.length}** canciones)`
          : `**${tracksToAdd[0].info.title}** añadida a la cola`;

        interaction.editReply({ embeds: [createEmbed({ title: '📝 Añadido a la cola', description: titleText, color: '#00aaff' })] });
      }

    } catch (error) {
      console.error(error);
      interaction.editReply({ embeds: [createEmbed({ title: '❌ Error fatal', description: 'Ocurrió un problema al reproducir la música.', color: '#ff0000' })] });
    }

  // --- COMANDO SKIP ---
  } else if (commandName === 'skip') {
    const player = shoukaku.players.get(interaction.guildId);
    if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando para saltar.', color: '#ff0000' })] });

    const serverQueue = queues.get(interaction.guildId);
    if (!serverQueue || serverQueue.tracks.length === 0) {
      // No hay siguiente: detener y desconectar
      queues.delete(interaction.guildId);
      await shoukaku.leaveVoiceChannel(interaction.guildId);
      return interaction.editReply({ embeds: [createEmbed({ title: '⏭️ Saltado', description: 'No hay más canciones. ¡Hasta luego!' })] });
    }

    // Detener la pista actual; el evento 'end' con reason STOPPED avanzará la cola
    await player.stopTrack();
    interaction.editReply({ embeds: [createEmbed({ title: '⏭️ Canción saltada', description: 'Pasando a la siguiente...' })] });

  // --- COMANDO QUEUE ---
  } else if (commandName === 'queue') {
    const serverQueue = queues.get(interaction.guildId);
    if (!serverQueue || serverQueue.tracks.length === 0) {
      return interaction.editReply({ embeds: [createEmbed({ title: '📋 Cola de reproducción', description: 'La cola está completamente vacía.' })] });
    }

    const upNext = serverQueue.tracks.slice(0, 10)
      .map((t, i) => `**${i + 1}.** [${t.info.title}](${t.info.uri || '#'}) — 👤 ${t.info.author}`)
      .join('\n');
    const footerText = serverQueue.tracks.length > 10 ? `\n\n*...y ${serverQueue.tracks.length - 10} canciones más.*` : '';

    interaction.editReply({ embeds: [createEmbed({ title: `📋 Cola de reproducción (${serverQueue.tracks.length} canciones)`, description: `${upNext}${footerText}` })] });

  // --- COMANDO STOP ---
  } else if (commandName === 'stop') {
    const player = shoukaku.players.get(interaction.guildId);
    if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });

    queues.delete(interaction.guildId);
    await shoukaku.leaveVoiceChannel(interaction.guildId);
    interaction.editReply({ embeds: [createEmbed({ title: '⏹️ Reproducción detenida', description: 'He vaciado la cola y me he desconectado.' })] });

  // --- COMANDO PAUSE ---
  } else if (commandName === 'pause') {
    const player = shoukaku.players.get(interaction.guildId);
    if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });

    await player.setPaused(true);
    interaction.editReply({ embeds: [createEmbed({ title: '⏸️ Pausado', description: 'La música ha sido pausada.' })] });

  // --- COMANDO RESUME ---
  } else if (commandName === 'resume') {
    const player = shoukaku.players.get(interaction.guildId);
    if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });

    await player.setPaused(false);
    interaction.editReply({ embeds: [createEmbed({ title: '▶️ Reanudado', description: 'La música sigue sonando.' })] });

  // --- COMANDO VOLUME ---
  } else if (commandName === 'volume') {
    const player = shoukaku.players.get(interaction.guildId);
    if (!player) return interaction.editReply({ embeds: [createEmbed({ title: '❌ Error', description: 'No hay música sonando.', color: '#ff0000' })] });

    const volume = interaction.options.getInteger('nivel');
    await player.setGlobalVolume(volume);
    interaction.editReply({ embeds: [createEmbed({ title: '🔊 Volumen ajustado', description: `El volumen se ha establecido al **${volume}%**.` })] });
  }
});

client.login(process.env.DISCORD_TOKEN);
