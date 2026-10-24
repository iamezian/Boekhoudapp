const test = require('node:test');
const assert = require('node:assert');
const Bank = require('../bank.js');

test('ING CSV (puntkomma, Af Bij)', () => {
  const csv = `"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"
"20261003";"SHELL UTRECHT";"NL01INGB0001234567";"";"BA";"Af";"76,23";"Betaalautomaat";"Pasvolgnr: 001 03-10-2026 14:32";"1.234,56";""
"20261005";"Klant BV";"NL01INGB0001234567";"NL22RABO0123456789";"OV";"Bij";"1.210,00";"Overschrijving";"Naam: Klant BV Omschrijving: Factuur 2026-014";"2.444,56";""
"20261006";"Belastingdienst";"NL01INGB0001234567";"NL86INGB0002445588";"OV";"Af";"312,00";"Overschrijving";"Omschrijving: motorrijtuigenbelasting kenteken AB-123-C";"2.132,56";""`;
  const t = Bank.leesCsv(csv);
  assert.strictEqual(t.length, 3);
  assert.deepStrictEqual([t[0].datum, t[0].bedrag, t[0].naam], ['2026-10-03', -7623, 'SHELL UTRECHT']);
  assert.strictEqual(t[1].bedrag, 121000);
  const shell = Bank.naarBoeking(t[0]);
  assert.strictEqual(shell.boeking.categorie, 'auto');
  assert.strictEqual(shell.boeking.tarief, 21);
  assert.strictEqual(shell.meenemen, true);
  const mrb = Bank.naarBoeking(t[2]);
  assert.strictEqual(mrb.boeking.categorie, 'belastingen');
  assert.strictEqual(mrb.meenemen, true);
  assert.strictEqual(Bank.naarBoeking(t[1]).boeking.soort, 'inkomst');
  assert.strictEqual(Bank.naarBoeking(t[1]).meenemen, false);
});

test('Rabobank CSV (komma, teken in bedrag)', () => {
  const csv = `"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3"
"NL11RABO0101234567","EUR","RABONL2U","000000000000001234","2026-10-01","2026-10-01","-45,99","+1.000,00","NL12KPNB0123","KPN B.V.","","","","id","","","","","","Abonnement oktober","",""
"NL11RABO0101234567","EUR","RABONL2U","000000000000001235","2026-10-02","2026-10-02","-500,00","+500,00","NL99RABO0999","Eigen spaarrekening","","","","tb","","","","","","Naar spaarrekening","",""`;
  const t = Bank.leesCsv(csv);
  assert.strictEqual(t.length, 2);
  assert.deepStrictEqual([t[0].datum, t[0].bedrag, t[0].naam, t[0].omschrijving], ['2026-10-01', -4599, 'KPN B.V.', 'Abonnement oktober']);
  assert.strictEqual(Bank.naarBoeking(t[0]).boeking.categorie, 'telefoon');
  assert.strictEqual(Bank.naarBoeking(t[1]).meenemen, false);
});

test('ABN AMRO TXT', () => {
  const txt = '123456789\tEUR\t20261007\t1000,00\t950,00\t20261007\t-50,00\tBEA, Betaalpas   Esso Express Utrecht,PAS123 NR:ABC 07.10.26/10:12 UTRECHT';
  const t = Bank.leesCsv(txt);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].bedrag, -5000);
  assert.strictEqual(t[0].datum, '2026-10-07');
  assert.match(t[0].naam, /Esso/);
});

test('bunq CSV (punt als decimaal)', () => {
  const csv = `"Date","Interest Date","Amount","Account","Counterparty","Name","Description"
"2026-10-08","2026-10-08","-12.50","NL00BUNQ","NL00","Q-Park","Parkeren centrum"`;
  const t = Bank.leesCsv(csv);
  assert.deepStrictEqual([t[0].bedrag, t[0].naam], [-1250, 'Q-Park']);
  assert.strictEqual(Bank.naarBoeking(t[0]).boeking.categorie, 'auto');
});

test('PDF-afschrift met kolommen Af en Bij', () => {
  const rijen = [
    { delen: [{ x: 50, s: 'Rekeningafschrift' }, { x: 300, s: 'IBAN NL01INGB0001234567' }] },
    { delen: [{ x: 50, s: 'Periode 1 oktober 2026 t/m 31 oktober 2026' }] },
    { delen: [{ x: 50, s: 'Datum' }, { x: 120, s: 'Omschrijving' }, { x: 400, s: 'Af' }, { x: 480, s: 'Bij' }] },
    { delen: [{ x: 50, s: '01-10' }, { x: 120, s: 'Vorig saldo' }, { x: 480, s: '1.000,00' }] },
    { delen: [{ x: 50, s: '03-10' }, { x: 120, s: 'Shell Utrecht' }, { x: 400, s: '76,23' }] },
    { delen: [{ x: 120, s: 'Pasvolgnr 001 14:32' }] },
    { delen: [{ x: 50, s: '05-10' }, { x: 120, s: 'Klant BV Factuur 2026-014' }, { x: 480, s: '1.210,00' }] },
    { delen: [{ x: 50, s: '06-10' }, { x: 120, s: 'Sponsoring VV De Meern' }, { x: 400, s: '250,00' }] },
  ];
  const tekst = rijen.map((r) => r.delen.map((d) => d.s).join(' ')).join('\n');
  assert.ok(Bank.isAfschrift(tekst));
  const t = Bank.leesRijen(rijen, tekst);
  assert.strictEqual(t.length, 3);
  assert.deepStrictEqual(t.map((x) => [x.datum, x.bedrag]), [['2026-10-03', -7623], ['2026-10-05', 121000], ['2026-10-06', -25000]]);
  assert.match(t[0].omschrijving, /Pasvolgnr/);
  assert.strictEqual(Bank.naarBoeking(t[2]).boeking.categorie, 'sponsoring');
});

test('gescand afschrift (tekst met Af/Bij)', () => {
  const t = Bank.leesTekst(`Bankafschrift oktober 2026 IBAN NL01\n03-10-2026 Tango Amersfoort 58,47 Af\n04-10-2026 Klant BV 605,00 Bij\nNieuw saldo 1.546,53`);
  assert.deepStrictEqual(t.map((x) => [x.datum, x.bedrag]), [['2026-10-03', -5847], ['2026-10-04', 60500]]);
});
