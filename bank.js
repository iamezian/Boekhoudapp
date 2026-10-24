// Leest bankafschriften: CSV-exports (ING, Rabobank, ABN AMRO, bunq, Knab, Triodos, ASN e.a.) en PDF-afschriften.
// Elke transactie: { datum: 'JJJJ-MM-DD', bedrag: centen (negatief = af, positief = bij), naam, omschrijving, tegenrekening }.
(function (root) {
  'use strict';

  const BonLezer = root.BonLezer || (typeof require !== 'undefined' ? require('./bonlezer.js') : null);

  // ---------- Hulpjes ----------
  function datumUit(s) {
    s = String(s || '').trim();
    let m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return geldig(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return geldig(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) return geldig(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    const d = BonLezer.vindDatums(s);
    return d.length ? d[0].datum : null;
  }

  function geldig(j, m, d) {
    if (j < 2000 || j > 2100 || m < 1 || m > 12 || d < 1 || d > new Date(j, m, 0).getDate()) return null;
    return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // "1.234,56", "-12,50", "+12.50", "1,234.56", "12,50-" → centen
  function bedragUit(s) {
    let t = String(s || '').replace(/[€\s]|EUR/gi, '');
    if (!t) return null;
    let teken = 1;
    if (/^-|-$|^\(.*\)$/.test(t)) teken = -1;
    t = t.replace(/^[+-]|[+-]$|[()]/g, '');
    const laatsteKomma = t.lastIndexOf(','), laatstePunt = t.lastIndexOf('.');
    if (laatsteKomma > laatstePunt) t = t.replace(/\./g, '').replace(',', '.');
    else if (laatstePunt > laatsteKomma && laatsteKomma >= 0) t = t.replace(/,/g, '');
    else if (laatstePunt >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return teken * Math.round(parseFloat(t) * 100);
  }

  // ---------- CSV ----------
  function splitsCsvRegel(regel, sep) {
    const uit = [];
    let veld = '', inQuotes = false;
    for (let i = 0; i < regel.length; i++) {
      const c = regel[i];
      if (inQuotes) {
        if (c === '"' && regel[i + 1] === '"') { veld += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else veld += c;
      } else if (c === '"') inQuotes = true;
      else if (c === sep) { uit.push(veld.trim()); veld = ''; }
      else veld += c;
    }
    uit.push(veld.trim());
    return uit;
  }

  function kolom(koppen, patronen) {
    for (const p of patronen) {
      const i = koppen.findIndex((k) => p.test(k));
      if (i >= 0) return i;
    }
    return -1;
  }

  function leesCsv(tekst) {
    const regels = String(tekst || '').replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim());
    if (!regels.length) return [];

    // ABN AMRO .TXT: tab-gescheiden zonder kopregel (rekening, munt, datum JJJJMMDD, beginsaldo, eindsaldo, rentedatum, bedrag, omschrijving)
    const eerste = regels[0].split('\t');
    if (eerste.length >= 8 && /^\d{8}$/.test(eerste[2])) {
      return regels.map((r) => r.split('\t')).filter((v) => v.length >= 8).map((v) => {
        const oms = v.slice(7).join(' ').replace(/\s+/g, ' ').trim();
        return { datum: datumUit(v[2]), bedrag: bedragUit(v[6]), naam: naamUitOmschrijving(oms), omschrijving: oms, tegenrekening: '' };
      }).filter((t) => t.datum && t.bedrag);
    }

    // Scheidingsteken en kopregel zoeken
    const seps = [';', ',', '\t'];
    let kopIndex = -1, sep = ';';
    for (let i = 0; i < Math.min(regels.length, 15) && kopIndex < 0; i++) {
      for (const s of seps) {
        const velden = splitsCsvRegel(regels[i], s).map((v) => v.toLowerCase());
        if (velden.length >= 3 && velden.some((v) => /datum|date/.test(v)) && velden.some((v) => /bedrag|amount/.test(v))) {
          kopIndex = i; sep = s; break;
        }
      }
    }
    if (kopIndex < 0) return [];
    const koppen = splitsCsvRegel(regels[kopIndex], sep).map((k) => k.toLowerCase().replace(/\s+/g, ' ').trim());

    const iDatum = kolom(koppen, [/^(transactiedatum|boekdatum|boekingsdatum|datum|date|transaction date)$/, /datum|date/]);
    const iBedrag = kolom(koppen, [/^bedrag \(eur\)$/, /^(bedrag|amount|transactiebedrag|bedrag eur)$/, /bedrag|amount/]);
    const iAfBij = kolom(koppen, [/^(af ?\/? ?bij|debet ?\/ ?credit|credit ?\/ ?debit|d\/c|c\/d|debit\/credit|af_bij)$/, /af.?bij|debet|credit/]);
    const iNaam = kolom(koppen, [/naam tegenpartij|naam \/ omschrijving|tegenpartij naam|counterparty name/, /^(naam|name)$/, /begunstigde|naam ontvanger|^counterparty$/]);
    const iTegen = kolom(koppen, [/tegenrekening|counterparty iban|iban tegenpartij|^account$|^rekening tegenpartij/]);
    const iOms = koppen.map((k, i) => (/mededeling|omschrijving|description|^memo$|betalingskenmerk/.test(k) && i !== iNaam ? i : -1)).filter((i) => i >= 0);
    if (iDatum < 0 || iBedrag < 0) return [];

    const uit = [];
    for (const regel of regels.slice(kopIndex + 1)) {
      const v = splitsCsvRegel(regel, sep);
      if (v.length < 3) continue;
      let bedrag = bedragUit(v[iBedrag]);
      if (bedrag == null) continue;
      if (iAfBij >= 0) {
        const ab = (v[iAfBij] || '').toLowerCase();
        if (/^(af|d|debet|debit)$/.test(ab)) bedrag = -Math.abs(bedrag);
        else if (/^(bij|c|credit)$/.test(ab)) bedrag = Math.abs(bedrag);
      }
      const oms = iOms.map((i) => v[i]).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const naam = (iNaam >= 0 ? v[iNaam] : '') || naamUitOmschrijving(oms);
      const datum = datumUit(v[iDatum]);
      if (datum && bedrag) uit.push({ datum, bedrag, naam: naam.trim(), omschrijving: oms, tegenrekening: iTegen >= 0 ? v[iTegen] || '' : '' });
    }
    return uit;
  }

  // ABN AMRO en sommige PDF's zetten de naam in de omschrijving: "/TRTP/SEPA OVERBOEKING/IBAN/.../NAME/Jansen BV/REMI/..."
  function naamUitOmschrijving(oms) {
    let m = oms.match(/\/NAME\/([^/]+)/i);
    if (m) return m[1].trim();
    m = oms.match(/Naam:\s*(.+?)(?:\s{2,}|Omschrijving:|IBAN:|Kenmerk:|$)/i);
    if (m) return m[1].trim();
    m = oms.match(/^(?:BEA|GEA|Betaalautomaat|Pinbetaling)[^,]*?\s{1,}(.+?),?(?:PAS|\s\d{2}[.:]\d{2}|$)/i);
    if (m) return m[1].trim();
    return oms.slice(0, 40).trim();
  }

  // ---------- PDF / tekst ----------
  const SALDO = /saldo|totaal (af|bij)|opening balance|closing balance/i;
  const AF_KOP = /^(af|bedrag af|debet|debit|uitgaven|afschrijving(en)?)$/i;
  const BIJ_KOP = /^(bij|bedrag bij|credit|inkomsten|bijschrijving(en)?)$/i;

  function isAfschrift(tekst, pad) {
    if (/bank|afschrift|rekeningoverzicht/i.test(pad || '')) return true;
    const t = String(tekst || '');
    return /(rekeningafschrift|bankafschrift|afschrift|account statement|transactieoverzicht|rekeningoverzicht|beginsaldo|eindsaldo|saldo (oud|nieuw|begin|eind)|nieuw saldo|vorig saldo)/i.test(t) &&
      /(iban|rekeningnummer|rekening)/i.test(t);
  }

  // Jaar van het afschrift, voor datums zonder jaartal ("12-03" of "12 mrt")
  function jaarUit(tekst) {
    const m = String(tekst || '').match(/(?:periode|afschrift|datum|statement)[^\n]*?(20\d{2})/i) || String(tekst || '').match(/\b(20\d{2})\b/);
    return m ? +m[1] : new Date().getFullYear();
  }

  const DATUM_START = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?=\s|$)|^(\d{1,2})\s+(jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?(?=\s|$)/i;
  const MND = { jan: 1, feb: 2, mrt: 3, maa: 3, apr: 4, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };

  function datumAanStart(tekst, jaar) {
    const m = tekst.match(DATUM_START);
    if (!m) return null;
    if (m[1]) return { datum: geldig(m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : jaar, +m[2], +m[1]), lengte: m[0].length };
    return { datum: geldig(m[6] ? +m[6] : jaar, MND[m[5].toLowerCase().slice(0, 3)], +m[4]), lengte: m[0].length };
  }

  const BEDRAG_DEEL = /^[+-]?\s?(\d{1,3}(?:[.,]\d{3})*|\d+)[.,]\d{2}\s?(-|\+|af|bij|d|c|cr|db)?$/i;

  // rijen: [{ delen: [{ x, s }] }] van boven naar beneden (uit de PDF-tekstlaag), of alleen tekstregels (OCR)
  function leesRijen(rijen, tekst) {
    const jaar = jaarUit(tekst);
    // Kolommen "Af" en "Bij" zoeken
    let xAf = null, xBij = null;
    for (const rij of rijen) {
      for (const d of rij.delen || []) {
        if (AF_KOP.test(d.s.trim())) xAf = d.x;
        if (BIJ_KOP.test(d.s.trim())) xBij = d.x;
      }
      if (xAf != null && xBij != null) break;
    }
    const kolommen = xAf != null && xBij != null;

    const uit = [];
    let huidig = null;
    for (const rij of rijen) {
      const delen = rij.delen || [{ x: 0, s: rij.tekst || '' }];
      const tekstRij = delen.map((d) => d.s).join(' ').replace(/\s+/g, ' ').trim();
      if (!tekstRij) continue;
      const start = datumAanStart(tekstRij, jaar);

      // Bedragen in deze rij met hun positie
      const bedragen = [];
      delen.forEach((d) => {
        d.s.trim().split(/\s{2,}/).forEach((stuk) => {
          if (BEDRAG_DEEL.test(stuk.trim())) bedragen.push({ x: d.x, s: stuk.trim() });
        });
      });
      if (!delen.length || (delen.length === 1 && !kolommen)) {
        // Alleen tekst (OCR): bedragen achteraan de regel
        const m = tekstRij.match(/([+-]?\s?(?:\d{1,3}(?:[.,]\d{3})*|\d+)[.,]\d{2}\s?(?:-|\+|af|bij|d|c|cr|db)?)\s*$/i);
        if (m && !bedragen.length) bedragen.push({ x: 0, s: m[1] });
      }

      if (start && start.datum && bedragen.length && !SALDO.test(tekstRij)) {
        const b = bedragen[0];
        let bedrag = bedragUit(b.s.replace(/\s?(af|bij|d|c|cr|db)$/i, ''));
        const achter = (b.s.match(/(af|bij|d|c|cr|db|-|\+)$/i) || [])[1];
        const naRij = tekstRij.slice(tekstRij.lastIndexOf(b.s) + b.s.length).trim().toLowerCase();
        let zeker = true;
        if (kolommen) bedrag = Math.abs(bedrag) * (Math.abs(b.x - xAf) <= Math.abs(b.x - xBij) ? -1 : 1);
        else if (achter && /^(af|d|db|-)$/i.test(achter) || /^(af|d|debet)\b/.test(naRij)) bedrag = -Math.abs(bedrag);
        else if (achter && /^(bij|c|cr|\+)$/i.test(achter) || /^(bij|c|credit)\b/.test(naRij)) bedrag = Math.abs(bedrag);
        else if (!/^[+-]/.test(b.s)) { bedrag = -Math.abs(bedrag); zeker = false; } // onbekend: aangenomen als afschrijving
        let oms = tekstRij.slice(start.lengte);
        bedragen.forEach((x) => { oms = oms.replace(x.s, ' '); });
        oms = oms.replace(/\s(af|bij)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
        // Soms staat een tweede datum (valutadatum) vooraan de omschrijving
        const tweede = datumAanStart(oms, jaar);
        if (tweede) oms = oms.slice(tweede.lengte).trim();
        huidig = { datum: start.datum, bedrag, naam: '', omschrijving: oms, tegenrekening: '', zeker };
        uit.push(huidig);
      } else if (huidig && !start && !bedragen.length && !SALDO.test(tekstRij) && huidig.omschrijving.length < 200) {
        // Vervolgregel van de omschrijving
        huidig.omschrijving = (huidig.omschrijving + ' ' + tekstRij).trim();
      } else if (start) {
        huidig = null;
      }
    }
    uit.forEach((t) => { t.naam = naamUitOmschrijving(t.omschrijving); });
    return uit.filter((t) => t.bedrag);
  }

  function leesTekst(tekst) {
    return leesRijen(String(tekst || '').split(/\r?\n/).map((r) => ({ tekst: r })), tekst);
  }

  // ---------- Transactiebewijs ----------
  // Eén betaling per PDF, zoals je die uit de app van Knab, ING, Rabobank of bunq deelt:
  //   "Belastingdienst  -€75,00 / Datum 27 jul 2026 / Type Periodieke incasso / Omschrijving ..."
  function leesTransactieBewijs(tekst) {
    const t = String(tekst || '');
    if (!/(^|\n)\s*(datum|date|transactiedatum|boekdatum)\b/i.test(t) || !/(rekeningnummer|rekeningnaam|iban|incassant|tegenrekening|type)/i.test(t)) return null;
    const kop = t.match(/^\s*(.+?)\s+([-+−])\s*€\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/m) ||
      t.match(/^\s*(.+?)\s+€\s*([-+−])\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/m);
    if (!kop) return null;
    const datumRegel = t.match(/(?:^|\n)\s*(?:datum|date|transactiedatum|boekdatum)\s*:?\s*(.+)/i);
    const datum = datumRegel ? datumUit(datumRegel[1]) : null;
    if (!datum) return null;
    const bedrag = bedragUit(kop[3]) * (kop[2] === '+' ? 1 : -1);
    // Omschrijving: de regels na "Omschrijving" tot het volgende kopje
    let omschrijving = '';
    const m = t.match(/(?:^|\n)\s*(?:omschrijving|mededeling|description)\s*:?\s*([\s\S]*?)(?=\n\s*(?:naam|rekeningnummer|rekeningnaam|iban|type|kenmerk|datum)\b|$)/i);
    if (m) omschrijving = m[1].replace(/\s+/g, ' ').replace(/-\s(?=\d)/g, '-').trim();
    const type = (t.match(/(?:^|\n)\s*type\s*:?\s*(.+)/i) || [])[1] || '';
    return { datum, bedrag, naam: kop[1].replace(/\s+/g, ' ').trim(), omschrijving: (omschrijving + ' ' + type).trim(), tegenrekening: '' };
  }

  // ---------- Transactie → boeking ----------
  const BELASTINGDIENST = /belastingdienst/i;
  const EIGEN_REKENING = /spaarrekening|eigen rekening|naar spaar|van spaar|oranje spaar|spaardeposito|overboeking eigen|privérekening|prive rekening|bunq savings/i;
  const GELDAUTOMAAT = /geldautomaat|geldopname|\bgea\b|atm|cash withdrawal/i;

  // hint: { categorie } uit de map in de ZIP, bijv. "Sponsoring"
  function naarBoeking(t, hint) {
    const tekst = `${t.naam} ${t.omschrijving}`;
    const notities = [];
    const b = {
      soort: t.bedrag < 0 ? 'kost' : 'inkomst',
      datum: t.datum,
      bedrag: Math.abs(t.bedrag),
      inclBtw: true,
      tarief: 0,
      btwBedrag: null,
      btwAftrekbaar: true,
      categorie: null,
      omschrijving: (BonLezer.vindMerk([t.naam || '']) || t.naam || t.omschrijving || 'Banktransactie').slice(0, 60),
      notities,
      zeker: t.zeker !== false,
      bank: true,
    };
    let meenemen = true;

    if (b.soort === 'kost') {
      let cat = BonLezer.categoriseer(tekst);
      // Map in de ZIP bepaalt de soort, behalve als de betaling zelf duidelijk iets anders is (MRB, verzekering)
      if (hint && hint.categorie && !cat.mrb && !['verzekering', 'belastingen'].includes(cat.categorie)) {
        cat = Object.assign(BonLezer.categoriseer(hint.categorie === 'auto' ? 'garage' : hint.categorie), { categorie: hint.categorie });
      }
      b.categorie = cat.categorie;
      if (cat.mrb) {
        const kenteken = (tekst.match(/[A-Z0-9]{1,3}-[A-Z0-9]{1,3}-[A-Z0-9]{1,3}/) || [])[0];
        b.omschrijving = 'Motorrijtuigenbelasting' + (kenteken ? ' ' + kenteken : '');
      }
      if (cat.aftrekbaar === false) b.btwAftrekbaar = false;
      if (BELASTINGDIENST.test(tekst) && cat.categorie !== 'belastingen') {
        meenemen = false;
        notities.push('Betaling aan de Belastingdienst (btw of inkomstenbelasting) is geen kost. Alleen motorrijtuigenbelasting voor een zakelijke auto telt als kosten.');
      } else if (EIGEN_REKENING.test(tekst)) {
        meenemen = false;
        notities.push('Overboeking naar je eigen rekening: geen kosten.');
      } else if (GELDAUTOMAAT.test(tekst)) {
        meenemen = false;
        notities.push('Geld opnemen is geen kost. Lees liever de bonnen in van wat je ermee betaald hebt.');
      } else if (cat.prive) {
        meenemen = false;
      } else if (cat.brandstof) {
        b.tarief = 21;
        notities.push('Tanken: gerekend met 21% btw (brandstof heeft in Nederland altijd 21%). Bewaar de tankbon.');
      } else if (!cat.geenBtw) {
        notities.push('Op een bankafschrift staat geen btw. Heb je de factuur of bon? Lees die in voor de btw, of zet hier het tarief.');
      }
      if (cat.notitie && !cat.brandstof) notities.push(cat.notitie);
    } else {
      // Bijschrijving: meestal betaling van een factuur die je al als inkomsten hebt, dus standaard niet meenemen
      meenemen = false;
      b.tarief = 21;
      notities.push('Bijschrijving: vink aan als dit omzet is waarvan je de factuur niet hebt ingelezen. Controleer het btw-tarief.');
      if (BELASTINGDIENST.test(tekst)) notities.push('Teruggave van de Belastingdienst is geen omzet.');
    }
    if (!b.zeker) notities.unshift('Niet zeker of dit af of bij was: controleer het.');
    return { boeking: b, meenemen };
  }

  const api = { leesCsv, leesRijen, leesTekst, leesTransactieBewijs, isAfschrift, naarBoeking, bedragUit, datumUit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BankLezer = api;
})(this);
