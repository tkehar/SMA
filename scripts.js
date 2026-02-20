// Suppress benign Chrome Extension errors from cluttering the console
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('message channel closed')) {
        event.preventDefault();
    }
});

// Replace this with YOUR actual config from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyAvA4JDbbaHCLenqM1hOLBIW55-9SnVLQI",
    authDomain: "sabeen-mahmud-archive.firebaseapp.com",
    databaseURL: "https://sabeen-mahmud-archive-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "sabeen-mahmud-archive",
    storageBucket: "sabeen-mahmud-archive.appspot.com",
    messagingSenderId: "1024567890123",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase (using compat versions as per previous setup)
let database;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
} catch (e) {
    console.warn("Firebase initialization failed:", e);
}

// --- 2. GLOBAL STATE ---
let isAdmin = false;

// --- 3. TEXT MESSAGE LOGIC ---
function saveTextMessage() {
    const name = document.getElementById('guest-name').value || "Anonymous";
    const text = document.getElementById('guest-text').value;

    if (!text) return alert("Please share your thoughts first!");

    if (database) {
        database.ref('messages').push({
            name: name,
            text: text,
            type: 'text',
            timestamp: Date.now()
        });
    }

    document.getElementById('guest-text').value = "";
}

// --- 5. LIVE FEED & RENDERING ---
let feedSnapshot = null;

function renderFeed() {
    const container = document.getElementById('feed-container');
    if (!feedSnapshot) return;
    const data = feedSnapshot.val();
    let html = "";

    const messages = data ? Object.entries(data).reverse() : [];

    messages.forEach(([key, m]) => {
        if (!m) return;

        // Admin Delete Button
        const deleteBtn = isAdmin ? 
            `<button class="delete-btn" onclick="deleteMessage('${key}')">Delete</button>` : '';

        html += `
            <div class="feed-item" id="${key}">
                ${deleteBtn}
                <strong>${m.name || 'Anonymous'}</strong>
                <p>${m.text || ''}</p>
            </div>`;
    });

    container.innerHTML = html || "<p>No messages yet. Be the first!</p>";
}

if (database) {
    database.ref('messages').orderByChild('timestamp').on('value', (snapshot) => {
        feedSnapshot = snapshot;
        renderFeed();
    });
}

// --- 6. MODERATION & ADMIN ---
function enterAdminMode() {
    const pw = prompt("Enter Moderation Password:");
    if (pw === "SabeenArchive2024") { 
        isAdmin = true;
        alert("Admin Mode Active. Red delete buttons will appear.");
        renderFeed();
    } else {
        alert("Incorrect password.");
    }
}

// Keyboard Shortcut: Ctrl + Shift + A to login as Admin
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        enterAdminMode();
    }
});

async function deleteMessage(key) {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    if (database) {
        try {
            await database.ref('messages').child(key).remove();
            console.log("Deleted successfully");
        } catch (error) {
            console.error("Error deleting:", error);
        }
    }
}

if (typeof AFRAME !== 'undefined') {
AFRAME.registerComponent('hover-info', {
    schema: { 
    id: {type: 'string', default: ''},
    title: {type: 'string', default: ''} 
    },
    init: function () {
    const el = this.el;
    
    el.addEventListener('mouseenter', () => {
        // ERROR FIX: If the icon is hidden, don't show tooltip
        if (!el.object3D.visible || el.getAttribute('material').opacity < 0.1) return;
        if (!el.object3D.visible) return;
        // Extra check: ensure the room (parent) is actually visible
        if (el.parentNode && el.parentNode.object3D && !el.parentNode.object3D.visible) return;

        // FIX: Don't show tooltip if info panel is open to prevent overlap/glitches
        const panel = document.querySelector('#info-panel');
        if (panel && panel.getAttribute('visible') === 'true') return;

        const cursorTooltip = document.querySelector('#cursor-tooltip');
        const tooltipText = document.querySelector('#tooltip-text');
        const tooltipBg = document.querySelector('#tooltip-bg');
        let displayTitle = "";

        // Check database or use manual title
        if (this.data.id && typeof ARCHIVE_DATABASE !== 'undefined') {
            const itemData = ARCHIVE_DATABASE[this.data.id];
            if (itemData) displayTitle = itemData.title;
        } else if (this.data.title) {
            displayTitle = this.data.title;
        }

        if (displayTitle && cursorTooltip && tooltipText && tooltipBg) {
            tooltipText.setAttribute('value', displayTitle);
            
            // Dynamic width calculation
            const estimatedWidth = Math.max(0.8, (displayTitle.length * 0.05) + 0.2);
            tooltipBg.setAttribute('width', estimatedWidth);
            
            // Center the background relative to the text
            tooltipBg.setAttribute('position', { x: -(estimatedWidth / 2), y: 0, z: 0 });

            cursorTooltip.setAttribute('visible', true);
        }
    });

    el.addEventListener('mouseleave', () => {
        const cursorTooltip = document.querySelector('#cursor-tooltip');
        if (cursorTooltip) cursorTooltip.setAttribute('visible', false);

        // Mobile: Reset hover state when looking away/tapping elsewhere
        if (AFRAME.utils.device.isMobile() && window.mobileHoverId === this.data.id) {
            window.mobileHoverId = null;
        }
    });
    }
});
}

