// StreamChat Mobile - Multi-Stream Client com Seleção Inicial de Canal
const socket = io();

// Elementos da Tela Inicial de Seleção de Canal
const welcomeScreen = document.getElementById('welcome-screen');
const appContent = document.getElementById('app-content');
const btnChannelChoices = document.querySelectorAll('.btn-channel-choice');
const inputDirectWelcome = document.getElementById('input-direct-welcome');
const btnConnectDirect = document.getElementById('btn-connect-direct');
const inputWelcomePin = document.getElementById('input-welcome-pin');
const welcomePinError = document.getElementById('welcome-pin-error');
const btnLogout = document.getElementById('btn-logout');

// Elementos DOM do Topo e App
const liveIndicatorDot = document.getElementById('live-indicator-dot');
const liveIndicatorText = document.getElementById('live-indicator-text');
const statTotalViewers = document.getElementById('stat-total-viewers');
const statHorizViewers = document.getElementById('stat-horiz-viewers');
const statVertViewers = document.getElementById('stat-vert-viewers');
const statLikes = document.getElementById('stat-likes');

const horizTitle = document.getElementById('horiz-title');
const vertTitle = document.getElementById('vert-title');
const channelBadge = document.getElementById('channel-badge');
const offlineBanner = document.getElementById('offline-banner');

const pillCh1 = document.getElementById('pill-ch1');
const pillCh2 = document.getElementById('pill-ch2');

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
const inputNewPin = document.getElementById('input-new-pin');
const btnSaveChannel = document.getElementById('btn-save-channel');
const btnForceCheck = document.getElementById('btn-force-check');
const btnCheckNowBanner = document.getElementById('btn-check-now-banner');
const btnClearChat = document.getElementById('btn-clear-chat');
const toggleAvatars = document.getElementById('toggle-avatars');
const toggleSound = document.getElementById('toggle-sound');
const sizeBtns = document.querySelectorAll('.size-btn');

// Atalhos dos 2 canais fixos
const btnQuickCh1 = document.getElementById('btn-quick-ch1');
const btnQuickCh2 = document.getElementById('btn-quick-ch2');
let savedChannels = ['@MundoNoCode', '@gutaogamer3570'];

// Estado
let isAuthenticated = false;
let isPaused = false;
let userScrolledUp = false;
let unreadCount = 0;
let currentFilter = 'all';
let messageCounts = { all: 0, horizontal: 0, vertical: 0 };
let pendingSelection = null;
const seenMessageIds = new Set();

