'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIGS = {
    easy:   { rows: 9,  cols: 9,  mines: 10  },
    medium: { rows: 16, cols: 16, mines: 40  },
    hard:   { rows: 16, cols: 30, mines: 99  },
    hell:   { rows: 16, cols: 30, mines: 250 },
};

// ── State ─────────────────────────────────────────────────────────────────────
let G = {
    diff:       'hard',
    rows:       0,
    cols:       0,
    totalMines: 0,
    board:      [],   // 2-D: 0–8 = number, -1 = mine
    revealed:   [],   // 2-D: boolean
    flagged:    [],   // 2-D: boolean
    question:   [],   // 2-D: boolean
    gameOver:   false,
    won:        false,
    started:    false,
    flagCount:  0,
    seconds:    0,
    timerId:    null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $board      = document.getElementById('board');
const $minesLeft  = document.getElementById('mines-left');
const $timer      = document.getElementById('timer');
const $newGame    = document.getElementById('new-game');
const $hellWarn   = document.getElementById('hell-warning');
const $winModal   = document.getElementById('win-modal');
const $loseModal  = document.getElementById('lose-modal');
const $winTime    = document.getElementById('win-time-label');
const $nameInput  = document.getElementById('name-input');
const $saveBtn    = document.getElementById('save-btn');
const $winnerDisp = document.getElementById('winner-display');
const $nameSection= document.getElementById('name-section');
const $winAgain   = document.getElementById('win-again-btn');
const $retryBtn   = document.getElementById('retry-btn');
const $canvas     = document.getElementById('fireworks');
const ctx         = $canvas.getContext('2d');

// ── Helpers ───────────────────────────────────────────────────────────────────
function make2D(r, c, v) {
    return Array.from({ length: r }, () => Array(c).fill(v));
}

function pad(n) {
    n = Math.max(-99, Math.min(999, n));
    return n < 0
        ? '-' + String(-n).padStart(2, '0')
        : String(n).padStart(3, '0');
}

function fmtTime(s) {
    return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function eachNeighbor(r, c, fn) {
    for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < G.rows && nc >= 0 && nc < G.cols) fn(nr, nc);
        }
}

// ── New game ──────────────────────────────────────────────────────────────────
function newGame() {
    const cfg = CONFIGS[G.diff];
    G.rows       = cfg.rows;
    G.cols       = cfg.cols;
    G.totalMines = cfg.mines;
    G.board    = make2D(G.rows, G.cols, 0);
    G.revealed = make2D(G.rows, G.cols, false);
    G.flagged  = make2D(G.rows, G.cols, false);
    G.question = make2D(G.rows, G.cols, false);
    G.gameOver = false;
    G.won      = false;
    G.started  = false;
    G.flagCount= 0;
    G.seconds  = 0;

    clearInterval(G.timerId);
    G.timerId = null;

    $minesLeft.textContent = pad(G.totalMines);
    $timer.textContent     = '000';

    $winModal.classList.add('hidden');
    $loseModal.classList.add('hidden');
    $nameInput.value = '';
    $nameSection.classList.remove('hidden');
    $winnerDisp.classList.add('hidden');

    stopFireworks();
    buildBoard();
}

// ── Board DOM ─────────────────────────────────────────────────────────────────
function buildBoard() {
    $board.style.gridTemplateColumns = `repeat(${G.cols}, var(--cs))`;
    $board.innerHTML = '';
    for (let r = 0; r < G.rows; r++)
        for (let c = 0; c < G.cols; c++) {
            const el = document.createElement('div');
            el.className = 'cell';
            el.dataset.r = r;
            el.dataset.c = c;
            $board.appendChild(el);
        }
}

function cellEl(r, c) {
    return $board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
}

function refreshCell(r, c) {
    const el = cellEl(r, c);
    if (!el) return;

    el.className  = 'cell';
    el.textContent= '';
    el.style.fontSize = '';

    if (G.flagged[r][c])  { el.classList.add('flagged');  return; }
    if (G.question[r][c]) { el.classList.add('question'); return; }
    if (!G.revealed[r][c]) return;

    el.classList.add('revealed');
    const v = G.board[r][c];
    if (v === -1) {
        el.textContent    = '💣';
        el.style.fontSize = '14px';
    } else if (v > 0) {
        el.textContent = v;
        el.classList.add('n' + v);
    }
}

// ── Mine placement (first-click safe) ────────────────────────────────────────
function placeMines(safeR, safeC) {
    const { rows, cols, totalMines } = G;
    const pool = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (Math.abs(r - safeR) > 1 || Math.abs(c - safeC) > 1)
                pool.push(r * cols + c);

    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const count = Math.min(totalMines, pool.length);
    for (let k = 0; k < count; k++) {
        const r = (pool[k] / cols) | 0;
        const c = pool[k] % cols;
        G.board[r][c] = -1;
    }

    // Calculate hint numbers
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (G.board[r][c] === -1) continue;
            let n = 0;
            eachNeighbor(r, c, (nr, nc) => { if (G.board[nr][nc] === -1) n++; });
            G.board[r][c] = n;
        }
}

