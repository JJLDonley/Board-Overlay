import { CONST, GRIDSIZE, STONES } from "../constants.js";
import { getHostColor } from "../utils/color-utils.js";
import { debug } from "../utils/debugger.js";

export let currentTool = "ALTERNATING";

export function setCurrentTool(tool) {
    currentTool = tool;
}

export class Canvas {
    constructor(element) {
        this.canvas = document.getElementById(element);
        this.context = this.canvas.getContext("2d");
        this.gridElement = document.getElementById("GridElement");
        this.show = true;
        this.showCoordinates = true;
        this.initializeCanvas();
        this.stonesByOwner = new Map(); // For black and white stones (variations)
        this.boardStonesByOwner = new Map(); // For board stones (empty positions)
        this.grid = [];
        this.points = [];
        this.isGridSet = false;
        this.currentColorByOwner = new Map();
        this.letterStacksByOwner = new Map();
        this.stoneHistoryByOwner = new Map();
        this.redoHistoryByOwner = new Map();
        this.markerStyle = "numbers";

        // All stones should be 100x100
        this.stoneSizes = {
            BLACK: 100,
            WHITE: 100,
            BOARD: 100,
        };
        this.bindEventListeners();
        this.setupToolbar();
        this.updateGridButtonState();

        // Set default tool to ALTERNATING and make button active
        const alternatingBtn = document.getElementById("AlternatingBtn");
        if (alternatingBtn) {
            alternatingBtn.classList.add("active");
        }
    }

