/* ========================================
   SYSTÈME DE LIVE STREAMING
   ======================================== */

if (!window.__streamingLoaded) {
    window.__streamingLoaded = true;

    let currentStream = null;
    let streamChannel = null;
    let chatChannel = null;
    let signalChannel = null;
    let viewerHeartbeat = null;
    let previewHeartbeat = null;
    let previewCanvas = null;
    let previewCtx = null;
    let previewInFlight = false;
    let lastPreviewStamp = 0;
    let peerConnections = new Map();
    let localMediaStream = null;
    let hostMicStream = null;
    let hostAudioContext = null;
    let activeStreamId = null;
    let isStreamHost = false;
    let pendingViewerJoins = new Set();
    let viewerCountInterval = null;
    let chatSyncInterval = null;
    let chatResubscribeTimer = null;
    let hostBadgeRefreshInterval = null;
    let lastChatCreatedAt = null;
    let currentVideoDeviceId = null;
    let lastCameraDeviceId = null;
    let isMicMuted = false;
    let isScreenSharing = false;
    let streamDurationInterval = null;
    let streamStartedAtMs = 0;
    let activeDisplayStream = null;
    let screenOverlayCameraStream = null;
    let screenCompositeCanvas = null;
    let screenCompositeCtx = null;
    let screenCompositeStream = null;
    let screenCompositeRaf = null;
    let screenCompositeDisplayVideo = null;
    let screenCompositeCameraVideo = null;
    let isScreenCompositeMode = false;
    let pendingMobileScreenShareActivation = false;
    let pendingMobileScreenShareCleanup = null;
    let isShareScreenRequestInFlight = false;
    const renderedChatMessageIds = new Set();
    const MOBILE_VIDEO_CONSTRAINTS = {
        width: { ideal: 960, max: 1280 },
        height: { ideal: 540, max: 720 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: { ideal: 'user' }
    };

function isSecureStreamingContext() {
    return (
        window.isSecureContext ||
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1'
    );
}

function resolveStreamStartMs(stream) {
    const raw =
        stream?.started_at ||
        stream?.startedAt ||
        stream?.created_at ||
        stream?.createdAt ||
        currentStream?.started_at ||
        currentStream?.startedAt ||
        currentStream?.created_at ||
        currentStream?.createdAt ||
        null;
    if (!raw) return 0;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : 0;
}

function formatStreamDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function stopStreamDurationTimer() {
    if (streamDurationInterval) {
        clearInterval(streamDurationInterval);
        streamDurationInterval = null;
    }
}

function renderLiveStatusWithTimer() {
    const status = document.getElementById('stream-status');
    if (!status || status.dataset.mode !== 'live') return;
    const baseLabel = status.dataset.baseLabel || '🔴 EN DIRECT';
    if (!streamStartedAtMs) {
        status.textContent = baseLabel;
        return;
    }
    const elapsed = Date.now() - streamStartedAtMs;
    status.textContent = `${baseLabel} • ${formatStreamDuration(elapsed)}`;
}

function startStreamDurationTimer(stream) {
    const resolved = resolveStreamStartMs(stream);
    if (resolved) {
        streamStartedAtMs = resolved;
    }
    stopStreamDurationTimer();
    renderLiveStatusWithTimer();
    streamDurationInterval = setInterval(renderLiveStatusWithTimer, 1000);
}

function setStreamStatusMode(mode, options = {}) {
    const status = document.getElementById('stream-status');
    if (!status) return;

    if (mode === 'live') {
        const host = options.host === true;
        const baseLabel = host ? '🔴 EN DIRECT (Vous diffusez)' : '🔴 EN DIRECT';
        status.dataset.mode = 'live';
        status.dataset.baseLabel = baseLabel;
        status.classList.add('live');
        startStreamDurationTimer(options.stream || currentStream);
        return;
    }

    stopStreamDurationTimer();
    status.dataset.mode = mode;
    status.dataset.baseLabel = '';
    if (mode === 'waiting') {
        status.textContent = '⏳ EN ATTENTE DU LIVE';
        status.classList.remove('live');
        return;
    }
    if (mode === 'ended') {
        status.textContent = '⏹️ LIVE TERMINÉ';
        status.classList.remove('live');
        return;
    }
}

// Créer une session de streaming
async function createStreamingSession(streamData) {
    try {
        const { data, error } = await supabase
            .from('streaming_sessions')
            .insert({
                user_id: currentUser.id,
                title: streamData.title,
                description: streamData.description,
                thumbnail_url: streamData.thumbnailUrl,
                status: 'live'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Afficher immédiatement le message côté client
        handleNewChatMessage(data);
        return { success: true, data: data };
        
    } catch (error) {
        console.error('Erreur création stream:', error);
        return { success: false, error: error.message };
    }
}

// Démarrer un stream
async function startStream(streamData) {
    try {
        // Créer la session
        const result = await createStreamingSession(streamData);
        if (!result.success) throw new Error(result.error);
        
        currentStream = result.data;
        
        // Enregistrer immédiatement la présence de l'hôte
        try {
            if (currentUser) {
                await supabase
                    .from('stream_viewers')
                    .upsert({
                        stream_id: currentStream.id,
                        user_id: currentUser.id,
                        last_seen: new Date().toISOString()
                    }, { onConflict: 'stream_id,user_id' });
            }
        } catch (error) {
            console.warn('Présence hôte non enregistrée (sera retentée via heartbeat):', error);
        }

        // S'abonner aux événements du stream
        subscribeToStream(currentStream.id);
        
        // Démarrer le heartbeat pour maintenir la présence
        startViewerHeartbeat(currentStream.id);
        startViewerCountSync(currentStream.id);
        
        return { success: true, stream: currentStream };
        
    } catch (error) {
        console.error('Erreur démarrage stream:', error);
        return { success: false, error: error.message };
    }
}

// Rejoindre un stream
async function joinStream(streamId) {
    try {
        // Enregistrer comme viewer
        const { error } = await supabase
            .from('stream_viewers')
            .upsert({
                stream_id: streamId,
                user_id: currentUser.id,
                last_seen: new Date().toISOString()
            }, { onConflict: 'stream_id,user_id' });
        
        if (error) {
            if (error.code === '23505' || error.status === 409) {
                // Conflit d'unicité: déjà enregistré comme viewer
                console.warn('Viewer déjà enregistré, conflit ignoré.');
            } else {
                throw error;
            }
        }
        
        // Récupérer les infos du stream
        const { data: stream, error: streamError } = await supabase
            .from('streaming_sessions')
            .select('*, users(id, name, avatar, plan, plan_status, plan_ends_at)')
            .eq('id', streamId)
            .single();
        
        if (streamError) throw streamError;
        
        currentStream = stream;
        
        // S'abonner aux événements
        subscribeToStream(streamId);
        
        // Démarrer le heartbeat
        startViewerHeartbeat(streamId);
        startViewerCountSync(streamId);
        
        return { success: true, stream: stream };
        
    } catch (error) {
        console.error('Erreur rejoindre stream:', error);
        return { success: false, error: error.message };
    }
}

// S'abonner aux événements du stream
function subscribeToStream(streamId) {
    subscribeToChat(streamId);
    
    // Canal pour les mises à jour du stream
    streamChannel = supabase
        .channel(`stream-${streamId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'streaming_sessions',
                filter: `id=eq.${streamId}`
            },
            (payload) => {
                handleStreamUpdate(payload.new);
            }
        )
        .subscribe();

    if (chatSyncInterval) {
        clearInterval(chatSyncInterval);
    }
    chatSyncInterval = setInterval(() => {
        if (!currentStream?.id) return;
        void fetchNewChatMessages(currentStream.id);
    }, 3000);
}

function teardownChatChannel() {
    if (!chatChannel) return;
    supabase.removeChannel(chatChannel);
    chatChannel = null;
}

function scheduleChatResubscribe(streamId) {
    if (!streamId || chatResubscribeTimer) return;
    chatResubscribeTimer = setTimeout(() => {
        chatResubscribeTimer = null;
        if (!currentStream?.id || currentStream.id !== streamId) return;
        subscribeToChat(streamId);
    }, 1200);
}

function subscribeToChat(streamId) {
    teardownChatChannel();
    chatChannel = supabase
        .channel(`stream-chat-${streamId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'stream_messages',
                filter: `stream_id=eq.${streamId}`
            },
            (payload) => {
                void handleNewChatMessage(payload.new);
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                void fetchNewChatMessages(streamId);
                return;
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                scheduleChatResubscribe(streamId);
            }
        });
}

// Envoyer un message dans le chat
async function sendChatMessage(message) {
    if (!currentStream) return { success: false, error: 'Pas de stream actif' };
    if (!currentUser) return { success: false, error: 'Utilisateur non connecté' };
    
    try {
        const { data, error } = await supabase
            .from('stream_messages')
            .insert({
                stream_id: currentStream.id,
                user_id: currentUser.id,
                message: message
            })
            .select('*, users(name, avatar)')
            .single();
        
        if (error) throw error;
        // Affichage immédiat côté émetteur (les doublons restent filtrés).
        void handleNewChatMessage(data);
        
        return { success: true, data: data };
        
    } catch (error) {
        console.error('Erreur envoi message:', error);
        return { success: false, error: error.message };
    }
}

// Charger l'historique du chat
async function loadChatHistory(streamId, limit = 50) {
    try {
        const { data, error } = await supabase
            .from('stream_messages')
            .select('*, users(name, avatar)')
            .eq('stream_id', streamId)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        
        const messages = data.reverse();
        messages.forEach(msg => {
            const key = getChatMessageKey(msg);
            if (key) renderedChatMessageIds.add(key);
        });
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            lastChatCreatedAt = lastMessage.created_at || lastChatCreatedAt;
        }
        return { success: true, messages };
        
    } catch (error) {
        console.error('Erreur chargement chat:', error);
        return { success: false, error: error.message };
    }
}

async function fetchNewChatMessages(streamId) {
    try {
        let query = supabase
            .from('stream_messages')
            .select('*, users(name, avatar)')
            .eq('stream_id', streamId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (lastChatCreatedAt) {
            // gte + déduplication évite les pertes si plusieurs messages partagent le même timestamp.
            query = query.gte('created_at', lastChatCreatedAt);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) return;

        data.forEach(msg => {
            void handleNewChatMessage(msg);
        });
    } catch (error) {
        console.warn('Chat sync fallback échoué:', error);
    }
}

function getChatMessageKey(message) {
    if (!message) return null;
    if (message.id) return String(message.id);
    const userId = message.user_id || 'u';
    const createdAt = message.created_at || '';
    const body = message.message || '';
    return `${userId}:${createdAt}:${body}`;
}

// Gérer un nouveau message de chat
async function handleNewChatMessage(message) {
    const key = getChatMessageKey(message);
    if (key && renderedChatMessageIds.has(key)) return;
    if (key) renderedChatMessageIds.add(key);

    if (!message.users && message.user_id) {
        try {
            const { data } = await supabase
                .from('users')
                .select('name, avatar')
                .eq('id', message.user_id)
                .single();
            if (data) {
                message.users = data;
            }
        } catch (error) {
            // Fallback silencieux
        }
    }

    if (message.created_at) {
        lastChatCreatedAt = message.created_at;
    }

    if (window.liveChatStore) {
        window.liveChatStore.push(message);
        return;
    }

    const chatContainer = document.getElementById('stream-chat-messages');
    if (!chatContainer) return;

    const messageElement = createChatMessageElement(message);
    chatContainer.appendChild(messageElement);
    
    // Scroll vers le bas
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Créer un élément de message de chat
function createChatMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    const isOwnMessage = message.user_id === currentUser?.id;
    if (isOwnMessage) div.classList.add('own-message');
    
    const username = message.users?.name || message.user_name || 'Utilisateur';
    const userId = message.users?.id || message.user_id;
    const usernameHtml = typeof window.renderUsernameWithBadge === 'function' && userId
        ? window.renderUsernameWithBadge(username, userId)
        : escapeHtml(username);

    div.innerHTML = `
        <img src="${message.users?.avatar || 'https://placehold.co/32'}" class="chat-avatar" alt="${message.users?.name}">
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-username">${usernameHtml}</span>
                <span class="chat-timestamp">${formatChatTime(message.created_at)}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(message.message)}</div>
        </div>
    `;
    
    return div;
}

// Gérer une mise à jour du stream
function handleStreamUpdate(stream) {
    currentStream = stream;
    
    // Mettre à jour l'UI
    updateStreamUI(stream);
    
    // Si le stream est terminé
    if (stream.status === 'ended') {
        handleStreamEnded();
    }
}

// Mettre à jour l'UI du stream
function updateStreamUI(stream) {
    const viewerCount = document.getElementById('stream-viewer-count');
    if (viewerCount) {
        viewerCount.textContent = stream.viewer_count || 0;
    }
    
    const chatViewerCount = document.getElementById('chat-viewer-count');
    if (chatViewerCount) {
        chatViewerCount.textContent = stream.viewer_count || 0;
    }
    
    if ((stream?.status || 'live') === 'live') {
        setStreamStatusMode('live', {
            host: Boolean(isStreamHost),
            stream: stream || currentStream
        });
    } else {
        setStreamStatusMode('ended');
    }
}

async function getViewerCountForStream(streamId) {
    if (!streamId) return null;
    try {
        const cutoffIso = new Date(Date.now() - 30000).toISOString();
        const { count, error } = await supabase
            .from('stream_viewers')
            .select('user_id', { count: 'exact', head: true })
            .eq('stream_id', streamId)
            .gte('last_seen', cutoffIso);
        if (error) throw error;
        return typeof count === 'number' ? count : null;
    } catch (error) {
        console.error('Erreur récupération viewers:', error);
        return null;
    }
}

async function syncViewerCount(streamId, { updateSession = false } = {}) {
    const count = await getViewerCountForStream(streamId);
    if (count === null) return;

    if (currentStream) {
        currentStream.viewer_count = count;
    }
    updateStreamUI({ viewer_count: count, status: currentStream?.status || 'live' });

    if (updateSession) {
        try {
            await supabase
                .from('streaming_sessions')
                .update({ viewer_count: count })
                .eq('id', streamId);
        } catch (error) {
            console.error('Erreur update viewer_count:', error);
        }
    }
}

function startViewerCountSync(streamId) {
    if (viewerCountInterval) {
        clearInterval(viewerCountInterval);
        viewerCountInterval = null;
    }
    if (chatSyncInterval) {
        clearInterval(chatSyncInterval);
        chatSyncInterval = null;
    }
    if (chatResubscribeTimer) {
        clearTimeout(chatResubscribeTimer);
        chatResubscribeTimer = null;
    }
    if (hostBadgeRefreshInterval) {
        clearInterval(hostBadgeRefreshInterval);
        hostBadgeRefreshInterval = null;
    }
    const shouldUpdateSession = !!isStreamHost;
    syncViewerCount(streamId, { updateSession: shouldUpdateSession });
    const intervalMs = shouldUpdateSession ? 10000 : 15000;
    viewerCountInterval = setInterval(() => {
        syncViewerCount(streamId, { updateSession: shouldUpdateSession });
    }, intervalMs);
}

async function finalizeCurrentHostLiveOnServer(endedAtIso = new Date().toISOString()) {
    if (!currentStream?.id || !isStreamHost) {
        return { success: false, skipped: true };
    }

    const ownerId = currentUser?.id || currentStream?.user_id || null;

    try {
        let query = supabase
            .from('streaming_sessions')
            .update({
                status: 'ended',
                ended_at: endedAtIso
            })
            .eq('id', currentStream.id)
            .eq('status', 'live');

        if (ownerId) {
            query = query.eq('user_id', ownerId);
        }

        const { error } = await query;
        if (error) throw error;

        currentStream.status = 'ended';
        currentStream.ended_at = endedAtIso;

        return { success: true };
    } catch (error) {
        return { success: false, error: error?.message || String(error) };
    }
}

// Terminer un stream
async function endStream() {
    if (!currentStream) return { success: false, error: 'Pas de stream actif' };
    
    try {
        const result = await finalizeCurrentHostLiveOnServer();
        if (!result.success) {
            throw new Error(result.error || 'Impossible de terminer le live');
        }
        
        // Nettoyer
        cleanupStream();
        
        return { success: true };
        
    } catch (error) {
        console.error('Erreur fin stream:', error);
        return { success: false, error: error.message };
    }
}

// Quitter un stream
function leaveStream() {
    if (isStreamHost && currentStream?.id) {
        // Best effort: try to close the live server-side before cleanup/navigation.
        void finalizeCurrentHostLiveOnServer().then((result) => {
            if (!result.success && !result.skipped) {
                console.warn('Fermeture live à la sortie non confirmée:', result.error || result);
            }
        });
    }

    cleanupStream();
    
    // Rediriger vers la page discover
    if (typeof navigateTo === 'function') {
        navigateTo('discover');
    }
}

// Nettoyer les ressources du stream
function cleanupStream() {
    // Arrêter le heartbeat
    if (viewerHeartbeat) {
        clearInterval(viewerHeartbeat);
        viewerHeartbeat = null;
    }
    if (viewerCountInterval) {
        clearInterval(viewerCountInterval);
        viewerCountInterval = null;
    }
    if (chatSyncInterval) {
        clearInterval(chatSyncInterval);
        chatSyncInterval = null;
    }
    if (chatResubscribeTimer) {
        clearTimeout(chatResubscribeTimer);
        chatResubscribeTimer = null;
    }
    
    // Se désabonner des canaux
    teardownChatChannel();
    
    if (streamChannel) {
        supabase.removeChannel(streamChannel);
        streamChannel = null;
    }
    
    if (signalChannel) {
        supabase.removeChannel(signalChannel);
        signalChannel = null;
    }
    
    if (previewHeartbeat) {
        clearInterval(previewHeartbeat);
        previewHeartbeat = null;
    }
    previewCanvas = null;
    previewCtx = null;
    previewInFlight = false;
    lastPreviewStamp = 0;
    cleanupScreenComposite();
    clearPendingMobileScreenShareActivation();

    if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
    }

    if (hostMicStream) {
        hostMicStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        hostMicStream = null;
    }

    if (hostAudioContext) {
        try { hostAudioContext.close(); } catch (e) {}
        hostAudioContext = null;
    }
    stopStreamDurationTimer();
    streamStartedAtMs = 0;
    
    peerConnections.forEach(pc => {
        try { pc.close(); } catch (e) {}
    });
    peerConnections.clear();
    localMediaStream = null;
    activeStreamId = null;
    isStreamHost = false;
    pendingViewerJoins.clear();
    renderedChatMessageIds.clear();
    lastChatCreatedAt = null;
    
    currentStream = null;
}

function getRtcConfig() {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
}

function sendSignal(payload) {
    if (!signalChannel) return;
    signalChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: payload
    });
}

