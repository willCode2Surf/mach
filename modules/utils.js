var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var qs = require('qs');
var url = require('url');
var when = require('when');
var mime = require('mime');
var errors = require('./errors');
var _slice = Array.prototype.slice;
var _toString = Object.prototype.toString;

exports.STATUS_CODES = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',                       // RFC 2518, obsoleted by RFC 4918
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',                     // RFC 4918
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Moved Temporarily',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Time-out',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Request Entity Too Large',
  414: 'Request-URI Too Large',
  415: 'Unsupported Media Type',
  416: 'Requested Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",                     // RFC 2324
  422: 'Unprocessable Entity',             // RFC 4918
  423: 'Locked',                           // RFC 4918
  424: 'Failed Dependency',                // RFC 4918
  425: 'Unordered Collection',             // RFC 4918
  426: 'Upgrade Required',                 // RFC 2817
  428: 'Precondition Required',            // RFC 6585
  429: 'Too Many Requests',                // RFC 6585
  431: 'Request Header Fields Too Large',  // RFC 6585
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',          // RFC 2295
  507: 'Insufficient Storage',             // RFC 4918
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',                     // RFC 2774
  511: 'Network Authentication Required'   // RFC 6585
};

exports.STATUS_WITHOUT_CONTENT = {
  100: true,
  101: true,
  204: true,
  304: true
};

exports.statusHasContent = function (status) {
  return exports.STATUS_WITHOUT_CONTENT[status] !== true;
};

exports.SAFE_REQUEST_METHODS = {
  GET: true,
  HEAD: true,
  OPTIONS: true,
  TRACE: true
};

exports.isSafeRequestMethod = function (method) {
  return exports.SAFE_REQUEST_METHODS[method.toUpperCase()] === true;
};

exports.defaultApp = function (request) {
  return textResponse(404, 'Not Found: ' + request.method + ' ' + request.path);
};

exports.slice = function (object) {
  return _slice.apply(object, _slice.call(arguments, 1));
};

exports.mergeProperties = function (object, extension) {
  for (var property in extension) {
    if (extension.hasOwnProperty(property)) {
      object[property] = extension[property];
    }
  }

  return object;
};

exports.isRegExp = function (object) {
  return _toString.call(object) === '[object RegExp]';
};

exports.escapeRegExp = function (string) {
  return String(string).replace(/([.?*+^$[\]\\(){}-])/g, '\\$1');
};

exports.mimeType = function (file) {
  return mime.lookup(file);
};

exports.makeHash = function (string) {
  return crypto.createHash('sha1').update(string).digest('hex');
};

exports.makeKey = function (length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
};

exports.parseQueryString = function (queryString) {
  return qs.parse(queryString);
};

exports.parseCookie = function (cookie) {
  return require('querystring').parse(cookie, /[;,] */);
};

exports.parseUrl = function (urlString) {
  return url.parse(urlString);
};

exports.encodeBase64 = function (string) {
  return new Buffer(string).toString('base64');
};

exports.decodeBase64 = function (string) {
  return new Buffer(string, 'base64').toString();
};

exports.encodeCookie = function (name, options) {
  options = options || {};

  if (typeof options === 'string') {
    options = { value: options };
  }

  var cookie = encodeURIComponent(name) + '=';

  if (options.value) cookie += encodeURIComponent(options.value);
  if (options.domain) cookie += '; domain=' + options.domain;
  if (options.path) cookie += '; path=' + options.path;
  if (options.expires) cookie += '; expires=' + options.expires.toUTCString();
  if (options.secure) cookie += '; secure';
  if (options.httpOnly) cookie += '; HttpOnly';

  return cookie;
};

exports.setCookie = function (headers, name, options) {
  var cookie = exports.encodeCookie(name, options);

  if (headers['Set-Cookie']) {
    headers['Set-Cookie'] = [ headers['Set-Cookie'], cookie ].join('\n');
  } else {
    headers['Set-Cookie'] = cookie;
  }
};

