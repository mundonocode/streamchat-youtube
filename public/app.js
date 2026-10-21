// StreamChat Mobile - Multi-Stream Client
const socket = io();

// Elementos DOM
const liveIndicatorDot = document.getElementById('live-indicator-dot');
const liveIndicatorText = document.getElementById('live-indicator-text');
const statTotalViewers = document.getElementById('stat-total-viewers');
const statHorizViewers = document.getElementById('stat-horiz-viewers');
const statVertViewers = document.getElementById('stat-vert-viewers');
const statLikes = document.getElementById('stat-likes');

const horizTitle = document.getElementById('horiz-title');
const vertTitle = document.getElementById('vert-title');
const offlineBanner = document.getElementById('offline-banner');

const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const btnScrollBottom = document.getElementById('btn-scroll-bottom');
const unreadCountSpan = document.getElementById('unread-count');

const countAll = document.getElementById('count-all');
const countHoriz = document.getElementById('count-horiz');
const countVert = document.getElementById('count-vert');
const filterTabs = document.querySelectorAll('.filter-tab');

const btnTogglePause = document.getElementById('btn-toggle-pause');
const pauseIcon = document.getElementById('pause-icon');
const pauseText = document.getElementById('pause-text');
const btnFullscreen = document.getElementById('btn-fullscreen');

const socketStatusDot = document.getElementById('socket-status-dot');
const socketStatusText = document.getElementById('socket-status-text');

// Modal
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('modal-settings');
const modalOverlay = document.getElementById('modal-overlay');
const btnCloseModal = document.getElementById('btn-close-modal');
const inputChannel = document.getElementById('input-channel');
const inputStreamHoriz = document.getElementById('input-stream-horiz');
const inputStreamVert = document.getElementById('input-stream-vert');
const btnSaveChannel = document.getElementById('btn-save-channel');
const btnForceCheck = document.getElementById('btn-force-check');
const btnCheckNowBanner = document.getElementById('btn-check-now-banner');
const btnClearChat = document.getElementById('btn-clear-chat');
const toggleAvatars = document.getElementById('toggle-avatars');
const toggleSound = document.getElementById('toggle-sound');
const sizeBtns = document.querySelectorAll('.size-btn');

// Estado
let isPaused = false;
let userScrolledUp = false;
let unreadCount = 0;
let currentFilter = 'all'; // 'all', 'horizontal', 'vertical'
let messageCounts = { all: 0, horizontal: 0, vertical: 0 };

const preferences = {
    fontSize: localStorage.getItem('chat_font_size') || 'medium',
    showAvatars: localStorage.getItem('chat_show_avatars') !== 'false',
    playSound: localStorage.getItem('chat_play_sound') === 'true'
};

function applyPreferences() {
    document.body.className = `font-${preferences.fontSize}`;
    if (!preferences.showAvatars) document.body.classList.add('hide-avatars');
    toggleAvatars.checked = preferences.showAvatars;
    toggleSound.checked = preferences.playSound;

    sizeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === preferences.fontSize);
    });
}
applyPreferences();

function playSuperchatChime() {
    if (!preferences.playSound) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {}
}

function updateStatus(status) {
    const isLive = status.isLive;

    if (isLive) {
        liveIndicatorDot.className = 'dot dot-live';
        liveIndicatorText.textContent = 'AO VIVO';
        liveIndicatorText.classList.add('live');
        offlineBanner.classList.add('hidden');
    } else {
        liveIndicatorDot.className = 'dot dot-offline';
        liveIndicatorText.textContent = 'OFFLINE';
        liveIndicatorText.classList.remove('live');
        offlineBanner.classList.remove('hidden');
    }

    // Espectadores
    statTotalViewers.textContent = status.totalViewers || '0';
    statLikes.textContent = status.totalLikes || '0';

    if (status.streams) {
        const h = status.streams.horizontal;
        const v = status.streams.vertical;

        statHorizViewers.textContent = h && h.isLive ? h.viewers : 'off';
        statVertViewers.textContent = v && v.isLive ? v.viewers : 'off';

        horizTitle.textContent = h && h.isLive ? h.title : (h.liveId ? 'Conectado (Aguardando stream)' : 'Offline');
        vertTitle.textContent = v && v.isLive ? v.title : (v.liveId ? 'Conectado (Aguardando stream)' : 'Offline');
    }
}

