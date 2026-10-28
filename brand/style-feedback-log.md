# akalmesin: Proposed vs. Adjusted (style feedback log)

## Evidence status — 27 October 2026

Read this log before drafting to understand observed owner edits. It is a historical feedback record, not a second rulebook or current story-status tracker. [editorial-style.md](voice.md) is the authoritative writing guide; [DESIGN.md](design.md) owns the visual specification; [workflow.md](../docs/workflow.md) owns approval and delivery. See [the repository map](../docs/workflow.md) for ownership.

The entries below preserve the order in which observations, inferences and later owner decisions were recorded. Earlier caption-only voice decisions were later extended to both slide copy and captions. Type sizes from the old frame remain provisional. Historical status statements refer to that round of review, not current readiness. Resolve the current stage from the story's workflow.json/review.md and [current status](../docs/workflow.md).

## Purpose
Records what the AI proposed and what the owner (Angger) changed before approving, so later agents can draft closer to his preferences. The current writing rules derived from this evidence live in [editorial-style.md](voice.md).

## How to use
- Read this before you draft copy for a new post.
- After every post, add a new dated entry: one table row per change, plus anything accepted unchanged that is worth noting.
- Label each preference as **observed** (he actually made the edit) or **inferred** (our generalisation). Note how many posts support it. Distinguish an explicit owner decision from a repeated observation; record confirmed changes in the authoritative guide rather than adding a competing rule here.

## Process notes (owner, 27 Oct 2026)

These notes describe that original review/testing session. Current production and maintenance follow the authoritative workflow/editor guides linked above; the temporary-workspace note is not a ban on maintained tests or approved story source in this repository.

- He reviews the design as an editable HTML file and edits the text directly. He does not write notes on it.
- While testing, don't save files to the repo. Keep work on the box (e.g. /workspace/tmp/).
- Export to Notion only after his adjustments and explicit approval. Notion delivery does not authorize publishing or scheduling on Instagram.

