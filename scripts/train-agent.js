#!/usr/bin/env node

const EMPTY = 0;
const BLACK = 1;
const WHITE = -1;

const LEVELS = {
  easy: { depth: 2, noise: 14, topChoices: 5, mistakeRate: 0.14, endgame: 6 },
  casual: { depth: 3, noise: 4, topChoices: 3, mistakeRate: 0.055, endgame: 8 },
  club: { depth: 4, noise: 0.7, topChoices: 2, mistakeRate: 0.012, endgame: 8 },
  expert: { depth: 5, noise: 0, topChoices: 1, mistakeRate: 0, endgame: 8 }
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

function arg(name, fallback) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const gamesPerMatchup = Math.max(1, Number(arg("games", "8")));
const teacherDepth = Math.max(1, Number(arg("teacher-depth", "5")));
const levels = String(arg("levels", Object.keys(LEVELS).join(",")))
  .split(",")
  .map((level) => level.trim())
  .filter((level) => LEVELS[level]);

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

function moveName(index) {
  return `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
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
  flips.forEach((flip) => { next[flip] = color; });
  return next;
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
  if (depth === 0 || (!moves.length && !opponentMoves.length)) return evaluate(board, rootColor);
  if (!moves.length) return minimax(board, other(color), rootColor, depth - 1, alpha, beta);
  if (color === rootColor) {
    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(board, color, move.index);
      best = Math.max(best, minimax(next, other(color), rootColor, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    const next = applyMove(board, color, move.index);
    best = Math.min(best, minimax(next, other(color), rootColor, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function analyzeMoves(board, color, depth) {
  return legalMoves(board, color)
    .map((move) => {
      const next = applyMove(board, color, move.index);
      return {
        index: move.index,
        move: moveName(move.index),
        score: minimax(next, other(color), color, depth - 1, -Infinity, Infinity)
      };
    })
    .sort((a, b) => b.score - a.score);
}

function pickMove(ranked, config) {
  if (!ranked.length) return null;
  if (Math.random() < config.mistakeRate && ranked.length > 1) {
    const pool = ranked.slice(1, Math.min(ranked.length, Math.max(3, config.topChoices + 2)));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = ranked.slice(0, Math.max(1, config.topChoices));
  return pool
    .map((move) => ({ ...move, pickScore: move.score + (Math.random() - 0.5) * config.noise }))
    .sort((a, b) => b.pickScore - a.pickScore)[0];
}

function chooseLevelMove(board, color, levelName) {
  const config = LEVELS[levelName];
  const empties = board.filter((cell) => cell === EMPTY).length;
  const depth = empties <= config.endgame ? Math.max(1, Math.min(empties, config.depth + 1)) : config.depth;
  return pickMove(analyzeMoves(board, color, depth), config);
}

function playGame(levelName, levelColor) {
  let board = initialBoard();
  let turn = BLACK;
  const stats = {
    gameMoves: 0,
    agreements: 0,
    checks: 0,
    totalLoss: 0,
    worstLoss: 0,
    worstMove: ""
  };

  while (true) {
    const moves = legalMoves(board, turn);
    const opponentMoves = legalMoves(board, other(turn));
    if (!moves.length && !opponentMoves.length) break;
    if (!moves.length) {
      turn = other(turn);
      continue;
    }

    const teacherRanked = analyzeMoves(board, turn, teacherDepth);
    const teacher = teacherRanked[0] || null;
    const picked = turn === levelColor ? chooseLevelMove(board, turn, levelName) : teacher;
    if (!picked) break;

    if (turn === levelColor && teacher) {
      const teacherViewOfPicked = teacherRanked.find((move) => move.index === picked.index);
      const loss = Math.max(0, teacher.score - (teacherViewOfPicked?.score ?? teacher.score));
      stats.checks += 1;
      stats.totalLoss += loss;
      if (teacher.index === picked.index) stats.agreements += 1;
      if (loss > stats.worstLoss) {
        stats.worstLoss = loss;
        stats.worstMove = `${moveName(picked.index)} instead of ${moveName(teacher.index)}`;
      }
    }

    board = applyMove(board, turn, picked.index);
    turn = other(turn);
    stats.gameMoves += 1;
  }

  const counts = countPieces(board);
  const margin = levelColor === BLACK ? counts.black - counts.white : counts.white - counts.black;
  return { ...stats, counts, margin };
}

function blankSummary(levelName) {
  return {
    level: levelName,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    totalMargin: 0,
    totalChecks: 0,
    totalAgreements: 0,
    totalLoss: 0,
    worstLoss: 0,
    worstMove: ""
  };
}

function addGame(summary, game) {
  summary.games += 1;
  summary.wins += game.margin > 0 ? 1 : 0;
  summary.draws += game.margin === 0 ? 1 : 0;
  summary.losses += game.margin < 0 ? 1 : 0;
  summary.totalMargin += game.margin;
  summary.totalChecks += game.checks;
  summary.totalAgreements += game.agreements;
  summary.totalLoss += game.totalLoss;
  if (game.worstLoss > summary.worstLoss) {
    summary.worstLoss = game.worstLoss;
    summary.worstMove = game.worstMove;
  }
}

function run() {
  console.log(`Othellit training agent`);
  console.log(`Teacher depth: ${teacherDepth}`);
  console.log(`Games per level: ${gamesPerMatchup * 2}`);
  console.log("");

  const summaries = levels.map((level) => {
    const summary = blankSummary(level);
    for (let i = 0; i < gamesPerMatchup; i += 1) {
      addGame(summary, playGame(level, BLACK));
      addGame(summary, playGame(level, WHITE));
    }
    return summary;
  });

  for (const summary of summaries) {
    const agreement = summary.totalChecks
      ? `${((summary.totalAgreements / summary.totalChecks) * 100).toFixed(1)}%`
      : "n/a";
    const avgLoss = summary.totalChecks ? (summary.totalLoss / summary.totalChecks).toFixed(1) : "n/a";
    const avgMargin = summary.games ? (summary.totalMargin / summary.games).toFixed(1) : "n/a";
    console.log(`${summary.level.toUpperCase()}`);
    console.log(`  record vs teacher: ${summary.wins}-${summary.draws}-${summary.losses}`);
    console.log(`  avg margin: ${avgMargin}`);
    console.log(`  teacher agreement: ${agreement}`);
    console.log(`  avg move loss: ${avgLoss}`);
    console.log(`  worst miss: ${summary.worstMove || "none"} (${summary.worstLoss.toFixed(1)})`);
    console.log("");
  }

  console.log("Use this to spot whether levels are too similar, too slow, or missing obvious teacher moves.");
}

run();
