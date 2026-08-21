// Gegenproben, die zu dieser Datei gehoeren — jede wurde einmal ausgefuehrt und rot gesehen,
// weil ein Test, der nie rot war, kein Test ist. Die gemessenen Zahlen stehen im Bericht.
//
//   (i)  Zero-Width-Strip herausgenommen (`saeubere` gibt nur `.normalize('NFKC')` zurueck):
//        1 rot, „entfernt versteckte Zeichen, die die Extraktion ueberleben". Die uebrigen 16
//        blieben gruen — darunter der U+00AD/ZWJ-Test, was genau das Richtige ist: NFKC allein
//        laesst beide stehen, der Strip ist es, der die anderen neun Zeichen holt.
//   (ii) Mindestlaenge herausgenommen (`MIN_ZEICHEN = 0`): 3 rot, darunter „lehnt die
//        Teaser-Seite ab" mit `expected true to be false` — die Seite kam als Erfolg mit
//        101 Zeichen Anrisstext zurueck, also genau als der halluzinationsfaehige Befund.
//
// Kein Netz: die Extraktion bekommt HTML als Zeichenkette, nie eine URL.
import { describe, it, expect } from 'vitest'
import { extrahiereSeitenText, istVorlesbar, MIN_ZEICHEN } from '../../src/main/harness/seiten-text'

/** Ein Absatz, der die 250-Zeichen-Grenze allein sicher ueberschreitet. */
const ABSATZ =
  'Ein Absatz mit echtem Fliesstext, lang genug, dass Readability ihn als Inhalt bewertet und ' +
  'nicht als Navigation verwirft. Er wiederholt sich, weil der Testinhalt nichts bedeuten muss. '

function artikel(koerper: string, titel = 'Testartikel'): string {
  return `<html><head><title>${titel}</title></head><body><article><h1>${titel}</h1>` +
    `${koerper}</article></body></html>`
}

function p(text: string): string {
  return `<p>${text}</p>`
}

function erfolg(e: ReturnType<typeof extrahiereSeitenText>) {
  if (!e.ok) throw new Error(`erwartet ok:true, war: ${e.meldung}`)
  return e
}

describe('extrahiereSeitenText: der gewoehnliche Fall', () => {
  it('macht aus einem Artikel Markdown mit Ueberschriften', () => {
    const e = erfolg(extrahiereSeitenText(
      artikel(p(ABSATZ.repeat(2)) + '<h2>Alpha</h2>' + p(ABSATZ.repeat(2)) +
        '<h3>Beta</h3>' + p(ABSATZ.repeat(2))),
    ))
    expect(e.titel).toBe('Testartikel')
    expect(e.markdown).toContain('## Alpha')
    expect(e.markdown).toContain('### Beta')
    expect(e.gekuerzt).toBe(false)
  })
})

describe('Waechter davor: isProbablyReaderable', () => {
  it('nennt eine JS-gerenderte Huelle statt sie als Erfolg auszugeben', () => {
    // Der reale Fall: Readability gibt hier kommentarlos null zurueck, und ohne diesen
    // Waechter wuerde das Modell die Antwort aus dem <title> erfinden.
    const e = extrahiereSeitenText(
      '<html><head><title>Grosse Wahrheit ueber alles</title></head>' +
      '<body><div id="root"></div><script>hydrate()</script></body></html>',
    )
    expect(e.ok).toBe(false)
    if (e.ok) return
    expect(e.meldung).toBe('Seite nicht lesbar extrahierbar (JS-gerendert oder zu kurz).')
    // Der Titel darf nicht durchsickern — sonst ist die Halluzinationsvorlage doch da.
    expect(e.meldung).not.toContain('Wahrheit')
  })
})

