/*******************************************************************************
 * uBlock Origin - Setup Page Script
 * Checks for required permissions and guides user to enable them
 ******************************************************************************/

async function isUserScriptsEnabled() {
    try {
        await chrome.userScripts.getScripts();
        return true;
    } catch (e) {
        return false;
    }
}

async function isIncognitoAllowed() {
    return chrome.extension.isAllowedIncognitoAccess();
}

async function isIncognitoSkipped() {
    const result = await chrome.storage.local.get('skipIncognitoCheck');
    return result.skipIncognitoCheck === true;
}

async function updateStatusDisplay(userScriptsOk, incognitoOk) {
    const userScriptsStatus = document.getElementById('userscripts-status');
    const incognitoStatus = document.getElementById('incognito-status');
    const skipOption = document.querySelector('.skip-option');

    const usIcon = userScriptsStatus.querySelector('.status-icon');

    usIcon.classList.remove('ok', 'error', 'checking');

    if (userScriptsOk === 'checking') {
        usIcon.textContent = '⟳';
        usIcon.classList.add('checking');
    } else if (userScriptsOk) {
        usIcon.textContent = '✓';
        usIcon.classList.add('ok');
    } else {
        usIcon.textContent = '✗';
        usIcon.classList.add('error');
    }

    const incIcon = incognitoStatus.querySelector('.status-icon');

    incIcon.classList.remove('ok', 'error', 'checking');

    if (incognitoOk === 'checking') {
        incIcon.textContent = '⟳';
        incIcon.classList.add('checking');
        skipOption.classList.add('hidden');
    } else if (incognitoOk) {
        incIcon.textContent = '✓';
        incIcon.classList.add('ok');
        // Hide skip option if incognito is already enabled
        skipOption.classList.add('hidden');
    } else {
        incIcon.textContent = '✗';
        incIcon.classList.add('error');
        skipOption.classList.remove('hidden');
    }
}

async function checkStatus() {
    await updateStatusDisplay('checking', 'checking');

    const incognitoSkipped = await isIncognitoSkipped();
    const skipCheckbox = document.getElementById('skip-incognito');
    if (skipCheckbox) {
        skipCheckbox.checked = incognitoSkipped;
    }

    const incognitoOk = await isIncognitoAllowed();
    const userScriptsOk = await isUserScriptsEnabled();

    await updateStatusDisplay(userScriptsOk, incognitoOk);

    const successBanner = document.getElementById('success-banner');
    if (userScriptsOk && (incognitoOk || incognitoSkipped)) {
        successBanner.classList.remove('hidden');
        await chrome.storage.local.set({ setupInProgress: false });
    } else {
        await chrome.storage.local.set({ setupInProgress: true });
        successBanner.classList.add('hidden');
    }
}

function openExtensionSettings() {
    // Send message to background to open settings
    // (can't open chrome:// URLs directly from content)
    chrome.runtime.sendMessage({ action: 'openExtensionSettings' });
}

async function handleSkipChange(e) {
    await chrome.storage.local.set({ skipIncognitoCheck: e.target.checked });
    checkStatus();
}

document.addEventListener('DOMContentLoaded', () => {
    checkStatus();

    document.getElementById('open-settings').addEventListener('click', openExtensionSettings);

    document.getElementById('skip-incognito').addEventListener('change', handleSkipChange);

    // Re-check when page becomes visible (user likely just changed settings in another tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkStatus();
        }
    });
});
