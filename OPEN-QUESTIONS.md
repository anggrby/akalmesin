# Open questions

Questions I couldn't settle on my own. Each one already has a default in place, and you can overturn any of them with one sentence.

2. **Repo size.** The Terra example PNGs (4.4 MB) are kept byte-exact because their hashes are cited, so the repo is just over 5 MB without the Kimi fixture. _Default:_ keep them exact. Alternative: downscaled JPEGs, which would bring it to about 1 MB.
3. **Research archive.** I carried over research/strategy and news/2026-10-24. I left out competitor research (an .xlsx plus raw JSON, 2026-10-24) and the 2026-10-24/26 drafts (Claude verification, PC shipments, RoboGym). _Default:_ they stay in the old repo. Should any be ported as posts?
4. **Re-uploading Kimi.** The Notion page holds the old renders. The new build differs from them only in grain and a small chart offset. _Default:_ leave Notion as it is. Re-uploading would need your explicit go-ahead.
5. **Values not on the sheets.** Wordmark row 60 (sheet: auto), metadata line height 30 (auto), category right-aligned, credit inset 64/44, credit gradient 260 px at 80% black, 24 px between detail paragraphs. _Default:_ current behaviour, listed under `unmeasured` in brand/tokens.json until you measure them.

Resolved on 28 Oct 2026 (t49u) and moved to docs/decisions.md: alt text approval (no), title rule (yes), caption length (100–160 body words, warning). Resolved on 28 Oct 2026 (t50u) and moved to docs/decisions.md: Notion route (one-command REST export) and step 9 (stays out). Resolved on 28 Oct 2026 (t52u): your sheets are the design source of truth and Figma is dropped (old questions 9 and 10). Resolved on 28 Oct 2026 (t54u): Quote has no masthead; the quote-mark size comes from your example.