function createPeerConnection(peerId, isHostSide) {
    const pc = new RTCPeerConnection(getRtcConfig());
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({
                type: 'ice',
                streamId: activeStreamId,
                from: currentUser?.id || null,
                to: peerId,
                candidate: event.candidate
            });
        }
    };
    
    pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
            try { pc.close(); } catch (e) {}
            peerConnections.delete(peerId);
        }
    };
    
    if (!isHostSide) {
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams || [];
            if (!remoteStream) return;
            const video = document.getElementById('stream-video');
            if (video) {
                video.srcObject = remoteStream;
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                syncAudioButtonState(true);
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
            const hasAudio = remoteStream.getAudioTracks().length > 0;
            if (hasAudio) {
                showUnmuteOverlay();
            } else if (window.ToastManager) {
                ToastManager.info(
                    'Audio du live',
                    'Aucune piste audio reçue. Vérifiez que l’hôte partage bien le micro ou l’audio de l’écran.'
                );
            }
            setViewerWaiting(false);
        };
    }
    
    return pc;
}

async function handleViewerJoin(viewerId) {
    if (!viewerId) return;
    if (!localMediaStream) {
        pendingViewerJoins.add(viewerId);
        return;
    }
    
    const pc = createPeerConnection(viewerId, true);
    peerConnections.set(viewerId, pc);
    
    localMediaStream.getTracks().forEach(track => {
        pc.addTrack(track, localMediaStream);
    });
    
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
            type: 'offer',
            streamId: activeStreamId,
            from: currentUser?.id || null,
            to: viewerId,
            sdp: pc.localDescription
        });
    } catch (error) {
        console.error('Erreur création offer WebRTC:', error);
    }
}

