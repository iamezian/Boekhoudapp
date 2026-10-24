// Haalt uit de tekst van een bon of factuur: datum, totaalbedrag, btw, soort kosten en aandachtspunten.
// Alle bedragen in centen. Werkt zowel in de browser (window.BonLezer) als in Node (tests).
(function (root) {
  'use strict';

  const MAANDEN = {
    jan: 1, januari: 1, january: 1,
    feb: 2, febr: 2, februari: 2, february: 2,
    mrt: 3, maa: 3, maart: 3, mar: 3, march: 3,
    apr: 4, april: 4,
    mei: 5, may: 5,
    jun: 6, juni: 6, june: 6,
    jul: 7, juli: 7, july: 7,
    aug: 8, augustus: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const MAAND_RE = Object.keys(MAANDEN).sort((a, b) => b.length - a.length).join('|');

  const CATEGORIEEN = {
    algemeen: 'Algemeen',
    reizen: 'Reizen & vervoer',
    horeca: 'Eten & drinken (zakelijk)',
    telefoon: 'Telefoon & internet',
    software: 'Software & abonnementen',
    kantoor: 'Kantoor & materiaal',
    inventaris: 'Apparatuur (laptop, telefoon)',
    auto: 'Auto & brandstof',
    sponsoring: 'Sponsoring & reclame',
    belastingen: 'Belastingen (bijv. motorrijtuigenbelasting)',
    verzekering: 'Verzekeringen',
    bank: 'Bankkosten',
    overig: 'Overig',
  };

  const woorden = (lijst) => new RegExp('(^|[^a-z])(' + lijst.join('|') + ')([^a-z]|$)', 'i');
  const VLUCHT = woorden(['klm', 'transavia', 'ryanair', 'easyjet', 'lufthansa', 'vueling', 'corendon', 'tui fly', 'wizz ?air',
    'british airways', 'air france', 'turkish airlines', 'emirates', 'boarding ?pass', 'instapkaart', 'vlucht', 'vluchtnummer',
    'flight', 'e-ticket', 'luchthaven', 'airport', 'airline', 'schiphol']);
  const VERVOER = woorden(['ns', 'nederlandse spoorwegen', 'ov-?chipkaart', 'ovpay', 'gvb', 'ret', 'htm', 'arriva', 'connexxion',
    'qbuzz', 'trein', 'train', 'taxi', 'uber', 'bolt', 'hotel', 'booking\\.com']);
  // Brandstof: in Nederland altijd 21% btw
  const BRANDSTOF = woorden(['tankstation', 'benzine', 'euro ?95', 'euro ?98', 'e10', 'diesel', 'lpg', 'adblue', 'brandstof', 'tanken',
    'shell', 'esso', 'bp', 'tinq', 'tango', 'total ?energies', 'texaco', 'avia', 'gulf', 'q8', 'argos', 'firezone', 'lukoil',
    'ultimate ?(95|98|diesel)', 'v-power', 'pomp', 'liter', 'ltr', 'laadpaal', 'kwh', 'fastned', 'allego', 'ionity']);
  const AUTO = woorden(['parkeren', 'parking', 'q-park', 'parkmobile', 'yellowbrick', 'easypark', 'garage', 'apk', 'wasstraat',
    'autowas', 'banden', 'anwb', 'kenteken', 'onderhoud auto', 'leaseauto', 'lease']);
  const MRB = /motorrijtuigen\s*belasting|wegenbelasting|(^|[^a-z])mrb([^a-z]|$)/i;
  const VERZEKERING = woorden(['verzekering', 'verzekeringen', 'verzekeraar', 'vers\\.', 'polis', 'polisnummer', 'premie', 'assurantie',
    'insurance', 'allianz', 'centraal beheer', 'interpolis', 'nationale[- ]nederlanden', 'aegon', 'a\\.s\\.r\\.?', 'asr', 'ohra',
    'fbto', 'univé', 'unive', 'inshared', 'achmea', 'reaal', 'unigarant', 'klaverblad', 'movir', 'hiscox', 'de goudse', 'anwb verzekeren',
    'autoverzekering', 'aansprakelijkheid', 'arbeidsongeschiktheid', 'aov']);
  // Zorgverzekering is privé, ook voor ondernemers
  const ZORG = woorden(['zorgverzekering', 'zilveren kruis', 'cz', 'vgz', 'menzis', 'dsw', 'zorg en zekerheid', 'ditzo', 'zekur', 'basisverzekering']);
  // Nederlands kenteken, zoals XY-123-Z, 12-ABC-3 of AB-12-CD: drie groepen met letters én cijfers
  const KENTEKEN = /(^|[^a-z0-9-])(?=[a-z0-9-]{8}(?![a-z0-9]))(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)([a-z]{1,3}|\d{1,3})-([a-z]{1,3}|\d{1,3})-([a-z]{1,3}|\d{1,3})(?![a-z0-9])/i;
  const BANKKOSTEN = woorden(['bankkosten', 'kosten betalingsverkeer', 'betaalpakket', 'pakketkosten', 'kosten zakelijk', 'rente', 'transactiekosten']);
  const SPONSOR = woorden(['sponsor[a-z]*', 'shirtsponsor[a-z]*', 'bordsponsor[a-z]*', 'reclame', 'advertentie']);
  const HORECA = woorden(['restaurant', 'café', 'cafe', 'lunchroom', 'lunch', 'diner', 'bistro', 'brasserie', 'eetcafé',
    'starbucks', 'bar', 'horeca', 'mcdonald\'?s', 'burger king', 'kfc', 'subway', 'pizzeria', 'grand ?café']);
  const TELEFOON = woorden(['kpn', 'vodafone', 'odido', 't-mobile', 'ziggo', 'simyo', 'lebara', 'tele2', 'youfone', 'delta fiber', 'telefoon', 'internet']);
  const SOFTWARE = woorden(['adobe', 'microsoft', 'google', 'apple', 'icloud', 'dropbox', 'notion', 'canva', 'github', 'openai',
    'anthropic', 'aws', 'hosting', 'transip', 'mijndomein', 'strato', 'abonnement', 'subscription', 'licentie', 'license']);
  const KANTOOR = woorden(['staples', 'office centre', 'kantoorartikelen', 'printer', 'inkt', 'papier', 'bureau', 'postnl']);
  const INVENTARIS = woorden(['laptop', 'macbook', 'iphone', 'ipad', 'monitor', 'computer', 'coolblue', 'mediamarkt']);
  const BUITENLANDSE_BTW = /(^|[^a-z])(mwst|ust\.|tva|iva|moms|mva)([^a-z]|$)/i;
  const BTW_WOORD = /(^|[^a-z])(b\.?\s?t\.?\s?w\.?|btvv|8tw|b7w|biw|bt\s?vv|vat|tax|mwst|tva|iva)([^a-z]|$)/i;
  const VERLEGD = /btw\s*verlegd|verlegd|reverse[- ]charge|vat\s*reverse/i;
  const TOTAAL = /(totaal|total|te betalen|amount due|amount paid|betaald|bedrag|grand total|totale prijs|pinnen|pin\b|paid|to pay)/i;
  const SUBTOTAAL = /(sub\s*-?\s*tota|excl|zonder btw|ex\.? btw|netto|net amount|before tax)/i;
  const DATUM_LABEL = /(factuurdatum|factuur datum|invoice date|datum|date|besteldatum|order date|boekingsdatum|booking date|transactiedatum|aankoopdatum|dagtekening|issued|uitgifte)/i;
  const DATUM_NIET = /(vervaldatum|verval|due|uiterlijk|geldig tot|valid until|expir|vertrek|departure|aankomst|arrival|geboorte|periode|tijdvak|t\/m)/i;

  // ---------- Datums ----------
  function geldigeDatum(j, m, d) {
    if (j < 100) j += 2000;
    if (j < 2000 || j > 2100 || m < 1 || m > 12 || d < 1) return null;
    const dagen = new Date(j, m, 0).getDate();
    if (d > dagen) return null;
    return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Vindt alle datums in een stuk tekst, numeriek (12-03-2026, 2026-03-12, 12/3/26) en met maandnaam
  // (12 maart 2026, 12 mrt. '26, March 12, 2026, 12th Mar 2026). Geeft [{datum, index, lengte}].
  function vindDatums(tekst) {
    const res = [];
    const voegToe = (datum, m) => { if (datum) res.push({ datum, index: m.index, lengte: m[0].length }); };
    let m;

    const iso = /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g;
    while ((m = iso.exec(tekst))) voegToe(geldigeDatum(+m[1], +m[2], +m[3]), m);

    const num = /(?<![\d.,])(\d{1,2})\s?[-/.]\s?(\d{1,2})\s?[-/.]\s?(\d{4}|\d{2})(?![\d,]|\.\d)/g;
    while ((m = num.exec(tekst))) {
      let d = +m[1], mnd = +m[2];
      // Nederlandse volgorde dag-maand-jaar; alleen omdraaien als dat de enige geldige lezing is
      if (mnd > 12 && d <= 12) [d, mnd] = [mnd, d];
      voegToe(geldigeDatum(+m[3], mnd, d), m);
    }

    const dagMaand = new RegExp(`(?<!\\d)(\\d{1,2})(?:e|ste|de|st|nd|rd|th)?\\.?\\s*(?:-|\\s)\\s*(${MAAND_RE})[a-z]*\\.?\\s*[-,]?\\s*('?\\d{4}|'\\d{2}|\\d{2}(?!\\d))`, 'gi');
    while ((m = dagMaand.exec(tekst))) voegToe(geldigeDatum(+m[3].replace("'", ''), MAANDEN[m[2].toLowerCase()], +m[1]), m);

    const maandDag = new RegExp(`(?<![a-z])(${MAAND_RE})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'gi');
    while ((m = maandDag.exec(tekst))) voegToe(geldigeDatum(+m[3], MAANDEN[m[1].toLowerCase()], +m[2]), m);

    return res.sort((a, b) => a.index - b.index);
  }

  // Kiest de meest waarschijnlijke factuur-/aankoopdatum
  function kiesDatum(regels, vandaag) {
    const kandidaten = [];
    regels.forEach((regel, i) => {
      vindDatums(regel).forEach((d) => {
        let score = 0;
        const context = regel + ' ' + (regels[i - 1] || '');
        if (DATUM_LABEL.test(regel)) score += 3;
        else if (DATUM_LABEL.test(regels[i - 1] || '')) score += 2;
        if (DATUM_NIET.test(context)) score -= 4;
        if (vandaag && d.datum > vandaag) score -= 2;
        kandidaten.push({ datum: d.datum, score, volgorde: kandidaten.length });
      });
    });
    if (!kandidaten.length) return null;
    kandidaten.sort((a, b) => b.score - a.score || a.volgorde - b.volgorde);
    return kandidaten[0].datum;
  }

  // ---------- Bedragen ----------
  function zonderDatums(regel) {
    let uit = regel;
    vindDatums(regel).forEach((d) => { uit = uit.slice(0, d.index) + ' '.repeat(d.lengte) + uit.slice(d.index + d.lengte); });
    return uit.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' '); // tijden
  }

  function vindBedragen(regel) {
    const tekst = zonderDatums(regel);
    const res = [];
    const re = /(\d{1,3}(?:[.,']\d{3})+|\d+)\s?([.,])\s?(\d{2}|-{1,2})(?!\d)/g;
    let m;
    while ((m = re.exec(tekst))) {
      const voor = tekst[m.index - 1];
      if (voor && /[\d.,]/.test(voor)) continue;
      const na = tekst.slice(m.index + m[0].length, m.index + m[0].length + 3);
      if (/^\s*%/.test(na)) continue;
      const heel = parseInt(m[1].replace(/[.,']/g, ''), 10);
      const cent = /^-/.test(m[3]) ? 0 : parseInt(m[3], 10);
      // "1.234" zonder decimalen is hier al uitgesloten; "12,-" telt als hele euro's
      const negatief = /-\s*$/.test(tekst.slice(Math.max(0, m.index - 2), m.index));
      res.push({ centen: (heel * 100 + cent) * (negatief ? -1 : 1), index: m.index });
    }
    return res;
  }

  function percentagesIn(regel) {
    const res = [];
    const re = /(\d{1,2})(?:[.,]0{1,2})?\s?%/g;
    let m;
    while ((m = re.exec(regel))) res.push(+m[1]);
    return res;
  }

  function dichtBij(a, b) {
    return Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.005);
  }

  // ---------- Soort kosten ----------
  // Bepaalt de categorie en of er btw op hoort te zitten. Ook gebruikt voor regels van bankafschriften.
  function categoriseer(tekst) {
    const t = String(tekst || '').toLowerCase();
    // De Belastingdienst noemt bij een incasso vaak alleen je kenteken en de periode
    if (MRB.test(t) || /belastingdienst/.test(t) && KENTEKEN.test(t)) return { categorie: 'belastingen', geenBtw: true, mrb: true,
      notitie: 'Motorrijtuigenbelasting: aftrekbaar als kosten als de auto zakelijk is (op de balans van je bedrijf). Er zit geen btw op.' };
    if (VLUCHT.test(t)) return { categorie: 'reizen', aftrekbaar: false, geenBtw: true,
      notitie: 'Vliegticket: zakelijk aftrekbaar als kosten, maar de btw is niet verrekenbaar (internationale vluchten hebben 0% btw).' };
    if (SPONSOR.test(t)) return { categorie: 'sponsoring',
      notitie: 'Sponsoring: aftrekbaar als kosten als je er reclame of naamsbekendheid voor terugkrijgt. Btw op de factuur is aftrekbaar.' };
    if (HORECA.test(t)) return { categorie: 'horeca', aftrekbaar: false,
      notitie: 'Eten en drinken in de horeca: btw is niet aftrekbaar. Voor de inkomstenbelasting telt 80% van de kosten.' };
    if (ZORG.test(t)) return { categorie: 'verzekering', geenBtw: true, prive: true,
      notitie: 'Zorgverzekering is privé, ook als ondernemer: geen bedrijfskosten.' };
    if (VERZEKERING.test(t)) return { categorie: 'verzekering', geenBtw: true,
      notitie: 'Verzekering: zakelijk aftrekbaar (bijv. autoverzekering van een zakelijke auto, aansprakelijkheid, AOV is wel privé). Er zit geen btw op.' };
    if (BANKKOSTEN.test(t)) return { categorie: 'bank', geenBtw: true, notitie: 'Bankkosten: geen btw.' };
    if (BRANDSTOF.test(t)) return { categorie: 'auto', brandstof: true,
      notitie: 'Brandstof voor je zakelijke auto: btw is aftrekbaar. Let op: aan het eind van het jaar corrigeer je de btw voor privégebruik.' };
    if (AUTO.test(t)) return { categorie: 'auto' };
    if (VERVOER.test(t)) return { categorie: 'reizen' };
    if (TELEFOON.test(t)) return { categorie: 'telefoon' };
    if (INVENTARIS.test(t)) return { categorie: 'inventaris' };
    if (SOFTWARE.test(t)) return { categorie: 'software' };
    if (KANTOOR.test(t)) return { categorie: 'kantoor' };
    return { categorie: 'algemeen' };
  }

  // Een typisch woord per categorie, om de btw-regels van een map toe te passen
  const MAP_VOORBEELD = { sponsoring: 'sponsoring', horeca: 'restaurant', reizen: 'trein', verzekering: 'verzekering' };

  // Map in een ZIP-bestand als hint: "Inkomsten/factuur.pdf" is omzet, "Sponsoring/..." is sponsoring
  function hintUitPad(pad) {
    const delen = String(pad || '').toLowerCase().split('/').slice(0, -1).join('/');
    if (!delen) return null;
    const hint = mapSoort(delen);
    // "Facturen Q3 2026": dan horen de datums in dat kwartaal te vallen
    const k = delen.match(/q\s?([1-4])\D{0,3}(20\d{2})|(20\d{2})\D{0,3}q\s?([1-4])/);
    if (k) return Object.assign(hint || {}, { kwartaal: +(k[1] || k[4]), jaar: +(k[2] || k[3]) });
    return hint;
  }

  function mapSoort(delen) {
    if (/inkomst|omzet|verkoop|opbrengst|income|sales|verstuurd|uitgaande factu/.test(delen)) return { soort: 'inkomst' };
    if (/bank|afschrift|rekeningoverzicht/.test(delen)) return { soort: 'kost', bank: true };
    if (/sponsor/.test(delen)) return { soort: 'kost', categorie: 'sponsoring' };
    if (/tank|brandstof|benzine|diesel|auto/.test(delen)) return { soort: 'kost', categorie: 'auto' };
    if (/horeca|restaurant|lunch|eten|presentatie|representatie|relatiegeschenk/.test(delen)) return { soort: 'kost', categorie: 'horeca' };
    if (/verzeker/.test(delen) && !/belasting|kosten/.test(delen)) return { soort: 'kost', categorie: 'verzekering' };
    if (/reis|vlucht|ticket/.test(delen)) return { soort: 'kost', categorie: 'reizen' };
    if (/kost|uitgave|inkoop|bonnen|bon/.test(delen)) return { soort: 'kost' };
    return null;
  }

  // ---------- Hoofdfunctie ----------
  // opties: { vandaag: 'JJJJ-MM-DD', hint: { soort, categorie } }
  function lees(tekst, bestandsnaam, opties) {
    const vandaag = (opties && opties.vandaag) || null;
    const hint = (opties && opties.hint) || {};
    const ruw = String(tekst || '');
    const regels = ruw.split(/\r?\n/).map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const plat = regels.join(' \n ').toLowerCase();
    const notities = [];
    const r = {
      soort: hint.soort === 'inkomst' ? 'inkomst' : 'kost',
      datum: kiesDatum(regels, vandaag),
      bedrag: null,
      inclBtw: true,
      tarief: 0,
      btwBedrag: null,
      btwAftrekbaar: true,
      categorie: null,
      omschrijving: '',
      notities,
      zeker: true,
    };

    // Totaalbedrag: "Totaal incl. btw" of "Te betalen" gaat voor op een los "Totaal", en dat weer op "Bedrag" of "PIN".
    // Regels over krediet, saldo of restbedragen (bijv. toestelkrediet op een telefoonfactuur) tellen niet mee.
    const totalen = [];
    regels.forEach((regel, i) => {
      if (!TOTAAL.test(regel) || BTW_WOORD.test(regel) && !/incl/i.test(regel)) return;
      if (/resterend|restant|krediet|saldo|openstaand|limiet|vorige factuur|termijn/i.test(regel)) return;
      let bedragen = vindBedragen(regel);
      if (!bedragen.length && regels[i + 1]) bedragen = vindBedragen(regels[i + 1]);
      const sub = /sub\s*-?\s*tota/i.test(regel) || SUBTOTAAL.test(regel) && !/incl/i.test(regel);
      const rang = /(totaal|total).{0,25}incl|te betalen|totaalbedrag|amount due|grand total|to pay/i.test(regel) ? 3
        : /(^|[^a-z])(totaal|total)([^a-z]|$)/i.test(regel) ? 2 : 1;
      bedragen.forEach((b) => b.centen > 0 && totalen.push({ centen: b.centen, sub, rang }));
    });
    const alle = regels.flatMap(vindBedragen).filter((b) => b.centen > 0);
    const echteTotalen = totalen.filter((t) => !t.sub);
    if (echteTotalen.length) {
      const besteRang = Math.max(...echteTotalen.map((t) => t.rang));
      r.bedrag = Math.max(...echteTotalen.filter((t) => t.rang === besteRang).map((t) => t.centen));
    }
    else if (alle.length) {
      r.bedrag = Math.max(...alle.map((b) => b.centen));
      r.zeker = false;
    }

    // Btw: regels met het woord btw (ook zoals OCR het soms leest) of met 9% / 21% erin
    const btwRegels = [];
    regels.forEach((regel, i) => {
      const pct = percentagesIn(regel);
      if (!BTW_WOORD.test(regel) && !pct.some((p) => p === 21 || p === 9)) return;
      let bedragen = vindBedragen(regel);
      if (!bedragen.length && regels[i + 1]) bedragen = vindBedragen(regels[i + 1]);
      btwRegels.push({ regel, bedragen: bedragen.map((b) => b.centen).filter((c) => c > 0), pct });
    });
    const btwGenoemd = BTW_WOORD.test(plat);
    const verlegd = VERLEGD.test(plat);

    if (r.bedrag && !verlegd) {
      const kandidaten = btwRegels.flatMap((b) => b.bedragen).filter((c) => c < r.bedrag);
      for (const tarief of [21, 9]) {
        const verwacht = Math.round((r.bedrag * tarief) / (100 + tarief));
        const hit = kandidaten.find((c) => dichtBij(c, verwacht));
        if (hit != null) { r.tarief = tarief; r.btwBedrag = hit; break; }
      }
      // Gemengde tarieven (bijv. supermarkt 9% en 21%): tel de btw per tarief op
      if (r.btwBedrag == null) {
        const perTarief = {};
        btwRegels.forEach((b) => {
          const pct = b.pct.find((p) => p === 21 || p === 9);
          if (!pct || !b.bedragen.length) return;
          const bedr = b.bedragen.filter((c) => c < r.bedrag);
          if (!bedr.length) return;
          // Op een regel "21% 10,00 2,10" is de btw het bedrag dat past bij grondslag × tarief
          let btw = Math.min(...bedr);
          bedr.forEach((g) => bedr.forEach((c) => { if (dichtBij(c, Math.round(g * pct / 100))) btw = c; }));
          perTarief[pct] = (perTarief[pct] || 0) + btw;
        });
        const som = (perTarief[21] || 0) + (perTarief[9] || 0);
        if (som > 0 && som < r.bedrag * 0.18) {
          r.tarief = (perTarief[21] || 0) >= (perTarief[9] || 0) ? 21 : 9;
          r.btwBedrag = som;
          if (perTarief[21] && perTarief[9]) notities.push('Bon met 9% én 21% btw: btw-bedragen opgeteld.');
        }
      }
      // Alleen een percentage genoemd, geen bruikbaar bedrag: reken het uit
      if (r.btwBedrag == null) {
        const pcts = btwRegels.flatMap((b) => b.pct);
        const t = pcts.includes(21) ? 21 : pcts.includes(9) ? 9 : null;
        if (t) {
          r.tarief = t;
          r.zeker = false;
          notities.push(`Btw-bedrag niet gevonden; uitgerekend met ${t}%.`);
        }
      }
    }

    // Soort kosten (map in de ZIP gaat voor)
    let cat = { categorie: null };
    if (r.soort === 'kost') {
      cat = categoriseer(plat);
      if (hint.categorie === 'auto' && cat.categorie === 'auto') {
        // Map "auto": de inhoud zegt al of het brandstof is of bijv. onderhoud
      } else if (hint.categorie === 'auto') {
        // Onderhoud, onderdelen, wasstraat: wel auto, maar geen tankbon
        cat = Object.assign(BRANDSTOF.test(plat) ? categoriseer('brandstof') : categoriseer('garage'), { categorie: 'auto' });
      } else if (hint.categorie && hint.categorie !== cat.categorie && !cat.mrb) {
        // De map bepaalt de soort kosten, met de btw-regels die daarbij horen
        cat = Object.assign(categoriseer(MAP_VOORBEELD[hint.categorie] || ''), { categorie: hint.categorie });
      }
      if (cat.prive) r.prive = true;
      r.categorie = cat.categorie;
      if (cat.aftrekbaar === false) r.btwAftrekbaar = false;
    }

    if (verlegd) {
      r.tarief = 0;
      notities.push(r.soort === 'inkomst'
        ? 'Btw verlegd: je rekent geen btw, de klant geeft die zelf aan.'
        : 'Btw verlegd: je geeft de btw zelf aan en trekt die tegelijk af. Per saldo € 0.');
    } else if (r.tarief === 0 && r.btwBedrag == null && r.bedrag) {
      if (cat.brandstof) {
        // Brandstof in Nederland: altijd 21% btw, ook als die niet (leesbaar) op de bon staat
        r.tarief = 21;
        notities.push('Tankbon: btw niet leesbaar op de bon, gerekend met 21% (brandstof in Nederland heeft altijd 21% btw).');
      } else if (!cat.geenBtw) {
        notities.push(r.soort === 'inkomst'
          ? 'Geen btw op de factuur gevonden: gerekend zonder btw. Controleer de factuur.'
          : btwGenoemd
            ? (r.zeker = false, 'Btw genoemd maar niet als bedrag gevonden: gerekend zonder btw. Controleer de bon.')
            : 'Geen btw op de bon gevonden: telt wel als kosten, maar zonder btw-teruggave.');
      }
    }
    if (cat.notitie) notities.push(cat.notitie);

    if (r.soort === 'kost' && r.btwAftrekbaar && BUITENLANDSE_BTW.test(plat) && !/(^|[^a-z])btw([^a-z]|$)/i.test(plat)) {
      r.btwAftrekbaar = false;
      notities.push('Buitenlandse btw: niet aftrekbaar in je Nederlandse aangifte. Wel kosten.');
    }

    if (r.categorie === 'inventaris' && r.bedrag) {
      const excl = r.btwBedrag != null ? r.bedrag - r.btwBedrag : r.bedrag;
      if (excl >= 45000) notities.push('Boven € 450 excl. btw: voor de inkomstenbelasting moet je dit waarschijnlijk afschrijven over een paar jaar.');
    }

    // Onwaarschijnlijke uitkomsten (vaak een leesfout op een foto) als twijfelgeval tonen
    if (cat.brandstof && r.bedrag > 30000) {
      r.zeker = false;
      notities.unshift('Ongewoon hoog bedrag voor een tankbon: controleer het bedrag.');
    }
    const jaarNu = vandaag ? +vandaag.slice(0, 4) : new Date().getFullYear();
    if (r.datum && (+r.datum.slice(0, 4) < jaarNu - 2 || +r.datum.slice(0, 4) > jaarNu + 1)) {
      r.zeker = false;
      notities.unshift('Het jaartal lijkt niet te kloppen: controleer de datum.');
    }
    if (!r.bedrag) { r.zeker = false; notities.unshift('Bedrag niet gevonden: vul het zelf in.'); }
    if (!r.datum) { r.zeker = false; notities.unshift('Datum niet gevonden: controleer de datum.'); }

    const negeer = (opties && opties.eigenNamen) || null;
    r.omschrijving = r.soort === 'inkomst' ? omschrijvingFactuur(regels, bestandsnaam) : kiesOmschrijving(regels, bestandsnaam, negeer);
    return r;
  }

  // Bekende leveranciers, zodat de omschrijving "KPN" wordt en niet je eigen adres of een kopje van de factuur
  const MERKEN = [
    ['kpn', 'KPN'], ['odido', 'Odido'], ['vodafone', 'Vodafone'], ['ziggo', 'Ziggo'], ['t-mobile', 'T-Mobile'], ['simyo', 'Simyo'],
    ['shell', 'Shell'], ['esso', 'Esso'], ['tinq', 'TinQ'], ['tango', 'Tango'], ['bp', 'BP'], ['total ?energies', 'TotalEnergies'],
    ['texaco', 'Texaco'], ['avia', 'Avia'], ['gulf', 'Gulf'], ['argos', 'Argos'], ['easypark', 'EasyPark'], ['q-park', 'Q-Park'],
    ['parkmobile', 'Parkmobile'], ['yellowbrick', 'Yellowbrick'], ['allianz', 'Allianz Direct'], ['centraal beheer', 'Centraal Beheer'],
    ['apple', 'Apple'], ['google', 'Google'], ['microsoft', 'Microsoft'], ['openai', 'OpenAI'], ['chatgpt', 'ChatGPT'], ['adobe', 'Adobe'],
    ['aliexpress', 'AliExpress'], ['amazon', 'Amazon'], ['bol\\.com', 'bol.com'], ['coolblue', 'Coolblue'], ['mediamarkt', 'MediaMarkt'],
    ['decathlon', 'Decathlon'], ['ikea', 'IKEA'], ['action', 'Action'], ['hema', 'HEMA'], ['albert heijn', 'Albert Heijn'], ['jumbo', 'Jumbo'],
    ['marktplaats', 'Marktplaats'], ['travix', 'Travix'], ['budgetair', 'Budgetair'], ['booking\\.com', 'Booking.com'], ['klm', 'KLM'],
    ['transavia', 'Transavia'], ['ryanair', 'Ryanair'], ['easyjet', 'easyJet'], ['ns', 'NS'], ['uber', 'Uber'], ['bolt', 'Bolt'],
    ['anwb', 'ANWB'], ['postnl', 'PostNL'], ['belastingdienst', 'Belastingdienst'],
  ].map(([w, naam]) => [new RegExp('(^|[^a-z])' + w + '([^a-z]|$)', 'i'), naam]);

  function vindMerk(regels) {
    let beste = null;
    MERKEN.forEach(([re, naam]) => {
      const i = regels.findIndex((r) => re.test(r));
      if (i >= 0 && (!beste || i < beste.i)) beste = { i, naam };
    });
    if (beste) return beste.naam;
    // Anders een bedrijfsnaam met B.V., N.V., GmbH, Ltd enz.
    for (const r of regels.slice(0, 20)) {
      const m = r.match(/([A-Z][\w&'.-]*(?:\s[A-Z][\w&'.-]*){0,3}\s(?:B\.?V\.?|N\.?V\.?|GmbH|Ltd\.?|Inc\.?|SARL|S\.A\.))(?![a-z])/);
      if (m) return m[1];
    }
    return null;
  }

  // Een bestandsnaam als "Tankbon 10" of "Sponsoring voor DEM U21" zegt vaak meer dan de bon zelf
  function beschrijvendeNaam(bestandsnaam) {
    if (!bestandsnaam) return null;
    const n = bestandsnaam.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(img|image|pdf-document|document|scan|screenshot|schermafbeelding|foto|photo|file|bestand)\b/i.test(n)) return null;
    if (/^[0-9a-f]{12,}$/i.test(n) || !/\p{L}{4,}/u.test(n)) return null;
    if (/^\d{1,2}\s\p{L}+\s\d{4}/u.test(n)) return null; // "16 okt 2026, 17:21"
    if (/^(factuur|invoice|bon|kassabon|receipt|nota|rekening)(\s[\w.-]*)?$/i.test(n) || /factuur\s\d{6,}/i.test(n)) return null;
    return n.slice(0, 50);
  }

  const ADRES = /\d{4}\s?[A-Z]{2}(\s|$)|^\p{L}[\p{L} .'-]+\s\d+\s?[A-Za-z]?(\s|$)|@|www\.|https?:|postbus/iu;

  // negeer: Set met regels (kleine letters) die je eigen naam of adres zijn
  function kiesOmschrijving(regels, bestandsnaam, negeer) {
    const merk = vindMerk(regels);
    const naam = beschrijvendeNaam(bestandsnaam);
    if (merk && naam) return (naam.toLowerCase().includes(merk.toLowerCase()) ? naam : `${merk} – ${naam}`).slice(0, 60);
    if (merk || naam) return merk || naam;
    // Meestal staat de naam van de winkel of het bedrijf bovenaan; adressen en de geadresseerde slaan we over
    const geadresseerd = new Set();
    regels.forEach((r, i) => { if (/^(aan|t\.?a\.?v\.?)(?![a-z])/i.test(r)) [r.replace(/^\S+\s*/, ''), regels[i + 1], regels[i + 2]].forEach((x) => x && geadresseerd.add(x.trim())); });
    for (const regel of regels.slice(0, 8)) {
      if (ADRES.test(regel) || geadresseerd.has(regel) || negeer && negeer.has(regel.toLowerCase())) continue;
      if (/^(de heer|mevrouw|dhr\.?|mevr\.?|nederland|the netherlands|belgi|#|omschrijving|aantal)/i.test(regel)) continue;
      const schoon = regel.replace(/[^\p{L}\d&'. -]/gu, '').trim();
      const letters = (schoon.match(/\p{L}/gu) || []).length;
      if (letters >= 3 && letters / schoon.length > 0.6 && /\p{L}{4,}/u.test(schoon) &&
        !/^(factuur|invoice|bon|kassabon|receipt|datum|date|btw|pagina|aan|je factuur|bestelling|betaling|kopie|vragen|klant)/i.test(schoon)) {
        return schoon.slice(0, 60);
      }
    }
    if (bestandsnaam) return bestandsnaam.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
    return '';
  }

  // Eigen verkoopfactuur: "Factuur 2026-014 – Klantnaam"
  function omschrijvingFactuur(regels, bestandsnaam) {
    const plat = regels.join('\n');
    const nr = plat.match(/(?:factuur|invoice)\s*(?:nummer|nr\.?|no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/.]{1,20})/i);
    let klant = null;
    for (let i = 0; i < regels.length && !klant; i++) {
      const m = regels[i].match(/^(?:factuur aan|aan|klant|debiteur|t\.?a\.?v\.?|bill to|to)(?![a-z])\s*:?\s*(.*)$/i);
      if (m) klant = (m[1] && m[1].length > 2 ? m[1] : regels[i + 1] || '').trim();
    }
    // Self-billing ("factuur uitgereikt door afnemer"): de klant is het bedrijf met B.V. in de kop
    if (!klant || /factuur uitgereikt door afnemer|self.?billing/i.test(plat)) {
      const bv = plat.match(/([A-Z][\w&'.-]*(?:\s[A-Z][\w&'.-]*){0,3}\s?B\.?V\.?)(?![a-z])/);
      if (bv) klant = bv[1];
    }
    const delen = [nr ? 'Factuur ' + nr[1] : null, klant].filter(Boolean);
    return delen.length ? delen.join(' – ').slice(0, 60) : kiesOmschrijving(regels, bestandsnaam);
  }

  const api = { lees, vindDatums, vindBedragen, categoriseer, hintUitPad, vindMerk, CATEGORIEEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BonLezer = api;
})(this);
