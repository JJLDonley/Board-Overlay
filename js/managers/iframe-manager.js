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
        const role = params.get("role");
        const isViewer = role === "VW";
        // Handle chat URL
        if (params.has('Chat') && !isViewer) {
            const chatUrl = decodeURIComponent(params.get('Chat'));
            document.getElementById('ChatUrl').value = chatUrl;
            this.setUrl('chat', chatUrl);
        }
        // Handle VDO Ninja link
        const vdoLink = params.get('OTB');
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
        // Handle OBS VDO Ninja link
        const obsLink = params.get('obs');
        if (obsLink && !isViewer) {
            let decodedObsLink = decodeURIComponent(obsLink);
            if (decodedObsLink.includes('%')) {
                decodedObsLink = decodeURIComponent(decodedObsLink);
            }
            const obsInput = document.getElementById('ObsVdoUrl');
            if (obsInput) obsInput.value = decodedObsLink;
            this.setUrl('obs', decodedObsLink);
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
        if (vdoLink) {
            params.set('OTB', encodeURIComponent(encodeURIComponent(vdoLink)));
        }
        const chatUrl = document.getElementById('ChatUrl').value;
        if (chatUrl) params.set('Chat', encodeURIComponent(chatUrl));
        const obsLink = document.getElementById('ObsVdoUrl')?.value;
        if (obsLink) {
            params.set('obs', encodeURIComponent(encodeURIComponent(obsLink)));
        }
        const networkRoom = document.getElementById('NetworkRoom')?.value;
        if (networkRoom) {
            params.set('Network', encodeURIComponent(networkRoom));
        }
        const coordColor = document.getElementById('coordinateColor')?.value;
        if (coordColor) {
            params.set('CC', coordColor);
        }
        const stoneSize = document.getElementById('StoneSize')?.value;
        if (stoneSize) {
            params.set('stone', stoneSize);
        }
        if (window.overlay && window.overlay.points && window.overlay.points.length === 4) {
            params.set('grid', window.overlay.points.map(pt => pt.map(Number).map(n => Math.round(n)).join(',')).join(';'));
        }
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }
}