async function handleOffer(payload) {
    const hostId = payload?.from;
    if (!hostId) return;
    
    let pc = peerConnections.get(hostId);
    if (!pc) {
        pc = createPeerConnection(hostId, false);
        peerConnections.set(hostId, pc);
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
            type: 'answer',
            streamId: activeStreamId,
            from: currentUser?.id || null,
            to: hostId,
            sdp: pc.localDescription
        });
    } catch (error) {
        console.error('Erreur réponse offer WebRTC:', error);
    }
}

async function handleAnswer(payload) {
    const viewerId = payload?.from;
    if (!viewerId) return;
    const pc = peerConnections.get(viewerId);
    if (!pc) return;
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    } catch (error) {
        console.error('Erreur setRemoteDescription answer:', error);
    }
}

async function handleIce(payload) {
    const peerId = payload?.from;
    if (!peerId) return;
    const pc = peerConnections.get(peerId);
    if (!pc) return;
    try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (error) {
        console.error('Erreur ICE candidate:', error);
    }
}

function initWebRtcSignaling(streamId, isHost) {
    if (!streamId) return;
    activeStreamId = streamId;
    isStreamHost = isHost;
    
    if (signalChannel) {
        supabase.removeChannel(signalChannel);
    }
    
    signalChannel = supabase
        .channel(`stream-signal-${streamId}`)
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
            if (!payload || payload.streamId !== activeStreamId) return;
            if (payload.to && payload.to !== currentUser?.id) return;
            
            if (payload.type === 'viewer-join' && isStreamHost) {
                handleViewerJoin(payload.from);
            } else if (payload.type === 'offer' && !isStreamHost) {
                handleOffer(payload);
            } else if (payload.type === 'answer' && isStreamHost) {
                handleAnswer(payload);
            } else if (payload.type === 'ice') {
                handleIce(payload);
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED' && !isStreamHost) {
                sendSignal({
                    type: 'viewer-join',
                    streamId: activeStreamId,
                    from: currentUser?.id || null,
                    to: null
                });
            }
        });
}

