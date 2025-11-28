import { debug } from "./utils/debugger.js";
import { CONST, STONES } from "./constants.js";
import { DrawingLayer } from "./canvas/drawing-layer.js";
import { Canvas, currentTool, setCurrentTool } from "./canvas/canvas.js";
import { IframeManager } from "./managers/iframe-manager.js";
import { UIManager } from "./managers/ui-manager.js";
import { Video } from "./media/video.js";
import { ConfigManager } from "./managers/config-manager.js";
import { OBSController } from "./obs/obs-controller.js";
import { NetworkManager } from "./managers/network-manager.js";

// Global variables
let isEventSet = false;
let overlay = null;
let drawingLayer = null;

// URL management functions (simplified for now)
function updateShareableUrl() {
    // Set a flag to prevent loadConfigFromUrl from being called during URL updates
    window._updatingUrl = true;

    const params = new URLSearchParams();

    // Only chat_url param for chat
    const chatUrl = document.getElementById("ChatUrl")?.value;
    if (chatUrl) params.set("chat_url", encodeURIComponent(chatUrl));

    if (
        window.overlay && window.overlay.points &&
        window.overlay.points.length === 4
    ) {
        params.set(
            "grid",
            window.overlay.points.map((pt) =>
                pt.map(Number).map((n) => Math.round(n)).join(",")
            ).join(";"),
        );
    }

    // Add vdo param last
    const vdoLink = document.getElementById("VideoURL")?.value;
    if (vdoLink) {
        params.set("vdo", encodeURIComponent(encodeURIComponent(vdoLink)));
    }
    // Add obs param last
    const obsLink = document.getElementById("ObsVdoUrl")?.value;
    if (obsLink) {
        params.set("obs", encodeURIComponent(encodeURIComponent(obsLink)));
    }

    // Add network room param
    const networkRoom = document.getElementById("NetworkRoom")?.value;
    if (networkRoom) {
        params.set("room", encodeURIComponent(networkRoom));
    }

    // Add coordinate color param
    const coordColor = document.getElementById("coordinateColor")?.value;
    if (coordColor) {
        params.set("coord_color", coordColor);
    }

    // Add label param
    if (window.cursorLabel) {
        params.set("label", encodeURIComponent(window.cursorLabel));
    }

    // Add role if viewer mode
    if (window.isViewerMode) {
        params.set("role", "VW");
    } else {
        params.set("role", "CO");
    }

    // Note: OBS control is now handled through VDO Ninja iframe postMessage system
    let url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", url);

    // Regenerate viewer URL when input fields change
    if (!window.isViewerMode) {
        window.currentViewerUrl = generateViewerUrl();
    }

    // Clear the flag after a short delay to allow normal URL loading
    setTimeout(() => {
        window._updatingUrl = false;
    }, 100);
}

