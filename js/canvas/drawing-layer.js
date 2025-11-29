import { CONST } from "../constants.js";
import { debug } from "../utils/debugger.js";

export class DrawingLayer {
    constructor(element) {
        this.canvas = document.getElementById(element);
        this.context = this.canvas.getContext("2d");
        this.isDrawing = false;
        this.marks = [];
        this.paths = []; // Store drawing paths
        this.currentPath = null;

        // Drawing batch system for network optimization
        this.drawingBatch = [];
        this.batchInterval = null;
        this.batchRate = 100; // Send batches every 100ms (10 times per second)
        this.maxBatchSize = 20; // Maximum points per batch

        this.initializeCanvas();
        this.bindEventListeners();
    }

    initializeCanvas() {
        // Always use 1920x1080 for internal resolution
        this.canvas.width = 1920;
        this.canvas.height = 1080;

        // Make canvas focusable for keyboard shortcuts
        this.canvas.tabIndex = 0;
        this.canvas.style.outline = "none"; // Remove focus outline
        this.context.strokeStyle = this.getPenColor();
        this.context.lineWidth = 2;
        this.context.font = "24px Arial";
    }

    updateCanvasDimensions() {
        // Always use 1920x1080 for internal resolution
        this.canvas.width = 1920;
        this.canvas.height = 1080;
    }

    getPenColor() {
        const colorInput = document.getElementById("markupColor");
        return colorInput ? colorInput.value : "red";
    }

