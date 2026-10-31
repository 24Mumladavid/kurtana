# 💣 Kurtana — Minesweeper

A stylish Minesweeper game with a dark purple/black neon theme, leaderboard, and fireworks on victory.

## Features

- **4 difficulty modes** — Easy · Medium · Expert · 👿 Hell (2% win rate, 250 mines)
- **Dark purple neon theme** — CRT scanlines, glow effects, animated title
- **Leaderboard** — top 10 times per difficulty stored in localStorage
- **Victory screen** — fireworks + golden trophy + player name
- **First-click safe** — the first cell you click is always mine-free
- **Right-click cycling** — flag 🚩 → question ❓ → clear
- **Double-click chord** — reveal all neighbours when flag count matches

## How to play

| Action | Control |
|---|---|
| Reveal cell | Left click |
| Flag / question / clear | Right click |
| Chord reveal | Double-click a numbered cell |
| New game | Click **⚡ NEW** or switch difficulty |

## Run locally

Just open `index.html` in any modern browser — no build step needed.

## Deploy to GitHub Pages

```bash
git remote add origin https://github.com/<your-username>/kurtana.git
git push -u origin main
```

Then enable **Settings → Pages → Deploy from branch → main**.
