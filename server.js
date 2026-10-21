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
    channel: '',
    checkIntervalSeconds: 20,
    statsIntervalSeconds: 15
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
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado da aplicação
let currentLive = {
    isLive: false,
    channel: config.channel,
    liveId: null,
    title: '',
    viewers: '0',
    likes: '0',
    startTime: null,
    lastCheck: null,
    error: null
};

let recentMessages = [];
const MAX_RECENT_MESSAGES = 150;
let liveChatInstance = null;
let monitorInterval = null;
let statsInterval = null;

// Obter IP local da rede Wi-Fi
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

// Resolver URL para checagem da Live
function getLiveUrl(channelInput) {
    if (!channelInput) return null;
    let clean = channelInput.trim();

    // Se já for uma URL direta de vídeo
    const watchMatch = clean.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
        return { type: 'video', url: `https://www.youtube.com/watch?v=${watchMatch[1]}`, videoId: watchMatch[1] };
    }

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
        if (!clean.includes('/live')) {
            clean = clean.replace(/\/$/, '') + '/live';
        }
        return { type: 'channel', url: clean };
    }

    if (clean.startsWith('@')) {
        return { type: 'channel', url: `https://www.youtube.com/${clean}/live` };
    }

    if (clean.startsWith('UC') && clean.length === 24) {
        return { type: 'channel', url: `https://www.youtube.com/channel/${clean}/live` };
    }

    return { type: 'channel', url: `https://www.youtube.com/@${clean}/live` };
}