// 1. GLOBAL OBJECTS
let currentAudio = new Audio();
window.mobileHoverId = null; // Track the currently hovered item on mobile
let isZoomed = false;
let imgOriginalState = { pos: null, scale: null };
let updateTimer = null;
let isNavMenuOpen = false;
let currentId = null;
let isMinimized = false;
let isLoading = false;

// 2. INTERACTION LOGIC
function interact(id) {
    currentId = id;
    isMinimized = false;
    isLoading = true;
    const data = ARCHIVE_DATABASE[id];
    if (!data) return console.error("Entry not found:", id);

    // FIX: Hide tooltip immediately when interacting
    const cursorTooltip = document.querySelector('#cursor-tooltip');
    if (cursorTooltip) cursorTooltip.setAttribute('visible', 'false');

    const panel = document.querySelector('#info-panel');
    if (!panel) return;
    const camera = document.querySelector('#main-camera');
    const panelTitle = document.querySelector('#panel-title');
    const panelImg = document.querySelector('#panel-img');
    const panelDesc = document.querySelector('#panel-desc');
    const panelMeta = document.querySelector('#panel-meta');
    const audioPlayerUI = document.querySelector('#audio-player-ui');
    const panelSkeleton = document.querySelector('#panel-skeleton');
    const playPauseBtn = document.querySelector('#play-pause-btn');
    const audioTime = document.querySelector('#audio-time');
    const zoomBtn = document.querySelector('#zoom-btn');
    const minBtn = document.querySelector('#min-btn');
    const maxBtn = document.querySelector('#max-btn');

    // Reset State
    stopAudio();
    panelImg.setAttribute('visible', 'false');
    
    // Show Skeleton, Hide Content
    if (panelSkeleton) panelSkeleton.setAttribute('visible', 'true');
    panelTitle.setAttribute('visible', 'false');
    panelDesc.setAttribute('visible', 'false');
    panelMeta.setAttribute('visible', 'false');
    audioPlayerUI.setAttribute('visible', 'false');
    if (zoomBtn) zoomBtn.setAttribute('visible', 'false');
    
    // Reset Minimize/Maximize UI
    if (minBtn) minBtn.setAttribute('visible', 'true');
    if (maxBtn) maxBtn.setAttribute('visible', 'false');
    const panelBg = document.querySelector('#panel-bg');
    if (panelBg) {
        panelBg.setAttribute('height', '2.2');
        panelBg.setAttribute('position', '0 0 0');
    }

    panelImg.setAttribute('position', '0 0.3 0.02');
    panelTitle.setAttribute('value', data.title);
    panelMeta.setAttribute('value', '');
    audioTime.setAttribute('position', '0 0.1 0');
    
    // Reset Zoom State
    isZoomed = false;
    if (zoomBtn) {
        zoomBtn.setAttribute('visible', 'false');
        zoomBtn.setAttribute('src', 'Assets/Icons/Zoom in.png');
    }
    // Reset UI Opacity
    [panelTitle, panelDesc, panelMeta, audioPlayerUI].forEach(el => {
        if (el) {
            el.setAttribute('opacity', 1);
            if (el.components.text) el.setAttribute('text', 'opacity', 1);
        }
    });
    panelImg.setAttribute('scale', '1 1 1');

    const showContent = () => {
        isLoading = false;
        if (isMinimized) return; // Don't show content if user minimized while loading
        if (panelSkeleton) panelSkeleton.setAttribute('visible', 'false');
        panelTitle.setAttribute('visible', 'true');
        panelDesc.setAttribute('visible', 'true');
        panelMeta.setAttribute('visible', 'true');
    };

    if (data.type === 'image') {
        const imgLoader = new Image();
        imgLoader.onload = function() {
            const maxWidth = 1.3, maxHeight = 0.8;
            const aspectRatio = imgLoader.naturalWidth / imgLoader.naturalHeight;
            let finalWidth = maxWidth, finalHeight = maxWidth / aspectRatio;
            if (finalHeight > maxHeight) { finalHeight = maxHeight; finalWidth = maxHeight * aspectRatio; }
            
            panelImg.setAttribute('width', finalWidth);
            panelImg.setAttribute('height', finalHeight);
            panelImg.setAttribute('src', data.src);
            panelImg.setAttribute('visible', 'true');
            
            // Adjust text position based on image height
            const imageBottomY = 0.3 - (finalHeight / 2);
            panelDesc.setAttribute('position', {x: -0.6, y: -0.4, z: 0.02});
            panelDesc.setAttribute('value', `${data.meta.description}\n\nPhotographer: ${data.meta.author}`);
            panelMeta.setAttribute('position', {x: -0.6, y: -0.8, z: 0.02});
            if (zoomBtn) zoomBtn.setAttribute('visible', 'true');
            showContent();
        };
        imgLoader.src = data.src;

    } else if (data.type === 'audio') {
        audioPlayerUI.setAttribute('visible', 'true');
        audioPlayerUI.setAttribute('position', '0 0.2 0.02');
        playPauseBtn.setAttribute('src', 'Assets/Icons/Pause.png'); // Reset to pause icon
        panelDesc.setAttribute('position', {x: -0.6, y: -0.2, z: 0.02});
        panelDesc.setAttribute('value', `${data.meta.description}\n\nSpeaker: ${data.meta.author}\nRelation: ${data.meta.relation}\nDate: ${data.meta.date}`);
        
        currentAudio.src = data.src;
        currentAudio.play().then(() => startProgressTracker()).catch(e => console.log("Play blocked"));
        showContent();
    } else if (data.type === 'audio-image') {
        playPauseBtn.setAttribute('src', 'Assets/Icons/Pause.png');
        panelDesc.setAttribute('position', {x: -0.6, y: -0.4, z: 0.02});
        
        // 1. Set Description
        panelDesc.setAttribute('value', data.meta.description);

        // 2. Calculate offset based on description length (approximate)
        // const lineCount = Math.max(1, Math.ceil(data.meta.description.length / 40)); 
        // const descHeight = lineCount * 0.06; 
        // const metaY = -0.15 - descHeight - 0.05; // Position below description

        // 3. Set Metadata with custom spacing
        panelMeta.setAttribute('position', {x: -0.6, y: -0.8, z: 0.02});
        panelMeta.setAttribute('value', `Speaker: ${data.meta.author}\nRelation: ${data.meta.relation}\nRecorded On: ${data.meta.date}\nPhotographer: ${data.meta.photographer}\nPicture Date: ${data.meta.picture_date}`);
        
        if (data.audioSrc) {
            currentAudio.src = data.audioSrc;
            currentAudio.play().then(() => startProgressTracker()).catch(e => console.log("Play blocked"));
        }

        const imgLoader = new Image();
        imgLoader.onload = function() {
            const maxWidth = 1.3, maxHeight = 0.5;
            const aspectRatio = imgLoader.naturalWidth / imgLoader.naturalHeight;
            let finalWidth = maxWidth, finalHeight = maxWidth / aspectRatio;
            if (finalHeight > maxHeight) { finalHeight = maxHeight; finalWidth = maxHeight * aspectRatio; }
            
            panelImg.setAttribute('width', finalWidth);
            panelImg.setAttribute('height', finalHeight);
            panelImg.setAttribute('src', data.src);
            panelImg.setAttribute('visible', 'true');
            panelImg.setAttribute('position', {x: 0, y: 0.45, z: 0.02});

            const playerY = 0.45 - (finalHeight / 2) - 0.15;
            audioPlayerUI.setAttribute('position', {x: 0, y: playerY, z: 0.02});
            audioPlayerUI.setAttribute('visible', 'true');
            if (zoomBtn) zoomBtn.setAttribute('visible', 'true');
            showContent();
        };
        imgLoader.src = data.src;
    }
    panel.setAttribute('visible', 'true');
}

