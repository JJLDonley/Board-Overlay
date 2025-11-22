import { debug } from '../utils/debugger.js';
import { CommentatorSender } from '../viewer/commentator-sender.js';
import { ViewerController } from '../viewer/viewer-controller.js';

export class NetworkManager {
    constructor() {
        this.role = null; // 'CO' or 'VW'
        this.controller = null;
        this.roomName = null;
    }

    /**
     * Initialize the network manager with a role and room name
     * @param {string} role - 'CO' (Commentator) or 'VW' (Viewer)
     * @param {string} roomName - The VDO.Ninja room name
     */
    initialize(role, roomName) {
        if (this.controller) {
            this.disconnect();
        }

        this.role = role;
        this.roomName = roomName;

        debug.log(`🌐 NetworkManager initializing as ${role} for room: ${roomName}`);

        if (role === 'CO') {
            this.controller = new CommentatorSender();
            this.controller.enable(roomName);
        } else if (role === 'VW') {
            // ViewerController handles its own connection in constructor currently, 
            // but we might want to standardize this. For now, we adapt.
            // The current ViewerController reads URL params directly, which is not ideal for a manager.
            // We will need to refactor ViewerController slightly or just instantiate it.
            // For now, we assume ViewerController reads from URL as before, 
            // BUT we should probably pass the roomName to it to be cleaner.
            
            // Refactor note: ViewerController constructor calls setupNetwork() which reads URL.
            // We will modify ViewerController to accept roomName in constructor/setup.
            this.controller = new ViewerController(roomName); 
        }
    }

    disconnect() {
        if (this.controller) {
            if (this.controller.disable) {
                this.controller.disable();
            } else if (this.controller.disconnect) {
                this.controller.disconnect();
            } else if (this.controller.network) {
                this.controller.network.disconnect();
            }
            this.controller = null;
        }
        this.role = null;
        debug.log('🌐 NetworkManager disconnected');
    }

    /**
     * Update the network connection with a new room name
     * @param {string} newRoomName - The new room name
     */
    updateConnection(newRoomName) {
        if (!newRoomName) return;

        if (newRoomName !== this.roomName) {
            debug.log('🌐 NetworkManager detecting room change:', this.roomName, '->', newRoomName);
            // Re-initialize with same role but new room
            if (this.role) {
                this.initialize(this.role, newRoomName);
            }
        }
    }

    /**
     * Send a command via the active controller
     * @param {object} command 
     */
    send(command) {
        if (this.role === 'CO' && this.controller) {
            this.controller.sendCommand(command);
        } else {
            debug.warn('⚠️ Cannot send command: Not in CO role or no controller');
        }
    }
}
