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

async function checkSingleStream(videoId, isManual = false) {
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

        let title = '';
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch) title = titleMatch[1].replace(' - YouTube', '').trim();

        // Checar se a live já foi terminada pelo YouTube
        const isEnded = html.includes('Este evento ao vivo foi encerrado') || 
                        html.includes('is finished live') ||
                        html.includes('Streamed live');

        let isLive = false;
        if (!isEnded) {
            if (isManual) {
                // Se for link direto (público ou não-listado), aceita e conecta o chat!
                isLive = true;
            } else {
                isLive = html.includes('"isLive":true') || 
                         html.includes('"isLiveNow":true') || 
                         html.includes('"status":"LIVE"') ||
                         html.includes('BADGE_STYLE_TYPE_LIVE_NOW') ||
                         (html.includes('"liveChatRenderer"') && !isEnded);
            }
        }

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

        return { isLive, liveId: videoId, viewers, likes, title: title || `Live (${videoId})` };
    } catch (err) {
        if (isManual) {
            return { isLive: true, liveId: videoId, viewers: '0', likes: '0', title: `Live Manual (${videoId})` };
        }
        return { isLive: false, error: err.message };
    }
}

async function discoverChannelLives(channelInput) {
    if (!channelInput) return [];

    // Se o usuário colou um link de vídeo ou ID no campo canal:
    const directId = extractVideoId(channelInput);
    if (directId) {
        console.log(`[DISCOVERY] Link de vídeo direto inserido no campo de canal: ${directId}`);
        const streamData = await checkSingleStream(directId, true);
        return [streamData];
    }

    let clean = channelInput.trim().replace(/^@/, '');
    const foundIds = new Set();
    const liveResults = [];

    const urlsToScan = [
        `https://www.youtube.com/@${clean}/live`,
        `https://www.youtube.com/@${clean}/streams`,
        `https://www.youtube.com/@${clean}`
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

            const html = await res.text();

            // 1. Canonical watch link do YouTube (redirecionamento do /live)
            const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/);
            if (canonicalMatch) {
                console.log(`[DISCOVERY] Live encontrada via canonical: ${canonicalMatch[1]}`);
                foundIds.add(canonicalMatch[1]);
            }

            // 2. Meta og:url
            const ogMatch = html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/);
            if (ogMatch) {
                console.log(`[DISCOVERY] Live encontrada via og:url: ${ogMatch[1]}`);
                foundIds.add(ogMatch[1]);
            }

            // 3. Regex para badge de LIVE
            const regex = /"videoId":"([a-zA-Z0-9_-]{11})"[^}]+?"style":"(?:LIVE|BADGE_STYLE_TYPE_LIVE_NOW)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                foundIds.add(match[1]);
            }

            // 4. Links /watch?v= com indicação de live
            const matchesAll = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map(m => m[1]);
            for (const vid of matchesAll.slice(0, 20)) {
                if (html.includes(vid) && (html.includes('"label":"AO VIVO"') || html.includes('"label":"LIVE"') || html.includes('BADGE_STYLE_TYPE_LIVE_NOW'))) {
                    foundIds.add(vid);
                }
            }
        } catch (e) {
            console.error(`Erro ao escanear ${url}:`, e.message);
        }
    }

    for (const vid of foundIds) {
        const streamData = await checkSingleStream(vid, false);
        if (streamData.isLive) liveResults.push(streamData);
    }

    return liveResults;
}

