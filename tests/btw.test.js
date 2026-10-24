const test = require('node:test');
const assert = require('node:assert');
const BTW = require('../btw.js');

test('bedragen invoeren', () => {
  assert.strictEqual(BTW.parseBedrag('12,50'), 1250);
  assert.strictEqual(BTW.parseBedrag('1.234,56'), 123456);
  assert.strictEqual(BTW.parseBedrag('12.5'), 1250);
  assert.strictEqual(BTW.parseBedrag('12.500'), 1250000);
  assert.strictEqual(BTW.parseBedrag('€ 100'), 10000);
  assert.strictEqual(BTW.parseBedrag('abc'), null);
  assert.strictEqual(BTW.parseBedrag(''), null);
});

test('btw splitsen', () => {
  assert.deepStrictEqual(BTW.splits({ bedrag: 12100, tarief: 21, inclBtw: true }), { excl: 10000, btw: 2100, incl: 12100, nietAftrekbaar: 0 });
  assert.deepStrictEqual(BTW.splits({ bedrag: 10000, tarief: 21, inclBtw: false }), { excl: 10000, btw: 2100, incl: 12100, nietAftrekbaar: 0 });
  assert.deepStrictEqual(BTW.splits({ bedrag: 10900, tarief: 9, inclBtw: true }), { excl: 10000, btw: 900, incl: 10900, nietAftrekbaar: 0 });
  assert.deepStrictEqual(BTW.splits({ bedrag: 5000, tarief: 0, inclBtw: true }), { excl: 5000, btw: 0, incl: 5000, nietAftrekbaar: 0 });
});

test('kwartaaloverzicht en saldo', () => {
  const b = [
    { soort: 'inkomst', bedrag: 100000, tarief: 21, inclBtw: false, datum: '2026-10-05' },
    { soort: 'kost', bedrag: 24200, tarief: 21, inclBtw: true, datum: '2026-11-01' },
    { soort: 'kost', bedrag: 99999, tarief: 21, inclBtw: true, datum: '2026-09-30' }, // ander kwartaal
  ];
  const o = BTW.kwartaalOverzicht(b, 2026, 4);
  assert.strictEqual(o.inkomsten.btw, 21000);
  assert.strictEqual(o.kosten.btw, 4200);
  assert.strictEqual(o.saldoBtw, 16800);
  assert.strictEqual(o.winst, 100000 - 20000);
  const a = BTW.aangifte(o);
  assert.strictEqual(a.r1a.omzet, 1000);
  assert.strictEqual(a.r5b, 42);
  assert.strictEqual(a.totaal, 168);
});

test('terugkrijgen als kosten-btw hoger is', () => {
  const o = BTW.kwartaalOverzicht([{ soort: 'kost', bedrag: 121000, tarief: 21, inclBtw: true, datum: '2026-02-01' }], 2026, 1);
  assert.strictEqual(o.saldoBtw, -21000);
});

test('deadlines', () => {
  const iso = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.strictEqual(iso(BTW.deadline(2026, 1)), '2026-4-30');
  assert.strictEqual(iso(BTW.deadline(2026, 3)), '2026-10-31');
  assert.strictEqual(iso(BTW.deadline(2026, 4)), '2027-1-31');
});

test('btw-bedrag van de bon en niet-aftrekbare btw', () => {
  assert.deepStrictEqual(BTW.splits({ soort: 'kost', bedrag: 1000, tarief: 21, inclBtw: true, btwBedrag: 120 }), { excl: 880, btw: 120, incl: 1000, nietAftrekbaar: 0 });
  assert.deepStrictEqual(BTW.splits({ soort: 'kost', bedrag: 12100, tarief: 21, inclBtw: true, btwAftrekbaar: false }), { excl: 12100, btw: 0, incl: 12100, nietAftrekbaar: 2100 });
});
