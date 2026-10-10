"""Turn Chordonomicon into key-independent chord-token sequences.

    python model/prepare.py            # downloads the CSV on first run (~260 MB)

Outputs (under model/data/, gitignored):
    train.tsv.gz, val.tsv.gz, test.tsv.gz   one sequence per line: "<genre>\t<tok> <tok> ..."
and model/export/vocab.json, the token layout shared with the app.

Token layout (106 tokens):
    0            PAD
    1            BOS   (start of a section)
    2..9         START_<quality>: the first chord of a section, which has no previous root
    10..105      10 + interval*8 + quality, interval = (root - previous root) mod 12
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
EXPORT = HERE / "export"
CSV = DATA / "chordonomicon_v2.csv"
CSV_URL = "https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv"

QUALITIES = ["maj", "min", "dim", "aug", "sus", "dom7", "maj7", "min7"]
GENRES = ["pop", "rock", "country", "alternative", "pop rock", "punk",
          "metal", "rap", "soul", "jazz", "reggae", "electronic"]
NO_GENRE = "none"  # about half the songs have no main_genre; they only feed the "all" model

PAD, BOS, START0, INTERVAL0 = 0, 1, 2, 10
VOCAB_SIZE = INTERVAL0 + 12 * len(QUALITIES)

# Every suffix in chordonomicon_v2.csv, folded into the 8 classes.
SUFFIX_CLASS = {
    "": "maj", "no3d": "maj", "add9": "maj", "add11": "maj", "add13": "maj", "majs9": "maj",
    "min": "min", "minadd9": "min", "minadd11": "min", "minadd13": "min", "minb9": "min",
    "minmaj7": "min", "minmaj9": "min", "minmaj11": "min", "minmaj13": "min",
    "dim": "dim", "dim7": "dim", "dimb7": "dim", "dim9": "dim", "dimb9": "dim", "dim11": "dim",
    "dimadd11": "dim", "dimadd13": "dim", "dim11b9": "dim", "dim13b9": "dim",
    "aug": "aug", "augmaj7": "aug", "augmaj9": "aug", "augmaj11": "aug",
    "sus2": "sus", "sus4": "sus", "7sus2": "sus", "7sus4": "sus", "maj7sus2": "sus", "maj7sus4": "sus",
    "7": "dom7", "9": "dom7", "11": "dom7", "13": "dom7", "7b9": "dom7", "11s": "dom7", "11b9": "dom7",
    "13b": "dom7", "13b9": "dom7",
    "maj7": "maj7", "maj9": "maj7", "maj11": "maj7", "maj13": "maj7", "maj911s": "maj7",
    "majs911s": "maj7", "maj1311s": "maj7",
    "min7": "min7", "min9": "min7", "min11": "min7", "min13": "min7", "min1113b": "min7",
}
LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY_INDEX = {q: i for i, q in enumerate(QUALITIES)}

_cache: dict[str, tuple[int, int] | None] = {}


def parse_chord(symbol: str) -> tuple[int, int] | None:
    """'Fs7' -> (6, dom7 index). Slash bass is dropped. None if unparseable.

    Sharps are spelled 's', so 'Csus4' is tried as C# + 'us4' first, which is not a
    known suffix, and then as C + 'sus4'.
    """
    if symbol in _cache:
        return _cache[symbol]
    head = symbol.split("/")[0]
    result = None
    if head and head[0] in LETTER_PC:
        pc = LETTER_PC[head[0]]
        rest = head[1:]
        if rest[:1] in ("s", "b") and rest[1:] in SUFFIX_CLASS:
            pc += 1 if rest[0] == "s" else -1
            rest = rest[1:]
        if rest in SUFFIX_CLASS:
            result = (pc % 12, QUALITY_INDEX[SUFFIX_CLASS[rest]])
    _cache[symbol] = result
    return result


def song_sequences(chords: str) -> list[list[int]]:
    """Split a song at section tags, collapse repeats, tokenise each section."""
    sections: list[list[tuple[int, int]]] = [[]]
    for sym in chords.split():
        if sym.startswith("<"):
            sections.append([])
            continue
        c = parse_chord(sym)
        if c is None:
            continue
        if not sections[-1] or sections[-1][-1] != c:
            sections[-1].append(c)
    out = []
    for sec in sections:
        if len(sec) < 2:
            continue
        toks = [BOS, START0 + sec[0][1]]
        for (prev_root, _), (root, q) in zip(sec, sec[1:]):
            toks.append(INTERVAL0 + ((root - prev_root) % 12) * len(QUALITIES) + q)
        out.append(toks)
    return out


def split_by_song(genres: pd.Series, seed: int = 0) -> np.ndarray:
    """0/1/2 = train/val/test per song, 90/5/5 within each main genre."""
    rng = np.random.default_rng(seed)
    split = np.zeros(len(genres), dtype=np.int8)
    for _, idx in genres.groupby(genres).indices.items():
        idx = rng.permutation(idx)
        n_val = n_test = max(1, round(len(idx) * 0.05))
        split[idx[:n_val]] = 1
        split[idx[n_val:n_val + n_test]] = 2
    return split


def write_vocab() -> None:
    EXPORT.mkdir(exist_ok=True)
    vocab = {
        "size": VOCAB_SIZE,
        "pad": PAD,
        "bos": BOS,
        "start0": START0,
        "interval0": INTERVAL0,
        "qualities": QUALITIES,
        "genres": GENRES,
        "layout": "interval token = interval0 + ((root - prevRoot) mod 12) * len(qualities) + quality",
    }
    (EXPORT / "vocab.json").write_text(json.dumps(vocab, indent=2) + "\n")


def main() -> None:
    DATA.mkdir(exist_ok=True)
    if not CSV.exists():
        print(f"downloading {CSV_URL}")
        urllib.request.urlretrieve(CSV_URL, CSV)
    df = pd.read_csv(CSV, usecols=["id", "chords", "main_genre"], dtype=str)
    df = df.dropna(subset=["chords"]).reset_index(drop=True)
    genres = df["main_genre"].fillna(NO_GENRE)
    unknown = set(genres) - set(GENRES) - {NO_GENRE}
    if unknown:
        sys.exit(f"unexpected genres {unknown}; update GENRES")
    split = split_by_song(genres)

    names = ["train", "val", "test"]
    files = [gzip.open(DATA / f"{n}.tsv.gz", "wt") for n in names]
    stats = Counter()
    for chords, genre, s in zip(df["chords"], genres, split):
        for toks in song_sequences(chords):
            files[s].write(f"{genre}\t{' '.join(map(str, toks))}\n")
            stats[names[s], "sequences"] += 1
            stats[names[s], "chords"] += len(toks) - 1
        stats[names[s], "songs"] += 1
    for f in files:
        f.close()
    write_vocab()

    unparsed = [s for s, v in _cache.items() if v is None]
    print(f"symbols: {len(_cache)} distinct, unparsed: {unparsed[:10]}")
    for n in names:
        print(f"{n:5s} songs={stats[n, 'songs']:7d} sequences={stats[n, 'sequences']:8d} chords={stats[n, 'chords']:9d}")


if __name__ == "__main__":
    main()
