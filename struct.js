/**
 * struct.js ver0.4
 *
 * This module use Proxy API provided by ECMAScript 6 (Harmony)
 * @see http://wiki.ecmascript.org/doku.php?id=harmony:direct_proxies
 *
 * On browser:
 *   With ES6-shim(https://github.com/paulmillr/es6-shim) it
 *   could also work in Firefox4 or Chrome.
 *
 * On node.js
 *   You have to add node option --harmony_proxies or --harmony option.
 *
 * @author hagino3000(http://twitter.com/hagino3000)
 *
 */


var Struct = {
  structs: {}
};

if (typeof(module) !== 'undefined' && module.exports) {
  module.exports = Struct;
} else {
  window.Struct = Struct;
}


;(function(undefined) {
'use strict';

///////////////////////////////////////////////
// Type check functions
///////////////////////////////////////////////
function toString(val) {
  return Object.prototype.toString.call(val);
}

function isString(val) {
  return toString(val) === '[object String]';
}

function isNumber(val) {
  return toString(val) === '[object Number]' && !isNaN(val);
}

function isBoolean(val) {
  return toString(val) === '[object Boolean]';
}

function isFunction(val) {
  return toString(val) === '[object Function]';
}

function isArray(val) {
  return toString(val) === '[object Array]';
}

function isArrayLike(val) {
  return isArray(val) ||
         (val && typeof(val) === 'object' && isNumber(val.length));
}

function isObject(val) {
  return toString(val) === '[object Object]';
}

function isObjectLike(val) {
  return val !== null && typeof(val) === 'object';
}

function isRegExp(val) {
  return toString(val) === '[object RegExp]';
}

function isDate(val) {
  return toString(val) === '[object Date]';
}

function isDomNode(val) {
  return val && isString(val.nodeName) && isArrayLike(val.childNodes);
}

function isNullOrUndefined(val) {
  return val === null || val === undefined;
}

Struct.typeChecker = {
  'string': isString,
  'number': isNumber,
  'boolean': isBoolean,
  'function': isFunction,
  'array': isArray,
  'arraylike': isArrayLike,
  'object': isObject,
  'anyobject': isObjectLike,
  'regexp': isRegExp,
  'date': isDate,
  'domnode': isDomNode
};

/**
 * Check value type (internal)
 */
function isType(type, val) {
  if (Struct.typeChecker[type]) {
    return Struct.typeChecker[type](val);
  }
  return false;
}


Struct.util = {
  isString: isString,
  isObject: isObject,
  isObjectLike: isObjectLike,
  isType: isType,
  isNullOrUndefined: isNullOrUndefined
}

})();


