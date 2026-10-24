(function () {
  'use strict';

  const OPSLAG_SLEUTEL = 'boekhouding.v1';
  const $ = (id) => document.getElementById(id);

  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const heleEuro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const fmt = (centen) => euro.format(centen / 100);
  const datumLang = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const datumKop = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  // ---------- Opslag ----------
  function laad() {
    try {
      const data = JSON.parse(localStorage.getItem(OPSLAG_SLEUTEL));
      if (data && Array.isArray(data.boekingen)) return data;
    } catch (e) { /* lege of beschadigde opslag */ }
    return { boekingen: [] };
  }
  function bewaar() {
    try {
      localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(state));
    } catch (e) {
      toast('Opslaan mislukt. Maak een back-up via Meer.');
    }
  }
  // Vraag iOS om de gegevens niet automatisch op te ruimen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const state = laad();
  state.instellingen = Object.assign({ urencriterium: true, starter: false, loon: 0, ingehouden: 0 }, state.instellingen);
  const vandaag = new Date();
  const ui = {
    view: 'overzicht',
    jaar: vandaag.getFullYear(),
    kwartaal: Math.ceil((vandaag.getMonth() + 1) / 3),
    filter: 'alle',
    bewerkId: null,
  };

  function nieuweId() {
    return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function vandaagISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(s) {
    const [j, m, d] = s.split('-').map(Number);
    return new Date(j, m - 1, d);
  }

  // ---------- Navigatie ----------
  const TITELS = { overzicht: 'Overzicht', boekingen: 'Boekingen', belasting: 'Belasting', meer: 'Meer' };

  function toonView(naam) {
    ui.view = naam;
    document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + naam));
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.view === naam) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('titel').textContent = TITELS[naam];
    window.scrollTo(0, 0);
    render();
  }

  function wisselKwartaal(stap) {
    // Op het tabblad Belasting bladeren de pijltjes per jaar
    if (ui.view === 'belasting') { ui.jaar += stap; render(); return; }
    ui.kwartaal += stap;
    if (ui.kwartaal < 1) { ui.kwartaal = 4; ui.jaar -= 1; }
    if (ui.kwartaal > 4) { ui.kwartaal = 1; ui.jaar += 1; }
    render();
  }

  // ---------- Weergave ----------
  function render() {
    const perJaar = ui.view === 'belasting';
    $('kwartaalLabel').textContent = perJaar ? String(ui.jaar) : `Q${ui.kwartaal} ${ui.jaar}`;
    $('kwartaalLabel').setAttribute('aria-label', perJaar ? `Jaar ${ui.jaar}` : `Kwartaal ${ui.kwartaal} van ${ui.jaar}`);
    $('vorigKwartaal').setAttribute('aria-label', perJaar ? 'Vorig jaar' : 'Vorig kwartaal');
    $('volgendKwartaal').setAttribute('aria-label', perJaar ? 'Volgend jaar' : 'Volgend kwartaal');
    // In "Meer" kies je met de pijltjes het jaar via het kwartaal
    if (ui.view === 'overzicht') renderOverzicht();
    if (ui.view === 'boekingen') renderLijst();
    if (ui.view === 'belasting') renderBelasting();
    if (ui.view === 'meer') renderJaar();
  }

  function boekingenVanJaar(jaar) {
    return state.boekingen.filter((b) => b.datum.startsWith(String(jaar)));
  }

  function centenNaarInvoer(c) {
    return c ? (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '';
  }

  function renderBelasting() {
    const inst = state.instellingen;
    $('urencriterium').checked = inst.urencriterium;
    $('starter').checked = inst.starter;
    $('starter').disabled = !inst.urencriterium;
    if (document.activeElement !== $('loon')) $('loon').value = centenNaarInvoer(inst.loon);
    if (document.activeElement !== $('ingehouden')) $('ingehouden').value = centenNaarInvoer(inst.ingehouden);

    const o = BTW.overzicht(boekingenVanJaar(ui.jaar));
    const r = IB.bereken({
      jaar: ui.jaar, winst: o.winst, horecaKosten: o.kosten.horeca,
      urencriterium: inst.urencriterium, starter: inst.starter && inst.urencriterium,
      loon: inst.loon, ingehoudenLoonheffing: inst.ingehouden,
    });

    $('ibJaar').textContent = ui.jaar;
    $('ibTotaal').textContent = fmt(Math.max(0, r.totaal));
    const maand = Math.max(0, Math.round(r.totaal / 12));
    $('ibSub').textContent = o.inkomsten.aantal + o.kosten.aantal === 0
      ? 'Nog geen boekingen in dit jaar.'
      : r.totaal > 0 ? `Zet ongeveer ${fmt(maand)} per maand apart` : 'Je hoeft naar verwachting niets bij te betalen';

    const p = r.parameters;
    const rijen = $('ibRijen');
    rijen.innerHTML = '';
    const voeg = (label, waarde, klasse) => { const d = rij(label, waarde); if (klasse) d.className = klasse; rijen.appendChild(d); };
    // Aftrekposten met het juiste teken, ook bij verlies
    const af = (c) => (c >= 0 ? '− ' : '+ ') + fmt(Math.abs(c));
    voeg('Inkomsten (excl. btw)', fmt(o.inkomsten.excl));
    voeg('Kosten (excl. btw)', '− ' + fmt(o.kosten.excl));
    voeg(r.winst >= 0 ? 'Winst' : 'Verlies', fmt(Math.abs(r.winst)), 'sub');
    if (r.nietAftrekbaarHoreca) voeg('Eten & drinken: 20% niet aftrekbaar', '+ ' + fmt(r.nietAftrekbaarHoreca), 'min');
    if (r.zelfstandigenaftrek) voeg(`Zelfstandigenaftrek`, af(r.zelfstandigenaftrek), 'min');
    if (r.startersaftrek) voeg('Startersaftrek', af(r.startersaftrek), 'min');
    if (r.mkb) voeg(`Mkb-winstvrijstelling (${String(p.mkbPct).replace('.', ',')}%)`, af(r.mkb), 'min');
    voeg(r.belastbareWinst >= 0 ? 'Belastbare winst' : 'Fiscaal verlies', fmt(Math.abs(r.belastbareWinst)), 'sub');
    if (r.loon) voeg('Ander inkomen', '+ ' + fmt(r.loon), 'min');
    voeg('Inkomstenbelasting vóór kortingen', fmt(r.belastingVoorKorting + r.aftrekbeperking));
    voeg('Algemene heffingskorting', '− ' + fmt(r.ahk), 'min');
    voeg('Arbeidskorting', '− ' + fmt(r.ak), 'min');
    if (r.ingehouden) voeg('Al ingehouden loonheffing', '− ' + fmt(r.ingehouden), 'min');
    voeg(r.nogTeBetalen >= 0 ? 'Inkomstenbelasting te betalen' : 'Inkomstenbelasting terug', fmt(Math.abs(r.nogTeBetalen)), 'sub');
    voeg(`Bijdrage Zvw (${String(p.zvw.pct).replace('.', ',')}% van ${fmt(r.zvwGrondslag)})`, fmt(r.zvw), 'sub');
    voeg('Totaal', fmt(r.totaal), 'totaal');

    const basis = 'Dit is een schatting voor ondernemers onder de AOW-leeftijd. Toeslagen, hypotheekrente, box 2 en 3, afschrijvingen en de kleinschaligheidsinvesteringsaftrek zijn niet meegenomen. Je voorlopige aanslag kan anders zijn.';
    $('ibVoetnoot').textContent = (r.benadering ? `Let op: voor ${ui.jaar} zijn nog geen tarieven bekend, gerekend met die van ${r.jaar}. ` : `Tarieven ${r.jaar}. `) + basis;
  }

  $('urencriterium').addEventListener('change', (e) => { state.instellingen.urencriterium = e.target.checked; bewaar(); renderBelasting(); });
  $('starter').addEventListener('change', (e) => { state.instellingen.starter = e.target.checked; bewaar(); renderBelasting(); });
  [['loon', 'loon'], ['ingehouden', 'ingehouden']].forEach(([id, sleutel]) => {
    $(id).addEventListener('input', (e) => {
      const c = BTW.parseBedrag(e.target.value);
      state.instellingen[sleutel] = c == null ? 0 : c;
      bewaar();
      renderBelasting();
    });
  });

  function renderOverzicht() {
    const o = BTW.kwartaalOverzicht(state.boekingen, ui.jaar, ui.kwartaal);
    const saldo = o.saldoBtw;
    const betalen = saldo >= 0;
    const deadline = BTW.deadline(ui.jaar, ui.kwartaal);

    const kaart = $('resultaat');
    kaart.classList.toggle('betalen', saldo > 0);
    kaart.classList.toggle('terug', saldo < 0);
    $('resultaatLabel').textContent = saldo === 0 ? 'Btw dit kwartaal' : betalen ? 'Btw te betalen' : 'Btw terug te krijgen';
    $('resultaatBedrag').textContent = fmt(Math.abs(saldo));

    const aantal = o.inkomsten.aantal + o.kosten.aantal;
    $('resultaatSub').textContent = aantal === 0
      ? 'Nog geen boekingen in dit kwartaal.'
      : `Aangifte doen vóór ${datumLang.format(deadline)}`;

    $('btwOntvangen').textContent = fmt(o.inkomsten.btw);
    $('btwBetaald').textContent = '− ' + fmt(o.kosten.btw);
    $('saldoLabel').textContent = betalen ? 'Te betalen' : 'Terug te krijgen';
    $('saldo').textContent = fmt(Math.abs(saldo));

    $('inkomstenExcl').textContent = fmt(o.inkomsten.excl);
    $('kostenExcl').textContent = fmt(o.kosten.excl);
    $('winstLabel').textContent = o.winst >= 0 ? 'Winst' : 'Verlies';
    $('winst').textContent = fmt(Math.abs(o.winst));

    const a = BTW.aangifte(o);
    const he = (e) => heleEuro.format(e);
    $('r1a').textContent = `${he(a.r1a.omzet)} · btw ${he(a.r1a.btw)}`;
    $('r1b').textContent = `${he(a.r1b.omzet)} · btw ${he(a.r1b.btw)}`;
    $('r1e').textContent = he(a.r1e.omzet);
    $('r5a').textContent = he(a.r5a);
    $('r5b').textContent = he(a.r5b);
    $('rTotaalLabel').textContent = a.totaal >= 0 ? 'Totaal te betalen' : 'Totaal terug te krijgen';
    $('rTotaal').textContent = he(Math.abs(a.totaal));
  }

  function renderLijst() {
    const lijst = $('lijst');
    lijst.innerHTML = '';
    document.querySelectorAll('.filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === ui.filter)));

    const items = state.boekingen
      .filter((b) => BTW.inKwartaal(b, ui.jaar, ui.kwartaal))
      .filter((b) => ui.filter === 'alle' || b.soort === ui.filter)
      .sort((a, b) => b.datum.localeCompare(a.datum) || (b.aangemaakt || 0) - (a.aangemaakt || 0));

    $('leeg').hidden = items.length > 0;

    let huidigeDatum = null;
    items.forEach((b) => {
      if (b.datum !== huidigeDatum) {
        huidigeDatum = b.datum;
        const kop = document.createElement('li');
        kop.className = 'datumkop';
        kop.textContent = datumKop.format(parseISO(b.datum));
        lijst.appendChild(kop);
      }
      const s = BTW.splits(b);
      const isInkomst = b.soort === 'inkomst';
      const li = document.createElement('li');
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.addEventListener('click', () => openForm(b.soort, b));

      const badge = document.createElement('span');
      badge.className = 'badge ' + b.soort;
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = isInkomst ? '+' : '−';

      const midden = document.createElement('span');
      const oms = document.createElement('span');
      oms.className = 'oms';
      oms.textContent = b.omschrijving || (isInkomst ? 'Inkomsten' : 'Kosten');
      const det = document.createElement('span');
      det.className = 'det';
      det.textContent = s.nietAftrekbaar ? `Btw ${fmt(s.nietAftrekbaar)} niet aftrekbaar`
        : s.btw ? `${b.tarief}% btw: ${fmt(s.btw)}` : 'Geen btw';
      midden.append(oms, det);

      const bedrag = document.createElement('span');
      bedrag.className = 'bedrag ' + b.soort;
      bedrag.textContent = (isInkomst ? '+ ' : '− ') + fmt(s.incl);

      knop.setAttribute('aria-label',
        `${isInkomst ? 'Inkomsten' : 'Kosten'}: ${oms.textContent}, ${fmt(s.incl)} inclusief btw, ${det.textContent}. Tik om te wijzigen.`);
      knop.append(badge, midden, bedrag);
      li.appendChild(knop);
      lijst.appendChild(li);
    });
  }

  function renderJaar() {
    $('jaarLabel').textContent = ui.jaar;
    const rijen = $('jaarRijen');
    rijen.innerHTML = '';
    let totaalBtw = 0;
    for (let k = 1; k <= 4; k++) {
      const o = BTW.kwartaalOverzicht(state.boekingen, ui.jaar, k);
      totaalBtw += o.saldoBtw;
      rijen.appendChild(rij(`Q${k}: btw ${o.saldoBtw >= 0 ? 'betalen' : 'terug'}`, fmt(Math.abs(o.saldoBtw))));
    }
    const jaar = BTW.overzicht(state.boekingen.filter((b) => b.datum.startsWith(String(ui.jaar))));
    rijen.appendChild(rij('Inkomsten (excl. btw)', fmt(jaar.inkomsten.excl)));
    rijen.appendChild(rij('Kosten (excl. btw)', fmt(jaar.kosten.excl)));
    rijen.appendChild(rij(jaar.winst >= 0 ? 'Winst' : 'Verlies', fmt(Math.abs(jaar.winst)), true));
    rijen.appendChild(rij(`Btw heel jaar ${totaalBtw >= 0 ? 'betalen' : 'terug'}`, fmt(Math.abs(totaalBtw)), true));
  }

  function rij(label, waarde, totaal) {
    const div = document.createElement('div');
    if (totaal) div.className = 'totaal';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = waarde;
    div.append(dt, dd);
    return div;
  }

  // ---------- Formulier ----------
  const dialog = $('formDialog');
  const form = $('form');

  // Vul de keuzelijst met soorten kosten
  Object.entries(BonLezer.CATEGORIEEN).forEach(([waarde, label]) => {
    const o = document.createElement('option');
    o.value = waarde;
    o.textContent = label;
    $('categorie').appendChild(o);
  });

  // opties.concept: een ingelezen bon die nog niet is opgeslagen; opties.bijBewaren krijgt de gewijzigde boeking
  let formOpties = null;

  function openForm(soort, boeking, opties) {
    form.reset();
    formOpties = opties || null;
    const concept = !!(opties && opties.concept);
    ui.bewerkId = boeking && !concept ? boeking.id : null;
    $('formTitel').textContent = concept ? 'Bon controleren' : boeking ? 'Boeking wijzigen' : 'Nieuwe boeking';
    $('verwijder').hidden = !boeking || concept;
    $('bedrag').removeAttribute('aria-invalid');
    $('bedragFout').hidden = true;

    form.soort.value = boeking ? boeking.soort : soort;
    $('bedrag').value = boeking && boeking.bedrag ? (boeking.bedrag / 100).toFixed(2).replace('.', ',') : '';
    form.incl.value = boeking ? (boeking.inclBtw ? 'ja' : 'nee') : 'ja';
    form.tarief.value = String(boeking ? boeking.tarief : 21);
    $('btwBedrag').value = boeking && boeking.btwBedrag != null ? (boeking.btwBedrag / 100).toFixed(2).replace('.', ',') : '';
    $('categorie').value = (boeking && boeking.categorie) || 'algemeen';
    $('btwAftrekbaar').checked = !boeking || boeking.btwAftrekbaar !== false;
    $('omschrijving').value = boeking ? boeking.omschrijving : '';
    $('datum').value = boeking && boeking.datum ? boeking.datum : standaardDatum();

    const notities = concept && boeking.notities && boeking.notities.length ? boeking.notities : null;
    $('formNotities').hidden = !notities;
    $('formNotities').textContent = notities ? notities.join(' ') : '';

    updateBerekening();
    dialog.showModal();
    if (!boeking) $('bedrag').focus();
  }

  // Nieuwe boeking: vandaag, of de eerste dag van het gekozen kwartaal als je een ander kwartaal bekijkt
  function standaardDatum() {
    const nu = vandaagISO();
    const k = BTW.kwartaalVan(nu);
    if (k.jaar === ui.jaar && k.kwartaal === ui.kwartaal) return nu;
    return `${ui.jaar}-${String((ui.kwartaal - 1) * 3 + 1).padStart(2, '0')}-01`;
  }

  function leesForm() {
    const soort = form.soort.value;
    return {
      soort,
      bedrag: BTW.parseBedrag($('bedrag').value),
      inclBtw: form.incl.value === 'ja',
      tarief: Number(form.tarief.value),
      btwBedrag: BTW.parseBedrag($('btwBedrag').value),
      categorie: soort === 'kost' ? $('categorie').value : null,
      btwAftrekbaar: soort === 'kost' ? $('btwAftrekbaar').checked : true,
      omschrijving: $('omschrijving').value.trim(),
      datum: $('datum').value,
    };
  }

  function updateBerekening() {
    const b = leesForm();
    $('kostVelden').hidden = b.soort !== 'kost';
    const el = $('berekening');
    if (b.bedrag == null || b.bedrag === 0) { el.textContent = ''; return; }
    const s = BTW.splits(b);
    el.innerHTML = '';
    const btwLabel = b.btwBedrag != null ? 'Btw' : `Btw ${b.tarief}%`;
    const delen = s.nietAftrekbaar
      ? [['Kosten', s.excl], ['waarvan btw (niet aftrekbaar)', s.nietAftrekbaar]]
      : [['Excl. btw', s.excl], [btwLabel, s.btw], ['Incl. btw', s.incl]];
    delen.forEach(([label, w], i) => {
      if (i) el.append(' · ');
      el.append(label + ' ');
      const st = document.createElement('strong');
      st.textContent = fmt(w);
      el.append(st);
    });
  }

  function sluitForm() {
    dialog.close();
    ui.bewerkId = null;
    formOpties = null;
  }

  // Horeca: btw standaard niet aftrekbaar
  $('categorie').addEventListener('change', (e) => { $('btwAftrekbaar').checked = e.target.value !== 'horeca'; });
  form.addEventListener('input', updateBerekening);
  form.addEventListener('change', updateBerekening);
  $('annuleer').addEventListener('click', sluitForm);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const b = leesForm();
    if (b.bedrag == null || b.bedrag <= 0) {
      $('bedrag').setAttribute('aria-invalid', 'true');
      $('bedragFout').hidden = false;
      $('bedrag').focus();
      return;
    }
    if (!b.datum) b.datum = vandaagISO();

    if (formOpties && formOpties.bijBewaren) {
      const terug = formOpties.bijBewaren;
      sluitForm();
      terug(b);
      return;
    }

    if (ui.bewerkId) {
      const i = state.boekingen.findIndex((x) => x.id === ui.bewerkId);
      if (i >= 0) state.boekingen[i] = Object.assign({}, state.boekingen[i], b);
      toast('Wijziging bewaard');
    } else {
      state.boekingen.push(Object.assign({ id: nieuweId(), aangemaakt: Date.now() }, b));
      toast(b.soort === 'inkomst' ? 'Inkomsten toegevoegd' : 'Kosten toegevoegd');
    }
    bewaar();
    // Spring naar het kwartaal van de boeking, zodat je hem meteen terugziet
    const k = BTW.kwartaalVan(b.datum);
    ui.jaar = k.jaar;
    ui.kwartaal = k.kwartaal;
    sluitForm();
    render();
  });

  $('verwijder').addEventListener('click', () => {
    if (!confirm('Weet je zeker dat je deze boeking wilt verwijderen?')) return;
    state.boekingen = state.boekingen.filter((x) => x.id !== ui.bewerkId);
    bewaar();
    sluitForm();
    toast('Boeking verwijderd');
    render();
  });

  // ---------- Exporteren & back-up ----------
  async function deelBestand(naam, inhoud, type) {
    const blob = new Blob([inhoud], { type });
    const bestand = new File([blob], naam, { type });
    if (navigator.canShare && navigator.canShare({ files: [bestand] })) {
      try {
        await navigator.share({ files: [bestand], title: naam });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = naam;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csv(boekingen) {
    const getal = (c) => (c / 100).toFixed(2).replace('.', ',');
    const tekst = (t) => '"' + String(t).replace(/"/g, '""') + '"';
    const regels = [['Datum', 'Soort', 'Omschrijving', 'Categorie', 'Bedrag excl. btw', 'Btw-tarief', 'Btw', 'Niet-aftrekbare btw', 'Bedrag incl. btw'].join(';')];
    boekingen
      .slice()
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .forEach((b) => {
        const s = BTW.splits(b);
        regels.push([b.datum, b.soort === 'inkomst' ? 'Inkomsten' : 'Kosten', tekst(b.omschrijving || ''),
          tekst(b.categorie ? BonLezer.CATEGORIEEN[b.categorie] || '' : ''),
          getal(s.excl), b.tarief + '%', getal(s.btw), getal(s.nietAftrekbaar), getal(s.incl)].join(';'));
      });
    // BOM zodat Excel de euro- en accenttekens goed leest
    return '﻿' + regels.join('\r\n');
  }

  $('csvKwartaal').addEventListener('click', () => {
    const items = state.boekingen.filter((b) => BTW.inKwartaal(b, ui.jaar, ui.kwartaal));
    deelBestand(`boekhouding-${ui.jaar}-Q${ui.kwartaal}.csv`, csv(items), 'text/csv');
  });
  $('csvJaar').addEventListener('click', () => {
    const items = state.boekingen.filter((b) => b.datum.startsWith(String(ui.jaar)));
    deelBestand(`boekhouding-${ui.jaar}.csv`, csv(items), 'text/csv');
  });

  $('backup').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'boekhouding', versie: 1, gemaakt: new Date().toISOString(), boekingen: state.boekingen }, null, 2);
    deelBestand(`boekhouding-backup-${vandaagISO()}.json`, data, 'application/json');
  });

  $('herstelBestand').addEventListener('change', async (e) => {
    const bestand = e.target.files[0];
    e.target.value = '';
    if (!bestand) return;
    try {
      const data = JSON.parse(await bestand.text());
      if (!data || !Array.isArray(data.boekingen)) throw new Error('ongeldig');
      const geldig = data.boekingen.filter((b) =>
        b && typeof b.bedrag === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(b.datum) && (b.soort === 'inkomst' || b.soort === 'kost'));
      if (!confirm(`Back-up met ${geldig.length} boekingen terugzetten? Je huidige gegevens worden vervangen.`)) return;
      state.boekingen = geldig.map((b) => Object.assign({ id: nieuweId() }, b));
      bewaar();
      render();
      toast('Back-up teruggezet');
    } catch (err) {
      toast('Dit bestand is geen geldige back-up');
    }
  });

  $('allesWissen').addEventListener('click', () => {
    if (!confirm('Alle boekingen wissen? Dit kan niet ongedaan worden gemaakt.')) return;
    if (!confirm('Echt alles wissen? Maak eventueel eerst een back-up.')) return;
    state.boekingen = [];
    bewaar();
    render();
    toast('Alle gegevens gewist');
  });

  // ---------- Bonnen inlezen ----------
  const scanDialog = $('scanDialog');
  let scanItems = [];

  function scanStap(stap) {
    $('scanKiezen').hidden = stap !== 'kiezen';
    $('scanBezig').hidden = stap !== 'bezig';
    $('scanResultaat').hidden = stap !== 'resultaat';
  }

  function openScan() {
    scanItems = [];
    scanStap('kiezen');
    scanDialog.showModal();
  }

  async function startScan(bestanden) {
    if (!bestanden || !bestanden.length) return;
    scanStap('bezig');
    const balk = $('scanVoortgang');
    try {
      const resultaten = await Scanner.lees(bestanden, (tekst, klaar, totaal) => {
        $('scanStatus').textContent = totaal ? `${tekst} (${Math.min(klaar + 1, totaal)} van ${totaal})` : tekst;
        if (totaal) { balk.max = totaal; balk.value = klaar; } else balk.removeAttribute('value');
      });
      scanItems = resultaten.map((r) => Object.assign(r, { meenemen: !r.fout && !!(r.boeking && r.boeking.bedrag) }));
      renderScan();
      scanStap('resultaat');
      $('scanSamenvatting').setAttribute('tabindex', '-1');
      $('scanSamenvatting').focus();
    } catch (e) {
      toast('Inlezen mislukt: ' + (e.message || 'onbekende fout'));
      scanStap('kiezen');
    }
  }

  function renderScan() {
    const lijst = $('scanLijst');
    lijst.innerHTML = '';
    const goed = scanItems.filter((i) => !i.fout);
    const aantalMee = scanItems.filter((i) => i.meenemen).length;
    const letOp = goed.filter((i) => !i.boeking.zeker).length;
    $('scanSamenvatting').textContent = `${goed.length} van ${scanItems.length} bestanden gelezen.` +
      (letOp ? ` Bij ${letOp} is iets niet zeker gevonden; controleer die even (oranje rand).` : ' Controleer de gegevens en tik op Toevoegen.');
    $('scanToevoegen').textContent = aantalMee === 1 ? '1 boeking toevoegen' : `${aantalMee} boekingen toevoegen`;
    $('scanToevoegen').disabled = aantalMee === 0;

    scanItems.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'scankaart' + (item.fout ? ' fout' : !item.boeking.zeker ? ' let-op' : '') + (item.meenemen ? '' : ' uit');

      if (item.voorbeeld) {
        const img = document.createElement('img');
        img.src = item.voorbeeld;
        img.alt = '';
        li.appendChild(img);
      } else {
        const g = document.createElement('div');
        g.className = 'geenbeeld';
        g.setAttribute('aria-hidden', 'true');
        g.textContent = item.fout ? '⚠️' : '📄';
        li.appendChild(g);
      }

      const info = document.createElement('div');
      const h = document.createElement('h3');
      const b = item.boeking;
      h.textContent = item.fout ? item.naam : b.omschrijving || item.naam;
      info.appendChild(h);

      if (item.fout) {
        const p = document.createElement('p');
        p.className = 'det';
        p.textContent = item.fout;
        info.appendChild(p);
      } else {
        const s = b.bedrag ? BTW.splits(b) : null;
        const kern = document.createElement('p');
        kern.className = 'kerngetallen';
        const sterk = document.createElement('strong');
        sterk.textContent = s ? fmt(s.incl) : 'Bedrag onbekend';
        kern.append(b.soort === 'inkomst' ? 'Inkomsten ' : 'Kosten ', sterk);
        const det = document.createElement('p');
        det.className = 'det';
        const btwTekst = !s ? '' : s.nietAftrekbaar ? `btw ${fmt(s.nietAftrekbaar)} niet aftrekbaar` : s.btw ? `btw ${fmt(s.btw)} (${b.tarief}%)` : 'geen btw';
        det.textContent = [b.datum ? datumLang.format(parseISO(b.datum)) : 'Datum onbekend', btwTekst, BonLezer.CATEGORIEEN[b.categorie]].filter(Boolean).join(' · ');
        info.append(kern, det);
        if (b.notities.length) {
          const ul = document.createElement('ul');
          ul.className = 'notities';
          b.notities.forEach((n) => { const nl = document.createElement('li'); nl.textContent = n; ul.appendChild(nl); });
          info.appendChild(ul);
        }
      }
      li.appendChild(info);

      if (!item.fout) {
        const rijKnoppen = document.createElement('div');
        rijKnoppen.className = 'knoppenrij';
        const lab = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = item.meenemen;
        cb.addEventListener('change', () => { item.meenemen = cb.checked; renderScan(); });
        lab.append(cb, 'Toevoegen');
        const wijzig = document.createElement('button');
        wijzig.type = 'button';
        wijzig.className = 'knopklein';
        wijzig.textContent = 'Controleer / wijzig';
        wijzig.setAttribute('aria-label', `Controleer of wijzig ${h.textContent}`);
        wijzig.addEventListener('click', () => {
          openForm(b.soort, b, {
            concept: true,
            bijBewaren: (nieuw) => {
              item.boeking = Object.assign({}, b, nieuw, { zeker: true, notities: b.notities.filter((n) => !/niet gevonden/.test(n)) });
              item.meenemen = true;
              renderScan();
            },
          });
        });
        rijKnoppen.append(lab, wijzig);
        li.appendChild(rijKnoppen);
      }
      lijst.appendChild(li);
    });
  }

  $('scanToevoegen').addEventListener('click', () => {
    const mee = scanItems.filter((i) => i.meenemen && !i.fout);
    const zonderBedrag = mee.filter((i) => !i.boeking.bedrag);
    if (zonderBedrag.length) {
      toast('Vul eerst het bedrag in bij: ' + zonderBedrag.map((i) => i.boeking.omschrijving || i.naam).join(', '));
      return;
    }
    let laatste = null;
    mee.forEach((i) => {
      const b = i.boeking;
      const boeking = {
        id: nieuweId(), aangemaakt: Date.now(),
        soort: b.soort, bedrag: b.bedrag, inclBtw: b.inclBtw, tarief: b.tarief,
        btwBedrag: b.btwBedrag, btwAftrekbaar: b.btwAftrekbaar, categorie: b.soort === 'kost' ? b.categorie : null,
        omschrijving: b.omschrijving || i.naam, datum: b.datum || vandaagISO(), bron: i.naam,
      };
      state.boekingen.push(boeking);
      laatste = boeking;
    });
    bewaar();
    if (laatste) {
      const k = BTW.kwartaalVan(laatste.datum);
      ui.jaar = k.jaar;
      ui.kwartaal = k.kwartaal;
    }
    scanDialog.close();
    Scanner.stop();
    toast(mee.length === 1 ? '1 boeking toegevoegd' : `${mee.length} boekingen toegevoegd`);
    toonView('boekingen');
  });

  ['scanBestanden', 'scanCamera'].forEach((id) => $(id).addEventListener('change', (e) => {
    const bestanden = Array.from(e.target.files || []);
    e.target.value = '';
    startScan(bestanden);
  }));
  $('scanOpnieuw').addEventListener('click', () => scanStap('kiezen'));
  $('scanSluit').addEventListener('click', () => {
    if (scanItems.some((i) => i.meenemen) && !$('scanResultaat').hidden &&
      !confirm('De ingelezen bonnen zijn nog niet toegevoegd. Toch sluiten?')) return;
    scanDialog.close();
    Scanner.stop();
  });
  document.querySelectorAll('[data-scan]').forEach((b) => b.addEventListener('click', openScan));

  // ---------- Overig ----------
  let toastTimer;
  function toast(tekst) {
    const t = $('toast');
    t.textContent = tekst;
    t.classList.add('zichtbaar');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('zichtbaar'), 2200);
  }

  document.querySelectorAll('[data-nieuw]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.nieuw)));
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => toonView(b.dataset.view)));
  document.querySelectorAll('.filter button').forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.filter; renderLijst(); }));
  $('vorigKwartaal').addEventListener('click', () => wisselKwartaal(-1));
  $('volgendKwartaal').addEventListener('click', () => wisselKwartaal(1));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
