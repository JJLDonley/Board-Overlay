import { debug } from "./utils/debugger.js";
import { CONST, STONES } from "./constants.js";
import { DrawingLayer } from "./canvas/drawing-layer.js";
import { Canvas, currentTool, setCurrentTool } from "./canvas/canvas.js";
import { IframeManager } from "./managers/iframe-manager.js";
import { UIManager } from "./managers/ui-manager.js";
import { OBSController } from "./obs/obs-controller.js";
import { NetworkManager } from "./managers/network-manager.js";
import { getHostColor } from "./utils/color-utils.js";

// Global variables
let isEventSet = false;
let overlay = null;
let drawingLayer = null;

function getAppModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");

    if (role === "VW") {
        return "viewer";
    }

    if (role === "CO") {
        return "commentator";
    }

    const hasConfig = params.has("Network") || params.has("OTB") ||
        params.has("obs") || params.has("Chat");
    if (hasConfig) {
        return "commentator";
    }

    return "landing";
}

function applyAppMode(mode) {
    window.appMode = mode;
    window.isViewerMode = mode === "viewer";

    const landing = document.getElementById("landing");
    const app = document.getElementById("app");

    if (landing) {
        landing.style.display = mode === "landing" ? "flex" : "none";
    }
    if (app) {
        app.style.display = mode === "landing" ? "none" : "flex";
    }

    if (mode === "viewer") {
        setupViewerMode();
    }
}

function buildBaseParams() {
    const params = new URLSearchParams();

    const chatUrl = document.getElementById("ChatUrl")?.value;
    if (chatUrl) params.set("Chat", encodeURIComponent(chatUrl));

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

    const vdoLink = document.getElementById("VideoURL")?.value;
    if (vdoLink) {
        params.set("OTB", encodeURIComponent(encodeURIComponent(vdoLink)));
    }

    const obsLink = document.getElementById("ObsVdoUrl")?.value;
    if (obsLink) {
        params.set("obs", encodeURIComponent(encodeURIComponent(obsLink)));
    }

    const networkRoom = document.getElementById("NetworkRoom")?.value;
    if (networkRoom) {
        params.set("Network", encodeURIComponent(networkRoom));
    }

    const coordColor = document.getElementById("coordinateColor")?.value;
    if (coordColor) {
        params.set("CC", coordColor);
    }

    return params;
}

const MAX_HOST_SLOTS = 2;

function generateHostUrl(hostIndex) {
    const baseUrl = new URL(window.location.origin + window.location.pathname);
    const params = buildBaseParams();

    params.set("role", "CO");
    params.set("host", hostIndex.toString());
    params.set("name_hint", "EnterNameNoSpaces");
    params.set("name_required", "1");

    baseUrl.search = params.toString();
    return baseUrl.toString();
}

function updateLandingLinks() {
    const viewerUrlOutput = document.getElementById("viewerUrlOutput");
    if (viewerUrlOutput) {
        viewerUrlOutput.value = generateViewerUrl();
    }

    const hostList = document.getElementById("hostSlotList");
    if (!hostList) return;

    hostList.querySelectorAll("[data-host-index]").forEach((row) => {
        const hostIndex = row.dataset.hostIndex;
        const linkBtn = row.querySelector(".host-link");
        if (!hostIndex || !linkBtn) return;
        const url = generateHostUrl(hostIndex);
        linkBtn.dataset.url = url;
        linkBtn.title = `Copy Host ${hostIndex} link`;
    });
}

function getStoredHostSlots() {
    try {
        const stored = localStorage.getItem("hostSlots");
        if (!stored) return [1, 2];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [1, 2];
        return parsed.filter((entry) => entry === 1 || entry === 2);
    } catch (error) {
        return [1, 2];
    }
}

function saveStoredHostSlots(slots) {
    localStorage.setItem("hostSlots", JSON.stringify(slots));
}