// Démarrer la mise à jour des previews (frames) pour Discover
function startLivePreviewUpdates(streamId) {
    if (!streamId || !supabase) return;
    if (previewHeartbeat) clearInterval(previewHeartbeat);
    previewCanvas = previewCanvas || document.createElement('canvas');
    previewCtx = previewCtx || previewCanvas.getContext('2d', { willReadFrequently: true });

    const updatePreview = async () => {
        if (previewInFlight) return;
        if (!currentStream || currentStream.id !== streamId) return;
        if (document.hidden) return;

        const video = document.getElementById('stream-video');
        if (!video || video.readyState < 2) return;

        const now = Date.now();
        if (now - lastPreviewStamp < 3000) return;
        lastPreviewStamp = now;

        const maxWidth = 480;
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const scale = Math.min(1, maxWidth / vw);
        const tw = Math.max(1, Math.floor(vw * scale));
        const th = Math.max(1, Math.floor(vh * scale));

        previewCanvas.width = tw;
        previewCanvas.height = th;
        previewCtx.drawImage(video, 0, 0, tw, th);

        let dataUrl = '';
        try {
            dataUrl = previewCanvas.toDataURL('image/jpeg', 0.65);
        } catch (e) {
            return;
        }

        previewInFlight = true;
        try {
            await supabase
                .from('streaming_sessions')
                .update({ thumbnail_url: dataUrl })
                .eq('id', streamId);
        } catch (error) {
            console.error('Erreur update preview live:', error);
        } finally {
            previewInFlight = false;
        }
    };

    // Premier push rapide
    setTimeout(updatePreview, 800);
    previewHeartbeat = setInterval(updatePreview, 3500);
}

// Démarrer le heartbeat pour maintenir la présence
function startViewerHeartbeat(streamId) {
    const touch = async () => {
        if (!currentUser) return;
        try {
            await supabase
                .from('stream_viewers')
                .upsert(
                    {
                        stream_id: streamId,
                        user_id: currentUser.id,
                        last_seen: new Date().toISOString()
                    },
                    { onConflict: 'stream_id,user_id' } // sinon le heartbeat échoue sur la contrainte UNIQUE et n'actualise plus last_seen
                );
        } catch (error) {
            console.error('Erreur heartbeat:', error);
        }
    };
    // Premier ping immédiat
    touch();
    // Mettre à jour toutes les 20 secondes
    viewerHeartbeat = setInterval(touch, 20000);
}

// Gérer la fin du stream
function handleStreamEnded() {
    setChatEnabled(false);
    if (chatSyncInterval) {
        clearInterval(chatSyncInterval);
        chatSyncInterval = null;
    }

    setStreamStatusMode('ended');

    const followBtn = document.getElementById('follow-btn');
    const shareBtn = document.getElementById('share-btn');
    const buttons = [followBtn, shareBtn].filter(Boolean);
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
    });

    showStreamEndedMessage();
}

// Récupérer les streams en direct
async function getLiveStreams() {
    try {
        const { data, error } = await supabase
            .from('streaming_sessions')
            .select('*, users(id, name, avatar, plan, plan_status, plan_ends_at)')
            .eq('status', 'live')
            .order('started_at', { ascending: false });
        
        if (error) throw error;
        
        return { success: true, streams: data };
        
    } catch (error) {
        console.error('Erreur récupération streams:', error);
        return { success: false, error: error.message };
    }
}

// Formater le temps pour le chat
function formatChatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Échapper le HTML pour éviter les XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function syncAudioButtonState(isMuted) {
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (!audioBtn) return;
    audioBtn.classList.toggle('active', !isMuted);
}

function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function clearPendingMobileScreenShareActivation() {
    if (typeof pendingMobileScreenShareCleanup === 'function') {
        pendingMobileScreenShareCleanup();
    }
    pendingMobileScreenShareCleanup = null;
    pendingMobileScreenShareActivation = false;
}

function queueMobileScreenShareActivation() {
    if (!isMobileDevice() || !navigator.mediaDevices?.getDisplayMedia) return;
    if (pendingMobileScreenShareActivation || isScreenSharing) return;

    pendingMobileScreenShareActivation = true;

    const trigger = () => {
        clearPendingMobileScreenShareActivation();
        if (!isScreenSharing) {
            void shareScreen();
        }
    };

    const onTouchEnd = () => trigger();
    const onClick = () => trigger();

    document.addEventListener('touchend', onTouchEnd, { once: true });
    document.addEventListener('click', onClick, { once: true });

    pendingMobileScreenShareCleanup = () => {
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('click', onClick);
    };

    if (window.ToastManager) {
        ToastManager.info(
            'Partage d’écran',
            'Touchez l’écran pour confirmer le partage sur mobile.',
        );
    }
}

function toggleAudio() {
    const video = document.getElementById('stream-video');
    if (!video) return;
    video.muted = !video.muted;
    syncAudioButtonState(video.muted);
    if (!video.muted) {
        hideUnmuteOverlay();
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }
}

function showUnmuteOverlay() {
    const overlay = document.getElementById('unmute-overlay');
    const video = document.getElementById('stream-video');
    if (!overlay || !video) return;
    if (video.muted) {
        overlay.style.display = 'flex';
    }
}

function hideUnmuteOverlay() {
    const overlay = document.getElementById('unmute-overlay');
    if (overlay) overlay.style.display = 'none';
}

function enableStreamAudio() {
    const video = document.getElementById('stream-video');
    if (!video) return;
    video.muted = false;
    syncAudioButtonState(false);
    hideUnmuteOverlay();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
}

function updateMicButtonState() {
    const micBtn = document.getElementById('mute-mic-btn');
    if (!micBtn) return;
    micBtn.classList.toggle('active', isMicMuted);
    const label = micBtn.querySelector('.btn-text');
    if (label) {
        label.textContent = isMicMuted ? 'Micro coupé' : 'Muet';
    }
}

function updateScreenShareButtonState() {
    const shareBtn = document.getElementById('share-screen-btn');
    if (!shareBtn) return;
    shareBtn.classList.toggle('active', isScreenSharing);
    const label = shareBtn.querySelector('.btn-text');
    if (label) {
        label.textContent = isScreenSharing ? 'Arrêter écran' : 'Écran';
    }
}

function stopMediaStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
    });
}

function cleanupScreenComposite({ keepDisplay = false, keepOverlayCamera = false } = {}) {
    if (screenCompositeRaf) {
        cancelAnimationFrame(screenCompositeRaf);
        screenCompositeRaf = null;
    }

    if (screenCompositeDisplayVideo) {
        try { screenCompositeDisplayVideo.pause(); } catch (e) {}
        screenCompositeDisplayVideo.srcObject = null;
    }
    if (screenCompositeCameraVideo) {
        try { screenCompositeCameraVideo.pause(); } catch (e) {}
        screenCompositeCameraVideo.srcObject = null;
    }

    if (screenCompositeStream) {
        stopMediaStream(screenCompositeStream);
        screenCompositeStream = null;
    }

    if (!keepDisplay && activeDisplayStream) {
        stopMediaStream(activeDisplayStream);
        activeDisplayStream = null;
    }
    if (!keepOverlayCamera && screenOverlayCameraStream) {
        stopMediaStream(screenOverlayCameraStream);
        screenOverlayCameraStream = null;
    }

    screenCompositeCanvas = null;
    screenCompositeCtx = null;
    isScreenCompositeMode = false;
}