function loadConfigFromUrl() {
    // Skip loading if we're currently updating the URL
    if (window._updatingUrl) {
        debug.log("Skipping loadConfigFromUrl - URL is being updated");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    debug.log("loadConfigFromUrl called with params:", params);

    // Check for viewer mode
    const viewerMode = params.get("viewer");
    const role = params.get("role");

    if (viewerMode || role === "VW") {
        debug.log("🎥 Viewer mode enabled");
        window.isViewerMode = true;
        if (viewerMode) window.viewerSessionId = viewerMode;
        setupViewerMode();
        // Continue with config loading to get VDO link and grid setup
    }

    // VDO Ninja link (double decode)
    const vdoLink = params.get("vdo");
    if (vdoLink) {
        let decodedVdoLink = decodeURIComponent(vdoLink);
        if (decodedVdoLink.includes("%")) {
            decodedVdoLink = decodeURIComponent(decodedVdoLink);
        }
        const videoUrlInput = document.getElementById("VideoURL");
        const feedElement = document.getElementById("feed");
        if (videoUrlInput) videoUrlInput.value = decodedVdoLink;
        if (feedElement) {
            // Use iframe manager to ensure proper audio settings
            if (
                window.iframeManager &&
                window.iframeManager.ensureFeedAudioSettings
            ) {
                const processedUrl = window.iframeManager
                    .ensureFeedAudioSettings(decodedVdoLink);
                feedElement.src = processedUrl;
            } else {
                feedElement.src = decodedVdoLink;
            }
        }
    }

    // OBS VDO Ninja link (double decode)
    const obsLink = params.get("obs");
    if (obsLink) {
        let decodedObsLink = decodeURIComponent(obsLink);
        if (decodedObsLink.includes("%")) {
            decodedObsLink = decodeURIComponent(decodedObsLink);
        }

        // Don't modify the host OBS URL - leave it as is

        const obsVdoUrlInput = document.getElementById("ObsVdoUrl");
        const obsElement = document.getElementById("obs");
        if (obsVdoUrlInput) obsVdoUrlInput.value = decodedObsLink;
        if (obsElement) obsElement.src = decodedObsLink;
    }

    // Network Room
    const roomName = params.get("room");
    if (roomName) {
        const decodedRoom = decodeURIComponent(roomName);
        const networkRoomInput = document.getElementById("NetworkRoom");
        if (networkRoomInput) networkRoomInput.value = decodedRoom;
    }

    // Chat URL
    const chatUrl = params.get("chat_url");
    if (chatUrl) {
        const decodedChatUrl = decodeURIComponent(chatUrl);
        const chatUrlInput = document.getElementById("ChatUrl");
        const chatElement = document.getElementById("chat");
        if (chatUrlInput) chatUrlInput.value = decodedChatUrl;
        if (chatElement) chatElement.src = decodedChatUrl;
    }

    // Stone size
    const stoneSize = params.get("stone");
    if (stoneSize) {
        const stoneSizeInput = document.getElementById("StoneSize");
        if (stoneSizeInput) stoneSizeInput.value = stoneSize;
    }

    // Coordinate color
    const coordColor = params.get("coord_color");
    if (coordColor) {
        const coordColorInput = document.getElementById("coordinateColor");
        if (coordColorInput) coordColorInput.value = coordColor;
    }

    // Grid corners
    const grid = params.get("grid");
    if (grid && window.overlay) {
        window.overlay.points = grid.split(";").map((pt) =>
            pt.split(",").map(Number)
        );
        if (window.overlay.points.length === 4) {
            window.overlay.grid = window.overlay.generateGrid(
                window.overlay.points,
            );
            window.overlay.isGridSet = true;
        }
    }

    // Set grid to show for 3 seconds, then hide
    if (window.overlay) {
        window.overlay.show = true;
        window.overlay.updateGridButtonState();
        setTimeout(() => {
            window.overlay.show = false;
            window.overlay.updateGridButtonState();
        }, 3000);
    } else {
        // If overlay isn't ready yet, set a flag to do this after overlay is created
        window._pendingGridAutoHide = true;
    }

    // Note: OBS WebSocket URL parameters are no longer used since we switched to iframe communication
}

function handleUserLabel() {
    // Check URL params first (highest priority)
    const params = new URLSearchParams(window.location.search);
    let label = params.get("label");

    // If no URL label and NOT viewer mode, prompt user
    if (!label && !window.isViewerMode) {
        // Get saved label for default value
        const savedLabel = localStorage.getItem("userLabel") || "";

        label = prompt(
            "Please enter your name for the cursor label:",
            savedLabel,
        );

        if (label) {
            localStorage.setItem("userLabel", label);
        }
    }

    window.cursorLabel = label;
    debug.log("👤 User label set to:", label);

    // Update OBS URL with the label
    updateObsUrlWithLabel(label);

    // Always update shareable URL to persist label
    updateShareableUrl();
}

function updateObsUrlWithLabel(label) {
    const obsVdoUrlInput = document.getElementById("ObsVdoUrl");
    const obsElement = document.getElementById("obs");

    if (!obsVdoUrlInput || !obsVdoUrlInput.value) return;

    let currentUrl = obsVdoUrlInput.value;
    let newUrl = currentUrl;

    // Check if label parameter already exists
    if (currentUrl.includes("label=")) {
        newUrl = currentUrl.replace(
            /label=[^&]*/,
            `label=${encodeURIComponent(label)}`,
        );
    } else if (currentUrl.includes("labelsuggestion=")) {
        // Replace labelsuggestion with label
        newUrl = currentUrl.replace(
            /labelsuggestion=[^&]*/,
            `label=${encodeURIComponent(label)}`,
        );
    } else {
        // Append label
        const separator = currentUrl.includes("?") ? "&" : "?";
        newUrl = `${currentUrl}${separator}label=${encodeURIComponent(label)}`;
    }

    if (newUrl !== currentUrl) {
        debug.log("🔄 Updating OBS URL with label:", newUrl);
        obsVdoUrlInput.value = newUrl;
        if (obsElement) {
            obsElement.src = newUrl;
        }
        // Also update the main URL param if it exists
        updateShareableUrl();
    }
}

function updateSidePanelVisibility() {
    // Don't show side panel in viewer mode
    if (window.isViewerMode) {
        const sidePanel = document.querySelector(".SidePanel");
        if (sidePanel) sidePanel.style.display = "none";
        return;
    }

    const obsIframe = document.getElementById("obs");
    const chatIframe = document.getElementById("chat");
    const obsControls = document.querySelector(".OBS_Controls");
    const chatDiv = document.querySelector(".Chat");
    const sidePanel = document.querySelector(".SidePanel");
    let obsVisible = !!(obsIframe && obsIframe.src && obsIframe.src.trim());
    let chatVisible = !!(chatIframe && chatIframe.src && chatIframe.src.trim());
    if (obsControls) obsControls.style.display = obsVisible ? "" : "none";
    if (chatDiv) chatDiv.style.display = chatVisible ? "" : "none";
    if (sidePanel) {
        sidePanel.style.display = (obsVisible || chatVisible) ? "" : "none";
    }
}

function setupViewerMode() {
    debug.log("🎥 Setting up viewer mode");

    // Add viewer-mode class to body for CSS styling
    document.body.classList.add("viewer-mode");

    // Set everything transparent for OBS
    document.body.style.backgroundColor = "transparent";
    document.body.style.background = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
    document.documentElement.style.background = "transparent";

    // Make sure all major containers are transparent
    const containers = [
        ".page-container",
        ".content-area",
        ".main-feed",
    ];

    containers.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
            element.style.backgroundColor = "transparent";
            element.style.background = "transparent";
        }
    });

    // Hide all UI elements except the main feed
    const elementsToHide = [
        ".top-bar",
        ".SidePanel",
        ".config-panel",
        ".OBS_Controls",
        ".Chat",
        ".footer",
    ];

    elementsToHide.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
            element.style.display = "none";
        }
    });

    // Keep main feed the same size as host's feed iframe for coordinate alignment
    const mainFeed = document.querySelector(".main-feed");
    if (mainFeed) {
        // Don't change size - keep it exactly as it would be on host
        mainFeed.style.backgroundColor = "transparent";
        mainFeed.style.background = "transparent";
    }

    // Hide the video feed iframe but keep it for dimensions
    const feedIframe = document.getElementById("feed");
    if (feedIframe) {
        feedIframe.style.opacity = "0";
        feedIframe.style.pointerEvents = "none";
    }

    // Add CSS override for complete transparency
    const style = document.createElement("style");
    style.textContent = `
        * {
            background: transparent !important;
            background-color: transparent !important;
        }
        html, body, .page-container, .content-area, .main-feed {
            background: transparent !important;
            background-color: transparent !important;
        }
    `;
    document.head.appendChild(style);

    debug.log("🎥 Viewer mode UI setup complete");
}

