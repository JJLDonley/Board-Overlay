import { debug } from "../utils/debugger.js";
import { PeerController } from "../viewer/peer-controller.js";

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

        debug.log(
            `🌐 NetworkManager initializing as ${role} for room: ${roomName}`,
        );

        this.controller = new PeerController(roomName, {
            isViewer: role === "VW",
        });
    }

    disconnect() {
        if (this.controller) {
            if (this.controller.disconnect) {
                this.controller.disconnect();
            }
            this.controller = null;
        }
        this.role = null;
        debug.log("🌐 NetworkManager disconnected");
    }

    /**
     * Update the network connection with a new room name
     * @param {string} newRoomName - The new room name
     */
    updateConnection(newRoomName) {
        if (!newRoomName) return;

        if (newRoomName !== this.roomName) {
            debug.log(
                "🌐 NetworkManager detecting room change:",
                this.roomName,
                "->",
                newRoomName,
            );
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
        if (this.role === "CO" && this.controller) {
            this.controller.sendCommand(command);
        } else {
            debug.warn(
                "⚠️ Cannot send command: Not in CO role or no controller",
            );
        }
    }

    getOwnerId() {
        if (this.controller && this.controller.getOwnerId) {
            return this.controller.getOwnerId();
        }
        return null;
    }

    setLabel(label, hostTag = null) {
        if (this.controller && this.controller.setLabel) {
            this.controller.setLabel(label, hostTag);
        }
    }
}
