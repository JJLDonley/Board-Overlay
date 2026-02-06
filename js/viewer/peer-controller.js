import { debug } from "../utils/debugger.js";
import { STONES } from "../constants.js";
import { VdoNinjaNetwork } from "../../network/network.js";
import { getHostColor } from "../utils/color-utils.js";

export class PeerController {
    constructor(roomName = null, options = {}) {
        this.isViewer = Boolean(options.isViewer);
        this.network = null;
        this.roomName = roomName;

        // Key: ownerId, Value: { element, label, currentX, currentY, targetX, targetY, visible, timeout, color }
        this.cursors = new Map();
        this.ownerMeta = new Map();
        this.activeDrawPaths = new Map();

        this.lerpSpeed = 0.3;
        this.ownerId = this.generateUUID();
        this.label = null;
        this.localColor = null;

        this.setupNetwork(roomName);
        this.startCursorAnimation();
    }

    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
                const r = Math.random() * 16 | 0;
                const v = c == "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            },
        );
    }

    getOwnerId() {
        return this.ownerId;
    }

    setupNetwork(providedRoomName) {
        const roomName = providedRoomName || this.roomName;
        if (!roomName) {
            debug.error("No room name found for PeerController");
            return;
        }

        this.network = new VdoNinjaNetwork(roomName);

        const labelPrefix = this.isViewer ? "VW" : "CO";
        this.network.connect(`${labelPrefix}_${this.ownerId}`);

        this.network.on("peer-joined", (peerId) => {
            if (!this.isViewer) {
                debug.log("Peer joined:", peerId);
                this.sendCurrentState();
            }
        });

        this.network.on("peer-left", (peerId) => {
            this.removeCursor(peerId);
        });

        this.network.on("command", (data) => {
            this.handleCommand(data);
        });

        this.network.on("connected", () => {
            debug.log("Network connected");
        });
    }

    disconnect() {
        if (this.network) {
            this.network.disconnect();
            this.network = null;
        }
    }

    setLabel(label, hostTag = null) {
        if (!label) return;
        this.label = label;
        const overrideColor = hostTag && hostTag.startsWith("#")
            ? hostTag
            : null;
        const resolvedHostTag = overrideColor ? null : hostTag;
        this.localColor = overrideColor ||
            getHostColor(resolvedHostTag || label);
        this.updateOwnerMeta(
            this.ownerId,
            label,
            this.localColor,
            resolvedHostTag,
        );

        if (!this.isViewer) {
            this.sendCommand({
                action: "set-label",
                label: label,
                color: this.localColor,
                hostTag: resolvedHostTag,
            });
        }
    }

    updateOwnerMeta(ownerId, label = null, color = null, hostTag = null) {
        const current = this.ownerMeta.get(ownerId) || {};
        const nextLabel = label || current.label || "";
        const nextHostTag = hostTag || current.hostTag || null;
        let nextColor = color || current.color;
        if (!nextColor) {
            const colorSource = nextHostTag || nextLabel || ownerId;
            nextColor = getHostColor(colorSource);
        }
        this.ownerMeta.set(ownerId, {
            label: nextLabel,
            color: nextColor,
            hostTag: nextHostTag,
        });
        return { label: nextLabel, color: nextColor, hostTag: nextHostTag };
    }

    sendCommand(command) {
        if (this.isViewer || !this.network) {
            return;
        }

        if (!command.timestamp) {
            command.timestamp = Date.now();
        }

        if (!command.ownerId) {
            command.ownerId = this.ownerId;
        }

        command.role = "CO";
        this.network.send("command", command);
    }

    handleCommand(data) {
        const { sender, payload } = data;
        if (!payload) return;

        if (payload.role && payload.role !== "CO") {
            return;
        }

        if (payload.ownerId && payload.ownerId === this.ownerId) {
            return;
        }

        this.processCommand(payload, sender);
    }

    processCommand(command, sender) {
        const ownerId = command.ownerId || sender;

        switch (command.action) {
            case "set-grid":
                this.setGrid(command.points);
                break;

            case "reset-grid":
            case "reset-board":
                this.resetBoard();
                break;

            case "toggle-grid":
                this.toggleGrid(command.visible);
                break;

            case "place-stone":
                this.placeStone(
                    command.x,
                    command.y,
                    command.color,
                    ownerId,
                    command.markerColor,
                );
                break;

            case "remove-stone":
                this.removeStone(command.x, command.y, ownerId);
                break;

            case "add-mark":
                this.addMark(
                    command.type,
                    command.x,
                    command.y,
                    command.text,
                    ownerId,
                    command.color,
                );
                break;

            case "draw-batch":
                this.handleDrawingBatch(command, ownerId);
                break;

            case "draw-start":
                this.startRemoteDrawing(command, ownerId);
                break;

            case "draw-end":
                this.endRemoteDrawing(ownerId);
                break;

            case "switch-color":
                if (window.overlay && window.overlay.setOwnerColor) {
                    window.overlay.setOwnerColor(ownerId, command.color);
                }
                break;

            case "cursor-move":
                this.updateCursor(
                    ownerId,
                    command.x,
                    command.y,
                    command.label,
                    command.color,
                    command.hostTag,
                );
                break;

            case "set-label":
                this.updateCursorLabel(
                    ownerId,
                    command.label,
                    command.color,
                    command.hostTag,
                );
                break;

            case "coordinate-color":
                this.updateCoordinateColor(command.color);
                break;

            case "stone-marker-style":
                if (window.overlay && window.overlay.setMarkerStyle) {
                    window.overlay.setMarkerStyle(command.style, false);
                }
                break;

            case "undo-stone":
                if (window.overlay && window.overlay.undoLastStone) {
                    window.overlay.undoLastStone(ownerId, false);
                }
                break;

            case "redo-stone":
                if (window.overlay && window.overlay.redoStone) {
                    window.overlay.redoStone(ownerId, false);
                }
                break;

            case "clear-owner":
                this.clearOwner(ownerId);
                break;

            case "clear-drawing":
                this.clearDrawing();
                break;

            case "clear-all":
                this.clearAll();
                break;

            case "set-tool":
                this.setTool(command.tool);
                break;

            default:
                debug.log("Unknown command:", command.action);
                break;
        }
    }

    updateCoordinateColor(color) {
        if (!color) return;
        const coordInput = document.getElementById("coordinateColor");
        if (coordInput) {
            coordInput.value = color;
        }
    }

    setGrid(points) {
        if (window.overlay && points && points.length === 4) {
            window.overlay.points = points;
            window.overlay.grid = window.overlay.generateGrid(points);
            window.overlay.isGridSet = true;
            window.overlay.updateGridButtonState();

            if (window.isViewerMode) {
                window.overlay.show = false;
                window.overlay.updateGridButtonState();
            }
        }
    }

    resetBoard() {
        if (window.overlay && window.overlay.resetGrid) {
            window.overlay.resetGrid();
        }
    }

    toggleGrid(visible) {
        if (!window.overlay) return;

        if (window.isViewerMode) {
            window.overlay.show = false;
        } else {
            window.overlay.show = Boolean(visible);
        }
        window.overlay.updateGridButtonState();
    }

    placeStone(x, y, color, ownerId, markerColor = null) {
        if (!window.overlay) return;

        if (color === "BOARD" || color === "REMOVE_BOARD") {
            window.overlay.placeBoardStone(x, y, color, ownerId);
            return;
        }

        window.overlay.placeStone(x, y, color, ownerId, {
            markerColor: markerColor,
        });
    }

    removeStone(x, y, ownerId) {
        if (window.overlay && window.overlay.removeStone) {
            window.overlay.removeStone(x, y, ownerId);
        }
    }

    handleDrawingBatch(command, ownerId) {
        if (
            window.drawingLayer && command.points && command.points.length > 0
        ) {
            const activePath = this.activeDrawPaths.get(ownerId);
            const resolvedColor = command.color ||
                activePath?.color ||
                this.updateOwnerMeta(ownerId).color;
            if (activePath) {
                const lastPoint = activePath.points.length > 0
                    ? activePath.points[activePath.points.length - 1]
                    : null;
                const drawPoints = lastPoint
                    ? [lastPoint, ...command.points]
                    : command.points;
                window.drawingLayer.drawSmoothBatch(drawPoints, resolvedColor);
                activePath.points.push(...command.points);
                activePath.color = resolvedColor;
            } else {
                window.drawingLayer.drawSmoothBatch(
                    command.points,
                    resolvedColor,
                );
                window.drawingLayer.addPathSegment(
                    ownerId,
                    command.points,
                    resolvedColor,
                );
            }
        }
    }

    startRemoteDrawing(command, ownerId) {
        if (!window.drawingLayer) return;
        if (this.activeDrawPaths.has(ownerId)) {
            this.endRemoteDrawing(ownerId);
        }
        const startPoint = [command.x, command.y];
        const resolvedColor = command.color ||
            this.updateOwnerMeta(ownerId).color;
        this.activeDrawPaths.set(ownerId, {
            points: [startPoint],
            color: resolvedColor,
        });
        window.drawingLayer.drawSmoothBatch([startPoint], resolvedColor);
    }

    endRemoteDrawing(ownerId) {
        if (!window.drawingLayer) return;
        const activePath = this.activeDrawPaths.get(ownerId);
        if (activePath && activePath.points.length > 0) {
            window.drawingLayer.addPathSegment(
                ownerId,
                activePath.points,
                activePath.color,
            );
        }
        this.activeDrawPaths.delete(ownerId);
    }

    addMark(type, x, y, text, ownerId, color) {
        if (window.drawingLayer && window.drawingLayer.addMark) {
            const resolvedColor = color ||
                this.updateOwnerMeta(ownerId).color;
            window.drawingLayer.addMark(
                type,
                x,
                y,
                text || "",
                ownerId,
                resolvedColor,
            );
        }
    }

    clearDrawing() {
        if (window.drawingLayer && window.drawingLayer.clearCanvas) {
            window.drawingLayer.clearCanvas(false);
        }
    }

    clearOwner(ownerId) {
        if (window.overlay && window.overlay.clearOwnerData) {
            window.overlay.clearOwnerData(ownerId);
        }
        if (window.drawingLayer && window.drawingLayer.clearOwner) {
            window.drawingLayer.clearOwner(ownerId);
        }
    }

    clearAll() {
        if (window.drawingLayer && window.drawingLayer.clearCanvas) {
            window.drawingLayer.clearCanvas(false);
        }
        if (window.overlay && window.overlay.clearStones) {
            window.overlay.clearStones();
        }
    }

    setTool(tool) {
        if (window.setCurrentTool) {
            window.setCurrentTool(tool);
        }

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

        const buttonId = toolButtons[tool];
        if (buttonId) {
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.add("active");
            }
        }
    }

    updateCursor(ownerId, x, y, label, color, hostTag) {
        if (!ownerId) return;

        const meta = this.updateOwnerMeta(ownerId, label, color, hostTag);
        const resolvedLabel = meta.label || label;
        const labelText = resolvedLabel && resolvedLabel.trim()
            ? resolvedLabel
            : `User ${ownerId.substring(0, 4)}`;
        const resolvedColor = meta.color;

        let cursor = this.cursors.get(ownerId);
        if (!cursor) {
            const element = this.createCursorElement(ownerId, labelText);
            this.applyCursorColor(element, resolvedColor);
            cursor = {
                element: element,
                label: labelText,
                color: resolvedColor,
                currentX: x,
                currentY: y,
                targetX: x,
                targetY: y,
                visible: true,
                timeout: null,
            };
            this.cursors.set(ownerId, cursor);
        } else {
            cursor.label = labelText;
            cursor.color = resolvedColor;
            this.applyCursorLabel(cursor.element, labelText);
            this.applyCursorColor(cursor.element, resolvedColor);
        }

        cursor.targetX = x;
        cursor.targetY = y;
        cursor.visible = true;
        cursor.element.style.display = "block";
        cursor.element.style.opacity = "1";

        if (cursor.timeout) clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            cursor.visible = false;
            cursor.element.style.opacity = "0";
        }, 3000);
    }

    updateCursorLabel(ownerId, label, color, hostTag) {
        if (!ownerId) return;
        const meta = this.updateOwnerMeta(ownerId, label, color, hostTag);
        const labelText = meta.label && meta.label.trim()
            ? meta.label
            : `User ${ownerId.substring(0, 4)}`;
        const cursor = this.cursors.get(ownerId);
        if (cursor) {
            cursor.label = labelText;
            cursor.color = meta.color;
            this.applyCursorLabel(cursor.element, labelText);
            this.applyCursorColor(cursor.element, meta.color);
        }
    }

    applyCursorLabel(element, label) {
        if (!element || this.isViewer) return;
        const labelEl = element.querySelector(".cursor-label");
        if (labelEl) {
            labelEl.textContent = label || "";
        }
    }

    applyCursorColor(element, color) {
        if (!element || !color) return;
        const path = element.querySelector("svg path");
        if (path) {
            path.setAttribute("fill", color);
        }
        const labelEl = element.querySelector(".cursor-label");
        if (labelEl) {
            labelEl.style.backgroundColor = color;
        }
    }

    createCursorElement(ownerId, label) {
        const container = document.createElement("div");
        container.id = `cursor-${ownerId}`;
        container.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 999999 !important;
            display: none;
            transition: opacity 0.2s;
        `;

        const color = getHostColor(label || ownerId);

        const cursorSvg = document.createElement("div");
        cursorSvg.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5)); transform: rotate(-15deg);">
                <path d="M0,0 L0,16 L5,11 L9,19 L11,18 L7,10 L12,10 Z" 
                      fill="${color}" 
                      stroke="white" 
                      stroke-width="1.5"/>
            </svg>
        `;

        let labelDiv = null;
        if (!this.isViewer) {
            labelDiv = document.createElement("div");
            labelDiv.className = "cursor-label";
            labelDiv.textContent = label || "";
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
        }

        container.appendChild(cursorSvg);
        if (labelDiv) {
            container.appendChild(labelDiv);
        }
        document.body.appendChild(container);

        return container;
    }

    startCursorAnimation() {
        const animateCursors = () => {
            this.cursors.forEach((cursor) => {
                if (
                    !cursor.visible &&
                    Math.abs(cursor.element.style.opacity) < 0.01
                ) return;

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

            const pageX = rect.left + window.scrollX +
                (cursor.currentX * scaleX);
            const pageY = rect.top + window.scrollY +
                (cursor.currentY * scaleY);

            cursor.element.style.left = pageX + "px";
            cursor.element.style.top = pageY + "px";
        }
    }

    removeCursor(ownerId) {
        const cursor = this.cursors.get(ownerId);
        if (cursor && cursor.element) {
            cursor.element.remove();
        }
        this.cursors.delete(ownerId);
        this.ownerMeta.delete(ownerId);
    }

    sendCurrentState() {
        if (this.isViewer || !this.network) return;
        if (!window.overlay) return;

        if (this.label) {
            const meta = this.ownerMeta.get(this.ownerId);
            this.sendCommand({
                action: "set-label",
                label: this.label,
                color: this.localColor,
                hostTag: meta ? meta.hostTag : null,
            });
        }

        if (window.overlay.points && window.overlay.points.length === 4) {
            this.sendCommand({
                action: "set-grid",
                points: window.overlay.points,
            });
        }

        if (window.overlay && window.overlay.markerStyle) {
            this.sendCommand({
                action: "stone-marker-style",
                style: window.overlay.markerStyle,
            });
        }

        const ownerId = this.ownerId;
        const ownerStones = window.overlay.getStonesForOwner(ownerId);
        ownerStones.forEach((stone) => {
            const colorName = stone.color === STONES.BLACK
                ? "BLACK"
                : stone.color === STONES.WHITE
                ? "WHITE"
                : "BOARD";
            this.sendCommand({
                action: "place-stone",
                x: stone.x,
                y: stone.y,
                color: colorName,
                markerColor: stone.markerColor || null,
            });
        });

        const ownerBoardStones = window.overlay.getBoardStonesForOwner(ownerId);
        ownerBoardStones.forEach((stone) => {
            this.sendCommand({
                action: "place-stone",
                x: stone.x,
                y: stone.y,
                color: "BOARD",
            });
        });

        if (window.drawingLayer) {
            const ownerPaths = window.drawingLayer.paths.filter((path) =>
                path.ownerId === ownerId
            );
            ownerPaths.forEach((path) => {
                if (path.points && path.points.length > 0) {
                    this.sendCommand({
                        action: "draw-batch",
                        points: path.points,
                        color: path.color,
                    });
                }
            });

            const ownerMarks = window.drawingLayer.marks.filter((mark) =>
                mark.ownerId === ownerId
            );
            ownerMarks.forEach((mark) => {
                this.sendCommand({
                    action: "add-mark",
                    type: mark.type,
                    x: mark.x,
                    y: mark.y,
                    text: mark.text || "",
                    color: mark.color,
                });
            });
        }
    }
}