    bindEventListeners() {
        this.canvas.addEventListener("mousedown", this.startDrawing.bind(this));
        this.canvas.addEventListener(
            "mousemove",
            this.handleMouseMove.bind(this),
        );
        this.canvas.addEventListener("mouseup", this.stopDrawing.bind(this));
        this.canvas.addEventListener("mouseout", this.stopDrawing.bind(this));
        this.canvas.addEventListener(
            "mouseenter",
            this.handleMouseEnter.bind(this),
        );
        this.canvas.addEventListener(
            "mouseleave",
            this.handleMouseLeave.bind(this),
        );

        // Ensure canvas gets focus when clicked for keyboard shortcuts
        this.canvas.addEventListener("click", () => {
            this.canvas.focus();
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Delete") {
                this.clearCanvas();
            }
        });
        // Listen for color changes
        const colorInput = document.getElementById("markupColor");
        if (colorInput) {
            colorInput.addEventListener("input", () => {
                this.context.strokeStyle = this.getPenColor();
            });
        }
    }

    startDrawing(e) {
        if (window.currentTool !== "PEN") return;
        this.isDrawing = true;
        const [x, y] = this.getCanvasCoords(e.offsetX, e.offsetY);
        this.currentPath = {
            points: [[x, y]],
            type: "path",
            color: this.getPenColor(),
        };
        this.context.beginPath();
        this.context.strokeStyle = this.getPenColor();
        this.context.lineWidth = 2 * this.getScalingFactor();

        // Scale and move to the first point
        const [scaledX, scaledY] = this.scaleCoordinates(x, y);
        this.context.moveTo(scaledX, scaledY);

        // Send start command immediately
        if (window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "draw-start",
                x: x,
                y: y,
                tool: "PEN",
                color: this.getPenColor(),
                timestamp: Date.now(),
            });
        }

        // Start batching system for drawing points
        this.startDrawingBatch();
    }

    startDrawingBatch() {
        // Clear any existing batch
        this.drawingBatch = [];

        // Clear any existing interval
        if (this.batchInterval) {
            clearInterval(this.batchInterval);
        }

        // Start new batch interval
        this.batchInterval = setInterval(() => {
            this.sendDrawingBatch();
        }, this.batchRate);
    }

    sendDrawingBatch() {
        if (this.drawingBatch.length === 0) {
            return;
        }

        // Send batch of drawing points
        if (window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "draw-batch",
                points: [...this.drawingBatch], // Copy the array
                tool: "PEN",
                color: this.getPenColor(),
                timestamp: Date.now(),
            });

            debug.log(
                `🎨 Sent drawing batch with ${this.drawingBatch.length} points`,
            );
        }

        // Clear the batch
        this.drawingBatch = [];
    }

    handleMouseMove(e) {
        const [x, y] = this.getCanvasCoords(e.offsetX, e.offsetY);

        // Always update cursor position for tracking (same as main canvas)
        if (window.overlay) {
            window.overlay.currentMouseX = x;
            window.overlay.currentMouseY = y;

            // Also ensure the cursor tracking interval is running
            if (
                !window.overlay.cursorSendInterval && window.networkManager &&
                !window.isViewerMode
            ) {
                // Track last sent coordinates to avoid duplicates
                window.overlay.lastSentX = undefined;
                window.overlay.lastSentY = undefined;

                window.overlay.cursorSendInterval = setInterval(() => {
                    if (
                        window.overlay.currentMouseX !== undefined &&
                        window.overlay.currentMouseY !== undefined
                    ) {
                        // Only send if coordinates have changed
                        if (
                            window.overlay.currentMouseX !==
                                window.overlay.lastSentX ||
                            window.overlay.currentMouseY !==
                                window.overlay.lastSentY
                        ) {
                            window.networkManager.send({
                                action: "cursor-move",
                                x: window.overlay.currentMouseX,
                                y: window.overlay.currentMouseY,
                                timestamp: Date.now(),
                            });
                            window.overlay.lastSentX =
                                window.overlay.currentMouseX;
                            window.overlay.lastSentY =
                                window.overlay.currentMouseY;
                        }
                    }
                }, 50); // Exactly 20 times per second
            }
        }

        // Handle drawing if pen tool is active and drawing
        this.draw(e);
    }

    draw(e) {
        if (!this.isDrawing || window.currentTool !== "PEN") return;
        const [x, y] = this.getCanvasCoords(e.offsetX, e.offsetY);

        if (this.currentPath) {
            this.currentPath.points.push([x, y]);

            // If we have at least 2 points, interpolate between the last two
            if (this.currentPath.points.length >= 2) {
                const lastPoint =
                    this.currentPath.points[this.currentPath.points.length - 2];
                const currentPoint =
                    this.currentPath.points[this.currentPath.points.length - 1];

                // Interpolate between the last two points
                const interpolatedPoints = this.interpolatePath([
                    lastPoint,
                    currentPoint,
                ]);

                // Draw the interpolated segment
                this.context.strokeStyle = this.getPenColor();
                this.context.lineWidth = 2 * this.getScalingFactor();

                // Start from the first interpolated point (skip the original last point)
                const [startX, startY] = this.scaleCoordinates(
                    interpolatedPoints[0][0],
                    interpolatedPoints[0][1],
                );
                this.context.moveTo(startX, startY);

                // Draw to all subsequent interpolated points
                interpolatedPoints.slice(1).forEach((point) => {
                    const [scaledX, scaledY] = this.scaleCoordinates(
                        point[0],
                        point[1],
                    );
                    this.context.lineTo(scaledX, scaledY);
                });
                this.context.stroke();
            } else {
                // First point - just move to it
                const [scaledX, scaledY] = this.scaleCoordinates(x, y);
                this.context.moveTo(scaledX, scaledY);
            }
        }

        // Add point to batch instead of sending immediately
        this.drawingBatch.push([x, y]);

        // If batch is getting too large, send it immediately
        if (this.drawingBatch.length >= this.maxBatchSize) {
            this.sendDrawingBatch();
        }
    }

    stopDrawing() {
        if (this.isDrawing && this.currentPath) {
            this.paths.push(this.currentPath);
            this.currentPath = null;

            // Send any remaining points in the batch
            this.sendDrawingBatch();

            // Stop the batching interval
            if (this.batchInterval) {
                clearInterval(this.batchInterval);
                this.batchInterval = null;
            }

            // Send end command
            if (window.networkManager && !window.isViewerMode) {
                window.networkManager.send({
                    action: "draw-end",
                    x: 0,
                    y: 0,
                    tool: "PEN",
                    color: this.getPenColor(),
                    timestamp: Date.now(),
                });
            }
        }
        this.isDrawing = false;
    }

    clearCanvas(emitNetwork = true) {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.marks = [];
        this.paths = [];
        this.currentPath = null;
        this.isDrawing = false;

        // Clean up batch system
        if (this.batchInterval) {
            clearInterval(this.batchInterval);
            this.batchInterval = null;
        }
        this.drawingBatch = [];

        // Reinitialize context properties to ensure drawing works again
        this.context.strokeStyle = this.getPenColor();
        this.context.lineWidth = 2 * this.getScalingFactor();
        this.context.lineCap = "round";
        this.context.lineJoin = "round";
        this.context.beginPath(); // Reset the path state

        // Send to viewer if network manager is available
        if (emitNetwork && window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: "clear-drawing",
            });
        }
    }

    // Cleanup method for when the drawing layer is destroyed
    destroy() {
        if (this.batchInterval) {
            clearInterval(this.batchInterval);
            this.batchInterval = null;
        }
        this.drawingBatch = [];
    }

    addMark(type, x, y, text = "") {
        const mark = { type, x, y, text };
        this.marks.push(mark);
        this.drawMark(mark);
    }

    redrawAll() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Redraw all paths
        this.paths.forEach((path) => {
            if (path.points.length > 0) {
                this.context.beginPath();
                this.context.strokeStyle = path.color || this.getPenColor();
                this.context.lineWidth = 2 * this.getScalingFactor();

                // Interpolate and scale the path
                const interpolatedPoints = this.interpolatePath(path.points);

                // Start with the first interpolated point
                const [firstX, firstY] = this.scaleCoordinates(
                    interpolatedPoints[0][0],
                    interpolatedPoints[0][1],
                );
                this.context.moveTo(firstX, firstY);

                // Draw lines to all subsequent interpolated points
                interpolatedPoints.slice(1).forEach((point) => {
                    const [scaledX, scaledY] = this.scaleCoordinates(
                        point[0],
                        point[1],
                    );
                    this.context.lineTo(scaledX, scaledY);
                });
                this.context.stroke();
            }
        });
        // Redraw all marks
        this.marks.forEach((mark) => this.drawMark(mark));
    }

    // Interpolate path points to create smooth lines
    interpolatePath(points) {
        if (points.length < 2) return points;

        const interpolated = [];
        const scale = this.getScalingFactor();

        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];

            // Add the current point
            interpolated.push(current);

            // Calculate distance between points
            const dx = next[0] - current[0];
            const dy = next[1] - current[1];
            const distance = Math.sqrt(dx * dx + dy * dy);

            // If points are far apart, add interpolation points
            // Scale the interpolation distance based on viewer mode
            const interpolationDistance = window.isViewerMode ? 5 * scale : 5;
            if (distance > interpolationDistance) {
                const steps = Math.ceil(distance / interpolationDistance);
                for (let j = 1; j < steps; j++) {
                    const t = j / steps;
                    const interpolatedX = current[0] + dx * t;
                    const interpolatedY = current[1] + dy * t;
                    interpolated.push([interpolatedX, interpolatedY]);
                }
            }
        }

        // Add the last point
        interpolated.push(points[points.length - 1]);

        return interpolated;
    }

    drawMark({ type, x, y, text }) {
        const colorInput = document.getElementById("markupColor");
        const fillColor = colorInput ? colorInput.value : "white";
        this.context.save();
        this.context.strokeStyle = "black"; // Default outline
        this.context.fillStyle = fillColor;
        this.context.lineWidth = 2;

        switch (type) {
            case "TRIANGLE":
                this.drawTriangle(x, y);
                break;
            case "CIRCLE":
                this.drawCircle(x, y);
                break;
            case "SQUARE":
                this.drawSquare(x, y);
                break;
            case "LETTER": {
                // Scale coordinates for viewer mode
                const [scaledX, scaledY] = this.scaleCoordinates(x, y);
                // Always use white fill and black outline for letters
                this.context.strokeStyle = "black";
                this.context.fillStyle = "white";
                this.context.lineWidth = 3 * this.getScalingFactor();
                this.context.font = `${24 * this.getScalingFactor()}px Arial`;
                this.context.strokeText(
                    text,
                    scaledX - 8 * this.getScalingFactor(),
                    scaledY + 8 * this.getScalingFactor(),
                );
                this.context.fillText(
                    text,
                    scaledX - 8 * this.getScalingFactor(),
                    scaledY + 8 * this.getScalingFactor(),
                );
                break;
            }
        }

        this.context.restore();
    }

    drawTriangle(x, y) {
        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(x, y);

        // Use stone interpolation for size
        const baseSize = 20;
        const size = this.interpolateDrawingSize(x, y, baseSize);

        this.context.beginPath();
        this.context.moveTo(scaledX, scaledY - size);
        this.context.lineTo(scaledX + size, scaledY + size);
        this.context.lineTo(scaledX - size, scaledY + size);
        this.context.closePath();
        this.context.stroke();
    }

    drawCircle(x, y) {
        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(x, y);

        // Use stone interpolation for size
        const baseSize = 15;
        let radius = this.interpolateDrawingSize(x, y, baseSize);

        // Increase size by 50% after interpolation
        radius = radius * 1.5;

        this.context.beginPath();
        this.context.arc(scaledX, scaledY, radius, 0, Math.PI * 2);
        this.context.stroke();
    }

    drawSquare(x, y) {
        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(x, y);

        // Use stone interpolation for size
        const baseSize = 20;
        let size = this.interpolateDrawingSize(x, y, baseSize);

        // Increase size by 50% after interpolation
        size = size * 1.5;

        this.context.strokeRect(
            scaledX - size / 2,
            scaledY - size / 2,
            size,
            size,
        );
    }

    // Use the same interpolation logic as stones for drawing tools
    interpolateDrawingSize(x, y, baseSize) {
        if (
            !window.overlay || !window.overlay.isGridSet ||
            !window.overlay.grid.length
        ) {
            return baseSize * this.getScalingFactor();
        }

        // Find the closest grid point (i, j)
        let closestI = 0, closestJ = 0;
        let minDist = Infinity;
        for (let i = 0; i < window.overlay.grid.length; i++) {
            for (let j = 0; j < window.overlay.grid[i].length; j++) {
                const pt = window.overlay.grid[i][j];
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
        if (closestI > 0) {
            neighbors.push(window.overlay.grid[closestI - 1][closestJ]);
        }
        if (closestI < window.overlay.grid.length - 1) {
            neighbors.push(window.overlay.grid[closestI + 1][closestJ]);
        }
        if (closestJ > 0) {
            neighbors.push(window.overlay.grid[closestI][closestJ - 1]);
        }
        if (closestJ < window.overlay.grid[closestI].length - 1) {
            neighbors.push(window.overlay.grid[closestI][closestJ + 1]);
        }

        let minNeighborDist = Infinity;
        const centerPt = window.overlay.grid[closestI][closestJ];
        neighbors.forEach((pt) => {
            const dist = Math.hypot(centerPt[0] - pt[0], centerPt[1] - pt[1]);
            if (dist < minNeighborDist) minNeighborDist = dist;
        });

        // Fallback if no neighbor (shouldn't happen on a 19x19 grid)
        if (!isFinite(minNeighborDist) || minNeighborDist <= 0) {
            minNeighborDist = baseSize;
        }

        // The size should be proportional to the grid spacing
        const margin = 2; // px, tweak as needed
        let size = minNeighborDist - margin;

        // Scale the size based on the base size ratio
        size = size * (baseSize / 100); // 100 is the default stone size

        // Apply viewer mode scaling
        size = size * this.getScalingFactor();

        return Math.round(size);
    }

    getCanvasCoords(offsetX, offsetY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return [offsetX * scaleX, offsetY * scaleY];
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

    handleMouseEnter(e) {
        // Restart cursor tracking when mouse enters drawing layer
        if (
            !window.overlay.cursorSendInterval && window.networkManager &&
            !window.isViewerMode
        ) {
            // Reset last sent coordinates when re-entering
            window.overlay.lastSentX = undefined;
            window.overlay.lastSentY = undefined;

            window.overlay.cursorSendInterval = setInterval(() => {
                if (
                    window.overlay.currentMouseX !== undefined &&
                    window.overlay.currentMouseY !== undefined
                ) {
                    // Only send if coordinates have changed
                    if (
                        window.overlay.currentMouseX !==
                            window.overlay.lastSentX ||
                        window.overlay.currentMouseY !==
                            window.overlay.lastSentY
                    ) {
                        window.networkManager.send({
                            action: "cursor-move",
                            x: window.overlay.currentMouseX,
                            y: window.overlay.currentMouseY,
                            timestamp: Date.now(),
                        });
                        window.overlay.lastSentX = window.overlay.currentMouseX;
                        window.overlay.lastSentY = window.overlay.currentMouseY;
                    }
                }
            }, 50); // Exactly 20 times per second
        }
    }

    handleMouseLeave(e) {
        // Stop cursor tracking when mouse leaves drawing layer
        if (window.overlay && window.overlay.cursorSendInterval) {
            clearInterval(window.overlay.cursorSendInterval);
            window.overlay.cursorSendInterval = null;
        }
        if (window.overlay) {
            window.overlay.currentMouseX = undefined;
            window.overlay.currentMouseY = undefined;
        }
    }

    // Methods for viewer to replicate drawing actions
    startDrawingAt(x, y, tool) {
        this.isDrawing = true;
        this.currentPath = {
            points: [[x, y]],
            type: "path",
            color: this.getPenColor(),
        };
        this.context.beginPath();
        this.context.strokeStyle = this.getPenColor();
        this.context.moveTo(x, y);
    }

    drawTo(x, y) {
        if (!this.isDrawing) return;
        if (this.currentPath) {
            this.currentPath.points.push([x, y]);
        }
        this.context.lineTo(x, y);
        this.context.strokeStyle = this.getPenColor();
        this.context.stroke();
    }

    endDrawing() {
        if (this.isDrawing && this.currentPath) {
            this.paths.push(this.currentPath);
            this.currentPath = null;
        }
        this.isDrawing = false;
    }
}
