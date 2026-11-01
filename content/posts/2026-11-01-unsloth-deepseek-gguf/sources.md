# Sources — Unsloth rilis kuantisasi DeepSeek-V4.1-Flash untuk lokal (retrieved 2026-11-01 ~19:40 WIB)

Primary: Unsloth docs, "DeepSeek-V4.1-Flash: Run Locally Guide", Dynamic V3.1 Update dated 30 Oct 2026, https://unsloth.ai/docs/models/deepseek-v4.1-flash (UD). Hugging Face model card discussion announcing Dynamic V3.1 GGUFs, https://huggingface.co/unsloth/DeepSeek-V4.1-Flash-1017-GGUF (HF). Secondary write-up: AI Primer, https://www.ai-primer.com/engineer/stories/unsloth-deepseek-quants (AP).

Story pointer: owner's Grok/X Explore summary screenshot ("Unsloth Releases Top-Ranked AI Coding Model Quants"). That blurb also mashed in OpenCode + Claude subscription CLI news; **not** part of this post — separate story, not verified here. Grok's "93% cache hits" line is not in Unsloth's V3.1 write-up; omitted.

All benchmark numbers below are **Unsloth's own measurements** of their quants vs GSQ-RCO; not independent third-party replication.

| Claim (copy)                                                                                                                         | Status                                                    | Source |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------ |
| Dynamic V3.1 (preview) GGUFs for DeepSeek-V4.1-Flash-1017 released / documented 30 Oct 2026                                          | Verified (Unsloth)                                        | UD; HF |
| Model framed as strong open model for coding/agentic tasks; 1M context; 552B backbone + 196B Engram                                  | **Claim** (Unsloth / DeepSeek product framing)            | UD     |
| UD-Q2_K_XL (334.8 GB): AIME25 97.50; GPQA-D 89.58; LCB v6 84.76; avg of 6 = 87.49 (near Q8 reference 87.68)                           | **Claim** (Unsloth table)                                 | UD     |
| UD-IQ1_S (233 GB): AIME25 92.92; needs ~128–145 GB RAM/VRAM with Engram on SSD                                                       | **Claim** (Unsloth table + hardware guide)                | UD; AP |
| Engram n-gram tables (~110.6–202.8 GB) can stay on SSD via mmap                                                                      | Verified as Unsloth's stated mechanism                    | UD     |
| Unsloth could not reproduce ISTA GSQ-RCO's claimed 100% AIME25 on all quants; their re-runs show degradation                         | **Claim** (Unsloth methodology critique); dispute noted   | UD; AP |
| Lower-bit quants tend to reason longer / hit token caps more often                                                                   | **Claim** (Unsloth truncation study)                      | UD     |
| Available on Hugging Face as unsloth/DeepSeek-V4.1-Flash-1017-GGUF                                                                   | Verified                                                  | HF; UD |
| Not used: OpenCode Claude CLI subscription support from the Grok mashup                                                              | Out of scope                                              | —      |
