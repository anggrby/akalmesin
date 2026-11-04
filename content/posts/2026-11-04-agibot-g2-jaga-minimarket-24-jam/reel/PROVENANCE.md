# Reel provenance — Enam robot AgiBot jaga minimarket 24 jam (retrieved 2026-11-04 WIB)

Media: AgiBot's own livestream replay on its official X account (https://x.com/AGIBOTofficial/status/2117086439569867218, broadcast 2 Nov 2026). No licence granted. Used by **owner decision t89u/t107u/t115u** (company/owner media credited "Dok. <company>"), credited on screen "Video: Dok. AgiBot" under every clip, with the known risk: AgiBot, X or Instagram may ask for a takedown, or the account may receive a copyright strike.

- Download: yt-dlp `--download-sections` of the replay (960×540 HLS), 20 s windows at about 600 s, 5000 s and 9000 s into the broadcast. The full replay was not downloaded.
- Edit: each clip is cropped to the camera picture only (ffmpeg crop=744:428:28:80), removing the livestream frame overlay (title banner, clock, logo, side art), trimmed to 8 s, audio dropped, re-encoded H.264. No colour change (mediaFilter none, no blue ink). The low source resolution (960×540) is a known weakness.
- Carousel stills in assets/originals are single frames (3 s into each clip) from the same cropped clips; they get the blue ink on the carousel.
- Music: tech-upbeat (High Technologic Beat Explosion, Loyalty Freak Music, CC0 1.0; see scripts/reel/music/PROVENANCE.md). No voice; cards narrate.

| Key       | File                                 | SHA-256                                                          | Source window (s into broadcast) |
| --------- | ------------------------------------ | ---------------------------------------------------------------- | -------------------------------- |
| overview  | reel/media/agibot-store-overview.mp4 | 6a73dbd888f66a9fe0234b7e45ef092204b9dd8d235bc3db3f261a5d5dbd5cfc | 5000.5–5008.5                    |
| shelves   | reel/media/agibot-shelves.mp4        | 94823f21bcf33d02c381b14ce6dbe1b7666caa6774e191f2e8f6b06bf3dad9a0 | 600.5–608.5                      |
| customers | reel/media/agibot-customers.mp4      | ff6d8f2677629c1e7919a6617d321573a4ef8bb21e0564ef0013c26895eeb727 | 9000–9008                        |
| aisle     | reel/media/agibot-customers-2.mp4    | ce1b7e95d54de44d3cbcfc16ea258ec18f1f3ee3d210c6030949d43b9b8474a2 | 9010–9018                        |

Carousel stills (frame grabs, assets/originals):

- x-2117086439-store-overview.jpg sha256 6e9a9c725aa398924a0821d1e73690c5674e5f16116c64d363f3c00ee6824dd7 (Main)
- x-2117086439-shelves.jpg sha256 e14dd06f5caf30bf10436bba40209a41ba5e073692680c4df2d53e149c94597f (02)
- x-2117086439-customers.jpg sha256 eb2cb37eb022ea0e9f23a2754b78d2fcb9545eadcaa3c5948313e56405c0f5fd (03)
- x-2117086439-customers-2.jpg sha256 c64d518906e7f16691ac66abdda047074c07c24c19a83810481922b99c125b0a (04)

Raw section downloads (not committed, deleted from /tmp after the build): seg-600.mp4 sha256 45f530fcf379cb4d04efebced867c7ce6e6e69ef27971ae871c8c569a94918f4; seg-5000.mp4 sha256 636af3e20a1aa38acda900a72686557afe067c7cfce8295575cbdbac04786660; seg-9000.mp4 sha256 b7fa1118a274a35f4d7f4b6e53f9260756568466f47385cbb47f1036b99df93f.