function generateViewerUrl() {
    const baseUrl = window.location.origin + window.location.pathname;

    // Create viewer URL with viewer=yes parameter
    const viewerUrl = new URL(baseUrl);
    viewerUrl.searchParams.set("viewer", "yes");

    // Add network room
    const networkRoom = document.getElementById("NetworkRoom")?.value;
    if (networkRoom) {
        viewerUrl.searchParams.set("room", encodeURIComponent(networkRoom));
    }

    // Add coordinate color to viewer URL
    const coordColorInput = document.getElementById("coordinateColor");
    if (coordColorInput && coordColorInput.value) {
        viewerUrl.searchParams.set("coord_color", coordColorInput.value);
    }

    // Add role=VW
    viewerUrl.searchParams.set("role", "VW");

    debug.log("Generated viewer URL:", viewerUrl.toString());
    return viewerUrl.toString();
}

function main() {
    // Make functions globally accessible
    window.updateShareableUrl = updateShareableUrl;
    window.loadConfigFromUrl = loadConfigFromUrl;
    window.updateSidePanelVisibility = updateSidePanelVisibility;
    window.generateViewerUrl = generateViewerUrl;

    // Make currentTool globally accessible for drawing layer
    window.currentTool = currentTool;
    window.setCurrentTool = setCurrentTool;

    window.onload = () => {
        // 1. Create overlay and drawingLayer first!
        if (!isEventSet) {
            overlay = new Canvas("overlay");
            drawingLayer = new DrawingLayer("drawingLayer");

            // Make them globally accessible
            window.overlay = overlay;
            window.drawingLayer = drawingLayer;

            // Initialize global currentTool
            window.currentTool = currentTool;

            isEventSet = true;
        }

        // 2. Initialize Managers
        const iframeManager = new IframeManager();
        const uiManager = new UIManager(iframeManager);
        const obsController = new OBSController();
        const networkManager = new NetworkManager();

        // Make managers globally accessible
        window.iframeManager = iframeManager;
        window.obsController = obsController;
        window.networkManager = networkManager;

        // 3. Now load config from URL (overlay is defined)
        loadConfigFromUrl();

        // 3.1 Handle user label
        handleUserLabel();

        // 3.5. Update canvas dimensions after viewer mode is determined
        if (overlay && overlay.updateCanvasDimensions) {
            overlay.updateCanvasDimensions();
        }
        if (drawingLayer && drawingLayer.updateCanvasDimensions) {
            drawingLayer.updateCanvasDimensions();
        }

        // 4. If grid auto-hide was pending, do it now
        if (window._pendingGridAutoHide && !window.isViewerMode) {
            overlay.show = true;
            overlay.updateGridButtonState();
            setTimeout(() => {
                overlay.show = false;
                overlay.updateGridButtonState();
            }, 3000);
            window._pendingGridAutoHide = false;
        }

        // 5. Set up Network based on mode
        const params = new URLSearchParams(window.location.search);
        let roomName = params.get("room");
        if (roomName) {
            roomName = decodeURIComponent(roomName);

            if (window.isViewerMode) {
                // Enable debugging in viewer mode
                if (window.debugger) {
                    window.debugger.enabled = true;
                }
                debug.log("🎥 Initializing NetworkManager in Viewer Mode");
                networkManager.initialize("VW", roomName);
            } else {
                debug.log("📡 Initializing NetworkManager in Commentator Mode");
                networkManager.initialize("CO", roomName);
            }
        } else {
            if (window.isViewerMode) {
                debug.error("❌ No Network Room provided for Viewer Mode");
            } else {
                debug.log(
                    "ℹ️ No Network Room provided - NetworkManager waiting for input",
                );
            }
        }

        // 6. Additional Host-only setup
        if (!window.isViewerMode) {
            // Generate initial viewer URL
            window.currentViewerUrl = generateViewerUrl();

            // Set up copy viewer URL button (View)
            const copyViewerUrlBtn = document.getElementById("copyViewerUrl");
            if (copyViewerUrlBtn) {
                copyViewerUrlBtn.addEventListener("click", () => {
                    if (window.currentViewerUrl) {
                        navigator.clipboard.writeText(window.currentViewerUrl)
                            .then(() => {
                                const originalText =
                                    copyViewerUrlBtn.textContent;
                                copyViewerUrlBtn.textContent = "Copied!";
                                setTimeout(() => {
                                    copyViewerUrlBtn.textContent = originalText;
                                }, 2000);
                            }).catch((err) => {
                                alert("Viewer URL: " + window.currentViewerUrl);
                            });
                    } else {
                        alert("No viewer URL generated yet");
                    }
                });
            }

            // Set up copy share URL button (Comm)
            const copyShareUrlBtn = document.getElementById("copyShareUrl");
            if (copyShareUrlBtn) {
                copyShareUrlBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(window.location.href).then(
                        () => {
                            const originalText = copyShareUrlBtn.textContent;
                            copyShareUrlBtn.textContent = "Copied!";
                            setTimeout(() => {
                                copyShareUrlBtn.textContent = originalText;
                            }, 2000);
                        },
                    );
                });
            }

            // Request initial status after a short delay
            setTimeout(() => {
                if (
                    window.obsController && window.obsController.requestStatus
                ) {
                    window.obsController.requestStatus();
                }
            }, 2000);
        }

        // 7. Set up keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            // Don't trigger shortcuts if user is typing in any input field
            const activeElement = document.activeElement;

            // Check if we're in any kind of input field
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

            // Check if we're focused on the canvas/overlay or main feed area
            const mainFeedGroup = document.querySelector(".main-feed");
            const overlayCanvas = document.getElementById("overlay");
            const drawingLayerCanvas = document.getElementById("drawingLayer");

            const isCanvasFocused = activeElement === overlayCanvas ||
                activeElement === drawingLayerCanvas ||
                (mainFeedGroup && mainFeedGroup.contains(activeElement)) ||
                activeElement === document.body ||
                !activeElement; // Allow when no specific element is focused

            if (!isCanvasFocused) {
                return; // Don't trigger shortcuts when not focused on canvas/overlay
            }

            // Handle specific shortcuts
            if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                if (window.overlay) {
                    window.overlay.show = !window.overlay.show;
                    window.overlay.updateGridButtonState();
                }
            } else if (e.key === "r" || e.key === "R") {
                e.preventDefault();
                if (window.overlay) {
                    window.overlay.resetGrid();
                }
            } else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                // Clear only the drawing layer
                if (window.drawingLayer) {
                    window.drawingLayer.clearCanvas(true);
                }
            } else if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                if (window.overlay) {
                    window.overlay.clearStones();
                }
                // Also clear the drawing layer
                if (window.drawingLayer) {
                    window.drawingLayer.clearCanvas(false);
                }

                // Send clear all command to viewer
                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "clear-all",
                    });
                }
            }
        });

        // 8. Start animation loop
        let overlayLoop = () => {
            requestAnimationFrame(overlayLoop);
            overlay.tick();
        };
        overlayLoop();
        updateSidePanelVisibility();
    };
}

// Initialize the application
main();
