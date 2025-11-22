import { CONST, STONES, GRIDSIZE } from '../constants.js';
import { debug } from '../utils/debugger.js';

export let currentTool = 'ALTERNATING';

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
        this.stones = []; // For black and white stones (variations)
        this.boardStones = []; // For board stones (empty positions)
        this.grid = [];
        this.points = [];
        this.isGridSet = false;
        this.currentColor = "BLACK";
        this.LetterToolList = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        this.LetterToolListIndex = 0;
        
        // Initialize letter stack from A to ZZ in alphabetical order
        this.letterStack = [];
        // Single letters A-Z
        for (let i = 65; i <= 90; i++) {
            this.letterStack.push(String.fromCharCode(i));
        }
        // Double letters AA-ZZ
        for (let i = 65; i <= 90; i++) {
            for (let j = 65; j <= 90; j++) {
                this.letterStack.push(String.fromCharCode(i) + String.fromCharCode(j));
            }
        }
        
        // All stones should be 100x100
        this.stoneSizes = {
            BLACK: 100,
            WHITE: 100,
            BOARD: 100
        };
        this.bindEventListeners();
        this.setupToolbar();
        this.updateGridButtonState();
        
        // Set default tool to ALTERNATING and make button active
        const alternatingBtn = document.getElementById('AlternatingBtn');
        if (alternatingBtn) {
            alternatingBtn.classList.add('active');
        }
    }

    setupToolbar() {
        const tools = {
            'BlackStoneBtn': 'BLACK',
            'WhiteStoneBtn': 'WHITE',
            'AlternatingBtn': 'ALTERNATING',
            'PenBtn': 'PEN',
            'TriangleBtn': 'TRIANGLE',
            'CircleBtn': 'CIRCLE',
            'SquareBtn': 'SQUARE',
            'LetterBtn': 'LETTER'
        };

        const drawingLayerElement = document.getElementById('drawingLayer');

        Object.entries(tools).forEach(([btnId, toolType]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentTool = toolType;
                    
                    // Update global currentTool for drawing layer
                    if (window.setCurrentTool) {
                        window.setCurrentTool(toolType);
                    }
                    window.currentTool = toolType;
                    
                    // Toggle drawing layer interaction based on pen tool
                    if (toolType === 'PEN') {
                        drawingLayerElement.classList.add('pen-active');
                    } else {
                        drawingLayerElement.classList.remove('pen-active');
                    }
                    
                    // Send to viewer if network manager is available
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: 'set-tool',
                            tool: toolType
                        });
                    }
                });
            }
        });
    }

    switchCurrentColor() {
        this.currentColor = this.currentColor === "BLACK" ? "WHITE" : "BLACK";
        debug.log('🎨 Switched current color to:', this.currentColor);
        
        // Send to viewer if network manager is available
        if (window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: 'switch-color',
                color: this.currentColor,
                timestamp: Date.now()
            });
        }
    }

    initializeCanvas() {
        // Set canvas dimensions based on mode
        if (window.isViewerMode) {
            // Viewer mode: 1920x1080 for OBS overlay
            this.canvas.width = 1920;
            this.canvas.height = 1080;
        } else {
            // Main page: 1280x720 for commentary
            this.canvas.width = 1280;
            this.canvas.height = 720;
        }
        
        // Make canvas focusable for keyboard shortcuts
        this.canvas.tabIndex = 0;
        this.canvas.style.outline = 'none'; // Remove focus outline
    }

    updateCanvasDimensions() {
        // Update canvas dimensions based on current mode
        if (window.isViewerMode) {
            // Viewer mode: 1920x1080 for OBS overlay
            this.canvas.width = 1920;
            this.canvas.height = 1080;
        } else {
            // Main page: 1280x720 for commentary
            this.canvas.width = 1280;
            this.canvas.height = 720;
        }
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
        this.canvas.addEventListener('click', () => {
            this.canvas.focus();
        });
        
        document.addEventListener("keydown", (event) => {
            // Don't trigger shortcuts if user is typing in any input field
            const activeElement = document.activeElement;
            const isInputField = activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' || 
                activeElement.tagName === 'SELECT' ||
                activeElement.contentEditable === 'true' ||
                activeElement.contentEditable === 'plaintext-only' ||
                activeElement.role === 'textbox' ||
                activeElement.role === 'searchbox' ||
                activeElement.role === 'combobox'
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
                    debug.log('👁️ Grid dots disabled in viewer mode');
                } else {
                    this.show = !this.show;
                }
                this.updateGridButtonState();
                
                // Send to viewer if network manager is available
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: 'toggle-grid',
                        visible: this.show
                    });
                }
            });
        }
        const coordBtn = document.getElementById("CoordBtn");
        if (coordBtn) {
            coordBtn.addEventListener("click", () => {
                // In viewer mode, coordinates are always on and cannot be toggled
                if (window.isViewerMode) {
                    debug.log('👁️ Coordinates permanently enabled in viewer mode');
                    return;
                }
                this.showCoordinates = !this.showCoordinates;
            });
        }
    }

    updateGridButtonState() {
        if (!this.gridElement) return; // Ensure gridElement is not null
        // Use SVG icons for grid on/off
        const gridOnIcon = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" rx="2" stroke="white" stroke-width="2"/><path d="M2 7H18" stroke="white" stroke-width="2"/><path d="M2 13H18" stroke="white" stroke-width="2"/><path d="M7 2V18" stroke="white" stroke-width="2"/><path d="M13 2V18" stroke="white" stroke-width="2"/></svg>`;
        const gridOffIcon = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="16" height="16" rx="2" stroke="#666" stroke-width="2"/><path d="M2 7H18" stroke="#666" stroke-width="2"/><path d="M2 13H18" stroke="#666" stroke-width="2"/><path d="M7 2V18" stroke="#666" stroke-width="2"/><path d="M13 2V18" stroke="#666" stroke-width="2"/></svg>`;
        
        // In viewer mode, always show grid as off (even though coordinates may be visible)
        const effectiveShow = window.isViewerMode ? false : this.show;
        
        if (effectiveShow) {
            this.gridElement.classList.add('active');
            this.gridElement.innerHTML = gridOnIcon;
        } else {
            this.gridElement.classList.remove('active');
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
        const effectiveShowCoordinates = window.isViewerMode ? true : this.showCoordinates;
        
        if (effectiveShowCoordinates) {
            coordBtn.classList.add('active');
        } else {
            coordBtn.classList.remove('active');
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
        this.boardStones.forEach(stone => this.drawCircle(stone));
        // Then draw variation stones and their markers
        this.stones.forEach((stone, index) => {
            this.drawCircle(stone);
            this.drawMarker(stone, index);
        });
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
            const shouldShowCoordinates = window.isViewerMode ? true : this.showCoordinates;
            if (shouldShowCoordinates && this.grid.length > 0 && this.grid[0].length > 0) {
                const colLabels = [
                    'A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','Q','R','S','T'
                ]; // Go skips 'I'
                this.context.save();
                this.context.font = `${24 * this.getScalingFactor()}px Arial`;
                
                // Get coordinate color from coordinate color picker, fallback to white
                const colorInput = document.getElementById('coordinateColor');
                const coordinateColor = colorInput ? colorInput.value : 'white';
                this.context.fillStyle = coordinateColor;
                
                this.context.textAlign = 'center';
                this.context.textBaseline = 'middle';

                // Top labels (columns)
                for (let j = 0; j < Math.min(19, this.grid[0].length); j++) {
                    const pt = this.grid[0][j];
                    if (pt && pt.length >= 2) {
                        // Scale coordinates for viewer mode
                        const [scaledX, scaledY] = this.scaleCoordinates(pt[0], pt[1]);
                        // Place label above the first row
                        this.context.fillText(colLabels[j], scaledX, scaledY - 32 * this.getScalingFactor());
                    }
                }
                // Left labels (rows)
                for (let i = 0; i < Math.min(19, this.grid.length); i++) {
                    const pt = this.grid[i][0];
                    if (pt && pt.length >= 2) {
                        // Scale coordinates for viewer mode
                        const [scaledX, scaledY] = this.scaleCoordinates(pt[0], pt[1]);
                        // Place label to the left of the first column
                        this.context.textAlign = 'right';
                        this.context.fillText((i+1).toString(), scaledX - 24 * this.getScalingFactor(), scaledY);
                        this.context.textAlign = 'center'; // Reset for columns
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
        if (typeof this.userChangedStoneSize === 'undefined') {
            this.userChangedStoneSize = false;
            stoneSizeInput.addEventListener('input', () => {
                this.userChangedStoneSize = true;
            }, { once: true });
        }
    }

    clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawStones() {
        this.stones.forEach((stone) => this.drawCircle(stone));
    }

    markLastStone() {
        this.stones.forEach((stone, index) => this.drawMarker(stone, index));
    }

    drawCircle([mouse_x, mouse_y, stone_color]) {
        if (!this.isGridSet || !this.grid.length) {
            return;
        }

        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(mouse_x, mouse_y);

        // Get base size based on stone type
        const baseSize = this.stoneSizes[stone_color === STONES.BLACK ? 'BLACK' : 
                                      stone_color === STONES.WHITE ? 'WHITE' : 'BOARD'];
        // Calculate interpolated stone size
        let stoneSize = this.interpolateStoneSize(mouse_x, mouse_y, baseSize);

        // If black or white, scale up by 1.25 to compensate for image padding
        let scale = 1;
        if (stone_color === STONES.BLACK || stone_color === STONES.WHITE) {
            scale = 1.25;
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

    drawMarker([mouse_x, mouse_y, stone_color], index) {
        if (!this.isGridSet || !this.grid.length) {
            return;
        }

        // Scale coordinates for viewer mode
        const [scaledX, scaledY] = this.scaleCoordinates(mouse_x, mouse_y);

        // Use the stone's base size for marker scaling
        const baseSize = this.stoneSizes[stone_color === STONES.BLACK ? 'BLACK' : 
                                      stone_color === STONES.WHITE ? 'WHITE' : 'BOARD'];
        const stoneSize = this.interpolateStoneSize(mouse_x, mouse_y, baseSize);
        
        this.context.fillStyle = (stone_color === STONES.BLACK)
            ? "white"
            : "black";

        this.context.font = `${stoneSize / 3 * this.getScalingFactor()}px Arial`;
        this.context.textAlign = "center";
        this.context.textBaseline = "middle";

        this.context.fillText(index + 1, scaledX, scaledY);
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
        if (closestI < this.grid.length - 1) neighbors.push(this.grid[closestI + 1][closestJ]);
        if (closestJ > 0) neighbors.push(this.grid[closestI][closestJ - 1]);
        if (closestJ < this.grid[closestI].length - 1) neighbors.push(this.grid[closestI][closestJ + 1]);

        let minNeighborDist = Infinity;
        const centerPt = this.grid[closestI][closestJ];
        neighbors.forEach(pt => {
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
                        action: 'set-grid',
                        points: this.points
                    });
                    debug.log('📐 Sent grid coordinates to viewers:', this.points);
                }
            }
        } else if (this.isGridSet) {
            let point = this.findClosestPoint(cx, cy, this.grid);

            // Handle shape/letter tools
            if (['TRIANGLE', 'CIRCLE', 'SQUARE', 'LETTER'].includes(currentTool)) {
                let text = '';
                if (currentTool === 'LETTER') {
                    const letterBtn = document.getElementById('LetterBtn');
                    if (letterBtn) {
                        // Check if there's already a letter at this position
                        const existingLetter = window.drawingLayer.marks.find(mark => 
                            mark.type === 'LETTER' && 
                            Math.sqrt((mark.x - point[0]) ** 2 + (mark.y - point[1]) ** 2) <= 20
                        );
                        
                        if (existingLetter) {
                            // Remove the existing letter
                            window.drawingLayer.marks = window.drawingLayer.marks.filter(mark => mark !== existingLetter);
                            window.drawingLayer.redrawAll();
                            
                            // Insert the removed letter back into its proper alphabetical position
                            const removedLetter = existingLetter.text;
                            let insertIndex = 0;
                            
                            // Find the correct position to maintain alphabetical order
                            for (let i = 0; i < this.letterStack.length; i++) {
                                if (this.letterStack[i] > removedLetter) {
                                    insertIndex = i;
                                    break;
                                }
                                insertIndex = i + 1;
                            }
                            
                            this.letterStack.splice(insertIndex, 0, removedLetter);
                            letterBtn.textContent = this.letterStack[0];
                            return;
                        } else {
                            // Get the next letter from the stack
                            if (this.letterStack.length > 0) {
                                text = this.letterStack.shift(); // Remove and get the first letter
                                letterBtn.textContent = this.letterStack.length > 0 ? this.letterStack[0] : 'A';
                            } else {
                                text = 'A'; // Fallback if stack is empty
                                letterBtn.textContent = 'A';
                            }
                        }
                    } else {
                        text = 'A';
                    }
                }
                window.drawingLayer.addMark(currentTool, point[0], point[1], text);
                
                // Send to viewer if network manager is available
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: 'add-mark',
                        type: currentTool,
                        x: point[0],
                        y: point[1],
                        text: text,
                        timestamp: Date.now()
                    });
                }
                return;
            }

            if (event.button === 2) { // Right click - handle board stones
                let existingBoardStoneIndex = this.boardStones.findIndex(([x, y]) =>
                    x === point[0] && y === point[1]
                );
                if (existingBoardStoneIndex >= 0) {
                    this.boardStones.splice(existingBoardStoneIndex, 1);
                    // Send board stone removal to viewer
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: 'place-stone',
                            x: point[0],
                            y: point[1],
                            color: 'REMOVE_BOARD'
                        });
                    }
                } else {
                    // Remove any variation stone at this position
                    let existingStoneIndex = this.stones.findIndex(([x, y]) =>
                        x === point[0] && y === point[1]
                    );
                    if (existingStoneIndex >= 0) {
                        this.stones.splice(existingStoneIndex, 1);
                    }
                    this.boardStones.push([point[0], point[1], STONES.BOARD]);
                    
                    // Send board stone placement to viewer
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: 'place-stone',
                            x: point[0],
                            y: point[1],
                            color: 'BOARD'
                        });
                        
                        // Also send current grid coordinates with board stone placement
                        if (this.points && this.points.length === 4) {
                            window.networkManager.send({
                                action: 'set-grid',
                                points: this.points
                            });
                            debug.log('📐 Sent grid coordinates with board stone placement:', this.points);
                        }
                    }
                }
                         } else if (event.button === 0) { // Left click - handle variation stones
                 let existingStoneIndex = this.stones.findIndex(([x, y]) =>
                     x === point[0] && y === point[1]
                 );
                 if (existingStoneIndex >= 0) {
                     // Remove existing stone
                     this.stones.splice(existingStoneIndex, 1);
                     
                     // Send stone removal to viewer
                     if (window.networkManager && !window.isViewerMode) {
                         window.networkManager.send({
                             action: 'remove-stone',
                             x: point[0],
                             y: point[1],
                             timestamp: Date.now()
                         });
                         
                         // Also send current grid coordinates with stone removal
                         if (this.points && this.points.length === 4) {
                             window.networkManager.send({
                                 action: 'set-grid',
                                 points: this.points
                             });
                             debug.log('📐 Sent grid coordinates with stone removal:', this.points);
                         }
                     }
                 } else {
                     // Remove any board stone at this position
                     let existingBoardStoneIndex = this.boardStones.findIndex(([x, y]) =>
                         x === point[0] && y === point[1]
                     );
                     if (existingBoardStoneIndex >= 0) {
                         this.boardStones.splice(existingBoardStoneIndex, 1);
                     }
                     
                     // Determine which stone to place based on current tool
                     let stoneToPlace;
                     if (currentTool === 'BLACK') {
                         stoneToPlace = 'BLACK';
                     } else if (currentTool === 'WHITE') {
                         stoneToPlace = 'WHITE';
                     } else if (currentTool === 'ALTERNATING') {
                         stoneToPlace = this.currentColor;
                     } else {
                         stoneToPlace = this.currentColor; // fallback
                     }
                     
                     this.stones.push([point[0], point[1], STONES[stoneToPlace]]);
                     
                     // Send to viewer if network manager is available
                     if (window.networkManager && !window.isViewerMode) {
                         window.networkManager.send({
                             action: 'place-stone',
                             x: point[0],
                             y: point[1],
                             color: stoneToPlace
                         });
                         
                         // Also send current grid coordinates with each stone placement
                         if (this.points && this.points.length === 4) {
                             window.networkManager.send({
                                 action: 'set-grid',
                                 points: this.points
                             });
                             debug.log('📐 Sent grid coordinates with stone placement:', this.points);
                         }
                     }
                 }
                
                // Only alternate colors if using ALTERNATING tool and not holding shift
                if (currentTool === 'ALTERNATING' && !event.shiftKey) {
                    this.currentColor = this.currentColor === "BLACK" ? "WHITE" : "BLACK";
                    // Don't change the active button since we're in alternating mode
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
        if (!this.cursorSendInterval && window.networkManager && !window.isViewerMode) {
            // Track last sent coordinates to avoid duplicates
            this.lastSentX = undefined;
            this.lastSentY = undefined;
            
            this.cursorSendInterval = setInterval(() => {
                if (this.currentMouseX !== undefined && this.currentMouseY !== undefined) {
                    // Only send if coordinates have changed
                    if (this.currentMouseX !== this.lastSentX || this.currentMouseY !== this.lastSentY) {
                    window.networkManager.send({
                        action: 'cursor-move',
                        x: this.currentMouseX,
                        y: this.currentMouseY,
                        timestamp: Date.now()
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
        if (!this.cursorSendInterval && window.networkManager && !window.isViewerMode) {
            // Reset last sent coordinates when re-entering
            this.lastSentX = undefined;
            this.lastSentY = undefined;
            
            this.cursorSendInterval = setInterval(() => {
                if (this.currentMouseX !== undefined && this.currentMouseY !== undefined) {
                    // Only send if coordinates have changed
                    if (this.currentMouseX !== this.lastSentX || this.currentMouseY !== this.lastSentY) {
                    window.networkManager.send({
                        action: 'cursor-move',
                        x: this.currentMouseX,
                        y: this.currentMouseY,
                        timestamp: Date.now()
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
        if (event.code === "KeyR") {
            this.resetGrid();
            event.preventDefault();
        } else if (event.code === "KeyQ") {
            this.switchCurrentColor();
            event.preventDefault();
        }
    }

    clearStones() {
        this.stones = [];
        this.boardStones = [];
        this.clearCanvas();
        
        // Reset letter stack
        this.letterStack = [];
        // Single letters A-Z
        for (let i = 65; i <= 90; i++) {
            this.letterStack.push(String.fromCharCode(i));
        }
        // Double letters AA-ZZ
        for (let i = 65; i <= 90; i++) {
            for (let j = 65; j <= 90; j++) {
                this.letterStack.push(String.fromCharCode(i) + String.fromCharCode(j));
            }
        }
        
        // Update letter button
        const letterBtn = document.getElementById('LetterBtn');
        if (letterBtn) {
            letterBtn.textContent = this.letterStack[0];
        }
        
        // Note: Viewer communication is now handled centrally in main.js
    }

    checkForOverlappingStones() {
        // Checking for overlapping stones and removing overlaps
        this.stones = this.stones.filter((stone, i) => {
            for (let j = i + 1; j < this.stones.length; j++) {
                if (this.isOverlapping(stone, this.stones[j])) {
                    return false;
                }
            }
            return true;
        });
    }

    isOverlapping([x1, y1], [x2, y2]) {
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        return distance < this.stones_radius + 10; // Assuming radius as the criterion for overlap
    }

    getCanvasCoords(clientX, clientY) {
        let { width, height } = this.canvas.getBoundingClientRect();
        let scaleX = this.canvas.width / width;
        let scaleY = this.canvas.height / height;
        return [clientX * scaleX, clientY * scaleY];
    }

    // Get scaling factor for viewer mode (1920/1280 = 1.5)
    getScalingFactor() {
        return window.isViewerMode ? 1.5 : 1;
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
        this.stones = [];
        this.boardStones = [];
        this.updateGridButtonState();
        if (window.updateShareableUrl) {
            window.updateShareableUrl();
        }
        
        // Send to viewer if network manager is available
        if (window.networkManager && !window.isViewerMode) {
            window.networkManager.send({
                action: 'reset-grid'
            });
        }
    }
    
    placeStone(x, y, color) {
        // Method for viewer to place stones programmatically
        // Check if there's already a stone at this position
        let existingStoneIndex = this.stones.findIndex(([stoneX, stoneY]) =>
            stoneX === x && stoneY === y
        );
        
        if (existingStoneIndex >= 0) {
            // If there's already a stone at this position, check if it's the same color
            const existingStone = this.stones[existingStoneIndex];
            if (existingStone[2] === STONES[color]) {
                // Same stone, same color - do nothing
                return;
            } else {
                // Different color - replace the stone
                this.stones.splice(existingStoneIndex, 1);
            }
        } else {
            // Remove any board stone at this position
            let existingBoardStoneIndex = this.boardStones.findIndex(([stoneX, stoneY]) =>
                stoneX === x && stoneY === y
            );
            if (existingBoardStoneIndex >= 0) {
                this.boardStones.splice(existingBoardStoneIndex, 1);
            }
        }
        
        // Add the new stone
        this.stones.push([x, y, STONES[color]]);
    }
    
    placeBoardStone(x, y, action) {
        // Method for viewer to place/remove board stones programmatically
        if (action === 'REMOVE_BOARD') {
            // Remove board stone at this position
            let existingBoardStoneIndex = this.boardStones.findIndex(([stoneX, stoneY]) =>
                stoneX === x && stoneY === y
            );
            if (existingBoardStoneIndex >= 0) {
                this.boardStones.splice(existingBoardStoneIndex, 1);
            }
        } else if (action === 'BOARD') {
            // Remove any existing stone at this position first
            let existingStoneIndex = this.stones.findIndex(([stoneX, stoneY]) =>
                stoneX === x && stoneY === y
            );
            if (existingStoneIndex >= 0) {
                this.stones.splice(existingStoneIndex, 1);
            }
            
            // Remove any existing board stone at this position
            let existingBoardStoneIndex = this.boardStones.findIndex(([stoneX, stoneY]) =>
                stoneX === x && stoneY === y
            );
            if (existingBoardStoneIndex >= 0) {
                this.boardStones.splice(existingBoardStoneIndex, 1);
            }
            
            // Add the board stone
            this.boardStones.push([x, y, STONES.BOARD]);
        }
    }
}