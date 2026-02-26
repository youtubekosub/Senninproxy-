(() => {
    "use strict";

    // --- ユーティリティ関数群 ---
    const objectCreate = Object.create;
    const defineProperty = Object.defineProperty;
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const getOwnPropertyNames = Object.getOwnPropertyNames;
    const getPrototypeOf = Object.getPrototypeOf;
    const hasOwnProperty = Object.prototype.hasOwnProperty;

    const exportModule = (fn, module) => () => (module || fn((module = { exports: {} }).exports, module), module.exports);

    const extendModule = (target, source, exclude, isEnumerable) => {
        if (source && typeof source === "object" || typeof source === "function") {
            for (let key of getOwnPropertyNames(source)) {
                if (!hasOwnProperty.call(target, key) && key !== exclude) {
                    defineProperty(target, key, {
                        get: () => source[key],
                        enumerable: !(isEnumerable = getOwnPropertyDescriptor(source, key)) || isEnumerable.enumerable
                    });
                }
            }
        }
        return target;
    };

    const importModule = (source, target, result) => (
        result = source != null ? objectCreate(getPrototypeOf(source)) : {},
        extendModule(target || !source || !source.__esModule ? defineProperty(result, "default", { value: source, enumerable: true }) : result, source)
    );

    // --- EventEmitterの実装 ---
    const requireEventEmitter = exportModule((exports, module) => {
        const ReflectApply = typeof Reflect === "object" ? Reflect : null;
        const applyMethod = ReflectApply && typeof ReflectApply.apply === "function" ? ReflectApply.apply : function(fn, receiver, args) {
            return Function.prototype.apply.call(fn, receiver, args);
        };

        let ownKeys;
        if (ReflectApply && typeof ReflectApply.ownKeys === "function") {
            ownKeys = ReflectApply.ownKeys;
        } else if (Object.getOwnPropertySymbols) {
            ownKeys = function(obj) {
                return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
            };
        } else {
            ownKeys = function(obj) {
                return Object.getOwnPropertyNames(obj);
            };
        }

        function warn(msg) {
            if (console && console.warn) console.warn(msg);
        }

        const isNaN = Number.isNaN || function(val) { return val !== val; };

        function EventEmitter() {
            EventEmitter.init.call(this);
        }

        module.exports = EventEmitter;
        module.exports.once = onceEvent;
        EventEmitter.EventEmitter = EventEmitter;
        EventEmitter.prototype._events = undefined;
        EventEmitter.prototype._eventsCount = 0;
        EventEmitter.prototype._maxListeners = undefined;

        let defaultMaxListeners = 10;

        function checkListener(fn) {
            if (typeof fn !== "function") {
                throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof fn);
            }
        }

        defineProperty(EventEmitter, "defaultMaxListeners", {
            enumerable: true,
            get: function() { return defaultMaxListeners; },
            set: function(val) {
                if (typeof val !== "number" || val < 0 || isNaN(val)) {
                    throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + val + ".");
                }
                defaultMaxListeners = val;
            }
        });

        EventEmitter.init = function() {
            if (this._events === undefined || this._events === getPrototypeOf(this)._events) {
                this._events = objectCreate(null);
                this._eventsCount = 0;
            }
            this._maxListeners = this._maxListeners || undefined;
        };

        EventEmitter.prototype.setMaxListeners = function(n) {
            if (typeof n !== "number" || n < 0 || isNaN(n)) {
                throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + ".");
            }
            this._maxListeners = n;
            return this;
        };

        function getMaxListeners(emitter) {
            return emitter._maxListeners === undefined ? EventEmitter.defaultMaxListeners : emitter._maxListeners;
        }

        EventEmitter.prototype.getMaxListeners = function() {
            return getMaxListeners(this);
        };

        EventEmitter.prototype.emit = function(type, ...args) {
            let doError = type === "error";
            const events = this._events;
            if (events !== undefined) {
                doError = doError && events.error === undefined;
            } else if (!doError) {
                return false;
            }

            if (doError) {
                let er;
                if (args.length > 0) er = args[0];
                if (er instanceof Error) throw er;
                const err = new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
                err.context = er;
                throw err;
            }

            const handler = events[type];
            if (handler === undefined) return false;

            if (typeof handler === "function") {
                applyMethod(handler, this, args);
            } else {
                const len = handler.length;
                const listeners = arrayClone(handler, len);
                for (let i = 0; i < len; ++i) {
                    applyMethod(listeners[i], this, args);
                }
            }
            return true;
        };

        function addListener(emitter, type, listener, prepend) {
            let m;
            let events;
            let existing;
            checkListener(listener);
            events = emitter._events;
            if (events === undefined) {
                events = emitter._events = objectCreate(null);
                emitter._eventsCount = 0;
            } else {
                if (events.newListener !== undefined) {
                    emitter.emit("newListener", type, listener.listener ? listener.listener : listener);
                    events = emitter._events;
                }
                existing = events[type];
            }

            if (existing === undefined) {
                existing = events[type] = listener;
                ++emitter._eventsCount;
            } else {
                if (typeof existing === "function") {
                    existing = events[type] = prepend ? [listener, existing] : [existing, listener];
                } else if (prepend) {
                    existing.unshift(listener);
                } else {
                    existing.push(listener);
                }
                m = getMaxListeners(emitter);
                if (m > 0 && existing.length > m && !existing.warned) {
                    existing.warned = true;
                    const w = new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
                    w.name = "MaxListenersExceededWarning";
                    w.emitter = emitter;
                    w.type = type;
                    w.count = existing.length;
                    warn(w);
                }
            }
            return emitter;
        }

        EventEmitter.prototype.addListener = function(type, listener) {
            return addListener(this, type, listener, false);
        };

        EventEmitter.prototype.on = EventEmitter.prototype.addListener;

        EventEmitter.prototype.prependListener = function(type, listener) {
            return addListener(this, type, listener, true);
        };

        function onceWrapper() {
            if (!this.fired) {
                this.target.removeListener(this.type, this.wrapFn);
                this.fired = true;
                if (arguments.length === 0) return this.listener.call(this.target);
                return this.listener.apply(this.target, arguments);
            }
        }

        function createOnceWrapper(target, type, listener) {
            const state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
            const wrapped = onceWrapper.bind(state);
            wrapped.listener = listener;
            state.wrapFn = wrapped;
            return wrapped;
        }

        EventEmitter.prototype.once = function(type, listener) {
            checkListener(listener);
            this.on(type, createOnceWrapper(this, type, listener));
            return this;
        };

        EventEmitter.prototype.prependOnceListener = function(type, listener) {
            checkListener(listener);
            this.prependListener(type, createOnceWrapper(this, type, listener));
            return this;
        };

        EventEmitter.prototype.removeListener = function(type, listener) {
            let list, events, position, i, originalListener;
            checkListener(listener);
            events = this._events;
            if (events === undefined) return this;
            list = events[type];
            if (list === undefined) return this;

            if (list === listener || list.listener === listener) {
                if (--this._eventsCount === 0) {
                    this._events = objectCreate(null);
                } else {
                    delete events[type];
                    if (events.removeListener) this.emit("removeListener", type, list.listener || listener);
                }
            } else if (typeof list !== "function") {
                position = -1;
                for (i = list.length - 1; i >= 0; i--) {
                    if (list[i] === listener || list[i].listener === listener) {
                        originalListener = list[i].listener;
                        position = i;
                        break;
                    }
                }
                if (position < 0) return this;
                if (position === 0) list.shift();
                else spliceOne(list, position);
                if (list.length === 1) events[type] = list[0];
                if (events.removeListener !== undefined) this.emit("removeListener", type, originalListener || listener);
            }
            return this;
        };

        EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

        EventEmitter.prototype.removeAllListeners = function(type) {
            let listeners, events, i;
            events = this._events;
            if (events === undefined) return this;
            if (events.removeListener === undefined) {
                if (arguments.length === 0) {
                    this._events = objectCreate(null);
                    this._eventsCount = 0;
                } else if (events[type] !== undefined) {
                    if (--this._eventsCount === 0) this._events = objectCreate(null);
                    else delete events[type];
                }
                return this;
            }

            if (arguments.length === 0) {
                const keys = Object.keys(events);
                let key;
                for (i = 0; i < keys.length; ++i) {
                    key = keys[i];
                    if (key === "removeListener") continue;
                    this.removeAllListeners(key);
                }
                this.removeAllListeners("removeListener");
                this._events = objectCreate(null);
                this._eventsCount = 0;
                return this;
            }

            listeners = events[type];
            if (typeof listeners === "function") {
                this.removeListener(type, listeners);
            } else if (listeners !== undefined) {
                for (i = listeners.length - 1; i >= 0; i--) {
                    this.removeListener(type, listeners[i]);
                }
            }
            return this;
        };

        function _listeners(target, type, unwrap) {
            const events = target._events;
            if (events === undefined) return [];
            const evlistener = events[type];
            if (evlistener === undefined) return [];
            if (typeof evlistener === "function") return unwrap ? [evlistener.listener || evlistener] : [evlistener];
            return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
        }

        EventEmitter.prototype.listeners = function(type) {
            return _listeners(this, type, true);
        };

        EventEmitter.prototype.rawListeners = function(type) {
            return _listeners(this, type, false);
        };

        EventEmitter.listenerCount = function(emitter, type) {
            if (typeof emitter.listenerCount === "function") return emitter.listenerCount(type);
            return countListeners.call(emitter, type);
        };

        EventEmitter.prototype.listenerCount = countListeners;

        function countListeners(type) {
            const events = this._events;
            if (events !== undefined) {
                const evlistener = events[type];
                if (typeof evlistener === "function") return 1;
                if (evlistener !== undefined) return evlistener.length;
            }
            return 0;
        }

        EventEmitter.prototype.eventNames = function() {
            return this._eventsCount > 0 ? ownKeys(this._events) : [];
        };

        function arrayClone(arr, n) {
            const copy = new Array(n);
            for (let i = 0; i < n; ++i) copy[i] = arr[i];
            return copy;
        }

        function spliceOne(list, index) {
            for (; index + 1 < list.length; index++) list[index] = list[index + 1];
            list.pop();
        }

        function unwrapListeners(arr) {
            const res = new Array(arr.length);
            for (let i = 0; i < res.length; ++i) res[i] = arr[i].listener || arr[i];
            return res;
        }

        function onceEvent(emitter, name) {
            return new Promise(function(resolve, reject) {
                function errorListener(err) {
                    emitter.removeListener(name, resolver);
                    reject(err);
                }
                function resolver() {
                    if (typeof emitter.removeListener === "function") emitter.removeListener("error", errorListener);
                    resolve([].slice.call(arguments));
                }
                eventEvents(emitter, name, resolver, { once: true });
                if (name !== "error") {
                    addErrorHandler(emitter, errorListener, { once: true });
                }
            });
        }

        function addErrorHandler(emitter, handler, flags) {
            if (typeof emitter.on === "function") eventEvents(emitter, "error", handler, flags);
        }

        function eventEvents(emitter, type, listener, flags) {
            if (typeof emitter.on === "function") {
                if (flags.once) emitter.once(type, listener);
                else emitter.on(type, listener);
            } else if (typeof emitter.addEventListener === "function") {
                emitter.addEventListener(type, function handler(ev) {
                    if (flags.once) emitter.removeEventListener(type, handler);
                    listener(ev);
                });
            } else {
                throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
            }
        }
    });

    const EventEmitter = importModule(requireEventEmitter(), 1);

    // --- Ultraviolet Core Classes ---

    class HookEvent {
        #intercepted;
        #returnValue;
        constructor(data = {}, target = null, that = null) {
            this.#intercepted = false;
            this.#returnValue = null;
            this.data = data;
            this.target = target;
            this.that = that;
        }
        get intercepted() { return this.#intercepted; }
        get returnValue() { return this.#returnValue; }
        respondWith(val) {
            this.#returnValue = val;
            this.#intercepted = true;
        }
    }

    class DocumentHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.document = this.window.document;
            this.Document = this.window.Document || {};
            this.DOMParser = this.window.DOMParser || {};
            this.docProto = this.Document.prototype || {};
            this.domProto = this.DOMParser.prototype || {};
            this.title = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "title");
            this.cookie = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "cookie");
            this.referrer = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "referrer");
            this.domain = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "domain");
            this.documentURI = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "documentURI");
            this.write = this.docProto.write;
            this.writeln = this.docProto.writeln;
            this.querySelector = this.docProto.querySelector;
            this.querySelectorAll = this.docProto.querySelectorAll;
            this.parseFromString = this.domProto.parseFromString;
            this.URL = ctx.nativeMethods.getOwnPropertyDescriptor(this.docProto, "URL");
        }
        overrideParseFromString() {
            this.ctx.override(this.domProto, "parseFromString", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [str, type] = args;
                const event = new HookEvent({ string: str, type: type }, original, that);
                this.emit("parseFromString", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.string, event.data.type);
            });
        }
        overrideQuerySelector() {
            this.ctx.override(this.docProto, "querySelector", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [selectors] = args;
                const event = new HookEvent({ selectors: selectors }, original, that);
                this.emit("querySelector", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.selectors);
            });
        }
        overrideDomain() {
            this.ctx.overrideDescriptor(this.docProto, "domain", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getDomain", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setDomain", event);
                    return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.value);
                }
            });
        }
        overrideReferrer() {
            this.ctx.overrideDescriptor(this.docProto, "referrer", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("referrer", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideCreateTreeWalker() {
            this.ctx.override(this.docProto, "createTreeWalker", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [root, show = 4294967295, filter, expand] = args;
                const event = new HookEvent({ root, show, filter, expandEntityReferences: expand }, original, that);
                this.emit("createTreeWalker", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.root, event.data.show, event.data.filter, event.data.expandEntityReferences);
            });
        }
        overrideWrite() {
            const wrapWrite = (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [...html] = args;
                const event = new HookEvent({ html: html }, original, that);
                this.emit(original.name === "write" ? "write" : "writeln", event);
                return event.intercepted ? event.returnValue : event.target.apply(event.that, event.data.html);
            };
            this.ctx.override(this.docProto, "write", wrapWrite);
            this.ctx.override(this.docProto, "writeln", wrapWrite);
        }
        overrideDocumentURI() {
            this.ctx.overrideDescriptor(this.docProto, "documentURI", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("documentURI", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideURL() {
            this.ctx.overrideDescriptor(this.docProto, "URL", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("url", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideCookie() {
            this.ctx.overrideDescriptor(this.docProto, "cookie", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getCookie", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setCookie", event);
                    return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.value);
                }
            });
        }
        overrideTitle() {
            this.ctx.overrideDescriptor(this.docProto, "title", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getTitle", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setTitle", event);
                    return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.value);
                }
            });
        }
    }

    class ElementHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Audio = this.window.Audio;
            this.Element = this.window.Element;
            this.elemProto = this.Element ? this.Element.prototype : {};
            this.innerHTML = ctx.nativeMethods.getOwnPropertyDescriptor(this.elemProto, "innerHTML");
            this.outerHTML = ctx.nativeMethods.getOwnPropertyDescriptor(this.elemProto, "outerHTML");
            this.setAttribute = this.elemProto.setAttribute;
            this.getAttribute = this.elemProto.getAttribute;
            this.removeAttribute = this.elemProto.removeAttribute;
            this.hasAttribute = this.elemProto.hasAttribute;
            this.querySelector = this.elemProto.querySelector;
            this.querySelectorAll = this.elemProto.querySelectorAll;
            this.insertAdjacentHTML = this.elemProto.insertAdjacentHTML;
            this.insertAdjacentText = this.elemProto.insertAdjacentText;
        }
        overrideQuerySelector() {
            this.ctx.override(this.elemProto, "querySelector", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [selectors] = args;
                const event = new HookEvent({ selectors: selectors }, original, that);
                this.emit("querySelector", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.selectors);
            });
        }
        overrideAttribute() {
            this.ctx.override(this.elemProto, "getAttribute", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("getAttribute", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            this.ctx.override(this.elemProto, "setAttribute", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [name, val] = args;
                const event = new HookEvent({ name: name, value: val }, original, that);
                this.emit("setAttribute", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.value);
            });
            this.ctx.override(this.elemProto, "hasAttribute", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("hasAttribute", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            this.ctx.override(this.elemProto, "removeAttribute", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("removeAttribute", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
        }
        overrideAudio() {
            this.ctx.override(this.window, "Audio", (original, that, args) => {
                if (!args.length) return new original(...args);
                let [url] = args;
                const event = new HookEvent({ url: url }, original, that);
                this.emit("audio", event);
                return event.intercepted ? event.returnValue : new event.target(event.data.url);
            }, true);
        }
        overrideHtml() {
            this.hookProperty(this.Element, "innerHTML", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getInnerHTML", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setInnerHTML", event);
                    if (event.intercepted) return event.returnValue;
                    original.call(that, event.data.value);
                }
            });
            this.hookProperty(this.Element, "outerHTML", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getOuterHTML", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setOuterHTML", event);
                    if (event.intercepted) return event.returnValue;
                    original.call(that, event.data.value);
                }
            });
        }
        overrideInsertAdjacentHTML() {
            this.ctx.override(this.elemProto, "insertAdjacentHTML", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [pos, html] = args;
                const event = new HookEvent({ position: pos, html: html }, original, that);
                this.emit("insertAdjacentHTML", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.position, event.data.html);
            });
        }
        overrideInsertAdjacentText() {
            this.ctx.override(this.elemProto, "insertAdjacentText", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [pos, text] = args;
                const event = new HookEvent({ position: pos, text: text }, original, that);
                this.emit("insertAdjacentText", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.position, event.data.text);
            });
        }
        hookProperty(element, prop, hooks) {
            if (!element) return false;
            if (this.ctx.nativeMethods.isArray(element)) {
                for (let e of element) this.hookProperty(e, prop, hooks);
                return true;
            }
            this.ctx.overrideDescriptor(element.prototype, prop, hooks);
            return true;
        }
    }

    class NodeHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Node = ctx.window.Node || {};
            this.nodeProto = this.Node.prototype || {};
            this.compareDocumentPosition = this.nodeProto.compareDocumentPosition;
            this.contains = this.nodeProto.contains;
            this.insertBefore = this.nodeProto.insertBefore;
            this.replaceChild = this.nodeProto.replaceChild;
            this.append = this.nodeProto.append;
            this.appendChild = this.nodeProto.appendChild;
            this.removeChild = this.nodeProto.removeChild;
            this.textContent = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "textContent");
            this.parentNode = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "parentNode");
            this.parentElement = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "parentElement");
            this.childNodes = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "childNodes");
            this.baseURI = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "baseURI");
            this.previousSibling = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "previousSibling");
            this.ownerDocument = ctx.nativeMethods.getOwnPropertyDescriptor(this.nodeProto, "ownerDocument");
        }
        overrideTextContent() {
            this.ctx.overrideDescriptor(this.nodeProto, "textContent", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getTextContent", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setTextContent", event);
                    if (event.intercepted) return event.returnValue;
                    original.call(that, event.data.value);
                }
            });
        }
        overrideAppend() {
            this.ctx.override(this.nodeProto, "append", (original, that, [...nodes]) => {
                const event = new HookEvent({ nodes: nodes }, original, that);
                this.emit("append", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.nodes);
            });
            this.ctx.override(this.nodeProto, "appendChild", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [node] = args;
                const event = new HookEvent({ node: node }, original, that);
                this.emit("appendChild", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.node);
            });
        }
        overrideBaseURI() {
            this.ctx.overrideDescriptor(this.nodeProto, "baseURI", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("baseURI", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideParent() {
            this.ctx.overrideDescriptor(this.nodeProto, "parentNode", {
                get: (original, that) => {
                    const event = new HookEvent({ node: original.call(that) }, original, that);
                    this.emit("parentNode", event);
                    return event.intercepted ? event.returnValue : event.data.node;
                }
            });
            this.ctx.overrideDescriptor(this.nodeProto, "parentElement", {
                get: (original, that) => {
                    const event = new HookEvent({ element: original.call(that) }, original, that);
                    this.emit("parentElement", event);
                    return event.intercepted ? event.returnValue : event.data.node;
                }
            });
        }
        overrideOwnerDocument() {
            this.ctx.overrideDescriptor(this.nodeProto, "ownerDocument", {
                get: (original, that) => {
                    const event = new HookEvent({ document: original.call(that) }, original, that);
                    this.emit("ownerDocument", event);
                    return event.intercepted ? event.returnValue : event.data.document;
                }
            });
        }
        overrideCompareDocumentPosit1ion() {
            this.ctx.override(this.nodeProto, "compareDocumentPosition", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [node] = args;
                const event = new HookEvent({ node: node }, original, that);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.node);
            });
        }
        overrideChildMethods() {
            this.ctx.override(this.nodeProto, "removeChild");
        }
    }

    class AttrHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Attr = ctx.window.Attr || {};
            this.attrProto = this.Attr.prototype || {};
            this.value = ctx.nativeMethods.getOwnPropertyDescriptor(this.attrProto, "value");
            this.name = ctx.nativeMethods.getOwnPropertyDescriptor(this.attrProto, "name");
            this.getNamedItem = this.attrProto.getNamedItem || null;
            this.setNamedItem = this.attrProto.setNamedItem || null;
            this.removeNamedItem = this.attrProto.removeNamedItem || null;
            this.getNamedItemNS = this.attrProto.getNamedItemNS || null;
            this.setNamedItemNS = this.attrProto.setNamedItemNS || null;
            this.removeNamedItemNS = this.attrProto.removeNamedItemNS || null;
            this.item = this.attrProto.item || null;
        }
        overrideNameValue() {
            this.ctx.overrideDescriptor(this.attrProto, "name", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("name", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
            this.ctx.overrideDescriptor(this.attrProto, "value", {
                get: (original, that) => {
                    const event = new HookEvent({ name: this.name.get.call(that), value: original.call(that) }, original, that);
                    this.emit("getValue", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ name: this.name.get.call(that), value: val }, original, that);
                    this.emit("setValue", event);
                    if (event.intercepted) return event.returnValue;
                    event.target.call(event.that, event.data.value);
                }
            });
        }
        overrideItemMethods() {
            this.ctx.override(this.attrProto, "getNamedItem", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("getNamedItem", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            this.ctx.override(this.attrProto, "setNamedItem", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [name, val] = args;
                const event = new HookEvent({ name: name, value: val }, original, that);
                this.emit("setNamedItem", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.value);
            });
            this.ctx.override(this.attrProto, "removeNamedItem", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("removeNamedItem", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            this.ctx.override(this.attrProto, "item", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [index] = args;
                const event = new HookEvent({ index: index }, original, that);
                this.emit("item", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            // NS Methods
            this.ctx.override(this.attrProto, "getNamedItemNS", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [ns, local] = args;
                const event = new HookEvent({ namespace: ns, localName: local }, original, that);
                this.emit("getNamedItemNS", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.namespace, event.data.localName);
            });
            this.ctx.override(this.attrProto, "setNamedItemNS", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [attr] = args;
                const event = new HookEvent({ attr: attr }, original, that);
                this.emit("setNamedItemNS", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            this.ctx.override(this.attrProto, "removeNamedItemNS", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [ns, local] = args;
                const event = new HookEvent({ namespace: ns, localName: local }, original, that);
                this.emit("removeNamedItemNS", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.namespace, event.data.localName);
            });
        }
    }

    class FunctionHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Function = this.window.Function;
            this.fnProto = this.Function.prototype;
            this.toString = this.fnProto.toString;
            this.fnStrings = ctx.fnStrings;
            this.call = this.fnProto.call;
            this.apply = this.fnProto.apply;
            this.bind = this.fnProto.bind;
        }
        overrideFunction() {
            this.ctx.override(this.window, "Function", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let script = args[args.length - 1];
                let fnArgs = [];
                for (let i = 0; i < args.length - 1; i++) fnArgs.push(args[i]);
                const event = new HookEvent({ script: script, args: fnArgs }, original, that);
                this.emit("function", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, ...event.data.args, event.data.script);
            }, true);
        }
        overrideToString() {
            this.ctx.override(this.fnProto, "toString", (original, that) => {
                const event = new HookEvent({ fn: that }, original, that);
                this.emit("toString", event);
                return event.intercepted ? event.returnValue : event.target.call(event.data.fn);
            });
        }
    }

    class ObjectHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Object = this.window.Object;
            this.getOwnPropertyDescriptors = this.Object.getOwnPropertyDescriptors;
            this.getOwnPropertyDescriptor = this.Object.getOwnPropertyDescriptor;
            this.getOwnPropertyNames = this.Object.getOwnPropertyNames;
        }
        overrideGetPropertyNames() {
            this.ctx.override(this.Object, "getOwnPropertyNames", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [obj] = args;
                const event = new HookEvent({ names: original.call(that, obj) }, original, that);
                this.emit("getOwnPropertyNames", event);
                return event.intercepted ? event.returnValue : event.data.names;
            });
        }
        overrideGetOwnPropertyDescriptors() {
            this.ctx.override(this.Object, "getOwnPropertyDescriptors", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [obj] = args;
                const event = new HookEvent({ descriptors: original.call(that, obj) }, original, that);
                this.emit("getOwnPropertyDescriptors", event);
                return event.intercepted ? event.returnValue : event.data.descriptors;
            });
        }
    }

    class FetchHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.fetch = this.window.fetch;
            this.Request = this.window.Request;
            this.Response = this.window.Response;
            this.Headers = this.window.Headers;
            this.reqProto = this.Request ? this.Request.prototype : {};
            this.resProto = this.Response ? this.Response.prototype : {};
            this.headersProto = this.Headers ? this.Headers.prototype : {};
            this.reqUrl = ctx.nativeMethods.getOwnPropertyDescriptor(this.reqProto, "url");
            this.resUrl = ctx.nativeMethods.getOwnPropertyDescriptor(this.resProto, "url");
            this.reqHeaders = ctx.nativeMethods.getOwnPropertyDescriptor(this.reqProto, "headers");
            this.resHeaders = ctx.nativeMethods.getOwnPropertyDescriptor(this.resProto, "headers");
        }
        override() {
            return this.overrideRequest(), this.overrideUrl(), this.overrideHeaders(), true;
        }
        overrideRequest() {
            if (!this.fetch) return false;
            this.ctx.override(this.window, "fetch", (original, that, args) => {
                if (!args.length || args[0] instanceof this.Request) return original.apply(that, args);
                let [input, options = {}] = args;
                const event = new HookEvent({ input, options }, original, that);
                this.emit("request", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.input, event.data.options);
            });
            this.ctx.override(this.window, "Request", (original, that, args) => {
                if (!args.length) return new original(...args);
                let [input, options = {}] = args;
                const event = new HookEvent({ input, options }, original);
                this.emit("request", event);
                return event.intercepted ? event.returnValue : new event.target(event.data.input, event.data.options);
            }, true);
            return true;
        }
        overrideUrl() {
            this.ctx.overrideDescriptor(this.reqProto, "url", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("requestUrl", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
            this.ctx.overrideDescriptor(this.resProto, "url", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("responseUrl", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
            return true;
        }
        overrideHeaders() {
            if (!this.Headers) return false;
            this.ctx.overrideDescriptor(this.reqProto, "headers", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("requestHeaders", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
            this.ctx.overrideDescriptor(this.resProto, "headers", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("responseHeaders", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
            this.ctx.override(this.headersProto, "get", (original, that, [name]) => {
                if (!name) return original.call(that);
                const event = new HookEvent({ name, value: original.call(that, name) }, original, that);
                this.emit("getHeader", event);
                return event.intercepted ? event.returnValue : event.data.value;
            });
            this.ctx.override(this.headersProto, "set", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [name, val] = args;
                const event = new HookEvent({ name, value: val }, original, that);
                this.emit("setHeader", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.value);
            });
            this.ctx.override(this.headersProto, "has", (original, that, args) => {
                if (!args.length) return original.call(that);
                let [name] = args;
                const event = new HookEvent({ name, value: original.call(that, name) }, original, that);
                this.emit("hasHeader", event);
                return event.intercepted ? event.returnValue : event.data;
            });
            this.ctx.override(this.headersProto, "append", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [name, val] = args;
                const event = new HookEvent({ name, value: val }, original, that);
                this.emit("appendHeader", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.value);
            });
            this.ctx.override(this.headersProto, "delete", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name }, original, that);
                this.emit("deleteHeader", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name);
            });
            return true;
        }
    }

    class XhrHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.XMLHttpRequest = this.window.XMLHttpRequest;
            this.xhrProto = this.XMLHttpRequest ? this.XMLHttpRequest.prototype : {};
            this.open = this.xhrProto.open;
            this.abort = this.xhrProto.abort;
            this.send = this.xhrProto.send;
            this.overrideMimeType = this.xhrProto.overrideMimeType;
            this.getAllResponseHeaders = this.xhrProto.getAllResponseHeaders;
            this.getResponseHeader = this.xhrProto.getResponseHeader;
            this.setRequestHeader = this.xhrProto.setRequestHeader;
            this.responseURL = ctx.nativeMethods.getOwnPropertyDescriptor(this.xhrProto, "responseURL");
            this.responseText = ctx.nativeMethods.getOwnPropertyDescriptor(this.xhrProto, "responseText");
        }
        override() {
            this.overrideOpen();
            this.overrideSend();
            this.overrideMimeTypeHook();
            this.overrideGetResHeader();
            this.overrideGetResHeaders();
            this.overrideSetReqHeader();
        }
        overrideOpen() {
            this.ctx.override(this.xhrProto, "open", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [method, input, async = true, user = null, password = null] = args;
                const event = new HookEvent({ method, input, async, user, password }, original, that);
                this.emit("open", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.method, event.data.input, event.data.async, event.data.user, event.data.password);
            });
        }
        overrideResponseUrl() {
            this.ctx.overrideDescriptor(this.xhrProto, "responseURL", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("responseUrl", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideSend() {
            this.ctx.override(this.xhrProto, "send", (original, that, [body = null]) => {
                const event = new HookEvent({ body: body }, original, that);
                this.emit("send", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.body);
            });
        }
        overrideSetReqHeader() {
            this.ctx.override(this.xhrProto, "setRequestHeader", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [name, val] = args;
                const event = new HookEvent({ name, value: val }, original, that);
                this.emit("setReqHeader", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.value);
            });
        }
        overrideGetResHeaders() {
            this.ctx.override(this.xhrProto, "getAllResponseHeaders", (original, that) => {
                const event = new HookEvent({ value: original.call(that) }, original, that);
                this.emit("getAllResponseHeaders", event);
                return event.intercepted ? event.returnValue : event.data.value;
            });
        }
        overrideGetResHeader() {
            this.ctx.override(this.xhrProto, "getResponseHeader", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name] = args;
                const event = new HookEvent({ name: name, value: original.call(that, name) }, original, that);
                return event.intercepted ? event.returnValue : event.data.value;
            });
        }
        overrideMimeTypeHook() {
            // Placeholder for the original overrideMimeType if needed
        }
    }

    class EventSourceHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.EventSource = this.window.EventSource || {};
            this.esProto = this.EventSource.prototype || {};
            this.url = ctx.nativeMethods.getOwnPropertyDescriptor(this.esProto, "url");
            this.CONNECTING = 0;
            this.OPEN = 1;
            this.CLOSED = 2;
        }
        overrideConstruct() {
            this.ctx.override(this.window, "EventSource", (original, that, args) => {
                if (!args.length) return new original(...args);
                let [url, config = {}] = args;
                const event = new HookEvent({ url, config }, original, that);
                this.emit("construct", event);
                return event.intercepted ? event.returnValue : new event.target(event.data.url, event.data.config);
            }, true);
            if ("EventSource" in this.window) {
                this.window.EventSource.CONNECTING = this.CONNECTING;
                this.window.EventSource.OPEN = this.OPEN;
                this.window.EventSource.CLOSED = this.CLOSED;
            }
        }
        overrideUrl() {
            this.ctx.overrideDescriptor(this.esProto, "url", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("url", event);
                    return event.data.value;
                }
            });
        }
    }

    class HistoryHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.History = this.window.History;
            this.history = this.window.history;
            this.historyProto = this.History ? this.History.prototype : {};
            this.pushState = this.historyProto.pushState;
            this.replaceState = this.historyProto.replaceState;
            this.go = this.historyProto.go;
            this.back = this.historyProto.back;
            this.forward = this.historyProto.forward;
        }
        override() {
            this.overridePushState();
            this.overrideReplaceState();
            this.overrideGo();
            this.overrideForward();
            this.overrideBack();
        }
        overridePushState() {
            this.ctx.override(this.historyProto, "pushState", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [state, title, url = ""] = args;
                const event = new HookEvent({ state, title, url }, original, that);
                this.emit("pushState", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.state, event.data.title, event.data.url);
            });
        }
        overrideReplaceState() {
            this.ctx.override(this.historyProto, "replaceState", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [state, title, url = ""] = args;
                const event = new HookEvent({ state, title, url }, original, that);
                this.emit("replaceState", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.state, event.data.title, event.data.url);
            });
        }
        overrideGo() {
            this.ctx.override(this.historyProto, "go", (original, that, [delta]) => {
                const event = new HookEvent({ delta: delta }, original, that);
                this.emit("go", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.delta);
            });
        }
        overrideForward() {
            this.ctx.override(this.historyProto, "forward", (original, that) => {
                const event = new HookEvent(null, original, that);
                this.emit("forward", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that);
            });
        }
        overrideBack() {
            this.ctx.override(this.historyProto, "back", (original, that) => {
                const event = new HookEvent(null, original, that);
                this.emit("back", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that);
            });
        }
    }

    class LocationHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.location = this.window.location;
            this.WorkerLocation = ctx.worker ? this.window.WorkerLocation : null;
            this.workerLocProto = this.WorkerLocation ? this.WorkerLocation.prototype : {};
            this.keys = ["href", "protocol", "host", "hostname", "port", "pathname", "search", "hash", "origin"];
            this.HashChangeEvent = this.window.HashChangeEvent || null;
            this.href = this.WorkerLocation ? ctx.nativeMethods.getOwnPropertyDescriptor(this.workerLocProto, "href") : ctx.nativeMethods.getOwnPropertyDescriptor(this.location, "href");
        }
        overrideWorkerLocation(mapFn) {
            if (!this.WorkerLocation) return false;
            for (let key of this.keys) {
                this.ctx.overrideDescriptor(this.workerLocProto, key, {
                    get: () => mapFn(this.href.get.call(this.location))[key]
                });
            }
            return true;
        }
        emulate(mapFn, wrapUrlFn) {
            let emulated = {};
            const self = this;
            for (let key of self.keys) {
                this.ctx.nativeMethods.defineProperty(emulated, key, {
                    get() { return mapFn(self.href.get.call(self.location))[key]; },
                    set: key !== "origin" ? function(val) {
                        switch (key) {
                            case "href": self.location.href = wrapUrlFn(val); break;
                            case "hash":
                                self.emit("hashchange", emulated.href, val.trim().startsWith("#") ? new URL(val.trim(), emulated.href).href : new URL("#" + val.trim(), emulated.href).href, self);
                                break;
                            default: {
                                let u = new URL(emulated.href);
                                u[key] = val;
                                self.location.href = wrapUrlFn(u.href);
                            } break;
                        }
                    } : undefined,
                    configurable: false,
                    enumerable: true
                });
            }
            if ("reload" in this.location) {
                this.ctx.nativeMethods.defineProperty(emulated, "reload", {
                    value: this.ctx.wrap(this.location, "reload", (original, that) => original.call(that === emulated ? this.location : that)),
                    writable: false,
                    enumerable: true
                });
            }
            if ("replace" in this.location) {
                this.ctx.nativeMethods.defineProperty(emulated, "replace", {
                    value: this.ctx.wrap(this.location, "replace", (original, that, args) => {
                        if (!args.length || that !== emulated) return original.call(that);
                        let [url] = args;
                        let u = new URL(url, emulated.href);
                        return original.call(this.location, wrapUrlFn(u.href));
                    }),
                    writable: false,
                    enumerable: true
                });
            }
            if ("assign" in this.location) {
                this.ctx.nativeMethods.defineProperty(emulated, "assign", {
                    value: this.ctx.wrap(this.location, "assign", (original, that, args) => {
                        if (!args.length || that !== emulated) return original.call(that);
                        let [url] = args;
                        let u = new URL(url, emulated.href);
                        return original.call(this.location, wrapUrlFn(u.href));
                    }),
                    writable: false,
                    enumerable: true
                });
            }
            if ("ancestorOrigins" in this.location) {
                this.ctx.nativeMethods.defineProperty(emulated, "ancestorOrigins", {
                    get() {
                        let list = [];
                        if (self.window.DOMStringList) self.ctx.nativeMethods.setPrototypeOf(list, self.window.DOMStringList.prototype);
                        return list;
                    },
                    set: undefined,
                    enumerable: true
                });
            }
            this.ctx.nativeMethods.defineProperty(emulated, "toString", {
                value: this.ctx.wrap(this.location, "toString", () => emulated.href),
                enumerable: true,
                writable: false
            });
            this.ctx.nativeMethods.defineProperty(emulated, Symbol.toPrimitive, {
                value: () => emulated.href,
                writable: false,
                enumerable: false
            });
            if (this.ctx.window.Location) this.ctx.nativeMethods.setPrototypeOf(emulated, this.ctx.window.Location.prototype);
            return emulated;
        }
    }

    class MessageHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.postMessage = this.window.postMessage;
            this.MessageEvent = this.window.MessageEvent || {};
            this.MessagePort = this.window.MessagePort || {};
            this.mpProto = this.MessagePort.prototype || {};
            this.mpPostMessage = this.mpProto.postMessage;
            this.messageProto = this.MessageEvent.prototype || {};
            this.messageData = ctx.nativeMethods.getOwnPropertyDescriptor(this.messageProto, "data");
            this.messageOrigin = ctx.nativeMethods.getOwnPropertyDescriptor(this.messageProto, "origin");
        }
        overridePostMessage() {
            this.ctx.override(this.window, "postMessage", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let msg, origin, transfer;
                if (this.ctx.worker) {
                    [msg, transfer = []] = args;
                } else {
                    [msg, origin, transfer = []] = args;
                }
                const event = new HookEvent({ message: msg, origin, transfer, worker: this.ctx.worker }, original, that);
                this.emit("postMessage", event);
                if (event.intercepted) return event.returnValue;
                return this.ctx.worker ?
                    event.target.call(event.that, event.data.message, event.data.transfer) :
                    event.target.call(event.that, event.data.message, event.data.origin, event.data.transfer);
            });
        }
        wrapPostMessage(obj, key, isWorker = false) {
            return this.ctx.wrap(obj, key, (original, that, args) => {
                if (this.ctx.worker ? !args.length : args.length < 2) return original.apply(that, args);
                let msg, origin, transfer;
                if (isWorker) {
                    [msg, transfer = []] = args;
                    origin = null;
                } else {
                    [msg, origin, transfer = []] = args;
                }
                const event = new HookEvent({ message: msg, origin, transfer, worker: this.ctx.worker }, original, obj);
                this.emit("postMessage", event);
                if (event.intercepted) return event.returnValue;
                return isWorker ?
                    event.target.call(event.that, event.data.message, event.data.transfer) :
                    event.target.call(event.that, event.data.message, event.data.origin, event.data.transfer);
            });
        }
        overrideMessageOrigin() {
            this.ctx.overrideDescriptor(this.messageProto, "origin", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("origin", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
        overrideMessageData() {
            this.ctx.overrideDescriptor(this.messageProto, "data", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("data", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
    }

    class NavigatorHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.navigator = this.window.navigator;
            this.Navigator = this.window.Navigator || {};
            this.navProto = this.Navigator.prototype || {};
            this.sendBeacon = this.navProto.sendBeacon;
        }
        overrideSendBeacon() {
            this.ctx.override(this.navProto, "sendBeacon", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [url, data = ""] = args;
                const event = new HookEvent({ url, data }, original, that);
                this.emit("sendBeacon", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.url, event.data.data);
            });
        }
    }

    class WorkerHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.Worker = this.window.Worker || {};
            this.Worklet = this.window.Worklet || {};
            this.workletProto = this.Worklet.prototype || {};
            this.workerProto = this.Worker.prototype || {};
            this.postMessage = this.workerProto.postMessage;
            this.terminate = this.workerProto.terminate;
            this.addModule = this.workletProto.addModule;
        }
        overrideWorker() {
            this.ctx.override(this.window, "Worker", (original, that, args) => {
                if (!args.length) return new original(...args);
                let [url, options = {}] = args;
                const event = new HookEvent({ url, options }, original, that);
                this.emit("worker", event);
                return event.intercepted ? event.returnValue : new event.target(event.data.url, event.data.options);
            }, true);
        }
        overrideAddModule() {
            this.ctx.override(this.workletProto, "addModule", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [url, options = {}] = args;
                const event = new HookEvent({ url, options }, original, that);
                this.emit("addModule", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.url, event.data.options);
            });
        }
        overridePostMessage() {
            this.ctx.override(this.workerProto, "postMessage", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [msg, transfer = []] = args;
                const event = new HookEvent({ message: msg, transfer }, original, that);
                this.emit("postMessage", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.message, event.data.transfer);
            });
        }
        overrideImportScripts() {
            this.ctx.override(this.window, "importScripts", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                const event = new HookEvent({ scripts: args }, original, that);
                this.emit("importScripts", event);
                return event.intercepted ? event.returnValue : event.target.apply(event.that, event.data.scripts);
            });
        }
    }

    class UrlHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.URL = this.window.URL || {};
            this.createObjectURL = this.URL.createObjectURL;
            this.revokeObjectURL = this.URL.revokeObjectURL;
        }
        overrideObjectURL() {
            this.ctx.override(this.URL, "createObjectURL", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [obj] = args;
                const event = new HookEvent({ object: obj }, original, that);
                this.emit("createObjectURL", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.object);
            });
            this.ctx.override(this.URL, "revokeObjectURL", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [url] = args;
                const event = new HookEvent({ url: url }, original, that);
                this.emit("revokeObjectURL", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.url);
            });
        }
    }

    class StorageHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.localStorage = this.window.localStorage || null;
            this.sessionStorage = this.window.sessionStorage || null;
            this.Storage = this.window.Storage || {};
            this.storeProto = this.Storage.prototype || {};
            this.getItem = this.storeProto.getItem || null;
            this.setItem = this.storeProto.setItem || null;
            this.removeItem = this.storeProto.removeItem || null;
            this.clear = this.storeProto.clear || null;
            this.key = this.storeProto.key || null;
            this.methods = ["key", "getItem", "setItem", "removeItem", "clear"];
            this.wrappers = new ctx.nativeMethods.Map();
        }
        overrideMethods() {
            const wrapStorage = (original, that, args, type) => {
                const targetStore = this.wrappers.get(that) || that;
                if (!args.length && type !== "clear") return original.apply(targetStore, args);
                let data = type === "clear" ? null : (type === "key" ? { index: args[0] } : { name: args[0] });
                if (type === "setItem") data.value = args[1];
                const event = new HookEvent(data, original, targetStore);
                this.emit(type, event);
                if (event.intercepted) return event.returnValue;
                return type === "setItem" ?
                    event.target.call(event.that, event.data.name, event.data.value) :
                    (type === "clear" ? event.target.call(event.that) : event.target.call(event.that, event.data.name || event.data.index));
            };
            this.ctx.override(this.storeProto, "getItem", (o, t, a) => wrapStorage(o, t, a, "getItem"));
            this.ctx.override(this.storeProto, "setItem", (o, t, a) => wrapStorage(o, t, a, "setItem"));
            this.ctx.override(this.storeProto, "removeItem", (o, t, a) => wrapStorage(o, t, a, "removeItem"));
            this.ctx.override(this.storeProto, "clear", (o, t, a) => wrapStorage(o, t, a, "clear"));
            this.ctx.override(this.storeProto, "key", (o, t, a) => wrapStorage(o, t, a, "key"));
        }
        overrideLength() {
            this.ctx.overrideDescriptor(this.storeProto, "length", {
                get: (original, that) => {
                    const targetStore = this.wrappers.get(that) || that;
                    const event = new HookEvent({ length: original.call(targetStore) }, original, targetStore);
                    this.emit("length", event);
                    return event.intercepted ? event.returnValue : event.data.length;
                }
            });
        }
        emulate(storage, emulated = {}) {
            this.ctx.nativeMethods.setPrototypeOf(emulated, this.storeProto);
            const proxy = new this.ctx.window.Proxy(emulated, {
                get: (target, prop) => {
                    if (prop in this.storeProto || typeof prop === "symbol") return storage[prop];
                    const event = new HookEvent({ name: prop }, null, storage);
                    this.emit("get", event);
                    return event.intercepted ? event.returnValue : storage[event.data.name];
                },
                set: (target, prop, val) => {
                    if (prop in this.storeProto || typeof prop === "symbol") return storage[prop] = val;
                    const event = new HookEvent({ name: prop, value: val }, null, storage);
                    this.emit("set", event);
                    return event.intercepted ? event.returnValue : storage[event.data.name] = event.data.value;
                },
                deleteProperty: (target, prop) => {
                    if (typeof prop === "symbol") return delete storage[prop];
                    const event = new HookEvent({ name: prop }, null, storage);
                    this.emit("delete", event);
                    return event.intercepted ? event.returnValue : delete storage[event.data.name];
                }
            });
            this.wrappers.set(proxy, storage);
            this.ctx.nativeMethods.setPrototypeOf(proxy, this.storeProto);
            return proxy;
        }
    }

    class StyleHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.CSSStyleDeclaration = this.window.CSSStyleDeclaration || {};
            this.cssStyleProto = this.CSSStyleDeclaration.prototype || {};
            this.getPropertyValue = this.cssStyleProto.getPropertyValue || null;
            this.setProperty = this.cssStyleProto.setProperty || null;
            this.urlProps = ["background", "backgroundImage", "borderImage", "borderImageSource", "listStyle", "listStyleImage", "cursor"];
            this.dashedUrlProps = ["background", "background-image", "border-image", "border-image-source", "list-style", "list-style-image", "cursor"];
            this.propToDashed = {
                background: "background",
                backgroundImage: "background-image",
                borderImage: "border-image",
                borderImageSource: "border-image-source",
                listStyle: "list-style",
                listStyleImage: "list-style-image",
                cursor: "cursor"
            };
        }
        overrideSetGetProperty() {
            this.ctx.override(this.cssStyleProto, "getPropertyValue", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [prop] = args;
                const event = new HookEvent({ property: prop }, original, that);
                this.emit("getPropertyValue", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.property);
            });
            this.ctx.override(this.cssStyleProto, "setProperty", (original, that, args) => {
                if (args.length < 2) return original.apply(that, args);
                let [prop, val] = args;
                const event = new HookEvent({ property: prop, value: val }, original, that);
                this.emit("setProperty", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.property, event.data.value);
            });
        }
        overrideCssText() {
            this.ctx.overrideDescriptor(this.cssStyleProto, "cssText", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("getCssText", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                },
                set: (original, that, [val]) => {
                    const event = new HookEvent({ value: val }, original, that);
                    this.emit("setCssText", event);
                    return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.value);
                }
            });
        }
    }

    class IDBHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.IDBDatabase = this.window.IDBDatabase || {};
            this.idbDatabaseProto = this.IDBDatabase.prototype || {};
            this.IDBFactory = this.window.IDBFactory || {};
            this.idbFactoryProto = this.IDBFactory.prototype || {};
            this.open = this.idbFactoryProto.open;
        }
        overrideOpen() {
            this.ctx.override(this.idbFactoryProto, "open", (original, that, args) => {
                if (!args.length) return original.apply(that, args);
                let [name, version] = args;
                const event = new HookEvent({ name, version }, original, that);
                this.emit("idbFactoryOpen", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.name, event.data.version);
            });
        }
        overrideName() {
            this.ctx.overrideDescriptor(this.idbDatabaseProto, "name", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("idbFactoryName", event);
                    return event.intercepted ? event.returnValue : event.data.value;
                }
            });
        }
    }

    class WebSocketHook extends EventEmitter.default {
        constructor(ctx) {
            super();
            this.ctx = ctx;
            this.window = ctx.window;
            this.WebSocket = this.window.WebSocket || {};
            this.wsProto = this.WebSocket.prototype || {};
            this.url = ctx.nativeMethods.getOwnPropertyDescriptor(this.wsProto, "url");
            this.protocol = ctx.nativeMethods.getOwnPropertyDescriptor(this.wsProto, "protocol");
            this.readyState = ctx.nativeMethods.getOwnPropertyDescriptor(this.wsProto, "readyState");
            this.send = this.wsProto.send;
            this.CONNECTING = WebSocket.CONNECTING;
            this.OPEN = WebSocket.OPEN;
            this.CLOSING = WebSocket.CLOSING;
            this.CLOSED = WebSocket.CLOSED;
        }
        overrideWebSocket() {
            this.ctx.override(this.window, "WebSocket", (original, that, args) => {
                if (!args.length) return new original(...args);
                const event = new HookEvent({ args: args }, original, that);
                this.emit("websocket", event);
                return event.intercepted ? event.returnValue : new event.target(event.data.url, event.data.protocols);
            }, true);
            this.window.WebSocket.CONNECTING = this.CONNECTING;
            this.window.WebSocket.OPEN = this.OPEN;
            this.window.WebSocket.CLOSING = this.CLOSING;
            this.window.WebSocket.CLOSED = this.CLOSED;
        }
        overrideURL() {
            this.ctx.overrideDescriptor(this.wsProto, "url", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("url", event);
                    return event.data.value;
                }
            });
        }
        overrideProtocol() {
            this.ctx.overrideDescriptor(this.wsProto, "protocol", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("protocol", event);
                    return event.data.value;
                }
            });
        }
        overrideReadyState() {
            this.ctx.overrideDescriptor(this.wsProto, "readyState", {
                get: (original, that) => {
                    const event = new HookEvent({ value: original.call(that) }, original, that);
                    this.emit("readyState", event);
                    return event.data.value;
                }
            });
        }
        overrideSend() {
            this.ctx.override(this.wsProto, "send", (original, that, args) => {
                const event = new HookEvent({ args: args }, original, that);
                this.emit("send", event);
                return event.intercepted ? event.returnValue : event.target.call(event.that, event.data.args);
            });
        }
    }

    // --- Ultraviolet Client Context ---

    class UltravioletClient extends EventEmitter.default {
        constructor(windowObj = self, bareClient, isWorker = !windowObj.window) {
            super();
            this.window = windowObj;
            this.nativeMethods = {
                fnToString: this.window.Function.prototype.toString,
                defineProperty: this.window.Object.defineProperty,
                getOwnPropertyDescriptor: this.window.Object.getOwnPropertyDescriptor,
                getOwnPropertyDescriptors: this.window.Object.getOwnPropertyDescriptors,
                getOwnPropertyNames: this.window.Object.getOwnPropertyNames,
                keys: this.window.Object.keys,
                getOwnPropertySymbols: this.window.Object.getOwnPropertySymbols,
                isArray: this.window.Array.isArray,
                setPrototypeOf: this.window.Object.setPrototypeOf,
                isExtensible: this.window.Object.isExtensible,
                Map: this.window.Map,
                Proxy: this.window.Proxy
            };
            this.worker = isWorker;
            this.bareClient = bareClient;

            // 各種フッククラスのインスタンス化
            this.fetch = new FetchHook(this);
            this.xhr = new XhrHook(this);
            this.idb = new IDBHook(this);
            this.history = new HistoryHook(this);
            this.element = new ElementHook(this);
            this.node = new NodeHook(this);
            this.document = new DocumentHook(this);
            this.function = new FunctionHook(this);
            this.object = new ObjectHook(this);
            this.websocket = new WebSocketHook(this);
            this.message = new MessageHook(this);
            this.navigator = new NavigatorHook(this);
            this.eventSource = new EventSourceHook(this);
            this.attribute = new AttrHook(this);
            this.url = new UrlHook(this);
            this.workers = new WorkerHook(this);
            this.location = new LocationHook(this);
            this.storage = new StorageHook(this);
            this.style = new StyleHook(this);
        }

        override(obj, key, wrapper, isConstructor) {
            const wrapped = this.wrap(obj, key, wrapper, isConstructor);
            obj[key] = wrapped;
            return wrapped;
        }

        overrideDescriptor(obj, key, hooks = {}) {
            const descriptor = this.wrapDescriptor(obj, key, hooks);
            if (descriptor) {
                this.nativeMethods.defineProperty(obj, key, descriptor);
                return descriptor;
            }
            return {};
        }

        wrap(obj, key, wrapper, isConstructor = false) {
            const original = obj[key];
            if (!original) return original;

            let wrapped = "prototype" in original ?
                function() { return wrapper(original, this, [...arguments]); } :
                { attach() { return wrapper(original, this, [...arguments]); } }.attach;

            if (isConstructor) {
                wrapped.prototype = original.prototype;
                wrapped.prototype.constructor = wrapped;
            }

            this.emit("wrap", original, wrapped, isConstructor);
            return wrapped;
        }

        wrapDescriptor(obj, key, hooks = {}) {
            const descriptor = this.nativeMethods.getOwnPropertyDescriptor(obj, key);
            if (!descriptor) return false;

            for (let hookKey in hooks) {
                if (hookKey in descriptor) {
                    if (hookKey === "get" || hookKey === "set") {
                        descriptor[hookKey] = this.wrap(descriptor, hookKey, hooks[hookKey]);
                    } else {
                        descriptor[hookKey] = typeof hooks[hookKey] === "function" ? hooks[hookKey](descriptor[hookKey]) : hooks[hookKey];
                    }
                }
            }
            return descriptor;
        }
    }

    // グローバルへの登録
    if (typeof self === "object") {
        self.UVClient = UltravioletClient;
    }
})();
