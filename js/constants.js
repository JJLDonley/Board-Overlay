// Constants for the Board Overlay application
export const GRIDSIZE = 2;

export const CONST = {
    ABSOLUTE: "absolute",
    ALLOW:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; camera; microphone; display-capture",
    CANVAS: {
        HEIGHT: 1080,
        WIDTH: 1920,
    },
    ID: "id",
    NONE: "none",
    REVIEW: "Review",
    SOLID: "solid",
    TAG: "tag",
    TRUE: true,
    ZERO: "0",
};

// Stone images - initialized as Image objects
export const STONES = {
    BLACK: new Image(),
    WHITE: new Image(),
    BOARD: new Image(),
    MARKER: new Image(),
};

// Load stone images
STONES.BLACK.src = "./img/black.png";
STONES.WHITE.src = "./img/white.png";
STONES.MARKER.src = "./img/marker.png";
STONES.BOARD.src = "./img/board.png"; 