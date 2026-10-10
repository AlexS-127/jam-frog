""" Train GRU Model

    python model/train_gru.py            # full run
    python model/train_gru.py --quick    # test

Model: token embedding (64) + genre embedding (64; 13 ids = 12 genres + none/all) added @ each step
-> 1-layer GRU (256) over the last 8 tokens -> logits over the 108 interval tokens. Exp model pads 
 those to 119 w/ -1e9 for the 11 special tokens. Contexts are the last 8, left-padded. For training, 
 replaced genre w/ id 12 ("none/all") 25% of the time.

Writes (to model/export/, or model/checkpoints/quick/ with --quick):
    gru.onnx
    gru_weights.json
    gru_check.json
    gru_eval.json
"""

from __future__ import annotations

import argparse
import gzip
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
EXPORT = HERE / "export"
VOCAB = json.loads((EXPORT / "vocab.json").read_text())

V = VOCAB["size"]
PAD = VOCAB["pad"]
I0 = VOCAB["interval0"]
N_TARGETS = V - I0
GENRES = VOCAB["genres"]
ALL_ID = len(GENRES)
N_GENRE_IDS = len(GENRES) + 1
CTX = 8
EMB = 64
HID = 256


def genre_id(name: str) -> int:
    return GENRES.index(name) if name in GENRES else ALL_ID


def load(split: str) -> tuple[list[str], list[np.ndarray]]:
    path = DATA / f"{split}.tsv.gz"
    if not path.exists():
        raise SystemExit(f"{path} not found")
    genres, seqs = [], []
    with gzip.open(path, "rt") as f:
        for line in f:
            g, toks = line.rstrip("\n").split("\t")
            genres.append(g)
            seqs.append(np.array(toks.split(), dtype=np.int64))
    return genres, seqs