function renderHostSlots() {
    const listEl = document.getElementById("hostSlotList");
    if (!listEl) return;

    listEl.innerHTML = "";

    const slots = window.hostSlots || [];
    if (slots.length === 0) {
        const empty = document.createElement("div");
        empty.className = "host-empty";
        empty.textContent = "No host slots created yet.";
        listEl.appendChild(empty);
        return;
    }

    slots.sort((a, b) => a - b).forEach((hostIndex) => {
        const row = document.createElement("div");
        row.className = "host-row";
        row.dataset.hostIndex = hostIndex;

        const hostLabel = document.createElement("span");
        hostLabel.className = "host-tag";
        hostLabel.textContent = `Host ${hostIndex}`;

        const linkBtn = document.createElement("button");
        linkBtn.className = "host-link";
        linkBtn.type = "button";
        linkBtn.textContent = "Host Link";
        linkBtn.addEventListener("click", () => {
            const url = generateHostUrl(hostIndex);
            copyToClipboard(url, linkBtn);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "host-delete";
        deleteBtn.type = "button";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
            window.hostSlots = window.hostSlots.filter(
                (entry) => entry !== hostIndex,
            );
            saveStoredHostSlots(window.hostSlots);
            renderHostSlots();
            updateLandingLinks();
            updateHostButtonState();
        });

        row.append(hostLabel, linkBtn, deleteBtn);
        listEl.appendChild(row);
    });

    updateLandingLinks();
    updateHostButtonState();
}

function updateHostButtonState() {
    const addBtn = document.getElementById("addHostSlot");
    if (!addBtn) return;
    addBtn.disabled = (window.hostSlots || []).length >= MAX_HOST_SLOTS;
}

function setupHostSlots() {
    const addBtn = document.getElementById("addHostSlot");
    if (!addBtn) return;

    window.hostSlots = getStoredHostSlots();
    renderHostSlots();
    updateHostButtonState();

    addBtn.addEventListener("click", () => {
        const slots = window.hostSlots || [];
        if (slots.length >= MAX_HOST_SLOTS) return;
        const available = [1, 2].filter((entry) => !slots.includes(entry));
        if (available.length === 0) return;
        slots.push(available[0]);
        window.hostSlots = slots;
        saveStoredHostSlots(slots);
        renderHostSlots();
        updateHostButtonState();
    });
}

function copyToClipboard(text, button) {
    if (!text) return;

    const handleCopiedState = () => {
        if (!button) return;
        const originalText = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
    };

    navigator.clipboard.writeText(text).then(() => {
        handleCopiedState();
    }).catch(() => {
        window.prompt("Copy this link:", text);
    });
}

