// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "AppConstants",
                                  "resource://gre/modules/AppConstants.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils",
                                  "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "FormHistory",
                                  "resource://gre/modules/FormHistory.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Downloads",
                                  "resource://gre/modules/Downloads.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Promise",
                                  "resource://gre/modules/Promise.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Task",
                                  "resource://gre/modules/Task.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "DownloadsCommon",
                                  "resource:///modules/DownloadsCommon.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryStopwatch",
                                  "resource://gre/modules/TelemetryStopwatch.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Preferences",
                                  "resource://gre/modules/Preferences.jsm");


/**
 * A number of iterations after which to yield time back
 * to the system.
 */
const YIELD_PERIOD = 10;




var bprivacySanitizer = {

overrideSanitizer: function() {

Sanitizer.prototype = undefined;



Sanitizer.prototype ={
  // warning to the caller: this one may raise an exception (e.g. bug #265028)
  clearItem: function (aItemName)
  {
    this.items[aItemName].clear();
  },

  prefDomain: "",

  getNameFromPreference: function (aPreferenceName)
  {
    return aPreferenceName.substr(this.prefDomain.length);
  },

  /**
   * Deletes privacy sensitive data in a batch, according to user preferences.
   * Returns a promise which is resolved if no errors occurred.  If an error
   * occurs, a message is reported to the console and all other items are still
   * cleared before the promise is finally rejected.
   *
   * @param [optional] itemsToClear
   *        Array of items to be cleared. if specified only those
   *        items get cleared, irrespectively of the preference settings.
   * @param [optional] options
   *        Object whose properties are options for this sanitization.
   *        TODO (bug 1167238) document options here.
   */
  sanitize: Task.async(function*(itemsToClear = null, options = {}) {
    let progress = options.progress || {};
    let promise = this._sanitize(itemsToClear, progress);

    // Depending on preferences, the sanitizer may perform asynchronous
    // work before it starts cleaning up the Places database (e.g. closing
    // windows). We need to make sure that the connection to that database
    // hasn't been closed by the time we use it.
    // Though, if this is a sanitize on shutdown, we already have a blocker.
    if (!progress.isShutdown) {
      let shutdownClient = Cc["@mozilla.org/browser/nav-history-service;1"]
                             .getService(Ci.nsPIPlacesDatabase)
                             .shutdownClient
                             .jsclient;
      shutdownClient.addBlocker("sanitize.js: Sanitize",
        promise,
        {
          fetchState: () => ({ progress })
        }
      );
    }

    try {
      yield promise;
    } finally {
      Services.obs.notifyObservers(null, "sanitizer-sanitization-complete", "");
    }
  }),

  _sanitize: Task.async(function*(aItemsToClear, progress = {}) {
    let seenError = false;
    let itemsToClear;
    if (Array.isArray(aItemsToClear)) {
      // Shallow copy the array, as we are going to modify
      // it in place later.
      itemsToClear = [...aItemsToClear];
    } else {
      let branch = Services.prefs.getBranch(this.prefDomain);
      itemsToClear = Object.keys(this.items).filter(itemName => {
        try {
          return branch.getBoolPref(itemName);
        } catch (ex) {
          return false;
        }
      });
    }

    // Store the list of items to clear, in case we are killed before we
    // get a chance to complete.
    Preferences.set(Sanitizer.PREF_SANITIZE_IN_PROGRESS,
                    JSON.stringify(itemsToClear));

    // Store the list of items to clear, for debugging/forensics purposes
    for (let k of itemsToClear) {
      progress[k] = "ready";
    }

    // Ensure open windows get cleared first, if they're in our list, so that they don't stick
    // around in the recently closed windows list, and so we can cancel the whole thing
    // if the user selects to keep a window open from a beforeunload prompt.
    let openWindowsIndex = itemsToClear.indexOf("openWindows");
    if (openWindowsIndex != -1) {
      itemsToClear.splice(openWindowsIndex, 1);
      yield this.items.openWindows.clear();
      progress.openWindows = "cleared";
    }

    // Cache the range of times to clear
    let range = null;
    // If we ignore timespan, clear everything,
    // otherwise, pick a range.
    if (!this.ignoreTimespan) {
      range = this.range || Sanitizer.getClearRange();
    }

    // For performance reasons we start all the clear tasks at once, then wait
    // for their promises later.
    // Some of the clear() calls may raise exceptions (for example bug 265028),
    // we catch and store them, but continue to sanitize as much as possible.
    // Callers should check returned errors and give user feedback
    // about items that could not be sanitized
    let refObj = {};
    TelemetryStopwatch.start("FX_SANITIZE_TOTAL", refObj);

    let annotateError = (name, ex) => {
      progress[name] = "failed";
      seenError = true;
    };

    // Array of objects in form { name, promise }.
    // `name` is the item's name and `promise` may be a promise, if the
    // sanitization is asynchronous, or the function return value, otherwise.
    let handles = [];
    for (let itemName of itemsToClear) {
      // Workaround for bug 449811.
      let name = itemName;
      let item = this.items[name];
      try {
        // Catch errors here, so later we can just loop through these.
        handles.push({ name,
                       promise: item.clear(range)
                                    .then(() => progress[name] = "cleared",
                                          ex => annotateError(name, ex))
                     });
      } catch (ex) {
        annotateError(name, ex);
      }
    }
    for (let handle of handles) {
      progress[handle.name] = "blocking";
      yield handle.promise;
    }

    // Sanitization is complete.
    TelemetryStopwatch.finish("FX_SANITIZE_TOTAL", refObj);
    // Reset the inProgress preference since we were not killed during
    // sanitization.
    Preferences.reset(Sanitizer.PREF_SANITIZE_IN_PROGRESS);
    progress = {};
    if (seenError) {
      throw new Error("Error sanitizing");
    }
  }),

  // Time span only makes sense in certain cases.  Consumers who want
  // to only clear some private data can opt in by setting this to false,
  // and can optionally specify a specific range.  If timespan is not ignored,
  // and range is not set, sanitize() will use the value of the timespan
  // pref to determine a range
  ignoreTimespan : true,
  range : null,

  items: {
    cache: {
      clear: Task.async(function* (range) {
        let seenException;
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_CACHE", refObj);

        try {
          // Cache doesn't consult timespan, nor does it have the
          // facility for timespan-based eviction.  Wipe it.
          let cache = Cc["@mozilla.org/netwerk/cache-storage-service;1"]
                        .getService(Ci.nsICacheStorageService);
          cache.clear();
        } catch (ex) {
          seenException = ex;
        }

        try {
          let imageCache = Cc["@mozilla.org/image/tools;1"]
                             .getService(Ci.imgITools)
                             .getImgCacheForDocument(null);
          imageCache.clearCache(false); // true=chrome, false=content
        } catch (ex) {
          seenException = ex;
        }

        TelemetryStopwatch.finish("FX_SANITIZE_CACHE", refObj);
        if (seenException) {
          throw seenException;
        }
      })
    },

    cookies: {
      clear: Task.async(function* (range) {
        let seenException;
        let yieldCounter = 0;
        let refObj = {};

        // Clear cookies.
        TelemetryStopwatch.start("FX_SANITIZE_COOKIES_2", refObj);
        try {
          let cookieMgr = Components.classes["@mozilla.org/cookiemanager;1"]
                                    .getService(Ci.nsICookieManager);
          if (range) {
            // Iterate through the cookies and delete any created after our cutoff.
            let cookiesEnum = cookieMgr.enumerator;
            while (cookiesEnum.hasMoreElements()) {
              let cookie = cookiesEnum.getNext().QueryInterface(Ci.nsICookie2);

              if (cookie.creationTime > range[0]) {
                // This cookie was created after our cutoff, clear it
                cookieMgr.remove(cookie.host, cookie.name, cookie.path,
                                 false, cookie.originAttributes);

                if (++yieldCounter % YIELD_PERIOD == 0) {
                  yield new Promise(resolve => setTimeout(resolve, 0)); // Don't block the main thread too long
                }
              }
            }
          }
          else {
            // Remove everything
            cookieMgr.removeAll();
            yield new Promise(resolve => setTimeout(resolve, 0)); // Don't block the main thread too long
          }
        } catch (ex) {
          seenException = ex;
        } finally {
          TelemetryStopwatch.finish("FX_SANITIZE_COOKIES_2", refObj);
        }

        // Clear deviceIds. Done asynchronously (returns before complete).
        try {
          let mediaMgr = Components.classes["@mozilla.org/mediaManagerService;1"]
                                   .getService(Ci.nsIMediaManagerService);
          mediaMgr.sanitizeDeviceIds(range && range[0]);
        } catch (ex) {
          seenException = ex;
        }

        // Clear plugin data.
        // As evidenced in bug 1253204, clearing plugin data can sometimes be
        // very, very long, for mysterious reasons. Unfortunately, this is not
        // something actionable by Mozilla, so crashing here serves no purpose.
        //
        // For this reason, instead of waiting for sanitization to always
        // complete, we introduce a soft timeout. Once this timeout has
        // elapsed, we proceed with the shutdown of Firefox.
        let promiseClearPluginCookies;
        try {
          // We don't want to wait for this operation to complete...
          promiseClearPluginCookies = this.promiseClearPluginCookies(range);

          //... at least, not for more than 10 seconds.
          yield Promise.race([
            promiseClearPluginCookies,
            new Promise(resolve => setTimeout(resolve, 10000 /* 10 seconds */))
          ]);
        } catch (ex) {
          seenException = ex;
        }

        // Detach waiting for plugin cookies to be cleared.
        promiseClearPluginCookies.catch(() => {
          // If this exception is raised before the soft timeout, it
          // will appear in `seenException`. Otherwise, it's too late
          // to do anything about it.
        });

        if (seenException) {
          throw seenException;
        }
      }),

      promiseClearPluginCookies: Task.async(function* (range) {
        const FLAG_CLEAR_ALL = Ci.nsIPluginHost.FLAG_CLEAR_ALL;
        let ph = Cc["@mozilla.org/plugin/host;1"].getService(Ci.nsIPluginHost);

        // Determine age range in seconds. (-1 means clear all.) We don't know
        // that range[1] is actually now, so we compute age range based
        // on the lower bound. If range results in a negative age, do nothing.
        let age = range ? (Date.now() / 1000 - range[0] / 1000000) : -1;
        if (!range || age >= 0) {
          let tags = ph.getPluginTags();
          for (let tag of tags) {
            let refObj = {};
            let probe = "";
            if (/\bFlash\b/.test(tag.name)) {
              probe = tag.loaded ? "FX_SANITIZE_LOADED_FLASH"
                                 : "FX_SANITIZE_UNLOADED_FLASH";
              TelemetryStopwatch.start(probe, refObj);
            }

            var mimeTypes =  tag.getMimeTypes();            //added by BetterPrivacy to allow mange LSOs by the add-on
            for (let j = 0; j < mimeTypes.length; ++j) {
              let type = mimeTypes[j];
              if (type.indexOf('flash')!=-1) tag = null;    //added by BetterPrivacy to allow mange LSOs by the add-on
            }


            try {
              let rv = yield new Promise(resolve =>
                ph.clearSiteData(tag, null, FLAG_CLEAR_ALL, age, resolve)
              );
              // If the plugin doesn't support clearing by age, clear everything.
              if (rv == Components.results.NS_ERROR_PLUGIN_TIME_RANGE_NOT_SUPPORTED) {
                yield new Promise(resolve =>
                  ph.clearSiteData(tag, null, FLAG_CLEAR_ALL, -1, resolve)
                );
              }
              if (probe) {
                TelemetryStopwatch.finish(probe, refObj);
              }
            } catch (ex) {
              // Ignore errors from plug-ins
              if (probe) {
                TelemetryStopwatch.cancel(probe, refObj);
              }
            }
          }
        }
      })
    },

    offlineApps: {
      clear: Task.async(function* (range) {
        Components.utils.import("resource:///modules/offlineAppCache.jsm");
        // This doesn't wait for the cleanup to be complete.
        OfflineAppCacheHelper.clear();
      })
    },

    history: {
      clear: Task.async(function* (range) {
        let seenException;
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_HISTORY", refObj);
        try {
          if (range) {
            yield PlacesUtils.history.removeVisitsByFilter({
              beginDate: new Date(range[0] / 1000),
              endDate: new Date(range[1] / 1000)
            });
          } else {
            // Remove everything.
            yield PlacesUtils.history.clear();
          }
        } catch (ex) {
          seenException = ex;
        } finally {
          TelemetryStopwatch.finish("FX_SANITIZE_HISTORY", refObj);
        }

        try {
          let clearStartingTime = range ? String(range[0]) : "";
          Services.obs.notifyObservers(null, "browser:purge-session-history", clearStartingTime);
        } catch (ex) {
          seenException = ex;
        }

        try {
          let predictor = Components.classes["@mozilla.org/network/predictor;1"]
                                    .getService(Components.interfaces.nsINetworkPredictor);
          predictor.reset();
        } catch (ex) {
          seenException = ex;
        }

        if (seenException) {
          throw seenException;
        }
      })
    },

    formdata: {
      clear: Task.async(function* (range) {
        let seenException;
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_FORMDATA", refObj);
        try {
          // Clear undo history of all searchBars
          let windows = Services.wm.getEnumerator("navigator:browser");
          while (windows.hasMoreElements()) {
            let currentWindow = windows.getNext();
            let currentDocument = currentWindow.document;
            let searchBar = currentDocument.getElementById("searchbar");
            if (searchBar)
              searchBar.textbox.reset();
            let tabBrowser = currentWindow.gBrowser;
            if (!tabBrowser) {
              // No tab browser? This means that it's too early during startup (typically,
              // Session Restore hasn't completed yet). Since we don't have find
              // bars at that stage and since Session Restore will not restore
              // find bars further down during startup, we have nothing to clear.
              continue;
            }
            for (let tab of tabBrowser.tabs) {
              if (tabBrowser.isFindBarInitialized(tab))
                tabBrowser.getFindBar(tab).clear();
            }
            // Clear any saved find value
            tabBrowser._lastFindValue = "";
          }
        } catch (ex) {
          seenException = ex;
        }

        try {
          let change = { op: "remove" };
          if (range) {
            [ change.firstUsedStart, change.firstUsedEnd ] = range;
          }
          yield new Promise(resolve => {
            FormHistory.update(change, {
              handleError(e) {
                seenException = new Error("Error " + e.result + ": " + e.message);
              },
              handleCompletion() {
                resolve();
              }
            });
          });
        } catch (ex) {
          seenException = ex;
        }

        TelemetryStopwatch.finish("FX_SANITIZE_FORMDATA", refObj);
        if (seenException) {
          throw seenException;
        }
      })
    },

    downloads: {
      clear: Task.async(function* (range) {
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_DOWNLOADS", refObj);
        try {
          let filterByTime = null;
          if (range) {
            // Convert microseconds back to milliseconds for date comparisons.
            let rangeBeginMs = range[0] / 1000;
            let rangeEndMs = range[1] / 1000;
            filterByTime = download => download.startTime >= rangeBeginMs &&
                                       download.startTime <= rangeEndMs;
          }

          // Clear all completed/cancelled downloads
          let list = yield Downloads.getList(Downloads.ALL);
          list.removeFinished(filterByTime);
        } finally {
          TelemetryStopwatch.finish("FX_SANITIZE_DOWNLOADS", refObj);
        }
      })
    },

    sessions: {
      clear: Task.async(function* (range) {
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_SESSIONS", refObj);

        try {
          // clear all auth tokens
          let sdr = Components.classes["@mozilla.org/security/sdr;1"]
                              .getService(Components.interfaces.nsISecretDecoderRing);
          sdr.logoutAndTeardown();

          // clear FTP and plain HTTP auth sessions
          Services.obs.notifyObservers(null, "net:clear-active-logins", null);
        } finally {
          TelemetryStopwatch.finish("FX_SANITIZE_SESSIONS", refObj);
        }
      })
    },

    siteSettings: {
      clear: Task.async(function* (range) {
        let seenException;
        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_SITESETTINGS", refObj);

        let startDateMS = range ? range[0] / 1000 : null;

        try {
          // Clear site-specific permissions like "Allow this site to open popups"
          // we ignore the "end" range and hope it is now() - none of the
          // interfaces used here support a true range anyway.
          if (startDateMS == null) {
            Services.perms.removeAll();
          } else {
            Services.perms.removeAllSince(startDateMS);
          }
        } catch (ex) {
          seenException = ex;
        }

        try {
          // Clear site-specific settings like page-zoom level
          let cps = Components.classes["@mozilla.org/content-pref/service;1"]
                              .getService(Components.interfaces.nsIContentPrefService2);
          if (startDateMS == null) {
            cps.removeAllDomains(null);
          } else {
            cps.removeAllDomainsSince(startDateMS, null);
          }
        } catch (ex) {
          seenException = ex;
        }

        try {
          // Clear site security settings - no support for ranges in this
          // interface either, so we clearAll().
          let sss = Cc["@mozilla.org/ssservice;1"]
                      .getService(Ci.nsISiteSecurityService);
          sss.clearAll();
        } catch (ex) {
          seenException = ex;
        }

        // Clear all push notification subscriptions
        try {
          yield new Promise((resolve, reject) => {
            let push = Cc["@mozilla.org/push/Service;1"]
                         .getService(Ci.nsIPushService);
            push.clearForDomain("*", status => {
              if (Components.isSuccessCode(status)) {
                resolve();
              } else {
                reject(new Error("Error clearing push subscriptions: " +
                                 status));
              }
            });
          });
        } catch (ex) {
          seenException = ex;
        }

        TelemetryStopwatch.finish("FX_SANITIZE_SITESETTINGS", refObj);
        if (seenException) {
          throw seenException;
        }
      })
    },

    openWindows: {
      privateStateForNewWindow: "non-private",
      _canCloseWindow: function(aWindow) {
        if (aWindow.CanCloseWindow()) {
          // We already showed PermitUnload for the window, so let's
          // make sure we don't do it again when we actually close the
          // window.
          aWindow.skipNextCanClose = true;
          return true;
        }
        return false;
      },
      _resetAllWindowClosures: function(aWindowList) {
        for (let win of aWindowList) {
          win.skipNextCanClose = false;
        }
      },
      clear: Task.async(function* () {
        // NB: this closes all *browser* windows, not other windows like the library, about window,
        // browser console, etc.

        // Keep track of the time in case we get stuck in la-la-land because of onbeforeunload
        // dialogs
        let existingWindow = Services.appShell.hiddenDOMWindow;
        let startDate = existingWindow.performance.now();

        // First check if all these windows are OK with being closed:
        let windowEnumerator = Services.wm.getEnumerator("navigator:browser");
        let windowList = [];
        while (windowEnumerator.hasMoreElements()) {
          let someWin = windowEnumerator.getNext();
          windowList.push(someWin);
          // If someone says "no" to a beforeunload prompt, we abort here:
          if (!this._canCloseWindow(someWin)) {
            this._resetAllWindowClosures(windowList);
            throw new Error("Sanitize could not close windows: cancelled by user");
          }

          // ...however, beforeunload prompts spin the event loop, and so the code here won't get
          // hit until the prompt has been dismissed. If more than 1 minute has elapsed since we
          // started prompting, stop, because the user might not even remember initiating the
          // 'forget', and the timespans will be all wrong by now anyway:
          if (existingWindow.performance.now() > (startDate + 60 * 1000)) {
            this._resetAllWindowClosures(windowList);
            throw new Error("Sanitize could not close windows: timeout");
          }
        }

        // If/once we get here, we should actually be able to close all windows.

        let refObj = {};
        TelemetryStopwatch.start("FX_SANITIZE_OPENWINDOWS", refObj);

        // First create a new window. We do this first so that on non-mac, we don't
        // accidentally close the app by closing all the windows.
        let handler = Cc["@mozilla.org/browser/clh;1"].getService(Ci.nsIBrowserHandler);
        let defaultArgs = handler.defaultArgs;
        let features = "chrome,all,dialog=no," + this.privateStateForNewWindow;
        let newWindow = existingWindow.openDialog("chrome://browser/content/", "_blank",
                                                  features, defaultArgs);

        let onFullScreen = null;
        if (AppConstants.platform == "macosx") {
          onFullScreen = function(e) {
            newWindow.removeEventListener("fullscreen", onFullScreen);
            let docEl = newWindow.document.documentElement;
            let sizemode = docEl.getAttribute("sizemode");
            if (!newWindow.fullScreen && sizemode == "fullscreen") {
              docEl.setAttribute("sizemode", "normal");
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
            return undefined;
          }
          newWindow.addEventListener("fullscreen", onFullScreen);
        }

        let promiseReady = new Promise(resolve => {
          // Window creation and destruction is asynchronous. We need to wait
          // until all existing windows are fully closed, and the new window is
          // fully open, before continuing. Otherwise the rest of the sanitizer
          // could run too early (and miss new cookies being set when a page
          // closes) and/or run too late (and not have a fully-formed window yet
          // in existence). See bug 1088137.
          let newWindowOpened = false;
          let onWindowOpened = function(subject, topic, data) {
            if (subject != newWindow)
              return;

            Services.obs.removeObserver(onWindowOpened, "browser-delayed-startup-finished");
            if (AppConstants.platform == "macosx") {
              newWindow.removeEventListener("fullscreen", onFullScreen);
            }
            newWindowOpened = true;
            // If we're the last thing to happen, invoke callback.
            if (numWindowsClosing == 0) {
              TelemetryStopwatch.finish("FX_SANITIZE_OPENWINDOWS", refObj);
              resolve();
            }
          }

          let numWindowsClosing = windowList.length;
          let onWindowClosed = function() {
            numWindowsClosing--;
            if (numWindowsClosing == 0) {
              Services.obs.removeObserver(onWindowClosed, "xul-window-destroyed");
              // If we're the last thing to happen, invoke callback.
              if (newWindowOpened) {
                TelemetryStopwatch.finish("FX_SANITIZE_OPENWINDOWS", refObj);
                resolve();
              }
            }
          }
          Services.obs.addObserver(onWindowOpened, "browser-delayed-startup-finished", false);
          Services.obs.addObserver(onWindowClosed, "xul-window-destroyed", false);
        });

        // Start the process of closing windows
        while (windowList.length) {
          windowList.pop().close();
        }
        newWindow.focus();
        yield promiseReady;
      })
    },
  }
};









  },

};

