const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Lang = imports.lang;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;


function _minimizeOrActivateWindow(window) {
        let focusWindow = global.display.focus_window;
        if (focusWindow == window ||
            focusWindow && focusWindow.get_transient_for() == window)
            window.minimize();
        else
            window.activate(global.get_current_time());
}


const WindowButton = new Lang.Class({
    Name: 'WindowButton',

    _init: function(metaWindow) {
        this.metaWindow = metaWindow;

        let box = new St.BoxLayout();
        this.actor = new St.Button({ style_class: 'window-button',
                                     x_fill: true,
                                     child: box });
        this.actor._delegate = this;

        this.actor.connect('allocation-changed',
                           Lang.bind(this, this._updateIconGeometry));

        let textureCache = St.TextureCache.get_default();
        let icon = textureCache.bind_pixbuf_property(this.metaWindow, "icon");
        this._icon = new St.Bin({ style_class: 'window-button-icon',
                                  child: icon });
        box.add(this._icon);
        this._label = new St.Label();
        box.add(this._label);

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._updateVisibility));
        this._updateVisibility();

        this._notifyTitleId =
            this.metaWindow.connect('notify::title',
                                    Lang.bind(this, this._updateTitle));
        this._notifyMinimizedId =
            this.metaWindow.connect('notify::minimized',
                                    Lang.bind(this, this._minimizedChanged));
        this._notifyFocusId =
            global.display.connect('notify::focus-window',
                                   Lang.bind(this, this._updateStyle));
        this._minimizedChanged();
    },

    _onClicked: function() {
        _minimizeOrActivateWindow(this.metaWindow);
    },

    _minimizedChanged: function() {
        this._icon.opacity = this.metaWindow.minimized ? 128 : 255;
        this._updateTitle();
        this._updateStyle();
    },

    _updateTitle: function() {
        if (this.metaWindow.minimized)
            this._label.text = '[%s]'.format(this.metaWindow.title);
        else
            this._label.text = this.metaWindow.title;
    },

    _updateStyle: function() {
        if (this.metaWindow.minimized)
            this.actor.add_style_class_name('minimized');
        else
            this.actor.remove_style_class_name('minimized');

        if (global.display.focus_window == this.metaWindow)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    _updateVisibility: function() {
        let workspace = global.screen.get_active_workspace();
        this.actor.visible = this.metaWindow.located_on_workspace(workspace);
    },

    _updateIconGeometry: function() {
        let [x, y] = this.actor.get_transformed_position();
        let [w, h] = this.actor.get_transformed_size();

        let rect = new Meta.Rectangle();
        rect.x = x + Math.floor(w / 2);
        rect.y = y + Math.floor(h / 2);
        rect.width = w;
        rect.height = h;

        this.metaWindow.set_icon_geometry(rect);
    },

    _onDestroy: function() {
        global.window_manager.disconnect(this._switchWorkspaceId);
        this.metaWindow.disconnect(this._notifyTitleId);
        this.metaWindow.disconnect(this._notifyMinimizedId);
        global.display.disconnect(this._notifyFocusId);
    }
});