// URL management functions (simplified for now)
function updateShareableUrl() {
    if (window.appMode === "landing") {
        updateLandingLinks();
        return;
    }

    // Set a flag to prevent loadConfigFromUrl from being called during URL updates
    window._updatingUrl = true;

    const params = buildBaseParams();

    if (window.cursorLabel) {
        params.set("label", encodeURIComponent(window.cursorLabel));
    }

    params.set("role", window.isViewerMode ? "VW" : "CO");
    if (window.hostIndex) {
        params.set("host", window.hostIndex.toString());
    }

    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", url);

    if (!window.isViewerMode) {
        window.currentViewerUrl = generateViewerUrl();
    }

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

    // VDO Ninja link (double decode)
    const vdoLink = params.get("OTB");
    if (vdoLink) {
        let decodedVdoLink = decodeURIComponent(vdoLink);
        if (decodedVdoLink.includes("%")) {
            decodedVdoLink = decodeURIComponent(decodedVdoLink);
        }
        const videoUrlInput = document.getElementById("VideoURL");
        const feedElement = document.getElementById("feed");
        if (videoUrlInput) videoUrlInput.value = decodedVdoLink;
        if (feedElement) {
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

    // OBS VDO Ninja link (double decode) - commentator only
    const obsLink = params.get("obs");
    if (obsLink && !window.isViewerMode) {
        let decodedObsLink = decodeURIComponent(obsLink);
        if (decodedObsLink.includes("%")) {
            decodedObsLink = decodeURIComponent(decodedObsLink);
        }

        const obsVdoUrlInput = document.getElementById("ObsVdoUrl");
        const obsElement = document.getElementById("obs");
        if (obsVdoUrlInput) obsVdoUrlInput.value = decodedObsLink;
        if (obsElement) obsElement.src = decodedObsLink;
    }

    // Network Room
    const roomName = params.get("Network");
    if (roomName) {
        const decodedRoom = decodeURIComponent(roomName);
        const networkRoomInput = document.getElementById("NetworkRoom");
        if (networkRoomInput) networkRoomInput.value = decodedRoom;
    }

    // Chat URL - commentator only
    const chatUrl = params.get("Chat");
    if (chatUrl && !window.isViewerMode) {
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
    const coordColor = params.get("CC");
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
        window._pendingGridAutoHide = true;
    }
}

function getHostTagFromParams(params) {
    const hostValue = params.get("host");
    if (!hostValue) return null;
    const hostIndex = parseInt(hostValue, 10);
    if (!Number.isFinite(hostIndex) || hostIndex < 1) return null;
    return `Host ${hostIndex}`;
}

function sanitizeName(value) {
    return value.replace(/\s+/g, "");
}

function isValidName(value) {
    return Boolean(value) && !/\s/.test(value);
}

function requestUserName(options = {}) {
    const modal = document.getElementById("nameModal");
    const input = document.getElementById("nameInput");
    const errorEl = document.getElementById("nameError");
    const confirmBtn = document.getElementById("nameConfirm");
    if (!modal || !input || !errorEl || !confirmBtn) {
        return Promise.resolve(null);
    }

    const hint = options.hint || "EnterNameNoSpaces";
    const saved = options.saved || "";
    input.placeholder = hint;
    input.value = sanitizeName(saved);
    errorEl.textContent = "";

    const validate = () => {
        const value = input.value.trim();
        if (!value) {
            errorEl.textContent = "Name is required.";
            confirmBtn.disabled = true;
            return;
        }
        if (!isValidName(value)) {
            errorEl.textContent = "No spaces allowed.";
            confirmBtn.disabled = true;
            return;
        }
        errorEl.textContent = "";
        confirmBtn.disabled = false;
    };

    const handleInput = () => {
        const cleaned = sanitizeName(input.value);
        if (cleaned !== input.value) {
            input.value = cleaned;
            errorEl.textContent = "Spaces removed.";
        }
        validate();
    };

    modal.classList.remove("hidden");
    confirmBtn.disabled = true;
    validate();
    input.focus();

    return new Promise((resolve) => {
        const handleConfirm = () => {
            const value = input.value.trim();
            if (!isValidName(value)) {
                validate();
                return;
            }
            modal.classList.add("hidden");
            input.removeEventListener("input", handleInput);
            input.removeEventListener("keydown", handleKeydown);
            confirmBtn.removeEventListener("click", handleConfirm);
            resolve(value);
        };

        const handleKeydown = (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleConfirm();
            }
        };

        input.addEventListener("input", handleInput);
        input.addEventListener("keydown", handleKeydown);
        confirmBtn.addEventListener("click", handleConfirm);
    });
}

function applyUserColor(label) {
    const colorSource = window.hostTag || label;
    if (!colorSource) return;
    const color = getHostColor(colorSource);
    window.currentUserColor = color;

    const colorInput = document.getElementById("markupColor");
    if (colorInput) {
        colorInput.value = color;
        colorInput.dispatchEvent(new Event("input"));
    }
}

async function handleUserLabel() {
    if (window.appMode !== "commentator") {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const hostTag = getHostTagFromParams(params);
    if (hostTag) {
        window.hostTag = hostTag;
        window.hostIndex = parseInt(params.get("host"), 10);
    }

    let label = params.get("label");
    if (label && label.includes("%")) {
        try {
            label = decodeURIComponent(label);
        } catch (error) {
            debug.warn("Failed to decode label:", label);
        }
    }
    if (label) {
        label = label.trim();
    }

    if (!isValidName(label || "")) {
        const savedLabel = localStorage.getItem("userLabel") || "";
        const hint = params.get("name_hint") || "EnterNameNoSpaces";
        label = await requestUserName({
            hint: hint,
            saved: savedLabel,
        });
    }

    if (!label) {
        return;
    }

    localStorage.setItem("userLabel", label);
    window.cursorLabel = label;
    debug.log("User label set to:", label);

    applyUserColor(label);
    updateObsUrlWithLabel(label);
    updateShareableUrl();
}

function updateObsUrlWithLabel(label) {
    const obsVdoUrlInput = document.getElementById("ObsVdoUrl");
    const obsElement = document.getElementById("obs");

    if (!obsVdoUrlInput || !obsVdoUrlInput.value) return;

    let currentUrl = obsVdoUrlInput.value;

    let newUrl = currentUrl.replace(
        /([&?])labelsuggestion(?:=[^&]*)?(?:&|$)/g,
        "$1",
    );

    if (newUrl.endsWith("&") || newUrl.endsWith("?")) {
        newUrl = newUrl.slice(0, -1);
    }

    if (newUrl.includes("label=")) {
        newUrl = newUrl.replace(
            /label=[^&]*/,
            `label=${encodeURIComponent(label)}`,
        );
    } else {
        const separator = newUrl.includes("?") ? "&" : "?";
        newUrl = `${newUrl}${separator}label=${encodeURIComponent(label)}`;
    }

    if (newUrl !== currentUrl) {
        debug.log("Updating OBS URL with label:", newUrl);
        obsVdoUrlInput.value = newUrl;
        if (obsElement) {
            obsElement.src = newUrl;
        }
        updateShareableUrl();
    }
}

function updateSidePanelVisibility() {
    if (window.appMode === "landing") {
        return;
    }

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
    debug.log("Setting up viewer mode");

    document.body.classList.add("viewer-mode");

    document.body.style.backgroundColor = "transparent";
    document.body.style.background = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
    document.documentElement.style.background = "transparent";

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

    const elementsToHide = [
        ".top-bar",
        ".SidePanel",
        ".config-panel",
        ".OBS_Controls",
        ".Chat",
        ".footer",
        ".floating-toolbar",
        ".help-modal",
        ".name-modal",
        "#landing",
    ];

    elementsToHide.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
            element.style.display = "none";
        }
    });

    const mainFeed = document.querySelector(".main-feed");
    if (mainFeed) {
        mainFeed.style.backgroundColor = "transparent";
        mainFeed.style.background = "transparent";
    }

    const feedIframe = document.getElementById("feed");
    if (feedIframe) {
        feedIframe.style.opacity = "0";
        feedIframe.style.pointerEvents = "none";
    }

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

    debug.log("Viewer mode UI setup complete");
}