function toggleMinimize() {
    const panelBg = document.querySelector('#panel-bg');
    const panelImg = document.querySelector('#panel-img');
    const panelDesc = document.querySelector('#panel-desc');
    const panelMeta = document.querySelector('#panel-meta');
    const audioPlayerUI = document.querySelector('#audio-player-ui');
    const zoomBtn = document.querySelector('#zoom-btn');
    const minBtn = document.querySelector('#min-btn');
    const maxBtn = document.querySelector('#max-btn');
    const panelSkeleton = document.querySelector('#panel-skeleton');

    if (!isMinimized) {
        // MINIMIZE
        isMinimized = true;
        
        // Shrink Background to top bar
        if (panelBg) {
            panelBg.setAttribute('height', '0.4');
            panelBg.setAttribute('position', '0 0.9 0');
        }
        
        // Hide Content
        if (panelImg) panelImg.setAttribute('visible', 'false');
        if (panelDesc) panelDesc.setAttribute('visible', 'false');
        if (panelMeta) panelMeta.setAttribute('visible', 'false');
        if (audioPlayerUI) audioPlayerUI.setAttribute('visible', 'false');
        if (zoomBtn) zoomBtn.setAttribute('visible', 'false');
        if (panelSkeleton) panelSkeleton.setAttribute('visible', 'false');

        // Toggle Buttons
        if (minBtn) minBtn.setAttribute('visible', 'false');
        if (maxBtn) maxBtn.setAttribute('visible', 'true');

    } else {
        // MAXIMIZE
        isMinimized = false;

        // Restore Background
        if (panelBg) {
            panelBg.setAttribute('height', '2.2');
            panelBg.setAttribute('position', '0 0 0');
        }

        // Toggle Buttons
        if (minBtn) minBtn.setAttribute('visible', 'true');
        if (maxBtn) maxBtn.setAttribute('visible', 'false');

        if (isLoading) {
            if (panelSkeleton) panelSkeleton.setAttribute('visible', 'true');
        } else {
            // Restore Content based on current item type
            if (currentId && ARCHIVE_DATABASE[currentId]) {
                const data = ARCHIVE_DATABASE[currentId];
                if (panelDesc) panelDesc.setAttribute('visible', 'true');
                if (panelMeta) panelMeta.setAttribute('visible', 'true');

                if (data.type === 'image' || data.type === 'audio-image') {
                    if (panelImg) panelImg.setAttribute('visible', 'true');
                    if (zoomBtn) zoomBtn.setAttribute('visible', 'true');
                }
                
                if (data.type === 'audio' || data.type === 'audio-image') {
                    if (audioPlayerUI) audioPlayerUI.setAttribute('visible', 'true');
                }
            }
        }
    }
}

