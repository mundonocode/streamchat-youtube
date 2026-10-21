const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { LiveChat } = require('youtube-chat');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Carregar ou criar configuração
let config = {
    pin: process.env.STREAMER_PIN || '3006',
    channel: '',
    streamHorizontal: '',
    streamVertical: '',
    savedChannels: [],
    checkIntervalSeconds: 20
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
    } catch (e) {
        console.error('Erro ao ler config.json:', e);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
        console.error('Erro ao salvar config.json:', e);
    }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado das duas transmissões
let streams = {
    horizontal: {
        type: 'horizontal',
        label: 'Horizontal',
        isLive: false,
        liveId: null,
        title: '',
        viewers: '0',
        likes: '0',
        startTime: null,
        error: null
    },
    vertical: {
        type: 'vertical',
        label: 'Vertical',
        isLive: false,
        liveId: null,
        title: '',
        viewers: '0',
        likes: '0',
        startTime: null,
        error: null
    }
};

let recentMessages = [];
const MAX_RECENT_MESSAGES = 200;
let liveChatInstances = { horizontal: null, vertical: null };
let monitorInterval = null;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function extractVideoId(input) {
    if (!input) return null;
    const clean = input.trim();
    if (clean.length === 11 && /^[a-zA-Z0-9_-]+$/.test(clean)) return clean;
    const match = clean.match(/(?:watch\?v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

async function checkSingleStream(videoId) {
    if (!videoId) return { isLive: false };
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const html = await response.text();
        const isLive = html.includes('"isLive":true') || 
                       html.includes('"isLiveNow":true') || 
                       html.includes('"isLiveContent":true') || 
                       html.includes('"status":"LIVE"');

        let viewers = '0';
        const viewersMatch = html.match(/"videoViewCountRenderer":\{"viewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"viewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"shortViewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"originalText":"([^"]+)"/);
        if (viewersMatch) viewers = viewersMatch[1];

        let likes = '0';
        const likesMatch = html.match(/"accessibility":\{"accessibilityData":\{"label":"([0-9.,]+)\s*(?:marcações de gostei|gostei|likes)"/i) ||
                           html.match(/"defaultText":\{"accessibility":\{"accessibilityData":\{"label":"([0-9.,]+)\s*(?:gostei|likes)"/i);
        if (likesMatch) likes = likesMatch[1];

        let title = '';
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch) title = titleMatch[1].replace(' - YouTube', '').trim();

        return { isLive, liveId: videoId, viewers, likes, title };
    } catch (err) {
        return { isLive: false, error: err.message };
    }
}

async function discoverChannelLives(channelInput) {
    let clean = channelInput.trim().replace(/^@/, '');
    const foundIds = new Set();
    const liveResults = [];

    const urlsToScan = [
        `https://www.youtube.com/@${clean}/live`,
        `https://www.youtube.com/@${clean}/streams`
    ];

    for (const url of urlsToScan) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                redirect: 'follow'
            });

            const finalWatchMatch = res.url.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
            if (finalWatchMatch) foundIds.add(finalWatchMatch[1]);

            const html = await res.text();
            
            const regex = /"videoId":"([a-zA-Z0-9_-]{11})"[^}]+?"style":"LIVE"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                foundIds.add(match[1]);
            }

            const matchesAll = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m => m[1]);
            for (const vid of matchesAll.slice(0, 15)) {
                if (html.includes(vid) && html.includes('"style":"LIVE"')) {
                    foundIds.add(vid);
                }
            }
        } catch (e) {
            console.error(`Erro ao escanear ${url}:`, e.message);
        }
    }

    for (const vid of foundIds) {
        const streamData = await checkSingleStream(vid);
        if (streamData.isLive) liveResults.push(streamData);
    }

    return liveResults;
}

async function checkAllStreams() {
    const customHorizId = extractVideoId(config.streamHorizontal);
    const customVertId = extractVideoId(config.streamVertical);

    if (customHorizId || customVertId) {
        if (customHorizId) {
            const dataH = await checkSingleStream(customHorizId);
            updateStreamState('horizontal', dataH);
        } else {
            updateStreamState('horizontal', { isLive: false });
        }

        if (customVertId) {
            const dataV = await checkSingleStream(customVertId);
            updateStreamState('vertical', dataV);
        } else {
            updateStreamState('vertical', { isLive: false });
        }
    } else if (config.channel) {
        const activeLives = await discoverChannelLives(config.channel);
        
        if (activeLives.length === 0) {
            updateStreamState('horizontal', { isLive: false });
            updateStreamState('vertical', { isLive: false });
        } else if (activeLives.length === 1) {
            updateStreamState('horizontal', activeLives[0]);
            updateStreamState('vertical', { isLive: false });
        } else {
            let horiz = null;
            let vert = null;

            for (const live of activeLives) {
                const titleLower = (live.title || '').toLowerCase();
                if (titleLower.includes('vertical') || titleLower.includes('shorts') || titleLower.includes('celular') || titleLower.includes('9:16')) {
                    vert = live;
                } else {
                    horiz = live;
                }
            }

            if (!horiz) horiz = activeLives[0];
            if (!vert) vert = activeLives[1] || activeLives[0];

            updateStreamState('horizontal', horiz);
            updateStreamState('vertical', vert);
        }
    } else {
        updateStreamState('horizontal', { isLive: false, error: 'Canal não configurado' });
        updateStreamState('vertical', { isLive: false, error: 'Canal não configurado' });
    }

    emitStateUpdate();
}

function updateStreamState(type, data) {
    const current = streams[type];
    const wasOffline = !current.isLive || current.liveId !== data.liveId;

    if (data.isLive && data.liveId) {
        current.isLive = true;
        current.liveId = data.liveId;
        current.title = data.title || current.title;
        current.viewers = data.viewers || '0';
        current.likes = data.likes || '0';
        current.error = null;

        if (wasOffline) {
            current.startTime = new Date().toISOString();
            startChatForStream(type, data.liveId);
        }
    } else {
        if (current.isLive) {
            stopChatForStream(type);
        }
        current.isLive = false;
        current.liveId = null;
        current.viewers = '0';
        current.likes = '0';
        current.startTime = null;
        current.error = data.error || null;
    }
}

function startChatForStream(type, liveId) {
    stopChatForStream(type);

    console.log(`[CHAT-${type.toUpperCase()}] Conectando: ${liveId}`);
    const chatInstance = new LiveChat({ liveId });
    liveChatInstances[type] = chatInstance;

    chatInstance.on('chat', (chatItem) => {
        const parsedMessage = {
            id: chatItem.id || `${Date.now()}-${Math.random()}`,
            streamType: type,
            streamLabel: type === 'horizontal' ? 'Horizontal' : 'Vertical',
            timestamp: chatItem.timestamp || new Date(),
            author: {
                name: chatItem.author.name,
                channelId: chatItem.author.channelId,
                thumbnail: chatItem.author.thumbnail ? chatItem.author.thumbnail.url : null
            },
            message: chatItem.message.map(m => {
                if (m.text) return { type: 'text', text: m.text };
                if (m.url) return { type: 'emoji', url: m.url, alt: m.alt || m.emojiText || '' };
                return { type: 'text', text: m.emojiText || '' };
            }),
            superchat: chatItem.superchat ? {
                amount: chatItem.superchat.amount,
                color: chatItem.superchat.color
            } : null,
            isMembership: !!chatItem.isMembership,
            isVerified: !!chatItem.isVerified,
            isOwner: !!chatItem.isOwner,
            isModerator: !!chatItem.isModerator
        };

        recentMessages.push(parsedMessage);
        if (recentMessages.length > MAX_RECENT_MESSAGES) {
            recentMessages.shift();
        }

        // Envia apenas para sockets autenticados
        io.to('authenticated').emit('new-message', parsedMessage);
    });

    chatInstance.on('error', (err) => {
        console.error(`[CHAT-${type.toUpperCase()}] Erro:`, err.message);
    });

    chatInstance.start().catch(err => {
        console.error(`[CHAT-${type.toUpperCase()}] Exceção:`, err.message);
    });
}

function stopChatForStream(type) {
    if (liveChatInstances[type]) {
        try { liveChatInstances[type].stop(); } catch (e) {}
        liveChatInstances[type] = null;
    }
}

function parseViewers(val) {
    if (!val) return 0;
    const clean = val.replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
}

function getAggregatedStats() {
    const isAnyLive = streams.horizontal.isLive || streams.vertical.isLive;
    const totalViewers = parseViewers(streams.horizontal.viewers) + parseViewers(streams.vertical.viewers);
    const totalLikes = parseViewers(streams.horizontal.likes) + parseViewers(streams.vertical.likes);

    return {
        isLive: isAnyLive,
        channel: config.channel,
        totalViewers: totalViewers.toLocaleString('pt-BR'),
        totalLikes: totalLikes.toLocaleString('pt-BR'),
        streams: {
            horizontal: streams.horizontal,
            vertical: streams.vertical
        }
    };
}

function emitStateUpdate() {
    io.to('authenticated').emit('status-update', getAggregatedStats());
}

// Socket.io com Proteção por PIN
io.on('connection', (socket) => {
    // Cliente tenta autenticar
    socket.on('auth', ({ pin }) => {
        if (pin && String(pin).trim() === String(config.pin).trim()) {
            socket.join('authenticated');
            socket.emit('auth-success', {
                config: {
                    channel: config.channel,
                    streamHorizontal: config.streamHorizontal,
                    streamVertical: config.streamVertical,
                    savedChannels: config.savedChannels || []
                },
                status: getAggregatedStats(),
                recentMessages
            });
        } else {
            socket.emit('auth-failed', { message: 'PIN incorreto' });
        }
    });

    // Alterar configurações (somente autenticado)
    socket.on('set-config', async (newConfig) => {
        if (!socket.rooms.has('authenticated')) return;

        if (newConfig.channel !== undefined) config.channel = newConfig.channel.trim();
        if (newConfig.streamHorizontal !== undefined) config.streamHorizontal = newConfig.streamHorizontal.trim();
        if (newConfig.streamVertical !== undefined) config.streamVertical = newConfig.streamVertical.trim();
        if (newConfig.savedChannels !== undefined) config.savedChannels = newConfig.savedChannels;

        // Se pediu para mudar o PIN
        if (newConfig.newPin && String(newConfig.newPin).trim().length >= 4) {
            config.pin = String(newConfig.newPin).trim();
        }

        saveConfig();

        stopChatForStream('horizontal');
        stopChatForStream('vertical');
        recentMessages = [];

        await checkAllStreams();
    });

    socket.on('force-check', async () => {
        if (!socket.rooms.has('authenticated')) return;
        await checkAllStreams();
    });
});

function startMonitoring() {
    checkAllStreams();
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(checkAllStreams, config.checkIntervalSeconds * 1000);
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🚀 Servidor protegido por PIN rodando em http://${localIP}:${PORT}`);
    console.log(`🔑 PIN Atual: ${config.pin}`);
    startMonitoring();
});