## Recorded observations and decisions (GPT-6.1 Terra, 27 Oct 2026)
1. **Emphasis (observed, explicitly requested):** detail copy needs "emphasized sentences". Bold the key phrase of a detail slide.
   - *Inferred:* usually one phrase per slide. On a benchmark slide with numbers, up to two (the gain and the cost).
   - *Inferred:* bold the takeaway (who gets it, how much better, what it's for), not model names or the whole sentence.
   - Example: "tersedia bagi seluruh pengguna **Plus, Pro, Enterprise, dan Edu** di ChatGPT Work dan Codex".
   - **Price slides also get one emphasized phrase** (owner-confirmed rule, 27 Oct 2026). Bold the comparison that carries the headline claim. Example: "harga input Terra baru **50% lebih rendah dan harga output sekitar 58% lebih rendah**".
2. **Terminology (owner-confirmed rule):** use the loanword "benchmark", not "tolok ukur". This applies to slide copy, the caption **and** alt text.
3. **Accepted as proposed (observed):**
   - Headline: "OpenAI luncurkan GPT-6.1 Terra dengan harga API lebih rendah".
   - The summary.
   - The four-model price comparison with GPT-5.6 Terra as a reference.
   - The caveat "berasal dari pengujian OpenAI dan belum diverifikasi secara independen".
   - Photos and credits ("FOTO: … / OPENAI", "ILUSTRASI AI: … / AKALMESIN").
   - In-depth depth with 4 details.
   - The scripted blue-ink treatment.
   - The caption, which was not part of the editor.
4. **Not acted on:** the "Sol." widow in the Main summary was approved as is. He doesn't seem to mind it, but we still shouldn't create widows.

5. **AI-illustration disclosure in the caption (owner-confirmed rule, 27 Oct 2026):** when any slide uses an AI illustration, add a disclosure to the caption's source/credit line as well as the on-slide credit. Current form (v5): a line after the footer, "Ilustrasi slide 5: AI / akalmesin." Repo basis: templates/editorial-copy.md asks the caption to "Include translation/illustration disclosure when applicable".
6. **Captions follow the owner's own brand guide, not the repo (owner rule, 27 Oct 2026).** For CAPTIONS, his brand guide (section 8, "Writing voice" and "Caption structure — standard 3-paragraph format") overrides the repo's brand/editorial-style.md and the AGENTS.md news voice. This replaces my earlier "working convention" note on 100–150 words, which is now an owner rule. His reason: "Tujuannya sederhana: di Instagram, pembaca hanya melihat 1–2 baris pertama caption sebelum tombol "more" (selengkapnya). Jika kalimat pertama langsung berisi nama resmi yang kaku, pembaca awam cenderung melewati unggahan tersebut karena terasa berat, padahal target pembaca akalmesin adalah orang yang penasaran dengan teknologi namun tidak selalu punya latar belakang spesialis."
   - **Exactly 3 paragraphs, roughly 100–150 words.** Count only the 3 paragraphs, not the footer or hashtags.
     - P1 is the hook plus "Apa yang baru". Open with a short observational hook or relatable analogy in plain words, not a sentence that leads with the official name. Then give the core news right away: what, when, who and the key numbers, attributed ("Menurut OpenAI").
     - P2 is "Kenapa penting & cara kerja", in plain language: what it is, prices and availability.
     - P3 is "Apa batasnya, implikasi & diskusi": the caveats, then **one** natural closing question.
   - **Footer:** `Sumber: [Institusi / Sumber Utama] / Foto: [Kredit Foto]`, then the AI-illustration disclosure if any slide uses one. Full source links stay in the package and the Notion body, not the caption.
   - **Hashtags: at most 5** (#akalmesin plus up to 4 specific ones). This follows the owner's own research: Instagram's official creator account announced a 5-hashtag limit per post in December 2025. **His guide's 8–10 rule is outdated.**
   - kamu/kita is allowed where it comes naturally; don't force it.
   - *Inference:* the hook must stay factual. Base it on something in the source (here, X1 "understands what's on screen, takes action across apps") so it doesn't overclaim.
   - *Historical inference, later withdrawn in Voice decision below:* slide copy (headline, summary, details) still follows the repo's neutral news voice. The owner only changed the caption rules.

### Caption: old (v4, repo news style) vs. new (v5, owner's guide)
**Old (v4):**
```
OpenAI meluncurkan GPT-6.1 Terra pada 26 Oktober 2026 waktu AS. Menurut OpenAI, model ini dirancang untuk penggunaan komputer, penalaran visual, dan penulisan yang lebih jelas, serta merupakan peningkatan signifikan dari GPT-5.6 Terra.

GPT-6.1 Terra tersedia bagi pengguna Plus, Pro, Enterprise, dan Edu di ChatGPT Work dan Codex, serta melalui API OpenAI. Harga API standarnya US$1 per 1 juta token input dan US$5 per 1 juta token output, separuh harga GPT-6.1 Sol. Dibandingkan GPT-5.6 Terra, harga input turun 50% dan harga output turun sekitar 58%.

Klaim peningkatan kinerja berasal dari benchmark yang dijalankan OpenAI sendiri. OpenAI tetap menyarankan GPT-6.1 Sol atau GPT-6 Astra untuk riset mendalam dan pemrograman kompleks.

Sumber: OpenAI (blog pengumuman, dokumentasi dan halaman harga API, system card addendum, unggahan @OpenAI di X). Grafik: OpenAI. Ilustrasi slide 5: AI / akalmesin.

#akalmesin #OpenAI #AI
```
**New (v5), 147 words in the 3 paragraphs:**
```
Bayangkan asisten AI yang bisa membaca isi layar dan menjalankan tugas di berbagai aplikasi, dengan ongkos lebih murah. Itulah yang dijanjikan GPT-6.1 Terra, model baru yang diluncurkan OpenAI pada 26 Oktober 2026 waktu AS. Menurut OpenAI, model ini lebih baik daripada GPT-5.6 Terra dalam penggunaan komputer, penalaran visual, dan penulisan.

Terra dirancang untuk menyeimbangkan biaya dan kemampuan. Harga API standarnya US$1 per 1 juta token input dan US$5 per 1 juta token output, separuh harga GPT-6.1 Sol. Dibandingkan GPT-5.6 Terra, harga input turun 50% dan output sekitar 58%. Model ini tersedia bagi pengguna Plus, Pro, Enterprise, dan Edu di ChatGPT Work dan Codex, serta lewat API.

Ada batasnya. Angka benchmark-nya berasal dari pengujian OpenAI sendiri dan belum diverifikasi secara independen. OpenAI pun tetap menyarankan GPT-6.1 Sol atau GPT-6 Astra untuk riset mendalam dan pemrograman kompleks. Menurutmu, mana yang lebih penting saat memilih model AI: harga atau kemampuan?

Sumber: OpenAI / Foto: OpenAI
Ilustrasi slide 5: AI / akalmesin

#akalmesin #OpenAI #GPT61 #ChatGPT #KecerdasanBuatan
```

## Differences between the owner's brand guide and the repo (found 27 Oct 2026)
Only the caption conflict (including hashtags) was resolved by the owner when this table was written. The "Repo" column describes the docs at that moment. Later the same day, the published Terra post confirmed the repo layout, the 4–6 / 6–9 word formula became a soft guideline, and the 86/37/20–21 px sizes stayed provisional.
| Area | Owner's guide | Repo |
|---|---|---|
| Caption length/shape | 3 paragraphs, ~100–150 words, fixed P1/P2/P3 roles | "complete short news report"; no length or shape rule (brand/editorial-style.md:11) — **resolved: guide wins for captions** |
| Opening hook | Observational hook/analogy wanted in the first line | Neutral news lead; no rhetorical teasers (brand-guide.md:17, editorial-style.md:9) — **resolved for captions** |
| Closing question | One natural question to invite comments | "Do not end with a mandatory question" (editorial-style.md:11) — **resolved for captions** |
| Voice | Knowledgeable friend; kamu/kita when natural; wit through analogy | Friend/wit direction "superseded for news copy"; avoid casual kamu/kita (AGENTS.md:17, brand-guide.md:17) — resolved for captions only, open for slides |
| Footer/hashtags | `Sumber: … / Foto: …`; guide says 8–10 hashtags | No footer format; source references in the caption; no hashtag rule — **resolved: Sumber/Foto footer, max 5 hashtags (owner's research overrides the guide's 8–10)** |
| Layout items | Article label, footer row with navigation arrow, photo window 1080×584 at y 648 | Article kicker and footer/arrow row superseded; photo runs to the bottom edge; 54 px text-to-photo gap — **later confirmed by the published Terra post; the guide's label, arrow, and 1080×584 window are not adopted** |
| Type sizes | Headline 86/100 px −4%, supporting 37 px, labels 20–21 px (24 Oct snapshot) | **Superseded 28 Oct:** the owner's measured sheets are the source of truth; see brand/tokens.json |
| Headline formula | ~4–6-word headline + 6–9-word supporting line, 2 lines each | **Later adopted as a soft guideline, not a hard cap** |

## Per-post log
| Post | Slide | Proposed | Adjusted | Inferred preference |
|---|---|---|---|---|
| 2026-10-27 GPT-6.1 Terra | 03 Ketersediaan | "…seluruh pengguna Plus, Pro, Enterprise, dan Edu di ChatGPT Work…" | "…seluruh pengguna **Plus, Pro, Enterprise, dan Edu** di…" | Bold the audience/availability takeaway |
| 2026-10-27 GPT-6.1 Terra | 04 Hasil uji | "Pada tolok ukur Agents' Last Exam" | "Pada benchmark Agents' Last Exam" | Loanword "benchmark" over "tolok ukur" |
| 2026-10-27 GPT-6.1 Terra | 04 Hasil uji | "…15 poin persentase di atas GPT-5.6 Terra dengan biaya sekitar sepertiganya…" | "**15 poin persentase di atas GPT-5.6 Terra** **dengan biaya sekitar sepertiganya**" | Bold the headline number and the cost advantage |
| 2026-10-27 GPT-6.1 Terra | 05 Keamanan | "…untuk riset mendalam dan pemrograman kompleks." | "…untuk **riset mendalam dan pemrograman kompleks**." | Bold the practical "use it for…" guidance |
| 2026-10-27 GPT-6.1 Terra | 01 Main, 02 Harga, caption | — | unchanged | Factual headline and full price comparison accepted |
| 2026-10-27 GPT-6.1 Terra | Caption | "Klaim peningkatan kinerja berasal dari tolok ukur…" | "…berasal dari benchmark…" | "benchmark" applies to the caption too |
| 2026-10-27 GPT-6.1 Terra | Caption | "…Grafik: OpenAI." | "…Grafik: OpenAI. Ilustrasi slide 5: AI / akalmesin." | Disclose AI illustrations in the caption |
| 2026-10-27 GPT-6.1 Terra | 02 Harga | no bold | "**50% lebih rendah dan harga output sekitar 58% lebih rendah**" | Price slides get one emphasized phrase |
| 2026-10-27 GPT-6.1 Terra | Alt text 04 | "Detail hasil tolok ukur internal OpenAI" | "Detail hasil benchmark internal OpenAI" | "benchmark" applies to alt text too |
| 2026-10-27 GPT-6.1 Terra | Caption (v5) | Repo news style: official-name-first lead, no question, long source line, 3 hashtags | Owner's guide: hook + 3 paragraphs (147 words), closing question, "Sumber: OpenAI / Foto: OpenAI", 5 hashtags | Owner's guide overrides the repo for captions; max 5 hashtags |

## Voice decision (27 Oktober 2026)
- **Owner decision:** the voice from his brand guide (sections 1, 8 and 10) now applies to **slide copy and captions**. In both, it overrides the repo's neutral news voice (AGENTS.md:17, brand/brand-guide.md:17, brand/editorial-style.md). The voice rules: clear, natural journalistic Indonesian, like a knowledgeable friend or accessible editor; kamu/kita only where natural; explain terms briefly; an occasional relatable observation; Main headline about 4–6 words plus a 6–9-word supporting line. The previous inference that "slide copy still follows the repo's neutral voice" is withdrawn.
- *Inference from his research:* explain what an API is, separate API pricing from a consumer subscription, say who benefits from a lower price, and keep the benchmark limitation prominent.
- **Later the same day:** the published Terra post confirmed the repo layout. The 4–6 / 6–9 word line is a soft guideline. Type sizes stay provisional. This paragraph is the note as it was written before that confirmation.
- **Status at the time of this entry:** the v6 slide-copy proposal (`final/copy-A-v6-proposal.md` in the original review workspace) was awaiting owner review; Notion, HTML and PNGs had not been updated. See the later rounds below. This is not the current story status.

## Round v6: slide copy in the owner's voice (27 Oktober 2026)
Owner approved his edited HTML ("Use this version"). What I proposed in copy-A-v6-proposal.md compared with what he did:
| Slide | Proposed (v6) | Owner's final | Inferred preference |
|---|---|---|---|
| 01 headline | "OpenAI rilis GPT-6.1 Terra yang lebih hemat" (+ Alt A/B) | Kept the original "OpenAI luncurkan GPT-6.1 Terra dengan harga API lebih rendah" | *Inference:* he prefers a factual headline that names the development over a shorter hook line |
| 01 summary | "Menurut OpenAI, lebih cakap dan separuh harga GPT-6.1 Sol" | "Diklaim melampaui GPT-5.6 Terra untuk urusan kendali komputer, pengolahan visual, dan penulisan—dengan tarif separuh dari model Sol." | *Inference:* keep the concrete list of what improved; use everyday wording ("urusan kendali komputer", "pengolahan visual", "tarif"); "Diklaim" as a lighter attribution than "Menurut OpenAI"; em dash allowed; short reference "model Sol" acceptable after the full name has appeared |
| 02–05 details | Rewrites with term glosses (API, token, benchmark), "kamu", and a "Terra bukan untuk semua pekerjaan" opener | Kept the previous detail text (no glosses, no "kamu") | *Inference:* detail slides stay plain and factual; voice changes are mostly wanted on the Main summary and the caption. Confirm before generalizing |
| 02 bold | Keep one bold phrase | No bold in his file | Unclear: may come from editing an older copy. Asked |
| 04 alt text | "benchmark" | "tolok ukur" | Unclear: may come from editing an older copy. The "benchmark" rule stands until he says otherwise. Asked |

### v6 follow-up (27 Oktober 2026)
- The owner said he "probably uploaded the wrong file". He **intended** the earlier fixes, so the price-slide bold and "benchmark" in alt text were restored. Both rules stand.
- "Diklaim" was accepted as the Main attribution ("yah that's okay for now"). *Inference:* he tolerates the lighter passive attribution on the Main slide when the caption names OpenAI. "for now" suggests he may revisit it.
- Process lesson (*inference*): when his edited file undoes earlier agreed fixes, ask before treating it as intentional.

## Kimi K3.1 Pro (2026-10-28-kimi-k3-1-pro), 28 Oktober 2026

Two layers: (1) the owner rewrote the AI copy draft before design, saying "I think your copy is too kaku and unnatural" (t42u); (2) he then edited the review HTML (text-review-edits packet, schema 2, review revision `9aea1224…`, imported with `npm run edits:import`). Neither layer is a final approval. "Posts" = number of posts supporting the preference (Terra counted where it applies).

### Layer 1: AI draft vs. owner's rewrite (t42u)
| Slide | Proposed (AI draft) | Adjusted (owner) | Preference | Label | Posts |
|---|---|---|---|---|---|
| Overall | Compact, neutral wording | "too kaku and unnatural"; fuller conversational sentences | Copy must read natural and relaxed, not stiff | **owner-stated** (his words) | 1 |
| 01 headline | "Kimi K3.1 Pro kejar model AI tertutup" | "Moonshot AI rilis Kimi K3.1! Pro diklaim mengalahkan GPT-6 Astra." | Name the company and the release plainly; "rilis" + exclamation allowed | observed | 1 (Terra: factual headline naming the development) |
| 01 summary | "Bobot modelnya dijanjikan terbuka paling lambat 4 November." | "Modelnya akan dirilis secara terbuka (open-weights) paling lambat 4 November." | Plain verb ("dirilis") + English term in brackets | observed | 1 |
| 02 | "Menurut Moonshot, … mencetak … di atas … hanya 0,7 poin di bawah" | "Moonshot mengklaim … meraih skor … mengungguli … hanya terpaut 0,7 poin dari" | "mengklaim" attribution; lively verbs; em dash joins clauses | observed | 1 |
| 03 | "Dari teks…", "perangkat CAD", "situs interaktif", "sudah tersedia" | "Cukup bermodalkan teks…", "software CAD", "website interaktif", "sudah bisa dicoba" | Prefer everyday English loanwords (software, website) over formal Indonesian equivalents; reader-oriented phrasing ("bisa dicoba") | observed | 1 |
| 04 | "tingkat klaim keliru turun" | "tingkat halusinasi (klaim keliru) berhasil ditekan" | Use the common term with a short gloss in brackets | observed | 1 |
| 05 | "Bobot lengkapnya dijanjikan rilis…; per 26 Oktober belum muncul" | "…dijanjikan rilis publik…, meski pantauan per 26 Oktober menunjukkan file-nya belum tersedia" | Keeps the hedge, in plain connected words ("meski") instead of a semicolon | observed | 1 |
| Caption | 149 words; "jendela konteks", "Selain menulis kode", "lebih cepat" | ~187 words; "context window", "Tak hanya jago coding", "lebih ngebut", "Model raksasa" | Casual register (jago, ngebut); keep English tech terms; he accepted a caption above 150 words | observed; length tolerance *inferred* | 1 |
| Caveats | Vendor-claim and unreleased-weights hedges | All kept, reworded | Hedges stay, in plain words | observed | 2 (Terra caveat kept) |

### Layer 2: owner's HTML edits (packet saved 28 Oct 2026 11:12 WIB)
| Slide/field | Before (approved copy) | After (owner HTML edit) | Preference | Label |
|---|---|---|---|---|
| 01 headline | "Moonshot AI rilis / Kimi K3.1!" | "Moonshot AI rilis / Kimi K3.1 Pro!" | Full product name in the headline (resolves the "K3.1! Pro" split I asked about) | observed |
| 01 summary | "Pro diklaim mengalahkan GPT-6 Astra. Modelnya akan dirilis…" | "Modelnya akan dirilis secara terbuka (open-weights) paling lambat 4 November." | Main carries one point; competitor claim left to slide 2 | observed; reason *inferred* |
| 02 | "Lembaga independen Artificial Analysis juga…" | "Artificial Analysis juga…" | Shorter attribution | observed |
| 04 | "tolok ukur" (already changed by agent) | "benchmark" | Confirms the existing "benchmark" rule | **owner-confirmed rule** (27 Oct), re-observed |
| 05 | "Bobot model penuhnya" | "Bobot model (weight) penuhnya" | Gloss Indonesian term with the English one | observed |
| Caption p1 | "Model AI terbuka yang bisa diunduh bebas…"; "Model raksasa berkapasitas 3 triliun parameter" | "Open weight Model AI yang bisa diunduh bebas…"; "Model dengan 3 triliun parameter" | Use the English term "open weight"; drop the hype adjective "raksasa" | observed |
| Caption p3 | "meski lembaga independen Artificial Analysis…"; "baru akan dibuka" | "meski Artificial Analysis…"; "baru akan dirilis" | Shorter attribution; "dirilis" over "dibuka" | observed |
| Credits, hashtags, footer | — | unchanged | accepted as built | observed |

Open points reported to the owner (not changed): caption ~185 words vs 100–150; "Open weight Model AI" capitalization; "independen" qualifier removed from both places; Main summary states the open release as fact ("akan dirilis") while slide 5 says "dijanjikan"; slide 1 alt text still mentions the GPT-6 Astra claim.

## Owner decision: caption length (28 Oktober 2026, t49u ~13:56 WIB)

Owner: "Not necessary for now, 100-160 is not including the hashtag and the Source. So it just pure the copy text". The caption guide is now **100–160 words**, counting only the 3 body paragraphs (no hashtags, `Sumber/Foto` footer or `Ilustrasi` lines), and it is a warning, not a hard gate. This supersedes the 100–150 figure in the entries above, which are kept as history. Kimi caption under the new rule: 185 words (still a warning). Status: **owner rule**.
