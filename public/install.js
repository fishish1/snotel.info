/*
 * @license
 * Your First PWA Codelab (https://g.co/codelabs/pwa)
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */
'use strict';

const isInStandaloneMode = () =>
  (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone);

let deferredInstallPrompt = null;
let installButton = null;
const installButtonContainer = document.getElementById('install_button');

// Wait for the DOM to be fully loaded before trying to find the button
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
  // If the app is in standalone mode or already installed, don't do anything.
  if (isInStandaloneMode() || localStorage.getItem('isInstalled') === 'true') {
    console.log('App is in standalone mode or already installed, no install button shown.');
    return;
  }
  installButton = document.getElementById('butInstall');
  console.log('Install button:', installButton);
  // If the install prompt was fired before the DOM was ready, show the button now.
  if (deferredInstallPrompt) {
    console.log('Install prompt was fired before DOM ready, showing button now.');
    showInstallButton();
  } else if (iOS() && !isInStandaloneMode()) {
    // On iOS, we can't prompt, but we can show the button
    // which will trigger an overlay with instructions.
    console.log('iOS device detected, showing install button for iOS.');
    showInstallButtonForIOS();
  }
});

/**
 * Event handler for beforeinstallprompt event.
 * Saves the event and shows the install button if the DOM is ready.
 * @param {Event} evt
 */
function saveBeforeInstallPromptEvent(evt) {
  console.log('beforeinstallprompt event fired.');
  // Do not show the install prompt on iOS, but offer instructions.
  if (iOS()) {
    console.log('iOS device, not saving beforeinstallprompt event.');
    return;
  }
  // Prevent the mini-infobar from appearing on mobile
  evt.preventDefault();

  deferredInstallPrompt = evt;
  console.log('Saved beforeinstallprompt event.', deferredInstallPrompt);
  // If the button is already available, show it. Otherwise, the DOMContentLoaded listener will.
  if (installButton) {
    console.log('Install button exists, showing it.');
    showInstallButton();
  } else {
    console.log('Install button not ready yet.');
  }
}

// This event is only fired on browsers that support PWA installation.
window.addEventListener('beforeinstallprompt', saveBeforeInstallPromptEvent);

/**
 * Shows the install button and attaches the install PWA handler.
 */
function showInstallButton() {
  console.log('showInstallButton called.');
  // Don't show the button if the app is in standalone mode.
  if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone)) {
    console.log('App is in standalone mode, hiding install button.');
    return;
  }
  // Don't show the button if it's already visible.
  if (installButtonContainer.style.display === 'block') {
    console.log('Install button already visible.');
    return;
  }
  console.log('Showing install button.');
  installButtonContainer.style.display = 'block';
  installButton.addEventListener('click', installPWA);
}

/**
 * Shows the install button for iOS and attaches the instruction overlay handler.
 */
function showInstallButtonForIOS() {
  console.log('showInstallButtonForIOS called.');
  if (installButtonContainer.style.display === 'block') {
    console.log('iOS install button already visible.');
    return;
  }
  console.log('Showing iOS install button.');
  installButtonContainer.style.display = 'block';
  installButton.addEventListener('click', () => {
    // On iOS, this function shows an overlay with instructions.
    console.log('iOS install button clicked, showing instructions.');
    overlay_3_toggle();
  });
}

/**
 * Event handler for butInstall - Does the PWA installation.
 * @param {Event} evt
 */
function installPWA(evt) {
  console.log('installPWA called.');
  if (!deferredInstallPrompt) {
    console.log('deferredInstallPrompt is null, cannot install.');
    return;
  }
  // Show the install prompt.
  console.log('Showing install prompt.');
  deferredInstallPrompt.prompt();
  // Hide the install button, it can't be called twice.
  installButtonContainer.style.display = 'none';
  console.log('Install button hidden.');

  deferredInstallPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
      console.log('User accepted the A2HS prompt', choice);
      localStorage.setItem('isInstalled', 'true');
    } else {
      console.log('User dismissed the A2HS prompt', choice);
    }
    deferredInstallPrompt = null;
  });
}

// Log app installation to analytics
window.addEventListener('appinstalled', logAppInstalled);

/**
 * Event handler for appinstalled event.
 * Log the installation to analytics or save the event somehow.
 * @param {Event} evt
 */
function logAppInstalled(evt) {
  console.log('Snotel App was installed.', evt);
  localStorage.setItem('isInstalled', 'true');
}

/**
 * Utility function to check if the device is iOS.
 * @returns {boolean}
 */
function iOS() {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
    // For iOS 13+
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}
