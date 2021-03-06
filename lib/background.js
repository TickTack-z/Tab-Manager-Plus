"use strict";

function createWindowWithTabs(tabs, isIncognito) {
	var first = tabs.shift();
	var t = [];
	for (var i = 0; i < tabs.length; i++) {
		t.push(tabs[i].id);
	};
	chrome.windows.create({ tabId: first.id, incognito: !!isIncognito, focused: true }, function (first, t, w) {
		chrome.tabs.update(first.id, { pinned: first.pinned });
		if (t.length > 0) {
			chrome.tabs.move(t, { windowId: w.id, index: -1 }, function (tab) {
				chrome.tabs.update(tab.id, { pinned: tab.pinned });
			});
		}
		chrome.windows.update(w.id, { focused: true });
	}.bind(null, first, t));
}

function focusOnTabAndWindow(tab) {
	chrome.windows.update(tab.windowId, { focused: true });
	if (!!tab.tabId) {
		chrome.tabs.update(tab.tabId, { active: true });
		tabActiveChanged(tab);
	} else {
		chrome.tabs.update(tab.id, { active: true });
		tabActiveChanged({ tabId: tab.id, windowId: tab.windowId });
	}
}

function updateTabCount() {
	var run = true;
	if (localStorageAvailable()) {
		if (typeof localStorage["badge"] === "undefined") localStorage["badge"] = "1";
		if (localStorage["badge"] == "0") run = false;
	}

	if (run) {
		chrome.tabs.query({}, function (result) {
			var count = 0;
			if (!!result && !!result.length) {
				count = result.length;
			}
			chrome.browserAction.setBadgeText({ text: count + "" });
			chrome.browserAction.setBadgeBackgroundColor({ color: "purple" });
			var toRemove = [];
			if (!!window.tabsActive) {
				for (var i = 0; i < window.tabsActive.length; i++) {
					var t = window.tabsActive[i];
					var found = false;
					if (!!result && !!result.length) {
						for (var j = 0; j < result.length; j++) {
							if (result[j].id == t.tabId) found = true;
						};
					}
					if (!found) toRemove.push(i);
				};
			}
			// console.log("to remove", toRemove);
			for (var i = toRemove.length - 1; i >= 0; i--) {
				// console.log("removing", toRemove[i]);
				if (!!window.tabsActive && window.tabsActive.length > 0) {
					if (!!window.tabsActive[toRemove[i]]) window.tabsActive.splice(toRemove[i], 1);
				}
			};
		});
	} else {
		chrome.browserAction.setBadgeText({ text: "" });
	}
}

var updateTabCountDebounce = debounce(updateTabCount, 250);

function tabRemoved() {
	updateTabCountDebounce();
}

window.tabsActive = [];

function tabAdded(tab) {
	if (typeof localStorage["tabLimit"] === "undefined") localStorage["tabLimit"] = "0";
	try {
		var tabLimit = JSON.parse(localStorage["tabLimit"]);
	} catch (e) {
		var tabLimit = 0;
	}
	if (tabLimit > 0) {
		if (tab.index >= tabLimit) {
			createWindowWithTabs([tab], tab.incognito);
		}
	}
	updateTabCountDebounce();
}



function tabActiveChanged(tab) {
	if (!!tab && !!tab.tabId) {
		if (!window.tabsActive) window.tabsActive = [];
		if (!!window.tabsActive && window.tabsActive.length > 0) {
			var lastActive = window.tabsActive[window.tabsActive.length - 1];
			if (!!lastActive && lastActive.tabId == tab.tabId && lastActive.windowId == tab.windowId) {
				return;
			}
		}
		while (window.tabsActive.length > 20) {
			window.tabsActive.shift();
		}
		for (var i = window.tabsActive.length - 1; i >= 0; i--) {
			if (window.tabsActive[i].tabId == tab.tabId) {
				window.tabsActive.splice(i, 1);
			}
		};
		window.tabsActive.push(tab);
	}
	updateTabCountDebounce();
}

function setupListeners() {

	chrome.browserAction.setPopup({
		popup: "popup.html" });


	chrome.tabs.onCreated.removeListener(tabAdded);
	chrome.tabs.onUpdated.removeListener(tabRemoved);
	chrome.tabs.onRemoved.removeListener(tabRemoved);
	chrome.tabs.onReplaced.removeListener(tabRemoved);
	chrome.tabs.onDetached.removeListener(tabRemoved);
	chrome.tabs.onAttached.removeListener(tabRemoved);
	chrome.tabs.onActivated.removeListener(tabActiveChanged);
	chrome.windows.onFocusChanged.removeListener(windowFocus);
	chrome.windows.onCreated.removeListener(windowCreated);
	chrome.windows.onRemoved.removeListener(windowRemoved);

	chrome.tabs.onCreated.addListener(tabAdded);
	chrome.tabs.onUpdated.addListener(tabRemoved);
	chrome.tabs.onRemoved.addListener(tabRemoved);
	chrome.tabs.onReplaced.addListener(tabRemoved);
	chrome.tabs.onDetached.addListener(tabRemoved);
	chrome.tabs.onAttached.addListener(tabRemoved);
	chrome.tabs.onActivated.addListener(tabActiveChanged);
	chrome.windows.onFocusChanged.addListener(windowFocus);
	chrome.windows.onCreated.addListener(windowCreated);
	chrome.windows.onRemoved.addListener(windowRemoved);
	updateTabCountDebounce();
}

