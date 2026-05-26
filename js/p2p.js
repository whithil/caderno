/* 
    DIFFERENTIAL SYNC & WebRTC ENGINE 
    This part handles the structural patching via DMP and P2P networking with PeerJS.
*/

const dmp = new diff_match_patch();
window.dmp = dmp;

var myPeer = null;
var connections = [];
var remotePeersData = {};

var localUser = {
    id: null,
    name: localStorage.getItem('caderno_user_name') || 'Explorer',
    color: localStorage.getItem('caderno_user_color') || '#a855f7',
    isTyping: false,
    activeNoteKey: "",
    cursorPos: 0,
    mouseX: 0,
    mouseY: 0
};

var ownCursorFlagEnabled = false;

window.initP2PEngine = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    myPeer = new Peer();

    myPeer.on('open', (id) => {
        localUser.id = id;
        console.log('My P2P ID is: ' + id);
        
        if (roomParam && roomParam !== id) {
            connectToPeer(roomParam);
        } else {
            document.getElementById('connection-mode-badge').innerText = "P2P HOST ACTIVE";
            document.getElementById('connection-mode-badge').className = "px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-bold text-[10px]";
        }
        renderPresenceList();
    });

    myPeer.on('connection', (conn) => {
        setupConnectionHandlers(conn);
        
        setTimeout(() => {
            conn.send({
                type: 'FULL_SYNC',
                vault: vault,
                blameMap: blameMap,
                mentions: userMentions
            });
        }, 1000);
    });

    myPeer.on('error', (err) => {
        console.error('P2P Error:', err);
        showToast(i18n[currentLang].toastP2PError, "error");
    });
};

function connectToPeer(targetId) {
    const conn = myPeer.connect(targetId);
    setupConnectionHandlers(conn);
}

function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        connections.push(conn);
        console.log('Connected to: ' + conn.peer);
        
        conn.send({
            type: 'PRESENCE',
            name: localUser.name,
            color: localUser.color,
            isTyping: localUser.isTyping,
            activeNoteKey: window.activeNoteKey,
            cursorPos: localUser.cursorPos
        });

        document.getElementById('connection-mode-badge').innerText = "P2P SYNC ACTIVE";
        document.getElementById('connection-mode-badge').className = "px-2 py-0.5 rounded bg-purple-900/40 text-purple-400 font-bold text-[10px]";
        
        applyUILanguage(currentLang);
    });

    conn.on('data', (data) => {
        handleIncomingData(data, conn.peer);
    });

    conn.on('close', () => {
        removePeer(conn.peer);
    });

    conn.on('error', (err) => {
        removePeer(conn.peer);
    });
}

function handleIncomingData(data, senderId) {
    switch (data.type) {
        case 'FULL_SYNC':
            vault = data.vault;
            if (data.blameMap) blameMap = data.blameMap;
            if (data.mentions) userMentions = data.mentions;
            saveVaultLocalOnly();
            renderVaultList();
            loadActiveNote();
            updateMentionsUI();
            showToast(i18n[currentLang].toastSyncHost, "success");
            break;

        case 'PATCH':
            if (vault[data.noteKey]) {
                const patches = dmp.patch_fromText(data.patch);
                const [newText, results] = dmp.patch_apply(patches, vault[data.noteKey].content);
                
                const oldContent = vault[data.noteKey].content;
                vault[data.noteKey].content = newText;
                
                if (window.updateBlameTracking) {
                    window.updateBlameTracking(data.noteKey, oldContent, newText, {
                        id: senderId,
                        name: data.authorName || 'Collaborator',
                        color: data.authorColor || '#ffffff'
                    });
                }

                saveVaultLocalOnly();

                if (activeNoteKey === data.noteKey) {
                    const textarea = document.getElementById('markdown-textarea');
                    const scrollPos = textarea.scrollTop;
                    const oldCaret = textarea.selectionStart;
                    
                    textarea.value = newText;
                    
                    const caretOffset = dmp.diff_xIndex(dmp.diff_main(oldContent, newText), oldCaret);
                    textarea.setSelectionRange(caretOffset, caretOffset);
                    
                    textarea.scrollTop = scrollPos;
                    renderActiveNote();
                } else {
                    renderVaultList();
                }
                
                if (window.scanForMentions) {
                    window.scanForMentions(newText, data.noteKey, data.authorName || 'Collaborator');
                }
            }
            break;

        case 'PRESENCE':
            const wasInDifferentNote = remotePeersData[senderId]?.activeNote !== data.activeNoteKey;
            
            remotePeersData[senderId] = {
                id: senderId,
                name: data.name,
                color: data.color,
                isTyping: data.isTyping,
                activeNote: data.activeNoteKey,
                cursorPos: data.cursorPos,
                mouseX: data.mouseX,
                mouseY: data.mouseY
            };
            
            if (data.activeNoteKey && data.activeNoteKey !== window.activeNoteKey && wasInDifferentNote) {
                if (window.showNavigationToast) window.showNavigationToast(senderId, data.name, data.activeNoteKey);
            }
            
            renderPresenceList();
            if (data.activeNoteKey === window.activeNoteKey) {
                renderRemoteCursors();
                renderRemoteMice();
            }
            break;

        case 'VAULT_STRUCTURE':
            vault = data.vault;
            saveVaultLocalOnly();
            renderVaultList();
            if (!vault[activeNoteKey]) {
                activeNoteKey = Object.keys(vault)[0] || "";
                loadActiveNote();
            }
            break;
    }
}

