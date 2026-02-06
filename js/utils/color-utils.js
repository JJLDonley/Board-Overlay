export const HOST_COLORS = [
    "#e53935",
    "#1e88e5",
    "#43a047",
    "#8e24aa",
    "#fb8c00",
    "#00897b",
    "#f4511e",
    "#3949ab",
    "#c0ca33",
    "#6d4c41",
    "#00acc1",
    "#d81b60",
    "#7cb342",
    "#5e35b1",
    "#039be5",
    "#ef6c00",
    "#7e57c2",
    "#26a69a",
    "#c2185b",
    "#9e9d24"
];

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function hslToRgb(h, s, l) {
    const sat = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h >= 0 && h < 60) {
        r = c;
        g = x;
    } else if (h >= 60 && h < 120) {
        r = x;
        g = c;
    } else if (h >= 120 && h < 180) {
        g = c;
        b = x;
    } else if (h >= 180 && h < 240) {
        g = x;
        b = c;
    } else if (h >= 240 && h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (value) => value.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

function getHostIndex(label) {
    if (!label) return null;
    const match = label.match(/host\s*(\d{1,2})/i);
    if (!match) return null;
    const index = parseInt(match[1], 10);
    if (Number.isNaN(index) || index < 1 || index > 99) return null;
    return index;
}

export function getHostColor(label) {
    const hostIndex = getHostIndex(label);
    if (hostIndex) {
        if (hostIndex <= HOST_COLORS.length) {
            return HOST_COLORS[hostIndex - 1];
        }
        const hue = (hostIndex * 137.508) % 360;
        return rgbToHex(hslToRgb(hue, 70, 50));
    }

    const fallbackSource = label || "unknown";
    const hue = hashString(fallbackSource) % 360;
    return rgbToHex(hslToRgb(hue, 65, 50));
}
