// shared/browser.js — single import point for all extension modules
// webextension-polyfill normalises chrome.* and browser.* APIs across all browsers
import browser from 'webextension-polyfill';
export default browser;
