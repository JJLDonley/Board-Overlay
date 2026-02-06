import { debug } from "../utils/debugger.js";
import { STONES } from "../constants.js";
import { VdoNinjaNetwork } from "../../network/network.js";

export class CommentatorSender {
    constructor() {
        this.network = null;
        this.enabled = false;
        this.roomName = null;

        // Map to store cursor data for each user
        // Key: senderId, Value: { element, label, currentX, currentY, targetX, targetY, visible, timeout }
        this.cursors = new Map();
        this.lerpSpeed = 0.3;

        this.uuid = this.generateUUID();
        debug.log(
            "📡 CommentatorSender (CO) initialized with UUID:",
            this.uuid,
        );

        this.startCursorAnimation();
    }

    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
                var r = Math.random() * 16 | 0,
                    v = c == "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            },
        );
    }

    enable(roomName) {
        if (!roomName) {
            debug.error("❌ No room name provided for commentator sender");
            return;
        }

        this.roomName = roomName;
        this.enabled = true;

        // Initialize network with the room name
        this.network = new VdoNinjaNetwork(this.roomName);

        // Connect with CO label
        const label = `CO_${this.uuid}`;
        this.network.connect(label);

        // Listen for peer joins to sync state
        this.network.on("peer-joined", (peerId) => {
            debug.log("👤 Peer joined:", peerId);
            this.sendCurrentState();
        });

        // Listen for commands from other commentators
        this.network.on("command", (data) => {
            this.handleCommand(data);
        });

        this.network.on("connected", () => {
            debug.log("✅ Network connected");
        });

        debug.log("📡 CommentatorSender enabled for room:", roomName);
    }

    disable() {
        this.enabled = false;
        if (this.network) {
            this.network.disconnect();
            this.network = null;
        }
        debug.log("📡 CommentatorSender disabled");
    }

    handleCommand(data) {
        const { sender, payload } = data;

        // Ignore commands from self
        if (this.network && this.network.label === sender) {
            return;
        }

        // Accept all commands from other commentators (same as viewer)
        // Commentators receive everything viewers receive, but also send their own actions
        if (payload && payload.role === "CO") {
            // debug.log('📥 Commentator received CO command from:', sender, payload);
            this.processCommand(payload, sender);
        }
    }

    processCommand(command, sender) {
        switch (command.action) {
            case "set-grid":
                if (window.overlay) {
                    window.overlay.points = command.points;
                    window.overlay.grid = window.overlay.generateGrid(
                        command.points,
                    );
                    window.overlay.isGridSet = true;
                    window.overlay.updateGridButtonState();
                }
                break;

            case "place-stone":
                if (window.overlay) {
                    if (
                        command.color === "BOARD" ||
                        command.color === "REMOVE_BOARD"
                    ) {
                        window.overlay.placeBoardStone(
                            command.x,
                            command.y,
                            command.color,
                        );
                    } else {
                        window.overlay.placeStone(
                            command.x,
                            command.y,
                            command.color,
                        );
                    }
                }
                break;

            case "draw-tool":
                if (window.drawingLayer) {
                    switch (command.drawAction) {
                        case "start":
                            window.drawingLayer.startDrawingAt(
                                command.x,
                                command.y,
                                command.tool,
                            );
                            break;
                        case "draw":
                            window.drawingLayer.drawTo(command.x, command.y);
                            break;
                        case "end":
                            window.drawingLayer.endDrawing();
                            break;
                    }
                }
                break;

            case "draw-batch":
                if (
                    window.drawingLayer && command.points &&
                    command.points.length > 0
                ) {
                    // Use the same smooth rendering as the viewer
                    this.drawSmoothBatch(command.points, command.color);
                    debug.log(
                        `🎨 Processed drawing batch with ${command.points.length} points`,
                    );
                }
                break;

            case "place-stone":
                this.placeStone(command.x, command.y, command.color);
                break;

            case "add-mark":
                if (window.drawingLayer) {
                    window.drawingLayer.addMark(
                        command.type,
                        command.x,
                        command.y,
                        command.text,
                    );
                }
                break;

            case "clear-drawing":
                if (window.drawingLayer) window.drawingLayer.clearCanvas(false);
                break;

            case "clear-all":
                if (window.drawingLayer) window.drawingLayer.clearCanvas(false);
                if (window.overlay) window.overlay.clearStones();
                break;

            case "reset-board":
                if (window.overlay) window.overlay.resetGrid();
                break;

            case "toggle-grid":
                if (window.overlay) {
                    window.overlay.show = command.visible;
                    window.overlay.updateGridButtonState();
                }
                break;

            case "set-tool":
                if (window.setCurrentTool) window.setCurrentTool(command.tool);
                document.querySelectorAll(".tool-btn").forEach((btn) =>
                    btn.classList.remove("active")
                );
                const toolButtons = {
                    "BLACK": "BlackStoneBtn",
                    "WHITE": "WhiteStoneBtn",
                    "ALTERNATING": "AlternatingBtn",
                    "PEN": "PenBtn",
                    "TRIANGLE": "TriangleBtn",
                    "CIRCLE": "CircleBtn",
                    "SQUARE": "SquareBtn",
                    "LETTER": "LetterBtn",
                };
                const btnId = toolButtons[command.tool];
                if (btnId) {
                    const btn = document.getElementById(btnId);
                    if (btn) btn.classList.add("active");
                }
                break;

            case "switch-color":
                if (window.overlay) {
                    window.overlay.currentColor = command.color;
                    debug.log("🎨 Switched current color to:", command.color);
                }
                break;

            case "remove-stone":
                this.removeStone(command.x, command.y);
                break;

            case "cursor-move":
                this.updateCursor(sender, command.x, command.y, command.label);
                break;

            case "set-label":
                this.updateCursorLabel(sender, command.label);
                break;
        }
    }

    updateCursorLabel(senderId, label) {
        let cursor = this.cursors.get(senderId);
        if (cursor) {
            cursor.label = label;
            const labelEl = cursor.element.querySelector(".cursor-label");
            if (labelEl) labelEl.textContent = label;
        } else {
            // If cursor doesn't exist yet, we can create it or just wait for a move
            // For now, let's wait for a move as we don't have coordinates
            debug.log(
                `👤 Received label for unknown cursor ${senderId}: ${label}`,
            );
        }
    }

    drawSmoothBatch(points, color) {
        if (
            !window.drawingLayer || !window.drawingLayer.context ||
            points.length === 0
        ) return;

        const context = window.drawingLayer.context;
        const originalColor = context.strokeStyle;
        const originalLineWidth = context.lineWidth;

        // Set drawing properties
        if (color) {
            context.strokeStyle = color;
        }
        context.lineWidth = 2;
        context.lineCap = "round";
        context.lineJoin = "round";

        // If we only have one point, draw a small dot
        if (points.length === 1) {
            context.beginPath();
            context.arc(points[0][0], points[0][1], 1, 0, 2 * Math.PI);
            context.fill();
            return;
        }

        // Use quadratic curves for smooth interpolation between points
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);

        // For smoother curves, we'll use every point as a control point
        for (let i = 1; i < points.length; i++) {
            const currentPoint = points[i];

            if (i === points.length - 1) {
                // Last point - draw straight line
                context.lineTo(currentPoint[0], currentPoint[1]);
            } else {
                // Use next point to create smooth curve
                const nextPoint = points[i + 1];
                const controlX = (currentPoint[0] + nextPoint[0]) / 2;
                const controlY = (currentPoint[1] + nextPoint[1]) / 2;

                context.quadraticCurveTo(
                    currentPoint[0],
                    currentPoint[1],
                    controlX,
                    controlY,
                );
            }
        }

        context.stroke();

        // Restore original properties
        context.strokeStyle = originalColor;
        context.lineWidth = originalLineWidth;
    }

    sendCommand(command) {
        if (!this.enabled || !this.network) {
            return;
        }

        // Add timestamp if not present
        if (!command.timestamp) {
            command.timestamp = Date.now();
        }

        // Add role for identification
        command.role = "CO";

        // Send to all peers
        this.network.send("command", command);

        // debug.log('📡 Sent command:', command);
    }

    // Convenience methods for different actions
    sendStone(x, y, color) {
        this.sendCommand({
            action: "place-stone",
            x: x,
            y: y,
            color: color,
        });
    }

    sendDrawing(drawAction, x, y, tool) {
        this.sendCommand({
            action: "draw-tool",
            drawAction: drawAction,
            x: x,
            y: y,
            tool: tool,
        });
    }

    sendGridToggle(visible) {
        this.sendCommand({
            action: "toggle-grid",
            visible: visible,
        });
    }

    sendReset() {
        this.sendCommand({
            action: "reset-board",
        });
    }

    sendClear() {
        this.sendCommand({
            action: "clear-drawing",
        });
    }

    sendClearAll() {
        this.sendCommand({
            action: "clear-all",
        });
    }

    sendClearDrawing() {
        this.sendCommand({
            action: "clear-drawing",
        });
    }

    sendTool(tool) {
        this.sendCommand({
            action: "set-tool",
            tool: tool,
        });
    }

    sendLabel(label) {
        this.sendCommand({
            action: "set-label",
            label: label,
        });
    }

    sendGridCoordinates(points) {
        this.sendCommand({
            action: "set-grid",
            points: points,
        });
        debug.log("📐 Sent grid coordinates to viewers:", points);
    }

    // Send complete current state to viewers
    sendCurrentState() {
        if (!this.enabled || !window.overlay) return;

        debug.log("🔄 Sending full state snapshot...");

        // Send my label
        if (window.cursorLabel) {
            this.sendLabel(window.cursorLabel);
        }

        // Send grid coordinates if available
        if (window.overlay.points && window.overlay.points.length === 4) {
            this.sendGridCoordinates(window.overlay.points);
        }

        // Send all stones
        if (window.overlay.stones && window.overlay.stones.length > 0) {
            window.overlay.stones.forEach((stone) => {
                const [x, y, color] = stone;
                // Compare with actual STONES constants (imported from constants.js)
                const colorName = color === STONES.BLACK
                    ? "BLACK"
                    : color === STONES.WHITE
                    ? "WHITE"
                    : "BOARD";
                this.sendStone(x, y, colorName);
            });
        }

        // Send all board stones
        if (
            window.overlay.boardStones && window.overlay.boardStones.length > 0
        ) {
            window.overlay.boardStones.forEach((stone) => {
                const [x, y] = stone;
                this.sendStone(x, y, "BOARD");
            });
        }

        // Send all drawing paths
        if (
            window.drawingLayer && window.drawingLayer.paths &&
            window.drawingLayer.paths.length > 0
        ) {
            window.drawingLayer.paths.forEach((path) => {
                if (path.points && path.points.length > 0) {
                    this.sendCommand({
                        action: "draw-batch",
                        points: path.points,
                        color: path.color,
                    });
                }
            });
        }

        // Send all marks
        if (
            window.drawingLayer && window.drawingLayer.marks &&
            window.drawingLayer.marks.length > 0
        ) {
            window.drawingLayer.marks.forEach((mark) => {
                this.sendCommand({
                    action: "add-mark",
                    type: mark.type,
                    x: mark.x,
                    y: mark.y,
                    text: mark.text || "",
                });
            });
        }

        debug.log("📡 Sent complete current state to viewers");
    }

    placeStone(x, y, color) {
        if (!window.overlay) return;

        // Commentators don't scale coordinates (1:1)
        // Remove any existing stone at this position
        const existingIndex = window.overlay.stones.findIndex(
            ([sx, sy]) => sx === x && sy === y,
        );
        if (existingIndex >= 0) {
            window.overlay.stones.splice(existingIndex, 1);
        }

        // Add the new stone if not a removal command
        if (color === "BLACK") {
            window.overlay.stones.push([x, y, STONES.BLACK]);
        } else if (color === "WHITE") {
            window.overlay.stones.push([x, y, STONES.WHITE]);
        } else if (color === "BOARD") {
            // Handle board stones
            window.overlay.boardStones.push([x, y, STONES.BOARD]);
        } else if (color === "REMOVE_BOARD") {
            // Remove board stone
            const boardIndex = window.overlay.boardStones.findIndex(
                ([sx, sy]) => sx === x && sy === y,
            );
            if (boardIndex >= 0) {
                window.overlay.boardStones.splice(boardIndex, 1);
            }
        }

        debug.log(`🪨 Placed ${color} stone at (${x}, ${y})`);
    }

    removeStone(x, y) {
        if (!window.overlay) return;

        // Remove stone from stones array
        const stoneIndex = window.overlay.stones.findIndex(
            ([sx, sy]) => sx === x && sy === y,
        );
        if (stoneIndex >= 0) {
            window.overlay.stones.splice(stoneIndex, 1);
            debug.log(`🗑️ Removed stone at (${x}, ${y})`);
        }
    }

    createCursorElement(senderId, label) {
        // Create cursor container
        const container = document.createElement("div");
        container.id = `cursor-${senderId}`;
        container.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 999999 !important;
            display: none;
            transition: opacity 0.2s;
        `;

        // Create SVG cursor (white arrow with black border)
        // Generate a unique color for this sender
        const hue = this.getHash(senderId) % 360;
        const color = `hsl(${hue}, 70%, 50%)`;

        const cursorSvg = document.createElement("div");
        cursorSvg.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5)); transform: rotate(-15deg);">
                <path d="M0,0 L0,16 L5,11 L9,19 L11,18 L7,10 L12,10 Z" 
                      fill="${color}" 
                      stroke="white" 
                      stroke-width="1.5"/>
            </svg>
        `;

        // Create label
        const labelDiv = document.createElement("div");
        labelDiv.className = "cursor-label";
        labelDiv.textContent = label || `User ${senderId.substring(0, 4)}`;
        labelDiv.style.cssText = `
            background-color: ${color};
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 12px;
            margin-top: -4px;
            white-space: nowrap;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
        `;

        container.appendChild(cursorSvg);
        container.appendChild(labelDiv);
        document.body.appendChild(container);

        return container;
    }

    getHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    }

    updateCursor(senderId, x, y, label) {
        if (!senderId) return;

        // In Commentator mode, we don't scale coordinates (1:1 with other commentators)
        // Unless we are on a different resolution, but for now assume all commentators use 1280x720 base

        let cursor = this.cursors.get(senderId);

        if (!cursor) {
            const element = this.createCursorElement(senderId, label);
            cursor = {
                element: element,
                label: label,
                currentX: x,
                currentY: y,
                targetX: x,
                targetY: y,
                visible: true,
                timeout: null,
            };
            this.cursors.set(senderId, cursor);
            debug.log(
                `👤 New cursor created for ${senderId} with label: ${label}`,
            );
        } else {
            // Update label if it changed
            if (label && cursor.label !== label) {
                cursor.label = label;
                const labelEl = cursor.element.querySelector(".cursor-label");
                if (labelEl) labelEl.textContent = label;
            }
        }

        // Update target position
        cursor.targetX = x;
        cursor.targetY = y;
        cursor.visible = true;
        cursor.element.style.display = "block";
        cursor.element.style.opacity = "1";

        // Reset timeout
        if (cursor.timeout) clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            cursor.visible = false;
            cursor.element.style.opacity = "0";
        }, 3000);
    }

    startCursorAnimation() {
        const animateCursors = () => {
            this.cursors.forEach((cursor) => {
                if (
                    !cursor.visible &&
                    Math.abs(cursor.element.style.opacity) < 0.01
                ) return;

                // Lerp
                cursor.currentX += (cursor.targetX - cursor.currentX) *
                    this.lerpSpeed;
                cursor.currentY += (cursor.targetY - cursor.currentY) *
                    this.lerpSpeed;

                this.updateCursorPosition(cursor);
            });

            requestAnimationFrame(animateCursors);
        };

        requestAnimationFrame(animateCursors);
    }

    updateCursorPosition(cursor) {
        const canvas = document.getElementById("overlay");
        if (canvas && cursor.element) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;

            // Convert canvas coordinates to page coordinates
            const pageX = rect.left + window.scrollX +
                (cursor.currentX * scaleX);
            const pageY = rect.top + window.scrollY +
                (cursor.currentY * scaleY);

            cursor.element.style.left = pageX + "px";
            cursor.element.style.top = pageY + "px";
        }
    }
}
