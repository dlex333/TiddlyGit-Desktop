// @flow
const { ipcRenderer, remote, webFrame } = require('electron');

const { enable: enableDarkMode, disable: disableDarkMode } = require('darkreader');

const ContextMenuBuilder = require('../libs/context-menu-builder');
const i18next = require('../libs/i18n');

const { MenuItem, shell } = remote;

require('../libs/wiki/wiki-operation');

window.global = {};

let handled = false;
const handleLoaded = event => {
  if (handled) return;
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);

  const loadDarkReader = () => {
    const shouldUseDarkColor = ipcRenderer.sendSync('get-should-use-dark-colors');
    const darkReader = ipcRenderer.sendSync('get-preference', 'darkReader');
    if (shouldUseDarkColor && darkReader) {
      const { darkReaderBrightness, darkReaderContrast, darkReaderGrayscale, darkReaderSepia } = ipcRenderer.sendSync(
        'get-preferences',
      );
      enableDarkMode({
        brightness: darkReaderBrightness,
        contrast: darkReaderContrast,
        grayscale: darkReaderGrayscale,
        sepia: darkReaderSepia,
      });
    } else {
      disableDarkMode();
    }
  };

  loadDarkReader();
  ipcRenderer.on('reload-dark-reader', () => {
    loadDarkReader();
  });

  const jsCodeInjection = ipcRenderer.sendSync('get-preference', 'jsCodeInjection');
  const allowNodeInJsCodeInjection = ipcRenderer.sendSync('get-preference', 'allowNodeInJsCodeInjection');
  const cssCodeInjection = ipcRenderer.sendSync('get-preference', 'cssCodeInjection');

  if (jsCodeInjection && jsCodeInjection.trim().length > 0) {
    if (allowNodeInJsCodeInjection) {
      try {
        // eslint-disable-next-line no-new-func
        Function('require', `"use strict";${jsCodeInjection}`)(require);
      } catch (err) {
        /* eslint-disable no-console */
        console.log(err);
        /* eslint-enable no-console */
      }
    } else {
      try {
        const node = document.createElement('script');
        node.innerHTML = jsCodeInjection;
        document.body.appendChild(node);
      } catch (err) {
        /* eslint-disable no-console */
        console.log(err);
        /* eslint-enable no-console */
      }
    }
  }

  if (cssCodeInjection && cssCodeInjection.trim().length > 0) {
    try {
      const node = document.createElement('style');
      node.innerHTML = cssCodeInjection;
      document.body.appendChild(node);
    } catch (err) {
      console.log(err); // eslint-disable-line no-console
    }
  }

  window.contextMenuBuilder = new ContextMenuBuilder();

  remote.getCurrentWebContents().on('context-menu', (e, info) => {
    // eslint-disable-next-line promise/catch-or-return
    window.contextMenuBuilder.buildMenuForElement(info).then(menu => {
      // eslint-disable-next-line promise/always-return
      if (info.linkURL && info.linkURL.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));

        menu.append(
          new MenuItem({
            label: i18next.t('ContextMenu.OpenLinkInNewWindow'),
            click: () => {
              ipcRenderer.send('request-set-global-force-new-window', true);
              window.open(info.linkURL);
            },
          }),
        );

        menu.append(new MenuItem({ type: 'separator' }));
      }

      const contents = remote.getCurrentWebContents();
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Back'),
          enabled: contents.canGoBack(),
          click: () => {
            contents.goBack();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Forward'),
          enabled: contents.canGoForward(),
          click: () => {
            contents.goForward();
          },
        }),
      );
      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.Reload'),
          click: () => {
            contents.reload();
          },
        }),
      );

      menu.append(new MenuItem({ type: 'separator' }));

      menu.append(
        new MenuItem({
          label: i18next.t('ContextMenu.More'),
          submenu: [
            {
              label: i18next.t('ContextMenu.About'),
              click: () => ipcRenderer.send('request-show-about-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.CheckForUpdates'),
              click: () => ipcRenderer.send('request-check-for-updates'),
            },
            {
              label: i18next.t('ContextMenu.Preferences'),
              click: () => ipcRenderer.send('request-show-preferences-window'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.TiddlyGitSupport'),
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop/issues/new/choose'),
            },
            {
              label: i18next.t('ContextMenu.TiddlyGitWebsite'),
              click: () => shell.openExternal('https://github.com/tiddly-gittly/TiddlyGit-Desktop'),
            },
            { type: 'separator' },
            {
              label: i18next.t('ContextMenu.Quit'),
              click: () => ipcRenderer.send('request-quit'),
            },
          ],
        }),
      );

      menu.popup(remote.getCurrentWindow());
    });
  });

  // Link preview
  const linkPreview = document.createElement('div');
  linkPreview.style.cssText =
    'max-width: 80vw;height: 22px;position: fixed;bottom: -1px;right: -1px;z-index: 1000000;background-color: rgb(245, 245, 245);border-radius: 2px;border: #9E9E9E  1px solid;font-size: 12.5px;color: rgb(0, 0, 0);padding: 0px 8px;line-height: 22px;font-family: -apple-system, system-ui, BlinkMacSystemFont, sans-serif;white-space: nowrap;text-overflow: ellipsis;overflow: hidden; pointer-events:none;';
  ipcRenderer.on('update-target-url', (e, url) => {
    if (url && document.body) {
      linkPreview.innerText = url;
      document.body.appendChild(linkPreview);
    } else if (document.body && document.body.contains(linkPreview)) {
      document.body.removeChild(linkPreview);
    }
  });

  // eslint-disable-next-line no-console
  console.log('Preload script is loaded...');

  handled = true;
};

