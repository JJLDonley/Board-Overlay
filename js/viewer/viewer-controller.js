import { debug } from '../utils/debugger.js';
import { VdoNinjaNetwork } from '../../network/network.js';

export class ViewerController {
    constructor(roomName = null) {
        this.network = null;
        
        // Map to store cursor data for each user
        // Key: senderId, Value: { element, label, currentX, currentY, targetX, targetY, visible, timeout }
        this.cursors = new Map();
        
        this.lerpSpeed = 0.3; 
        
        this.uuid = this.generateUUID();
        debug.log('🎥 ViewerController (VW) initialized with UUID:', this.uuid);
        
        this.setupNetwork(roomName);
        this.startCursorAnimation();
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    setupNetwork(providedRoomName) {
        let roomName = providedRoomName;

        // If no room name provided, try to get from URL (fallback)
        if (!roomName) {
            const params = new URLSearchParams(window.location.search);
            let obsUrl = params.get('obs');
            
            if (obsUrl) {
                obsUrl = decodeURIComponent(obsUrl);
                if (obsUrl.includes('%')) {
                    obsUrl = decodeURIComponent(obsUrl);
                }
                const obsParams = new URLSearchParams(obsUrl.split('?')[1] || '');
                roomName = obsParams.get('view') || obsParams.get('push');
            }
        }
        
        if (!roomName) {
            debug.error('❌ No room name found for ViewerController');
            return;
        }
        
        // Initialize network
        this.network = new VdoNinjaNetwork(roomName);
        
        // Connect with VW label
        const label = `VW_${this.uuid}`;
        this.network.connect(label);
        
        // Listen for messages
        this.network.on('command', (data) => {
            this.handleCommand(data);
        });
        
        this.network.on('connected', () => {
            debug.log('🎥 Network connected');
        });
    }
    
    handleCommand(data) {
        const { sender, payload } = data;
        
        // Filter: Only accept messages from CO role
        if (payload && payload.role === 'CO') {
            this.processCommand(payload, sender);
        }
    }
    
    processCommand(command, sender) {
        switch (command.action) {
            case 'set-grid':
                this.setGrid(command.points);
                break;
                
            case 'place-stone':
                this.placeStone(command.x, command.y, command.color);
                break;
                
            case 'draw-tool':
                this.handleDrawing(command);
                break;
                
            case 'draw-batch':
                this.handleDrawingBatch(command);
                break;
                
            case 'add-mark':
                this.addMark(command.type, command.x, command.y, command.text);
                break;
                
            case 'clear-drawing':
                this.clearDrawing();
                break;
                
            case 'clear-all':
                this.clearAll();
                break;
                
            case 'reset-board':
                this.resetBoard();
                break;
                
            case 'toggle-grid':
                this.toggleGrid(command.visible);
                break;
                
            case 'set-tool':
                this.setTool(command.tool);
                break;
                
            case 'cursor-move':
                this.updateCursor(sender, command.x, command.y);
                break;
                
            default:
                debug.log('🤷 Unknown command:', command.action);
                break;
        }
    }
    
    placeStone(x, y, color) {
        if (color === 'BOARD' || color === 'REMOVE_BOARD') {
            // Handle board stones
            if (window.overlay && window.overlay.placeBoardStone) {
                window.overlay.placeBoardStone(x, y, color);
                debug.log('🔴 Board stone action:', color, 'at:', x, y);
            }
        } else {
            // Handle regular stones
            if (window.overlay && window.overlay.placeStone) {
                window.overlay.placeStone(x, y, color);
                debug.log('🔴 Placed stone at:', x, y, 'color:', color);
            }
        }
    }
    
    handleDrawing(command) {
        if (window.drawingLayer) {
            switch (command.drawAction) {
                case 'start':
                    window.drawingLayer.startDrawingAt(command.x, command.y, command.tool);
                    break;
                case 'draw':
                    window.drawingLayer.drawTo(command.x, command.y);
                    break;
                case 'end':
                    window.drawingLayer.endDrawing();
                    break;
            }
            debug.log('✏️ Drawing action:', command.drawAction, 'at:', command.x, command.y);
        }
    }

    handleDrawingBatch(command) {
        if (window.drawingLayer && command.points && command.points.length > 0) {
            // Apply smooth interpolation between points for better visual quality
            this.drawSmoothBatch(command.points, command.color);
            debug.log(`🎨 Processed drawing batch with ${command.points.length} points`);
        }
    }

    drawSmoothBatch(points, color) {
        if (!window.drawingLayer || !window.drawingLayer.context || points.length === 0) return;
        
        const context = window.drawingLayer.context;
        const originalColor = context.strokeStyle;
        const originalLineWidth = context.lineWidth;
        
        // Set drawing properties
        if (color) {
            context.strokeStyle = color;
        }
        context.lineWidth = 2 * window.drawingLayer.getScalingFactor(); // Scale line width
        context.lineCap = 'round'; // Smooth line ends
        context.lineJoin = 'round'; // Smooth line joins
        
        // Scale all points for viewer mode
        const scaledPoints = points.map(point => {
            return window.drawingLayer.scaleCoordinates(point[0], point[1]);
        });
        
        // If we only have one point, draw a small dot
        if (scaledPoints.length === 1) {
            context.beginPath();
            const radius = 1 * window.drawingLayer.getScalingFactor();
            context.arc(scaledPoints[0][0], scaledPoints[0][1], radius, 0, 2 * Math.PI);
            context.fill();
            return;
        }
        
        // Use quadratic curves for smooth interpolation between points
        context.beginPath();
        context.moveTo(scaledPoints[0][0], scaledPoints[0][1]);
        
        // For smoother curves, we'll use every point as a control point
        for (let i = 1; i < scaledPoints.length; i++) {
            const currentPoint = scaledPoints[i];
            
            if (i === scaledPoints.length - 1) {
                // Last point - draw straight line
                context.lineTo(currentPoint[0], currentPoint[1]);
            } else {
                // Use next point to create smooth curve
                const nextPoint = scaledPoints[i + 1];
                const controlX = (currentPoint[0] + nextPoint[0]) / 2;
                const controlY = (currentPoint[1] + nextPoint[1]) / 2;
                
                context.quadraticCurveTo(currentPoint[0], currentPoint[1], controlX, controlY);
            }
        }
        
        context.stroke();
        
        // Restore original properties
        context.strokeStyle = originalColor;
        context.lineWidth = originalLineWidth;
    }
    
    clearDrawing() {
        // Clear only the drawing layer
        if (window.drawingLayer && window.drawingLayer.clearCanvas) {
            window.drawingLayer.clearCanvas();
            debug.log('🧹 Cleared drawing layer only');
        }
    }
    
    clearAll() {
        // Clear both drawing layer AND stones
        if (window.drawingLayer && window.drawingLayer.clearCanvas) {
            window.drawingLayer.clearCanvas();
            debug.log('🧹 Cleared drawing layer');
        }
        if (window.overlay && window.overlay.clearStones) {
            window.overlay.clearStones();
            debug.log('🧹 Cleared stones');
        }
        
        // Reset letter stack and button
        if (window.overlay) {
            // Reset letter stack
            window.overlay.letterStack = [];
            // Single letters A-Z
            for (let i = 65; i <= 90; i++) {
                window.overlay.letterStack.push(String.fromCharCode(i));
            }
            // Double letters AA-ZZ
            for (let i = 65; i <= 90; i++) {
                for (let j = 65; j <= 90; j++) {
                    window.overlay.letterStack.push(String.fromCharCode(i) + String.fromCharCode(j));
                }
            }
            
            // Update letter button
            const letterBtn = document.getElementById('LetterBtn');
            if (letterBtn) {
                letterBtn.textContent = window.overlay.letterStack[0];
            }
            debug.log('🧹 Reset letter stack');
        }
    }
    
    resetBoard() {
        if (window.overlay && window.overlay.resetGrid) {
            window.overlay.resetGrid();
            debug.log('🔄 Reset board');
        }
    }
    
    toggleGrid(visible) {
        if (window.overlay) {
            // In viewer mode, permanently disable grid visibility
            window.overlay.show = false;
            window.overlay.updateGridButtonState();
            debug.log('👁️ Grid permanently disabled in viewer mode');
        }
    }
    
    setTool(tool) {
        if (window.setCurrentTool) {
            window.setCurrentTool(tool);
            debug.log('🔧 Set tool:', tool);
        }
        
        // Update the UI to show the active tool
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        const toolButtons = {
            'BLACK': 'BlackStoneBtn',
            'WHITE': 'WhiteStoneBtn', 
            'ALTERNATING': 'AlternatingBtn',
            'PEN': 'PenBtn',
            'TRIANGLE': 'TriangleBtn',
            'CIRCLE': 'CircleBtn',
            'SQUARE': 'SquareBtn',
            'LETTER': 'LetterBtn'
        };
        
        const buttonId = toolButtons[tool];
        if (buttonId) {
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.add('active');
            }
        }
    }
    
