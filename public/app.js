// StreamChat Mobile Client
const socket = io();

// Elementos DOM
const liveIndicatorDot = document.getElementById('live-indicator-dot');
const liveIndicatorText = document.getElementById('live-indicator-text');
const liveUptime = document.getElementById('live-uptime');
const statViewers = document.getElementById('stat-viewers');
const statLikes = document.getElementById('stat-likes');
const statMessages = document.getElementById('stat-messages');
const liveTitle = document.getElementById('live-title');
const channelNameBadge = document.getElementById('channel-name-badge');
const offlineBanner = document.getElementById('offline-banner');

const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const btnScrollBottom = document.getElementById('btn-scroll-bottom');
const unreadCountSpan = document.getElementById('unread-count');

const btnTogglePause = document.getElementById('btn-toggle-pause');
const pauseIcon = document.getElementById('pause-icon');
const pauseText = document.getElementById('pause-text');
const btnFullscreen = document.getElementById('btn-fullscreen');

const socketStatusDot = document.getElementById('socket-status-dot');
const socketStatusText = document.getElementById('socket-status-text');

// Modal de Configurações
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('modal-settings');
const modalOverlay = document.getElementById('modal-overlay');
const btnCloseModal = document.getElementById('btn-close-modal');
const inputChannel = document.getElementById('input-channel');
const btnSaveChannel = document.getElementById('btn-save-channel');
const btnForceCheck = document.getElementById('btn-force-check');
const btnCheckNowBanner = document.getElementById('btn-check-now-banner');
const btnClearChat = document.getElementById('btn-clear-chat');
const toggleAvatars = document.getElementById('toggle-avatars');
const toggleSound = document.getElementById('toggle-sound');
const sizeBtns = document.querySelectorAll('.size-btn');

// Estado Local
let isLive = false;
let liveStartTime = null;
let uptimeTimer = null;
let totalMessagesReceived = 0;
let isPaused = false;
let unreadCount = 0;
let userScrolledUp = false;

// Preferências salvas
const preferences = {
    fontSize: localStorage.getItem('chat_font_size') || 'medium',
    showAvatars: localStorage.getItem('chat_show_avatars') !== 'false',
    playSound: localStorage.getItem('chat_play_sound') === 'true'
};

// Aplicar preferências salvas
function applyPreferences() {
    document.body.className = `font-${preferences.fontSize}`;
    if (!preferences.showAvatars) {
        document.body.classList.add('hide-avatars');
    }
    toggleAvatars.checked = preferences.showAvatars;
    toggleSound.checked = preferences.playSound;

    sizeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === preferences.fontSize);
    });
}
applyPreferences();

// Sintetizador de Som para Super Chat (Web Audio API - Sem downloads externos)
function playSuperchatChime() {
    if (!preferences.playSound) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.error('AudioContext error:', e);
    }
}

// Atualizar Relógio de Duração da Live
function updateUptime() {
    if (!liveStartTime) {
        liveUptime.classList.add('hidden');
        return;
    }
    const diff = Math.floor((Date.now() - new Date(liveStartTime).getTime()) / 1000);
    if (diff < 0) return;

    const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');

    liveUptime.textContent = `${hrs}:${mins}:${secs}`;
    liveUptime.classList.remove('hidden');
}