// 3. AUDIO PLAYER UTILITIES
function togglePlayback() {
    const btn = document.querySelector('#play-pause-btn');
    if (!btn) return;
    if (currentAudio.paused) {
        currentAudio.play();
        btn.setAttribute('src', 'Assets/Icons/Pause.png');
        startProgressTracker();
    } else {
        currentAudio.pause();
        btn.setAttribute('src', 'Assets/Icons/Play.png');
        cancelAnimationFrame(updateTimer);
    }
}

function startProgressTracker() {
    const timeText = document.querySelector('#audio-time');
    if (!timeText) return;

    function update() {
        // Only update if audio is playing
        if (!currentAudio.paused && !currentAudio.ended) {
            // Update the time codes only
            timeText.setAttribute('value', `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`);
            
            updateTimer = requestAnimationFrame(update);
        } else if (currentAudio.ended) {
            // Reset button icon when audio finishes
            document.querySelector('#play-pause-btn').setAttribute('src', 'Assets/Icons/Play.png');
        }
    }
    updateTimer = requestAnimationFrame(update);
}

function stopAudio() {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    cancelAnimationFrame(updateTimer);
}

function formatTime(secs) {
    if (isNaN(secs)) return "0:00";
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
}

function closePanel() {
    const panel = document.querySelector('#info-panel');
    if (panel) panel.setAttribute('visible', 'false');
    
    // Reset Minimize State
    isMinimized = false;
    const panelBg = document.querySelector('#panel-bg');
    if (panelBg) {
        panelBg.setAttribute('height', '2.2');
        panelBg.setAttribute('position', '0 0 0');
    }
    // Ensure zoom is reset for next time
    isZoomed = false;
    stopAudio();
}

