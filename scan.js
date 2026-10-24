// Leest bonnen in: ZIP-bestanden, PDF's en foto's. Alles gebeurt op je eigen telefoon; er gaat niets naar internet.
(function () {
  'use strict';

  const basis = new URL('vendor/', location.href).href;
  const geladen = {};

  function laadScript(src) {
    if (!geladen[src]) {
      geladen[src] = new Promise((ok, fout) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => fout(new Error('Kon ' + src + ' niet laden'));
        document.head.appendChild(s);
      });
    }
    return geladen[src];
  }

  async function pdfjs() {
    await laadScript(basis + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = basis + 'pdf.worker.min.js';
    return window.pdfjsLib;
  }

  let ocrWorker = null;
  async function ocr() {
    if (!ocrWorker) {
      ocrWorker = (async () => {
        await laadScript(basis + 'tesseract/tesseract.min.js');
        return window.Tesseract.createWorker('nld+eng', 1, {
          workerPath: basis + 'tesseract/worker.min.js',
          corePath: basis + 'tesseract/',
          langPath: basis + 'tesseract/lang',
          workerBlobURL: false,
        });
      })();
    }
    return ocrWorker;
  }

  async function stop() {
    if (ocrWorker) {
      const w = await ocrWorker.catch(() => null);
      ocrWorker = null;
      if (w) await w.terminate();
    }
  }

  const AFBEELDING = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i;
  const PDF = /\.pdf$/i;
  const ZIP = /\.zip$/i;

  function soortVan(naam, type) {
    if (PDF.test(naam) || type === 'application/pdf') return 'pdf';
    if (ZIP.test(naam) || /zip/.test(type || '')) return 'zip';
    if (AFBEELDING.test(naam) || /^image\//.test(type || '')) return 'afbeelding';
    return null;
  }

  // Pakt ZIP-bestanden uit (ook ZIP in ZIP) tot een platte lijst van {naam, blob, soort}
  async function verzamel(bestanden) {
    const uit = [];
    for (const f of bestanden) {
      const soort = soortVan(f.name, f.type);
      if (soort === 'zip') {
        await laadScript(basis + 'jszip.min.js');
        const zip = await window.JSZip.loadAsync(f);
        const items = Object.values(zip.files).filter((z) => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name));
        const binnen = [];
        for (const z of items) {
          const naam = z.name.split('/').pop();
          if (!soortVan(naam)) continue;
          const blob = await z.async('blob');
          binnen.push(new File([blob], naam, { type: PDF.test(naam) ? 'application/pdf' : '' }));
        }
        uit.push(...(await verzamel(binnen)));
      } else if (soort) {
        uit.push({ naam: f.name, blob: f, soort });
      } else {
        uit.push({ naam: f.name, blob: f, soort: null });
      }
    }
    return uit;
  }

  function laadAfbeelding(blob) {
    return new Promise((ok, fout) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); fout(new Error('Deze afbeelding kan niet worden geopend')); };
      img.src = url;
    });
  }

  function naarCanvas(bron, breedte, hoogte, max) {
    const schaal = Math.min(1, max / Math.max(breedte, hoogte));
    const c = document.createElement('canvas');
    c.width = Math.round(breedte * schaal);
    c.height = Math.round(hoogte * schaal);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bron, 0, 0, c.width, c.height);
    return c;
  }

  async function leesAfbeelding(item, voortgang) {
    const img = await laadAfbeelding(item.blob);
    const groot = naarCanvas(img, img.naturalWidth, img.naturalHeight, 2200);
    const klein = naarCanvas(img, img.naturalWidth, img.naturalHeight, 240).toDataURL('image/jpeg', 0.7);
    voortgang('Tekst herkennen…');
    const w = await ocr();
    const { data } = await w.recognize(groot);
    return { tekst: data.text, voorbeeld: klein, ocr: true };
  }

  // Zet de tekstlaag van een PDF-pagina om naar regels, op volgorde van boven naar beneden
  function regelsUitTekstlaag(items) {
    const rijen = [];
    items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5], x = it.transform[4];
      let rij = rijen.find((r) => Math.abs(r.y - y) < 3);
      if (!rij) { rij = { y, delen: [] }; rijen.push(rij); }
      rij.delen.push({ x, s: it.str });
    });
    rijen.sort((a, b) => b.y - a.y);
    return rijen.map((r) => r.delen.sort((a, b) => a.x - b.x).map((d) => d.s).join(' ')).join('\n');
  }

  async function leesPdf(item, voortgang) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await item.blob.arrayBuffer()) }).promise;
    const paginas = Math.min(doc.numPages, 4);
    let tekst = '';
    let voorbeeld = null;
    let ocrGebruikt = false;
    for (let i = 1; i <= paginas; i++) {
      const pagina = await doc.getPage(i);
      const inhoud = await pagina.getTextContent();
      let paginaTekst = regelsUitTekstlaag(inhoud.items);
      if (i === 1) {
        const vp = pagina.getViewport({ scale: 0.5 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        voorbeeld = c.toDataURL('image/jpeg', 0.7);
      }
      // Gescande PDF zonder tekst: pagina als afbeelding lezen
      if (paginaTekst.replace(/\s/g, '').length < 20) {
        voortgang(`Tekst herkennen (pagina ${i})…`);
        const vp = pagina.getViewport({ scale: 2 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const w = await ocr();
        paginaTekst = (await w.recognize(c)).data.text;
        ocrGebruikt = true;
      }
      tekst += paginaTekst + '\n';
    }
    return { tekst, voorbeeld, ocr: ocrGebruikt };
  }

  // Leest alle bestanden en geeft per bon het resultaat van de BonLezer terug.
  // voortgang(tekst, klaar, totaal) houdt het scherm op de hoogte.
  async function lees(bestanden, voortgang) {
    voortgang('Bestanden openen…', 0, 0);
    const items = await verzamel(Array.from(bestanden));
    const resultaten = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const melding = (t) => voortgang(`${item.naam}: ${t}`, i, items.length);
      melding('lezen…');
      if (!item.soort) {
        resultaten.push({ naam: item.naam, fout: 'Dit bestandstype wordt niet ondersteund.' });
        continue;
      }
      try {
        const r = item.soort === 'pdf' ? await leesPdf(item, melding) : await leesAfbeelding(item, melding);
        const vandaag = new Date().toISOString().slice(0, 10);
        resultaten.push({ naam: item.naam, voorbeeld: r.voorbeeld, tekst: r.tekst, boeking: window.BonLezer.lees(r.tekst, item.naam, { vandaag }) });
      } catch (e) {
        resultaten.push({ naam: item.naam, fout: e.message || 'Kon dit bestand niet lezen.' });
      }
    }
    voortgang('Klaar', items.length, items.length);
    return resultaten;
  }

  window.Scanner = { lees, stop };
})();