    addMark(type, x, y, text = '') {
        if (window.drawingLayer && window.drawingLayer.addMark) {
            window.drawingLayer.addMark(type, x, y, text);
            debug.log('📍 Added mark:', type, 'at:', x, y, text ? `text: ${text}` : '');
            
            // Update letter button if it's a letter mark
            if (type === 'LETTER' && text) {
                const letterBtn = document.getElementById('LetterBtn');
                if (letterBtn && window.overlay && window.overlay.letterStack) {
                    // Remove the used letter from the stack
                    const letterIndex = window.overlay.letterStack.indexOf(text);
                    if (letterIndex >= 0) {
                        window.overlay.letterStack.splice(letterIndex, 1);
                    }
                    // Update button to show next letter
                    letterBtn.textContent = window.overlay.letterStack.length > 0 ? window.overlay.letterStack[0] : 'A';
                }
            }
        }
    }
    
    createCursorElement(senderId) {
        // Create cursor container
        const container = document.createElement('div');
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
        
        const cursorSvg = document.createElement('div');
        cursorSvg.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5)); transform: rotate(-15deg);">
                <path d="M0,0 L0,16 L5,11 L9,19 L11,18 L7,10 L12,10 Z" 
                      fill="${color}" 
                      stroke="white" 
                      stroke-width="1.5"/>
            </svg>
        `;
        
        // Create label
        const label = document.createElement('div');
        // Extract a short ID or use CO_X if possible, but senderId is usually a long UUID or hash
        // We'll try to make it look like CO_1, CO_2 based on the order of arrival or hash
        const shortId = senderId.substring(0, 4);
        label.textContent = `CO_${shortId}`;
        label.style.cssText = `
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
        container.appendChild(label);
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
    
    // Get scaling factor for viewer mode (1.5 for 1920/1280, 1 for main page)
    getScalingFactor() {
        return window.isViewerMode ? 1.5 : 1;
    }
    
    // Scale coordinates from 1280x720 to 1920x1080
    scaleCoordinates(x, y) {
        const scale = this.getScalingFactor();
        return [x * scale, y * scale];
    }
    
    updateCursor(senderId, x, y) {
        if (!senderId) return;

        // Scale coordinates from commentator (1280x720) to viewer (1920x1080)
        const [scaledX, scaledY] = this.scaleCoordinates(x, y);
        
        let cursor = this.cursors.get(senderId);
        
        if (!cursor) {
            const element = this.createCursorElement(senderId);
            cursor = {
                element: element,
                currentX: scaledX,
                currentY: scaledY,
                targetX: scaledX,
                targetY: scaledY,
                visible: true,
                timeout: null
            };
            this.cursors.set(senderId, cursor);
            debug.log(`👤 New cursor created for ${senderId}`);
        }
        
        // Update target position
        cursor.targetX = scaledX;
        cursor.targetY = scaledY;
        cursor.visible = true;
        cursor.element.style.display = 'block';
        cursor.element.style.opacity = '1';
        
        // Reset timeout
        if (cursor.timeout) clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            cursor.visible = false;
            cursor.element.style.opacity = '0';
            // We keep the element in DOM but hide it
        }, 3000);
    }
    
    startCursorAnimation() {
        const animateCursors = () => {
            this.cursors.forEach((cursor) => {
                if (!cursor.visible && Math.abs(cursor.element.style.opacity) < 0.01) return;
                
                // Lerp
                cursor.currentX += (cursor.targetX - cursor.currentX) * this.lerpSpeed;
                cursor.currentY += (cursor.targetY - cursor.currentY) * this.lerpSpeed;
                
                this.updateCursorPosition(cursor);
            });
            
            requestAnimationFrame(animateCursors);
        };
        
        requestAnimationFrame(animateCursors);
        debug.log('🎬 Cursor animation loop started');
    }
    
    updateCursorPosition(cursor) {
        const canvas = document.getElementById('overlay');
        if (canvas && cursor.element) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            
            // Convert canvas coordinates to page coordinates
            const pageX = rect.left + window.scrollX + (cursor.currentX * scaleX);
            const pageY = rect.top + window.scrollY + (cursor.currentY * scaleY);
            
            cursor.element.style.left = pageX + 'px';
            cursor.element.style.top = pageY + 'px';
        }
    }
    
    setGrid(points) {
        if (window.overlay && points && points.length === 4) {
            window.overlay.points = points;
            window.overlay.grid = window.overlay.generateGrid(points);
            window.overlay.isGridSet = true;
            debug.log('📐 Grid coordinates set:', points);
            
            // In viewer mode, never show grid dots, only coordinates
            if (window.isViewerMode) {
                window.overlay.show = false;
                window.overlay.updateGridButtonState();
                debug.log('👁️ Grid dots permanently disabled in viewer mode');
            }
        }
    }
}