// 4. ROOM & APP LOGIC
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.overlay-content').forEach(section => {
        section.style.display = 'none';
    });
    
    // Show the chosen one
    document.getElementById(sectionId).style.display = 'block';

    if (sectionId === 'instructions-section') {
        initInstructions();
    }
}

// Show mute button immediately since autoplay is enabled
const muteBtn = document.getElementById('global-mute-btn');
if (muteBtn) muteBtn.style.display = 'flex';

// Helper to start audio on first interaction
let hasAudioStarted = false;
function initGlobalAudio() {
    if (hasAudioStarted) return;
    const globalAudio = document.querySelector('#global-audio');
    const muteBtn = document.getElementById('global-mute-btn');
    
    if (globalAudio && globalAudio.components && globalAudio.components.sound) {
        globalAudio.components.sound.playSound();
        // Ensure icon is correct
        const icon = document.getElementById('mute-icon');
        if (icon) icon.className = 'icon-sound-on';
        
        hasAudioStarted = true;
        
        // Cleanup listeners
        document.removeEventListener('click', initGlobalAudio);
        document.removeEventListener('touchstart', initGlobalAudio);
        document.removeEventListener('keydown', initGlobalAudio);
    }
}

// Attempt to play audio on first user interaction
document.addEventListener('click', initGlobalAudio);
document.addEventListener('touchstart', initGlobalAudio);
document.addEventListener('keydown', initGlobalAudio);

function startExperience() {
    const overlay = document.getElementById('landing-overlay');
    
    // Request Device Orientation Permission for iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    // Permission granted
                }
            })
            .catch(console.error);
    }

    // Ensure audio is playing (if not already started)
    initGlobalAudio();

    // Show VR button
    const vrBtn = document.querySelector('.a-enter-vr');
    if (vrBtn) vrBtn.style.display = 'block';

    // Fade out the overlay
    overlay.style.opacity = '0';
    
    // Remove from DOM after fade completes so it doesn't block clicks
    setTimeout(() => {
        overlay.style.display = 'none';
        
        // Trigger your A-Frame room logic
        if (typeof switchRoom === "function") {
            switchRoom('bedroom'); 
        }
    }, 800);
}

function exitToHome() {
    window.location.href = 'index.html';
}

function toggleGlobalAudio() {
    const globalAudio = document.querySelector('#global-audio');
    const icon = document.getElementById('mute-icon');
    const vrIcon = document.getElementById('nav-mute-icon');
    
    if (globalAudio && globalAudio.components.sound) {
        if (globalAudio.components.sound.isPlaying) {
            globalAudio.components.sound.pauseSound();
            if (icon) icon.className = 'icon-sound-off';
            if (vrIcon) vrIcon.setAttribute('src', 'Assets/Icons/Mute.png');
        } else {
            globalAudio.components.sound.playSound();
            if (icon) icon.className = 'icon-sound-on';
            if (vrIcon) vrIcon.setAttribute('src', 'Assets/Icons/Unmute.png');
        }
    }
}