// ── Reveal (iterative BFS) ────────────────────────────────────────────────────
function reveal(startR, startC) {
    if (G.gameOver) return;
    if (G.revealed[startR][startC] || G.flagged[startR][startC]) return;

    const visited = new Set();
    const queue   = [[startR, startC]];
    visited.add(startR * G.cols + startC);

    while (queue.length) {
        const [r, c] = queue.pop();
        if (G.revealed[r][c] || G.flagged[r][c]) continue;

        G.revealed[r][c] = true;
        refreshCell(r, c);

        if (G.board[r][c] === -1) {
            triggerGameOver(r, c);
            return;
        }

        if (G.board[r][c] === 0) {
            eachNeighbor(r, c, (nr, nc) => {
                const k = nr * G.cols + nc;
                if (!visited.has(k) && !G.revealed[nr][nc] && !G.flagged[nr][nc]) {
                    visited.add(k);
                    queue.push([nr, nc]);
                }
            });
        }
    }
}

// ── Game over ─────────────────────────────────────────────────────────────────
function triggerGameOver(hitR, hitC) {
    G.gameOver = true;
    clearInterval(G.timerId);

    for (let r = 0; r < G.rows; r++)
        for (let c = 0; c < G.cols; c++) {
            if (G.board[r][c] === -1 && !G.flagged[r][c]) {
                G.revealed[r][c] = true;
                refreshCell(r, c);
                const el = cellEl(r, c);
                if (el) el.classList.add(r === hitR && c === hitC ? 'mine-exploded' : 'mine-shown');
            } else if (G.flagged[r][c] && G.board[r][c] !== -1) {
                const el = cellEl(r, c);
                if (el) el.className = 'cell bad-flag revealed';
            }
        }

    setTimeout(() => $loseModal.classList.remove('hidden'), 650);
}

// ── Win check ─────────────────────────────────────────────────────────────────
function checkWin() {
    if (G.gameOver) return;
    for (let r = 0; r < G.rows; r++)
        for (let c = 0; c < G.cols; c++)
            if (!G.revealed[r][c] && G.board[r][c] !== -1) return;

    G.won      = true;
    G.gameOver = true;
    clearInterval(G.timerId);

    // Auto-flag remaining mines
    for (let r = 0; r < G.rows; r++)
        for (let c = 0; c < G.cols; c++)
            if (G.board[r][c] === -1 && !G.flagged[r][c]) {
                G.flagged[r][c] = true;
                refreshCell(r, c);
            }

    $minesLeft.textContent = '000';
    $winTime.textContent   = 'YOUR TIME: ' + fmtTime(G.seconds);
    $winModal.classList.remove('hidden');
    startFireworks();
    setTimeout(() => $nameInput.focus(), 80);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
    G.timerId = setInterval(() => {
        if (G.seconds < 999) G.seconds++;
        $timer.textContent = pad(G.seconds);
    }, 1000);
}

// ── Event: board ──────────────────────────────────────────────────────────────
$board.addEventListener('click', e => {
    const el = e.target.closest('.cell');
    if (!el || G.gameOver) return;
    const r = +el.dataset.r, c = +el.dataset.c;
    if (G.revealed[r][c] || G.flagged[r][c]) return;

    // Clicking a question mark clears it
    if (G.question[r][c]) {
        G.question[r][c] = false;
        refreshCell(r, c);
        return;
    }

    if (!G.started) {
        G.started = true;
        placeMines(r, c);
        startTimer();
    }

    reveal(r, c);
    checkWin();
});

$board.addEventListener('contextmenu', e => {
    e.preventDefault();
    const el = e.target.closest('.cell');
    if (!el || G.gameOver || G.revealed[+el.dataset.r][+el.dataset.c]) return;
    const r = +el.dataset.r, c = +el.dataset.c;

    if (!G.flagged[r][c] && !G.question[r][c]) {
        G.flagged[r][c] = true;
        G.flagCount++;
    } else if (G.flagged[r][c]) {
        G.flagged[r][c]  = false;
        G.question[r][c] = true;
        G.flagCount--;
    } else {
        G.question[r][c] = false;
    }

    $minesLeft.textContent = pad(G.totalMines - G.flagCount);
    refreshCell(r, c);
});

// Double-click chord reveal
$board.addEventListener('dblclick', e => {
    const el = e.target.closest('.cell');
    if (!el || G.gameOver) return;
    const r = +el.dataset.r, c = +el.dataset.c;
    if (!G.revealed[r][c] || G.board[r][c] <= 0) return;

    let flags = 0;
    eachNeighbor(r, c, (nr, nc) => { if (G.flagged[nr][nc]) flags++; });
    if (flags !== G.board[r][c]) return;

    eachNeighbor(r, c, (nr, nc) => {
        if (!G.gameOver && !G.revealed[nr][nc] && !G.flagged[nr][nc])
            reveal(nr, nc);
    });
    if (!G.gameOver) checkWin();
});

