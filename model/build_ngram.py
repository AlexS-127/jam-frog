"""Count chord-token n-grams and export them as JSON for the app.

    python model/build_ngram.py       # after prepare.py

Writes model/export/ngram.json and model/export/ngram_eval.json (top-1 / top-3 test accuracy).

Layout: one "all" model with contexts of up to MAX_CONTEXT_ALL tokens (a 5-gram), plus one model per
main genre with contexts of up to MAX_CONTEXT_GENRE tokens (a trigram). A genre's prediction uses its own
short contexts and the shared long ones on top. Contexts are left-padded with PAD (0), so the start of a
section looks like [0, 0, BOS, START_q].

Smoothing is interpolated absolute discounting (discount D), mirrored in app/src/core/ngram.ts:

    P_k(w | h_k) = max(c(h_k w) - D, 0) / c(h_k)  +  D * n(h_k) / c(h_k) * P_{k-1}(w | h_{k-1})
    P_0(w)       = (c(w) + 1) / (N + V)            (add-one over the 108 chord tokens)

h_k is the last k context tokens, c(..) are counts and n(..) the number of distinct followers.
Contexts not stored in the file fall straight through to the next order down. Counts below the
order's MIN_COUNT are pruned from the file, but c() and n() keep their full values, so the pruned
mass flows to the lower order.
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
PAD = VOCAB["pad"]
N_TARGETS = V - I0  # predictions are always one of the 108 interval tokens
GENRES = VOCAB["genres"]
MODELS = ["all"] + GENRES
D = 0.75
MAX_CONTEXT_ALL = 4
MAX_CONTEXT_GENRE = 2
MIN_COUNT = {1: 2, 2: 2, 3: 3, 4: 5}
MIN_CONTEXT = 5
SIZE_LIMIT = 20 * 1024 * 1024


def load(split: str) -> tuple[list[str], list[np.ndarray]]:
    genres, seqs = [], []
    with gzip.open(DATA / f"{split}.tsv.gz", "rt") as f:
        for line in f:
            g, toks = line.rstrip("\n").split("\t")
            genres.append(g)
            seqs.append(np.fromstring(toks, dtype=np.int64, sep=" "))
    return genres, seqs


def rows(seqs: list[np.ndarray], k: int) -> np.ndarray:
    """One row per interval-token target (position >= 2): k context tokens (left-padded), then target - I0."""
    out = []
    for s in seqs:
        if len(s) < 3:
            continue
        p = np.concatenate([np.full(k, PAD, dtype=np.int64), s])
        t = np.arange(k + 2, len(p))
        ctx = np.stack([p[t - j] for j in range(k, 0, -1)], axis=1)  # oldest .. newest
        out.append(np.concatenate([ctx, (p[t] - I0)[:, None]], axis=1))
    return np.concatenate(out)


def count_model(r: np.ndarray, max_ctx: int) -> dict:
    k = r.shape[1] - 1
    target = r[:, -1]
    model = {"uni": np.bincount(target, minlength=N_TARGETS).tolist(), "ctx": {}}
    for order in range(1, max_ctx + 1):
        key = np.zeros(len(r), dtype=np.int64)
        for c in range(k - order, k):
            key = key * V + r[:, c]
        keys, counts = np.unique(key * N_TARGETS + target, return_counts=True)
        ctxs, tgts = keys // N_TARGETS, keys % N_TARGETS
        bounds = np.flatnonzero(np.diff(ctxs)) + 1
        table = {}
        for cs, ts, ns in zip(np.split(ctxs, bounds), np.split(tgts, bounds), np.split(counts, bounds)):
            total = int(ns.sum())
            if total < MIN_CONTEXT:
                continue
            keep = ns >= MIN_COUNT[order]
            toks, c = [], int(cs[0])
            for _ in range(order):
                toks.append(c % V)
                c //= V
            name = ",".join(map(str, reversed(toks)))
            table[name] = [total, int(len(ns)), np.stack([ts[keep], ns[keep]], axis=1).ravel().tolist()]
        model["ctx"][str(order)] = table
    return model


class Predictor:
    """Python mirror of app/src/core/ngram.ts, used for evaluation."""

    def __init__(self, models: dict, genre: str):
        own = models[genre]
        shared = models["all"]
        uni = np.array(own["uni"], dtype=np.float64)
        self.p_uni = (uni + 1) / (uni.sum() + N_TARGETS)
        self.tables = []  # per order: the genre's own table if it has that order, else the shared one
        for order in range(1, MAX_CONTEXT_ALL + 1):
            src = own if str(order) in own["ctx"] else shared
            self.tables.append(src["ctx"][str(order)])
        self.cache: dict = {}

    def _dense(self, order: int, key: str):
        ck = (order, key)
        if ck not in self.cache:
            entry = self.tables[order - 1].get(key)
            if entry is None:
                self.cache[ck] = None
            else:
                total, n, flat = entry
                counts = np.zeros(N_TARGETS)
                counts[flat[0::2]] = flat[1::2]
                self.cache[ck] = (np.maximum(counts - D, 0) / total, D * n / total)
        return self.cache[ck]

    def predict(self, ctx) -> np.ndarray:
        ctx = [PAD] * MAX_CONTEXT_ALL + [int(t) for t in ctx]
        p = self.p_uni
        for order in range(1, MAX_CONTEXT_ALL + 1):
            d = self._dense(order, ",".join(map(str, ctx[-order:])))
            if d is not None:
                p = d[0] + d[1] * p
        return p / p.sum()


def evaluate(models: dict, genres: list[str], seqs: list[np.ndarray], use_genre: bool) -> tuple[float, float]:
    preds = {g: Predictor(models, g) for g in MODELS}
    top1 = top3 = n = 0
    for g, s in zip(genres, seqs):
        pred = preds[g if use_genre and g in preds else "all"]
        for t in range(2, len(s)):
            p = pred.predict(s[:t])
            target = s[t] - I0
            top1 += int(np.argmax(p) == target)
            top3 += int(target in np.argpartition(-p, 3)[:3])
            n += 1
    return top1 / n, top3 / n


def main() -> None:
    genres, seqs = load("train")
    g_arr = np.array(genres)
    models = {}
    for name in MODELS:
        subset = seqs if name == "all" else [s for s, keep in zip(seqs, g_arr == name) if keep]
        max_ctx = MAX_CONTEXT_ALL if name == "all" else MAX_CONTEXT_GENRE
        models[name] = count_model(rows(subset, MAX_CONTEXT_ALL), max_ctx)
        sizes = " ".join(f"{o}:{len(t)}" for o, t in models[name]["ctx"].items())
        print(f"{name:12s} sequences={len(subset):8d} contexts by order {sizes}")

    out = {"vocabSize": V, "interval0": I0, "pad": PAD, "discount": D, "maxContext": MAX_CONTEXT_ALL, "models": models}
    text = json.dumps(out, separators=(",", ":"))
    path = EXPORT / "ngram.json"
    path.write_text(text)
    size = len(text.encode())
    print(f"wrote {path} ({size / 1e6:.1f} MB)")
    assert size < SIZE_LIMIT, "n-gram export over 20 MB; raise MIN_COUNT"

    test_genres, test_seqs = load("test")
    rng = np.random.default_rng(0)
    sample = rng.choice(len(test_seqs), size=min(20000, len(test_seqs)), replace=False)
    tg = [test_genres[i] for i in sample]
    ts = [test_seqs[i] for i in sample]
    results = {
        "test_sequences_sampled": len(ts),
        "orders": {"all": MAX_CONTEXT_ALL + 1, "genre": MAX_CONTEXT_GENRE + 1},
        "all_model": evaluate(models, tg, ts, use_genre=False),
        "genre_models": evaluate(models, tg, ts, use_genre=True),
    }
    print(json.dumps(results, indent=2))
    (EXPORT / "ngram_eval.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