(function(undefined) {
'use strict';

/**
 * Create trap functions (internal)
 *
 * @param {Object} obj Check object.
 * @param {Object} props Property definitions.
 * @return {Object} Proxy handler.
 */
Struct._handlerMaker = function(obj, props) {

  // Property name used by console.log
  var INSPECTOR_PROP_NAME = 'inspector';
  var checker = Struct.typeChecker;

  return {

    getOwnPropertyDescriptor: function(name) {
      var desc = Object.getOwnPropertyDescriptor(obj, name);
      // a trapping proxy's properties must always be configurable
      if (desc !== undefined) { desc.configurable = true; }
      return desc;
    },

    getPropertyDescriptor: function(name) {
      var desc = Object.getPropertyDescriptor(obj, name); // not in ES5
      // a trapping proxy's properties must always be configurable
      if (desc !== undefined) { desc.configurable = true; }
      return desc;
    },

    getOwnPropertyNames: function() {
      return Object.getOwnPropertyNames(obj);
    },

    getPropertyNames: function() {
      return Object.getPropertyNames(obj);
    },

    defineProperty: function(name, desc) {
      throw 'Cannot fix this object';
    },

    /**
     * Delete specified property.
     * Check property name if defined in advance.
     */
    'delete': function(name) {
      if (name in props) {

        // Check property descriptor
        var desc = this.getOwnPropertyDescriptor(name);
        if (props[name].nullable === false) {
          throw name + ' is not allowd null or undefined';
        }

        return delete obj[name];
      } else {
        throw name + ' is not defined in this struct';
      }
    },

    fix: function() {
      if (Object.isFrozen(obj)) {
        return Object.getOwnPropertyNames(obj).map(function(name) {
          return Object.getOwnPropertyDescriptor(obj, name);
        });
      }
      // As long as obj is not frozen,
      // the proxy won't allow itself to be fixed
      return undefined; // will cause a TypeError to be thrown
    },

    has: function(name) {
      return name in obj;
    },

    hasOwn: function(name) {
      return Object.prototype.hasOwnProperty.call(obj, name);
    },

    /**
     * Get value of specified property.
     * Check property name if defined in advance.
     */
    get: function(receiver, name) {
      if (name in props || name === INSPECTOR_PROP_NAME) {
        return obj[name];
      } else {
        throw name + ' is not defined in this struct';
      }
    },

    /**
     * Set value.
     * Check property name if defined and type is matched in advance.
     */
    set: function(receiver, name, val) {
      if (name in props) {

        // Check property descriptor
        var desc = this.getOwnPropertyDescriptor(name);
        if (desc && !desc.writable) {
          throw name + ' is not writable property';
        }

        if (props[name].nullable === false && isNullOrUndefined(val)) {
          throw name + ' is not allowd null or undefined';
        }

        // Check type match
        var type = props[name].type;
        if (isNullOrUndefined(val) || Struct.isStructType(type, val) || Struct.util.isType(type, val)) {
          // OK
        } else {
          throw name + ' must be ' + props[name].type + ' type';
        }

        if (props[name].cond && !props[name].cond(val)) {
          throw 'Invalid value:' + name + '=' + String(val);
        }

        obj[name] = val;
        return true;
      } else {
        throw name + ' is not defined in this struct';
      }
    },

    enumerate: function() {
      var result = [];
      for (var name in obj) { result.push(name); }
      return result;
    },

    keys: function() {
      return Object.keys(obj);
    }
  };
};

function isNullOrUndefined(val) {
  return val === null || val === undefined;
}

})();