// Atualizar Status Geral da Live na UI
function updateLiveStatus(status) {
    isLive = !!status.isLive;
    channelNameBadge.textContent = status.channel || '@não definido';

    if (isLive) {
        liveIndicatorDot.className = 'dot dot-live';
        liveIndicatorText.textContent = 'AO VIVO';
        liveIndicatorText.classList.add('live');
        liveTitle.textContent = status.title || 'Transmissão Ao Vivo';
        statViewers.textContent = status.viewers || '0';
        statLikes.textContent = status.likes || '0';
        offlineBanner.classList.add('hidden');

        if (status.startTime && !liveStartTime) {
            liveStartTime = status.startTime;
            if (uptimeTimer) clearInterval(uptimeTimer);
            uptimeTimer = setInterval(updateUptime, 1000);
            updateUptime();
        }
    } else {
        liveIndicatorDot.className = 'dot dot-offline';
        liveIndicatorText.textContent = 'OFFLINE';
        liveIndicatorText.classList.remove('live');
        liveTitle.textContent = status.channel ? 'Aguardando início da live...' : 'Configure o seu canal para monitorar';
        statViewers.textContent = '0';
        statLikes.textContent = '0';
        liveUptime.classList.add('hidden');
        if (uptimeTimer) {
            clearInterval(uptimeTimer);
            uptimeTimer = null;
        }
        liveStartTime = null;
        offlineBanner.classList.remove('hidden');
    }
}

// Renderizar Mensagem
function createMessageElement(data) {
    const card = document.createElement('div');
    card.className = 'message-card';
    if (data.superchat) card.classList.add('superchat');

    // Avatar
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = data.author.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23647087"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    avatar.loading = 'lazy';
    avatar.alt = data.author.name;
    card.appendChild(avatar);

    // Corpo da Mensagem
    const body = document.createElement('div');
    body.className = 'message-body';

    // Superchat Banner
    if (data.superchat) {
        const scHeader = document.createElement('div');
        scHeader.className = 'superchat-header';
        
        const scBadge = document.createElement('span');
        scBadge.className = 'superchat-amount';
        scBadge.textContent = data.superchat.amount;
        if (data.superchat.color) scBadge.style.backgroundColor = data.superchat.color;

        scHeader.appendChild(scBadge);
        body.appendChild(scHeader);
    }

    // Cabeçalho da Mensagem (Nome + Badges)
    const header = document.createElement('span');
    header.className = 'message-header';

    const author = document.createElement('span');
    author.className = 'author-name';
    if (data.isOwner) author.classList.add('is-owner');
    if (data.isModerator) author.classList.add('is-mod');
    author.textContent = data.author.name;
    header.appendChild(author);

    // Badges
    if (data.isOwner) {
        const b = document.createElement('span');
        b.className = 'badge-tag owner';
        b.textContent = 'Dono';
        header.appendChild(b);
    } else if (data.isModerator) {
        const b = document.createElement('span');
        b.className = 'badge-tag mod';
        b.textContent = 'Mod';
        header.appendChild(b);
    }

    if (data.isMembership) {
        const b = document.createElement('span');
        b.className = 'badge-tag member';
        b.textContent = 'Membro';
        header.appendChild(b);
    }

    body.appendChild(header);

    // Conteúdo da Mensagem (Texto + Emojis)
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';

    if (Array.isArray(data.message)) {
        data.message.forEach(item => {
            if (item.type === 'emoji') {
                const img = document.createElement('img');
                img.src = item.url;
                img.alt = item.alt;
                img.title = item.alt;
                img.className = 'chat-emoji';
                textSpan.appendChild(img);
            } else {
                textSpan.appendChild(document.createTextNode(item.text));
            }
        });
    } else if (typeof data.message === 'string') {
        textSpan.textContent = data.message;
    }

    body.appendChild(textSpan);

    // Horário
    if (data.timestamp) {
        const time = new Date(data.timestamp);
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
        body.appendChild(timeSpan);
    }

    card.appendChild(body);
    return card;
}

// Inserir Nova Mensagem
function addMessage(data, isInitialLoad = false) {
    totalMessagesReceived++;
    statMessages.textContent = totalMessagesReceived;

    const msgElement = createMessageElement(data);
    chatMessages.appendChild(msgElement);

    // Alerta sonoro de Super Chat se não for carga inicial
    if (!isInitialLoad && data.superchat) {
        playSuperchatChime();
    }

    // Limitar histórico no DOM para o navegador do celular não ficar lento
    if (chatMessages.children.length > 200) {
        chatMessages.removeChild(chatMessages.children[0]);
    }

    // Rolagem Inteligente
    if (!isPaused && !userScrolledUp) {
        scrollToBottom();
    } else if (!isInitialLoad) {
        unreadCount++;
        unreadCountSpan.textContent = unreadCount;
        btnScrollBottom.classList.remove('hidden');
    }
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    unreadCount = 0;
    btnScrollBottom.classList.add('hidden');
    userScrolledUp = false;
}

