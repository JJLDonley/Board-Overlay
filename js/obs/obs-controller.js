import { debug } from '../utils/debugger.js';

export class OBSController {
    constructor() {
        this.scenes = [];
        this.currentScene = '';
        this.isStreaming = false;
        this.isConnected = false;
        
        // Initialize DOM elements after a delay to avoid race condition
        this.initializeElements();
        this.setupMessageListener();
    }
    
    initializeElements() {
        // Try to get elements immediately
        this.getElements();
        
        // If elements not found, try again after DOM is ready
        if (!this.obsIframe || !this.sceneButtonsContainer || !this.streamToggleBtn || !this.connectionStatus) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.getElements();
                    this.setupUI();
                });
            } else {
                // DOM is already loaded, try again after a short delay
                setTimeout(() => {
                    this.getElements();
                    this.setupUI();
                }, 100);
            }
        } else {
            this.setupUI();
        }
    }
    
    getElements() {
        this.obsIframe = document.getElementById('obs');
        this.sceneButtonsContainer = document.getElementById('obsSceneButtons');
        this.sceneDropdownContainer = document.getElementById('obsSceneDropdown');
        this.sceneSelect = document.getElementById('obsSceneSelect');
        this.streamToggleBtn = document.getElementById('obsStreamToggle');
        this.connectionStatus = document.getElementById('obsConnectionStatus');
        
        debug.log('🔍 OBS Elements found:', {
            obsIframe: !!this.obsIframe,
            sceneButtonsContainer: !!this.sceneButtonsContainer,
            sceneDropdownContainer: !!this.sceneDropdownContainer,
            sceneSelect: !!this.sceneSelect,
            streamToggleBtn: !!this.streamToggleBtn,
            connectionStatus: !!this.connectionStatus
        });
    }

    setupMessageListener() {
        window.addEventListener('message', (e) => {
            // Only listen to messages from our OBS iframe
            if (!this.obsIframe || e.source !== this.obsIframe.contentWindow) {
                return;
            }
            
            debug.log('📨 Message from VDO Ninja:', e.data);
            
            // Handle obs-state messages
            if (e.data && e.data.action === 'obs-state' && e.data.value) {
                this.handleOBSState(e.data.value);
            }
        });
    }

    handleOBSState(obsData) {
        debug.log('🎯 Processing OBS state:', obsData);
        
        // Store the UUID for sending messages back
        if (obsData.UUID) {
            this.connectionUUID = obsData.UUID;
            debug.log('💾 Stored connection UUID:', this.connectionUUID);
        }
        
        // Check if data is in details
        let data = obsData.details || obsData;
        debug.log('📊 Using data:', data);
        
        // Extract connection status
        this.isConnected = !!(data.connected || data.scenes || data.currentScene || Object.keys(data).length > 0);
        
        // Extract scenes
        if (data.scenes && Array.isArray(data.scenes)) {
            this.scenes = data.scenes;
            debug.log('🎬 Found scenes:', this.scenes);
        }
        
        // Extract current scene
        if (data.currentScene) {
            // Handle both string and object formats
            this.currentScene = typeof data.currentScene === 'object' ? data.currentScene.name : data.currentScene;
            debug.log('🎯 Current scene:', this.currentScene);
        }
        
        // Extract streaming status
        if (data.streaming !== undefined) {
            this.isStreaming = data.streaming;
            debug.log('📡 Streaming:', this.isStreaming);
        }
        
        this.updateUI();
    }

    setupUI() {
        // Scene selector
        if (this.sceneSelect) {
            this.sceneSelect.addEventListener('change', (e) => {
                const sceneName = e.target.value;
                if (sceneName) {
                    this.switchToScene(sceneName);
                }
            });
        }
        
        // Stream toggle button
        if (this.streamToggleBtn) {
            this.streamToggleBtn.addEventListener('click', () => {
                this.toggleStreaming();
            });
        }
    }

    updateUI() {
        // Make sure we have elements before updating
        if (!this.connectionStatus || !this.sceneButtonsContainer || !this.streamToggleBtn) {
            debug.log('⚠️ UI elements not ready, retrying...');
            this.getElements();
            if (!this.connectionStatus || !this.sceneButtonsContainer || !this.streamToggleBtn) {
                debug.log('❌ UI elements still not found, skipping update');
                return;
            }
        }
        
        // Update connection status
        if (this.connectionStatus) {
            this.connectionStatus.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            // Properly handle CSS classes without overwriting existing ones
            this.connectionStatus.classList.remove('connected', 'disconnected');
            this.connectionStatus.classList.add(this.isConnected ? 'connected' : 'disconnected');
        }
        
        // Update scenes - create buttons for few scenes, dropdown for many
        this.updateScenes();
        
        // Update stream button
        if (this.streamToggleBtn) {
            this.streamToggleBtn.textContent = this.isStreaming ? 'Stop Stream' : 'Start Stream';
            this.streamToggleBtn.disabled = !this.isConnected;
        }
        
        debug.log('✅ UI updated - Connected:', this.isConnected, 'Scenes:', this.scenes.length, 'Streaming:', this.isStreaming);
    }

    updateScenes() {
        const maxButtons = 4; // Show buttons for 4 or fewer scenes, dropdown for more
        
        if (this.scenes.length === 0) {
            // No scenes - hide both buttons and dropdown
            if (this.sceneButtonsContainer) {
                this.sceneButtonsContainer.innerHTML = '';
                this.sceneButtonsContainer.style.display = 'none';
            }
            if (this.sceneDropdownContainer) {
                this.sceneDropdownContainer.style.display = 'none';
            }
            debug.log('🎬 No scenes to display');
            return;
        }

        if (this.scenes.length <= maxButtons) {
            // Few scenes - create buttons (only if they don't exist or scenes changed)
            const existingButtons = this.sceneButtonsContainer ? this.sceneButtonsContainer.querySelectorAll('.scene-btn') : [];
            const needsRebuild = !existingButtons.length || existingButtons.length !== this.scenes.length;
            
            if (needsRebuild) {
                debug.log('🎬 Creating scene buttons for', this.scenes.length, 'scenes');
                
                if (this.sceneButtonsContainer) {
                    this.sceneButtonsContainer.innerHTML = '';
                    this.sceneButtonsContainer.style.display = 'flex';
                    
                    this.scenes.forEach(scene => {
                        const sceneName = typeof scene === 'object' ? scene.name : scene;
                        const button = document.createElement('button');
                        button.className = 'scene-btn obs-btn';
                        button.textContent = sceneName;
                        button.disabled = !this.isConnected;
                        button.dataset.sceneName = sceneName; // Store scene name for easy lookup
                        
                        button.addEventListener('click', () => {
                            this.switchToScene(sceneName);
                        });
                        
                        this.sceneButtonsContainer.appendChild(button);
                    });
                }
            }
            
            // Update button states (active/inactive)
            this.updateSceneButtonStates();
            
            // Hide dropdown
            if (this.sceneDropdownContainer) {
                this.sceneDropdownContainer.style.display = 'none';
            }
            
        } else {
            // Many scenes - use dropdown
            debug.log('🎬 Creating scene dropdown for', this.scenes.length, 'scenes');
            
            if (this.sceneSelect) {
                this.sceneSelect.innerHTML = '<option value="">Select Scene</option>';
                
                this.scenes.forEach(scene => {
                    const option = document.createElement('option');
                    const sceneName = typeof scene === 'object' ? scene.name : scene;
                    option.value = sceneName;
                    option.textContent = sceneName;
                    if (sceneName === this.currentScene) {
                        option.selected = true;
                    }
                    this.sceneSelect.appendChild(option);
                });
                
                this.sceneSelect.disabled = !this.isConnected;
            }
            
            // Show dropdown, hide buttons
            if (this.sceneDropdownContainer) {
                this.sceneDropdownContainer.style.display = 'block';
            }
            if (this.sceneButtonsContainer) {
                this.sceneButtonsContainer.style.display = 'none';
            }
        }
    }

    updateSceneButtonStates() {
        if (!this.sceneButtonsContainer) return;
        
        const buttons = this.sceneButtonsContainer.querySelectorAll('.scene-btn');
        buttons.forEach(button => {
            const sceneName = button.dataset.sceneName;
            if (sceneName === this.currentScene) {
                button.classList.add('active');
                debug.log('🎯 Marked button active:', sceneName);
            } else {
                button.classList.remove('active');
            }
            button.disabled = !this.isConnected;
        });
    }

    switchToScene(sceneName) {
        debug.log('🔄 Switching to scene:', sceneName);
        
        if (!this.obsIframe) {
            debug.log('❌ No OBS iframe found');
            return;
        }
        
        // Immediately update current scene for UI feedback
        this.currentScene = sceneName;
        this.updateSceneButtonStates();
        
        // Use the correct VDO Ninja obsCommand format
        const message = {
            obsCommand: {
                action: "setCurrentScene",
                value: sceneName
            },
            UUID: this.connectionUUID || null
        };
        
        this.obsIframe.contentWindow.postMessage(message, '*');
        debug.log('📤 Sent scene switch message:', message);
    }

    toggleStreaming() {
        debug.log('🎬 Toggling stream - current state:', this.isStreaming);
        
        if (!this.obsIframe) {
            debug.log('❌ No OBS iframe found');
            return;
        }
        
        const action = this.isStreaming ? 'stopStreaming' : 'startStreaming';
        
        // Use the correct VDO Ninja obsCommand format
        const message = {
            obsCommand: {
                action: action
            },
            UUID: this.connectionUUID || null
        };
        
        this.obsIframe.contentWindow.postMessage(message, '*');
        debug.log('📤 Sent stream toggle message:', message);
    }

    // Request initial OBS status (VDO Ninja sends obs-state automatically)
    requestStatus() {
        debug.log('📤 OBS status is sent automatically by VDO Ninja');
    }
} 