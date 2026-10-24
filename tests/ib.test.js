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

test('startersaftrek automatisch op basis van startjaar', () => {
  assert.deepStrictEqual(IB.starterStatus(2026, 2024), { recht: true, jaarNummer: 3, keer: 3 });
  assert.strictEqual(IB.starterStatus(2024, 2024).keer, 1);
  assert.strictEqual(IB.starterStatus(2027, 2024).recht, false);
  // Eén jaar niet aan het urencriterium voldaan: in het 4e jaar nog recht
  assert.strictEqual(IB.starterStatus(2027, 2024, 1).recht, true);
  assert.strictEqual(IB.starterStatus(2030, 2024, 3).recht, false);
  assert.strictEqual(IB.starterStatus(2023, 2024).recht, false);
  assert.strictEqual(IB.starterStatus(2026, null).recht, false);
});

test('starter in 2026: zelfstandigenaftrek + startersaftrek', () => {
  const r = IB.bereken({ jaar: 2026, winst: 5000000, urencriterium: true, starter: true });
  assert.strictEqual(r.startersaftrek, 212300);
  assert.strictEqual(r.zelfstandigenaftrek + r.startersaftrek, 332300);
});
