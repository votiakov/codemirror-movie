CodeMirror.scenario = (function() {
	var STATE_IDLE  = 0;
	var STATE_PLAY  = 1;
	var STATE_PAUSE = 2;
	
	// Regular expression used to split event strings
	var eventSplitter = /\s+/;
	
	// Create a local reference to slice/splice.
	var slice = Array.prototype.slice;
	
	var defaultOptions = {
		beforeDelay: 1000,
		afterDelay: 1000
	};
	
	// detect CSS 3D Transforms for smoother animations 
	var has3d = (function() {
		var el = document.createElement('div');
		var cssTransform = prefixed('transform');
		if (cssTransform) {
			el.style[cssTransform] = 'translateZ(0)';
			return /translatez/i.test(el.style[cssTransform]); 
		}
		
		return false;
	})();
	
	// borrow CSS prefix detection from Modernizr
	function prefixed(prop) {
		var prefixes = ['Webkit', 'Moz', 'O', 'ms'];
		var ucProp = prop.charAt(0).toUpperCase() + prop.slice(1);
		var props = (prop + ' ' + prefixes.join(ucProp + ' ') + ucProp).split(' ');
		var el = document.createElement('div');
		for (var i in props) {
			var prop = props[i];
			if (el.style[prop] !== undefined) {
				return prop;
			}
		}

		return null;
	}
	
	var actionsDefinition = {
		/**
		 * Type-in passed text into current editor char-by-char
		 * @param {Object} options Current options
		 * @param {CodeMirror} editor Editor instance where action should be 
		 * performed
		 * @param {Function} next Function to call when action performance
		 * is completed
		 * @param {Function} timer Function that creates timer for delayed 
		 * execution. This timer will automatically delay execution when
		 * scenario is paused and revert when played again 
		 */
		'type': function(options, editor, next, timer) {
			options = makeOptions(options, 'text', {
				text: '',  // text to type
				delay: 60, // delay between character typing
				pos: null  // initial position where to start typing
			});
			
			if (!options.text)
				throw 'No text provided for "type" action';
			
			if (options.pos !== null) {
				editor.setCursor(makePos(options.pos, editor));
			}
			
			var chars = options.text.split('');
			
			timer(function perform() {
				var ch = chars.shift();
				editor.replaceSelection(ch, 'end');
				if (chars.length)
					timer(perform, options.delay);
				else
					next();
			}, options.delay);
		},
		
		/**
		 * Wait for a specified timeout
		 * @param options
		 * @param editor
		 * @param next
		 * @param timer
		 */
		'wait': function(options, editor, next, timer) {
			options = makeOptions(options, 'timeout', {
				timeout: 100
			});
			
			timer(next, parseInt(options.timeout));
		},
		
		/**
		 * Move caret to a specified position
		 */
		'moveTo': function(options, editor, next, timer) {
			options = makeOptions(options, 'pos', {
				delay: 80,
				immediate: false
			});
			
			if (!options.pos) {
				throw 'No position specified for "moveTo" action';
			}
			
			var curPos = editor.getCursor(true);
			var targetPos = makePos(options.pos);
			
			if (options.immediate) {
				editor.setCursor(targetPos);
				next();
			}
			
			var deltaLine = targetPos.line - curPos.line;
			var deltaChar = targetPos.ch - curPos.ch;
			var steps = Math.max(deltaChar, deltaLine);
			var stepLine = deltaLine / steps;
			var stepChar = deltaChar / steps;
			timer(function perform() {
				if (steps > 0) {
					curPos.line += stepLine;
					curPos.ch += stepChar;
					editor.setCursor({
						line: Math.round(curPos.line),
						ch: Math.round(curPos.ch)
					});
					steps--;
					timer(perform, options.delay);
				} else {
					next();
				}
			}, options.delay);
		},

		/**
		 * Similar to "moveTo" function but with immediate cursor position update
		 */
		'jumpTo': function(options, editor, next, timer) {
			options = makeOptions(options, 'pos', {
				afterDelay: 200
			});

			if (!options.pos) {
				throw 'No position specified for "jumpTo" action';
			}
			
			editor.setCursor(makePos(options.pos));
			timer(next, options.afterDelay);
		},
		
		/**
		 * Executes predefined CodeMirror command
		 * @param {Object} options
		 * @param {CodeMirror} editor
		 * @param {Function} next
		 * @param {Function} timer
		 */
		'run': function(options, editor, next, timer) {
			options = makeOptions(options, 'command', {
				beforeDelay: 0
			});
			
			timer(function() {
				try {
					editor.execCommand(options.command);
				} catch (e) {}
				next();
			}, options.beforeDelay);
		},
		
		/**
		 * Creates selection for specified position
		 * @param {Object} options
		 * @param {CodeMirror} editor
		 * @param {Function} next
		 * @param {Function} timer
		 */
		'select': function(options, editor, next, timer) {
			options = makeOptions(options, 'to', {
				from: 'caret'
			});
			
			var from = makePos(options.from, editor);
			var to = makePos(options.to, editor);
			editor.setSelection(from, to);
			next();
		}
	};
	
	/**
	 * Parses action call from string
	 * @param {String} data
	 * @returns {Object}
	 */
	function parseActionCall(data) {
		if (_.isString(data)) {
			var parts = data.split(':');
			var name = parts.shift();
			return {
				name: name,
				options: parts.join(':')
			};
		} else {
			var name = _.keys(data)[0];
			return {
				name: name,
				options: data[name]
			};
		}
	}
	
	function makeOptions(options, name, defaults) {
		if (_.isString(options)) {
			var o = {};
			o[name] = options;
			options = o;
		}
		
		return _.extend(defaults, options || {});
	}
	
	/**
	 * Helper function that produces <code>{line, ch}</code> object from
	 * passed argument
	 * @param {Object} pos
	 * @param {CodeMirror} editor
	 * @returns {Object}
	 */
	function makePos(pos, editor) {
		if (_.isString(pos)) {
			if (pos === 'caret') {
				return editor.getCursor(true);
			}
			
			if (~pos.indexOf(':')) {
				var parts = pos.split(':');
				return {
					line: parseInt(parts[0], 10),
					ch: parseInt(parts[1], 10)
				};
			}
			
			pos = parseInt(pos, 10);
		}
		
		if (_.isNumber(pos)) {
			return editor.posFromIndex(pos);
		}
		
		return pos;
	}
	
	function requestTimer(fn, delay) {
		if (!delay)
			fn();
		else
			return setTimeout(fn, delay);
	}
	
	// XXX add 'revert' action to CodeMirror to restore original text and position
	CodeMirror.commands.revert = function(editor) {
		if (editor.__initial) {
			editor.setValue(editor.__initial.content);
			editor.setCursor(editor.__initial.pos);
		}
	};
	
	
	/**
	 * @param {Object} actions Actions scenario
	 * @param {Object} data Initial content (<code>String</code>) or editor
	 * instance (<code>CodeMirror</code>)
	 */
	function Scenario(actions, data) {
		this._actions = actions;
		this._actionIx = 0;
		this._editor = null;
		this._state = STATE_IDLE;
		this._timerQueue = [];
		
		if (data && 'getValue' in data) {
			this._editor = data;
		}
		
		var ed = this._editor;
		if (ed && !ed.__initial) {
			ed.__initial = {
				content: ed.getValue(),
				pos: ed.getCursor(true)
			};
		}
	}
	
	Scenario.prototype = {
		_setup: function(editor) {
			if (!editor && this._editor)
				editor = this._editor;
			
			editor.execCommand('revert');
			return editor;
		},
		
		/**
		 * Play current scenario
		 * @param {CodeMirror} editor Editor instance where on which scenario 
		 * should be played
		 * @memberOf Scenario
		 */
		play: function(editor) {
			if (this._state === STATE_PLAY) {
				// already playing
				return;
			}
			
			if (this._state === STATE_PAUSE) {
				// revert from paused state
				editor = editor || this._editor;
				editor.focus();
				var timerObj = null;
				while (timerObj = this._timerQueue.shift()) {
					requestTimer(timerObj.fn, timerObj.delay);
				}
				
				this._state = STATE_PLAY;
				this.trigger('resume');
				return;
			}
			
			this._editor = editor = this._setup(editor);
			editor.focus();
			
			var timer = _.bind(this.requestTimer, this);
			var that = this;
			this._actionIx = 0;
			var next = function() {
				if (that._actionIx >= that._actions.length) {
					return timer(function() {
						that.stop();
					}, defaultOptions.afterDelay);
				}
				
				that.trigger('action', that._actionIx);
				var action = parseActionCall(that._actions[that._actionIx++]);
				
				if (action.name in actionsDefinition) {
					actionsDefinition[action.name].call(that, action.options, editor, next, timer);
				} else {
					throw 'No such action: ' + actionName;
				}
			};
			
			this._state = STATE_PLAY;
			this._editor.setOption('readOnly', true);
			this.trigger('play');
			timer(next, defaultOptions.beforeDelay);
		},
		
		/**
		 * Pause current scenario playback. It can be restored with 
		 * <code>play()</code> method call 
		 */
		pause: function() {
			this._state = STATE_PAUSE;
			this.trigger('pause');
		},
		
		/**
		 * Stops playback of current scenario
		 */
		stop: function() {
			if (this._state !== STATE_IDLE) {
				this._state = STATE_IDLE;
				this._timerQueue.length = 0;
				this._editor.setOption('readOnly', false);
				this.trigger('stop');
			}
		},
		
		toggle: function() {
			if (this._state === STATE_PLAY) {
				this.pause();
			} else {
				this.play();
			}
		},
		
		requestTimer: function(fn, delay) {
			if (this._state !== STATE_PLAY) {
				// save function call into a queue till next 'play()' call
				this._timerQueue.push({
					fn: fn,
					delay: delay
				});
			} else {
				return requestTimer(fn, delay);
			}
		},
		
		// borrowed from Backbone
		/**
		 * Bind one or more space separated events, `events`, to a `callback`
		 * function. Passing `"all"` will bind the callback to all events fired.
		 * @param {String} events
		 * @param {Function} callback
		 * @param {Object} context
		 * @memberOf eventDispatcher
		 */
		on: function(events, callback, context) {
			var calls, event, node, tail, list;
			if (!callback)
				return this;
			
			events = events.split(eventSplitter);
			calls = this._callbacks || (this._callbacks = {});

			// Create an immutable callback list, allowing traversal during
			// modification.  The tail is an empty object that will always be used
			// as the next node.
			while (event = events.shift()) {
				list = calls[event];
				node = list ? list.tail : {};
				node.next = tail = {};
				node.context = context;
				node.callback = callback;
				calls[event] = {
					tail : tail,
					next : list ? list.next : node
				};
			}

			return this;
		},

		/**
		 * Remove one or many callbacks. If `context` is null, removes all
		 * callbacks with that function. If `callback` is null, removes all
		 * callbacks for the event. If `events` is null, removes all bound
		 * callbacks for all events.
		 * @param {String} events
		 * @param {Function} callback
		 * @param {Object} context
		 */
		off: function(events, callback, context) {
			var event, calls, node, tail, cb, ctx;

			// No events, or removing *all* events.
			if (!(calls = this._callbacks))
				return;
			if (!(events || callback || context)) {
				delete this._callbacks;
				return this;
			}

			// Loop through the listed events and contexts, splicing them out of the
			// linked list of callbacks if appropriate.
			events = events ? events.split(eventSplitter) : _.keys(calls);
			while (event = events.shift()) {
				node = calls[event];
				delete calls[event];
				if (!node || !(callback || context))
					continue;
				// Create a new list, omitting the indicated callbacks.
				tail = node.tail;
				while ((node = node.next) !== tail) {
					cb = node.callback;
					ctx = node.context;
					if ((callback && cb !== callback) || (context && ctx !== context)) {
						this.on(event, cb, ctx);
					}
				}
			}

			return this;
		},
		
		/**
		 * Trigger one or many events, firing all bound callbacks. Callbacks are
		 * passed the same arguments as `trigger` is, apart from the event name
		 * (unless you're listening on `"all"`, which will cause your callback
		 * to receive the true name of the event as the first argument).
		 * @param {String} events
		 */
		trigger: function(events) {
			var event, node, calls, tail, args, all, rest;
			if (!(calls = this._callbacks))
				return this;
			all = calls.all;
			events = events.split(eventSplitter);
			rest = slice.call(arguments, 1);

			// For each event, walk through the linked list of callbacks twice,
			// first to trigger the event, then to trigger any `"all"` callbacks.
			while (event = events.shift()) {
				if (node = calls[event]) {
					tail = node.tail;
					while ((node = node.next) !== tail) {
						node.callback.apply(node.context || this, rest);
					}
				}
				if (node = all) {
					tail = node.tail;
					args = [ event ].concat(rest);
					while ((node = node.next) !== tail) {
						node.callback.apply(node.context || this, args);
					}
				}
			}

			return this;
		}
	};
	
	return _.extend(function(actions, data) {
		return new Scenario(actions, data);
	}, {
		defineAction: function(name, fn) {
			actionsDefinition[name] = fn;
		},
		makeOptions: makeOptions,
		makePos: makePos,
		has3d: has3d,
		prefixed: prefixed
	});
})();

