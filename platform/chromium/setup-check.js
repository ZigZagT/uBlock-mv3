/*******************************************************************************
 * uBlock Origin MV3 - Setup Check
 * Prompts user to enable required permissions (userScripts, incognito)
 ******************************************************************************/

async function isUserScriptsEnabled() {
	try {
		await chrome.userScripts.getScripts();
		return true;
	} catch (e) {
		return false;
	}
}

async function checkSetupRequired() {
	const userScriptsOk = await isUserScriptsEnabled();
	const incognitoOk = await chrome.extension.isAllowedIncognitoAccess();

	const {skipIncognitoCheck, setupInProgress} = await chrome.storage.local.get(['skipIncognitoCheck', 'setupInProgress']);

	const setupComplete = userScriptsOk && (incognitoOk || skipIncognitoCheck);

	if (!setupComplete || setupInProgress) {
		const setupUrl = chrome.runtime.getURL('setup.html');
		const tabs = await chrome.tabs.query({ url: setupUrl });
		if (tabs.length === 0) {
			chrome.tabs.create({ url: setupUrl });
		}
	}
}

// Check on service worker startup (covers install, update, and reload after settings change)
checkSetupRequired();

// Check periodically (every hour)
chrome.alarms.create('ubo-setup-check', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === 'ubo-setup-check') {
		checkSetupRequired();
	}
});

// Handle messages from setup page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'openExtensionSettings') {
		chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
	}
});