// Detectar se o usuário rolou para cima manualmente
chatContainer.addEventListener('scroll', () => {
    const isAtBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 60;
    if (isAtBottom) {
        userScrolledUp = false;
        unreadCount = 0;
        btnScrollBottom.classList.add('hidden');
    } else {
        userScrolledUp = true;
    }
});

btnScrollBottom.addEventListener('click', scrollToBottom);

// Pausar / Retomar Rolagem
btnTogglePause.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Retomar';
        btnTogglePause.style.borderColor = 'var(--accent-red)';
    } else {
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pausar';
        btnTogglePause.style.borderColor = 'var(--border-color)';
        scrollToBottom();
    }
});

// Botão Tela Cheia (Essencial para Mobile)
btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
});

// Modal e Configurações
btnSettings.addEventListener('click', () => modalSettings.classList.remove('hidden'));
btnCloseModal.addEventListener('click', () => modalSettings.classList.add('hidden'));
modalOverlay.addEventListener('click', () => modalSettings.classList.add('hidden'));

btnSaveChannel.addEventListener('click', () => {
    const val = inputChannel.value.trim();
    if (val) {
        socket.emit('set-channel', val);
        modalSettings.classList.add('hidden');
    }
});

btnForceCheck.addEventListener('click', () => {
    socket.emit('force-check');
    btnForceCheck.textContent = 'Checando...';
    setTimeout(() => {
        btnForceCheck.textContent = '🔄 Forçar Verificação de Live';
    }, 2000);
});

btnCheckNowBanner.addEventListener('click', () => {
    socket.emit('force-check');
    btnCheckNowBanner.textContent = 'Verificando...';
    setTimeout(() => {
        btnCheckNowBanner.textContent = 'Verificar Agora';
    }, 2000);
});

btnClearChat.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    totalMessagesReceived = 0;
    statMessages.textContent = '0';
    unreadCount = 0;
    btnScrollBottom.classList.add('hidden');
    modalSettings.classList.add('hidden');
});

// Ajuste do tamanho da fonte
sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        preferences.fontSize = btn.dataset.size;
        localStorage.setItem('chat_font_size', preferences.fontSize);
        applyPreferences();
    });
});

// Toggle Avatares
toggleAvatars.addEventListener('change', (e) => {
    preferences.showAvatars = e.target.checked;
    localStorage.setItem('chat_show_avatars', preferences.showAvatars);
    applyPreferences();
});

// Toggle Som
toggleSound.addEventListener('change', (e) => {
    preferences.playSound = e.target.checked;
    localStorage.setItem('chat_play_sound', preferences.playSound);
    if (preferences.playSound) playSuperchatChime();
});

// Eventos do Socket.io
socket.on('connect', () => {
    socketStatusDot.className = 'dot dot-green';
    socketStatusText.textContent = 'Conectado';
});

socket.on('disconnect', () => {
    socketStatusDot.className = 'dot dot-offline';
    socketStatusText.textContent = 'Reconectando...';
});

socket.on('init', (data) => {
    inputChannel.value = data.config.channel || '';
    updateLiveStatus(data.status);

    chatMessages.innerHTML = '';
    totalMessagesReceived = 0;

    if (data.recentMessages && data.recentMessages.length > 0) {
        data.recentMessages.forEach(msg => addMessage(msg, true));
        scrollToBottom();
    }
});

socket.on('status-update', (status) => {
    updateLiveStatus(status);
});

socket.on('new-message', (msg) => {
    addMessage(msg, false);
});
