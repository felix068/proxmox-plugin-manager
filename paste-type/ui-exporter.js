// Export UI to window when it loads
(async function() {
    'use strict';
    console.log('[UI-Exporter] Waiting for UI module...');
    let attempts = 0;
    const maxAttempts = 100;
    const checkInterval = setInterval(async () => {
        attempts++;
        try {
            // Try to import the UI module
            if (!window.UI) {
                const mod = await import('/novnc/app.js');
                if (mod && mod.default) {
                    window.UI = mod.default;
                    console.log('[UI-Exporter] UI exported to window.UI');
                    clearInterval(checkInterval);
                }
            } else {
                clearInterval(checkInterval);
                console.log('[UI-Exporter] UI already available');
            }
        } catch (e) {
            // Module not ready yet, continue waiting
        }
        if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('[UI-Exporter] Timeout waiting for UI module');
        }
    }, 50);
})();
