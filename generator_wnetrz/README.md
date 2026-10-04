# Generator wnętrz

Narzędzia do generowania i oceny układów wnętrz (korytarze + pokoje) dla gry, w której gracz porusza się po mapie kafelkowej.

| Plik | Co to jest |
|---|---|
| `recursive_backtracker.html` | Animacja algorytmu Recursive Backtracker (DFS z powrotami) na komórkach o nieparzystych współrzędnych, z drugą fazą: usuwaniem ślepych zaułków i pętlami. |
| `ocena_ukladu.html` | Generator wnętrz z pokojami 3×3, 3×4, 4×2 i poszerzeniami korytarzy, algorytmem oceny grywalności i kontrolą unikalności. |
| `core.js` | Sam generator i ocena, bez interfejsu. Działa w przeglądarce i w Node (`require('./core.js')`). |

Oba pliki HTML otwiera się bezpośrednio w przeglądarce, bez serwera. `ocena_ukladu.html` ma wbudowaną kopię kodu z `core.js`.

## Generowanie (`generate(P, seed)`)

Mapa ma nieparzyste wymiary w kaflach (`W × H`). Komórki logiczne leżą na kaflach o obu współrzędnych nieparzystych, a kafle między nimi to ściany. Rozmiary pokoi podane są w komórkach logicznych, więc pokój 3×4 zajmuje 5×7 kafli.

1. **Pokoje** 3×3, 3×4/4×3, 4×2/2×4 z odstępem min. 1 komórki.
2. **Labirynt DFS** w wolnych komórkach.
3. **Drzwi**: drzewo rozpinające regionów (Kruskal) + losowe dodatkowe drzwi (maks. 3 na pokój, nigdy obok siebie).
4. **Przerzedzenie**: zasypywanie ślepych końcówek, powstaje lita skała.
5. **Zaułki**: przebicie części ślepych zaułków do sąsiada (najchętniej innego zaułka).
6. **Pętle** między korytarzami, z pominięciem ciasnych pętli 2×2.
7. **Poszerzenia**: drugi pas wzdłuż prostego odcinka 2–4 komórek, tylko od strony litej skały.

Parametry `P`:

```js
{ W: 41, H: 41,            // wymiary w kaflach (nieparzyste)
  density: 0.3,            // docelowy udział powierzchni pokoi
  s33: true, s34: true, s42: true, // dozwolone rozmiary pokoi
  extraDoor: 0.08,         // szansa na dodatkowe drzwi
  sparse: 0.25,            // jaka część korytarzy zostaje zasypana
  braid: 0.5,              // szansa usunięcia ślepego zaułka
  loops: 0.1,              // jaki procent ścian między korytarzami otworzyć
  wide: 4 }                // maks. liczba poszerzeń
```

Wynik: `{ W, H, t, rid, rooms, stages, seed }`, gdzie `t[y*W+x]` to typ kafla: `0` skała, `1` korytarz, `2` pokój, `3` drzwi, `4` poszerzenie, `5` dodatkowe przejście. `rid` to indeks pokoju dla kafli pokoju, a `stages` zawiera stan mapy po każdym etapie.

## Ocena (`evaluate(G, P, history)`)

Układ niespójny (BFS po kaflach nie dochodzi do wszystkich chodliwych pól) dostaje 0. Pozostałe cechy liczone są na grafie nawigacyjnym, w którym pokój to jeden węzeł, a komórka korytarza to węzeł. Każda cecha ma przedział docelowy, poza nim wynik spada liniowo. Ocena końcowa to średnia ważona w skali 0–100.

| Cecha | Cel | Po co |
|---|---|---|
| Pętle na pokój (E − V + 1) / pokoje | 0.5–1.5 | alternatywne drogi |
| Ślepe zaułki na pokój | 0.2–1.0 | trochę eksploracji, bez męczącego cofania |
| Pokoje w pętlach | 50–85% | reszta za wąskim gardłem (most Tarjana oddzielający pokoje) |
| Krętość tras pokój–pokój | 1.3–2.2 | ani nudno prosto, ani frustrujący labirynt |
| Najdłuższa prosta / bok mapy | ≤ 35% | brak długich martwych odcinków |
| Skrzyżowania | 12–32% | punkty decyzji |
| Rozłożenie pokoi w sektorach 3×3 | ≥ 75% | brak pustych połaci |
| Drzwi na pokój | 1.5–2.6 | mało ślepych pokoi |
| Różnorodność rozmiarów pokoi | 100% | wszystkie włączone typy użyte |
| Entropia kształtów korytarzy | ≥ 65% | brak monotonii |
| Unikalność | ≥ 45% | patrz niżej |

Przedziały dobrano po zmierzeniu 300 losowych układów przy domyślnych parametrach. Warto je dostroić pod konkretną grę: są w tablicy `M` w funkcji `evaluate`.

**Unikalność**: odcisk mapy to siatka 6×6 sektorów z udziałem pokoi i pól chodliwych w każdym. Porównanie z każdym układem z `history` (`{ seed, sig }`) uwzględnia odbicia lustrzane. Wynik jest przeskalowany tak, że dwa losowe układy mają ok. 10–35% podobieństwa, a prawie-duplikat ok. 100%.

## Przykład w Node

```js
const { generate, evaluate } = require('./core.js');
const P = { W: 41, H: 41, density: 0.3, s33: true, s34: true, s42: true,
            extraDoor: 0.08, sparse: 0.25, braid: 0.5, loops: 0.1, wide: 4 };
const history = [];
for (let seed = 1; history.length < 5; seed++) {
  const G = generate(P, seed);
  const e = evaluate(G, P, history);
  if (e.connected && e.score >= 85 && e.maxSim <= 0.55) history.push({ seed, sig: e.sig, score: e.score });
}
console.log(history.map(h => `#${h.seed}: ${h.score}`));
```
