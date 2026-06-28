const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "0.0.0.0";
const SERVER_VERSION = 12;
const PUBLIC_DIR = path.join(__dirname, "public");
const ZEBRA_DIR = "/Users/katiemirne/Downloads/zebra";
const ZEBRA_PRACTICE = path.join(ZEBRA_DIR, "practice");
const ZEBRA_BOOK = path.join(ZEBRA_DIR, "book.bin");
const EGAROUCID_DIR = process.env.EGAROUCID_DIR || path.join(__dirname, "vendor", "egaroucid");
const EGAROUCID_BIN = process.env.EGAROUCID_BIN || path.join(EGAROUCID_DIR, "Egaroucid_for_Console.out");
const EGAROUCID_TIMEOUT_MS = Math.max(1000, Number(process.env.EGAROUCID_TIMEOUT_MS || "6000"));
const EGAROUCID_ANALYSIS_LEVEL = Math.max(1, Number(process.env.EGAROUCID_ANALYSIS_LEVEL || "10"));
const EGAROUCID_EXPERT_LEVEL = Math.max(1, Number(process.env.EGAROUCID_EXPERT_LEVEL || "12"));
const UNJOINED_ROOM_TTL_MS = 5 * 60 * 1000;
const PLAYER_AWAY_TTL_MS = 30 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 30 * 1000;
const ZEBRA_TIMEOUT_MS = 900;
const EMPTY = 0;
const BLACK = 1;
const WHITE = -1;
const HUMAN_LEVELS = {
  easy: { depth: 2, noise: 14, topChoices: 5, book: true, bookChance: 0.45, zebra: false, mistakeRate: 0.14, endgame: 6 },
  casual: { depth: 3, noise: 4, topChoices: 3, book: true, bookChance: 0.75, zebra: false, mistakeRate: 0.055, endgame: 8 },
  club: { depth: 4, noise: 0.7, topChoices: 2, book: true, bookChance: 0.95, zebra: false, mistakeRate: 0.012, endgame: 8 },
  expert: { depth: 5, noise: 0, topChoices: 1, book: true, bookChance: 1, zebra: true, mistakeRate: 0, endgame: 8 }
};
const WEIGHTS = [
  120, -22, 20, 8, 8, 20, -22, 120,
  -22, -40, -6, -6, -6, -6, -40, -22,
  20, -6, 15, 3, 3, 15, -6, 20,
  8, -6, 3, 3, 3, 3, -6, 8,
  8, -6, 3, 3, 3, 3, -6, 8,
  20, -6, 15, 3, 3, 15, -6, 20,
  -22, -40, -6, -6, -6, -6, -40, -22,
  120, -22, 20, 8, 8, 20, -22, 120
];
const sockets = new Map();
const rooms = new Map();
const zebraCache = new Map();
const egaroucidCache = new Map();
const egaroucidEngines = new Map();
const OPENING_BOOK = new Map([
  ["", ["e6", "f5", "d3", "c4"]],
  ["e6", ["f6", "f4"]],
  ["e6f6", ["f5"]],
  ["e6f6f5", ["f4", "d6"]],
  ["e6f6f5d6", ["c5", "e7"]],
  ["e6f6f5d6e7", ["f4", "g5"]],
  ["e6f6f5d6e7g5", ["c5"]],
  ["e6f6f5d6e7g5g4", ["f7"]],
  ["e6f6f5d6e7g5g4f7", ["d7"]],
  ["e6f6f5d6e7g5g4f7h5", ["h3"]],
  ["e6f6f5d6e7g5g4f7h5h3", ["g6"]],
  ["e6f6f5d6e7g5g4f7h5h3g3", ["e3"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4", ["h2"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6", ["h6"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6", ["d7"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8", ["d8"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8d8", ["c6"]],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8d8e8", ["g8"]]
]);

const OPENING_PLAYED_LABELS = new Map([
  ["e6", "best"],
  ["e6f6", "best"],
  ["e6f6f5", "best"],
  ["e6f6f5d6", "best"],
  ["e6f6f5d6e7", "best"],
  ["e6f6f5d6e7g5", "best"],
  ["e6f6f5d6e7g5g4", "solid"],
  ["e6f6f5d6e7g5g4f7", "solid"],
  ["e6f6f5d6e7g5g4f7h5", "solid"],
  ["e6f6f5d6e7g5g4f7h5h3", "best"],
  ["e6f6f5d6e7g5g4f7h5h3g3", "good"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4", "blunder"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6", "blunder"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6", "best"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8", "best"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8d8", "good"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8d8e8", "solid"],
  ["e6f6f5d6e7g5g4f7h5h3g3h4g6h6f8d8e8g8", "best"]
]);

const ZEBRA_REFERENCE_LINES = [
  "e6 f4 e3 d6 c6 c5 d3 c3 b3 d7 b6 c4 f6 a6 c8 e8 c7 f5 a5 a4 e7 a2 a3 b5 a1 c2 a7 f8 d8 f3 c1 b8 b4 f7 d2 e2 g6 d1 f1 e1 b1 b2 g5 f2 g3 h3 g2 h1 h2 g1 h4 h5 g4 g7 h8 g8 a8 b7 h7 h6"
];

for (const line of ZEBRA_REFERENCE_LINES) registerZebraReferenceLine(line);

function initialBoard() {
  const board = Array(64).fill(EMPTY);
  board[27] = WHITE;
  board[28] = BLACK;
  board[35] = BLACK;
  board[36] = WHITE;
  return board;
}

function other(color) {
  return -color;
}

function countPieces(board) {
  return board.reduce((acc, cell) => {
    if (cell === BLACK) acc.black += 1;
    if (cell === WHITE) acc.white += 1;
    return acc;
  }, { black: 0, white: 0 });
}

function captures(board, index, color) {
  if (board[index] !== EMPTY) return [];
  const row = Math.floor(index / 8);
  const col = index % 8;
  const dirs = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
  ];
  const result = [];
  for (const [dr, dc] of dirs) {
    let r = row + dr;
    let c = col + dc;
    const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const next = r * 8 + c;
      if (board[next] === other(color)) {
        line.push(next);
      } else {
        if (board[next] === color && line.length) result.push(...line);
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return result;
}

function legalMoves(board, color) {
  const moves = [];
  for (let i = 0; i < 64; i += 1) {
    const flips = captures(board, i, color);
    if (flips.length) moves.push({ index: i, flips });
  }
  return moves;
}

function applyMove(board, color, index) {
  const flips = captures(board, index, color);
  if (!flips.length) return null;
  const next = board.slice();
  next[index] = color;
  for (const flip of flips) next[flip] = color;
  return { board: next, flips };
}

function evaluate(board, color) {
  const mine = legalMoves(board, color).length;
  const theirs = legalMoves(board, other(color)).length;
  const counts = countPieces(board);
  const discDiff = (counts.black - counts.white) * color;
  let positional = 0;
  for (let i = 0; i < 64; i += 1) positional += board[i] * WEIGHTS[i] * color;
  const empties = board.filter((cell) => cell === EMPTY).length;
  if (empties === 0 || (mine === 0 && theirs === 0)) return discDiff * 1000;
  return positional + (mine - theirs) * 14 + discDiff * (empties < 14 ? 14 : 2);
}

function minimax(board, color, rootColor, depth, alpha, beta) {
  const moves = legalMoves(board, color);
  const opponentMoves = legalMoves(board, other(color));
  if (depth === 0 || (!moves.length && !opponentMoves.length)) {
    return evaluate(board, rootColor);
  }
  if (!moves.length) return minimax(board, other(color), rootColor, depth - 1, alpha, beta);
  if (color === rootColor) {
    let best = -Infinity;
    for (const move of moves) {
      const made = applyMove(board, color, move.index);
      best = Math.max(best, minimax(made.board, other(color), rootColor, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    const made = applyMove(board, color, move.index);
    best = Math.min(best, minimax(made.board, other(color), rootColor, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function analyzeMoves(board, color, depth = 3) {
  return legalMoves(board, color)
    .map((move) => {
      const made = applyMove(board, color, move.index);
      return {
        index: move.index,
        flips: move.flips.length,
        score: minimax(made.board, other(color), color, depth - 1, -Infinity, Infinity)
      };
    })
    .sort((a, b) => b.score - a.score);
}

function registerZebraReferenceLine(line) {
  const moves = parseMoveSequence(line);
  for (let i = 0; i < moves.length; i += 1) {
    const prior = moves.slice(0, i).join("");
    const played = moves.slice(0, i + 1).join("");
    const existing = OPENING_BOOK.get(prior) || [];
    const nextMove = moves[i];
    OPENING_BOOK.set(prior, [nextMove, ...existing.filter((move) => move !== nextMove)]);
    OPENING_PLAYED_LABELS.set(played, "best");
  }
}

function openingBookMoves(sequence, board, color) {
  const legal = new Set(legalMoves(board, color).map((move) => move.index));
  const bookMoves = OPENING_BOOK.get(sequence) || [];
  const ranked = bookMoves
    .map((move, i) => ({
      index: moveIndex(move),
      move,
      flips: 0,
      score: Number((3 - i * 0.25).toFixed(2)),
      source: "Zebra book"
    }))
    .filter((move) => legal.has(move.index));
  if (!ranked.length) return null;
  return ranked;
}

function exactEndgameMoves(board, color) {
  const empties = board.filter((cell) => cell === EMPTY).length;
  return analyzeMoves(board, color, Math.max(1, empties));
}

function pickRankedMove(ranked, config) {
  if (!ranked.length) return null;
  if (Math.random() < config.mistakeRate && ranked.length > 1) {
    const mistakePool = ranked.slice(1, Math.min(ranked.length, Math.max(3, config.topChoices + 2)));
    return mistakePool[Math.floor(Math.random() * mistakePool.length)].index;
  }
  const pool = ranked.slice(0, Math.max(1, config.topChoices));
  const noisy = pool
    .map((move) => ({ ...move, pickScore: move.score + (Math.random() - 0.5) * config.noise }))
    .sort((a, b) => b.pickScore - a.pickScore);
  return noisy[0].index;
}

async function chooseComputerMove(room, color) {
  const { board, level } = room;
  if (!legalMoves(board, color).length) return null;
  const config = HUMAN_LEVELS[level] || HUMAN_LEVELS.casual;
  const sequence = historySequence(room.history || []);
  const book = config.book ? openingBookMoves(sequence, board, color) : null;
  if (book?.length && Math.random() < config.bookChance) return pickRankedMove(book, config);
  if (level === "expert") {
    const egaroucid = await egaroucidAnalyzeSequence(sequence, EGAROUCID_EXPERT_LEVEL);
    if (egaroucid?.length) return pickRankedMove(egaroucid, config);
  }
  const zebra = config.zebra ? await zebraAnalyzeSequence(sequence) : null;
  if (zebra?.length) return pickRankedMove(zebra, config);
  const empties = board.filter((cell) => cell === EMPTY).length;
  const ranked = empties <= config.endgame ? exactEndgameMoves(board, color) : analyzeMoves(board, color, config.depth);
  return pickRankedMove(ranked, config);
}

function moveName(index) {
  return `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
}

function moveIndex(name) {
  const col = "abcdefgh".indexOf(String(name || "")[0]);
  const row = Number(String(name || "")[1]) - 1;
  if (col < 0 || row < 0 || row > 7) return -1;
  return row * 8 + col;
}

function classifyLoss(loss) {
  if (loss <= 4) return "best";
  if (loss <= 14) return "good";
  if (loss <= 32) return "solid";
  if (loss <= 70) return "mistake";
  return "blunder";
}

function scaledLocalLoss(loss, turn) {
  if (turn <= 6) return loss / 5;
  if (turn <= 11) return loss / 3;
  return loss;
}

function labelLoss(loss, turn, source) {
  if (source === "local") return classifyLoss(scaledLocalLoss(loss, turn));
  return classifyLoss(loss);
}

function reportSource(report) {
  const sources = new Set((report || []).filter((row) => typeof row.turn === "number").map((row) => row.source));
  if (sources.has("Egaroucid")) return "Egaroucid";
  if (sources.has("Zebra")) return "Zebra";
  if (sources.has("Zebra book")) return "Zebra book";
  return "local";
}

function moveReport(history, finalCounts, zebraByTurn = null) {
  return history.map((entry, i) => {
    const priorSequence = historySequence(history.slice(0, i));
    const playedSequence = historySequence(history.slice(0, i + 1));
    const book = openingBookMoves(priorSequence, entry.before, entry.color);
    const ranked = zebraByTurn?.[i] || book || analyzeMoves(entry.before, entry.color, 3);
    const best = ranked[0];
    const played = ranked.find((item) => item.index === entry.index);
    const source = zebraByTurn?.[i]?.[0]?.source || (book ? "Zebra book" : "local");
    const loss = best && played ? Math.max(0, best.score - played.score) : 0;
    const bookLabel = OPENING_PLAYED_LABELS.get(playedSequence);
    return {
      turn: i + 1,
      color: entry.color,
      move: moveName(entry.index),
      bestMove: best ? moveName(best.index) : moveName(entry.index),
      score: played ? Math.max(-1, Math.min(1, played.score / 18)) : 0,
      loss,
      label: bookLabel || labelLoss(loss, i + 1, source),
      source
    };
  }).concat([{
    turn: "final",
    color: 0,
    move: `${finalCounts.black}-${finalCounts.white}`,
    bestMove: "",
    score: 0,
    loss: 0,
    label: "complete",
    source: zebraByTurn ? "Zebra" : "local"
  }]);
}

function historySequence(history) {
  return history.map((entry) => moveName(entry.index)).join("");
}

function parseMoveSequence(value) {
  return String(value || "").toLowerCase().match(/[a-h][1-8]/g) || [];
}

function historyFromMoves(moves) {
  let board = initialBoard();
  let turn = BLACK;
  const history = [];
  for (const move of moves) {
    const index = typeof move === "number" ? move : moveIndex(move);
    const currentMoves = legalMoves(board, turn);
    if (!currentMoves.length && legalMoves(board, other(turn)).length) turn = other(turn);
    const made = applyMove(board, turn, index);
    if (!made) {
      return { error: `${moveName(index)} is not legal for ${turn === BLACK ? "Black" : "White"} on move ${history.length + 1}.` };
    }
    history.push({ before: board.slice(), color: turn, index });
    board = made.board;
    turn = other(turn);
  }
  const blackMoves = legalMoves(board, BLACK);
  const whiteMoves = legalMoves(board, WHITE);
  const status = blackMoves.length || whiteMoves.length ? "in-progress" : "complete";
  return { board, turn, history, counts: countPieces(board), status };
}

function parseZebraScores(output) {
  const blocks = [...output.matchAll(/Scores for the \d+ moves:\n((?:\s+[a-h][1-8]\s+.*\n)+)/g)];
  const block = blocks.at(-1)?.[1];
  if (!block) return [];
  return block.trim().split(/\n/).map((line) => {
    const match = line.match(/^\s*([a-h][1-8])\s+([+-]?\d+(?:\.\d+)?)/);
    if (!match) return null;
    return {
      index: moveIndex(match[1]),
      move: match[1],
      score: Number(match[2]),
      raw: line.trim(),
      source: "Zebra"
    };
  }).filter((move) => move && move.index >= 0).sort((a, b) => b.score - a.score);
}

class EgaroucidEngine {
  constructor(level) {
    this.level = level;
    this.process = null;
    this.buffer = "";
    this.waiter = null;
    this.queue = Promise.resolve();
    this.available = fs.existsSync(EGAROUCID_BIN)
      && fs.existsSync(path.join(EGAROUCID_DIR, "resources", "book.egbk3"))
      && fs.existsSync(path.join(EGAROUCID_DIR, "resources", "eval.egev2"));
  }

  async start() {
    if (!this.available) return false;
    if (this.process && !this.process.killed) return true;
    this.buffer = "";
    this.process = spawn(EGAROUCID_BIN, ["-q", "-noboard", "-l", String(this.level), "-t", "1"], {
      cwd: EGAROUCID_DIR,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process.stdout.on("data", (chunk) => this.onData(chunk));
    this.process.stderr.on("data", (chunk) => this.onData(chunk));
    this.process.on("close", () => {
      this.process = null;
      this.waiter = null;
    });
    this.process.on("error", () => {
      this.process = null;
      this.waiter = null;
    });
    await this.waitForPrompt();
    return true;
  }

  onData(chunk) {
    this.buffer += chunk.toString("utf8");
    if (this.buffer.length > 160000) this.buffer = this.buffer.slice(-160000);
    if (this.waiter && this.buffer.endsWith("> ")) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.resolve(this.buffer);
    }
  }

  waitForPrompt() {
    if (this.buffer.endsWith("> ")) return Promise.resolve(this.buffer);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Egaroucid timeout"));
      }, EGAROUCID_TIMEOUT_MS);
      this.waiter = {
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        }
      };
    });
  }

  async command(text) {
    if (!this.process || this.process.killed) await this.start();
    if (!this.process) return "";
    this.buffer = "";
    this.process.stdin.write(`${text}\n`);
    return this.waitForPrompt();
  }

  rank(sequence) {
    this.queue = this.queue.then(() => this.rankNow(sequence)).catch(() => null);
    return this.queue;
  }

  async rankNow(sequence) {
    if (!await this.start()) return null;
    await this.command("init");
    const moves = String(sequence || "").match(/.{1,2}/g) || [];
    if (moves.length) await this.command(`play ${moves.join("")}`);
    const output = await this.command("hint 32");
    const ranked = parseEgaroucidHint(output);
    return ranked.length ? ranked : null;
  }
}

function getEgaroucidEngine(level) {
  const normalized = Math.max(1, Math.min(60, Number(level) || EGAROUCID_ANALYSIS_LEVEL));
  if (!egaroucidEngines.has(normalized)) egaroucidEngines.set(normalized, new EgaroucidEngine(normalized));
  return egaroucidEngines.get(normalized);
}

function parseEgaroucidHint(output) {
  return String(output || "")
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 5 && /^[a-h][1-8]$/i.test(parts[3]))
    .map((parts) => ({
      index: moveIndex(parts[3].toLowerCase()),
      move: parts[3].toLowerCase(),
      score: Number(parts[4].replace("+", "")),
      source: "Egaroucid"
    }))
    .filter((move) => move.index >= 0 && Number.isFinite(move.score))
    .sort((a, b) => b.score - a.score);
}

async function egaroucidAnalyzeSequence(sequence, level = EGAROUCID_ANALYSIS_LEVEL) {
  const cacheKey = `${level}:${sequence || ""}`;
  if (egaroucidCache.has(cacheKey)) return egaroucidCache.get(cacheKey);
  try {
    const ranked = await getEgaroucidEngine(level).rank(sequence || "");
    egaroucidCache.set(cacheKey, ranked);
    return ranked;
  } catch {
    egaroucidCache.set(cacheKey, null);
    return null;
  }
}

function zebraAnalyzeSequence(sequence) {
  return new Promise((resolve) => {
    const cacheKey = sequence || "";
    if (zebraCache.has(cacheKey)) {
      resolve(zebraCache.get(cacheKey));
      return;
    }
    if (!fs.existsSync(ZEBRA_PRACTICE) || !fs.existsSync(ZEBRA_BOOK)) {
      zebraCache.set(cacheKey, null);
      resolve(null);
      return;
    }
    const child = spawn(ZEBRA_PRACTICE, [ZEBRA_BOOK], { cwd: ZEBRA_DIR });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        zebraCache.set(cacheKey, null);
        resolve(null);
      }
    }, ZEBRA_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 120000) output = output.slice(-120000);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        zebraCache.set(cacheKey, null);
        resolve(null);
      }
    });
    child.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const parsed = parseZebraScores(output);
        const result = parsed.length ? parsed : null;
        zebraCache.set(cacheKey, result);
        resolve(result);
      }
    });

    const moves = String(sequence || "").match(/.{1,2}/g) || [];
    child.stdin.write(`${moves.join("\n")}\nquit\n`);
    child.stdin.end();
  });
}

async function analyzePositionWithBestEngine(history, board, turn, level = "casual") {
  const config = HUMAN_LEVELS[level] || HUMAN_LEVELS.casual;
  const sequence = historySequence(history);
  const book = openingBookMoves(sequence, board, turn);
  if (book?.length) return { source: "Zebra book", moves: book };
  const egaroucid = await egaroucidAnalyzeSequence(sequence, EGAROUCID_ANALYSIS_LEVEL);
  if (egaroucid?.length) return { source: "Egaroucid", moves: egaroucid };
  const zebra = await zebraAnalyzeSequence(sequence);
  if (zebra?.length) return { source: "Zebra", moves: zebra };
  return { source: "local", moves: analyzeMoves(board, turn, config.depth) };
}

async function analyzeRoomWithBestEngine(room) {
  return analyzePositionWithBestEngine(room.history, room.board, room.turn, room.level);
}

function analyzeRoomQuickly(room) {
  const sequence = historySequence(room.history);
  const book = openingBookMoves(sequence, room.board, room.turn);
  if (book?.length) return { source: "Zebra book", moves: book };
  return { source: "fast local", moves: analyzeMoves(room.board, room.turn, room.level === "expert" ? 3 : 2) };
}

async function buildZebraReport(room, finalCounts) {
  const zebraByTurn = [];
  for (let i = 0; i < room.history.length; i += 1) {
    const partial = historySequence(room.history.slice(0, i));
    const moves = await egaroucidAnalyzeSequence(partial, EGAROUCID_ANALYSIS_LEVEL) || await zebraAnalyzeSequence(partial);
    zebraByTurn.push(moves?.length ? moves : null);
  }
  return moveReport(room.history, finalCounts, zebraByTurn);
}

async function reviewImportedGame({ moves, blackName, whiteName }) {
  const built = historyFromMoves(parseMoveSequence(moves));
  if (built.error) return { error: built.error };
  const report = await buildZebraReport({ id: "import", history: built.history, board: built.board, status: "complete" }, built.counts) || moveReport(built.history, built.counts);
  const players = {
    black: String(blackName || "Black").slice(0, 24),
    white: String(whiteName || "White").slice(0, 24)
  };
  return {
    source: reportSource(report),
    players,
    counts: built.counts,
    status: built.status,
    nextTurn: built.turn,
    moves: built.history.map((entry) => ({ color: entry.color, move: moveName(entry.index) })),
    report
  };
}

function refreshZebraReport(room) {
  const counts = countPieces(room.board);
  buildZebraReport(room, counts).then((report) => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom || liveRoom.status !== "complete" || !report) return;
    liveRoom.report = report;
    liveRoom.analysisSource = reportSource(report);
    broadcast(liveRoom);
  });
}

function makeRoom(id, mode = "online", level = "casual") {
  const now = Date.now();
  const room = {
    id,
    mode,
    level,
    createdAt: now,
    lastActivityAt: now,
    firstJoinedAt: null,
    playerAwaySince: null,
    board: initialBoard(),
    turn: BLACK,
    players: {},
    spectators: new Set(),
    history: [],
    status: "waiting",
    winner: null,
    lastPass: null,
    report: null,
    analysisSource: "local"
  };
  rooms.set(id, room);
  return room;
}

function publicRoom(room, viewerId) {
  const counts = countPieces(room.board);
  const blackMoves = legalMoves(room.board, BLACK).map((m) => m.index);
  const whiteMoves = legalMoves(room.board, WHITE).map((m) => m.index);
  return {
    id: room.id,
    mode: room.mode,
    level: room.level,
    board: room.board,
    turn: room.turn,
    players: room.players,
    status: room.status,
    counts,
    legal: { black: blackMoves, white: whiteMoves },
    viewerColor: viewerId ? playerColor(room, viewerId) : 0,
    history: room.history.map((h) => ({ color: h.color, index: h.index, move: moveName(h.index) })),
    winner: room.winner,
    lastPass: room.lastPass,
    report: room.report,
    analysisSource: room.analysisSource
  };
}

function updateGameStatus(room) {
  room.lastPass = null;
  const moves = legalMoves(room.board, room.turn);
  const nextMoves = legalMoves(room.board, other(room.turn));
  if (moves.length) return;
  if (nextMoves.length) {
    room.lastPass = { color: room.turn, next: other(room.turn) };
    room.turn = other(room.turn);
    return;
  }
  const counts = countPieces(room.board);
  room.status = "complete";
  room.winner = counts.black > counts.white ? BLACK : counts.white > counts.black ? WHITE : 0;
  room.report = moveReport(room.history, counts);
  refreshZebraReport(room);
}

function broadcast(room) {
  for (const socket of sockets.values()) {
    if (socket.roomId === room.id) {
      sendFrame(socket, JSON.stringify({ type: "room", room: publicRoom(room, socket.clientId) }));
    }
  }
  broadcastLobby();
}

function lobbyData() {
  cleanupRooms();
  return [...rooms.values()].map((room) => ({
    id: room.id,
    mode: room.mode,
    status: room.status,
    players: Object.values(room.players).filter(Boolean).length,
    level: room.level
  }));
}

function broadcastLobby() {
  const onlinePlayers = [...sockets.values()]
    .map((socket) => socket.name)
    .filter(Boolean)
    .filter((name, index, names) => names.indexOf(name) === index);
  const payload = JSON.stringify({ type: "lobby", rooms: lobbyData(), online: sockets.size, onlinePlayers });
  for (const socket of sockets.values()) sendFrame(socket, payload);
}

function normalizeClientId(value) {
  const id = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return id || crypto.randomBytes(8).toString("hex");
}

function normalizePreferredColor(value) {
  if (value === "black" || value === "white") return value;
  return "random";
}

function oppositeKey(key) {
  return key === "black" ? "white" : "black";
}

function colorForKey(key) {
  return key === "black" ? BLACK : WHITE;
}

function computerColor(room) {
  if (room.players.black?.id === "computer") return BLACK;
  if (room.players.white?.id === "computer") return WHITE;
  return 0;
}

function isConnectedPlayer(player) {
  if (!player || player.id === "computer") return Boolean(player);
  return [...sockets.values()].some((socket) => socket.clientId === player.id);
}

function addComputerOpponent(room, preferredColor) {
  if (room.mode !== "computer" || room.players.black || room.players.white) return;
  const humanKey = preferredColor === "random"
    ? (Math.random() < 0.5 ? "black" : "white")
    : preferredColor;
  const computerKey = oppositeKey(humanKey);
  room.players[computerKey] = { id: "computer", name: `Zebra ${room.level}`, socketId: "computer" };
}

function seatHumanPlayer(room, socket, preferredColor) {
  const sameBlack = room.players.black?.id === socket.clientId;
  const sameWhite = room.players.white?.id === socket.clientId;
  if (sameBlack) {
    room.players.black = { id: socket.clientId, socketId: socket.id, name: socket.name };
    return;
  }
  if (sameWhite) {
    room.players.white = { id: socket.clientId, socketId: socket.id, name: socket.name };
    return;
  }

  const colors = preferredColor === "random"
    ? (Math.random() < 0.5 ? ["black", "white"] : ["white", "black"])
    : [preferredColor];
  for (const key of colors) {
    if (!isConnectedPlayer(room.players[key])) {
      room.players[key] = { id: socket.clientId, socketId: socket.id, name: socket.name };
      return;
    }
  }
  room.spectators.add(socket.clientId);
}

function joinRoom(socket, { roomId, name, mode, level, preferredColor, humanColor, clientId }) {
  const id = (roomId || crypto.randomBytes(3).toString("hex")).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18);
  const room = rooms.get(id) || makeRoom(id, mode, level);
  const colorChoice = normalizePreferredColor(humanColor || preferredColor);
  socket.roomId = id;
  socket.clientId = normalizeClientId(clientId || socket.clientId);
  socket.name = String(name || "Player").slice(0, 24);
  room.lastActivityAt = Date.now();
  room.spectators.delete(socket.clientId);
  addComputerOpponent(room, colorChoice);
  seatHumanPlayer(room, socket, colorChoice);

  if (room.players.black && room.players.white) {
    room.status = "playing";
    room.firstJoinedAt ||= Date.now();
    room.playerAwaySince = null;
  }
  sendFrame(socket, JSON.stringify({ type: "joined", id: socket.clientId, color: playerColor(room, socket.clientId), roomId: id }));
  broadcast(room);
  scheduleComputerMove(room);
}

function playerColor(room, clientId) {
  if (room.players.black?.id === clientId) return BLACK;
  if (room.players.white?.id === clientId) return WHITE;
  return 0;
}

function makePlayerMove(socket, index) {
  const room = rooms.get(socket.roomId);
  if (!room || room.status !== "playing") return;
  const color = playerColor(room, socket.clientId);
  if (color !== room.turn) return;
  if (commitMove(room, color, index)) scheduleComputerMove(room);
}

function scheduleComputerMove(room) {
  const color = computerColor(room);
  if (room.mode !== "computer" || room.status !== "playing" || room.turn !== color) return;
  setTimeout(async () => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom || liveRoom.status !== "playing") return;
    const liveColor = computerColor(liveRoom);
    if (!liveColor || liveRoom.turn !== liveColor) return;
    const computerMove = await chooseComputerMove(liveRoom, liveColor);
    if (computerMove === null) {
      updateGameStatus(liveRoom);
      broadcast(liveRoom);
      scheduleComputerMove(liveRoom);
      return;
    }
    commitMove(liveRoom, liveColor, computerMove);
    scheduleComputerMove(liveRoom);
  }, 450);
}

function resignGame(socket) {
  const room = rooms.get(socket.roomId);
  if (!room || room.status === "complete") return;
  const color = playerColor(room, socket.clientId);
  if (!color) return;
  const counts = countPieces(room.board);
  room.status = "complete";
  room.winner = other(color);
  room.lastPass = null;
  room.report = moveReport(room.history, counts);
  refreshZebraReport(room);
  broadcast(room);
}

function commitMove(room, color, index) {
  const made = applyMove(room.board, color, index);
  if (!made) return false;
  room.lastActivityAt = Date.now();
  room.history.push({ before: room.board.slice(), color, index });
  room.board = made.board;
  room.turn = other(color);
  updateGameStatus(room);
  broadcast(room);
  return true;
}

function handleMessage(socket, message) {
  let data;
  try { data = JSON.parse(message); } catch { return; }
  if (data.type === "join") joinRoom(socket, data);
  if (data.type === "move") makePlayerMove(socket, Number(data.index));
  if (data.type === "resign") resignGame(socket);
  if (data.type === "analyze") {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const { source, moves } = analyzeRoomQuickly(room);
    const ranked = moves.slice(0, 8);
    sendFrame(socket, JSON.stringify({
      type: "analysis",
      source,
      color: room.turn,
      context: data.context || "",
      moves: ranked.map((m) => ({ ...m, move: m.move || moveName(m.index) }))
    }));
  }
  if (data.type === "analyze-sequence") {
    const built = historyFromMoves(parseMoveSequence(data.moves));
    if (built.error) return;
    analyzePositionWithBestEngine(built.history, built.board, built.turn).then(({ source, moves }) => {
      const ranked = moves.slice(0, 8);
      sendFrame(socket, JSON.stringify({ type: "analysis", source, color: built.turn, context: data.context || "", moves: ranked.map((m) => ({ ...m, move: m.move || moveName(m.index) })) }));
    });
  }
  if (data.type === "analyze-import") {
    reviewImportedGame(data).then((review) => {
      sendFrame(socket, JSON.stringify({ type: "import-analysis", review, moves: parseMoveSequence(data.moves).join(" ") }));
    });
  }
  if (data.type === "new-computer") joinRoom(socket, { roomId: crypto.randomBytes(3).toString("hex"), mode: "computer", level: data.level, preferredColor: data.preferredColor, humanColor: data.humanColor, name: data.name, clientId: data.clientId });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const rawPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, rawPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));
  socket.id = crypto.randomBytes(8).toString("hex");
  sockets.set(socket.id, socket);
  socket.on("data", (buffer) => readFrames(socket, buffer));
  socket.on("close", () => disconnect(socket));
  socket.on("error", () => disconnect(socket));
  sendFrame(socket, JSON.stringify({ type: "hello", id: socket.id, serverVersion: SERVER_VERSION }));
  broadcastLobby();
});

function disconnect(socket) {
  sockets.delete(socket.id);
  const room = rooms.get(socket.roomId);
  if (room) {
    const wasSeated = room.players.black?.id === socket.clientId || room.players.white?.id === socket.clientId;
    const shouldCloseNeverJoinedRoom = room.mode === "online" && !room.firstJoinedAt && wasSeated;
    if (room.players.black?.id === socket.clientId) room.players.black.socketId = null;
    if (room.players.white?.id === socket.clientId) room.players.white.socketId = null;
    room.spectators.delete(socket.clientId);
    if (shouldCloseNeverJoinedRoom) {
      rooms.delete(room.id);
      broadcastLobby();
      return;
    }
    if (wasSeated) {
      room.lastActivityAt = Date.now();
      room.playerAwaySince ||= Date.now();
    }
    if (room.status === "playing" && room.mode !== "computer") room.status = "waiting";
    broadcast(room);
  }
  broadcastLobby();
}

function seatedHumanPlayers(room) {
  return [room.players.black, room.players.white].filter((player) => player && player.id !== "computer");
}

function connectedSeatedHumanCount(room) {
  return seatedHumanPlayers(room).filter((player) => isConnectedPlayer(player)).length;
}

function shouldDeleteRoom(room, now) {
  if (room.mode !== "online") return false;
  const seatedCount = seatedHumanPlayers(room).length;
  const connectedCount = connectedSeatedHumanCount(room);
  const neverJoined = !room.firstJoinedAt && seatedCount < 2;
  if (!room.firstJoinedAt && seatedCount > 0 && connectedCount === 0) return true;
  if (neverJoined && now - room.createdAt >= UNJOINED_ROOM_TTL_MS) return true;
  if (room.firstJoinedAt && connectedCount < seatedCount) {
    room.playerAwaySince ||= now;
    return now - room.playerAwaySince >= PLAYER_AWAY_TTL_MS;
  }
  if (connectedCount === seatedCount) room.playerAwaySince = null;
  return false;
}

function cleanupRooms() {
  const now = Date.now();
  let changed = false;
  for (const [id, room] of rooms.entries()) {
    if (shouldDeleteRoom(room, now)) {
      rooms.delete(id);
      changed = true;
    }
  }
  return changed;
}

function readFrames(socket, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    if (length === 126) {
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const masked = Boolean(second & 0x80);
    const mask = masked ? buffer.slice(offset, offset + 4) : null;
    if (masked) offset += 4;
    const payload = buffer.slice(offset, offset + length);
    offset += length;
    if (opcode === 8) return socket.end();
    if (opcode !== 1) continue;
    if (masked) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    handleMessage(socket, payload.toString("utf8"));
  }
}

function sendFrame(socket, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

server.listen(PORT, HOST, () => {
  console.log(`Othellit is running at http://localhost:${PORT}`);
});

setInterval(() => {
  if (cleanupRooms()) broadcastLobby();
}, ROOM_CLEANUP_INTERVAL_MS);
