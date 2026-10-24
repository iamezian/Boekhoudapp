const test = require('node:test');
const assert = require('node:assert');
const IB = require('../ib.js');

test('zzp 2026, winst € 50.000, urencriterium', () => {
  const r = IB.bereken({ jaar: 2026, winst: 5000000, urencriterium: true });
  assert.strictEqual(r.zelfstandigenaftrek, 120000);
  assert.strictEqual(r.mkb, 619760);
  assert.strictEqual(r.belastbareWinst, 4260240);
  assert.strictEqual(r.belastingVoorKorting, 1529768);
  assert.strictEqual(r.aftrekbeperking, 0);
  assert.strictEqual(r.zvw, 206622);
  // AHK 2.291,81 + AK 5.626,77
  assert.strictEqual(r.inkomstenbelasting, 1529768 - 229181 - 562677);
});

test('hoge winst: aftrekbeperking en maximum Zvw', () => {
  const r = IB.bereken({ jaar: 2026, winst: 15000000, urencriterium: true });
  assert.ok(r.aftrekbeperking > 0);
  assert.strictEqual(r.zvw, Math.round(7940900 * 4.85 / 100));
});

test('horeca 80% en geen urencriterium', () => {
  const r = IB.bereken({ jaar: 2026, winst: 2000000, horecaKosten: 100000, urencriterium: false });
  assert.strictEqual(r.nietAftrekbaarHoreca, 20000);
  assert.strictEqual(r.zelfstandigenaftrek, 0);
  assert.strictEqual(r.fiscaleWinst, 2020000);
});

test('onbekend jaar gebruikt dichtstbijzijnde tarieven', () => {
  assert.strictEqual(IB.bereken({ jaar: 2027, winst: 0 }).benadering, true);
});
