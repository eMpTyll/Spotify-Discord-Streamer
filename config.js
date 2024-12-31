module.exports = {
    // Discord Bot Configuration
    DISCORD_TOKEN: 'YOUR_DISCORD_BOT_TOKEN',
    DISCORD_CHANNEL_ID: 'YOUR_VOICE_CHANNEL_ID',

    // Spotify Configuration
    SPOTIFY_CLIENT_ID: 'YOUR_SPOTIFY_CLIENT_ID',
    SPOTIFY_CLIENT_SECRET: 'YOUR_SPOTIFY_CLIENT_SECRET',
    SPOTIFY_REDIRECT_URI: 'http://localhost:8888/callback',

    // Spotify Scopes - DO NOT CHANGE unless you know what you're doing
    SPOTIFY_SCOPES: [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'streaming',
        'app-remote-control',
        'playlist-read-private',
        'playlist-modify-public',
        'playlist-modify-private'
    ]
}; 