// Criar elemento de mensagem com distinção clara de cores
function createMessageElement(data) {
    const card = document.createElement('div');
    card.className = `message-card stream-${data.streamType || 'horizontal'}`;
    card.dataset.stream = data.streamType || 'horizontal';

    if (currentFilter !== 'all' && card.dataset.stream !== currentFilter) {
        card.style.display = 'none';
    }

    if (data.superchat) card.classList.add('superchat');

    // Avatar
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = data.author.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23647087"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    avatar.loading = 'lazy';
    avatar.alt = data.author.name;
    card.appendChild(avatar);

    // Corpo
    const body = document.createElement('div');
    body.className = 'message-body';

    // Superchat
    if (data.superchat) {
        const scBadge = document.createElement('span');
        scBadge.className = 'superchat-amount';
        scBadge.textContent = data.superchat.amount;
        if (data.superchat.color) scBadge.style.backgroundColor = data.superchat.color;
        body.appendChild(scBadge);
    }

    // Cabeçalho da mensagem
    const header = document.createElement('span');
    header.className = 'message-header';

    // Tag que mostra de qual live veio
    const originTag = document.createElement('span');
    const isVert = data.streamType === 'vertical';
    originTag.className = `stream-origin-tag ${isVert ? 'vert' : 'horiz'}`;
    originTag.textContent = isVert ? '📱 VERTICAL' : '🖥️ HORIZONTAL';
    header.appendChild(originTag);

    // Autor
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

    // Texto + emojis
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';

    if (Array.isArray(data.message)) {
        data.message.forEach(item => {
            if (item.type === 'emoji') {
                const img = document.createElement('img');
                img.src = item.url;
                img.alt = item.alt;
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

function addMessage(data, isInitialLoad = false) {
    messageCounts.all++;
    const type = data.streamType || 'horizontal';
    if (messageCounts[type] !== undefined) messageCounts[type]++;

    countAll.textContent = messageCounts.all;
    countHoriz.textContent = messageCounts.horizontal;
    countVert.textContent = messageCounts.vertical;

    const el = createMessageElement(data);
    chatMessages.appendChild(el);

    if (!isInitialLoad && data.superchat) {
        playSuperchatChime();
    }

    if (chatMessages.children.length > 250) {
        chatMessages.removeChild(chatMessages.children[0]);
    }

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

// Filtro de Tabs
filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;

        const allCards = chatMessages.querySelectorAll('.message-card');
        allCards.forEach(card => {
            if (currentFilter === 'all' || card.dataset.stream === currentFilter) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
        scrollToBottom();
    });
});

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

btnTogglePause.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Retomar';
    } else {
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pausar';
        scrollToBottom();
    }
});

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
    const payload = {
        channel: inputChannel.value.trim(),
        streamHorizontal: inputStreamHoriz.value.trim(),
        streamVertical: inputStreamVert.value.trim()
    };
    socket.emit('set-config', payload);
    modalSettings.classList.add('hidden');
});

btnForceCheck.addEventListener('click', () => {
    socket.emit('force-check');
    btnForceCheck.textContent = 'Checando...';
    setTimeout(() => { btnForceCheck.textContent = '🔄 Forçar Verificação'; }, 2000);
});

btnCheckNowBanner.addEventListener('click', () => {
    socket.emit('force-check');
    btnCheckNowBanner.textContent = 'Verificando...';
    setTimeout(() => { btnCheckNowBanner.textContent = 'Verificar Agora'; }, 2000);
});

btnClearChat.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    messageCounts = { all: 0, horizontal: 0, vertical: 0 };
    countAll.textContent = '0';
    countHoriz.textContent = '0';
    countVert.textContent = '0';
    unreadCount = 0;
    btnScrollBottom.classList.add('hidden');
    modalSettings.classList.add('hidden');
});

sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        preferences.fontSize = btn.dataset.size;
        localStorage.setItem('chat_font_size', preferences.fontSize);
        applyPreferences();
    });
});

toggleAvatars.addEventListener('change', (e) => {
    preferences.showAvatars = e.target.checked;
    localStorage.setItem('chat_show_avatars', preferences.showAvatars);
    applyPreferences();
});

toggleSound.addEventListener('change', (e) => {
    preferences.playSound = e.target.checked;
    localStorage.setItem('chat_play_sound', preferences.playSound);
    if (preferences.playSound) playSuperchatChime();
});

// Socket.io
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
    inputStreamHoriz.value = data.config.streamHorizontal || '';
    inputStreamVert.value = data.config.streamVertical || '';

    updateStatus(data.status);

    chatMessages.innerHTML = '';
    messageCounts = { all: 0, horizontal: 0, vertical: 0 };

    if (data.recentMessages && data.recentMessages.length > 0) {
        data.recentMessages.forEach(msg => addMessage(msg, true));
        scrollToBottom();
    }
});

socket.on('status-update', (status) => {
    updateStatus(status);
});

socket.on('new-message', (msg) => {
    addMessage(msg, false);
});
