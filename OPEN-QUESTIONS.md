# Open questions

Questions I couldn't settle on my own. Each one already has a default in place, and you can overturn any of them with one sentence.

2. **Repo size.** The Terra example PNGs (4.4 MB) are kept byte-exact because their hashes are cited, so the repo is just over 5 MB without the Kimi fixture. *Default:* keep them exact. Alternative: downscaled JPEGs, which would bring it to about 1 MB.
7. **Research archive.** I carried over research/strategy and news/2026-10-24. I left out competitor research (an .xlsx plus raw JSON, 2026-10-24) and the 2026-10-24/26 drafts (Claude verification, PC shipments, RoboGym). *Default:* they stay in the old repo. Should any be ported as posts?
8. **Re-uploading Kimi.** The Notion page holds the old renders. The new build differs from them only in grain and a small chart offset. *Default:* leave Notion as it is. Re-uploading would need your explicit go-ahead.
9. **Figma.** The Figma sources are referenced in brand/tokens.json, and the import tooling is dropped. *Default:* HTML only.
10. **Unmeasured type metrics.** The old status said the Figma type metrics were still provisional. *Default:* keep the values in layout-tokens.json as they are.

Resolved on 28 Oct 2026 (t49u) and moved to docs/decisions.md: alt text approval (no), title rule (yes), caption length (100–160 body words, warning). Resolved on 28 Oct 2026 (t50u) and moved to docs/decisions.md: Notion route (one-command REST export) and step 9 (stays out).
