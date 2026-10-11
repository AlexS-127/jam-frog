# Katie's Jam Frog Changes

## PR history
| PR | Author | Status | Summary |
| --- | --- | --- | --- |
| [#1 — GRU chord model](https://github.com/AlexS-127/jam-frog/pull/1) | Katie Duong | Merged | Designed, trained and shipped the GRU next-chord model: training and export pipeline, in-app TypeScript model, parity tests and evaluation. 60.5% top-1 / 82.6% top-3. |
| [#13 — Hand-drawn thank-you frog](https://github.com/AlexS-127/jam-frog/pull/13) | Katie Duong | Merged | An original hand-drawn Jam Frog illustration with hand lettering. |

## Katie's merged work

### PR #1 — GRU chord model (lane D)

The app's neural chord model, end to end: data to training to export to running inside the app.

- **Model.** A GRU that predicts the next chord from the last 8 chords: token embedding (64) plus a genre
  embedding (13 ids: 12 genres + none/all) added at every step, then one GRU layer of 256. Trained with 25% genre
  dropout, so one set of weights serves both per-genre and "all" predictions.
- **Training pipeline (`model/train_gru.py`).** Trains on Chordonomicon under a time budget on Apple Silicon (`mps`),
  keeps the best epoch by validation accuracy, and exports `gru_weights.json`, `gru.onnx` (input `[1, 8]` int64
  tokens + genre id, output `[1, 119]` logits), `gru_check.json` and `gru_eval.json`. A `--quick` mode writes to
  `model/checkpoints/quick/` so a smoke test never overwrites the shipped model.
- **In-app model (`app/src/core/gru.ts`).** `GruModel implements ChordModel` and runs the GRU forward pass in plain
  TypeScript from the exported weights, in under 5 ms per call. This keeps `predictNext` synchronous, as the
  `ChordModel` contract requires, and adds no dependency (`onnxruntime-web` was planned, but its `run()` is async).
- **Tests (`app/src/core/gru.test.ts`).** The TypeScript model matches PyTorch to ±1e-4 on exported cases, plus
  tests for context truncation and padding, genre mapping, the vocabulary guard and the 5 ms budget.
- **Results (`model/README.md`).** On the same 20k-section test sample (seed 0) as the n-gram:
  **60.5% top-1 / 82.6% top-3**, against **56.2% / 79.6%** for the best n-gram.

**Shipped:** the app runs Katie's GRU. Alex retrained it with her `train_gru.py` on all 2.6M training sections
(commit `ee30959`, **61.5% / 83.3%**), and it was wired into the app with a model picker (commit `995b9d0`) and the
blind listening test (commit `f0eb52f`).

### PR #13 — Hand-drawn thank-you frog (lane F)

- An original illustration, drawn by hand
- Files (1920×1080 PNG):
  - `docs/art/jf.png`: the finished piece on white.
  - `docs/art/jf_transparent.png`: on a transparent background.