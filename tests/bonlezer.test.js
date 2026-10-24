const test = require('node:test');
const assert = require('node:assert');
const { lees, vindDatums } = require('../bonlezer.js');

test('datums numeriek en met maandnaam', () => {
  const d = (t) => vindDatums(t).map((x) => x.datum);
  assert.deepStrictEqual(d('Datum: 12-03-2026'), ['2026-03-12']);
  assert.deepStrictEqual(d('12/3/26 14:05'), ['2026-03-12']);
  assert.deepStrictEqual(d('2026-03-12'), ['2026-03-12']);
  assert.deepStrictEqual(d('12.03.2026'), ['2026-03-12']);
  assert.deepStrictEqual(d('12 maart 2026'), ['2026-03-12']);
  assert.deepStrictEqual(d('3 mrt. 2026'), ['2026-03-03']);
  assert.deepStrictEqual(d('vrijdag 1 januari 2027'), ['2027-01-01']);
  assert.deepStrictEqual(d("5 okt '26"), ['2026-10-05']);
  assert.deepStrictEqual(d('March 12, 2026'), ['2026-03-12']);
  assert.deepStrictEqual(d('12th Mar 2026'), ['2026-03-12']);
  assert.deepStrictEqual(d('14-OCT-2026'), ['2026-10-14']);
  assert.deepStrictEqual(d('Totaal 12,50'), []);
});

test('kassabon supermarkt met 9% en 21%', () => {
  const r = lees(`ALBERT HEIJN
Filiaal 1234 Amsterdam
KOFFIE BONEN        8,99
PRINTPAPIER         6,49
TOTAAL             15,48
PINNEN             15,48
BTW   OVER    EUR
9%    8,25   0,74
21%   5,36   1,13
13-02-2026 10:22`, 'bon.jpg');
  assert.strictEqual(r.bedrag, 1548);
  assert.strictEqual(r.datum, '2026-02-13');
  assert.strictEqual(r.btwBedrag, 187);
  assert.strictEqual(r.omschrijving, 'ALBERT HEIJN');
  assert.strictEqual(r.btwAftrekbaar, true);
});

test('factuur met 21% btw', () => {
  const r = lees(`Coolblue B.V.
Factuur
Factuurnummer 123456
Factuurdatum: 4 september 2026
Vervaldatum: 18 september 2026
MacBook Air 13 inch       1.239,67
Subtotaal excl. btw       1.239,67
BTW 21%                     260,33
Totaal incl. btw          1.500,00`, 'factuur.pdf');
  assert.strictEqual(r.bedrag, 150000);
  assert.strictEqual(r.tarief, 21);
  assert.strictEqual(r.btwBedrag, 26033);
  assert.strictEqual(r.datum, '2026-09-04');
  assert.strictEqual(r.categorie, 'inventaris');
  assert.ok(r.notities.some((n) => /afschrijven/.test(n)));
});

test('vliegticket: kosten, btw niet verrekenbaar', () => {
  const r = lees(`KLM Royal Dutch Airlines
E-ticket receipt
Booking date: 02 OCT 2026
Flight KL1001 Amsterdam - London   Departure 15 OCT 2026
Fare            180.00
Taxes and fees   64.50
Total amount paid EUR 244.50`, 'ticket.pdf');
  assert.strictEqual(r.bedrag, 24450);
  assert.strictEqual(r.datum, '2026-10-02');
  assert.strictEqual(r.categorie, 'reizen');
  assert.strictEqual(r.btwAftrekbaar, false);
  assert.ok(r.notities.some((n) => /Vliegticket/.test(n)));
});

test('restaurant: btw niet aftrekbaar', () => {
  const r = lees(`Brasserie De Haven
Rotterdam
2x Lunch      32,00
Totaal        39,50
Btw 9%         3,26
21-08-2026`, 'IMG_1234.HEIC');
  assert.strictEqual(r.bedrag, 3950);
  assert.strictEqual(r.tarief, 9);
  assert.strictEqual(r.categorie, 'horeca');
  assert.strictEqual(r.btwAftrekbaar, false);
});

test('bon zonder btw en zonder datum', () => {
  const r = lees(`Parkeergarage Centrum
Te betalen 7,50`, 'parkeren.jpg');
  assert.strictEqual(r.bedrag, 750);
  assert.strictEqual(r.tarief, 0);
  assert.strictEqual(r.datum, null);
  assert.strictEqual(r.zeker, false);
});
