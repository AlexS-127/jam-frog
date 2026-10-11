// Frog Voice's genre switch, in a [js frog_genre.js] fed by [route /note /genre].
// The app sends /genre <i>: an index into GENRES (the overlay's genres), or -1 for all styles. This finds the
// first Instrument Rack on this track, picks the chain named after the genre (a chain named "all" for all styles,
// else the first chain), and moves the rack's Chain Selector to it. The chain zones must be spread evenly over the
// selector (Chain Select editor -> right-click -> Distribute Ranges Equally): chain k of n then sits in the k-th
// equal slice, and this sets the middle of that slice.

autowatch = 1;
inlets = 1;
outlets = 1; // status lines, to [print FrogGenre]

// Must match STYLES in app/src/core/styles.ts, in order (styles.test.ts checks it).
var GENRES = ['jazz', 'rock', 'electronic', 'country', 'pop', 'punk'];
var ALL = 'all';

function msg_int(i) {
  var genre = i >= 0 && i < GENRES.length ? GENRES[i] : ALL;
  try {
    select(genre);
  } catch (e) {
    say('error: ' + e);
  }
}

function msg_float(f) {
  msg_int(Math.round(f));
}

function select(genre) {
  var rack = findRack();
  if (!rack) return say('no Instrument Rack on this track');
  var n = rack.getcount('chains');
  var k = -1;
  for (var c = 0; c < n && k < 0; c++) {
    if (nameOf(new LiveAPI(rack.unquotedpath + ' chains ' + c)) === genre) k = c;
  }
  if (k < 0 && genre === ALL && n > 0) k = 0;
  if (k < 0) return say('no chain named ' + genre + ' (keeping the current sound)');
  var sel = findParam(rack, 'chain selector');
  if (!sel) return say('the rack has no Chain Selector');
  var min = Number(sel.get('min'));
  var max = Number(sel.get('max'));
  var v = Math.floor(min + ((k + 0.5) * (max - min + 1)) / n);
  if (Number(sel.get('value')) !== v) sel.set('value', v); // skip no-op sets: each set is an undo step in Live
  say(genre + ' -> chain ' + (k + 1) + ' of ' + n + ', selector ' + v);
}

function findRack() {
  var track = new LiveAPI('this_device canonical_parent');
  var n = track.getcount('devices');
  for (var d = 0; d < n; d++) {
    var dev = new LiveAPI(track.unquotedpath + ' devices ' + d);
    if (String(dev.get('class_name')) === 'InstrumentGroupDevice') return dev;
  }
  return null;
}

function findParam(device, name) {
  var n = device.getcount('parameters');
  for (var p = 0; p < n; p++) {
    var param = new LiveAPI(device.unquotedpath + ' parameters ' + p);
    if (nameOf(param) === name) return param;
  }
  return null;
}

// LiveAPI.get returns an array; older Max versions split names with spaces into words.
function nameOf(api) {
  return [].concat(api.get('name')).join(' ').toLowerCase().replace(/^\s+|\s+$/g, '');
}

function say(text) {
  outlet(0, text.split(' '));
}
