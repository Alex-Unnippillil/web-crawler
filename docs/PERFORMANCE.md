<!-- Repository note: Repeated local scale measurements, method, and limits. -->
# Performance observations

## Reproduction

```bash
npm ci
npm run build
node tests/scale.mjs
```

The fixture serves **1,000 actual local HTTP HTML pages**, six same-origin links per page, JSON-LD and ten referenced image URLs. Smart mode, six page workers, zero pacing delay **on this controlled local fixture only**, no retries, and a 120-second overall deadline. It asserts every page is collected, no page failed and zero browsers were launched. It then measures the actual Atlas/workspace model functions and a 500-node / 2,667-edge layout.

For comparison we ran three fresh-process trials of the first hybrid candidate's per-page JSDOM Window parser and three of the identical candidate using one inert parser realm with a fresh detached Document for each page. This is **not a benchmark against the published v4 release**. Trials were interleaved on the same Linux container, Node 24.20.0, five visible logical CPUs, without the browser acceptance suite running concurrently.

| Parser | Trial | Crawl seconds | Peak Node RSS (MiB) |
|---|---:|---:|---:|
| Per-page Window | 1 | 13.274 | 638.5 |
| Per-page Window | 2 | 16.437 | 660.9 |
| Per-page Window | 3 | 15.181 | 691.5 |
| Detached Document | 1 | 6.879 | 443.9 |
| Detached Document | 2 | 9.191 | 444.7 |
| Detached Document | 3 | 6.874 | 463.7 |

Median crawl duration: **15.181 → 6.879 seconds**. Median peak Node RSS: **660.9 → 444.7 MiB**. Retained serialized result was **3.81 MiB** in every trial.

With the detached parser, median Atlas indexing was 74.0 ms, analysis indexing 42.0 ms, link filtering 9.7 ms and 500-node graph layout 350.5 ms. The graph remains capped and its layout is not run unbounded over every captured URL.

## Interpretation and limitations

These are observations, not hardware-independent guarantees or public-internet throughput claims. Real sites add network latency, robots pacing, server rate limits, different HTML, images and browser costs. Peak Node RSS includes the local fixture server and is sampled during progress; it is not a process-allocation trace or total Chromium memory. The fixture declares images but does not download them or launch a browser. It does not establish large-scale browser throughput.

The retained 3.81 MiB record did not justify adding SQLite to fix hundreds of MiB of transient parser overhead. Separate on-demand evidence storage, incremental link counts, bounded records, paginated grids and capped graph views address the measured problems with less migration complexity. The GUI remains bounded to 2,000 candidate URLs/run and does not claim unlimited-memory scalability.

Browser cleanup, deadlines, byte accounting, blocked private destinations, bounded interaction and cancellation are tested separately in `tests/hybrid.test.mjs`. The source/restart/profile/graph workflows are exercised in `tests/hybrid_e2e.py` at four viewport widths. Server API and browser-console errors are checked; those tests are not substitutes for a full assistive-technology or adversarial security audit.