    setupToolbar() {
        const tools = {
            "BlackStoneBtn": "BLACK",
            "WhiteStoneBtn": "WHITE",
            "AlternatingBtn": "ALTERNATING",
            "PenBtn": "PEN",
            "TriangleBtn": "TRIANGLE",
            "CircleBtn": "CIRCLE",
            "SquareBtn": "SQUARE",
            "LetterBtn": "LETTER",
        };

        const drawingLayerElement = document.getElementById("drawingLayer");

        Object.entries(tools).forEach(([btnId, toolType]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener("click", () => {
                    document.querySelectorAll(".tool-btn").forEach((b) =>
                        b.classList.remove("active")
                    );
                    btn.classList.add("active");
                    currentTool = toolType;

                    // Update global currentTool for drawing layer
                    if (window.setCurrentTool) {
                        window.setCurrentTool(toolType);
                    }
                    window.currentTool = toolType;

                    // Toggle drawing layer interaction based on pen tool
                    if (
                        ["PEN"]
                            .includes(toolType)
                    ) {
                        drawingLayerElement.classList.add("pen-active");
                    } else {
                        drawingLayerElement.classList.remove("pen-active");
                    }

                    // Send to viewer if network manager is available
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: "set-tool",
                            tool: toolType,
                        });
                    }
                });
            }
        });

        const markerToggle = document.getElementById("stoneMarkerToggle");
        if (markerToggle) {
            markerToggle.checked = this.markerStyle === "triangle";
            markerToggle.addEventListener("change", () => {
                const style = markerToggle.checked ? "triangle" : "numbers";
                this.setMarkerStyle(style, true);
            });
        }
    }

    setMarkerStyle(style, emitNetwork = true) {
        if (style !== "numbers" && style !== "triangle") return;
        this.markerStyle = style;
        if (emitNetwork && window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "stone-marker-style",
                style: style,
            });
        }
    }

    getOwnerHistory(ownerId) {
        if (!this.stoneHistoryByOwner.has(ownerId)) {
            this.stoneHistoryByOwner.set(ownerId, []);
        }
        return this.stoneHistoryByOwner.get(ownerId);
    }

    getOwnerRedoHistory(ownerId) {
        if (!this.redoHistoryByOwner.has(ownerId)) {
            this.redoHistoryByOwner.set(ownerId, []);
        }
        return this.redoHistoryByOwner.get(ownerId);
    }

    recordStonePlacement(ownerId, x, y, color, markerColor) {
        const history = this.getOwnerHistory(ownerId);
        history.push({ x: x, y: y, color: color, markerColor: markerColor });
    }

    undoLastStone(ownerId = null, emitNetwork = true) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const history = this.getOwnerHistory(targetOwner);
        const redoHistory = this.getOwnerRedoHistory(targetOwner);
        if (history.length === 0) return;

        while (history.length > 0) {
            const last = history.pop();
            const stones = this.getOwnerStones(targetOwner);
            const index = stones.findIndex(
                (stone) => stone.x === last.x && stone.y === last.y,
            );
            if (index >= 0) {
                stones.splice(index, 1);
                redoHistory.push(last);
                break;
            }
        }

        if (emitNetwork && window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "undo-stone",
                ownerId: targetOwner,
            });
        }
    }

    redoStone(ownerId = null, emitNetwork = true) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const redoHistory = this.getOwnerRedoHistory(targetOwner);
        if (redoHistory.length === 0) return;
        const next = redoHistory.pop();
        this.placeStone(next.x, next.y, next.color, targetOwner, {
            recordHistory: true,
            clearRedo: false,
            markerColor: next.markerColor,
        });

        if (emitNetwork && window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "redo-stone",
                ownerId: targetOwner,
            });
        }
    }

    buildLetterStack() {
        const stack = [];
        for (let i = 65; i <= 90; i++) {
            stack.push(String.fromCharCode(i));
        }
        for (let i = 65; i <= 90; i++) {
            for (let j = 65; j <= 90; j++) {
                stack.push(String.fromCharCode(i) + String.fromCharCode(j));
            }
        }
        return stack;
    }

    getLocalOwnerId() {
        return window.localOwnerId || window.cursorLabel || "local";
    }

    getOwnerStones(ownerId) {
        if (!this.stonesByOwner.has(ownerId)) {
            this.stonesByOwner.set(ownerId, []);
        }
        return this.stonesByOwner.get(ownerId);
    }

    getOwnerBoardStones(ownerId) {
        if (!this.boardStonesByOwner.has(ownerId)) {
            this.boardStonesByOwner.set(ownerId, []);
        }
        return this.boardStonesByOwner.get(ownerId);
    }

    getOwnerColor(ownerId) {
        if (!this.currentColorByOwner.has(ownerId)) {
            this.currentColorByOwner.set(ownerId, "BLACK");
        }
        return this.currentColorByOwner.get(ownerId);
    }

    setOwnerColor(ownerId, color) {
        this.currentColorByOwner.set(ownerId, color);
    }

    getLetterStack(ownerId) {
        if (!this.letterStacksByOwner.has(ownerId)) {
            this.letterStacksByOwner.set(ownerId, this.buildLetterStack());
        }
        return this.letterStacksByOwner.get(ownerId);
    }

    resetLetterStack(ownerId, updateButton = false) {
        if (!ownerId) return;
        this.letterStacksByOwner.set(ownerId, this.buildLetterStack());
        if (updateButton && ownerId === this.getLocalOwnerId()) {
            const letterBtn = document.getElementById("LetterBtn");
            if (letterBtn) {
                const stack = this.getLetterStack(ownerId);
                letterBtn.textContent = stack.length > 0 ? stack[0] : "A";
            }
        }
    }

    resetAllLetterStacks() {
        this.letterStacksByOwner.clear();
        this.resetLetterStack(this.getLocalOwnerId(), true);
    }

    clearOwnerData(ownerId) {
        if (!ownerId) return;
        this.stonesByOwner.delete(ownerId);
        this.boardStonesByOwner.delete(ownerId);
        this.stoneHistoryByOwner.delete(ownerId);
        this.redoHistoryByOwner.delete(ownerId);
        this.resetLetterStack(ownerId, true);
        this.clearCanvas();
    }

    getStonesForOwner(ownerId) {
        return this.stonesByOwner.get(ownerId) || [];
    }

    getBoardStonesForOwner(ownerId) {
        return this.boardStonesByOwner.get(ownerId) || [];
    }
    switchCurrentColor(ownerId = null, emitNetwork = true) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const nextColor = this.getOwnerColor(targetOwner) === "BLACK"
            ? "WHITE"
            : "BLACK";
        this.setOwnerColor(targetOwner, nextColor);
        debug.log("Switched current color to:", nextColor);

        if (emitNetwork && window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "switch-color",
                color: nextColor,
                ownerId: targetOwner,
            });
        }
    }

    initializeCanvas() {
        // Always use 1920x1080 for internal resolution
        this.canvas.width = 1920;
        this.canvas.height = 1080;

        // Make canvas focusable for keyboard shortcuts
        this.canvas.tabIndex = 0;
        this.canvas.style.outline = "none"; // Remove focus outline
    }

    updateCanvasDimensions() {
        // Always use 1920x1080 for internal resolution
        this.canvas.width = 1920;
        this.canvas.height = 1080;
    }

    bindEventListeners() {
        this.canvas.addEventListener(
            "mousedown",
            this.handleMouseDown.bind(this),
        );
        this.canvas.addEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this),
        );
        this.canvas.addEventListener(
            "mousemove",
            this.handleMouseMove.bind(this),
        );
        this.canvas.addEventListener(
            "mouseleave",
            this.handleMouseLeave.bind(this),
        );
        this.canvas.addEventListener(
            "mouseenter",
            this.handleMouseEnter.bind(this),
        );

        // Ensure canvas gets focus when clicked for keyboard shortcuts
        this.canvas.addEventListener("click", () => {
            this.canvas.focus();
        });

        document.addEventListener("keydown", (event) => {
            // Don't trigger shortcuts if user is typing in any input field
            const activeElement = document.activeElement;
            const isInputField = activeElement && (
                activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.tagName === "SELECT" ||
                activeElement.contentEditable === "true" ||
                activeElement.contentEditable === "plaintext-only" ||
                activeElement.role === "textbox" ||
                activeElement.role === "searchbox" ||
                activeElement.role === "combobox"
            );

            if (isInputField) {
                return; // Don't trigger shortcuts when typing in inputs
            }

            // Note: Spacebar handling is now done in main.js to avoid duplicate events
            this.handleKeyDown(event);
        });

        // Add event listeners for GridBtn and CoordBtn
        const gridBtn = document.getElementById("GridBtn");
        if (gridBtn) {
            gridBtn.addEventListener("click", () => {
                // In viewer mode, grid dots are always disabled
                if (window.isViewerMode) {
                    this.show = false;
                    debug.log("👁️ Grid dots disabled in viewer mode");
                } else {
                    this.show = !this.show;
                }
                this.updateGridButtonState();

                // Send to viewer if network manager is available
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "toggle-grid",
                        visible: this.show,
                    });
                }
            });
        }
        const coordBtn = document.getElementById("CoordBtn");
        if (coordBtn) {
            coordBtn.addEventListener("click", () => {
                // In viewer mode, coordinates are always on and cannot be toggled
                if (window.isViewerMode) {
                    debug.log(
                        "👁️ Coordinates permanently enabled in viewer mode",
                    );
                    return;
                }
                this.showCoordinates = !this.showCoordinates;
            });
        }
    }

    updateGridButtonState() {
        if (!this.gridElement) return; // Ensure gridElement is not null
        // Use SVG icons for grid on/off
        const gridOnIcon =
            `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" rx="2" stroke="white" stroke-width="2"/><path d="M2 7H18" stroke="white" stroke-width="2"/><path d="M2 13H18" stroke="white" stroke-width="2"/><path d="M7 2V18" stroke="white" stroke-width="2"/><path d="M13 2V18" stroke="white" stroke-width="2"/></svg>`;
        const gridOffIcon =
            `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" rx="2" stroke="#666" stroke-width="2"/><path d="M2 7H18" stroke="#666" stroke-width="2"/><path d="M2 13H18" stroke="#666" stroke-width="2"/><path d="M7 2V18" stroke="#666" stroke-width="2"/><path d="M13 2V18" stroke="#666" stroke-width="2"/></svg>`;

        // In viewer mode, always show grid as off (even though coordinates may be visible)
        const effectiveShow = window.isViewerMode ? false : this.show;

        if (effectiveShow) {
            this.gridElement.classList.add("active");
            this.gridElement.innerHTML = gridOnIcon;
        } else {
            this.gridElement.classList.remove("active");
            this.gridElement.innerHTML = gridOffIcon;
        }
        this.gridElement.dataset.show = effectiveShow.toString();

        // Also update coordinate button state
        this.updateCoordinateButtonState();
    }

    updateCoordinateButtonState() {
        const coordBtn = document.getElementById("CoordBtn");
        if (!coordBtn) return;

        // In viewer mode, always show coordinates as on
        const effectiveShowCoordinates = window.isViewerMode
            ? true
            : this.showCoordinates;

        if (effectiveShowCoordinates) {
            coordBtn.classList.add("active");
        } else {
            coordBtn.classList.remove("active");
        }
    }

    tick() {
        if (this.showTimer >= 0) {
            this.showTimer = this.showTimer - 0.016;
            if (this.showTimer < 0) this.show = false;
        }
        this.updateStonesRadius();
        this.clearCanvas();
        this.drawGrid();
        // Draw board stones first (as background)
        this.boardStonesByOwner.forEach((stones) => {
            stones.forEach((stone) => {
                this.drawCircle([stone.x, stone.y, stone.color]);
            });
        });
        // Then draw variation stones and their markers per owner
        this.stonesByOwner.forEach((stones) => {
            stones.forEach((stone, index) => {
                this.drawCircle([stone.x, stone.y, stone.color]);
                this.drawMarker(stone, index);
            });
        });

        // Draw hover stone if applicable
        this.drawHoverStone();
    }

    drawHoverStone() {
        // Only draw hover stone if:
        // 1. Grid is set
        // 2. Mouse is on canvas
        // 3. Current tool is a stone tool
        // 4. Not in viewer mode (local effect only)
        if (!this.isGridSet || !this.grid.length || window.isViewerMode) return;
        if (
            this.currentMouseX === undefined || this.currentMouseY === undefined
        ) return;

        const stoneTools = ["BLACK", "WHITE", "ALTERNATING"];
        if (!stoneTools.includes(currentTool)) return;

        const ownerId = this.getLocalOwnerId();

        // Determine color to show
        let hoverColor;
        if (currentTool === "BLACK") {
            hoverColor = STONES.BLACK;
        } else if (currentTool === "WHITE") {
            hoverColor = STONES.WHITE;
        } else {
            // Alternating
            hoverColor = this.getOwnerColor(ownerId) === "BLACK"
                ? STONES.BLACK
                : STONES.WHITE;
        }

        // Find closest grid point
        const point = this.findClosestPoint(
            this.currentMouseX,
            this.currentMouseY,
            this.grid,
        );

        // Check if point is already occupied by a variation stone
        // (We allow hovering over board stones as they can be covered)
        const ownerStones = this.getOwnerStones(ownerId);
        const isOccupied = ownerStones.some((stone) =>
            stone.x === point[0] && stone.y === point[1]
        );

        if (!isOccupied) {
            this.context.save();
            this.context.globalAlpha = 0.6; // Semi-transparent
            this.drawCircle([point[0], point[1], hoverColor]);
            this.context.restore();
        }
    }

    drawGrid() {
        if (this.grid && this.grid.length > 0) {
            // Draw grid points only if show is true AND not in viewer mode
            if (this.show && !window.isViewerMode) {
                for (let i = 0; i < this.grid.length; i++) {
                    for (let j = 0; j < this.grid[i].length; j++) {
                        const point = this.grid[i][j];
                        if (point && point.length >= 2) {
                            this.context.fillStyle = "white"; // Adjust color as needed
                            this.context.fillRect(
                                point[0] - GRIDSIZE / 2,
                                point[1] - GRIDSIZE / 2,
                                GRIDSIZE,
                                GRIDSIZE,
                            ); // Adjust size as needed
                        }
                    }
                }
            }

            // Draw coordinates (top: A-T, left: 1-19) - always show in viewer mode, otherwise respect showCoordinates setting
            const shouldShowCoordinates = window.isViewerMode
                ? true
                : this.showCoordinates;
            if (
                shouldShowCoordinates && this.grid.length > 0 &&
                this.grid[0].length > 0
            ) {
                const colLabels = [
                    "A",
                    "B",
                    "C",
                    "D",
                    "E",
                    "F",
                    "G",
                    "H",
                    "J",
                    "K",
                    "L",
                    "M",
                    "N",
                    "O",
                    "P",
                    "Q",
                    "R",
                    "S",
                    "T",
                ]; // Go skips 'I'
                this.context.save();
                this.context.font = `${24 * this.getScalingFactor()}px Arial`;

                // Get coordinate color from coordinate color picker, fallback to white
                const colorInput = document.getElementById("coordinateColor");
                const coordinateColor = colorInput ? colorInput.value : "black";
                this.context.fillStyle = coordinateColor;

                this.context.textAlign = "center";
                this.context.textBaseline = "middle";

                // Top labels (columns)
                for (let j = 0; j < Math.min(19, this.grid[0].length); j++) {
                    const pt = this.grid[0][j];
                    if (pt && pt.length >= 2) {
                        // Scale coordinates for viewer mode
                        const [scaledX, scaledY] = this.scaleCoordinates(
                            pt[0],
                            pt[1],
                        );
                        // Place label above the first row
                        this.context.fillText(
                            colLabels[j],
                            scaledX,
                            scaledY - 32 * this.getScalingFactor(),
                        );
                    }
                }
                // Left labels (rows)
                for (let i = 0; i < Math.min(19, this.grid.length); i++) {
                    const pt = this.grid[i][0];
                    if (pt && pt.length >= 2) {
                        // Scale coordinates for viewer mode
                        const [scaledX, scaledY] = this.scaleCoordinates(
                            pt[0],
                            pt[1],
                        );
                        // Place label to the left of the first column
                        this.context.textAlign = "right";
                        this.context.fillText(
                            (i + 1).toString(),
                            scaledX - 24 * this.getScalingFactor(),
                            scaledY,
                        );
                        this.context.textAlign = "center"; // Reset for columns
                    }
                }
                this.context.restore();
            }
        }
    }

    updateStonesRadius() {
        // Set default to 125 if not set
        const stoneSizeInput = document.getElementById("StoneSize");
        if (!stoneSizeInput.value || stoneSizeInput.value === "") {
            stoneSizeInput.value = 125;
        }
        this.stones_radius = stoneSizeInput.value;
        // Track if user has changed the value
        if (typeof this.userChangedStoneSize === "undefined") {
            this.userChangedStoneSize = false;
            stoneSizeInput.addEventListener("input", () => {
                this.userChangedStoneSize = true;
            }, { once: true });
        }
    }

    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawStones() {
        this.stonesByOwner.forEach((stones) => {
            stones.forEach((stone) => {
                this.drawCircle([stone.x, stone.y, stone.color]);
            });
        });
    }

    markLastStone() {
        this.stonesByOwner.forEach((stones) => {
            stones.forEach((stone, index) => {
                this.drawMarker(stone, index);
            });
        });
    }

    drawCircle([mouse_x, mouse_y, stone_color]) {
        if (!this.isGridSet || !this.grid.length) {
            return;
        }

        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(mouse_x, mouse_y);

        // Get base size based on stone type
        const baseSize = this.stoneSizes[
            stone_color === STONES.BLACK
                ? "BLACK"
                : stone_color === STONES.WHITE
                ? "WHITE"
                : "BOARD"
        ];
        // Calculate interpolated stone size
        let stoneSize = this.interpolateStoneSize(mouse_x, mouse_y, baseSize);

        // If black or white, scale up by 1.25 to compensate for image padding
        let scale = 1;
        if (stone_color === STONES.BLACK || stone_color === STONES.WHITE) {
            scale = 1.25;
        } else if (stone_color === STONES.BOARD) {
            scale = 1.25 + 0.025;
        }
        const drawSize = stoneSize * scale * this.getScalingFactor();
        const offset = drawSize / 2;

        this.context.drawImage(
            stone_color,
            scaledX - offset,
            scaledY - offset,
            drawSize,
            drawSize,
        );
    }

    drawMarker(stone, index) {
        const mouse_x = stone.x;
        const mouse_y = stone.y;
        const stone_color = stone.color;
        if (!this.isGridSet || !this.grid.length) {
            return;
        }

        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(mouse_x, mouse_y);

        // Use the stone's base size for marker scaling
        const baseSize = this.stoneSizes[
            stone_color === STONES.BLACK
                ? "BLACK"
                : stone_color === STONES.WHITE
                ? "WHITE"
                : "BOARD"
        ];
        const stoneSize = this.interpolateStoneSize(mouse_x, mouse_y, baseSize);

        const hostColor = stone.markerColor ||
            (stone_color === STONES.BLACK ? "white" : "black");
        if (this.markerStyle === "triangle") {
            this.drawTriangleMarker(scaledX, scaledY, stoneSize, hostColor);
            return;
        }

        this.context.fillStyle = (stone_color === STONES.BLACK)
            ? "white"
            : "black";

        this.context.font = `${
            stoneSize / 3 * this.getScalingFactor()
        }px Arial`;
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";

        this.context.fillText(index + 1, scaledX, scaledY);
    }

    drawTriangleMarker(x, y, stoneSize, color) {
        const size = (stoneSize / 2.2) * this.getScalingFactor();
        const height = size;
        const halfBase = size * 0.6;

        this.context.save();
        this.context.fillStyle = color;
        this.context.strokeStyle = color;
        this.context.lineWidth = Math.max(1.2, 1.6 * this.getScalingFactor());
        this.context.beginPath();
        this.context.moveTo(x, y - height / 1.2);
        this.context.lineTo(x - halfBase, y + height / 2.2);
        this.context.lineTo(x + halfBase, y + height / 2.2);
        this.context.closePath();
        this.context.fill();
        this.context.restore();
    }

    interpolateStoneSize(x, y, baseSize) {
        if (!this.isGridSet || !this.grid.length) {
            return baseSize;
        }

        // Find the closest grid point (i, j)
        let closestI = 0, closestJ = 0;
        let minDist = Infinity;
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                const pt = this.grid[i][j];
                const dist = Math.hypot(x - pt[0], y - pt[1]);
                if (dist < minDist) {
                    minDist = dist;
                    closestI = i;
                    closestJ = j;
                }
            }
        }

        // Find the closest neighbor (up, down, left, right)
        const neighbors = [];
        if (closestI > 0) neighbors.push(this.grid[closestI - 1][closestJ]);
        if (closestI < this.grid.length - 1) {
            neighbors.push(this.grid[closestI + 1][closestJ]);
        }
        if (closestJ > 0) neighbors.push(this.grid[closestI][closestJ - 1]);
        if (closestJ < this.grid[closestI].length - 1) {
            neighbors.push(this.grid[closestI][closestJ + 1]);
        }

        let minNeighborDist = Infinity;
        const centerPt = this.grid[closestI][closestJ];
        neighbors.forEach((pt) => {
            const dist = Math.hypot(centerPt[0] - pt[0], centerPt[1] - pt[1]);
            if (dist < minNeighborDist) minNeighborDist = dist;
        });

        // Fallback if no neighbor (shouldn't happen on a 19x19 grid)
        if (!isFinite(minNeighborDist) || minNeighborDist <= 0) {
            minNeighborDist = baseSize;
        }

        // The stone's diameter should be the grid spacing minus a margin
        const margin = 2; // px, tweak as needed
        let diameter = minNeighborDist - margin;

        // Only apply user size preference if changed from default
        const stoneSizeInput = document.getElementById("StoneSize");
        if (this.userChangedStoneSize && stoneSizeInput.value) {
            diameter = diameter * (parseInt(stoneSizeInput.value, 10) / 125);
        }
        return Math.round(diameter);
    }

    handleMouseDown(event) {
        event.preventDefault();
        if (window.isViewerMode) {
            return;
        }
        let rect = this.canvas.getBoundingClientRect();
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;
        let [cx, cy] = this.getCanvasCoords(x, y);

        if (this.points.length < 4) {
            debug.log(cx, cy);
            this.points.push([Number(cx.toFixed(0)), Number(cy.toFixed(0))]);
            if (this.points.length === 4) {
                this.grid = this.generateGrid(this.points);
                this.isGridSet = true;
                this.showTimer = 3;
                if (window.updateShareableUrl) {
                    window.updateShareableUrl();
                }

                // Send grid coordinates to viewers
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "set-grid",
                        points: this.points,
                    });
                    debug.log(
                        "📐 Sent grid coordinates to viewers:",
                        this.points,
                    );
                }
            }
        } else if (this.isGridSet) {
            const ownerId = this.getLocalOwnerId();
            let point = this.findClosestPoint(cx, cy, this.grid);

            // Handle shape/letter tools
            if (
                ["TRIANGLE", "CIRCLE", "SQUARE", "LETTER"].includes(currentTool)
            ) {
                let text = "";
                if (currentTool === "LETTER") {
                    const letterBtn = document.getElementById("LetterBtn");
                    if (letterBtn) {
                        const letterStack = this.getLetterStack(ownerId);
                        // Check if there's already a letter at this position
                        const existingLetter = window.drawingLayer.marks.find(
                            (mark) =>
                                mark.type === "LETTER" &&
                                mark.ownerId === ownerId &&
                                Math.sqrt(
                                        (mark.x - point[0]) ** 2 +
                                            (mark.y - point[1]) ** 2,
                                    ) <= 20,
                        );

                        if (existingLetter) {
                            // Remove the existing letter
                            window.drawingLayer.marks = window.drawingLayer
                                .marks.filter((mark) =>
                                    mark !== existingLetter
                                );
                            window.drawingLayer.redrawAll();

                            // Insert the removed letter back into its proper alphabetical position
                            const removedLetter = existingLetter.text;
                            let insertIndex = 0;

                            // Find the correct position to maintain alphabetical order
                            for (let i = 0; i < letterStack.length; i++) {
                                if (letterStack[i] > removedLetter) {
                                    insertIndex = i;
                                    break;
                                }
                                insertIndex = i + 1;
                            }

                            letterStack.splice(
                                insertIndex,
                                0,
                                removedLetter,
                            );
                            letterBtn.textContent = letterStack[0];
                            return;
                        } else {
                            // Get the next letter from the stack
                            if (letterStack.length > 0) {
                                text = letterStack.shift();
                                letterBtn.textContent =
                                    letterStack.length > 0
                                        ? letterStack[0]
                                        : "A";
                            } else {
                                text = "A"; // Fallback if stack is empty
                                letterBtn.textContent = "A";
                            }
                        }
                    } else {
                        text = "A";
                    }
                }
                window.drawingLayer.addMark(
                    currentTool,
                    point[0],
                    point[1],
                    text,
                    ownerId,
                    window.currentUserColor,
                );

                // Send to viewer if network manager is available
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "add-mark",
                        type: currentTool,
                        x: point[0],
                        y: point[1],
                        text: text,
                        color: window.currentUserColor,
                        ownerId: ownerId,
                        timestamp: Date.now(),
                    });
                }
                return;
            }

            // Handle stone placement tools (BLACK, WHITE, ALTERNATING)
            if (
                ["BLACK", "WHITE", "ALTERNATING"].includes(currentTool) &&
                event.button === 0
            ) {
                // Check if there's a board stone at this position and remove it
                const ownerBoardStones = this.getOwnerBoardStones(ownerId);
                let existingBoardStoneIndex = ownerBoardStones.findIndex(
                    (stone) =>
                        stone.x === point[0] && stone.y === point[1],
                );
                if (existingBoardStoneIndex >= 0) {
                    ownerBoardStones.splice(existingBoardStoneIndex, 1);
                    // Send remove board command
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: "place-stone",
                            x: point[0],
                            y: point[1],
                            color: "REMOVE_BOARD",
                            ownerId: ownerId,
                        });
                    }
                }

                // Check if there's already a stone at this position
                const ownerStones = this.getOwnerStones(ownerId);
                let existingStoneIndex = ownerStones.findIndex((stone) =>
                    stone.x === point[0] && stone.y === point[1]
                );

                if (existingStoneIndex >= 0) {
                    // Stone exists - check if same color or different
                    let existingStone = ownerStones[existingStoneIndex];
                    let existingColor = existingStone.color;

                    // Determine what color we're trying to place
                    let colorToPlace;
                    if (currentTool === "ALTERNATING") {
                        colorToPlace = this.getOwnerColor(ownerId) === "BLACK"
                            ? STONES.BLACK
                            : STONES.WHITE;
                    } else {
                        colorToPlace = currentTool === "BLACK"
                            ? STONES.BLACK
                            : STONES.WHITE;
                    }

                    if (existingColor === colorToPlace) {
                        // Same color - remove the stone
                        ownerStones.splice(existingStoneIndex, 1);

                        // Send remove command
                        if (window.networkManager && !window.isViewerMode) {
                            window.networkManager.send({
                                action: "remove-stone",
                                x: point[0],
                                y: point[1],
                                ownerId: ownerId,
                            });

                            // Also send grid
                            if (this.points && this.points.length === 4) {
                                window.networkManager.send({
                                    action: "set-grid",
                                    points: this.points,
                                });
                            }
                        }
                    } else {
                        // Different color - replace the stone
                        this.placeStone(
                            point[0],
                            point[1],
                            currentTool === "BLACK" ||
                                    (currentTool === "ALTERNATING" &&
                                        this.getOwnerColor(ownerId) ===
                                            "BLACK")
                                ? "BLACK"
                                : "WHITE",
                            ownerId,
                        );

                        // Send place command (will overwrite)
                        if (window.networkManager && !window.isViewerMode) {
                            const markerColor = window.currentUserColor ||
                                getHostColor(
                                    window.hostTag ||
                                        window.cursorLabel ||
                                        ownerId,
                                );
                            window.networkManager.send({
                                action: "place-stone",
                                x: point[0],
                                y: point[1],
                                color: currentTool === "BLACK" ||
                                        (currentTool === "ALTERNATING" &&
                                            this.getOwnerColor(ownerId) ===
                                                "BLACK")
                                    ? "BLACK"
                                    : "WHITE",
                                ownerId: ownerId,
                                markerColor: markerColor,
                            });

                            // Also send grid
                            if (this.points && this.points.length === 4) {
                                window.networkManager.send({
                                    action: "set-grid",
                                    points: this.points,
                                });
                            }
                        }

                        // Switch color if ALTERNATING
                        if (currentTool === "ALTERNATING") {
                            this.switchCurrentColor(ownerId);
                        }
                    }
                } else {
                    // No stone exists - place new stone
                    let colorToPlace;
                    if (currentTool === "ALTERNATING") {
                        colorToPlace = this.getOwnerColor(ownerId) === "BLACK"
                            ? STONES.BLACK
                            : STONES.WHITE;
                    } else {
                        colorToPlace = currentTool === "BLACK"
                            ? STONES.BLACK
                            : STONES.WHITE;
                    }

                    this.placeStone(
                        point[0],
                        point[1],
                        currentTool === "BLACK" ||
                                (currentTool === "ALTERNATING" &&
                                    this.getOwnerColor(ownerId) ===
                                        "BLACK")
                            ? "BLACK"
                            : "WHITE",
                        ownerId,
                    );

                    // Send place command
                    if (window.networkManager && !window.isViewerMode) {
                        const markerColor = window.currentUserColor ||
                            getHostColor(
                                window.hostTag || window.cursorLabel || ownerId,
                            );
                        window.networkManager.send({
                            action: "place-stone",
                            x: point[0],
                            y: point[1],
                            color: currentTool === "BLACK" ||
                                    (currentTool === "ALTERNATING" &&
                                        this.getOwnerColor(ownerId) ===
                                            "BLACK")
                                ? "BLACK"
                                : "WHITE",
                            ownerId: ownerId,
                            markerColor: markerColor,
                        });

                        // Also send grid
                        if (this.points && this.points.length === 4) {
                            window.networkManager.send({
                                action: "set-grid",
                                points: this.points,
                            });
                        }
                    }

                    // Switch color if ALTERNATING
                    if (currentTool === "ALTERNATING") {
                        this.switchCurrentColor(ownerId);
                    }
                }
                return;
            }

            if (event.button === 2) { // Right click - handle board stones
                const ownerBoardStones = this.getOwnerBoardStones(ownerId);
                const ownerStones = this.getOwnerStones(ownerId);
                let existingBoardStoneIndex = ownerBoardStones.findIndex(
                    (stone) =>
                        stone.x === point[0] && stone.y === point[1],
                );
                if (existingBoardStoneIndex >= 0) {
                    ownerBoardStones.splice(existingBoardStoneIndex, 1);
                    // Send board stone removal to viewer
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: "place-stone",
                            x: point[0],
                            y: point[1],
                            color: "REMOVE_BOARD",
                            ownerId: ownerId,
                        });
                    }
                } else {
                    // Remove any variation stone at this position
                    let existingStoneIndex = ownerStones.findIndex((stone) =>
                        stone.x === point[0] && stone.y === point[1]
                    );
                    if (existingStoneIndex >= 0) {
                        ownerStones.splice(existingStoneIndex, 1);
                    }
                    ownerBoardStones.push({
                        x: point[0],
                        y: point[1],
                        color: STONES.BOARD,
                        ownerId: ownerId,
                    });

                    // Send board stone placement to viewer
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: "place-stone",
                            x: point[0],
                            y: point[1],
                            color: "BOARD",
                            ownerId: ownerId,
                        });

                        // Also send current grid coordinates with board stone placement
                        if (this.points && this.points.length === 4) {
                            window.networkManager.send({
                                action: "set-grid",
                                points: this.points,
                            });
                            debug.log(
                                "📐 Sent grid coordinates with board stone placement:",
                                this.points,
                            );
                        }
                    }
                }
            }
        }
    }

    handleContextMenu(event) {
        event.preventDefault();
    }

    handleMouseMove(event) {
        // Store current mouse position for smooth sending
        let rect = this.canvas.getBoundingClientRect();
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;
        let [cx, cy] = this.getCanvasCoords(x, y);

        this.currentMouseX = cx;
        this.currentMouseY = cy;

        // Initialize cursor sending interval if not already running
        if (
            !this.cursorSendInterval && window.networkManager &&
            !window.isViewerMode
        ) {
            // Track last sent coordinates to avoid duplicates
            this.lastSentX = undefined;
            this.lastSentY = undefined;

            this.cursorSendInterval = setInterval(() => {
                if (
                    this.currentMouseX !== undefined &&
                    this.currentMouseY !== undefined
                ) {
                    // Only send if coordinates have changed
                    if (
                        this.currentMouseX !== this.lastSentX ||
                        this.currentMouseY !== this.lastSentY
                    ) {
                        window.networkManager.send({
                            action: "cursor-move",
                            x: this.currentMouseX,
                            y: this.currentMouseY,
                            label: window.cursorLabel,
                            ownerId: this.getLocalOwnerId(),
                            color: window.currentUserColor,
                            hostTag: window.hostTag || null,
                            timestamp: Date.now(),
                        });
                        this.lastSentX = this.currentMouseX;
                        this.lastSentY = this.currentMouseY;
                    }
                }
            }, 50); // Exactly 20 times per second
        }
    }

    handleMouseLeave(event) {
        // Stop sending cursor updates when mouse leaves canvas
        if (this.cursorSendInterval) {
            clearInterval(this.cursorSendInterval);
            this.cursorSendInterval = null;
        }
        this.currentMouseX = undefined;
        this.currentMouseY = undefined;
    }

    handleMouseEnter(event) {
        // Restart cursor tracking when mouse re-enters canvas
        if (
            !this.cursorSendInterval && window.networkManager &&
            !window.isViewerMode
        ) {
            // Reset last sent coordinates when re-entering
            this.lastSentX = undefined;
            this.lastSentY = undefined;

            this.cursorSendInterval = setInterval(() => {
                if (
                    this.currentMouseX !== undefined &&
                    this.currentMouseY !== undefined
                ) {
                    // Only send if coordinates have changed
                    if (
                        this.currentMouseX !== this.lastSentX ||
                        this.currentMouseY !== this.lastSentY
                    ) {
                        window.networkManager.send({
                            action: "cursor-move",
                            x: this.currentMouseX,
                            y: this.currentMouseY,
                            label: window.cursorLabel,
                            ownerId: this.getLocalOwnerId(),
                            color: window.currentUserColor,
                            hostTag: window.hostTag || null,
                            timestamp: Date.now(),
                        });
                        this.lastSentX = this.currentMouseX;
                        this.lastSentY = this.currentMouseY;
                    }
                }
            }, 50); // Exactly 20 times per second
        }
    }

    handleKeyDown(event) {
        // Note: Spacebar handling is now done in main.js to avoid duplicate events
        if (window.isViewerMode) {
            return;
        }
        if (event.code === "KeyR") {
            this.resetGrid();
            event.preventDefault();
        } else if (event.code === "KeyQ") {
            this.switchCurrentColor(this.getLocalOwnerId());
            event.preventDefault();
        }
    }

    clearStones() {
        this.stonesByOwner.clear();
        this.boardStonesByOwner.clear();
        this.stoneHistoryByOwner.clear();
        this.redoHistoryByOwner.clear();
        this.resetAllLetterStacks();
        this.clearCanvas();

        // Note: Viewer communication is now handled centrally in main.js
    }

    checkForOverlappingStones() {
        this.stonesByOwner.forEach((stones, ownerId) => {
            const filtered = stones.filter((stone, i) => {
                for (let j = i + 1; j < stones.length; j++) {
                    if (this.isOverlapping(stone, stones[j])) {
                        return false;
                    }
                }
                return true;
            });
            this.stonesByOwner.set(ownerId, filtered);
        });
    }

    isOverlapping(stoneA, stoneB) {
        const [x1, y1] = Array.isArray(stoneA)
            ? stoneA
            : [stoneA.x, stoneA.y];
        const [x2, y2] = Array.isArray(stoneB)
            ? stoneB
            : [stoneB.x, stoneB.y];
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        return distance < this.stones_radius + 10; // Assuming radius as the criterion for overlap
    }

    getCanvasCoords(clientX, clientY) {
        let { width, height } = this.canvas.getBoundingClientRect();
        let scaleX = this.canvas.width / width;
        let scaleY = this.canvas.height / height;
        return [clientX * scaleX, clientY * scaleY];
    }

    // Get scaling factor - always 1 now as we use unified resolution
    getScalingFactor() {
        return 1;
    }

    // Scale coordinates for viewer mode
    scaleCoordinates(x, y) {
        const scale = this.getScalingFactor();
        return [x * scale, y * scale];
    }

    generateGrid(rawPoints) {
        // Sort points by y-coordinate (ascending), then split into top and bottom pairs
        const sortedByY = rawPoints.slice().sort((a, b) => a[1] - b[1]);
        const topPoints = sortedByY.slice(0, 2).sort((a, b) => a[0] - b[0]); // Sort by x-coordinate to get TL and TR
        const bottomPoints = sortedByY.slice(2, 4).sort((a, b) => a[0] - b[0]); // Sort by x-coordinate to get BL and BR

        // Merge sorted points back into the correct TL, TR, BL, BR order
        const points = [
            topPoints[0],
            topPoints[1],
            bottomPoints[0],
            bottomPoints[1],
        ];

        // Now, points are ordered as TL, TR, BL, BR

        // Generate an empty board
        const grid = Array.from(
            { length: 19 },
            () => Array.from({ length: 19 }, () => [0, 0]),
        );

        // Bilinear interpolation function
        function bilinearInterpolation(x, y, points) {
            const [topLeft, topRight, bottomLeft, bottomRight] = points;

            // Interpolate horizontally
            const top = [
                topLeft[0] * (1 - x) + topRight[0] * x,
                topLeft[1] * (1 - x) + topRight[1] * x,
            ];
            const bottom = [
                bottomLeft[0] * (1 - x) + bottomRight[0] * x,
                bottomLeft[1] * (1 - x) + bottomRight[1] * x,
            ];

            // Interpolate vertically
            return [
                top[0] * (1 - y) + bottom[0] * y,
                top[1] * (1 - y) + bottom[1] * y,
            ];
        }

        // Calculate grid points
        for (let i = 0; i < 19; i++) {
            for (let j = 0; j < 19; j++) {
                const xFraction = j / 18; // Horizontal interpolation fraction
                const yFraction = i / 18; // Vertical interpolation fraction

                let [x, y] = bilinearInterpolation(
                    xFraction,
                    yFraction,
                    points,
                );
                // Floor the coordinates to integers
                x = Math.floor(x);
                y = Math.floor(y);
                grid[i][j] = [x, y];
            }
        }

        return grid;
    }

    distance(x1, y1, x2, y2) {
        return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    }

    // Function to find the closest point on the grid given an x and y coordinate, returns that coordinate.
    findClosestPoint(x, y, grid) {
        let closestPoint = grid[0][0];
        let minDistance = this.distance(x, y, closestPoint[0], closestPoint[1]);

        // Iterate through each point in the grid
        grid.forEach((row) => {
            row.forEach((point) => {
                const dist = this.distance(x, y, point[0], point[1]);
                // Update closest point if distance is smaller
                if (dist < minDistance) {
                    minDistance = dist;
                    closestPoint = point;
                }
            });
        });
        return closestPoint;
    }

    resetGrid() {
        this.isGridSet = false;
        this.grid = [];
        this.points = [];
        this.stonesByOwner.clear();
        this.boardStonesByOwner.clear();
        this.resetAllLetterStacks();
        this.updateGridButtonState();
        if (window.updateShareableUrl) {
            window.updateShareableUrl();
        }

        // Send to viewer if network manager is available
        if (window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "reset-grid",
            });
        }
    }

    placeStone(x, y, color, ownerId = null, options = {}) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const ownerStones = this.getOwnerStones(targetOwner);
        const ownerBoardStones = this.getOwnerBoardStones(targetOwner);
        const recordHistory = options.recordHistory !== false;
        const clearRedo = options.clearRedo !== false;
        const resolvedMarkerColor = options.markerColor ||
            window.currentUserColor ||
            getHostColor(window.hostTag || window.cursorLabel || targetOwner);

        let existingStoneIndex = ownerStones.findIndex((stone) =>
            stone.x === x && stone.y === y
        );

        if (existingStoneIndex >= 0) {
            const existingStone = ownerStones[existingStoneIndex];
            if (existingStone.color === STONES[color]) {
                return;
            }
            ownerStones.splice(existingStoneIndex, 1);
        } else {
            let existingBoardStoneIndex = ownerBoardStones.findIndex((stone) =>
                stone.x === x && stone.y === y
            );
            if (existingBoardStoneIndex >= 0) {
                ownerBoardStones.splice(existingBoardStoneIndex, 1);
            }
        }

        ownerStones.push({
            x: x,
            y: y,
            color: STONES[color],
            ownerId: targetOwner,
            markerColor: resolvedMarkerColor,
        });

        if (recordHistory && (color === "BLACK" || color === "WHITE")) {
            this.recordStonePlacement(
                targetOwner,
                x,
                y,
                color,
                resolvedMarkerColor,
            );
        }
        if (clearRedo) {
            const redoHistory = this.getOwnerRedoHistory(targetOwner);
            redoHistory.length = 0;
        }
    }

    removeStone(x, y, ownerId = null) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const ownerStones = this.getOwnerStones(targetOwner);
        const existingStoneIndex = ownerStones.findIndex((stone) =>
            stone.x === x && stone.y === y
        );
        if (existingStoneIndex >= 0) {
            ownerStones.splice(existingStoneIndex, 1);
        }
    }

    placeBoardStone(x, y, action, ownerId = null) {
        const targetOwner = ownerId || this.getLocalOwnerId();
        const ownerBoardStones = this.getOwnerBoardStones(targetOwner);
        const ownerStones = this.getOwnerStones(targetOwner);

        if (action === "REMOVE_BOARD") {
            let existingBoardStoneIndex = ownerBoardStones.findIndex((stone) =>
                stone.x === x && stone.y === y
            );
            if (existingBoardStoneIndex >= 0) {
                ownerBoardStones.splice(existingBoardStoneIndex, 1);
            }
        } else if (action === "BOARD") {
            let existingStoneIndex = ownerStones.findIndex((stone) =>
                stone.x === x && stone.y === y
            );
            if (existingStoneIndex >= 0) {
                ownerStones.splice(existingStoneIndex, 1);
            }

            let existingBoardStoneIndex = ownerBoardStones.findIndex((stone) =>
                stone.x === x && stone.y === y
            );
            if (existingBoardStoneIndex >= 0) {
                ownerBoardStones.splice(existingBoardStoneIndex, 1);
            }

            ownerBoardStones.push({
                x: x,
                y: y,
                color: STONES.BOARD,
                ownerId: targetOwner,
            });
        }
    }
}

