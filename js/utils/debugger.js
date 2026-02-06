// Simple debugger class
class Debugger {
    constructor() {
        this.enabled = true; // Enable debug logging
    }
    
    log(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    }
    
    error(...args) {
        if (this.enabled) {
            console.error(...args);
        }
    }
    
    warn(...args) {
        if (this.enabled) {
            console.warn(...args);
        }
    }
}

// Global debugger instance
export const debug = new Debugger();
export { Debugger }; 