/**
 * Helper function that set-up movie instance
 */
CodeMirror.movie = function(editorTarget, scenario, outline, editorOptions) {
	editorOptions = _.extend({
		theme: 'espresso',
		mode : 'text/html',
		indentWithTabs: true,
		tabSize: 4,
		lineNumbers : true,
		onCursorActivity: function() {
			editor.setLineClass(hlLine, null, null);
			hlLine = editor.setLineClass(editor.getCursor().line, null, "activeline");
		},
		onKeyEvent: function(ed, evt) {
			
			if (ed.getOption('readOnly')) {
				evt.stop();
				return true;
			}
		}
	}, editorOptions || {});
	
	var initialValue = editorOptions.value || $(editorTarget).val() || '';
	
	// normalize line endings
	initialValue = initialValue.replace(/\r?\n/g, '\n');
	
	var initialPos = initialValue.indexOf('|');
	initialValue = initialValue.replace(/\|/g, '');
	$(editorTarget).val(initialValue);
	
	var editor = CodeMirror.fromTextArea(editorTarget, editorOptions);
	var hlLine = editor.setLineClass(0, 'activeline');
	if (initialPos != -1) {
		// move caret to initial position
		var pos = editor.posFromIndex(initialPos);
		editor.setCursor(pos);
	}
	
	// save initial data so we can revert to it later
	editor.__initial = {
		content: initialValue,
		pos: editor.getCursor(true)
	};
	
	
	var $w = $(editor.getWrapperElement()).addClass('CodeMirror-movie');
	
	var sc = CodeMirror.scenario(scenario, editor);
	if (outline) {
		$w
			.addClass('CodeMirror-movie_with-outline')
			.append(CodeMirror.scenarioOutline(outline, sc));
	}
	
	// add splash screen
	var splash = $('<div class="CodeMirror-movie__splash">' 
			+ '<div class="CodeMirror-movie__splash-text"><span class="CodeMirror-movie__splash-play-btn">▶</span> Watch demo</div>' 
			+ '</div>')
			.click(function() {
				sc.play();
			});
	
	var removeSplash = function() {
		if (splash) {
			splash.remove();
			splash = null;
		}
	};
	
	$w.append(splash);
	
	sc.on('play', removeSplash);
	
	// create toolbar
	var btnPlay = $('<button class="btn btn-mini btn-primary CodeMirror-movie__btn-play">▶ Play demo</button>')
		.click(function() {
			sc.toggle();
		});
	var btnTry = $('<button class="btn btn-mini btn-success CodeMirror-movie__btn-try">Try it yourself</button>')
		.click(function() {
			sc.stop();
			removeSplash();
			editor.execCommand('revert');
			editor.focus();
		});
	
	var toolbar = $('<div class="CodeMirror-movie__toolbar"></div>')
		.append(btnPlay)
		.append(btnTry);
	
	sc.on('play resume', function() {
		btnPlay.html('\u275a\u275a Pause');
	})
	.on('pause stop', function() {
		btnPlay.html('▶ Play again');
	});
	
	$w.before(toolbar);
	
	return sc;
};