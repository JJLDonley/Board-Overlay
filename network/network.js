export class VdoNinjaNetwork {
    constructor(roomName) {
        this.roomName = roomName;
        this.iframe = null;
        this.streamID = null;
        this.peers = new Set();
        this.listeners = {};
        this.boundHandleMessage = this.handleMessage.bind(this);
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Callback function
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event internally
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    /**
     * Connect to the VDO.Ninja room
     * @param {string} label - Optional label to identify this peer (e.g. "CO_UUID" or "VW_UUID")
     */
    connect(label) {
        if (this.iframe) return;

        this.iframe = document.createElement('iframe');
        // Use the proven working URL pattern from example.html
        // room=NAME & vd=0 & ad=0 & autostart & cleanoutput
        let url = `https://vdo.ninja/?room=${encodeURIComponent(this.roomName)}&vd=0&ad=0&autostart&cleanoutput`;
        
        if (label) {
            url += `&label=${encodeURIComponent(label)}`;
        }
        
        this.iframe.src = url;
        this.iframe.style.width = '0px';
        this.iframe.style.height = '0px';
        this.iframe.style.position = 'fixed';
        this.iframe.style.left = '-100px';
        this.iframe.style.top = '-100px';
        this.iframe.allow = 'camera;microphone;display-capture;autoplay;';
        
        document.body.appendChild(this.iframe);

        this.boundHandleMessage = this.handleMessage.bind(this);
        window.addEventListener('message', this.boundHandleMessage);
        
        // Auto-disconnect on tab close
        this.boundDisconnect = this.disconnect.bind(this);
        window.addEventListener('beforeunload', this.boundDisconnect);

        this.startPolling();
    }

    startPolling() {
        // Poll for stream IDs every 5 seconds to detect disconnects
        this.pollingInterval = setInterval(() => {
            if (this.iframe && this.iframe.contentWindow) {
                this.iframe.contentWindow.postMessage({ "getStreamIDs": true }, "*");
            }
        }, 5000);
    }

    /**
     * Disconnect from the room and clean up
     */
    disconnect() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        if (this.iframe) {
            // Try to send graceful disconnect command
            if (this.iframe.contentWindow) {
                try {
                    this.iframe.contentWindow.postMessage({ close: true }, '*');
                } catch (e) {
                    // Ignore errors if iframe is already gone
                }
            }
            
            this.iframe.remove();
            this.iframe = null;
        }
        
        if (this.boundHandleMessage) {
            window.removeEventListener('message', this.boundHandleMessage);
        }
        if (this.boundDisconnect) {
            window.removeEventListener('beforeunload', this.boundDisconnect);
        }

        this.streamID = null;
        this.peers.clear();
        this.emit('disconnected', null);
    }

    /**
     * Send a message to all peers
     * @param {string} type - Message type
     * @param {any} payload - Message payload
     */
    send(type, payload) {
        if (!this.iframe || !this.iframe.contentWindow) return;

        const message = {
            type: type,
            payload: payload
        };

        this.iframe.contentWindow.postMessage({
            sendData: JSON.stringify(message)
        }, '*');
    }

    /**
     * Handle incoming messages from the iframe
     * @param {MessageEvent} e 
     */
    handleMessage(e) {
        if (!this.iframe || e.source !== this.iframe.contentWindow) return;

        const data = e.data;

        // Handle getStreamIDs response
        if ('streamIDs' in data) {
            // console.log('Received stream IDs:', data.streamIDs);
            this.emit('streamIDs', data);
            
            // Sync peers list with the server state
            let currentRemoteIDs = new Set();
            
            // Normalize streamIDs to a Set
            if (Array.isArray(data.streamIDs)) {
                data.streamIDs.forEach(id => currentRemoteIDs.add(id));
            } else if (typeof data.streamIDs === 'object' && data.streamIDs !== null) {
                Object.keys(data.streamIDs).forEach(id => currentRemoteIDs.add(id));
            }

            // 1. Detect new peers (in remote but not in local)
            currentRemoteIDs.forEach(id => {
                // Ignore our own ID
                if (id !== this.streamID && !this.peers.has(id)) {
                    this.peers.add(id);
                    this.emit('peer-joined', id);
                }
            });

            // 2. Detect left peers (in local but not in remote)
            this.peers.forEach(id => {
                if (!currentRemoteIDs.has(id)) {
                    this.peers.delete(id);
                    this.emit('peer-left', id);
                }
            });
        }

        // Handle data messages
        if ('dataReceived' in data) {
            try {
                let parsed = data.dataReceived;
                // Parse JSON if it's a string
                if (typeof parsed === 'string') {
                    try {
                        parsed = JSON.parse(parsed);
                    } catch (err) {
                        // Not JSON, treat as raw string
                    }
                }

                const sender = data.streamID || data.UUID || 'Unknown';
                
                // If parsed data has type/payload structure
                if (parsed && typeof parsed === 'object' && parsed.type) {
                    // Emit generic message event
                    this.emit('message', {
                        sender: sender,
                        type: parsed.type,
                        payload: parsed.payload
                    });

                    // Emit specific type event
                    this.emit(parsed.type, {
                        sender: sender,
                        payload: parsed.payload
                    });
                } else {
                    // Raw message or other format
                    this.emit('message', {
                        sender: sender,
                        type: 'raw',
                        payload: parsed
                    });
                }
            } catch (err) {
                console.error('Error processing message:', err);
            }
        }

        // Handle system events
        if ('action' in data) {
            switch (data.action) {
                case 'share-link':
                    // value: 'https://vdo.ninja/?view=STREAMID'
                    if (data.value) {
                        const match = data.value.match(/view=([^&]+)/);
                        if (match && match[1]) {
                            this.streamID = match[1];
                            console.log('Local Stream ID detected from share-link:', this.streamID);
                            this.emit('ready', this.streamID);
                        }
                    }
                    break;
                case 'joined-room':
                case 'joined-room-complete':
                    if (!this.isConnected) {
                        this.isConnected = true;
                        this.emit('connected', null);
                        // Request stream IDs upon joining as requested by user
                        this.iframe.contentWindow.postMessage({ "getStreamIDs": true }, "*");
                    }
                    break;
                case 'stream-id-detected':
                    // This is for INCOMING streams only, as clarified by user.
                    // We do NOT set this.streamID here.
                    break;
                case 'push-connection-info':
                    // New peer connecting
                    if (data.UUID) {
                         if (!this.peers.has(data.UUID)) {
                             this.peers.add(data.UUID);
                             this.emit('peer-joined', data.UUID);
                         }
                    }
                    break;
                case 'push-connection':
                    // Peer disconnected (value === false)
                    if (data.value === false && data.UUID) {
                        this.peers.delete(data.UUID);
                        this.emit('peer-left', data.UUID);
                    } else if (data.value === true && data.UUID) {
                         if (!this.peers.has(data.UUID)) {
                             this.peers.add(data.UUID);
                             this.emit('peer-joined', data.UUID);
                         }
                    }
                    break;
            }
        }
    }
}
