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
  const TITELS = { overzicht: 'Overzicht', boekingen: 'Boekingen', meer: 'Meer' };

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
    ui.kwartaal += stap;
    if (ui.kwartaal < 1) { ui.kwartaal = 4; ui.jaar -= 1; }
    if (ui.kwartaal > 4) { ui.kwartaal = 1; ui.jaar += 1; }
    render();
  }

  // ---------- Weergave ----------
  function render() {
    $('kwartaalLabel').textContent = `Q${ui.kwartaal} ${ui.jaar}`;
    $('kwartaalLabel').setAttribute('aria-label', `Kwartaal ${ui.kwartaal} van ${ui.jaar}`);
    // In "Meer" kies je met de pijltjes het jaar via het kwartaal
    if (ui.view === 'overzicht') renderOverzicht();
    if (ui.view === 'boekingen') renderLijst();
    if (ui.view === 'meer') renderJaar();
  }

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
      det.textContent = b.tarief ? `${b.tarief}% btw: ${fmt(s.btw)}` : 'Geen btw';
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

  function openForm(soort, boeking) {
    form.reset();
    ui.bewerkId = boeking ? boeking.id : null;
    $('formTitel').textContent = boeking ? 'Boeking wijzigen' : 'Nieuwe boeking';
    $('verwijder').hidden = !boeking;
    $('bedrag').removeAttribute('aria-invalid');
    $('bedragFout').hidden = true;

    form.soort.value = boeking ? boeking.soort : soort;
    $('bedrag').value = boeking ? (boeking.bedrag / 100).toFixed(2).replace('.', ',') : '';
    form.incl.value = boeking ? (boeking.inclBtw ? 'ja' : 'nee') : 'ja';
    form.tarief.value = String(boeking ? boeking.tarief : 21);
    $('omschrijving').value = boeking ? boeking.omschrijving : '';
    $('datum').value = boeking ? boeking.datum : standaardDatum();

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
    return {
      soort: form.soort.value,
      bedrag: BTW.parseBedrag($('bedrag').value),
      inclBtw: form.incl.value === 'ja',
      tarief: Number(form.tarief.value),
      omschrijving: $('omschrijving').value.trim(),
      datum: $('datum').value,
    };
  }

  function updateBerekening() {
    const b = leesForm();
    const el = $('berekening');
    if (b.bedrag == null || b.bedrag === 0) { el.textContent = ''; return; }
    const s = BTW.splits(b);
    el.innerHTML = '';
    const delen = [['Excl. btw', s.excl], [`Btw ${b.tarief}%`, s.btw], ['Incl. btw', s.incl]];
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
  }

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
    const regels = [['Datum', 'Soort', 'Omschrijving', 'Bedrag excl. btw', 'Btw-tarief', 'Btw', 'Bedrag incl. btw'].join(';')];
    boekingen
      .slice()
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .forEach((b) => {
        const s = BTW.splits(b);
        regels.push([b.datum, b.soort === 'inkomst' ? 'Inkomsten' : 'Kosten', tekst(b.omschrijving || ''),
          getal(s.excl), b.tarief + '%', getal(s.btw), getal(s.incl)].join(';'));
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