const TrayButton = new Lang.Class({
    Name: 'TrayButton',

    _init: function() {
        this._counterLabel = new St.Label({ x_align: Clutter.ActorAlign.CENTER,
                                            x_expand: true,
                                            y_align: Clutter.ActorAlign.CENTER,
                                            y_expand: true });
        this.actor = new St.Button({ style_class: 'summary-source-counter',
                                     child: this._counterLabel,
                                     layoutManager: new Clutter.BinLayout() });
        this.actor.set_x_align(Clutter.ActorAlign.END);
        this.actor.set_x_expand(true);
        this.actor.set_y_expand(true);

        this.actor.connect('clicked', Lang.bind(this,
            function() {
                if (Main.messageTray._trayState == MessageTray.State.HIDDEN)
                    Main.messageTray.toggle();
            }));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._trayItemCount = 0;
        Main.messageTray.getSummaryItems().forEach(Lang.bind(this,
            function(item) {
                this._itemAdded(Main.messageTray, item);
            }));
        this._itemAddedId =
            Main.messageTray.connect('summary-item-added',
                                     Lang.bind(this, this._itemAdded));
        this._updateVisibility();
    },

    _itemAdded: function(tray, item) {
        item.source._windowListDestroyId = item.source.connect('destroy', Lang.bind(this, this._itemRemoved));
        this._trayItemCount++;
        this._updateVisibility();
    },

    _itemRemoved: function(item) {
        item.disconnect(item._windowListDestroyId);
        delete item._windowListDestroyId;
        this._trayItemCount--;
        this.actor.checked = false;
        this._updateVisibility();
    },

    _updateVisibility: function() {
        this._counterLabel.text = this._trayItemCount.toString();
        this.actor.visible = this._trayItemCount > 0;
    },

    _onDestroy: function() {
        Main.messageTray.disconnect(this._itemAddedId);
    }
});


const WindowList = new Lang.Class({
    Name: 'WindowList',

    _init: function() {
        this.actor = new St.Widget({ name: 'panel',
                                     style_class: 'bottom-panel',
                                     reactive: true,
                                     track_hover: true,
                                     layout_manager: new Clutter.BinLayout()});
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        let box = new St.BoxLayout({ x_expand: true, y_expand: true });
        this.actor.add_actor(box);

        let layout = new Clutter.BoxLayout({ homogeneous: true });
        this._windowList = new St.Widget({ style_class: 'window-list',
                                           layout_manager: layout,
                                           x_align: Clutter.ActorAlign.START,
                                           x_expand: true,
                                           y_expand: true });
        box.add(this._windowList, { expand: true });

        this._trayButton = new TrayButton();
        box.add(this._trayButton.actor);

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true,
                                                   trackFullscreen: true });

        this._monitorsChangedId =
            Main.layoutManager.connect('monitors-changed',
                                       Lang.bind(this, this._updatePosition));
        this._updatePosition();

        this._keyboardVisiblechangedId =
            Main.layoutManager.connect('keyboard-visible-changed',
                Lang.bind(this, function(o, state) {
                    Main.layoutManager.keyboardBox.visible = state;
                    Main.uiGroup.set_child_above_sibling(windowList.actor,
                                                         Main.layoutManager.keyboardBox);
                    this._updateKeyboardAnchor();
                }));

        this._nWorkspacesChangedId =
            global.screen.connect('notify::n-workspaces',
                                  Lang.bind(this, this._onWorkspacesChanged));
        this._onWorkspacesChanged();

        this._overviewShowingId =
            Main.overview.connect('showing', Lang.bind(this, function() {
                this.actor.hide();
                this._updateKeyboardAnchor();
            }));

        this._overviewHidingId =
            Main.overview.connect('hiding', Lang.bind(this, function() {
                this.actor.show();
                this._updateKeyboardAnchor();
            }));

        let windows = Meta.get_window_actors(global.screen);
        for (let i = 0; i < windows.length; i++)
            this._onWindowAdded(null, windows[i].metaWindow);
    },

    _updatePosition: function() {
        let monitor = Main.layoutManager.primaryMonitor;
        this.actor.width = monitor.width;
        this.actor.set_position(monitor.x, monitor.y + monitor.height - this.actor.height);
    },

    _updateKeyboardAnchor: function() {
        if (!Main.keyboard.actor)
            return;

        let anchorY = Main.overview.visible ? 0 : this.actor.height;
        Main.keyboard.actor.anchor_y = anchorY;
    },

    _onWindowAdded: function(ws, win) {
        if (!Shell.WindowTracker.get_default().is_window_interesting(win))
            return;

        let button = new WindowButton(win);
        this._windowList.layout_manager.pack(button.actor,
                                             true, true, true,
                                             Clutter.BoxAlignment.START,
                                             Clutter.BoxAlignment.START);
    },

    _onWindowRemoved: function(ws, win) {
        let children = this._windowList.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._delegate.metaWindow == win) {
                children[i].destroy();
                return;
            }
        }
    },

    _onWorkspacesChanged: function() {
        let numWorkspaces = global.screen.n_workspaces;
        for (let i = 0; i < numWorkspaces; i++) {
            let workspace = global.screen.get_workspace_by_index(i);
            if (workspace._windowAddedId)
                workspace.disconnect(workspace._windowAddedId);
            if (workspace._windowRemovedId)
                workspace.disconnect(workspace._windowRemovedId);
            workspace._windowAddedId =
                workspace.connect('window-added',
                                  Lang.bind(this, this._onWindowAdded));
            workspace._windowRemovedId =
                workspace.connect('window-removed',
                                  Lang.bind(this, this._onWindowRemoved));
        }
    },

    _onDestroy: function() {
        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        Main.layoutManager.disconnect(this._keyboardVisiblechangedId);
        this._keyboardVisiblechangedId = 0;

        if (Main.keyboard.actor)
            Main.keyboard.actor.anchor_y = 0;

        global.screen.disconnect(this._nWorkspacesChangedId);
        this._nWorkspacesChangedId = 0;

        Main.overview.disconnect(this._overviewShowingId);
        Main.overview.disconnect(this._overviewHidingId);

        let windows = Meta.get_window_actors(global.screen);
        for (let i = 0; i < windows.length; i++)
            windows[i].metaWindow.set_icon_geometry(null);
    }
});