function waitVideoReady(videoEl) {
    return new Promise(resolve => {
        if (videoEl.readyState >= 2) {
            resolve();
            return;
        }
        const onLoaded = () => {
            videoEl.removeEventListener('loadedmetadata', onLoaded);
            resolve();
        };
        videoEl.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
}

async function buildScreenCameraCompositeTrack(displayStream, cameraStream) {
    const displayTrack = displayStream?.getVideoTracks?.()[0];
    const cameraTrack = cameraStream?.getVideoTracks?.()[0];
    if (!displayTrack || !cameraTrack) return null;

    screenCompositeDisplayVideo = screenCompositeDisplayVideo || document.createElement('video');
    screenCompositeCameraVideo = screenCompositeCameraVideo || document.createElement('video');
    const displayVideo = screenCompositeDisplayVideo;
    const cameraVideo = screenCompositeCameraVideo;

    displayVideo.srcObject = displayStream;
    cameraVideo.srcObject = cameraStream;
    displayVideo.muted = true;
    cameraVideo.muted = true;
    displayVideo.playsInline = true;
    cameraVideo.playsInline = true;

    const playDisplay = displayVideo.play();
    const playCamera = cameraVideo.play();
    if (playDisplay && typeof playDisplay.catch === 'function') playDisplay.catch(() => {});
    if (playCamera && typeof playCamera.catch === 'function') playCamera.catch(() => {});
    await Promise.all([waitVideoReady(displayVideo), waitVideoReady(cameraVideo)]);

    const settings = displayTrack.getSettings?.() || {};
    const width = Number(settings.width) || displayVideo.videoWidth || 1280;
    const height = Number(settings.height) || displayVideo.videoHeight || 720;

    screenCompositeCanvas = screenCompositeCanvas || document.createElement('canvas');
    screenCompositeCanvas.width = width;
    screenCompositeCanvas.height = height;
    screenCompositeCtx = screenCompositeCtx || screenCompositeCanvas.getContext('2d');
    const ctx = screenCompositeCtx;
    if (!ctx) return null;

    const draw = () => {
        if (!activeDisplayStream || !screenOverlayCameraStream) return;
        ctx.drawImage(displayVideo, 0, 0, width, height);

        const pipWidth = Math.floor(width * 0.24);
        const ratio = cameraVideo.videoWidth && cameraVideo.videoHeight
            ? cameraVideo.videoWidth / cameraVideo.videoHeight
            : 16 / 9;
        const pipHeight = Math.floor(pipWidth / Math.max(0.1, ratio));
        const margin = Math.max(14, Math.floor(width * 0.012));
        const x = width - pipWidth - margin;
        const y = height - pipHeight - margin;

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x - 4, y - 4, pipWidth + 8, pipHeight + 8);
        ctx.drawImage(cameraVideo, x, y, pipWidth, pipHeight);

        screenCompositeRaf = requestAnimationFrame(draw);
    };
    if (screenCompositeRaf) {
        cancelAnimationFrame(screenCompositeRaf);
        screenCompositeRaf = null;
    }
    draw();

    screenCompositeStream = screenCompositeCanvas.captureStream(30);
    return screenCompositeStream.getVideoTracks()[0] || null;
}

function setHostVideoTrack(newTrack, options = {}) {
    if (!newTrack) return;
    const stopPreviousTrack = options.stopPreviousTrack !== false;
    if (!localMediaStream) {
        localMediaStream = new MediaStream();
    }

    const currentTrack = localMediaStream.getVideoTracks()[0];
    if (currentTrack && currentTrack !== newTrack) {
        localMediaStream.removeTrack(currentTrack);
        if (stopPreviousTrack) {
            try { currentTrack.stop(); } catch (e) {}
        }
    }

    if (!localMediaStream.getVideoTracks().includes(newTrack)) {
        localMediaStream.addTrack(newTrack);
    }

    replaceTrackForPeers('video', newTrack);

    const video = document.getElementById('stream-video');
    if (video) {
        video.srcObject = localMediaStream;
    }
}

async function requestOverlayCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const constraints = lastCameraDeviceId
        ? { video: { deviceId: { exact: lastCameraDeviceId } }, audio: false }
        : {
            video: isMobileDevice()
                ? { ...MOBILE_VIDEO_CONSTRAINTS }
                : {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
            audio: false
        };
    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        return null;
    }
}

async function stopScreenShareAndRestoreCamera() {
    cleanupScreenComposite();
    isScreenSharing = false;
    updateScreenShareButtonState();
    try {
        if (lastCameraDeviceId) {
            await startCameraStream(lastCameraDeviceId);
        } else {
            await startCameraStream();
        }
    } catch (error) {
        console.warn('Retour caméra impossible après arrêt écran:', error);
    }
}

function replaceTrackForPeers(kind, newTrack) {
    peerConnections.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === kind);
        if (sender) {
            sender.replaceTrack(newTrack).catch(err => {
                console.warn('replaceTrack échoué:', err);
            });
        }
    });
}

async function startCameraStream(deviceId = null) {
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (isScreenSharing || activeDisplayStream || screenCompositeStream) {
        cleanupScreenComposite();
    }
    const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : {
            video: isMobileDevice()
                ? { ...MOBILE_VIDEO_CONSTRAINTS }
                : {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
            audio: false
        };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    setHostVideoTrack(newTrack, { stopPreviousTrack: true });
    currentVideoDeviceId = newTrack.getSettings?.().deviceId || deviceId || null;
    lastCameraDeviceId = currentVideoDeviceId || lastCameraDeviceId;
    isScreenSharing = false;
    isScreenCompositeMode = false;
    updateScreenShareButtonState();
}

async function switchCamera() {
    if (!localMediaStream || !navigator.mediaDevices?.enumerateDevices) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    if (videoInputs.length === 0) return;

    const currentTrack = localMediaStream.getVideoTracks()[0];
    const currentId = currentTrack?.getSettings?.().deviceId || currentVideoDeviceId;
    const currentIndex = videoInputs.findIndex(d => d.deviceId === currentId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % videoInputs.length;
    const nextDevice = videoInputs[nextIndex];
    if (!nextDevice) return;

    await startCameraStream(nextDevice.deviceId);
}

function toggleMicMute() {
    if (!localMediaStream) return;
    const audioTracks = localMediaStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    isMicMuted = !isMicMuted;
    audioTracks.forEach(track => {
        track.enabled = !isMicMuted;
    });
    updateMicButtonState();
}

async function shareScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    if (isShareScreenRequestInFlight) return;
    if (isScreenSharing) {
        await stopScreenShareAndRestoreCamera();
        return;
    }
    isShareScreenRequestInFlight = true;
    clearPendingMobileScreenShareActivation();
    try {
        cleanupScreenComposite();
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
        });
        const displayTrack = displayStream.getVideoTracks()[0];
        if (!displayTrack) return;

        activeDisplayStream = displayStream;
        let overlayStream = null;
        const existingCameraTrack = localMediaStream?.getVideoTracks?.()[0];
        if (existingCameraTrack && !isScreenSharing) {
            overlayStream = new MediaStream([existingCameraTrack.clone()]);
        } else {
            overlayStream = await requestOverlayCameraStream();
        }
        screenOverlayCameraStream = overlayStream;
        const overlayTrack = overlayStream?.getVideoTracks?.()[0];
        const overlayDeviceId = overlayTrack?.getSettings?.().deviceId || null;
        if (overlayDeviceId) {
            lastCameraDeviceId = overlayDeviceId;
        }

        let outgoingVideoTrack = displayTrack;
        if (overlayStream?.getVideoTracks?.().length) {
            const compositeTrack = await buildScreenCameraCompositeTrack(displayStream, overlayStream);
            if (compositeTrack) {
                outgoingVideoTrack = compositeTrack;
                isScreenCompositeMode = true;
            }
        }

        setHostVideoTrack(outgoingVideoTrack, { stopPreviousTrack: true });

        isScreenSharing = true;
        updateScreenShareButtonState();

        displayTrack.onended = () => {
            void stopScreenShareAndRestoreCamera();
        };
    } catch (error) {
        console.warn('Partage écran annulé ou impossible:', error);
        const needGestureRetry =
            isMobileDevice() &&
            (error?.name === 'NotAllowedError' ||
                error?.name === 'InvalidStateError');
        if (needGestureRetry) {
            queueMobileScreenShareActivation();
        } else if (window.ToastManager) {
            ToastManager.error(
                'Partage d’écran',
                'Impossible de démarrer le partage pour le moment.',
            );
        }
    } finally {
        isShareScreenRequestInFlight = false;
    }
}