function switchRoom(roomID) {
    // FIX 1: Manually hide the tooltip so it doesn't carry over
    const cursorTooltip = document.querySelector('#cursor-tooltip');
    if (cursorTooltip) cursorTooltip.setAttribute('visible', 'false');

    // 2. Hide all rooms
    document.querySelectorAll('[id^="room-"]').forEach(room => {
        room.setAttribute('visible', 'false');
    });
    
    // 3. Show target room
    const targetRoom = document.getElementById('room-' + roomID);
    if (targetRoom) {
        targetRoom.setAttribute('visible', 'true');
    }

    // 4. Update Navigation Highlight
    updateNavHighlight(roomID);

    // 5. Close the nav menu if it's open
    if (isNavMenuOpen) {
        toggleNavMenu();
    }
}

// --- INSTRUCTIONS SLIDER LOGIC ---
function initInstructions() {
    
    // Detect Device
    let type = 'desktop';
    
    // Robust mobile detection (A-Frame or Regex fallback)
    const isMobile = (typeof AFRAME !== 'undefined' && AFRAME.utils.device.isMobile()) || 
                     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        type = 'mobile';
        // Override for Oculus Browser (which is mobile but VR)
        if (navigator.userAgent && navigator.userAgent.includes('Oculus')) {
            type = 'vr';
        }
    } else {
        // Desktop or VR Headset connected to Desktop
        if ((typeof AFRAME !== 'undefined' && AFRAME.utils.device.checkHeadsetConnected()) || 
            (navigator.userAgent && navigator.userAgent.includes('VR'))) {
            type = 'vr';
        }
    }

    const content = {
        desktop: [
            { title: "Look Around", text: "Click and drag your cursor to rotate your view.", gif: "Assets/Icons/Info.png" },
            { title: "Interact", text: "Hover over the amaltaas flowers to reveal details and click to view the content.", gif: "Assets/Icons/Info.png" },
            { title: "Explore", text: "Use the dropdown menu to move between rooms.", gif: "Assets/Icons/Info.png" }
        ],
        mobile: [
            { title: "Look Around", text: "Move your device around or swipe the screen.", gif: "Assets/Icons/Info.png" },
            { title: "Interact", text: "Tap the amaltaas flowers to view the content.", gif: "Assets/Icons/Info.png" },
            { title: "Explore", text: "Use the dropdown menu to move between rooms.", gif: "Assets/Icons/Info.png" }
        ],
        vr: [
            { title: "Look Around", text: "Turn your head to look around the space.", gif: "Assets/Icons/Info.png" },
            { title: "Interact", text: "Point and click the amaltaas flowers using your controller trigger.", gif: "Assets/Icons/Info.png" },
            { title: "Explore", text: "Use the dropdown menu to move between rooms.", gif: "Assets/Icons/Info.png" }
        ]
    };

    const instructions = content[type] || content['desktop'];
    const container = document.getElementById('instr-grid');
    
    if (!container) return;

    let html = '';
    instructions.forEach(slide => {
        html += `
            <div style="display: flex; flex-direction: row; align-items: flex-start; gap: 15px; animation: fadeIn 0.5s; text-align: left;">
                <div style="
                    min-width: 40px; 
                    width: 40px; 
                    height: 40px; 
                    background-color: #393939; 
                    -webkit-mask: url('${slide.gif}') no-repeat center / contain; 
                    mask: url('${slide.gif}') no-repeat center / contain;
                "></div>
                <div>
                    <strong style="display: block; font-size: 1.1rem; margin-bottom: 5px; color: #393939; text-transform: uppercase; letter-spacing: 1px;">${slide.title}</strong>
                    <p style="font-size: 0.9rem; margin: 0; line-height: 1.4; color: #555;">${slide.text}</p>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function toggleZoom() {
    const panelImg = document.querySelector('#panel-img');
    const uiElements = [
        document.querySelector('#panel-title'),
        document.querySelector('#panel-desc'),
        document.querySelector('#panel-meta'),
        document.querySelector('#audio-player-ui')
    ];
    const zoomBtn = document.querySelector('#zoom-btn');

    if (!panelImg) return;
    if (!panelImg || !panelImg.getAttribute('visible')) return;

    if (!isZoomed) {
        // ZOOM IN
        isZoomed = true;

        // Store original state
        const pos = panelImg.getAttribute('position');
        imgOriginalState.pos = `${pos.x} ${pos.y} ${pos.z}`;
        
        const currW = parseFloat(panelImg.getAttribute('width'));
        const currH = parseFloat(panelImg.getAttribute('height'));

        // Calculate target scale to fit panel (approx 1.6 x 2.2)
        const maxW = 1.6;
        const maxH = 2.2;
        const scaleX = maxW / currW;
        const scaleY = maxH / currH;
        const targetScale = Math.min(scaleX, scaleY) * 0.95; 

        // Animate Image
        panelImg.setAttribute('animation__pos', {
            property: 'position',
            to: '0 0 0.04',
            dur: 500,
            easing: 'easeInOutQuad'
        });
        panelImg.setAttribute('animation__scale', {
            property: 'scale',
            to: `${targetScale} ${targetScale} 1`,
            dur: 500,
            easing: 'easeInOutQuad'
        });

        // Hide UI
        uiElements.forEach(el => {
            if(el) {
                el.setAttribute('animation__opacity', { property: 'opacity', to: 0, dur: 300, easing: 'easeOutQuad' });
                if(el.components.text) el.setAttribute('animation__textopacity', { property: 'text.opacity', to: 0, dur: 300, easing: 'easeOutQuad' });
            }
        });

        if(zoomBtn) zoomBtn.setAttribute('src', 'Assets/Icons/Zoom out.png');

    } else {
        // ZOOM OUT
        isZoomed = false;

        panelImg.setAttribute('animation__pos', { property: 'position', to: imgOriginalState.pos, dur: 500, easing: 'easeInOutQuad' });
        panelImg.setAttribute('animation__scale', { property: 'scale', to: '1 1 1', dur: 500, easing: 'easeInOutQuad' });

        // Show UI
        uiElements.forEach(el => {
            if(el) {
                el.setAttribute('animation__opacity', { property: 'opacity', to: 1, dur: 300, easing: 'easeInQuad' });
                if(el.components.text) el.setAttribute('animation__textopacity', { property: 'text.opacity', to: 1, dur: 300, easing: 'easeInQuad' });
            }
        });

        if(zoomBtn) zoomBtn.setAttribute('src', 'Assets/Icons/Zoom in.png');
    }
}

function toggleNavMenu() {
    isNavMenuOpen = !isNavMenuOpen;

    const navItemsContainer = document.querySelector('#nav-items-container');
    const navArrow = document.querySelector('#nav-arrow');

    if (!navItemsContainer || !navArrow) return;

    if (isNavMenuOpen) {
        // Open menu
        navItemsContainer.setAttribute('visible', true);
        navArrow.setAttribute('src', 'Assets/Icons/Arrow_Up.png'); // Point up
    } else {
        // Close menu
        navItemsContainer.setAttribute('visible', false);
        navArrow.setAttribute('src', 'Assets/Icons/Arrow_Down.png'); // Point down
    }
}

function updateNavHighlight(activeRoom) {
    const roomNames = {
        'bedroom': 'Bedroom',
        'office': 'Office',
        'babybox': 'Baby Box',
        'gallery': 'Gallery',
        'cafe': 'Cafe'
    };

    // Update Header Text
    const headerText = document.querySelector('#nav-current-room');
    if (headerText) {
        headerText.setAttribute('value', roomNames[activeRoom] || activeRoom);
    }

    document.querySelectorAll('.nav-item').forEach(el => {
        const bg = el.querySelector('a-plane');
        const text = el.querySelector('a-text');
        const room = el.getAttribute('data-room');
        
        if (room === activeRoom) {
            bg.setAttribute('color', '#5F4C05');
            text.setAttribute('color', '#FFFFFF');
        } else {
            bg.setAttribute('color', '#393939');
            text.setAttribute('color', '#FFFFFF');
        }
    });
}

// --- CUSTOM LOADER LOGIC ---
const scene = document.querySelector('a-scene');
if (scene) {
    scene.addEventListener('loaded', function () {
        const loader = document.getElementById('custom-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 1000);
        }

        // Add slight rotation animation to flowers
        document.querySelectorAll('a-circle[src*="Flower.png"]').forEach(el => {
            el.setAttribute('animation__rot', {
                property: 'rotation.z',
                from: -5,
                to: 5,
                dir: 'alternate',
                dur: 2000,
                loop: true,
                easing: 'easeInOutSine'
            });
        });
    });
}