function generateViewerUrl() {
    const baseUrl = new URL(window.location.origin + window.location.pathname);
    const params = buildBaseParams();

    params.delete("obs");
    params.delete("Chat");
    params.set("role", "VW");

    baseUrl.search = params.toString();

    debug.log("Generated viewer URL:", baseUrl.toString());
    return baseUrl.toString();
}

function main() {
    window.updateShareableUrl = updateShareableUrl;
    window.loadConfigFromUrl = loadConfigFromUrl;
    window.updateSidePanelVisibility = updateSidePanelVisibility;
    window.generateViewerUrl = generateViewerUrl;

    const initialMode = getAppModeFromUrl();
    window.appMode = initialMode;
    window.isViewerMode = initialMode === "viewer";

    window.currentTool = currentTool;
    window.setCurrentTool = setCurrentTool;

    window.onload = async () => {
        if (!isEventSet) {
            overlay = new Canvas("overlay");
            drawingLayer = new DrawingLayer("drawingLayer");

            window.overlay = overlay;
            window.drawingLayer = drawingLayer;

            window.currentTool = currentTool;

            isEventSet = true;
        }

        applyAppMode(window.appMode);

        const iframeManager = new IframeManager();
        const uiManager = new UIManager(iframeManager);
        const obsController = new OBSController();
        const networkManager = new NetworkManager();

        window.iframeManager = iframeManager;
        window.obsController = obsController;
        window.networkManager = networkManager;

        loadConfigFromUrl();

        setupHostSlots();
        updateLandingLinks();

        await handleUserLabel();

        if (overlay && overlay.updateCanvasDimensions) {
            overlay.updateCanvasDimensions();
        }
        if (drawingLayer && drawingLayer.updateCanvasDimensions) {
            drawingLayer.updateCanvasDimensions();
        }

        if (window._pendingGridAutoHide && !window.isViewerMode) {
            overlay.show = true;
            overlay.updateGridButtonState();
            setTimeout(() => {
                overlay.show = false;
                overlay.updateGridButtonState();
            }, 3000);
            window._pendingGridAutoHide = false;
        }

        const params = new URLSearchParams(window.location.search);
        const otbParam = params.get("OTB");
        if (window.isViewerMode && !otbParam) {
            debug.error("No OTB provided for Viewer Mode");
        }
        let roomName = params.get("Network");
        if (window.appMode !== "landing") {
            if (roomName) {
                roomName = decodeURIComponent(roomName);

                if (window.isViewerMode) {
                    if (window.debugger) {
                        window.debugger.enabled = true;
                    }
                    debug.log("NetworkManager initialized in Viewer Mode");
                    networkManager.initialize("VW", roomName);
                } else {
                    debug.log("NetworkManager initialized in Commentator Mode");
                    networkManager.initialize("CO", roomName);
                }
            } else if (window.isViewerMode) {
                debug.error("No Network Room provided for Viewer Mode");
            } else {
                debug.log(
                    "No Network Room provided - NetworkManager waiting for input",
                );
            }
        }

        if (window.appMode === "commentator" && window.networkManager) {
            if (window.networkManager.getOwnerId) {
                window.localOwnerId = window.networkManager.getOwnerId();
            }
            if (window.cursorLabel && window.networkManager.setLabel) {
                window.networkManager.setLabel(
                    window.cursorLabel,
                    window.hostTag,
                );
            }
        }

        if (window.appMode === "commentator") {
            window.currentViewerUrl = generateViewerUrl();

            setTimeout(() => {
                if (
                    window.obsController && window.obsController.requestStatus
                ) {
                    window.obsController.requestStatus();
                }
            }, 2000);
        }

        document.addEventListener("keydown", (e) => {
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
                return;
            }

            const mainFeedGroup = document.querySelector(".main-feed");
            const overlayCanvas = document.getElementById("overlay");
            const drawingLayerCanvas = document.getElementById("drawingLayer");

            const isCanvasFocused = activeElement === overlayCanvas ||
                activeElement === drawingLayerCanvas ||
                (mainFeedGroup && mainFeedGroup.contains(activeElement)) ||
                activeElement === document.body ||
                !activeElement;

            if (!isCanvasFocused) {
                return;
            }

            if (window.isViewerMode) {
                return;
            }

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
                if (window.isViewerMode) {
                    return;
                }
                if (window.overlay) {
                    window.overlay.clearStones();
                }
                if (window.drawingLayer) {
                    window.drawingLayer.clearCanvas(false);
                }

                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "clear-all",
                    });
                }
            } else if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                if (window.isViewerMode) {
                    return;
                }
                const ownerId = window.localOwnerId || window.cursorLabel ||
                    "local";
                if (window.overlay && window.overlay.clearOwnerData) {
                    window.overlay.clearOwnerData(ownerId);
                }
                if (window.drawingLayer && window.drawingLayer.clearOwner) {
                    window.drawingLayer.clearOwner(ownerId);
                }

                if (window.networkManager && !window.isViewerMode) {
                    window.networkManager.send({
                        action: "clear-owner",
                    });
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (window.overlay && window.overlay.undoLastStone) {
                    window.overlay.undoLastStone();
                }
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                if (window.overlay && window.overlay.redoStone) {
                    window.overlay.redoStone();
                }
            }
        });

        document.addEventListener(
            "wheel",
            (event) => {
                if (window.isViewerMode) {
                    return;
                }
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
                    return;
                }

                const mainFeedGroup = document.querySelector(".main-feed");
                const overlayCanvas = document.getElementById("overlay");
                const drawingLayerCanvas = document.getElementById("drawingLayer");
                const isCanvasFocused = activeElement === overlayCanvas ||
                    activeElement === drawingLayerCanvas ||
                    (mainFeedGroup && mainFeedGroup.contains(activeElement)) ||
                    activeElement === document.body ||
                    !activeElement;

                if (!isCanvasFocused) {
                    return;
                }

                if (event.deltaY < 0) {
                    event.preventDefault();
                    if (window.overlay && window.overlay.undoLastStone) {
                        window.overlay.undoLastStone();
                    }
                } else if (event.deltaY > 0) {
                    event.preventDefault();
                    if (window.overlay && window.overlay.redoStone) {
                        window.overlay.redoStone();
                    }
                }
            },
            { passive: false },
        );

        let overlayLoop = () => {
            requestAnimationFrame(overlayLoop);
            overlay.tick();
        };
        overlayLoop();
        updateSidePanelVisibility();
    };
}

// Initialize the application
main()