// Checar status da live
async function checkLiveStatus() {
    if (!config.channel) {
        currentLive.isLive = false;
        currentLive.error = 'Nenhum canal configurado';
        io.emit('status-update', currentLive);
        return;
    }

    const target = getLiveUrl(config.channel);
    if (!target) return;

    try {
        const response = await fetch(target.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            redirect: 'follow'
        });

        const finalUrl = response.url;
        const html = await response.text();

        let liveId = target.videoId;
        if (!liveId) {
            const watchMatch = finalUrl.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
            if (watchMatch) {
                liveId = watchMatch[1];
            } else {
                const matchVid = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (matchVid) liveId = matchVid[1];
            }
        }

        const isLive = html.includes('"isLive":true') || 
                       html.includes('"isLiveNow":true') || 
                       html.includes('"isLiveContent":true') || 
                       html.includes('"status":"LIVE"');

        // Extrair Viewers
        let viewers = '0';
        const viewersMatch = html.match(/"videoViewCountRenderer":\{"viewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"viewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"shortViewCount":\{"runs":\[\{"text":"([^"]+)"\}/) ||
                             html.match(/"originalText":"([^"]+)"/);
        if (viewersMatch) {
            viewers = viewersMatch[1];
        }

        // Extrair Likes
        let likes = '0';
        const likesMatch = html.match(/"accessibility":\{"accessibilityData":\{"label":"([0-9.,]+)\s*(?:marcações de gostei|gostei|likes)"/i) ||
                           html.match(/"defaultText":\{"accessibility":\{"accessibilityData":\{"label":"([0-9.,]+)\s*(?:gostei|likes)"/i);
        if (likesMatch) {
            likes = likesMatch[1];
        }

        // Extrair Título
        let title = '';
        const titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch) {
            title = titleMatch[1].replace(' - YouTube', '').trim();
        }

        currentLive.lastCheck = new Date().toISOString();
        currentLive.error = null;

        if (isLive && liveId) {
            const wasOffline = !currentLive.isLive || currentLive.liveId !== liveId;
            currentLive.isLive = true;
            currentLive.liveId = liveId;
            currentLive.title = title;
            currentLive.viewers = viewers;
            currentLive.likes = likes;
            if (wasOffline) {
                currentLive.startTime = new Date().toISOString();
                startLiveChat(liveId);
            }
        } else {
            if (currentLive.isLive) {
                // Live terminou
                stopLiveChat();
            }
            currentLive.isLive = false;
            currentLive.liveId = null;
            currentLive.viewers = '0';
            currentLive.likes = '0';
            currentLive.startTime = null;
        }

        io.emit('status-update', currentLive);
    } catch (err) {
        console.error('Erro ao verificar canal:', err.message);
        currentLive.error = `Erro de conexão: ${err.message}`;
        currentLive.lastCheck = new Date().toISOString();
        io.emit('status-update', currentLive);
    }
}

// Iniciar conexão com o chat
function startLiveChat(liveId) {
    if (liveChatInstance) {
        try { liveChatInstance.stop(); } catch (e) {}
        liveChatInstance = null;
    }

    console.log(`[CHAT] Conectando ao chat da live ${liveId}...`);
    recentMessages = [];

    liveChatInstance = new LiveChat({ liveId });

    liveChatInstance.on('start', (id) => {
        console.log(`[CHAT] Monitorando chat ao vivo: ${id}`);
        io.emit('chat-connected', { liveId: id });
    });

    liveChatInstance.on('end', (reason) => {
        console.log(`[CHAT] Conexão encerrada: ${reason}`);
        io.emit('chat-disconnected', { reason });
    });

    liveChatInstance.on('chat', (chatItem) => {
        const parsedMessage = {
            id: chatItem.id || `${Date.now()}-${Math.random()}`,
            timestamp: chatItem.timestamp || new Date(),
            author: {
                name: chatItem.author.name,
                channelId: chatItem.author.channelId,
                thumbnail: chatItem.author.thumbnail ? chatItem.author.thumbnail.url : null,
                badge: chatItem.author.badge ? {
                    label: chatItem.author.badge.label,
                    thumbnail: chatItem.author.badge.thumbnail ? chatItem.author.badge.thumbnail.url : null
                } : null
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

        io.emit('new-message', parsedMessage);
    });

    liveChatInstance.on('error', (err) => {
        console.error('[CHAT] Erro no listener do chat:', err);
    });

    liveChatInstance.start().then(ok => {
        if (!ok) {
            console.error('[CHAT] Falha ao iniciar youtube-chat.');
        }
    }).catch(err => {
        console.error('[CHAT] Exceção ao iniciar chat:', err);
    });
}

function stopLiveChat() {
    if (liveChatInstance) {
        try {
            liveChatInstance.stop();
        } catch (e) {}
        liveChatInstance = null;
    }
}

// Rotas da API
app.get('/api/state', (req, res) => {
    res.json({
        config,
        status: currentLive,
        recentMessages
    });
});

app.post('/api/config', async (req, res) => {
    const { channel } = req.body;
    if (channel !== undefined) {
        config.channel = channel.trim();
        saveConfig();
        currentLive.channel = config.channel;
        
        // Se mudou de canal, resetar chat e verificar agora
        stopLiveChat();
        recentMessages = [];
        currentLive.isLive = false;
        currentLive.liveId = null;
        
        await checkLiveStatus();
    }
    res.json({ success: true, config, status: currentLive });
});

app.post('/api/check-now', async (req, res) => {
    await checkLiveStatus();
    res.json({ success: true, status: currentLive });
});

// Socket.io
io.on('connection', (socket) => {
    // Envia estado atual e mensagens acumuladas
    socket.emit('init', {
        config,
        status: currentLive,
        recentMessages
    });

    socket.on('set-channel', async (newChannel) => {
        config.channel = (newChannel || '').trim();
        saveConfig();
        currentLive.channel = config.channel;
        stopLiveChat();
        recentMessages = [];
        currentLive.isLive = false;
        await checkLiveStatus();
    });

    socket.on('force-check', async () => {
        await checkLiveStatus();
    });
});

// Inicialização de loop de monitoramento
function startMonitoring() {
    // Primeira checagem imediata
    checkLiveStatus();

    // Loop de verificação de status da live
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(checkLiveStatus, config.checkIntervalSeconds * 1000);
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    const localUrl = `http://${localIP}:${PORT}`;
    const localHostUrl = `http://localhost:${PORT}`;

    console.log('\n========================================================');
    console.log('🚀 PAINEL DE CHAT E ESTATÍSTICAS DO YOUTUBE AO VIVO');
    console.log('========================================================');
    console.log(`💻 Acesso no Computador: ${localHostUrl}`);
    console.log(`📱 Acesso no Celular:    ${localUrl}`);
    console.log('--------------------------------------------------------');
    console.log('Escaneie o QR Code abaixo com a câmera do seu celular:');
    console.log('--------------------------------------------------------\n');
    
    qrcode.generate(localUrl, { small: true });

    console.log('\n========================================================');
    console.log(`Canal configurado: ${config.channel || '(nenhum - configure pela tela)'}`);
    console.log('========================================================\n');

    startMonitoring();
});
