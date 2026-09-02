# VerseList

Paste a list of Bible verse references and read them together — in the
order you gave, sorted into Bible order, or dragged into your own order.

Anyone can use it, not just readers of other gospelgo.org apps — full book
names and common abbreviations both work.

```
Matthew 5:11-12
Luke 6:22-23
Acts 5:41
Acts 16:25
```

Live at [verselist.gospelgo.org](https://verselist.gospelgo.org).

## Development

No build step — plain HTML/CSS/JS. Serve the directory with any static
file server:

```
npx serve .
# or
python -m http.server 8080
```

## Data

`data/books/{ID}.json` — one file per book, Berean Standard Bible (BSB),
copied from the [Bible Peruser](https://bible-peruser.gospelgo.org) project's
data pipeline. Fetched on demand per book referenced, not loaded all at once.

## Sharing / linking

See [`docs/linking.md`](docs/linking.md) for the `#refs=...` URL format used
by the "Copy Link" button — useful if another app wants to hand a list off
to VerseList directly.

## Sibling projects

- [Bible Peruser](https://bible-peruser.gospelgo.org) — full chapter reader
  with study notes and highlights.
- [Bible Explorer](https://bible-explorer.gospelgo.org) — topical/thematic
  Bible exploration.