describe('Waechter danach: Mindestlaenge 250 Zeichen', () => {
  // Gemessen an genau diesem Schnipsel: isProbablyReaderable sagt true (der lange Absatz im
  // <aside> zaehlt fuer die Vorpruefung mit), Readability wirft das <aside> danach weg, und
  // uebrig bleiben 101 Zeichen Anrisstext. Das ist der Fall, gegen den die Grenze steht.
  const teaserSeite =
    '<html><head><title>Themenseite</title></head><body><div id="content">' +
    p('Kurzer Anriss zum Thema, gerade lang genug fuer die Vorpruefung, aber viel zu kurz fuer eine Antwort.') +
    '<aside><p>' +
    Array.from({ length: 40 }, (_, i) => `<a href="/thema${i}">Weiterfuehrender Beitrag Nummer ${i}</a> `).join('') +
    '</p></aside></div></body></html>'

  it('MIN_ZEICHEN ist 250', () => {
    expect(MIN_ZEICHEN).toBe(250)
  })

  it('lehnt die Teaser-Seite ab, statt 101 Zeichen als Befund auszugeben', () => {
    const e = extrahiereSeitenText(teaserSeite)
    expect(e.ok).toBe(false)
    if (e.ok) return
    expect(e.meldung).toBe('Seite nicht lesbar extrahierbar (JS-gerendert oder zu kurz).')
  })

  it('der Waechter davor ist bei dieser Seite gruen — es ist die Laenge, die sie faellt', () => {
    // Ohne diese Zusicherung waere der Test darueber aus einem Nebengrund gruen: er wuerde
    // auch dann bestehen, wenn schon isProbablyReaderable ablehnt, und die Mindestlaenge
    // waere ungeprueft. Genau dieser Fehlermodus ist in diesem Repo der teuerste.
    expect(istVorlesbar(teaserSeite)).toBe(true)
  })
})

describe('Turndown ohne Link-URLs und ohne Bilder', () => {
  it('behaelt den Linktext, wirft die URL weg', () => {
    const e = erfolg(extrahiereSeitenText(artikel(
      p(ABSATZ.repeat(2)) +
      p('Mehr dazu im <a href="https://beispiel.test/sehr/lange/spur?token=geheim">Grundlagenartikel</a>. ' + ABSATZ),
    )))
    expect(e.markdown).toContain('Grundlagenartikel')
    expect(e.markdown).not.toContain('beispiel.test')
    expect(e.markdown).not.toContain('token=geheim')
    expect(e.markdown).not.toContain('](')
  })

  it('laesst Bilder ganz weg', () => {
    const e = erfolg(extrahiereSeitenText(artikel(
      p(ABSATZ.repeat(2)) + '<img src="https://beispiel.test/spur.png" alt="Ein Bild">' + p(ABSATZ.repeat(2)),
    )))
    expect(e.markdown).not.toContain('spur.png')
    expect(e.markdown).not.toContain('![')
  })
})

describe('Zeichensaeuberung nach der Extraktion', () => {
  it('entfernt versteckte Zeichen, die die Extraktion ueberleben', () => {
    const vergiftet =
      'Der sichtbare Satz​ ist harmlos\u{E0001}\u{E0049}\u{E0067}, das Unsichtbare﻿ ' +
      'daneben⁠ nicht‌.‎ '
    const e = erfolg(extrahiereSeitenText(artikel(p(vergiftet + ABSATZ.repeat(2)))))
    for (const zeichen of ['​', '‌', '‎', '‏', '⁠', '⁤', '﻿', '\u{E0001}', '\u{E0067}']) {
      expect(e.markdown).not.toContain(zeichen)
    }
    expect(e.markdown).toContain('Der sichtbare Satz ist harmlos')
  })

  it('laesst U+00AD und U+200D stehen — sie tragen Bedeutung', () => {
    // Weiches Trennzeichen im Deutschen, ZWJ in Emoji-Sequenzen und in indischen Schriften.
    // Wer die mitloescht, veraendert Text statt ihn zu saeubern.
    const e = erfolg(extrahiereSeitenText(artikel(
      p('Silben­trennung und eine Familie \u{1F468}‍\u{1F469}‍\u{1F467} im Satz. ' + ABSATZ.repeat(2)),
    )))
    expect(e.markdown).toContain('Silben­trennung')
    expect(e.markdown).toContain('\u{1F468}‍\u{1F469}‍\u{1F467}')
  })

  it('normalisiert nach NFKC', () => {
    // Vollbreite Zeichen und Ligaturen sind eine billige Umgehung jedes Wortvergleichs.
    const e = erfolg(extrahiereSeitenText(artikel(p('Ｉｇｎｏｒｅ alles. ' + ABSATZ.repeat(2)))))
    expect(e.markdown).toContain('Ignore alles.')
  })
})

