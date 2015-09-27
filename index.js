/**
 * Module dependencies.
 */

var Base = require('mocha/lib/reporters/base')
var utils = require('mocha/lib/utils')
var color = Base.color;
var ms = require('mocha/lib/ms')
var diff = require('diff');


var path = require('path')
var fs = require('fs')
var _ = require('lodash')
var exec = require('child_process').exec


/**
 * Expose `Dot`.
 */

exports = module.exports = Dot;

/**
 * Initialize a new `Dot` matrix test reporter.
 *
 * @api public
 * @param {Runner} runner
 */
function Dot(runner) {
  Base.call(this, runner)

  var self = this;
  var width = Base.window.width * .75 | 0;
  var n = -1;

  runner.on('start', function() {
    process.stdout.write('\n')
  })

  runner.on('pending', function() {
    if (++n % width === 0) {
      process.stdout.write('\n  ')
    }
    process.stdout.write(color('pending', Base.symbols.dot))
  })

  runner.on('pass', function(test) {
    if (++n % width === 0) {
      process.stdout.write('\n  ')
    }
    if (test.speed === 'slow') {
      process.stdout.write(color('bright yellow', Base.symbols.dot))
    } else {
      process.stdout.write(color(test.speed, Base.symbols.dot))
    }
  })


  runner.on('fail', function (event) {
    if (++n % width === 0) {
      process.stdout.write('\n  ')
    }
    process.stdout.write(color('fail', Base.symbols.dot))
  })

  runner.on('end', function(callback) {
    epilogue.call(self)
  })
}


/**
 * Output common epilogue used by many of
 * the bundled reporters.
 *
 * @api public
 */
process.on('uncaughtException', function (err) {console.log(err)})

function epilogue () {
  var stats = this.stats;
  var fmt;

  console.log()

  // passes
  fmt = color('bright pass', ' ') + color('green', ' %d passing') + color('light', ' (%s)')
  console.log(fmt, stats.passes || 0, ms(stats.duration))

  // pending
  if (stats.pending) {
    fmt = color('pending', ' ')
      + color('pending', ' %d pending')

    console.log(fmt, stats.pending)
  }


  // failures
  if (stats.failures) {
    fmt = color('fail', '  %d failing')
    console.log(fmt, stats.failures)

    console.log(_.pad('', Base.window.width, '-'))
    list(this.failures)
  }
}


/**
 * Inherit from `Base.prototype`.
 */
utils.inherits(Dot, Base)

function list (failures) {
  failures.forEach(function (test, i) {
    collectError(test, function(err, data) {
      if (err) console.error(err)
      printTest(test, data, i)
    })
  })
}


function printTest (test, context, i) {
  // format
  var fmt = color('error title', '  %s) %s:\n')
    + color('error message', '     %s')
    + color('error stack', '\n%s\n')

  // msg
  var msg;
  var err = test.err;
  var message;
  if (err.message) {
    message = err.message;
  } else if (typeof err.inspect === 'function') {
    message = err.inspect() + '';
  } else {
    message = '';
  }
  var stack = err.stack || message;
  var index = stack.indexOf(message)
  var actual = err.actual;
  var expected = err.expected;
  var escape = true;

  if (index === -1) {
    msg = message;
  } else {
    index += message.length;
    msg = stack.slice(0, index)
    // remove msg from stack
    stack = stack.slice(index + 1)
  }

  // uncaught
  if (err.uncaught) {
    msg = 'Uncaught ' + msg;
  }
  // explicitly show diff
  if (err.showDiff !== false && sameType(actual, expected) && expected !== undefined) {
    escape = false;
    if (!(utils.isString(actual) && utils.isString(expected))) {
      err.actual = actual = utils.stringify(actual)
      err.expected = expected = utils.stringify(expected)
    }

    fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n')
    var match = message.match(/^([^:]+): expected/)
    msg = '\n      ' + color('error message', match ? match[1] : msg)

    if (exports.inlineDiffs) {
      msg += inlineDiff(err, escape)
    } else {
      msg += unifiedDiff(err, escape)
    }
  }

  // indent stack trace
  stack = stack.replace(/^/gm, '  ')

  console.log(fmt, (i + 1), test.fullTitle(), msg, stack)

  var errorContext = ''
  if (context) {
    var link = [context.file, context.line, context.index].join(':')
    var errorContext = context.context
    var firstStackLine = test.err.stack.split('\n').filter(function (line) { return / at .* \((.*):(.*):(.*)\)/.test(line) })[0]

    // Highlight error from stacktrace
    if (firstStackLine) {
      var match = firstStackLine.match(/  at .* \((.*):(.*):(.*)\)/)
      if (match) {
        var file = match[1]
        var line = parseInt(match[2])
        if (file === context.file && line > context.line && line < context.line+20) {
          var localLine = line - context.line
          errorContext[localLine] = color('fail', errorContext[localLine])
        }
      }
    }

    console.log('     Link: %s', link)
    errorContext = errorContext.map(function (line) { return '       ' + line })
    errorContext = _.trimRight(errorContext.join('\n'))
    console.log('     Context:\n%s', errorContext)
  }

  console.log(_.pad('', Base.window.width, '-'))
}

