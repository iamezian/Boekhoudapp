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
  assert.strictEqual(r.omschrijving, 'Albert Heijn');
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

test('tankbonnen: btw ook bij OCR-fouten of zonder btw-regel', () => {
  const r1 = lees('TinQ Amersfoort\nEuro95 30,00 L a 1,949\nTotaal 58,47\nBTVV 21% 10,15\n05.10.2026', 'a.jpg');
  assert.deepStrictEqual([r1.tarief, r1.btwBedrag, r1.categorie], [21, 1015, 'auto']);
  const r2 = lees('BP Zaandam\nUltimate 95  48,10\nTotaal  48,10\nIncl. 21% 8,35\n1-10-2026', 'b.jpg');
  assert.strictEqual(r2.btwBedrag, 835);
  const r3 = lees('TOTAL Energies\nBetaald met PIN\nBedrag EUR 90,00\nBrandstof Euro 95\n20-09-2026', 'c.jpg');
  assert.strictEqual(r3.tarief, 21);
  assert.strictEqual(require('../btw.js').splits(r3).btw, 1562);
});

test('map in ZIP: inkomsten en sponsoring', () => {
  const { hintUitPad } = require('../bonlezer.js');
  assert.deepStrictEqual(hintUitPad('Q3/Inkomsten/factuur-014.pdf'), { soort: 'inkomst' });
  assert.deepStrictEqual(hintUitPad('Sponsoring/vv.pdf'), { soort: 'kost', categorie: 'sponsoring' });
  assert.strictEqual(hintUitPad('los.pdf'), null);
  const inkomst = lees('Mijn Bedrijf\nFactuur\nFactuurnummer: 2026-014\nFactuur aan:\nKlant BV\nFactuurdatum 30-09-2026\nTotaal excl. btw 1.000,00\nBtw 21% 210,00\nTotaal 1.210,00', 'f.pdf', { hint: { soort: 'inkomst' } });
  assert.deepStrictEqual([inkomst.soort, inkomst.bedrag, inkomst.btwBedrag, inkomst.categorie], ['inkomst', 121000, 21000, null]);
  assert.strictEqual(inkomst.omschrijving, 'Factuur 2026-014 – Klant BV');
  const sponsor = lees('VV De Meern\nFactuur sponsorpakket\nTotaal 302,50\nBtw 21% 52,50\n01-09-2026', 's.pdf', { hint: { soort: 'kost', categorie: 'sponsoring' } });
  assert.deepStrictEqual([sponsor.categorie, sponsor.btwBedrag, sponsor.btwAftrekbaar], ['sponsoring', 5250, true]);
});

test('motorrijtuigenbelasting: kosten zonder btw', () => {
  const r = lees('Belastingdienst\nAanslag motorrijtuigenbelasting\nKenteken AB-123-C\nTe betalen 312,00\nDagtekening 1 september 2026', 'mrb.pdf');
  assert.deepStrictEqual([r.categorie, r.tarief, r.bedrag], ['belastingen', 0, 31200]);
  assert.ok(r.notities.some((n) => /zakelijk/.test(n)));
  assert.ok(!r.notities.some((n) => /Geen btw op de bon/.test(n)));
});

test('aanslag: dagtekening, niet het tijdvak', () => {
  const r = lees('Belastingdienst\nAanslag motorrijtuigenbelasting\nTijdvak: 01-10-2026 t/m 31-12-2026\nDagtekening: 2 oktober 2026\nTe betalen 312,00', 'mrb.pdf');
  assert.strictEqual(r.datum, '2026-10-02');
  assert.strictEqual(require('../bonlezer.js').categoriseer('Voetbalvereniging sponsorpakket').categorie, 'sponsoring');
});

test('telefoonfactuur: totaal incl. btw, niet het toestelkrediet', () => {
  const r = lees(`Factuur KPN Mobiel
Klantnummer 12345678901  Factuurdatum 22 september 2026
Totaal (incl. btw)  € 79,06
Totaal excl. btw  72,45
Btw nvt over 41,00  0,00
Btw 21% over 31,45  6,61
Toestel per maand 1  41,00
Resterend bedrag : 476,97 €
Totaal  79,06`, 'kpn.pdf');
  assert.deepStrictEqual([r.bedrag, r.btwBedrag, r.categorie, r.datum], [7906, 661, 'telefoon', '2026-09-22']);
});

test('self-billing remittance als inkomsten', () => {
  const r = lees(`DIENSTEN VERRICHT DOOR:  Voorbeeld Detachering B.V
Mijn Bedrijf  1234 AB UTRECHT
Factuur nummer:  12345678.1
Factuurdatum:  14/07/2026
FACTUUR UITGEREIKT DOOR AFNEMER
Totaal exclusief BTW (€)  7.260,00
BTW 21,00% over € 7.260,00:  1.524,60
Totaal inclusief BTW (€)  8.784,60`, 'remittance.pdf', { hint: { soort: 'inkomst' } });
  assert.deepStrictEqual([r.soort, r.bedrag, r.btwBedrag, r.datum], ['inkomst', 878460, 152460, '2026-07-14']);
  assert.strictEqual(r.omschrijving, 'Factuur 12345678.1 – Voorbeeld Detachering B.V');
});

test('map auto zonder brandstof: geen tankbon-melding', () => {
  const r = lees('AliExpress\nBestelling\nTotaal € 112,21\n24-09-2026', 'a.png', { hint: { soort: 'kost', categorie: 'auto' } });
  assert.strictEqual(r.categorie, 'auto');
  assert.ok(!r.notities.some((n) => /Brandstof|Tankbon/.test(n)));
});

test('kwartaal uit de mapnaam', () => {
  const { hintUitPad } = require('../bonlezer.js');
  assert.deepStrictEqual(hintUitPad('Facturen Q3 2026 /Inkomsten /a.pdf'), { soort: 'inkomst', kwartaal: 3, jaar: 2026 });
  assert.deepStrictEqual(hintUitPad('Facturen Q3 2026 /Bedrijfskosten verzekeringen:wegenbelasting/b.pdf'), { soort: 'kost', kwartaal: 3, jaar: 2026 });
});