def windows(genres: list[str], seqs: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """interval-token targets (position >= 2) + last-8-token context (left padded)"""
    xs, gs, ys = [], [], []
    for g, s in zip(genres, seqs):
        if len(s) < 3:
            continue
        padded = np.concatenate([np.full(CTX, PAD, dtype=np.int64), s])
        w = np.lib.stride_tricks.sliding_window_view(padded, CTX)[2:len(s)]
        xs.append(w)
        ys.append(s[2:] - I0)
        gs.append(np.full(len(s) - 2, genre_id(g), dtype=np.int64))
    return np.concatenate(xs), np.concatenate(gs), np.concatenate(ys)


class ChordGRU(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.tok = nn.Embedding(V, EMB)
        self.genre = nn.Embedding(N_GENRE_IDS, EMB)
        self.gru = nn.GRU(EMB, HID, batch_first=True)
        self.head = nn.Linear(HID, N_TARGETS)

    def forward(self, tokens: torch.Tensor, genre: torch.Tensor) -> torch.Tensor:
        x = self.tok(tokens) + self.genre(genre)[:, None, :]
        out, _ = self.gru(x)
        return self.head(out[:, -1])  # [B, 108]


class Export(nn.Module):
    """[B, 108] -> [B, 119], specials at -1e9 so a softmax gives them 0"""
    def __init__(self, m: ChordGRU) -> None:
        super().__init__()
        self.m = m

    def forward(self, tokens: torch.Tensor, genre: torch.Tensor) -> torch.Tensor:
        logits = self.m(tokens, genre)
        specials = torch.full((logits.shape[0], I0), -1e9, dtype=logits.dtype)
        return torch.cat([specials, logits], dim=1)


def pick_device(name: str) -> torch.device:
    if name != "auto":
        return torch.device(name)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


@torch.no_grad()
def predict(model: ChordGRU, x: np.ndarray, g: np.ndarray, device: torch.device, batch: int = 8192) -> torch.Tensor:
    model.eval()
    out = []
    for i in range(0, len(x), batch):
        xb = torch.from_numpy(x[i:i + batch]).to(device)
        gb = torch.from_numpy(g[i:i + batch]).to(device)
        out.append(model(xb, gb).float().cpu())
    return torch.cat(out)


def accuracy(logits: torch.Tensor, y: np.ndarray) -> tuple[float, float]:
    yt = torch.from_numpy(y)
    top3 = logits.topk(3, dim=1).indices
    return float((top3[:, 0] == yt).float().mean()), float((top3 == yt[:, None]).any(dim=1).float().mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=45, help="training time budget")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--max-train-seqs", type=int, default=600_000, help="subsample train sections")
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--quick", action="store_true", help="tiny run to check everything works end to end")
    args = ap.parse_args()
    if args.quick:
        args.minutes, args.epochs, args.max_train_seqs = 2, 1, 20_000

    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    device = pick_device(args.device)
    print(f"device: {device}")

    t0 = time.time()
    tr_g, tr_s = load("train")
    if len(tr_s) > args.max_train_seqs:
        keep = rng.choice(len(tr_s), size=args.max_train_seqs, replace=False)
        tr_g, tr_s = [tr_g[i] for i in keep], [tr_s[i] for i in keep]
    x_tr, g_tr, y_tr = windows(tr_g, tr_s)
    va_g, va_s = load("val")
    x_va, g_va, y_va = windows(va_g, va_s)
    if len(x_va) > 200_000:
        keep = rng.choice(len(x_va), size=200_000, replace=False)
        x_va, g_va, y_va = x_va[keep], g_va[keep], y_va[keep]
    print(f"train windows: {len(x_tr):,}  val windows: {len(x_va):,}  ({time.time() - t0:.0f}s to load)")

    model = ChordGRU().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.StepLR(opt, step_size=1, gamma=0.5)
    loss_fn = nn.CrossEntropyLoss()
    X, G, Y = torch.from_numpy(x_tr), torch.from_numpy(g_tr), torch.from_numpy(y_tr)

    deadline = time.time() + args.minutes * 60
    steps_per_epoch = (len(X) + args.batch - 1) // args.batch
    best_top1, best_state = -1.0, None
    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(len(X))
        total, steps, t_ep = 0.0, 0, time.time()
        for i in range(0, len(X), args.batch):
            idx = perm[i:i + args.batch]
            xb, gb, yb = X[idx].to(device), G[idx].clone(), Y[idx].to(device)
            gb[torch.rand(len(gb)) < 0.25] = ALL_ID  # genre dropout -> also learns "all"
            loss = loss_fn(model(xb, gb.to(device)), yb)
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += loss.item()
            steps += 1
            if steps % 500 == 0:
                left = max(0.0, (deadline - time.time()) / 60)
                print(f"  epoch {epoch + 1} step {steps}/{steps_per_epoch}: loss {total / steps:.3f} "
                      f"({left:.0f} min of budget left)")
            if time.time() > deadline:
                break
        sched.step()
        top1, top3 = accuracy(predict(model, x_va, g_va, device), y_va)
        print(f"epoch {epoch + 1}: train loss {total / max(steps, 1):.3f}, val top-1 {top1:.1%} top-3 {top3:.1%} "
              f"({time.time() - t_ep:.0f}s)")
        if top1 > best_top1:
            best_top1 = top1
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        if time.time() > deadline:
            print("time budget reached")
            break

    model.load_state_dict(best_state)
    model = model.cpu()
    out = HERE / "checkpoints" / "quick" if args.quick else EXPORT  # a smoke test never overwrites the real export
    out.mkdir(parents=True, exist_ok=True)
    evaluate_and_export(model, rng_seed=0, quick=args.quick, out=out)


def evaluate_and_export(model: ChordGRU, rng_seed: int, quick: bool, out: Path) -> None:
    cpu = torch.device("cpu")
    # Same test sample as build_ngram.py: default_rng(0).choice(..., 20000)
    te_g, te_s = load("test")
    rng = np.random.default_rng(rng_seed)
    n = min(2_000 if quick else 20_000, len(te_s))
    sample = rng.choice(len(te_s), size=n, replace=False)
    tg, ts = [te_g[i] for i in sample], [te_s[i] for i in sample]
    x, g, y = windows(tg, ts)
    genre_top = accuracy(predict(model, x, g, cpu), y)
    all_top = accuracy(predict(model, x, np.full_like(g, ALL_ID), cpu), y)
    results = {
        "test_sequences_sampled": n,
        "all_model": list(all_top),
        "genre_models": list(genre_top),
        "ngram_for_comparison": {"all_model": [0.376, 0.698], "genre_models": [0.382, 0.698]},
    }
    print(json.dumps(results, indent=2))
    (out / "gru_eval.json").write_text(json.dumps(results, indent=2) + "\n")

    export_weights(model, out)
    export_check(model, tg, ts, out)
    export_onnx(model, out)

    t1, t3 = genre_top
    beats = t1 >= 0.382 and t3 >= 0.698
    print(f"\nGRU (per genre) top-1 {t1:.1%} top-3 {t3:.1%}  vs  n-gram 38.2% / 69.8%  ->  "
          + ("at least as accurate: on to gru.ts and the listening test" if beats else "not better: ship the n-gram"))
    if quick:
        print(f"(quick run: {n:,} test sections, files in {out}; not comparable, don't report these numbers)")


def export_weights(model: ChordGRU, out_dir: Path) -> None:
    sd = {k: v.detach().cpu().numpy() for k, v in model.state_dict().items()}

    def flat(a: np.ndarray) -> list[float]:
        return [round(float(v), 6) for v in a.ravel()]

    out = {
        "vocabSize": V, "interval0": I0, "ctx": CTX, "emb": EMB, "hidden": HID, "genreIds": N_GENRE_IDS,
        "tok": flat(sd["tok.weight"]),                # [V, EMB]
        "genre": flat(sd["genre.weight"]),            # [13, EMB]
        "wIh": flat(sd["gru.weight_ih_l0"]),          # [3*HID, EMB], gate order r, z, n
        "wHh": flat(sd["gru.weight_hh_l0"]),          # [3*HID, HID]
        "bIh": flat(sd["gru.bias_ih_l0"]),
        "bHh": flat(sd["gru.bias_hh_l0"]),
        "headW": flat(sd["head.weight"]),             # [108, HID]
        "headB": flat(sd["head.bias"]),
    }
    path = out_dir / "gru_weights.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {path} ({path.stat().st_size / 1e6:.1f} MB)")


@torch.no_grad()
def export_check(model: ChordGRU, genres: list[str], seqs: list[np.ndarray], out_dir: Path) -> None:
    """Full contexts + genre + all 119 probabilities, so gru.test.ts can check parity (±1e-4).

    The cases cover what gru.ts must get right: a context longer than 8 (keep only the last 8),
    a 2-token context (left-pad with PAD), and the "all" genre.
    """
    model.eval()
    long_i = next((i for i, s in enumerate(seqs) if len(s) >= CTX + 4 and genre_id(genres[i]) != ALL_ID), 0)
    short_i = next((i for i, s in enumerate(seqs) if len(s) >= 3 and i != long_i), long_i)
    picks = [
        (seqs[long_i][:CTX + 3], genre_id(genres[long_i])),  # 11 tokens: truncation
        (seqs[short_i][:2], genre_id(genres[short_i])),      # BOS, START_q: padding
        (seqs[long_i][:5], ALL_ID),                          # "all"
    ]
    cases = []
    for ctx, gid in picks:
        window = np.concatenate([np.full(CTX, PAD, dtype=np.int64), ctx])[-CTX:]
        logits = Export(model)(torch.from_numpy(window[None]), torch.tensor([gid]))
        probs = torch.softmax(logits, dim=1)[0].tolist()
        cases.append({
            "context": [int(t) for t in ctx],
            "genre": GENRES[gid] if gid < ALL_ID else "all",
            "probs": [round(p, 7) for p in probs],
        })
    (out_dir / "gru_check.json").write_text(json.dumps(cases) + "\n")


def export_onnx(model: ChordGRU, out_dir: Path) -> None:
    path = out_dir / "gru.onnx"
    m = Export(model).eval()
    args = (torch.zeros(1, CTX, dtype=torch.int64), torch.tensor([ALL_ID], dtype=torch.int64))
    kw = dict(input_names=["tokens", "genre"], output_names=["logits"], opset_version=17,
              dynamic_axes={"tokens": {0: "batch"}, "genre": {0: "batch"}, "logits": {0: "batch"}})
    try:
        try:
            torch.onnx.export(m, args, str(path), dynamo=False, **kw)
        except TypeError:  # older torch without the dynamo flag
            torch.onnx.export(m, args, str(path), **kw)
        print(f"wrote {path}")
    except Exception as e:  # think onnx might be optional / faster to do with just gru_weights
        print(f"ONNX export failed ({e}); gru_weights.json is still usable")


if __name__ == "__main__":
    main()
