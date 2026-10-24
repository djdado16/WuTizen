/**
 * log.js — tiny leveled logger.
 *
 * Never log profile data, add-on URLs or credentials. Log statements in this
 * project intentionally avoid logging request URLs from user configuration.
 */

var PREFIX = '[wuplay]';
var enabled = true;

export function setLogEnabled(value) {
  enabled = !!value;
}

export function logInfo() {
  if (!enabled) {
    return;
  }
  var args = Array.prototype.slice.call(arguments);
  args.unshift(PREFIX);
  console.log.apply(console, args);
}

export function logWarn() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(PREFIX);
  console.warn.apply(console, args);
}

export function logError() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(PREFIX);
  console.error.apply(console, args);
}
