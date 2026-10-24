/**
 * keys.js — Samsung / browser key normalization.
 *
 * Samsung Smart Remote key codes (Tizen 5.0):
 *   arrows 37/38/39/40, OK 13, BACK 10009, EXIT 10182, RETURN 461
 * Media keys are delivered only after they are registered through
 * tizen.tvinputdevice.registerKeyBatch() — see platform/tizen.js.
 */

export var KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  ESCAPE: 27,
  BACKSPACE: 8,
  RETURN: 461,
  TIZEN_BACK: 10009,
  TIZEN_EXIT: 10182,
  MEDIA_PLAY: 415,
  MEDIA_PAUSE: 19,
  MEDIA_PLAY_PAUSE: 10252,
  MEDIA_FAST_FORWARD: 417,
  MEDIA_REWIND: 412
};

/** Media keys that must be registered before the TV will report them. */
export var MEDIA_KEY_NAMES = [
  'MediaPlay',
  'MediaPause',
  'MediaPlayPause',
  'MediaFastForward',
  'MediaRewind'
];

var CODE_TO_ACTION = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  27: 'back',
  8: 'back',
  461: 'back',
  10009: 'back',
  10182: 'exit',
  415: 'media',
  19: 'media',
  10252: 'media',
  417: 'media',
  412: 'media'
};

// Fallback for synthetic events (tests) and non-Samsung keyboards.
var NAME_TO_ACTION = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  Enter: 'enter',
  Escape: 'back',
  Backspace: 'back',
  ' ': 'enter'
};

/**
 * @param {KeyboardEvent} event
 * @returns {string|null} one of left|up|right|down|enter|back|exit|media
 */
export function actionFromEvent(event) {
  if (!event) {
    return null;
  }
  var code = event.keyCode || event.which;
  if (code && CODE_TO_ACTION[code]) {
    return CODE_TO_ACTION[code];
  }
  if (event.key && NAME_TO_ACTION[event.key]) {
    return NAME_TO_ACTION[event.key];
  }
  return null;
}
