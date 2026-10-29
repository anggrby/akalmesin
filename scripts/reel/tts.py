# python3 scripts/reel/tts.py <reel.json> <outdir>  -> per-beat mp3 + word timings (edge-tts WordBoundary)
import asyncio, json, sys, os
import edge_tts
async def main(spec, out):
    r = json.load(open(spec)); v = r['voice']; os.makedirs(out, exist_ok=True); res = {}
    for b in r['beats']:
        c = edge_tts.Communicate(b['narration'], v['voice'], rate=v.get('rate', '+0%'), boundary='WordBoundary')
        words = []
        with open(f"{out}/{b['id']}.mp3", 'wb') as f:
            async for ch in c.stream():
                if ch['type'] == 'audio': f.write(ch['data'])
                elif ch['type'] == 'WordBoundary':
                    words.append({'t': ch['offset'] / 1e7, 'd': ch['duration'] / 1e7, 'w': ch['text']})
        res[b['id']] = words
    json.dump(res, open(f"{out}/words.json", 'w'), ensure_ascii=False, indent=1)
asyncio.run(main(sys.argv[1], sys.argv[2]))
