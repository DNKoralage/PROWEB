// Node harness: stub a Web Audio graph and verify every SFX schedules cleanly.
global.window = global;
global.performance = { now: () => Date.now() };
global.document = {
  addEventListener() {},
  removeEventListener() {},
  __dkSoundBound: false
};

let scheduled = [];
const param = (v) => ({
  value: v,
  setValueAtTime(t, when) { if (!Number.isFinite(t) || !Number.isFinite(when)) throw new Error('bad setValueAtTime ' + t + ' ' + when); scheduled.push('set'); return this; },
  exponentialRampToValueAtTime(t, when) { if (!(t > 0)) throw new Error('exponential ramp target must be > 0, got ' + t); if (!Number.isFinite(when)) throw new Error('bad ramp time'); scheduled.push('ramp'); return this; }
});
const node = (type, extra) => Object.assign({
  type,
  connect(dst) { if (!dst) throw new Error('connect(undefined)'); return dst; },
  disconnect() {},
  start(t) { if (!Number.isFinite(t)) throw new Error('bad start time ' + t); scheduled.push(type + '.start'); },
  stop(t) { if (!Number.isFinite(t)) throw new Error('bad stop time ' + t); scheduled.push(type + '.stop'); }
}, extra || {});

global.AudioContext = function () {
  this.currentTime = 0;
  this.sampleRate = 48000;
  this.state = 'running';
  this.destination = node('destination');
  this.resume = () => { this.state = 'running'; };
  this.createGain = () => node('gain', { gain: param(1) });
  this.createOscillator = () => node('osc', { frequency: param(440), detune: param(0) });
  this.createBiquadFilter = () => node('biquad', { frequency: param(1000), Q: param(1), gain: param(0) });
  this.createDynamicsCompressor = () => node('comp', {
    threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0)
  });
  this.createConvolver = () => node('convolver', { buffer: null });
  this.createBufferSource = () => node('bufsrc', { buffer: null });
  this.createBuffer = (ch, len) => {
    const data = Array.from({ length: ch }, () => ({ length: len }));
    return { getChannelData: (i) => data[i], length: len };
  };
};

require('../assets/js/sound.js');
const DK = global.DK;
const assert = require('assert');

assert.ok(DK.sound, 'sound module exposed');
const names = Object.keys(DK.sound._tones);
assert.ok(names.length >= 12, 'palette has at least 12 effects, got ' + names.length);

// every effect must schedule without throwing
for (const n of names) {
  scheduled = [];
  const before = DK.sound.context;
  assert.ok(DK.sound.play(n), 'effect ' + n + ' exists');
  assert.ok(scheduled.length > 0, 'effect ' + n + ' scheduled audio nodes');
}

// unknown names are safe
assert.strictEqual(DK.sound.play('does-not-exist'), false);

// toggling enabled off must suppress scheduling
DK.sound.setEnabled(false);
scheduled = [];
DK.sound.play('click');
assert.strictEqual(scheduled.length, 0, 'disabled sound produces no audio');
DK.sound.setEnabled(true);

// configuration from the content document
DK.sound.configure({ sounds: { enabled: true, hover: false, volume: 0.5 } });
assert.strictEqual(DK.sound.isEnabled, true);

// attach() is idempotent
DK.sound.attach(global.document);
DK.sound.attach(global.document);
assert.ok(global.document.__dkSoundBound, 'sound attach marked once');

// reverb path builds the synthetic impulse buffer
DK.sound.play('navigate');
assert.ok(DK.sound.context, 'context created');

console.log('sound: all assertions passed');
console.log('effects:', names.join(', '));