async function checkAllStreams() {
    let customHorizId = extractVideoId(config.streamHorizontal);
    let customVertId = extractVideoId(config.streamVertical);

    // Se o usuário digitou link/ID direto de vídeo no campo do canal
    if (!customHorizId && config.channel) {
        const directFromChannel = extractVideoId(config.channel);
        if (directFromChannel) customHorizId = directFromChannel;
    }

    if (customHorizId || customVertId) {
        if (customHorizId) {
            const dataH = await checkSingleStream(customHorizId, true);
            updateStreamState('horizontal', dataH);
        } else {
            updateStreamState('horizontal', { isLive: false });
        }

        if (customVertId) {
            const dataV = await checkSingleStream(customVertId, true);
            updateStreamState('vertical', dataV);
        } else {
            updateStreamState('vertical', { isLive: false });
        }
    } else if (config.channel) {
        const activeLives = await discoverChannelLives(config.channel);
        
        if (activeLives.length === 0) {
            updateStreamState('horizontal', { isLive: false, error: 'Nenhuma live pública encontrada no canal' });
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

    chatInstance.on('start', (startedId) => {
        console.log(`[CHAT-${type.toUpperCase()}] Conectado ao chat com sucesso! (${startedId})`);
        streams[type].isLive = true;
        emitStateUpdate();
    });

    chatInstance.on('end', (reason) => {
        console.log(`[CHAT-${type.toUpperCase()}] Transmissão encerrada: ${reason || 'finalizada'}`);
        streams[type].isLive = false;
        emitStateUpdate();
    });

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
        const inputPin = String(pin || '').trim();
        const correctPin = String(config.pin).trim();
        if (inputPin === correctPin) {
            console.log(`[AUTH] Dispositivo conectado com sucesso! (${socket.handshake.address})`);
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
            console.warn(`[AUTH] Tentativa com PIN inválido: "${inputPin}" (esperado: "${correctPin}")`);
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

    socket.on('simulate-test-message', (data) => {
        if (!socket.rooms.has('authenticated')) return;
        const streamType = data && data.type === 'vertical' ? 'vertical' : 'horizontal';
        const fakeMsg = {
            id: `test-${Date.now()}`,
            streamType: streamType,
            streamLabel: streamType === 'vertical' ? 'Vertical' : 'Horizontal',
            timestamp: new Date(),
            author: {
                name: (data && data.name) || (streamType === 'vertical' ? 'Shorts Viewer 📱' : 'Gamer Raiz 🎮'),
                channelId: 'UCtest',
                thumbnail: 'https://yt3.ggpht.com/a/default-user=s88-c-k-c0x00ffffff-no-rj'
            },
            message: [
                { type: 'text', text: (data && data.text) || (data && data.isSuperchat ? 'Super Chat de Teste! Mandou bem demais na live!' : 'Mensagem de teste recebida com sucesso! O chat está conectado.') }
            ],
            superchat: (data && data.isSuperchat) ? { amount: 'R$ 20,00', color: 'orange' } : null,
            isMembership: !!(data && data.isMembership),
            isVerified: false,
            isOwner: false,
            isModerator: false
        };
        recentMessages.push(fakeMsg);
        if (recentMessages.length > MAX_RECENT_MESSAGES) recentMessages.shift();
        io.to('authenticated').emit('new-message', fakeMsg);
    });
});

function startMonitoring() {
    checkAllStreams();
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(checkAllStreams, config.checkIntervalSeconds * 1000);
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    const localUrl = `http://${localIP}:${PORT}`;
    const localHostUrl = `http://localhost:${PORT}`;

    console.log('\n========================================================');
    console.log('🚀 PAINEL MULTI-STREAM YOUTUBE (PROTEGIDO POR PIN)');
    console.log('========================================================');
    console.log(`💻 Acesso no PC:      ${localHostUrl}`);
    console.log(`📱 Acesso no Celular: ${localUrl}`);
    console.log(`🔑 PIN de Acesso:     ${config.pin}`);
    console.log('--------------------------------------------------------');
    console.log('Escaneie com a câmera do celular (mesma rede Wi-Fi):');
    console.log('--------------------------------------------------------\n');
    qrcode.generate(localUrl, { small: true });
    console.log('\n========================================================');
    console.log(`Canal monitorado: ${config.channel || '(nenhum)'}`);
    console.log('========================================================\n');
    startMonitoring();
});