const preferences = {
    fontSize: localStorage.getItem('chat_font_size') || 'medium',
    showAvatars: localStorage.getItem('chat_show_avatars') !== 'false',
    playSound: localStorage.getItem('chat_play_sound') !== 'false'
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

// --- Fluxo de Seleção Inicial de Canal ---
btnChannelChoices.forEach(btn => {
    btn.addEventListener('click', () => {
        const selected = btn.dataset.channel;
        selectChannelAndEnter(selected, '');
    });
});

if (btnConnectDirect) {
    btnConnectDirect.addEventListener('click', () => {
        const directVal = inputDirectWelcome ? inputDirectWelcome.value.trim() : '';
        if (!directVal) return;
        selectChannelAndEnter('', directVal);
    });
}

function selectChannelAndEnter(channel, directStream = '') {
    const pin = (inputWelcomePin && inputWelcomePin.value.trim()) || localStorage.getItem('streamer_pin') || '3006';
    pendingSelection = { channel, directStream };

    if (welcomePinError) welcomePinError.classList.add('hidden');

    if (isAuthenticated) {
        applyPendingSelection();
    } else {
        socket.emit('auth', { pin });
    }
}

function applyPendingSelection() {
    if (!pendingSelection) return;
    const { channel, directStream } = pendingSelection;

    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (appContent) appContent.classList.remove('hidden');

    inputChannel.value = channel || '';
    inputStreamHoriz.value = directStream || '';
    inputStreamVert.value = '';

    socket.emit('set-config', {
        channel: channel || '',
        streamHorizontal: directStream || '',
        streamVertical: '',
        savedChannels: savedChannels
    });

    updateQuickSwitchButtons(channel);
    pendingSelection = null;
}

function switchChannel(channelName) {
    if (!channelName) return;
    inputChannel.value = channelName;
    inputStreamHoriz.value = '';
    inputStreamVert.value = '';

    updateQuickSwitchButtons(channelName);

    socket.emit('set-config', {
        channel: channelName,
        streamHorizontal: '',
        streamVertical: '',
        savedChannels: savedChannels
    });
}

socket.on('auth-success', (data) => {
    isAuthenticated = true;
    const currentPin = (inputWelcomePin && inputWelcomePin.value.trim()) || '3006';
    localStorage.setItem('streamer_pin', currentPin);

    if (data.config.savedChannels && data.config.savedChannels.length > 0) {
        savedChannels = data.config.savedChannels;
    }

    // Se o usuário já escolheu o canal na tela inicial, abre o app
    if (pendingSelection) {
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
        applyPendingSelection();
    } else {
        // Se ainda não selecionou, aguarda a escolha do usuário na primeira tela
        inputChannel.value = data.config.channel || '';
        inputStreamHoriz.value = data.config.streamHorizontal || '';
        inputStreamVert.value = data.config.streamVertical || '';
        updateQuickSwitchButtons(data.config.channel);
        updateStatus(data.status);
    }

    chatMessages.innerHTML = '';
    messageCounts = { all: 0, horizontal: 0, vertical: 0 };

    if (data.recentMessages && data.recentMessages.length > 0) {
        data.recentMessages.forEach(msg => addMessage(msg, true));
        scrollToBottom();
    }
});

socket.on('auth-failed', () => {
    isAuthenticated = false;
    localStorage.removeItem('streamer_pin');
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
    if (welcomePinError) welcomePinError.classList.remove('hidden');
});

// Logout
btnLogout.addEventListener('click', () => {
    localStorage.removeItem('streamer_pin');
    modalSettings.classList.add('hidden');
    location.reload();
});

// Atualiza o estado dos botões dos 2 canais
function updateQuickSwitchButtons(currentChannel) {
    if (btnQuickCh1) {
        btnQuickCh1.textContent = savedChannels[0] || '@MundoNoCode';
        btnQuickCh1.classList.toggle('active', currentChannel && currentChannel === savedChannels[0]);
    }
    if (btnQuickCh2) {
        btnQuickCh2.textContent = savedChannels[1] || '@gutaogamer3570';
        btnQuickCh2.classList.toggle('active', currentChannel && currentChannel === savedChannels[1]);
    }

    if (pillCh1) {
        pillCh1.textContent = savedChannels[0] || '@MundoNoCode';
        pillCh1.classList.toggle('active', currentChannel && currentChannel === savedChannels[0]);
    }
    if (pillCh2) {
        pillCh2.textContent = savedChannels[1] || '@gutaogamer3570';
        pillCh2.classList.toggle('active', currentChannel && currentChannel === savedChannels[1]);
    }
}

if (pillCh1) {
    pillCh1.addEventListener('click', () => switchChannel(savedChannels[0] || '@MundoNoCode'));
}
if (pillCh2) {
    pillCh2.addEventListener('click', () => switchChannel(savedChannels[1] || '@gutaogamer3570'));
}

if (btnQuickCh1) {
    btnQuickCh1.addEventListener('click', () => {
        switchChannel(savedChannels[0] || '@MundoNoCode');
        modalSettings.classList.add('hidden');
    });
}
if (btnQuickCh2) {
    btnQuickCh2.addEventListener('click', () => {
        switchChannel(savedChannels[1] || '@gutaogamer3570');
        modalSettings.classList.add('hidden');
    });
}

// Áudio e Efeitos Sonoros
let sharedAudioCtx = null;
function getAudioContext() {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
}

// Desbloqueia o áudio no primeiro toque na tela (exigência do iOS / Android)
window.addEventListener('touchstart', () => getAudioContext(), { once: true });
window.addEventListener('click', () => getAudioContext(), { once: true });

// Alerta sutil e suave para mensagens normais (estilo "pop" minimalista)
function playMessagePop() {
    if (!preferences.playSound) return;
    try {
        const audioCtx = getAudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(650, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(450, audioCtx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
}

// Som destacado para Super Chat
function playSuperchatChime() {
    if (!preferences.playSound) return;
    try {
        const audioCtx = getAudioContext();
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

// Som comemorativo alegre para Novos Inscritos / Membros
function playSubscriptionChime() {
    if (!preferences.playSound) return;
    try {
        const audioCtx = getAudioContext();
        const notes = [523.25, 659.25, 783.99]; // Dó, Mi, Sol
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const startTime = audioCtx.currentTime + (idx * 0.1);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.18, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.25);
        });
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

    statTotalViewers.textContent = status.totalViewers || '0';
    statLikes.textContent = status.totalLikes || '0';
    channelBadge.textContent = status.channel || (status.isLive ? 'Live Ativa' : '@não definido');

    if (status.streams) {
        const h = status.streams.horizontal;
        const v = status.streams.vertical;

        statHorizViewers.textContent = h && h.isLive ? (h.viewers || '0') : 'off';
        statVertViewers.textContent = v && v.isLive ? (v.viewers || '0') : 'off';

        horizTitle.textContent = h && h.isLive ? h.title : (h.liveId ? 'Conectado' : 'Offline');
        vertTitle.textContent = v && v.isLive ? v.title : (v.liveId ? 'Conectado' : 'Offline');
    }
}

function createMessageElement(data) {
    const card = document.createElement('div');
    card.className = `message-card stream-${data.streamType || 'horizontal'}`;
    card.dataset.stream = data.streamType || 'horizontal';

    if (currentFilter !== 'all' && card.dataset.stream !== currentFilter) {
        card.style.display = 'none';
    }

    if (data.superchat) card.classList.add('superchat');
    if (data.isNewSubscription) card.classList.add('subscription-event');

    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = data.author.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23647087"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    avatar.loading = 'lazy';
    avatar.alt = data.author.name;
    card.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'message-body';

    // Destaque de Novo Inscrito
    if (data.isNewSubscription) {
        const subBadge = document.createElement('div');
        subBadge.className = 'subscription-badge';
        subBadge.textContent = '🎉 NOVO INSCRITO';
        body.appendChild(subBadge);
    }

    // Destaque de Super Chat
    if (data.superchat) {
        const scBadge = document.createElement('span');
        scBadge.className = 'superchat-amount';
        scBadge.textContent = data.superchat.amount;
        if (data.superchat.color) scBadge.style.backgroundColor = data.superchat.color;
        body.appendChild(scBadge);
    }

    // Linha 1: Cabeçalho com Origem, Nome do Usuário, Badges e Horário
    const header = document.createElement('div');
    header.className = 'message-header';

    const originTag = document.createElement('span');
    const isVert = data.streamType === 'vertical';
    originTag.className = `stream-origin-tag ${isVert ? 'vert' : 'horiz'}`;
    originTag.textContent = isVert ? '📱 VERT' : '🖥️ HORIZ';
    header.appendChild(originTag);

    const author = document.createElement('span');
    author.className = 'author-name';
    if (data.isOwner) author.classList.add('is-owner');
    if (data.isModerator) author.classList.add('is-mod');
    author.textContent = data.author.name;
    header.appendChild(author);

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

    if (data.timestamp) {
        const time = new Date(data.timestamp);
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
        header.appendChild(timeSpan);
    }

    body.appendChild(header);

    // Linha 2: Mensagem sempre abaixo do nome para clareza total
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';

    if (Array.isArray(data.message)) {
        data.message.forEach(item => {
            if (item.type === 'emoji') {
                const img = document.createElement('img');
                img.src = item.url;
                img.alt = item.alt;
                img.className = 'chat-emoji';
                textDiv.appendChild(img);
            } else {
                textDiv.appendChild(document.createTextNode(item.text));
            }
        });
    } else if (typeof data.message === 'string') {
        textDiv.textContent = data.message;
    }
    body.appendChild(textDiv);

    card.appendChild(body);
    return card;
}

function addMessage(data, isInitialLoad = false) {
    // Prevenção contra mensagens duplicadas
    if (data.id && seenMessageIds.has(data.id)) return;
    if (data.id) {
        seenMessageIds.add(data.id);
        if (seenMessageIds.size > 500) {
            const first = seenMessageIds.values().next().value;
            seenMessageIds.delete(first);
        }
    }

    messageCounts.all++;
    const type = data.streamType || 'horizontal';
    if (messageCounts[type] !== undefined) messageCounts[type]++;

    countAll.textContent = messageCounts.all;
    countHoriz.textContent = messageCounts.horizontal;
    countVert.textContent = messageCounts.vertical;

    const el = createMessageElement(data);
    chatMessages.appendChild(el);

    if (!isInitialLoad) {
        if (data.isNewSubscription) {
            playSubscriptionChime();
        } else if (data.superchat) {
            playSuperchatChime();
        } else {
            playMessagePop();
        }
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
    const curChannel = inputChannel.value.trim();

    // Se salvou um canal que ainda não estava na lista de rápidos, adiciona
    if (curChannel && !savedChannels.includes(curChannel)) {
        if (!savedChannels[0]) savedChannels[0] = curChannel;
        else if (!savedChannels[1]) savedChannels[1] = curChannel;
    }

    const payload = {
        channel: curChannel,
        streamHorizontal: inputStreamHoriz.value.trim(),
        streamVertical: inputStreamVert.value.trim(),
        savedChannels: savedChannels
    };

    if (inputNewPin.value.trim()) {
        payload.newPin = inputNewPin.value.trim();
        localStorage.setItem('streamer_pin', payload.newPin);
        inputNewPin.value = '';
    }

    socket.emit('set-config', payload);
    updateQuickSwitchButtons(curChannel);
    modalSettings.classList.add('hidden');
});

const btnReopenWelcome = document.getElementById('btn-reopen-welcome');
if (btnReopenWelcome) {
    btnReopenWelcome.addEventListener('click', () => {
        modalSettings.classList.add('hidden');
        appContent.classList.add('hidden');
        if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    });
}

btnForceCheck.addEventListener('click', () => {
    socket.emit('force-check');
    btnForceCheck.textContent = 'Checando...';
    setTimeout(() => { btnForceCheck.textContent = '🔄 Forçar Checagem'; }, 2000);
});

// Botões de Teste Visual
const btnTestNormal = document.getElementById('btn-test-normal');
const btnTestSuperchat = document.getElementById('btn-test-superchat');
const btnTestSub = document.getElementById('btn-test-sub');

if (btnTestNormal) {
    btnTestNormal.addEventListener('click', () => {
        socket.emit('simulate-test-message', {
            type: currentFilter === 'vertical' ? 'vertical' : 'horizontal',
            text: 'Testando chat mobile! Feed unificado e scroll funcionando 🚀',
            isSuperchat: false
        });
        modalSettings.classList.add('hidden');
    });
}

if (btnTestSuperchat) {
    btnTestSuperchat.addEventListener('click', () => {
        socket.emit('simulate-test-message', {
            type: currentFilter === 'vertical' ? 'vertical' : 'horizontal',
            text: 'Super Chat de Teste! Mandou bem demais na live!',
            isSuperchat: true
        });
        modalSettings.classList.add('hidden');
    });
}

if (btnTestSub) {
    btnTestSub.addEventListener('click', () => {
        socket.emit('simulate-test-message', {
            type: currentFilter === 'vertical' ? 'vertical' : 'horizontal',
            isSubscription: true
        });
        modalSettings.classList.add('hidden');
    });
}

// --- Manter Tela Sempre Ativa (Wake Lock / Anti-Bloqueio) ---
let wakeLock = null;
let wakeLockEnabled = localStorage.getItem('chat_wake_lock') !== 'false';
const btnToggleWake = document.getElementById('btn-toggle-wake');
const toggleWakeLock = document.getElementById('toggle-wake-lock');
let wakeVideo = null;
let isVideoWakeActive = false;

async function requestWakeLock() {
    if (!wakeLockEnabled) return;
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                updateWakeLockUI();
            });
            console.log('☀️ Wake Lock ativo: tela não irá bloquear.');
        } else {
            enableVideoWakeFallback();
        }
    } catch (err) {
        console.warn('Wake Lock fallback ativado:', err.message);
        enableVideoWakeFallback();
    }
    updateWakeLockUI();
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
    disableVideoWakeFallback();
    updateWakeLockUI();
}