chrome.windows.getAll({ populate: true }, function (windows) {
	localStorage["windowAge"] = JSON.stringify([]);
	if (!!windows && windows.length > 0) {
		windows.sort(function (a, b) {
			if (a.id < b.id) return 1;
			if (a.id > b.id) return -1;
			return 0;
		});
		for (var i = 0; i < windows.length; i++) {
			if (!!windows[i].id) windowActive(windows[i].id);
		};
	}
});

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
	var timeout;
	return function () {
		var context = this,args = arguments;
		var later = function later() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

function localStorageAvailable() {
	var test = 'test';
	try {
		localStorage.setItem(test, test);
		localStorage.removeItem(test);
		return true;
	} catch (e) {
		return false;
	}
}

function windowFocus(windowId) {
	try {
		if (!!windowId) {
			windowActive(windowId);
			// console.log("onFocused", windowId);
			hideWindows(windowId);
		}
	} catch (e) {

	}
}
function windowCreated(window) {
	try {
		if (!!window && !!window.id) {
			windowActive(window.id);
		}
	} catch (e) {

	}
	// console.log("onCreated", window.id);
}
function windowRemoved(windowId) {
	try {
		if (!!windowId) {
			windowActive(windowId);
		}
	} catch (e) {

	}
	// console.log("onRemoved", windowId);
}

window.displayInfo = [];

function hideWindows(windowId) {
	if (!windowId || windowId < 0) {
		return;
	} else {
		if (localStorageAvailable()) {
			if (typeof localStorage["hideWindows"] === "undefined") localStorage["hideWindows"] = "0";
			if (localStorage["hideWindows"] == "0") return;
		} else {
			console.log("no local storage");
			return;
		}

		chrome.permissions.contains({
			permissions: ['system.display'] },
		function (windowId, result) {
			if (result) {
				// The extension has the permissions.
				chrome.system.display.getInfo(function (windowId, displaylayouts) {
					window.displayInfo = [];var _iteratorNormalCompletion = true;var _didIteratorError = false;var _iteratorError = undefined;try {
						for (var _iterator = displaylayouts[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {var displaylayout = _step.value;
							window.displayInfo.push(displaylayout.bounds);
						}} catch (err) {_didIteratorError = true;_iteratorError = err;} finally {try {if (!_iteratorNormalCompletion && _iterator.return) {_iterator.return();}} finally {if (_didIteratorError) {throw _iteratorError;}}}
					chrome.windows.getAll({ populate: true }, function (windowId, windows) {
						var monitor = -1;
						for (var i = windows.length - 1; i >= 0; i--) {
							if (windows[i].id == windowId) {
								for (var a in window.displayInfo) {
									var result = is_in_bounds(windows[i], window.displayInfo[a]);
									if (result) {
										monitor = a;
									}
								}
							}
						};

						for (var i = windows.length - 1; i >= 0; i--) {
							if (windows[i].id != windowId) {
								if (is_in_bounds(windows[i], window.displayInfo[monitor])) {
									chrome.windows.update(windows[i].id, {
										"state": "minimized" });
								}
							}
						};
					}.bind(null, windowId));
				}.bind(null, windowId));
			}
		}.bind(this, windowId));


	}
}

function is_in_bounds(object, bounds) {
	var C = object,B = bounds;
	if (C.left >= B.left && C.left <= B.left + B.width) {
		if (C.top >= B.top && C.top <= B.top + B.height) {
			return true;
		}
	}
	return false;
};

function windowActive(windowId) {
	if (windowId < 0) return;
	var windows = JSON.parse(localStorage["windowAge"]);
	if (windows instanceof Array) {

	} else {
		windows = [];
	}
	if (windows.indexOf(windowId) > -1) windows.splice(windows.indexOf(windowId), 1);
	windows.unshift(windowId);
	localStorage["windowAge"] = JSON.stringify(windows);

	// chrome.windows.getLastFocused({ populate: true }, function (w) {
	// 	for (var i = 0; i < w.tabs.length; i++) {
	// 		var tab = w.tabs[i];
	// 		if (tab.active == true) {
	// 			// console.log("get last focused", tab.id);
	// 			// tabActiveChanged({
	// 			// 	tabId: tab.id,
	// 			// 	windowId: tab.windowId
	// 			// });
	// 		}
	// 	};
	// });
	// console.log(windows);
}

chrome.commands.onCommand.addListener(function (command) {
	if (command == "switch_to_previous_active_tab") {
		if (!!window.tabsActive && window.tabsActive.length > 1) {
			focusOnTabAndWindow(window.tabsActive[window.tabsActive.length - 2]);
		}
	}
});


setInterval(setupListeners, 300000);
setupListeners();