function setupHostControls() {
    const endBtn = document.getElementById('end-stream-btn');
    const switchBtn = document.getElementById('switch-camera-btn');
    const micBtn = document.getElementById('mute-mic-btn');
    const shareBtn = document.getElementById('share-screen-btn');

    if (endBtn && !endBtn.dataset.bound) {
        endBtn.dataset.bound = 'true';
        endBtn.addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment arrêter le live ?')) {
                try {
                    endBtn.disabled = true;
                    endBtn.style.opacity = '0.7';
                    const result = await endStream();
                    if (!result || !result.success) {
                        const message = result?.error || 'Impossible de terminer le live';
                        console.error('Fin du live échouée:', message);
                        if (window.ToastManager) {
                            ToastManager.error('Erreur', message);
                        } else {
                            alert(message);
                        }
                        endBtn.disabled = false;
                        endBtn.style.opacity = '';
                        return;
                    }
                    if (localMediaStream) {
                        localMediaStream.getTracks().forEach(track => track.stop());
                    }
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error('Erreur bouton fin de live:', error);
                    if (window.ToastManager) {
                        ToastManager.error('Erreur', error?.message || 'Impossible de terminer le live');
                    }
                    endBtn.disabled = false;
                    endBtn.style.opacity = '';
                }
            }
        });
    }

    if (shareBtn && !navigator.mediaDevices?.getDisplayMedia) {
        shareBtn.disabled = true;
        shareBtn.classList.add('disabled');
        shareBtn.title = 'Partage écran indisponible sur ce navigateur/appareil';
    }

    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            switchCamera().catch(err => console.error('Switch camera error:', err));
        });
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => toggleMicMute());
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (shareBtn.disabled) return;
            shareScreen();
        });
    }

    updateMicButtonState();
    updateScreenShareButtonState();

    if (switchBtn && navigator.mediaDevices?.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                if (videoInputs.length < 2) {
                    switchBtn.disabled = true;
                    switchBtn.classList.add('disabled');
                    switchBtn.title = 'Une seule caméra détectée';
                }
            })
            .catch(() => {});
    }
}

