const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const opus = require('opusscript');
const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const config = require('./config.js');

const TOKEN = config.DISCORD_TOKEN;
const CHANNEL_ID = config.DISCORD_CHANNEL_ID;

ffmpeg.setFfmpegPath(ffmpegPath);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private'
];

const spotifyApi = new SpotifyWebApi({
  clientId: config.SPOTIFY_CLIENT_ID,
  clientSecret: config.SPOTIFY_CLIENT_SECRET,
  redirectUri: config.SPOTIFY_REDIRECT_URI,
  scope: config.SPOTIFY_SCOPES.join(' ')
});

function startStreaming(connection) {
  console.log('Starting streaming...');
  
  // Cleanup previous listeners
  connection.removeAllListeners('stateChange');
  connection.removeAllListeners(VoiceConnectionStatus.Disconnected);
  
  const audioPlayer = createAudioPlayer();
  
  const process = ffmpeg()
    .input('audio=CABLE Output (VB-Audio Virtual Cable)')
    .inputFormat('dshow')
    // Simplified audio settings
    .audioChannels(2)
    .audioFrequency(48000)
    .audioCodec('pcm_s16le') // Use PCM instead of direct opus encoding
    .format('s16le')
    .on('start', (commandLine) => {
      console.log('FFmpeg started:', commandLine);
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err);
      // Add delay before restart
      setTimeout(() => {
        console.log('Attempting to restart stream...');
        startStreaming(connection);
      }, 5000);
    });

  const stream = process.pipe();
  
  // Create resource with raw PCM audio
  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
    inlineVolume: true
  });

  resource.volume?.setVolume(1);
  
  audioPlayer.play(resource);
  connection.subscribe(audioPlayer);

  // Cleanup previous state change listener
  audioPlayer.removeAllListeners('stateChange');
  
  audioPlayer.on('stateChange', (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.log(`Audio player state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === 'idle') {
        setTimeout(() => {
          console.log('Restarting due to idle state...');
          startStreaming(connection);
        }, 5000); // Increased delay
      }
    }
  });

  // Add single connection state change listener
  connection.on('stateChange', (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.log(`Connection state changed from ${oldState.status} to ${newState.status}`);
    }
  });
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Add Spotify authentication
  await authenticateSpotify();
  
  const channel = client.channels.cache.get(CHANNEL_ID);

  if (channel) {
    console.log('Channel found, connecting...');
    const connection = joinVoiceChannel({
      channelId: CHANNEL_ID,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    let hasStarted = false;
    connection.on(VoiceConnectionStatus.Ready, () => {
      if (!hasStarted) {
        console.log('Connected to voice channel!');
        startStreaming(connection);
        hasStarted = true;
      }
    });

    connection.on('error', error => {
      console.error('Connection error:', error);
    });
  } else {
    console.error('Voice channel not found!');
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.content.startsWith(';')) return;

  const command = message.content.split(' ')[0].slice(1).toLowerCase();
  const args = message.content.slice(command.length + 2).trim();

  switch(command) {
    case 'help':
      const helpEmbed = {
        color: 0x0099ff,
        title: '🎵 Cách yêu cầu Tùng Ca Sĩ',
        description: 'Danh sách các lệnh có sẵn:',
        fields: [
          {
            name: '`;join`',
            value: 'Kết nối bot vào kênh voice'
          },
          {
            name: '`;play <tên bài hát hoặc link Spotify>`',
            value: 'Phát nhạc từ Spotify'
          },
          {
            name: '`;pause`',
            value: 'Tạm dừng bài hát đang phát'
          },
          {
            name: '`;resume`',
            value: 'Tiếp tục phát bài hát đã tạm dừng'
          },
          {
            name: '`;skip`',
            value: 'Chuyển sang bài hát tiếp theo'
          },
          {
            name: '`;previous`',
            value: 'Quay lại bài hát trước đó'
          },
          {
            name: '`;queue <tên bài hát hoặc link>`',
            value: 'Thêm bài hát vào hàng đợi'
          },
          {
            name: '`;status`',
            value: 'Kiểm tra trạng thái kết nối của bot'
          },
          {
            name: '`;shuffle`',
            value: 'Phát ngẫu nhiên các bài hát trong playlist/queue'
          }
        ],
        footer: {
          text: 'Sử dụng ; làm prefix cho mọi lệnh'
        }
      };
      message.reply({ embeds: [helpEmbed] });
      break;
    case 'test':
      message.reply('Bot is working!');
      break;
    case 'join':
      const voiceChannel = message.member.voice.channel;
      if (!voiceChannel) {
        message.reply('Bạn cần vào một kênh voice trước!');
        return;
      }
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });
      startStreaming(connection);
      message.reply('Đã kết nối và bắt đầu phát nhạc!');
      break;
    case 'play':
      if (!args) {
        message.reply('❌ Vui lòng nhập link hoặc tên bài hát!');
        return;
      }

      try {
        if (args.includes('spotify.com/track/')) {
          const trackId = args.split('track/')[1].split('?')[0];
          await spotifyApi.play({
            uris: [`spotify:track:${trackId}`]
          });
          const trackInfo = await spotifyApi.getTrack(trackId);
          const track = trackInfo.body;
          message.reply({
            embeds: [{
              color: 0x1DB954,
              title: '▶️ Đang phát',
              fields: [
                {
                  name: 'Bài hát',
                  value: `🎵 **${track.name}**\n👤 ${track.artists.map(a => a.name).join(', ')}`
                },
                {
                  name: 'Album',
                  value: track.album.name
                }
              ],
              thumbnail: {
                url: track.album.images[0]?.url
              }
            }]
          });
        } else {
          const searchResults = await spotifyApi.searchTracks(args, { limit: 1 });
          if (searchResults.body.tracks.items.length === 0) {
            message.reply('❌ Không tìm thấy bài hát!');
            return;
          }

          const track = searchResults.body.tracks.items[0];
          await spotifyApi.play({
            uris: [track.uri]
          });
          message.reply({
            embeds: [{
              color: 0x1DB954,
              title: '▶️ Đang phát',
              fields: [
                {
                  name: 'Bài hát',
                  value: `🎵 **${track.name}**\n👤 ${track.artists.map(a => a.name).join(', ')}`
                },
                {
                  name: 'Album',
                  value: track.album.name
                }
              ],
              thumbnail: {
                url: track.album.images[0]?.url
              }
            }]
          });
        }
      } catch (error) {
        if (error.message.includes('PREMIUM_REQUIRED')) {
          message.reply('❌ Tính năng này yêu cầu tài khoản Spotify Premium!');
          return;
        }
        message.reply('❌ Lỗi: ' + error.message);
      }
      break;
    case 'pause':
      try {
        await spotifyApi.pause();
        message.reply('⏸️ Đã tạm dừng');
      } catch (error) {
        message.reply('❌ Không thể tạm dừng: ' + error.message);
      }
      break;
    case 'resume':
      try {
        await spotifyApi.play();
        message.reply('▶️ Đã tiếp tục phát');
      } catch (error) {
        message.reply('❌ Không thể tiếp tục: ' + error.message);
      }
      break;
    case 'skip':
      try {
        await spotifyApi.skipToNext();
        // Đợi một chút để Spotify cập nhật trạng thái
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Lấy thông tin bài hát hiện tại
        const currentTrack = await spotifyApi.getMyCurrentPlayingTrack();
        if (currentTrack.body && currentTrack.body.item) {
          const track = currentTrack.body.item;
          const artists = track.artists.map(artist => artist.name).join(', ');
          message.reply({
            embeds: [{
              color: 0x1DB954, // Màu xanh của Spotify
              title: '⏭️ Đã chuyển bài tiếp theo',
              fields: [
                {
                  name: 'Đang phát',
                  value: `🎵 **${track.name}**\n👤 ${artists}`
                },
                {
                  name: 'Album',
                  value: track.album.name
                }
              ],
              thumbnail: {
                url: track.album.images[0]?.url
              }
            }]
          });
        } else {
          message.reply('⏭️ Đã chuyển bài tiếp theo');
        }
      } catch (error) {
        if (error.message.includes('PREMIUM_REQUIRED')) {
          message.reply('❌ Tính năng này yêu cầu tài khoản Spotify Premium!');
          return;
        }
        message.reply('❌ Không thể chuyển bài: ' + error.message);
      }
      break;
    case 'previous':
      try {
        await spotifyApi.skipToPrevious();
        message.reply('⏮️ Đã chuyển về bài trước');
      } catch (error) {
        message.reply('❌ Không thể chuyển bài: ' + error.message);
      }
      break;
    case 'queue':
      if (!args) {
        message.reply('❌ Vui lòng nhập link hoặc tên bài hát để thêm vào hàng đợi!');
        return;
      }

      try {
        if (args.includes('spotify.com/track/')) {
          const trackId = args.split('track/')[1].split('?')[0];
          await spotifyApi.addToQueue(`spotify:track:${trackId}`);
          const trackInfo = await spotifyApi.getTrack(trackId);
          message.reply(`✅ Đã thêm vào hàng đợi: ${trackInfo.body.name} - ${trackInfo.body.artists[0].name}`);
        } else {
          const searchResults = await spotifyApi.searchTracks(args, { limit: 1 });
          if (searchResults.body.tracks.items.length === 0) {
            message.reply('❌ Không tìm thấy bài hát!');
            return;
          }

          const track = searchResults.body.tracks.items[0];
          await spotifyApi.addToQueue(track.uri);
          message.reply(`✅ Đã thêm vào hàng đợi: ${track.name} - ${track.artists[0].name}`);
        }
      } catch (error) {
        message.reply('❌ Lỗi: ' + error.message);
      }
      break;
    case 'status':
      const statusConn = getVoiceConnection(message.guild.id);
      if (statusConn) {
        message.reply(`Trạng thái kết nối: ${statusConn.state.status}`);
      } else {
        message.reply('Chưa kết nối');
      }
      break;
    case 'shuffle':
      try {
        await spotifyApi.setShuffle(true);
        message.reply('🔀 Đã bật chế độ phát ngẫu nhiên');
      } catch (error) {
        if (error.message.includes('PREMIUM_REQUIRED')) {
          message.reply('❌ Tính năng này yêu cầu tài khoản Spotify Premium!');
          return;
        }
        message.reply('❌ Không thể bật shuffle: ' + error.message);
      }
      break;
    case 'unshuffle':
      try {
        await spotifyApi.setShuffle(false);
        message.reply('➡️ Đã tắt chế độ phát ngẫu nhiên');
      } catch (error) {
        if (error.message.includes('PREMIUM_REQUIRED')) {
          message.reply('❌ Tính năng này yêu cầu tài khoản Spotify Premium!');
          return;
        }
        message.reply('❌ Không thể tắt shuffle: ' + error.message);
      }
      break;
  }
});

async function authenticateSpotify() {
  try {
    let code;
    

    const authorizeURL = spotifyApi.createAuthorizeURL(SCOPES, 'state');
    console.log('\n=== CẦN XÁC THỰC SPOTIFY ===');
    console.log('Đang mở trình duyệt để xác thực...');
    
    // Sử dụng dynamic import
    const open = (await import('open')).default;
    await open(authorizeURL);
    
    console.log('2. Đợi cho đến khi thấy thông báo "Xác thực thành công!"');
    console.log('=====================================\n');
    
    // Đợi file được tạo
    while (!fs.existsSync('spotify-auth-code.txt')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    code = fs.readFileSync('spotify-auth-code.txt', 'utf8');
    

    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    spotifyApi.setRefreshToken(data.body['refresh_token']);
    
    // Lưu refresh token để sử dụng sau này
    fs.writeFileSync('spotify-refresh-token.txt', data.body['refresh_token']);
    
    // Set up token refresh
    setInterval(async () => {
      try {
        const data = await spotifyApi.refreshAccessToken();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('Token đã được làm mới!');
      } catch (error) {
        console.error('Lỗi làm mới token:', error);
      }
    }, 3600 * 1000); // Làm mới mỗi giờ

    console.log('Xác thực Spotify thành công!');
  } catch (error) {
    console.error('Lỗi xác thực Spotify:', error);
    if (fs.existsSync('spotify-auth-code.txt')) {
      fs.unlinkSync('spotify-auth-code.txt');
    }
  }
}

client.login(TOKEN);