"""Count chord-token trigrams/bigrams/unigrams per main genre (+ "all") and export JSON.

    python model/build_ngram.py       # after prepare.py

Writes model/export/ngram.json and prints top-1 / top-3 test accuracy.

Smoothing is interpolated absolute discounting (discount D), which the app mirrors in
app/src/core/ngram.ts:

    P(w | a b) = max(c(a b w) - D, 0) / c(a b)  +  D * n(a b) / c(a b) * P(w | b)
    P(w | b)   = same form, backing off to P(w)
    P(w)       = (c(w) + 1) / (N + V)            (add-one over the 96 chord tokens)

where c(..) are counts and n(..) is the number of distinct followers of a context.
Contexts not stored in the file fall straight through to the next order down.
Counts below MIN_COUNT are pruned from the file, but c() and n() of each context keep
their full values, so the pruned mass flows to the lower order.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
EXPORT = HERE / "export"
VOCAB = json.loads((EXPORT / "vocab.json").read_text())

V = VOCAB["size"]
I0 = VOCAB["interval0"]
N_TARGETS = V - I0  # predictions are always one of the 96 interval tokens
GENRES = VOCAB["genres"]
MODELS = ["all"] + GENRES
D = 0.75
MIN_COUNT = 2
MIN_CONTEXT = 5
SIZE_LIMIT = 20 * 1024 * 1024


def load(split: str) -> tuple[list[str], list[np.ndarray]]:
    genres, seqs = [], []
    with gzip.open(DATA / f"{split}.tsv.gz", "rt") as f:
        for line in f:
            g, toks = line.rstrip("\n").split("\t")
            genres.append(g)
            seqs.append(np.fromstring(toks, dtype=np.int32, sep=" "))
    return genres, seqs


def ngrams(seqs: list[np.ndarray]) -> np.ndarray:
    """rows of (a, b, c) for every interval-token target c (position >= 2)."""
    rows = [np.stack([s[:-2], s[1:-1], s[2:]], axis=1) for s in seqs if len(s) >= 3]
    return np.concatenate(rows)


def count_model(tri: np.ndarray) -> dict:
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2] - I0
    uni = np.bincount(c, minlength=N_TARGETS)

    def table(ctx: np.ndarray) -> dict:
        key = ctx * N_TARGETS + c
        keys, counts = np.unique(key, return_counts=True)
        ctxs, tgts = keys // N_TARGETS, keys % N_TARGETS
        out = {}
        bounds = np.flatnonzero(np.diff(ctxs)) + 1
        for cs, ts, ns in zip(np.split(ctxs, bounds), np.split(tgts, bounds), np.split(counts, bounds)):
            total = int(ns.sum())
            if total < MIN_CONTEXT:
                continue
            keep = ns >= MIN_COUNT
            flat = np.stack([ts[keep], ns[keep]], axis=1).ravel().tolist()
            out[int(cs[0])] = [total, int(len(ns)), flat]
        return out

    bi = table(b)
    tri_t = table(a * V + b)
    return {
        "uni": uni.tolist(),
        "bi": {str(k): v for k, v in bi.items()},
        "tri": {f"{k // V},{k % V}": v for k, v in tri_t.items()},
    }


class Predictor:
    """Python mirror of app/src/core/ngram.ts, used for evaluation."""

    def __init__(self, m: dict):
        uni = np.array(m["uni"], dtype=np.float64)
        self.p_uni = (uni + 1) / (uni.sum() + N_TARGETS)
        self.bi = {int(k): self._dense(v) for k, v in m["bi"].items()}
        self.tri = {tuple(map(int, k.split(","))): self._dense(v) for k, v in m["tri"].items()}

    @staticmethod
    def _dense(entry):
        total, n, flat = entry
        counts = np.zeros(N_TARGETS)
        counts[flat[0::2]] = flat[1::2]
        return np.maximum(counts - D, 0) / total, D * n / total

    def predict(self, ctx: np.ndarray) -> np.ndarray:
        p = self.p_uni
        if len(ctx) >= 1 and int(ctx[-1]) in self.bi:
            disc, w = self.bi[int(ctx[-1])]
            p = disc + w * p
        if len(ctx) >= 2 and (int(ctx[-2]), int(ctx[-1])) in self.tri:
            disc, w = self.tri[(int(ctx[-2]), int(ctx[-1]))]
            p = disc + w * p
        return p / p.sum()


def evaluate(predictors: dict, genres: list[str], seqs: list[np.ndarray], use_genre: bool) -> tuple[float, float]:
    top1 = top3 = n = 0
    for g, s in zip(genres, seqs):
        pred = predictors[g if use_genre and g in predictors else "all"]
        for t in range(2, len(s)):
            p = pred.predict(s[:t])
            target = s[t] - I0
            best = np.argpartition(-p, 3)[:3]
            top1 += int(np.argmax(p) == target)
            top3 += int(target in best)
            n += 1
    return top1 / n, top3 / n


def main() -> None:
    genres, seqs = load("train")
    g_arr = np.array(genres)
    models = {}
    for name in MODELS:
        subset = seqs if name == "all" else [s for s, keep in zip(seqs, g_arr == name) if keep]
        models[name] = count_model(ngrams(subset))
        print(f"{name:12s} sequences={len(subset):8d} bigram ctx={len(models[name]['bi']):4d} "
              f"trigram ctx={len(models[name]['tri']):6d}")

    out = {"vocabSize": V, "interval0": I0, "discount": D, "models": models}
    text = json.dumps(out, separators=(",", ":"))
    path = EXPORT / "ngram.json"
    path.write_text(text)
    size = len(text.encode())
    print(f"wrote {path} ({size / 1e6:.1f} MB)")
    assert size < SIZE_LIMIT, "n-gram export over 20 MB; raise MIN_COUNT"

    test_genres, test_seqs = load("test")
    preds = {name: Predictor(m) for name, m in models.items()}
    rng = np.random.default_rng(0)
    sample = rng.choice(len(test_seqs), size=min(20000, len(test_seqs)), replace=False)
    tg = [test_genres[i] for i in sample]
    ts = [test_seqs[i] for i in sample]
    unigram_top1 = float(np.mean([s[t] - I0 == np.argmax(models["all"]["uni"]) for s in ts for t in range(2, len(s))]))
    results = {
        "test_sequences_sampled": len(ts),
        "unigram_baseline_top1": unigram_top1,
        "all_model": evaluate(preds, tg, ts, use_genre=False),
        "genre_models": evaluate(preds, tg, ts, use_genre=True),
    }
    print(json.dumps(results, indent=2))
    (EXPORT / "ngram_eval.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
