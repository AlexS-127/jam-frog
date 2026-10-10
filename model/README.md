# model/

Chord-prediction models trained on [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (CC BY-NC 4.0).

```sh
pip install -r model/requirements.txt
python model/prepare.py       # downloads the CSV (~260 MB) into model/data/, writes token sequences
python model/build_ngram.py   # writes export/ngram.json and export/ngram_eval.json
```

## Tokens (see `export/vocab.json`)

Chords are reduced to (root pitch class, quality) with 8 qualities: maj, min, dim, aug, sus, dom7, maj7, min7.
Slash bass is dropped, power chords (`no3d`) and add-chords count as their triad, extensions fold into their 7th class.
Songs split into sections at tags like `<verse_1>`, and repeated chords collapse.

Tokens are key-independent: each chord is `(interval from the previous root mod 12, quality)`, 96 tokens.
A section starts with `BOS, START_<quality>`. Train/val/test is 90/5/5 by song, stratified by main genre
(about half the songs have no genre; they only feed the "all" model).

## Results (test set, 20k sampled sections)

| Model | Top-1 | Top-3 |
| --- | --- | --- |
| Unigram baseline | 17.4% | — |
| N-gram, "all" | 38.3% | 70.0% |
| N-gram, per genre | 38.8% | 70.0% |
