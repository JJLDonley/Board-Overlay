import { debug } from '../utils/debugger.js';

export class IframeManager {
    constructor() {
        this.iframes = {
            feed: document.getElementById("feed"),
            obs: document.getElementById("obs"),
            chat: document.getElementById("chat")
        };
        this.vdoNinjaBase = "https://vdo.ninja/?";
        this.parseUrlParams();
        if (window.updateSidePanelVisibility) {
            window.updateSidePanelVisibility();
        }
    }

    parseUrlParams() {
        const params = new URLSearchParams(window.location.search);
        // Handle VDO.Ninja view link
        if (params.has('vdo_link')) {
            const vdoLink = params.get('vdo_link');
            if (vdoLink) {
                const processedUrl = this.ensureFeedAudioSettings(vdoLink);
                this.setUrl('feed', processedUrl);
                document.title = vdoLink;
            }
        }
        // Handle chat URL
        if (params.has('chat_url')) {
            const chatUrl = decodeURIComponent(params.get('chat_url'));
            document.getElementById('ChatUrl').value = chatUrl;
            this.setUrl('chat', chatUrl);
        }
        // Handle VDO Ninja link
        const vdoLink = params.get('vdo');
        if (vdoLink) {
            let decodedVdoLink = decodeURIComponent(vdoLink);
            // If still contains % signs, decode again
            if (decodedVdoLink.includes('%')) {
                decodedVdoLink = decodeURIComponent(decodedVdoLink);
            }
            document.getElementById('VideoURL').value = decodedVdoLink;
            // Use ensureFeedAudioSettings to handle noaudio parameter
            const processedUrl = this.ensureFeedAudioSettings(decodedVdoLink);
            document.getElementById('feed').src = processedUrl;
        }
    }

    setVdoNinjaUrl(element, params) {
        const url = new URLSearchParams(params).toString();
        this.setUrl(element, url);
    }

    setUrl(type, url) {
        if (this.iframes[type]) {
            // Special handling for feed iframe to check for noaudio parameter
            if (type === 'feed') {
                url = this.ensureFeedAudioSettings(url);
            }
            
            this.iframes[type].src = url;
            if (window.updateSidePanelVisibility) {
                window.updateSidePanelVisibility();
            }
        }
    }

    ensureFeedAudioSettings(url) {
        try {
            const urlObj = new URL(url);
            
            // Always ensure noaudio parameter is present
            urlObj.searchParams.set('noaudio', '');
            // Also add mute parameter for extra safety
            urlObj.searchParams.set('mute', '1');
            debug.log('🔇 Feed URL ensuring muted:', urlObj.toString());
            
            return urlObj.toString();
        } catch (error) {
            debug.error('Failed to ensure feed audio settings:', error);
            return url;
        }
    }

    generateShareableUrl() {
        const params = new URLSearchParams();
        const vdoLink = document.getElementById('VideoURL').value;
        if (vdoLink) params.append('vdo_link', encodeURIComponent(vdoLink));
        const chatUrl = document.getElementById('ChatUrl').value;
        if (chatUrl) params.append('chat_url', encodeURIComponent(chatUrl));
        // ... add other params as needed ...
        if (window.overlay && window.overlay.points && window.overlay.points.length === 4) {
            params.set('grid', window.overlay.points.map(pt => pt.map(Number).map(n => Math.round(n)).join(',')).join(';'));
        }
        // Add obs_ws param last
        const obsWebSocket = document.getElementById('ObsWebSocket')?.value;
        if (obsWebSocket) {
            // Use the original WebSocket URL without modification
            let formattedUrl = obsWebSocket;
            
            // Only add scenes parameter if we're in restricted control mode
            if (window.obsController && window.obsController.allowedScenes && window.obsController.allowedScenes.length > 0) {
                // Add scenes parameter for restricted control
                debug.log('Adding scenes parameter to shareable URL (restricted control):', window.obsController.allowedScenes);
                formattedUrl += `&scenes=${encodeURIComponent(JSON.stringify(window.obsController.allowedScenes))}`;
            } else {
                debug.log('No scenes parameter added to shareable URL (full control mode)');
            }
            
            // Note: We don't include the password in the shareable URL for security
            // The password should be entered manually by the user
            
            params.set('obs_ws', encodeURIComponent(encodeURIComponent(formattedUrl)));
        }
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }
}