(function(undefined) {
'use strict';

var STRUCT_NAME_KEY = '__structName__';

var REGEXP_STRUCT_TYPE = /^struct:(.+)/;

// Check Proxy API is enabled
var hasProxyAPI = typeof(Proxy) !== 'undefined';

var util = Struct.util;

/**
 * Define new struct.
 *
 * @param {String} name Struct name.
 * @param {Object} props Property configs.
 * @this Struct
 */
Struct.define = function(name, props) {
  if (!util.isString(name)) {
    throw 'First argument must be String type (Struct name)';
  }
  if (!util.isObject(props)) {
    throw 'Second argument must be Object type (Property settings)';
  }
  if (this.structs[name]) {
    throw name + ' is already defined';
  }

  Object.keys(props).forEach(function(k) {
    // Check type
    var t = props[k].type;
    if (!Struct.typeChecker.hasOwnProperty(t) &&
        !REGEXP_STRUCT_TYPE.test(t)) {

      throw 'Supported types are :' +
            Object.keys(Struct.typeChecker).join() + ',struct:*';
    }

    // Set default writable:true
    if (props[k].writable === undefined) {
      props[k].writable = true;
    }

    // Create function from condition formula
    if (util.isString(props[k].cond)) {
      props[k].cond = new Function('v', 'return ' + props[k].cond);
    }
  });

  // Add type name property
  props[STRUCT_NAME_KEY] = {
    value: name,
    wriatble: false,
    enumerable: false
  };

  // Struct definition will never change
  Object.freeze(props);

  this.structs[name] = props;
};

/**
 * Returns specified name of struct is already defined.
 *
 * @param {String} name Struct name.
 * @this Struct
 * @return {boolean} If defined or not.
 */
Struct.ifdef = function(name) {
  return !!this.structs.hasOwnProperty(name);
};

/**
 * Gets struct type name.
 *
 * @param {Object} obj Object.
 * @return {String} Type name. Returns undefined
 * if an argument is not a Struct object.
 */
Struct.getType = function(obj) {
  if (!util.isObjectLike(obj)) {
    throw 'First argument must be object type';
  }
  if (util.isObject(obj) && obj.hasOwnProperty(STRUCT_NAME_KEY)) {
    return obj[STRUCT_NAME_KEY];
  }
  return undefined;
};

/**
 * Check is struct object or not.
 *
 * @param {Object} obj Object.
 * @return {boolean} True if parameter is struct object.
 */
Struct.isStruct = function(obj) {
  return util.isObject(obj) && util.isString(obj[STRUCT_NAME_KEY]);
};

/**
 * Create struct object.
 *
 * @param {String} name Struct name.
 * @param {Object} obj Base object (option).
 * @this Struct
 * @return {Object} Struct object.
 */
var create = Struct.create = function(name, obj) {
  if (!this.structs.hasOwnProperty(name)) {
    throw 'Struct named "' + name + '" is not defined';
  }
  var props = this.structs[name];

  obj = obj || {};
  checkInitialValue(obj, props);
  Object.defineProperties(obj, props);

  var ret;
  if (hasProxyAPI) {
    ret = Proxy.create(Struct._handlerMaker(obj, props));
  } else {
    //fallback
    ret = Object.seal(obj);
  }
  return ret;
};

/**
 * Configure behavior.
 *
 * @param {Object} config Configuration.
 * @this Struct
 */
Struct.configure = function(config) {
  if (Object.keys(this.structs).length > 0) {
    console.log('WARNING: Some structs are already defined.' +
                'This configure does not applied them.');
  }
  if (config['disable any check'] === true) {
    Struct.create = createFake;
  }
  // For test
  if (config['disable any check'] === false) {
    Struct.create = create;
  }
};

/**
 * For no-check mode.
 *
 * @param {String} name Struct name.
 * @param {Object} obj Base object (option).
 * @return {Object} Fake struct object.
 */
function createFake(name, obj) {
  obj = obj || {};

  // Only add property for type check.
  Object.defineProperty(obj, STRUCT_NAME_KEY, {
    value: name,
    wriatble: false,
    enumerable: false
  });
  return obj;
}

/**
 * Check struct type.
 */
Struct.isStructType = function(type, obj) {
  var mat = type.match(REGEXP_STRUCT_TYPE);
  if (mat && Struct.isStruct(obj)) {
    return Struct.getType(obj) === mat[1];
  }
  return false;
}

/**
 * Check initial object (internal)
 *
 * @param {Object} obj Check object.
 * @param {Object} props Property definitions.
 */
function checkInitialValue(obj, props) {

  Object.keys(props).forEach(function(k) {
    var p = props[k], val = obj[k];

    if (util.isNullOrUndefined(val)) {
      if (p.nullable === false) {
        throw k + ' is not-nullable property but initial value is null';
      }
      return;
    }

    if (Struct.isStructType(p.type, val) || util.isType(p.type, val)) {
      return;
    }

    var mat = p.type.match(REGEXP_STRUCT_TYPE);
    if (mat) {
      // Definition is struct type but normal object given
      var structName = mat[1];
      checkInitialValue(val, Struct.structs[structName]);
      // Auto boxing
      obj[k] = Struct.create(structName, val);
      return;
    }

    throw k + ' must be ' + props[k].type +
          ' type. But initial value not matched';
  });

  // Check each condition formula
  Object.keys(props).forEach(function(k) {
    var p = props[k], val = obj[k];
    if (p.cond && !p.cond(val)) {
      throw 'Invalid value:' + k + '=' + String(val);
    }
  });

  Object.keys(obj).forEach(function(k) {
    if (!props.hasOwnProperty(k)) {
      throw 'Invalid property found:' + k;
    }
  });
}

})();

