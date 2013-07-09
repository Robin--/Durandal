﻿/**
 * The viewLocator module collaborates with the viewEngine module to provide views (literally dom sub-trees) to other parts of the framework as needed. The primary consumer of the viewLocator is the composition module.
 * @module dialog
 * @requires system
 * @requires app
 * @requires composition
 * @requires activator
 * @requires viewEngine
 * @requires jquery
 */
define(['durandal/system', 'durandal/app', 'durandal/composition', 'durandal/activator', 'durandal/viewEngine', 'jquery'], function (system, app, composition, activator, viewEngine, $) {
    var contexts = {},
        dialogCount = 0,
        dialog;

    /**
     * Models a message box's message, title and options.
     * @class MessageBox
     */
    var MessageBox = function(message, title, options) {
        this.message = message;
        this.title = title || MessageBox.defaultTitle;
        this.options = options || MessageBox.defaultOptions;
    };

    /**
     * Selects an option and closes the message box, returning the selected option through the dialog system's promise.
     * @method selectOption
     * @param {string} dialogResult The result to select.
     */
    MessageBox.prototype.selectOption = function (dialogResult) {
        dialog.close(this, dialogResult);
    };

    /**
     * Provides the view to the composition system.
     * @method getView
     * @return {DOMElement} The view of the message box.
     */
    MessageBox.prototype.getView = function(){
        return viewEngine.processMarkup(MessageBox.defaultViewMarkup);
    };

    /**
     * The title to be used for the message box if one is not provided.
     * @property {string} defaultTitle
     * @default Application
     * @static
     */
    MessageBox.defaultTitle = app.title || 'Application';

    /**
     * The options to display in the message box of none are specified.
     * @property {string[]} defaultOptions
     * @default ['Ok']
     * @static
     */
    MessageBox.defaultOptions = ['Ok'];

    /**
     * The markup for the message box's view.
     * @property {string} defaultViewMarkup
     * @static
     */
    MessageBox.defaultViewMarkup = [
        '<div data-view="plugins/messageBox" class="messageBox">',
            '<div class="modal-header">',
                '<h3 data-bind="text: title"></h3>',
            '</div>',
            '<div class="modal-body">',
                '<p class="message" data-bind="text: message"></p>',
            '</div>',
            '<div class="modal-footer" data-bind="foreach: options">',
                '<button class="btn" data-bind="click: function () { $parent.selectOption($data); }, text: $data, css: { \'btn-primary\': $index() == 0, autofocus: $index() == 0 }"></button>',
            '</div>',
        '</div>'
    ].join('\n');

    function ensureDialogInstance(objOrModuleId) {
        return system.defer(function(dfd) {
            if (system.isString(objOrModuleId)) {
                system.acquire(objOrModuleId).then(function (module) {
                    dfd.resolve(system.resolveObject(module));
                });
            } else {
                dfd.resolve(objOrModuleId);
            }
        }).promise();
    }

    /**
     * @class DialogModule
     * @static
     */
    dialog = {
        /**
         * The constructor function used to create message boxes.
         * @property {MessageBox} MessageBox
         */
        MessageBox:MessageBox,
        /**
         * The css zIndex that the last dialog was displayed at.
         * @property {int} currentZIndex
         */
        currentZIndex: 1050,
        /**
         * Gets the next css zIndex at which a dialog should be displayed.
         * @method getNextZIndex
         * @param {int} The zIndex.
         */
        getNextZIndex: function () {
            return ++this.currentZIndex;
        },
        /**
         * Determines whether or not there are any dialogs open.
         * @method isOpen
         * @return {boolean} True if a dialog is open. false otherwise.
         */
        isOpen: function() {
            return dialogCount > 0;
        },
        /**
         * Gets the dialog context by name or returns the default context if no name is specified.
         * @method getContext
         * @param {string} [name] The name of the context to retrieve.
         * @return {DialogContext} True context.
         */
        getContext: function(name) {
            return contexts[name || 'default'];
        },
        /**
         * Adds (or replaces) a dialog context.
         * @method addContext
         * @param {string} name The name of the context to add.
         * @param {DialogContext} dialogContext The context to add.
         */
        addContext: function(name, dialogContext) {
            dialogContext.name = name;
            contexts[name] = dialogContext;

            var helperName = 'show' + name.substr(0, 1).toUpperCase() + name.substr(1);
            this[helperName] = function (obj, activationData) {
                return this.show(obj, activationData, name);
            };
        },
        createCompositionSettings: function(obj, dialogContext) {
            var settings = {
                model:obj,
                activate:false
            };

            if (dialogContext.attached) {
                settings.attached = dialogContext.attached;
            }

            if (dialogContext.compositionComplete) {
                settings.compositionComplete = dialogContext.compositionComplete;
            }

            return settings;
        },
        /**
         * Gets the dialog model that is associated with the specified object.
         * @method getDialog
         * @param {object} obj The object for whom to retrieve the dialog.
         * @return {Dialog} The dialog model.
         */
        getDialog:function(obj){
            if(obj){
                return obj.__dialog__;
            }

            return undefined;
        },
        /**
         * Closes the dialog associated with the specified object.
         * @method close
         * @param {object} obj The object whose dialog should be closed.
         * @param {object} result* The results to return back to the dialog caller after closing.
         */
        close:function(obj){
            var theDialog = this.getDialog(obj);
            if(theDialog){
                var rest = Array.prototype.slice.call(arguments, 1);
                theDialog.close.apply(theDialog, rest);
            }
        },
        /**
         * Shows a dialog.
         * @method show
         * @param {object|string} obj The object (or moduleId) to display as a dialog.
         * @param {object} [activationData] The data that should be passed to the object upon activation.
         * @param {string} [context] The name of the dialog context to use. Uses the default context if none is specified.
         * @return {Promise} A promise that resolves when the dialog is closed and returns any data passed at the time of closing.
         */
        show: function(obj, activationData, context) {
            var that = this;
            var dialogContext = contexts[context || 'default'];

            return system.defer(function(dfd) {
                ensureDialogInstance(obj).then(function(instance) {
                    var dialogActivator = activator.create();

                    dialogActivator.activateItem(instance, activationData).then(function (success) {
                        if (success) {
                            var theDialog = instance.__dialog__ = {
                                owner: instance,
                                context: dialogContext,
                                activator: dialogActivator,
                                close: function () {
                                    var args = arguments;
                                    dialogActivator.deactivateItem(instance, true).then(function (closeSuccess) {
                                        if (closeSuccess) {
                                            dialogCount--;
                                            dialogContext.removeHost(theDialog);
                                            delete instance.__dialog__;
                                            dfd.resolve.apply(dfd, args);
                                        }
                                    });
                                }
                            };

                            theDialog.settings = that.createCompositionSettings(instance, dialogContext);
                            dialogContext.addHost(theDialog);

                            dialogCount++;
                            composition.compose(theDialog.host, theDialog.settings);
                        } else {
                            dfd.resolve(false);
                        }
                    });
                });
            }).promise();
        },
        /**
         * Shows a message box.
         * @method show
         * @param {string} message The message to display in the dialog.
         * @param {string} [title] The title message.
         * @param {string[]} [options] The options to provide to the user.
         * @return {Promise} A promise that resolves when the message box is closed and returns the selected option.
         */
        showMessage:function(message, title, options){
            if(system.isString(this.MessageBox)){
                return dialog.show(this.MessageBox, [
                    message,
                    title || MessageBox.defaultTitle,
                    options || MessageBox.defaultOptions
                ]);
            }

            return dialog.show(new this.MessageBox(message, title, options));
        },
        /**
         * Installs this module into Durandal. Adds `app.showDialog` and `app.showMessage` convenience methods.
         * @method install
         * @param {object} [config] Add a `messageBox` property to supply a custom message box constructor. Add a `messageBoxView` property to supply custom view markup for the built-in message box.
         */
        install:function(config){
            app.showDialog = function(obj, activationData, context) {
                return dialog.show(obj, activationData, context);
            };

            app.showMessage = function(message, title, options) {
                return dialog.showMessage(message, title, options);
            };

            if(config.messageBox){
                dialog.MessageBox = config.messageBox;
            }

            if(config.messageBoxView){
                dialog.MessageBox.prototype.getView = function(){
                    return config.messageBoxView;
                };
            }
        }
    };

    /**
     * @class DialogContext
     */
    dialog.addContext('default', {
        blockoutOpacity: .2,
        removeDelay: 200,
        /**
         * In this function, you are expected to add a DOM element to the tree which will serve as the "host" for the modal's composed view. You must add a property called host to the modalWindow object which references the dom element. It is this host which is passed to the composition module.
         * @method addHost
         * @param {Dialog} theDialog The dialog model.
         */
        addHost: function(theDialog) {
            var body = $('body');
            var blockout = $('<div class="modalBlockout"></div>')
                .css({ 'z-index': dialog.getNextZIndex(), 'opacity': this.blockoutOpacity })
                .appendTo(body);

            var host = $('<div class="modalHost"></div>')
                .css({ 'z-index': dialog.getNextZIndex() })
                .appendTo(body);

            theDialog.host = host.get(0);
            theDialog.blockout = blockout.get(0);

            if (!dialog.isOpen()) {
                theDialog.oldBodyMarginRight = body.css("margin-right");
                theDialog.oldInlineMarginRight = body.get(0).style.marginRight;

                var html = $("html");
                var oldBodyOuterWidth = body.outerWidth(true);
                var oldScrollTop = html.scrollTop();
                $("html").css("overflow-y", "hidden");
                var newBodyOuterWidth = $("body").outerWidth(true);
                body.css("margin-right", (newBodyOuterWidth - oldBodyOuterWidth + parseInt(theDialog.oldBodyMarginRight)) + "px");
                html.scrollTop(oldScrollTop); // necessary for Firefox
            }
        },
        /**
         * This function is expected to remove any DOM machinery associated with the specified dialog and do any other necessary cleanup.
         * @method removeHost
         * @param {Dialog} theDialog The dialog model.
         */
        removeHost: function(theDialog) {
            $(theDialog.host).css('opacity', 0);
            $(theDialog.blockout).css('opacity', 0);

            setTimeout(function() {
                $(theDialog.host).remove();
                $(theDialog.blockout).remove();
            }, this.removeDelay);

            if (!dialog.isOpen()) {
                var html = $("html");
                var oldScrollTop = html.scrollTop(); // necessary for Firefox.
                html.css("overflow-y", "").scrollTop(oldScrollTop);

                if(theDialog.oldInlineMarginRight) {
                    $("body").css("margin-right", theDialog.oldBodyMarginRight);
                } else {
                    $("body").css("margin-right", '');
                }
            }
        },
        /**
         * This function is called after the modal is fully composed into the DOM, allowing your implementation to do any final modifications, such as positioning or animation. You can obtain the original dialog object by using `getDialog` on context.model.
         * @method compositionComplete
         * @param {DOMElement} child The dialog view.
         * @param {object} context The composition context.
         */
        compositionComplete: function (child, context) {
            var $child = $(child);
            var width = $child.width();
            var height = $child.height();
            var theDialog = dialog.getDialog(context.model);

            $child.css({
                'margin-top': (-height / 2).toString() + 'px',
                'margin-left': (-width / 2).toString() + 'px'
            });

            $(theDialog.host).css('opacity', 1);

            if ($(child).hasClass('autoclose')) {
                $(theDialog.blockout).click(function() {
                    theDialog.close();
                });
            }

            $('.autofocus', child).each(function() {
                $(this).focus();
            });
        }
    });

    return dialog;
});