/**
 * Compiles the given route string into a RegExp that can be used to match
 * it. The route may contain named keys in the form of a colon followed by a
 * valid JavaScript identifier (e.g. ":name", ":_name", or ":$name" are all
 * valid keys). If the route contains the special "*" symbol, it is substituted
 * with a "(.*?)" pattern in the resulting RegExp.
 */
exports.compileRoute = function (route) {
  var pattern = route.replace(/((:[a-z_$][a-z0-9_$]*)|[*.+()])/ig, function (match) {
    switch (match) {
    case '*':
      return '(.*?)';
    case '.':
    case '+':
    case '(':
    case ')':
      return exports.escapeRegExp(match);
    }

    return '([^./?#]+)';
  });

  return new RegExp('^' + pattern + '$', 'i');
};

/**
 * Returns a promise for the checksum of all data in the given file using
 * the given algorithm (defaults to "md5").
 */
exports.makeChecksum = function (file, algorithm) {
  algorithm = algorithm || 'md5';

  var value = when.defer();
  var hash = crypto.createHash(algorithm);
  var stream = fs.createReadStream(file);

  stream.on('data', function (chunk) {
    hash.update(chunk);
  });

  stream.on('end', function () {
    value.resolve(hash.digest('hex'));
  });

  stream.on('error', function (error) {
    value.reject(error);
  });

  return value.promise;
};

/**
 * Returns a promise for a buffer of all content in the given stream up to
 * the given maximum length.
 */
exports.bufferStream = function (stream, maxLength) {
  var value = when.defer();
  var chunks = [];
  var length = 0;

  stream.on('data', function (chunk) {
    length += chunk.length;

    if (maxLength && length > maxLength) {
      value.reject(new errors.MaxLengthExceededError(maxLength));
    } else {
      chunks.push(chunk);
    }
  });

  stream.on('end', function () {
    value.resolve(Buffer.concat(chunks));
  });

  stream.on('error', function (error) {
    value.reject(error);
  });

  return value.promise;
};

exports.streamToDisk = function (part, filePrefix) {
  var temporaryPath = makeTemporaryPath(filePrefix);
  var info = {
    path: temporaryPath,
    name: part.filename,
    type: part.type,
    size: 0
  };

  var stream = fs.createWriteStream(info.path);
  var value = when.defer();

  part.on('data', function (chunk) {
    info.size += chunk.length;
    stream.write(chunk, function () {
      // TODO: Emit progress.
    });
  });

  part.on('end', function () {
    stream.end(function () {
      value.resolve(info);
    });
  });

  part.on('error', function (error) {
    value.reject(error);
  });

  return value.promise;
};

var os = require('os');

function makeTemporaryPath(prefix) {
  prefix = prefix || '';

  var random = (Math.random() * 0x100000000 + 1).toString(36);
  var now = new Date();
  var date = '' + now.getYear() + now.getMonth() + now.getDate();
  var name = [ prefix, date, '-', process.pid, '-', random ].join('');

  return path.join(os.tmpDir(), name);
}

/**
 * Returns a text/plain 200 OK response.
 */
exports.ok = makeTextResponder(200);

/**
 * Returns a text/plain 400 Bad Request response.
 */
exports.badRequest = makeTextResponder(400);

/**
 * Returns a text/plain 403 Forbidden response.
 */
exports.forbidden = makeTextResponder(403);

/**
 * Returns a text/plain 404 Not Found response.
 */
exports.notFound = makeTextResponder(404);

/**
 * Returns a text/plain 413 Request Entity Too Large response.
 */
exports.requestEntityTooLarge = makeTextResponder(413);

/**
 * Returns a text/plain 500 Internal Server Error response.
 */
exports.internalServerError = makeTextResponder(500);

function textResponse(status, content) {
  content = content || exports.STATUS_CODES[status];

  return {
    status: status,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(content)
    },
    content: content
  };
}

function makeTextResponder(status) {
  return function (content) {
    return textResponse(status, content);
  };
}
