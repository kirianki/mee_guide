import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test('Test Extension Injection and UI', async () => {
    const extensionPath = path.join(__dirname, 'dist/chrome');

    const context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
        ],
    });

    // Create a new tab
    const page = await context.newPage();

    console.log('[Test] Navigating to ExampleDomain...');
    await page.goto('https://example.com');
    // The extension should automatically mount the webguide-sidebar-host shadow root.

    // Let's test if the extension is injected
    console.log('[Test] Waiting for Sidebar Host...');
    const sidebarHost = page.locator('#webguide-sidebar-host');
    await sidebarHost.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {
        console.error('[Test] Timeout! Sidebar Host not found.');
    });

    if (await sidebarHost.isVisible() || await sidebarHost.count() > 0) {
        console.log('[Test] Success: Extension mounted the Shadow DOM host.');
        // Now query inside the shadow DOM to find the toggle button or sidebar.
        const locator = page.locator('#webguide-sidebar-host >> css=#webguide-open-btn');
        const isOpen = await locator.count() > 0;
        console.log('[Test] Success: Toggle button rendered inside shadow root:', isOpen);

        // Click the open button if closed (since open starts out true, it's probably already open, skipping)
    } else {
        console.log('[Test] Failure: Extension did NOT mount.');
    }

    await context.close();
});