// ── Event: controls ───────────────────────────────────────────────────────────
$newGame.addEventListener('click', newGame);

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        G.diff = btn.dataset.diff;
        $hellWarn.classList.toggle('hidden', G.diff !== 'hell');
        syncLbTab(G.diff);
        renderLeaderboard(G.diff);
        newGame();
    });
});

document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderLeaderboard(tab.dataset.diff);
    });
});

$saveBtn.addEventListener('click', () => {
    const raw  = $nameInput.value.trim().toUpperCase() || 'ANONYMOUS';
    const name = raw.slice(0, 20);
    saveScore(G.diff, name, G.seconds);
    syncLbTab(G.diff);
    renderLeaderboard(G.diff);

    $nameSection.classList.add('hidden');
    $winnerDisp.textContent = '🏆 ' + name + ' 🏆';
    $winnerDisp.classList.remove('hidden');
});

$winAgain.addEventListener('click', () => {
    $winModal.classList.add('hidden');
    stopFireworks();
    newGame();
});

$retryBtn.addEventListener('click', () => {
    $loseModal.classList.add('hidden');
    newGame();
});

// Close modals on backdrop click
[$winModal, $loseModal].forEach(modal => {
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.add('hidden');
    });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
function getScores(diff) {
    try { return JSON.parse(localStorage.getItem('kurtana_' + diff) || '[]'); }
    catch { return []; }
}

function saveScore(diff, name, seconds) {
    const scores = getScores(diff);
    scores.push({ name, seconds, date: new Date().toLocaleDateString() });
    scores.sort((a, b) => a.seconds - b.seconds);
    scores.splice(10);
    localStorage.setItem('kurtana_' + diff, JSON.stringify(scores));
}

function renderLeaderboard(diff) {
    const scores = getScores(diff);
    const list   = document.getElementById('lb-list');

    if (!scores.length) {
        list.innerHTML = '<li class="lb-empty">NO RECORDS YET</li>';
        return;
    }

    const medals    = ['🥇', '🥈', '🥉'];
    const rankClass = ['gold', 'silver', 'bronze'];

    list.innerHTML = scores.map((s, i) => {
        const rank = i < 3 ? medals[i] : '#' + (i + 1);
        const cls  = i < 3 ? rankClass[i] : '';
        return `<li>
            <span class="lb-rank ${cls}">${rank}</span>
            <span class="lb-name">${s.name}</span>
            <span class="lb-time">${fmtTime(s.seconds)}</span>
            <span class="lb-date">${s.date}</span>
        </li>`;
    }).join('');
}

function syncLbTab(diff) {
    document.querySelectorAll('.lb-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.diff === diff);
    });
}

// ── Fireworks ─────────────────────────────────────────────────────────────────
let fwParticles = [];
let fwAnimId    = null;
let fwLaunchId  = null;

const FW_COLORS = ['#aa60ff','#d4a0ff','#ffd700','#ff5599','#00ddff','#66ff88','#ffaa33','#ff80cc'];

function startFireworks() {
    $canvas.width  = window.innerWidth;
    $canvas.height = window.innerHeight;
    $canvas.style.display = 'block';
    fwParticles = [];

    function launch() {
        const x     = $canvas.width  * (0.1 + Math.random() * 0.8);
        const y     = $canvas.height * (0.08 + Math.random() * 0.55);
        const color = FW_COLORS[(Math.random() * FW_COLORS.length) | 0];
        const count = 55 + ((Math.random() * 35) | 0);

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
            const speed = 1.5 + Math.random() * 4.5;
            fwParticles.push({
                x, y,
                vx:    Math.cos(angle) * speed,
                vy:    Math.sin(angle) * speed,
                life:  1,
                decay: 0.011 + Math.random() * 0.017,
                color,
                r:     1.4 + Math.random() * 2.2,
            });
        }
    }

    launch();
    fwLaunchId = setInterval(launch, 480);

    function animate() {
        ctx.fillStyle = 'rgba(4, 4, 7, 0.17)';
        ctx.fillRect(0, 0, $canvas.width, $canvas.height);

        fwParticles = fwParticles.filter(p => p.life > 0.02);

        for (const p of fwParticles) {
            p.vx  *= 0.98;
            p.vy   = p.vy * 0.98 + 0.055;
            p.x   += p.vx;
            p.y   += p.vy;
            p.life -= p.decay;

            ctx.globalAlpha = p.life * p.life;
            ctx.shadowBlur  = 9;
            ctx.shadowColor = p.color;
            ctx.fillStyle   = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
        fwAnimId = requestAnimationFrame(animate);
    }

    animate();
}

function stopFireworks() {
    cancelAnimationFrame(fwAnimId);
    clearInterval(fwLaunchId);
    fwAnimId   = null;
    fwLaunchId = null;
    fwParticles = [];
    ctx.clearRect(0, 0, $canvas.width, $canvas.height);
    $canvas.style.display = 'none';
}

window.addEventListener('resize', () => {
    if ($canvas.style.display !== 'none') {
        $canvas.width  = window.innerWidth;
        $canvas.height = window.innerHeight;
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
newGame();
renderLeaderboard(G.diff);
