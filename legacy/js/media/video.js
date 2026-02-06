import { debug } from '../utils/debugger.js';
import { IframeManager } from '../managers/iframe-manager.js';

export class Video {
    constructor(source, iframe, link = false) {
        debug.log("Video Constructor called with source:", source);
        this.iframeManager = new IframeManager();
        if (!link) {
            this.iframeManager.setViewerUrl(source);
        } else {
            this.iframeManager.setUrl('feed', source);
        }
    }
} 