let windowList;
let injections = {};
let notificationParent;

function init() {
}

function enable() {
    windowList = new WindowList();

    windowList.actor.connect('notify::hover', Lang.bind(Main.messageTray,
        function() {
            this._pointerInTray = windowList.actor.hover;
            this._updateState();
        }));

    injections['_trayDwellTimeout'] = MessageTray.MessageTray.prototype._trayDwellTimeout;
    MessageTray.MessageTray.prototype._trayDwellTimeout = function() {
        return false;
    };

    injections['_tween'] = MessageTray.MessageTray.prototype._tween;
    MessageTray.MessageTray.prototype._tween = function(actor, statevar, value, params) {
        if (!Main.overview.visible) {
            let anchorY;
            if (statevar == '_trayState')
                anchorY = windowList.actor.height;
            else if (statevar == '_notificationState')
                anchorY = -windowList.actor.height;
            else
                anchorY = 0;
            actor.anchor_y = anchorY;
        }
        injections['_tween'].call(Main.messageTray, actor, statevar, value, params);
    };
    injections['_onTrayHidden'] = MessageTray.MessageTray.prototype._onTrayHidden;
    MessageTray.MessageTray.prototype._onTrayHidden = function() {
        this.actor.anchor_y = 0;
        injections['_onTrayHidden'].call(Main.messageTray);
    };

    notificationParent = Main.messageTray._notificationWidget.get_parent();
    Main.messageTray._notificationWidget.hide();
    Main.messageTray._notificationWidget.reparent(windowList.actor);
    Main.messageTray._notificationWidget.show();
}

function disable() {
    if (!windowList)
        return;

    windowList.actor.hide();

    if (notificationParent) {
        Main.messageTray._notificationWidget.reparent(notificationParent);
        notificationParent = null;
    }

    windowList.actor.destroy();
    windowList = null;

    // horrible workaround for theme node caching causing
    // crashes on extension stylesheet reloading
    Main.loadTheme();

    for (prop in injections)
        MessageTray.MessageTray.prototype[prop] = injections[prop];

    Main.messageTray._notificationWidget.set_anchor_point(0, 0);
    Main.messageTray.actor.set_anchor_point(0, 0);
}