// try to load as soon as dom is loaded
document.addEventListener('DOMContentLoaded', () => handleLoaded('document.on("DOMContentLoaded")'));
// if user navigates between the same website
// DOMContentLoaded might not be triggered so double check with 'onload'
// https://github.com/atomery/webcatalog/issues/797
window.addEventListener('load', () => handleLoaded('window.on("onload")'));

// Communicate with the frame
// Have to use this weird trick because contextIsolation: true
ipcRenderer.on('should-pause-notifications-changed', (e, val) => {
  window.postMessage({ type: 'should-pause-notifications-changed', val });
});

ipcRenderer.on('display-media-id-received', (e, val) => {
  window.postMessage({ type: 'return-display-media-id', val });
});

window.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'get-display-media-id') {
    ipcRenderer.send('request-show-display-media-window');
  }

  // set workspace to active when its notification is clicked
  if (e.data.type === 'focus-workspace') {
    ipcRenderer.send('request-set-active-workspace', e.data.workspaceId);
  }
});

// Fix Can't show file list of Google Drive
// https://github.com/electron/electron/issues/16587

// Fix chrome.runtime.sendMessage is undefined for FastMail
// https://github.com/atomery/singlebox/issues/21
const initialShouldPauseNotifications = ipcRenderer.sendSync('get-pause-notifications-info') != null;

const { workspaceId } = remote.getCurrentWebContents();
webFrame.executeJavaScript(`
(function() {
  window.chrome = {
    runtime: {
      sendMessage: () => {},
      connect: () => {
        return {
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
          },
          postMessage: () => {},
          disconnect: () => {},
        }
      }
    }
  }

  window.electronSafeIpc = {
    send: () => null,
    on: () => null,
  };
  window.desktop = undefined;

  // Customize Notification behavior
  // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
  const oldNotification = window.Notification;

  let shouldPauseNotifications = ${initialShouldPauseNotifications};

  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'should-pause-notifications-changed') return;
    shouldPauseNotifications = e.data.val;
  });

  window.Notification = function() {
    if (!shouldPauseNotifications) {
      const notif = new oldNotification(...arguments);
      notif.addEventListener('click', () => {
        window.postMessage({ type: 'focus-workspace', workspaceId: "${workspaceId}" });
      });
      return notif;
    }
    return null;
  }
  window.Notification.requestPermission = oldNotification.requestPermission;
  Object.defineProperty(Notification, 'permission', {
    get() {
      return oldNotification.permission;
    }
  });

  if (window.navigator.mediaDevices) {
    window.navigator.mediaDevices.getDisplayMedia = () => {
      return new Promise((resolve, reject) => {
        const listener = (e) => {
          if (!e.data || e.data.type !== 'return-display-media-id') return;
          if (e.data.val) { resolve(e.data.val); }
          else { reject(new Error('Rejected')); }
          window.removeEventListener('message', listener);
        };

        window.postMessage({ type: 'get-display-media-id' });

        window.addEventListener('message', listener);
      })
        .then((id) => {
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: id,
              }
            }
          });
        });
    };
  }
})();
`);