function enableVideoWakeFallback() {
    if (!wakeVideo) {
        wakeVideo = document.createElement('video');
        wakeVideo.setAttribute('playsinline', '');
        wakeVideo.setAttribute('loop', '');
        wakeVideo.muted = true;
        wakeVideo.style.position = 'fixed';
        wakeVideo.style.top = '-9999px';
        wakeVideo.style.left = '-9999px';
        wakeVideo.style.width = '1px';
        wakeVideo.style.height = '1px';
        wakeVideo.style.opacity = '0.01';
        wakeVideo.src = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAABBtb292AAAAbW12aGQAAAAA1F9/4NRff+AAAA+gAAAAAAABAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAB0dHJhazAAAAA=';
        document.body.appendChild(wakeVideo);
    }
    wakeVideo.play().then(() => {
        isVideoWakeActive = true;
        updateWakeLockUI();
    }).catch(() => {});
}

function disableVideoWakeFallback() {
    if (wakeVideo) {
        wakeVideo.pause();
        isVideoWakeActive = false;
    }
}

function updateWakeLockUI() {
    const isActive = wakeLockEnabled && (wakeLock !== null || isVideoWakeActive);
    if (btnToggleWake) {
        btnToggleWake.classList.toggle('active', isActive);
        btnToggleWake.innerHTML = isActive 
            ? '<span id="wake-icon">☀️</span> <span id="wake-text">Tela Ativa</span>'
            : '<span id="wake-icon">🌙</span> <span id="wake-text">Tela Normal</span>';
    }
    if (toggleWakeLock) {
        toggleWakeLock.checked = wakeLockEnabled;
    }
}