function closeViewerListModal() {
    const modal = document.getElementById('viewer-list-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

async function openViewerListModal() {
    const modal = document.getElementById('viewer-list-modal');
    const body = document.getElementById('viewer-list-body');
    if (!modal || !body || !currentStream?.id) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    body.innerHTML = '<div class="viewer-list-empty">Chargement...</div>';

    try {
        const cutoffIso = new Date(Date.now() - 30000).toISOString();
        const { data, error } = await supabase
            .from('stream_viewers')
            .select('user_id, users(name, avatar)')
            .eq('stream_id', currentStream.id)
            .gte('last_seen', cutoffIso);
        if (error) throw error;
        const viewers = data || [];
        if (viewers.length === 0) {
            body.innerHTML = '<div class="viewer-list-empty">Aucun viewer actif</div>';
            return;
        }
        body.innerHTML = viewers.map(v => {
            const name = v.users?.name || 'Utilisateur';
            const avatar = v.users?.avatar || 'https://placehold.co/64';
            const userId = v.user_id || null;
            const nameHtml = typeof window.renderUsernameWithBadge === 'function' && userId
                ? window.renderUsernameWithBadge(name, userId)
                : escapeHtml(name);
            return `
                <div class="viewer-list-item">
                    <img class="viewer-list-avatar" src="${avatar}" alt="${name}">
                    <div class="viewer-list-name">${nameHtml}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Erreur viewers list:', error);
        body.innerHTML = '<div class="viewer-list-empty">Impossible de charger la liste</div>';
    }
}

// Configurer les médias du diffuseur (Host)
async function setupBroadcasterMedia(options = {}) {
    try {
        const source = options.source || 'camera';
        cleanupScreenComposite();
        clearPendingMobileScreenShareActivation();
        let stream = null;
        const isMobile = isMobileDevice();
        if (!isSecureStreamingContext()) {
            const msg = 'Le live nécessite HTTPS (ou localhost) pour accéder à la caméra/micro sur mobile.';
            console.warn(msg);
            if (window.ToastManager) {
                ToastManager.error('Sécurité requise', msg);
            } else {
                alert(msg);
            }
        }

        const requestUserMedia = async (constraints) => {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (error) {
                if (constraints.audio) {
                    try {
                        const fallback = { ...constraints, audio: false };
                        const streamNoAudio = await navigator.mediaDevices.getUserMedia(fallback);
                        if (window.ToastManager) {
                            ToastManager.info('Micro désactivé', 'Live lancé sans audio');
                        }
                        return streamNoAudio;
                    } catch (fallbackError) {
                        throw error;
                    }
                }
                throw error;
            }
        };

        const requestDisplayMedia = async (constraints) => {
            try {
                return await navigator.mediaDevices.getDisplayMedia(constraints);
            } catch (error) {
                if (constraints.audio) {
                    try {
                        const fallback = { ...constraints, audio: false };
                        const streamNoAudio = await navigator.mediaDevices.getDisplayMedia(fallback);
                        if (window.ToastManager) {
                            ToastManager.info('Micro désactivé', 'Partage d\'écran sans audio');
                        }
                        return streamNoAudio;
                    } catch (fallbackError) {
                        throw error;
                    }
                }
                throw error;
            }
        };

        const requestMicStream = async () => {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } catch (error) {
                return null;
            }
        };

        if (source === 'screen' && navigator.mediaDevices.getDisplayMedia) {
            try {
                const displayConstraints = isMobile
                    ? { video: true, audio: false }
                    : {
                          video: {
                              width: { ideal: 1920 },
                              height: { ideal: 1080 },
                              frameRate: { ideal: 30 }
                          },
                          audio: true
                      };
                const screenStream = await requestDisplayMedia(displayConstraints);
                activeDisplayStream = screenStream;

                const micStream = await requestMicStream();
                if (!micStream) {
                    console.warn('Micro non disponible pour le partage d\'écran');
                }

                const screenAudioTracks = screenStream.getAudioTracks();
                const micAudioTracks = micStream ? micStream.getAudioTracks() : [];
                const hasScreenAudio = screenAudioTracks.length > 0;
                const hasMicAudio = micAudioTracks.length > 0;
                const AudioCtx = window.AudioContext || window.webkitAudioContext;

                if (hasScreenAudio || hasMicAudio) {
                    const mergedStream = new MediaStream();
                    screenStream.getVideoTracks().forEach(track => mergedStream.addTrack(track));

                    if (hasScreenAudio && hasMicAudio && AudioCtx) {
                        try {
                            const audioContext = new AudioCtx();
                            const destination = audioContext.createMediaStreamDestination();
                            audioContext.createMediaStreamSource(screenStream).connect(destination);
                            audioContext.createMediaStreamSource(micStream).connect(destination);
                            const mixedTrack = destination.stream.getAudioTracks()[0];
                            if (mixedTrack) {
                                mergedStream.addTrack(mixedTrack);
                                hostAudioContext = audioContext;
                            } else {
                                const fallbackTrack = micAudioTracks[0] || screenAudioTracks[0];
                                if (fallbackTrack) mergedStream.addTrack(fallbackTrack);
                                audioContext.close();
                            }
                        } catch (error) {
                            console.warn('Mix audio impossible, fallback:', error);
                            const fallbackTrack = micAudioTracks[0] || screenAudioTracks[0];
                            if (fallbackTrack) mergedStream.addTrack(fallbackTrack);
                        }
                    } else {
                        const fallbackTrack = micAudioTracks[0] || screenAudioTracks[0];
                        if (fallbackTrack) mergedStream.addTrack(fallbackTrack);
                    }

                    stream = mergedStream;
                } else {
                    stream = screenStream;
                    if (window.ToastManager) {
                        ToastManager.info('Audio indisponible', 'Activez le micro ou cochez "Partager l\'audio" pendant le partage d\'écran.');
                    }
                }

                hostMicStream = micStream;

                // Ajouter caméra + écran dans un seul flux vidéo (PiP)
                const overlayCamera = await requestOverlayCameraStream();
                if (overlayCamera?.getVideoTracks?.().length) {
                    screenOverlayCameraStream = overlayCamera;
                    const overlayTrack = overlayCamera.getVideoTracks()[0];
                    const overlayDeviceId = overlayTrack?.getSettings?.().deviceId || null;
                    if (overlayDeviceId) {
                        lastCameraDeviceId = overlayDeviceId;
                    }
                    const compositeTrack = await buildScreenCameraCompositeTrack(screenStream, overlayCamera);
                    if (compositeTrack) {
                        const baseVideoTrack = stream.getVideoTracks()[0];
                        if (baseVideoTrack) {
                            stream.removeTrack(baseVideoTrack);
                        }
                        stream.addTrack(compositeTrack);
                        isScreenCompositeMode = true;
                    }
                }

                const displayTrack = screenStream.getVideoTracks()[0];
                if (displayTrack) {
                    displayTrack.onended = () => {
                        void stopScreenShareAndRestoreCamera();
                    };
                }
            } catch (error) {
                if (isMobile) {
                    if (window.ToastManager) {
                        ToastManager.info('Partage d\'écran indisponible', 'Bascule sur la caméra');
                    }
                    const needGestureRetry =
                        error?.name === 'NotAllowedError' ||
                        error?.name === 'InvalidStateError';
                    if (needGestureRetry) {
                        queueMobileScreenShareActivation();
                    }
                    stream = await requestUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30 }
                        },
                        audio: true
                    });
                } else {
                    throw error;
                }
            }
        } else {
            stream = await requestUserMedia({
                video: {
                    ...(isMobile ? MOBILE_VIDEO_CONSTRAINTS : {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    })
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        }

        const initialVideoTrack = stream?.getVideoTracks?.()[0];
        if (initialVideoTrack) {
            currentVideoDeviceId = initialVideoTrack.getSettings?.().deviceId || currentVideoDeviceId;
            if (source !== 'screen') {
                lastCameraDeviceId = currentVideoDeviceId || lastCameraDeviceId;
            }
        }
        isScreenSharing = Boolean(activeDisplayStream && stream?.getVideoTracks?.().length);
        updateScreenShareButtonState();
        
        const video = document.getElementById('stream-video');
        if (video) {
            video.srcObject = stream;
            video.muted = true; // Garder muet pour permettre l'autoplay
            video.autoplay = true;
            video.playsInline = true;
            syncAudioButtonState(true);
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
            
            // Ajouter un indicateur visuel que c'est bien le host
            const container = document.querySelector('.stream-video-container');
            if (container) {
                container.classList.remove('stream-host-live');
            }
            
            // Modifier l'interface pour le host
            const followBtn = document.getElementById('follow-btn');
            if (followBtn) {
                followBtn.style.display = 'none'; // Le host ne peut pas se suivre lui-même
            }
            
            // Activer le son par défaut pour le host
            const audioBtn = document.getElementById('audio-toggle-btn');
            if (audioBtn) {
                syncAudioButtonState(video.muted);
            }
            
            localMediaStream = stream;
            if (pendingViewerJoins.size > 0) {
                const pending = Array.from(pendingViewerJoins);
                pendingViewerJoins.clear();
                pending.forEach(viewerId => handleViewerJoin(viewerId));
            }
            
            if (currentStream && currentStream.id) {
                startLivePreviewUpdates(currentStream.id);
            }
        }
    } catch (error) {
        console.error("Erreur accès média diffuseur:", error);
        alert("Impossible d'accéder à la caméra/micro. Vérifiez vos permissions.");
    }
}

// Initialiser la page de stream
async function initializeStreamPage(streamId) {
    // Rejoindre le stream
    const result = await joinStream(streamId);
    
    if (!result.success) {
        alert('Erreur: ' + result.error);
        setChatEnabled(false);
        navigateTo('discover');
        return;
    }
    
    if (result.stream) {
        hydrateStreamInfo(result.stream);
    }

    const isHost = Boolean(currentUser && currentStream && currentUser.id === currentStream.user_id);
    applyStreamRoleUI(isHost);
    initWebRtcSignaling(streamId, isHost);
    startViewerCountSync(streamId);
    const container = document.querySelector('.stream-video-container');
    if (container && !container.dataset.boundAudio) {
        container.dataset.boundAudio = 'true';
        container.addEventListener('click', () => {
            const overlay = document.getElementById('unmute-overlay');
            if (overlay && overlay.style.display === 'flex') {
                enableStreamAudio();
            }
        });
    }

    const viewerModal = document.getElementById('viewer-list-modal');
    const viewerClose = document.getElementById('viewer-list-close');
    if (viewerClose && !viewerClose.dataset.bound) {
        viewerClose.addEventListener('click', () => closeViewerListModal());
        viewerClose.dataset.bound = 'true';
    }
    if (viewerModal && !viewerModal.dataset.bound) {
        viewerModal.addEventListener('click', (event) => {
            if (event.target === viewerModal) {
                closeViewerListModal();
            }
        });
        viewerModal.dataset.bound = 'true';
    }

    // Si l'utilisateur actuel est le créateur du stream (Host)
    if (isHost) {
        console.log('Mode Diffuseur activé');
        await setupBroadcasterMedia({ source: window._streamBroadcastSource });
        setupHostControls();
        setViewerWaiting(false);
    } else {
        setViewerWaiting(true);
    }
    
    // Charger l'historique du chat
    const chatResult = await loadChatHistory(streamId);
    if (chatResult.success) {
        if (window.liveChatStore) {
            window.liveChatStore.replace(chatResult.messages);
        } else {
            const chatContainer = document.getElementById('stream-chat-messages');
            if (chatContainer) {
                chatContainer.innerHTML = '';
                chatResult.messages.forEach(msg => {
                    const element = createChatMessageElement(msg);
                    chatContainer.appendChild(element);
                });
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }
    }
    
    // Configurer le formulaire de chat
    const chatForm = document.getElementById('stream-chat-form');
    if (chatForm) {
        if (!chatForm.dataset.bound) {
            chatForm.dataset.bound = 'true';
            chatForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const input = document.getElementById('stream-chat-input');
                const message = input.value.trim();
                
                if (!message) return;
                
                const result = await sendChatMessage(message);
                if (result.success) {
                    input.value = '';
                } else {
                    if (window.ToastManager) {
                        ToastManager.error('Chat', result.error || 'Impossible d\'envoyer le message');
                    } else {
                        alert(result.error || 'Impossible d\'envoyer le message');
                    }
                }
            });
        }
    }

    setChatEnabled(true);
}

function hydrateStreamInfo(stream) {
    const titleEl = document.getElementById('stream-title');
    if (titleEl) {
        titleEl.textContent = stream.title || 'Live Stream';
    }

    const descriptionEl = document.getElementById('stream-description');
    if (descriptionEl) {
        descriptionEl.textContent = stream.description || 'Aucune description.';
    }

    const hostNameEl = document.getElementById('stream-host-name');
    if (hostNameEl) {
        const hostName = stream.users?.name || stream.host_name || 'Hôte';
        const hostId = stream.users?.id || stream.user_id || null;
        hostNameEl.dataset.hostName = hostName;
        hostNameEl.dataset.hostId = hostId || '';

        const renderHostName = () => {
            const safeHostName = hostNameEl.dataset.hostName || 'Hôte';
            const safeHostId = hostNameEl.dataset.hostId || null;
            if (safeHostId && typeof window.renderUsernameWithBadge === 'function') {
                hostNameEl.innerHTML = window.renderUsernameWithBadge(safeHostName, safeHostId);
            } else {
                hostNameEl.textContent = safeHostName;
            }
        };

        renderHostName();

        // Les badges peuvent être chargés après l'init du live: on re-render si les données changent.
        if (hostBadgeRefreshInterval) {
            clearInterval(hostBadgeRefreshInterval);
            hostBadgeRefreshInterval = null;
        }
        let previousSignature = '';
        hostBadgeRefreshInterval = setInterval(() => {
            const usersLoaded = window.hasLoadedUsers ? '1' : '0';
            let creators = 0;
            let staff = 0;
            if (typeof window.getVerifiedBadgeSets === 'function') {
                const sets = window.getVerifiedBadgeSets();
                creators = sets?.creators?.size || 0;
                staff = sets?.staff?.size || 0;
            }
            const signature = `${usersLoaded}|${creators}|${staff}`;
            if (signature !== previousSignature) {
                previousSignature = signature;
                renderHostName();
                updateStreamSupportButton(currentStream || stream);
            }
        }, 1200);
    }

    const hostAvatarEl = document.getElementById('stream-host-avatar');
    if (hostAvatarEl) {
        const avatarUrl = stream.users?.avatar || stream.host_avatar || '';
        if (avatarUrl) {
            hostAvatarEl.src = avatarUrl;
            hostAvatarEl.alt = 'Avatar de l\'hôte';
        } else {
            hostAvatarEl.removeAttribute('src');
        }
    }

    const breadcrumb = document.getElementById('stream-breadcrumb-title');
    if (breadcrumb) {
        breadcrumb.textContent = stream.title || 'Stream en cours';
    }

    updateStreamSupportButton(stream);
}

function updateStreamSupportButton(stream) {
    const button = document.getElementById('stream-support-btn');
    if (!button) return;

    const hostId = stream?.users?.id || stream?.user_id || null;
    if (!hostId) {
        button.style.display = 'none';
        return;
    }

    const hostName = stream?.users?.name || stream?.host_name || 'Créateur';
    const cachedUser =
        typeof window.getUser === 'function' ? window.getUser(hostId) : null;
    const hostUser = stream?.users || cachedUser || {};
    const plan = String(hostUser.plan || '').toLowerCase();
    const planStatus = String(hostUser.plan_status || '').toLowerCase();
    const planEnd = hostUser.plan_ends_at || hostUser.planEndsAt || null;
    const planEndMs = planEnd ? Date.parse(planEnd) : null;
    const activeByDate =
        !planEnd || (Number.isFinite(planEndMs) ? planEndMs > Date.now() : true);
    const isEligible =
        planStatus === 'active' &&
        activeByDate &&
        (plan === 'medium' || plan === 'pro');
    const isSelf = window.currentUser && window.currentUser.id === hostId;

    if (!isEligible || isSelf) {
        button.style.display = 'none';
        return;
    }

    button.style.display = 'inline-flex';
    button.dataset.creatorId = hostId;
    button.dataset.creatorName = hostName;
    button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window.openSupportModal === 'function') {
            window.openSupportModal(hostId, hostName);
            return;
        }
        if (window.ToastManager) {
            window.ToastManager.error(
                'Soutien',
                'Le module de soutien n’est pas disponible sur cette page.',
            );
            return;
        }
        alert("Le module de soutien n’est pas disponible sur cette page.");
    };
}

function applyStreamRoleUI(isHost) {
    document.body.classList.toggle('is-stream-host', isHost);
    document.body.classList.toggle('is-stream-viewer', !isHost);
    isStreamHost = isHost;

    setStreamStatusMode('live', { host: isHost, stream: currentStream });

    const roleBadge = document.getElementById('stream-role-badge');
    if (roleBadge) {
        roleBadge.remove();
    }

    const followBtn = document.getElementById('follow-btn');
    const shareBtn = document.getElementById('share-btn');
    const buttons = [followBtn, shareBtn].filter(Boolean);

    buttons.forEach(btn => {
        if (isHost) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.classList.remove('disabled');
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    });

    const chatInput = document.getElementById('stream-chat-input');
    if (chatInput) {
        chatInput.placeholder = isHost ? 'Écrire à vos viewers...' : 'Envoyer un message...';
    }

    const viewerBtn = document.getElementById('viewer-list-btn');
    if (viewerBtn) {
        if (isHost) {
            viewerBtn.disabled = false;
            if (!viewerBtn.dataset.bound) {
                viewerBtn.addEventListener('click', () => openViewerListModal());
                viewerBtn.dataset.bound = 'true';
            }
        } else {
            viewerBtn.disabled = true;
        }
    }
}

function setChatEnabled(enabled) {
    const chatInput = document.getElementById('stream-chat-input');
    const chatButton = document.querySelector('#stream-chat-form .stream-chat-send');
    if (chatInput) {
        chatInput.disabled = !enabled;
        if (!enabled) {
            chatInput.placeholder = 'Chat indisponible...';
        }
    }
    if (chatButton) {
        chatButton.disabled = !enabled;
    }
}

function setViewerWaiting(isWaiting) {
    const container = document.querySelector('.stream-video-container');
    if (!container) return;

    let waiting = document.getElementById('stream-waiting');
    if (!waiting) {
        waiting = document.createElement('div');
        waiting.id = 'stream-waiting';
        waiting.className = 'stream-waiting';
        waiting.innerHTML = `
            <div class="stream-waiting-card">
                <div class="stream-waiting-title">En attente du flux…</div>
                <div class="stream-waiting-subtitle">Le live va commencer sous peu.</div>
            </div>
        `;
        container.appendChild(waiting);
    }

    waiting.style.display = isWaiting ? 'flex' : 'none';

    const info = document.querySelector('.stream-info');
    if (info) {
        let note = document.getElementById('stream-waiting-note');
        if (!note) {
            note = document.createElement('div');
            note.id = 'stream-waiting-note';
            note.className = 'stream-waiting-note';
            note.innerHTML = `
                <strong>Live en préparation</strong>
                <span>Le flux vidéo n'est pas encore disponible.</span>
            `;
            info.prepend(note);
        }
        note.style.display = isWaiting ? 'flex' : 'none';
    }

    const followBtn = document.getElementById('follow-btn');
    const shareBtn = document.getElementById('share-btn');
    const buttons = [followBtn, shareBtn].filter(Boolean);
    buttons.forEach(btn => {
        if (isWaiting) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.classList.remove('disabled');
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    });

    if (isWaiting) {
        setStreamStatusMode('waiting');
    } else {
        setStreamStatusMode('live', {
            host: Boolean(isStreamHost),
            stream: currentStream
        });
    }
}

function showStreamEndedMessage() {
    const container = document.querySelector('.stream-video-container');
    if (!container) return;

    const waiting = document.getElementById('stream-waiting');
    if (waiting) waiting.style.display = 'none';

    let ended = document.getElementById('stream-ended');
    if (!ended) {
        ended = document.createElement('div');
        ended.id = 'stream-ended';
        ended.className = 'stream-waiting stream-ended';
        ended.innerHTML = `
            <div class="stream-waiting-card">
                <div class="stream-waiting-title">Live terminé</div>
                <div class="stream-waiting-subtitle">L'hôte a arrêté le live.</div>
            </div>
        `;
        container.appendChild(ended);
    }
    ended.style.display = 'flex';

    const info = document.querySelector('.stream-info');
    if (info) {
        let note = document.getElementById('stream-ended-note');
        if (!note) {
            note = document.createElement('div');
            note.id = 'stream-ended-note';
            note.className = 'stream-waiting-note stream-ended-note';
            note.innerHTML = `
                <strong>Live terminé</strong>
                <span>L'hôte a arrêté le live.</span>
            `;
            info.prepend(note);
        }
        note.style.display = 'flex';
    }
}

// Exposer les fonctions utilisées par d'autres scripts
    window.startStream = startStream;
    window.joinStream = joinStream;
    window.endStream = endStream;
    window.leaveStream = leaveStream;
    window.initializeStreamPage = initializeStreamPage;
    window.toggleAudio = toggleAudio;
    window.enableStreamAudio = enableStreamAudio;
} else {
    console.warn('streaming.js déjà chargé, initialisation ignorée.');
}
