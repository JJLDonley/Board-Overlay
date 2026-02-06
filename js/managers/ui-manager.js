import { debug } from "../utils/debugger.js";

export class UIManager {
    constructor(iframeManager) {
        this.iframeManager = iframeManager;
        this.toggleHelp = document.getElementById("toggleHelp");
        this.helpModal = document.getElementById("helpModal");
        this.helpClose = document.getElementById("helpClose");
        this.toolbar = document.querySelector(".floating-toolbar");
        this.toolbarHandle = document.querySelector(".toolbar-handle");

        this.bindEventListeners();
    }

    bindEventListeners() {
        if (this.toggleHelp) {
            this.toggleHelp.addEventListener("click", () => {
                this.openHelp();
            });
        }

        if (this.helpClose) {
            this.helpClose.addEventListener("click", () => {
                this.closeHelp();
            });
        }

        if (this.helpModal) {
            this.helpModal.addEventListener("click", (event) => {
                if (event.target === this.helpModal) {
                    this.closeHelp();
                }
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.closeHelp();
            }
        });

        this.setupToolbarDrag();

        const stoneSizeInput = document.getElementById("StoneSize");
        if (stoneSizeInput) {
            stoneSizeInput.addEventListener("change", (event) => {
                if (window.overlay) {
                    window.overlay.stones_radius = event.target.value;
                }
            });
        }

        [
            "VideoURL",
            "StoneSize",
            "ObsVdoUrl",
            "ChatUrl",
            "coordinateColor",
            "NetworkRoom",
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener("input", () => {
                if (window.updateShareableUrl) {
                    window.updateShareableUrl();
                }

                if (id === "VideoURL") {
                    const vdoLink = el.value.trim();
                    if (vdoLink) {
                        if (
                            this.iframeManager &&
                            this.iframeManager.ensureFeedAudioSettings
                        ) {
                            const processedUrl = this.iframeManager
                                .ensureFeedAudioSettings(vdoLink);
                            document.getElementById("feed").src = processedUrl;
                        } else {
                            document.getElementById("feed").src = vdoLink;
                        }
                    }
                } else if (id === "ObsVdoUrl") {
                    const obsLink = el.value.trim();
                    if (obsLink) {
                        document.getElementById("obs").src = obsLink;
                        if (window.updateSidePanelVisibility) {
                            window.updateSidePanelVisibility();
                        }
                    }
                } else if (id === "ChatUrl") {
                    const chatUrl = el.value.trim();
                    if (chatUrl) {
                        document.getElementById("chat").src = chatUrl;
                        if (window.updateSidePanelVisibility) {
                            window.updateSidePanelVisibility();
                        }
                    }
                } else if (id === "NetworkRoom") {
                    const roomName = el.value.trim();
                    if (roomName && window.networkManager) {
                        window.networkManager.updateConnection(roomName);
                    }
                } else if (id === "coordinateColor") {
                    if (window.networkManager && !window.isViewerMode) {
                        window.networkManager.send({
                            action: "coordinate-color",
                            color: el.value,
                            timestamp: Date.now(),
                        });
                        debug.log(
                            "dYZ\" Sent coordinate color to viewer:",
                            el.value,
                        );
                    }
                }
            });
        });

        const copyViewerUrlBtn = document.getElementById("copyViewerUrl");
        if (copyViewerUrlBtn) {
            copyViewerUrlBtn.addEventListener("click", () => {
                const viewerUrlOutput = document.getElementById(
                    "viewerUrlOutput",
                );
                const url = viewerUrlOutput?.value ||
                    (window.generateViewerUrl
                        ? window.generateViewerUrl()
                        : "");
                if (!url) return;

                navigator.clipboard.writeText(url).then(() => {
                    const originalText = copyViewerUrlBtn.textContent;
                    copyViewerUrlBtn.textContent = "Copied!";
                    setTimeout(() => {
                        copyViewerUrlBtn.textContent = originalText;
                    }, 2000);
                }).catch(() => {
                    window.prompt("Viewer URL:", url);
                });
            });
        }
    }

    openHelp() {
        if (!this.helpModal) return;
        this.helpModal.classList.remove("hidden");
        if (this.toggleHelp) {
            this.toggleHelp.classList.add("active");
        }
    }

    closeHelp() {
        if (!this.helpModal) return;
        this.helpModal.classList.add("hidden");
        if (this.toggleHelp) {
            this.toggleHelp.classList.remove("active");
        }
    }

    setupToolbarDrag() {
        if (!this.toolbar || !this.toolbarHandle) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onPointerMove = (event) => {
            if (!dragging) return;
            const targetLeft = event.clientX - offsetX;
            const targetTop = event.clientY - offsetY;
            const { left, top } = this.clampToolbarPosition(
                targetLeft,
                targetTop,
            );
            this.applyToolbarPosition(left, top);
        };

        const onPointerUp = (event) => {
            dragging = false;
            this.toolbar.classList.remove("dragging");
            if (this.toolbarHandle.releasePointerCapture) {
                this.toolbarHandle.releasePointerCapture(event.pointerId);
            }
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        };

        this.toolbarHandle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 && event.pointerType !== "touch") {
                return;
            }
            event.preventDefault();
            const rect = this.toolbar.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            dragging = true;
            this.toolbar.classList.add("dragging");
            if (this.toolbarHandle.setPointerCapture) {
                this.toolbarHandle.setPointerCapture(event.pointerId);
            }
            document.addEventListener("pointermove", onPointerMove);
            document.addEventListener("pointerup", onPointerUp);
        });

        window.addEventListener("resize", () => {
            this.ensureToolbarInBounds();
        });

        this.ensureToolbarInBounds();
    }

    ensureToolbarInBounds() {
        if (!this.toolbar) return;
        const rect = this.toolbar.getBoundingClientRect();
        const { left, top } = this.clampToolbarPosition(rect.left, rect.top);
        this.applyToolbarPosition(left, top);
    }

    clampToolbarPosition(left, top) {
        if (!this.toolbar) return { left, top };
        const padding = 8;
        const topBar = document.querySelector(".top-bar");
        const topBarHeight = topBar ? topBar.getBoundingClientRect().height : 0;
        const minTop = topBarHeight + padding;
        const rect = this.toolbar.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width - padding;
        const maxTop = window.innerHeight - rect.height - padding;
        const clampedLeft = Math.min(
            Math.max(left, padding),
            Math.max(padding, maxLeft),
        );
        const clampedTop = Math.min(
            Math.max(top, minTop),
            Math.max(minTop, maxTop),
        );
        return { left: clampedLeft, top: clampedTop };
    }

    applyToolbarPosition(left, top) {
        if (!this.toolbar) return;
        this.toolbar.style.left = `${Math.round(left)}px`;
        this.toolbar.style.top = `${Math.round(top)}px`;
        this.toolbar.style.right = "auto";
        this.toolbar.style.bottom = "auto";
    }
}
