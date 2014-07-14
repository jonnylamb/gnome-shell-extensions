/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const AltTab = imports.ui.altTab;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

let injections = {};

function init(metadata) {
}

function setKeybinding(name, func) {
    Main.wm.setCustomKeybindingHandler(name, Shell.KeyBindingMode.NORMAL, func);
}

function enable() {
    let settings = Convenience.getSettings();

    injections['_initialSelection'] = AltTab.WindowSwitcherPopup.prototype._initialSelection;
    AltTab.WindowSwitcherPopup.prototype._initialSelection = function(backward, binding) {
        if (binding == 'switch-windows-backward' ||
            binding == 'switch-applications-backward' ||
            binding == 'switch-group-backward' || backward)
            this._select(this._items.length - 1);
        else if (this._items.length == 1)
            this._select(0);
        else
            this._select(1);
    };
    injections['_keyPressHandler'] = AltTab.WindowSwitcherPopup.prototype._keyPressHandler;
    AltTab.WindowSwitcherPopup.prototype._keyPressHandler = function(keysym, backwards, action) {
        if (action == Meta.KeyBindingAction.SWITCH_WINDOWS ||
            action == Meta.KeyBindingAction.SWITCH_APPLICATIONS ||
            action == Meta.KeyBindingAction.SWITCH_GROUP) {
            this._select(backwards ? this._previous() : this._next());
        } else if (action == Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD ||
                   action == Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD ||
                   action == Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD) {
            this._select(this._previous());
        } else {
            if (keysym == Clutter.Left)
                this._select(this._previous());
            else if (keysym == Clutter.Right)
                this._select(this._next());
        }
    };
    injections['_getWindowList'] = AltTab.WindowSwitcherPopup.prototype._getWindowList;
    AltTab.WindowSwitcherPopup.prototype._getWindowList = function() {
        let wins = Lang.bind(this, injections['_getWindowList'])();
        if (settings.get_boolean('current-monitor-only')) {
            wins = wins.filter(function(win) {
                return global.screen.get_current_monitor() == win.get_monitor();
            });
        }
        return wins;
    };


    setKeybinding('switch-applications', Lang.bind(Main.wm, Main.wm._startWindowSwitcher));
    setKeybinding('switch-group', Lang.bind(Main.wm, Main.wm._startWindowSwitcher));
    setKeybinding('switch-applications-backward', Lang.bind(Main.wm, Main.wm._startWindowSwitcher));
    setKeybinding('switch-group-backward', Lang.bind(Main.wm, Main.wm._startWindowSwitcher));
}

function disable() {
    var prop;

    setKeybinding('switch-applications', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-applications-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-group-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));

    for (prop in injections)
        AltTab.WindowSwitcherPopup.prototype[prop] = injections[prop];
}
