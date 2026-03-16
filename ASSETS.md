# How to Get Real Tetris Friends Assets

This game works out of the box with synthesized sounds. If you want the **actual Tetris Friends sounds**, here's exactly where to find them.

---

## Option 1 — The Sounds Resource (Easiest)

The original TF sounds have been archived at **The Sounds Resource**, a preservation site for video game audio.

### Steps:
1. Go to: https://www.sounds-resource.com/browser_games/tetrisfriends/
2. You'll see two sound packs:
   - **"Interface"** — UI clicks, button sounds, lobby sounds
   - **"Default Dan"** — In-game sound effects (THIS is the one you want)
3. Click **"Default Dan"**, then click **"Extract and View Contents"**
4. Download the `.zip` file
5. Inside you'll find `.wav` files — these are the raw game SFX

### Rename the files to match what the game expects:

| Original TF filename (approx) | Rename to |
|---|---|
| `move.wav` or `piece_move.wav` | `move.wav` |
| `rotate.wav` or `piece_rotate.wav` | `rotate.wav` |
| `hard_drop.wav` or `drop.wav` | `drop.wav` |
| `piece_lock.wav` or `lock.wav` | `lock.wav` |
| `line_clear_1.wav` or `single.wav` | `clear1.wav` |
| `line_clear_2.wav` or `double.wav` | `clear2.wav` |
| `line_clear_3.wav` or `triple.wav` | `clear3.wav` |
| `tetris.wav` or `line_clear_4.wav` | `clear4.wav` |
| `hold.wav` | `hold.wav` |
| `garbage.wav` or `attack.wav` | `garbage.wav` |
| `level_up.wav` | `levelup.wav` |
| `death.wav` or `game_over.wav` | `dead.wav` |
| `win.wav` or `victory.wav` | `win.wav` |
| `combo.wav` | `combo.wav` |

6. Place all renamed files into: `public/sounds/`
7. Restart the server — the game auto-detects and loads them

---

## Option 2 — Wayback Machine (Direct from tetrisfriends.com)

The Wayback Machine has captures of tetrisfriends.com from before it shut down.

### Steps:
1. Go to: https://web.archive.org/web/20190601000000*/tetrisfriends.com
2. Pick a snapshot from **2018 or early 2019** (before shutdown)
3. Navigate into the game files. The SWF games loaded assets from paths like:
   ```
   https://web.archive.org/web/20190101/https://tetrisfriends.com/games/Arena/
   https://web.archive.org/web/20190101/https://tetrisfriends.com/assets/sounds/
   ```
4. Use your browser **DevTools → Network tab** while the archived page loads
5. Filter by `.mp3`, `.ogg`, or `.wav` — you'll see the sound files loading
6. Right-click → "Save as" on each one

### Direct Wayback URLs to try:
```
https://web.archive.org/web/2019/https://tetrisfriends.com/games/Arena/sounds/
https://web.archive.org/web/2018/https://tetrisfriends.com/assets/sounds/
https://web.archive.org/web/2019/https://tetrisfriends.com/data/sounds/
```

> **Tip:** If a snapshot 404s, change the year or try `20181001`, `20190301`, etc.
> The Wayback Machine URL format is: `https://web.archive.org/web/YYYYMMDD000000/https://tetrisfriends.com/...`

---

## Option 3 — notrisfoes.com (Live clone)

Since notrisfoes.com is a running recreation:
1. Open **https://notrisfoes.com/games/live** (Arena)
2. Open **DevTools → Network tab**, filter by media/audio
3. Play the game and watch which sound files load
4. The files will be from a path like `/data6_0_2_50/sounds/...`
5. Right-click the request → "Open in new tab" → Save

---

## Music (Background tracks)

The Sounds Resource **does not** host music (their policy). For the TF background music ("Default Dan" and others):
- Search YouTube for "Tetris Friends Default Dan" — many uploads exist
- Use `yt-dlp` (free tool) to download as MP3
- Drop into `public/sounds/music.mp3` — then message me and I'll wire it into the game

---

## Drop-in folder structure
```
tetris-arena/
  public/
    sounds/
      move.wav       ← or .mp3 or .ogg — all formats supported
      rotate.wav
      drop.wav
      lock.wav
      clear1.wav
      clear2.wav
      clear3.wav
      clear4.wav
      hold.wav
      garbage.wav
      levelup.wav
      dead.wav
      win.wav
      combo.wav
```

The server will serve them automatically. No code changes needed.