function removePeer(id) {
    connections = connections.filter(c => c.peer !== id);
    delete remotePeersData[id];
    renderPresenceList();
    renderRemoteCursors();
    renderRemoteMice();
    applyUILanguage(currentLang);
}

window.broadcastNotePatch = function(noteKey, oldText, newText) {
    const patches = dmp.patch_make(oldText, newText);
    const patchText = dmp.patch_toText(patches);

    broadcastMessageToPeers({
        type: 'PATCH',
        noteKey: noteKey,
        patch: patchText,
        authorName: localUser.name,
        authorColor: localUser.color
    });
};

window.triggerP2PVaultStructureUpdate = function() {
    broadcastMessageToPeers({
        type: 'VAULT_STRUCTURE',
        vault: vault
    });
};

function broadcastMessageToPeers(msg) {
    connections.forEach(conn => {
        if (conn.open) conn.send(msg);
    });
}

function renderPresenceList() {
    const container = document.getElementById('presence-avatars');
    if (!container) return;
    container.innerHTML = '';

    const allPeers = [
        { ...localUser, isLocal: true },
        ...Object.values(remotePeersData)
    ];

    allPeers.forEach(p => {
        const avatar = document.createElement('div');
        avatar.className = `w-6 h-6 rounded-full border-2 border-obsidian-sidebar flex items-center justify-center text-[10px] font-bold text-white shadow-sm shrink-0`;
        avatar.style.backgroundColor = p.color;
        avatar.innerText = p.name.charAt(0).toUpperCase();
        avatar.title = p.isLocal ? `${p.name} (You)` : p.name;
        container.appendChild(avatar);
    });
}

window.renderRemoteCursors = function() {
    const layer = document.getElementById('editor-cursors-layer');
    if (!layer) return;
    layer.innerHTML = '';

    const textarea = document.getElementById('markdown-textarea');
    if (!textarea) return;

    const peersInNote = Object.values(remotePeersData).filter(p => p.activeNote === activeNoteKey);
    
    if (ownCursorFlagEnabled) {
        peersInNote.push({
            id: 'local',
            name: localUser.name,
            color: localUser.color,
            cursorPos: localUser.cursorPos,
            isLocal: true
        });
    }

    peersInNote.forEach(p => {
        try {
            const coords = getCaretCoordinates(textarea, p.cursorPos);
            const cursor = document.createElement('div');
            cursor.className = 'remote-cursor';
            cursor.style.height = coords.height + 'px';
            cursor.style.backgroundColor = p.color;
            
            // Adjust for scroll
            const top = coords.top - textarea.scrollTop + 16; // 16px is the padding-top of textarea
            const left = coords.left + 16; // 16px is padding-left
            
            cursor.style.top = top + 'px';
            cursor.style.left = left + 'px';

            const flag = document.createElement('div');
            flag.className = 'remote-cursor-flag';
            flag.style.backgroundColor = p.color;
            flag.innerText = p.name;
            cursor.appendChild(flag);

            layer.appendChild(cursor);
        } catch (e) {}
    });
};

window.addEventListener('mousemove', (e) => {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    
    if (Math.abs(localUser.mouseX - x) > 0.01 || Math.abs(localUser.mouseY - y) > 0.01) {
        localUser.mouseX = x;
        localUser.mouseY = y;
        
        if (myPeer && !myPeer.destroyed) {
            broadcastMessageToPeers({
                type: 'PRESENCE',
                name: localUser.name,
                color: localUser.color,
                activeNoteKey: window.activeNoteKey,
                mouseX: x,
                mouseY: y
            });
        }
    }
});

window.renderRemoteMice = function() {
    let layer = document.getElementById('mouse-cursors-layer');
    if (!layer) return;
    
    layer.innerHTML = '';
    
    Object.keys(remotePeersData).forEach(peerId => {
        const p = remotePeersData[peerId];
        // Only render mouse if peer is in the same note
        if (p.activeNote === window.activeNoteKey && p.mouseX !== undefined && p.mouseY !== undefined) {
            const x = p.mouseX * window.innerWidth;
            const y = p.mouseY * window.innerHeight;
            
            const mouseEl = document.createElement('div');
            mouseEl.className = 'absolute transition-all duration-75 ease-linear flex flex-col items-start';
            mouseEl.style.left = x + 'px';
            mouseEl.style.top = y + 'px';
            mouseEl.style.zIndex = '9999';
            mouseEl.style.pointerEvents = 'none';
            
            mouseEl.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${p.color}" stroke="white" stroke-width="2">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
                </svg>
                <div class="ml-3 mt-1 px-1.5 py-0.5 rounded text-[9px] text-white font-bold whitespace-nowrap shadow-sm" style="background-color: ${p.color}">${p.name}</div>
            `;
            layer.appendChild(mouseEl);
        }
    });
};
