export class ConfigManager {
    constructor(iframeManager) {
        this.iframeManager = iframeManager;
        this.configPanel = document.getElementById('configPanel');
        this.toggleBtn = document.getElementById('ToggleConfig');
        this.chatPlatform = document.getElementById('chatPlatform');
        this.chatChannelId = document.getElementById('chatChannelId');
        this.setChatBtn = document.getElementById('setChatBtn');
        this.commentatorRoom = document.getElementById('commentatorRoom');
        this.setCommentatorBtn = document.getElementById('setCommentatorBtn');
        this.shareUrl = document.getElementById('shareUrl');
        this.copyShareUrl = document.getElementById('copyShareUrl');
        
        this.bindEventListeners();
    }

    bindEventListeners() {
        // Toggle configuration panel
        this.toggleBtn.addEventListener('click', () => {
            this.configPanel.classList.toggle('hidden');
        });

        // Set chat
        this.setChatBtn.addEventListener('click', () => {
            const platform = this.chatPlatform.value;
            const channelId = this.chatChannelId.value;
            if (channelId) {
                this.iframeManager.setChatUrl(platform, channelId);
                this.updateShareUrl();
            }
        });

        // Set commentator mode
        this.setCommentatorBtn.addEventListener('click', () => {
            const roomId = this.commentatorRoom.value;
            if (roomId) {
                this.iframeManager.setCommentatorUrl(roomId);
                this.updateShareUrl();
            }
        });

        // Copy share URL
        this.copyShareUrl.addEventListener('click', () => {
            this.shareUrl.select();
            document.execCommand('copy');
        });
    }

    updateShareUrl() {
        const url = this.iframeManager.generateShareableUrl();
        this.shareUrl.value = url;
    }
} 