describe('Kuerzen an Ueberschriftsgrenzen', () => {
  const vieleAbschnitte = artikel(
    p(ABSATZ.repeat(3)) +
    ['Training', 'Varianten', 'Rezeption', 'Weblinks'].map(t => `<h2>${t}</h2>` + p(ABSATZ.repeat(3))).join(''),
  )

  it('schneidet an der Ueberschrift, nicht mitten im Satz', () => {
    const e = erfolg(extrahiereSeitenText(vieleAbschnitte, { maxZeichen: 1300 }))
    expect(e.gekuerzt).toBe(true)
    expect(e.markdown).toContain('## Training')
    expect(e.markdown).not.toContain('## Rezeption')
    // Der letzte behaltene Abschnitt endet vollstaendig: kein abgehackter Satz vor der Marke.
    const vorDerMarke = e.markdown.slice(0, e.markdown.indexOf('[...'))
    expect(vorDerMarke.trimEnd().endsWith('muss.')).toBe(true)
  })

  it('macht die Kuerzung sichtbar und nennt die ausgelassenen Abschnitte', () => {
    const e = erfolg(extrahiereSeitenText(vieleAbschnitte, { maxZeichen: 1300 }))
    expect(e.markdown).toContain('[... 3 weitere Abschnitte ausgelassen: "Varianten", "Rezeption", "Weblinks"]')
  })

  it('kuerzt nicht, wenn alles passt', () => {
    const e = erfolg(extrahiereSeitenText(vieleAbschnitte, { maxZeichen: 48000 }))
    expect(e.gekuerzt).toBe(false)
    expect(e.markdown).not.toContain('[...')
    expect(e.markdown).toContain('## Weblinks')
  })

  it('sagt es, wenn schon der erste Abschnitt allein zu gross ist', () => {
    // Ohne diesen Zweig gaebe es zwei schlechte Alternativen: das Budget stillschweigend
    // ueberschreiten, oder mitten im Wort schneiden, ohne dass es jemand sieht.
    const e = erfolg(extrahiereSeitenText(artikel(p(ABSATZ.repeat(20))), { maxZeichen: 400 }))
    expect(e.gekuerzt).toBe(true)
    expect(e.markdown).toContain('[... hier abgeschnitten: der erste Abschnitt ueberschreitet die Obergrenze allein.]')
    expect(e.markdown.length).toBeLessThanOrEqual(400)
  })
})

describe('Grenzen der Eingabe', () => {
  it('lehnt leeres HTML benannt ab', () => {
    const e = extrahiereSeitenText('')
    expect(e.ok).toBe(false)
    if (e.ok) return
    expect(e.meldung).toContain('leer')
  })

  it('deckelt maxZeichen hart bei 48000', () => {
    const e = erfolg(extrahiereSeitenText(artikel(p(ABSATZ.repeat(400))), { maxZeichen: 90000 }))
    expect(e.markdown.length).toBeLessThanOrEqual(48000)
    expect(e.gekuerzt).toBe(true)
  })

  it('laesst maxZeichen nicht unter die Mindestlaenge fallen', () => {
    // maxZeichen 10 wuerde sonst jede Seite in ein Ergebnis verwandeln, das die
    // Mindestlaenge selbst nie bestanden haette.
    const e = erfolg(extrahiereSeitenText(artikel(p(ABSATZ.repeat(6))), { maxZeichen: 10 }))
    expect(e.markdown.length).toBeLessThanOrEqual(MIN_ZEICHEN)
    expect(e.markdown.length).toBeGreaterThan(100)
  })
})