if (btnToggleWake) {
    btnToggleWake.addEventListener('click', () => {
        wakeLockEnabled = !wakeLockEnabled;
        localStorage.setItem('chat_wake_lock', wakeLockEnabled);
        if (wakeLockEnabled) requestWakeLock();
        else releaseWakeLock();
    });
}

if (toggleWakeLock) {
    toggleWakeLock.addEventListener('change', (e) => {
        wakeLockEnabled = e.target.checked;
        localStorage.setItem('chat_wake_lock', wakeLockEnabled);
        if (wakeLockEnabled) requestWakeLock();
        else releaseWakeLock();
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockEnabled) {
        requestWakeLock();
    }
});

window.addEventListener('touchstart', () => requestWakeLock(), { once: true });
window.addEventListener('click', () => requestWakeLock(), { once: true });
requestWakeLock();

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

socket.on('connect', () => {
    socketStatusDot.className = 'dot dot-green';
    socketStatusText.textContent = 'Conectado';
    const savedPin = localStorage.getItem('streamer_pin') || '3006';
    if (savedPin) tryAuth(savedPin);
});

socket.on('disconnect', () => {
    socketStatusDot.className = 'dot dot-offline';
    socketStatusText.textContent = 'Reconectando...';
});

socket.on('status-update', (status) => {
    if (isAuthenticated) updateStatus(status);
});

socket.on('new-message', (msg) => {
    if (isAuthenticated) addMessage(msg, false);
});