function collectError (event, callback) {
  var testScript = path.dirname(event.file)
  var command = ['grep -nr', '"'+event.title.replace(/\"/g, '\\"')+'"', testScript].join(' ')
  exec(command, function (err, stdout) {
    if (err) return callback(err)

    var match = stdout && stdout.match(/(.*):(.*):/)
    if (!match) return callback()

    var file = match[1]
    var line = parseInt(match[2])

    getFileContext({
      file: file,
      string: event.title
    }, function (err, data) {
      if (err) return callback(err)
      return callback(null, data)
    })
  })
}

function getFileContext (options, callback) {
  callback = _.once(callback)
  var lineNumber = 0
  var fileStream = fs.createReadStream(options.file, {encoding: 'utf8'})
  fileStream
  .on('error', callback)
  .on('end', callback)
  .on('data', function (chunk) {
    var charIndex = undefined
    var chunks = chunk.split('\n')
    for (var i = 0; i < chunks.length; i++) {
      charIndex = chunks[i].indexOf(options.string)
      if (charIndex !== -1) {
        callback(null, {
          file: options.file,
          line: lineNumber + 1,
          index: charIndex,
          context: chunks.slice(lineNumber, lineNumber+20)
        })
      }
      lineNumber += 1
    }
  })
}

/**
 * Returns a unified diff between two strings.
 *
 * @api private
 * @param {Error} err with actual/expected
 * @param {boolean} escape
 * @return {string} The diff.
 */
function unifiedDiff(err, escape) {
  var indent = '      ';
  function cleanUp(line) {
    if (escape) {
      line = escapeInvisibles(line);
    }
    if (line[0] === '+') {
      return indent + colorLines('diff added', line);
    }
    if (line[0] === '-') {
      return indent + colorLines('diff removed', line);
    }
    if (line.match(/\@\@/)) {
      return null;
    }
    if (line.match(/\\ No newline/)) {
      return null;
    }
    return indent + line;
  }
  function notBlank(line) {
    return typeof line !== 'undefined' && line !== null;
  }
  var msg = diff.createPatch('string', err.actual, err.expected);
  var lines = msg.split('\n').splice(4);
  return '\n      '
    + colorLines('diff added', '+ expected') + ' '
    + colorLines('diff removed', '- actual')
    + '\n\n'
    + lines.map(cleanUp).filter(notBlank).join('\n');
}

/**
 * Returns an inline diff between 2 strings with coloured ANSI output
 *
 * @api private
 * @param {Error} err with actual/expected
 * @param {boolean} escape
 * @return {string} Diff
 */
function inlineDiff(err, escape) {
  var msg = errorDiff(err, 'WordsWithSpace', escape);

  // linenos
  var lines = msg.split('\n');
  if (lines.length > 4) {
    var width = String(lines.length).length;
    msg = lines.map(function(str, i) {
      return pad(++i, width) + ' |' + ' ' + str;
    }).join('\n');
  }

  // legend
  msg = '\n'
    + color('diff removed', 'actual')
    + ' '
    + color('diff added', 'expected')
    + '\n\n'
    + msg
    + '\n';

  // indent
  msg = msg.replace(/^/gm, '      ');
  return msg;
}

/**
 * Return a character diff for `err`.
 *
 * @api private
 * @param {Error} err
 * @param {string} type
 * @param {boolean} escape
 * @return {string}
 */
function errorDiff(err, type, escape) {
  var actual = escape ? escapeInvisibles(err.actual) : err.actual;
  var expected = escape ? escapeInvisibles(err.expected) : err.expected;
  return diff['diff' + type](actual, expected).map(function(str) {
    if (str.added) {
      return colorLines('diff added', str.value);
    }
    if (str.removed) {
      return colorLines('diff removed', str.value);
    }
    return str.value;
  }).join('');
}

/**
 * Returns a string with all invisible characters in plain text
 *
 * @api private
 * @param {string} line
 * @return {string}
 */
function escapeInvisibles(line) {
  return line.replace(/\t/g, '<tab>')
    .replace(/\r/g, '<CR>')
    .replace(/\n/g, '<LF>\n');
}

/**
 * Color lines for `str`, using the color `name`.
 *
 * @api private
 * @param {string} name
 * @param {string} str
 * @return {string}
 */
function colorLines(name, str) {
  return str.split('\n').map(function(str) {
    return color(name, str);
  }).join('\n');
}

/**
 * Object#toString reference.
 */
var objToString = Object.prototype.toString;

/**
 * Check that a / b have the same type.
 *
 * @api private
 * @param {Object} a
 * @param {Object} b
 * @return {boolean}
 */
function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}

