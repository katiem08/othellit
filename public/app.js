const BLACK = 1;
const WHITE = -1;
const EXPECTED_SERVER_VERSION = 7;
let socket;
let myId = "";
let myColor = 0;
let selectedLevel = "casual";
let selectedColor = normalizeColorChoice(localStorage.getItem("othellitPreferredColor") || "random");
let serverVersion = 0;
let pendingExpectedColor = 0;
let colorMismatchWarning = "";
let resignTimeout = null;
let currentRoom = null;
let latestAnalysis = [];
let latestAnalysisSource = "local";
let lobbyOnlinePlayers = [];
let boardView = { mode: "live", ply: null, bestIndex: null, playedIndex: null };
let lastRoomHistoryLength = 0;
let animatedFlipIndexes = new Set();
let audioContext = null;
let pendingLocalSoundIndex = null;
let analyticsBoardState = [];
let analyticsTurn = BLACK;
let analyticsHistory = [];
let analyticsTimer = null;
const recordedRooms = new Set(JSON.parse(localStorage.getItem("othellitRecordedRooms") || "[]"));
const pendingMessages = [];
const clientId = getClientId();
const previewBoard = Array(64).fill(0);
previewBoard[27] = WHITE;
previewBoard[28] = BLACK;
previewBoard[35] = BLACK;
previewBoard[36] = WHITE;
const homeOpeningBoard = initialClientBoard();
let homeOpeningPlayed = false;
let homeOpeningTimer = null;

const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#gameStatus");
const blackScoreEl = document.querySelector("#blackScore");
const whiteScoreEl = document.querySelector("#whiteScore");
const blackPlayerEl = document.querySelector("#blackPlayer span:nth-child(2)");
const whitePlayerEl = document.querySelector("#whitePlayer span:nth-child(2)");
const roomEl = document.querySelector("#currentRoom");
const shareHintEl = document.querySelector("#shareHint");
const roomListEl = document.querySelector("#roomList");
const historyEl = document.querySelector("#history");
const analysisEl = document.querySelector("#analysis");
const reportEl = document.querySelector("#report");
const reviewPanelEl = document.querySelector("#reviewPanel");
const ratingEl = document.querySelector("#rating");
const onlineEl = document.querySelector("#onlineCount");
const serverNoticeEl = document.querySelector("#serverNotice");
const analysisToggleEl = document.querySelector("#analysisToggle");
const moveOptionsToggleEl = document.querySelector("#moveOptionsToggle");
const roomCodeEl = document.querySelector("#roomCode");
const friendNameEl = document.querySelector("#friendName");
const friendListEl = document.querySelector("#friendList");
const friendCountEl = document.querySelector("#friendCount");
const selectedLevelLabelEl = document.querySelector("#selectedLevelLabel");
const accountStatusEl = document.querySelector("#accountStatus");
const accountMessageEl = document.querySelector("#accountMessage");
const signupFormEl = document.querySelector("#signupForm");
const signinFormEl = document.querySelector("#signinForm");
const accountTabsEl = document.querySelector(".account-tabs");
const signupTabEl = document.querySelector("#signupTab");
const signinTabEl = document.querySelector("#signinTab");
const profileTabEl = document.querySelector("#profileTab");
const signupUsernameEl = document.querySelector("#signupUsername");
const signupEmailEl = document.querySelector("#signupEmail");
const signupPasswordEl = document.querySelector("#signupPassword");
const signinIdentityEl = document.querySelector("#signinIdentity");
const signinPasswordEl = document.querySelector("#signinPassword");
const profileFormEl = document.querySelector("#profileForm");
const profileUsernameEl = document.querySelector("#profileUsername");
const profileEmailEl = document.querySelector("#profileEmail");
const profileNewUsernameEl = document.querySelector("#profileNewUsername");
const profileCurrentPasswordEl = document.querySelector("#profileCurrentPassword");
const profileNewPasswordEl = document.querySelector("#profileNewPassword");
const authToggleEl = document.querySelector("#authToggle");
const authPanelEl = document.querySelector("#authPanel");
const homeScreenEl = document.querySelector("#homeScreen");
const playLayoutEl = document.querySelector("#playLayout");
const friendsScreenEl = document.querySelector("#friendsScreen");
const appTabsEl = document.querySelector("#appTabs");
const gameTabEl = document.querySelector("#gameTab");
const friendsTabEl = document.querySelector("#friendsTab");
const analyticsTabEl = document.querySelector("#analyticsTab");
const friendNameLargeEl = document.querySelector("#friendNameLarge");
const friendListLargeEl = document.querySelector("#friendListLarge");
const friendCountLargeEl = document.querySelector("#friendCountLarge");
const friendGamesEl = document.querySelector("#friendGames");
const analyticsScreenEl = document.querySelector("#analyticsScreen");
const analyticsBoardEl = document.querySelector("#analyticsBoard");
const analyticsStatusEl = document.querySelector("#analyticsStatus");
const analyticsBlackNameEl = document.querySelector("#analyticsBlackName");
const analyticsWhiteNameEl = document.querySelector("#analyticsWhiteName");
const analyticsMoveTextEl = document.querySelector("#analyticsMoveText");
const analyticsMovesEl = document.querySelector("#analyticsMoves");
const analyticsSummaryEl = document.querySelector("#analyticsSummary");
const analyticsReportEl = document.querySelector("#analyticsReport");
const analyticsBlackLabelEl = document.querySelector("#analyticsBlackLabel");
const analyticsWhiteLabelEl = document.querySelector("#analyticsWhiteLabel");
const analyticsBlackScoreEl = document.querySelector("#analyticsBlackScore");
const analyticsWhiteScoreEl = document.querySelector("#analyticsWhiteScore");
const homeMiniBoardEl = document.querySelector("#homeMiniBoard");
const homeBoardCueEl = document.querySelector("#homeBoardCue");

renderAccount();

function getClientId() {
  const existing = localStorage.getItem("zebraClientId");
  if (existing) return existing;
  const id = `player_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  localStorage.setItem("zebraClientId", id);
  return id;
}

function connect() {
  if (location.protocol === "file:") {
    onlineEl.textContent = "Preview only";
    statusEl.textContent = "Open http://localhost:4173 to play";
    serverNoticeEl.classList.remove("hidden");
    return;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}`);
  socket.addEventListener("open", () => {
    renderConnectionStatus();
    flushPending();
    const params = new URLSearchParams(location.search);
    if (params.get("room")) {
      showScreen("game");
      roomCodeEl.value = params.get("room");
      joinRoom(params.get("room"));
    }
  });
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "hello") {
      myId = data.id;
      serverVersion = data.serverVersion || 0;
      if (serverVersion < EXPECTED_SERVER_VERSION) {
        showServerWarning("The page is updated, but the local game server is still running older rules. Restart the server, then refresh this page.");
      }
    }
    if (data.type === "joined") {
      myColor = data.color;
      checkAssignedColor();
      roomEl.textContent = data.roomId;
      history.replaceState(null, "", `?room=${data.roomId}`);
    }
    if (data.type === "room") {
      const nextHistoryLength = data.room.history?.length || 0;
      const previousBoard = currentRoom?.id === data.room.id ? currentRoom.board : null;
      animatedFlipIndexes = changedLiveSquares(previousBoard, data.room.board, nextHistoryLength);
      const latestMove = data.room.history?.at(-1);
      const alreadyClicked = latestMove?.index === pendingLocalSoundIndex && latestMove?.color === myColor;
      if (animatedFlipIndexes.size && !alreadyClicked) playMoveSound();
      if (latestMove?.index === pendingLocalSoundIndex) pendingLocalSoundIndex = null;
      if (currentRoom?.id !== data.room.id || (data.room.status === "playing" && nextHistoryLength !== lastRoomHistoryLength)) {
        boardView = { mode: "live", ply: null, bestIndex: null, playedIndex: null };
      }
      currentRoom = data.room;
      lastRoomHistoryLength = nextHistoryLength;
      myColor = data.room.viewerColor ?? myColor;
      checkAssignedColor();
      latestAnalysis = [];
      renderRoom();
      requestAnalysis();
    }
    if (data.type === "analysis") {
      latestAnalysis = data.moves;
      latestAnalysisSource = data.source || "local";
      renderAnalysis();
      renderBoard();
    }
    if (data.type === "import-analysis") renderImportedAnalysis(data.review);
    if (data.type === "lobby") renderLobby(data);
  });
  socket.addEventListener("close", () => {
    renderConnectionStatus("Reconnecting...");
    setTimeout(connect, 1000);
  });
}

function changedLiveSquares(previousBoard, nextBoard, nextHistoryLength) {
  if (!previousBoard || !nextBoard || nextHistoryLength <= lastRoomHistoryLength) return new Set();
  const changed = new Set();
  nextBoard.forEach((piece, index) => {
    if (piece !== previousBoard[index]) changed.add(index);
  });
  return changed;
}

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playMoveSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const click = ctx.createOscillator();
  const tick = ctx.createOscillator();

  click.type = "triangle";
  click.frequency.setValueAtTime(520, now);
  click.frequency.exponentialRampToValueAtTime(230, now + 0.08);
  tick.type = "sine";
  tick.frequency.setValueAtTime(920, now);
  tick.frequency.exponentialRampToValueAtTime(460, now + 0.05);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  click.connect(gain);
  tick.connect(gain);
  gain.connect(ctx.destination);
  click.start(now);
  tick.start(now + 0.012);
  click.stop(now + 0.12);
  tick.stop(now + 0.09);
}

function renderConnectionStatus(fallback = null) {
  if (location.protocol === "file:") {
    onlineEl.textContent = "Preview only";
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    onlineEl.textContent = fallback || `${lobbyOnlinePlayers.length || 1} online`;
    return;
  }
  onlineEl.textContent = fallback || "Connecting...";
}

function send(message) {
  if (location.protocol === "file:") {
    serverNoticeEl.classList.remove("hidden");
    statusEl.textContent = "Open http://localhost:4173 to play";
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return;
  }
  pendingMessages.push(message);
  onlineEl.textContent = "Connecting...";
}

function showServerWarning(message) {
  serverNoticeEl.textContent = message;
  serverNoticeEl.classList.remove("hidden");
}

function flushPending() {
  while (pendingMessages.length && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(pendingMessages.shift()));
  }
}

function cleanRoomCode(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || Math.random().toString(36).slice(2, 8);
}

function playableOrigin() {
  if (location.protocol === "file:" || location.origin === "null") return "http://localhost:4173";
  return location.origin;
}

function roomLink(roomId) {
  return `${playableOrigin()}?room=${encodeURIComponent(roomId)}`;
}

function playerName() {
  const session = currentAccount();
  const name = session?.username || "Guest";
  localStorage.setItem("zebraName", name);
  return name;
}

function freshRoomCode(prefix = "game") {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}

function gamePreferencePayload() {
  return { preferredColor: selectedColor, humanColor: selectedColor };
}

function joinRoom(code) {
  showScreen("game");
  pendingExpectedColor = colorChoiceValue(selectedColor);
  colorMismatchWarning = "";
  send({ type: "join", roomId: cleanRoomCode(code || roomCodeEl.value), name: playerName(), mode: "online", level: selectedLevel, ...gamePreferencePayload(), clientId });
}

function startComputerGame() {
  showScreen("game");
  currentRoom = null;
  boardView = { mode: "live", ply: null, bestIndex: null, playedIndex: null };
  lastRoomHistoryLength = 0;
  latestAnalysis = [];
  renderBoard();
  pendingExpectedColor = colorChoiceValue(selectedColor);
  colorMismatchWarning = "";
  statusEl.textContent = `Starting computer game as ${colorChoiceName(selectedColor)}...`;
  send({ type: "new-computer", level: selectedLevel, ...gamePreferencePayload(), name: playerName(), clientId });
}

function renderRoom() {
  if (!currentRoom) return;
  blackScoreEl.textContent = currentRoom.counts.black;
  whiteScoreEl.textContent = currentRoom.counts.white;
  blackPlayerEl.textContent = playerLabel(currentRoom.players.black, BLACK);
  whitePlayerEl.textContent = playerLabel(currentRoom.players.white, WHITE);
  roomEl.textContent = currentRoom.id;
  renderBoard();
  renderHistory();
  renderReport();
  maybeRecordGame();
  if (boardView.mode !== "live") {
    renderBoardViewStatus();
    return;
  }
  const turnName = currentRoom.turn === BLACK ? "Black" : "White";
  const passText = currentRoom.lastPass ? `${colorName(currentRoom.lastPass.color)} had no moves. ` : "";
  if (currentRoom.status === "complete") {
    clearResignTimer();
    statusEl.textContent = currentRoom.winner === 0 ? "Draw" : `${currentRoom.winner === BLACK ? "Black" : "White"} wins`;
  } else if (colorMismatchWarning) {
    statusEl.textContent = colorMismatchWarning;
  } else if (myColor === 0) {
    statusEl.textContent = "Spectating";
  } else if (currentRoom.status === "waiting") {
    statusEl.textContent = currentRoom.mode === "computer" ? `You are ${colorName(myColor)}. Starting...` : `You are ${colorName(myColor)}. Waiting for ${colorName(otherColor(myColor))}`;
  } else if (myColor === currentRoom.turn) {
    const again = currentRoom.lastPass && currentRoom.history.at(-1)?.color === myColor ? " again" : "";
    statusEl.textContent = `${passText}You are ${colorName(myColor)}. Your move${again}`;
  } else {
    statusEl.textContent = `${passText}You are ${colorName(myColor)}. ${turnName} to move`;
  }
}

function playerLabel(player, color) {
  const name = player?.name || "Waiting";
  return color === myColor ? `${name} (you)` : name;
}

function colorName(color) {
  return color === BLACK ? "Black" : "White";
}

function otherColor(color) {
  return -color;
}

function colorChoiceValue(value) {
  if (value === "black") return BLACK;
  if (value === "white") return WHITE;
  return 0;
}

function checkAssignedColor() {
  if (!pendingExpectedColor || !myColor) return;
  if (myColor === pendingExpectedColor) {
    colorMismatchWarning = "";
    return;
  }
  colorMismatchWarning = `You chose ${colorName(pendingExpectedColor)}, but this running server seated you as ${colorName(myColor)}. Restart the local server, then refresh.`;
  showServerWarning("Your browser is talking to an older Othellit server process. Restart the local server so color selection and resign use the updated rules.");
}

function normalizeColorChoice(value) {
  return value === "black" || value === "white" ? value : "random";
}

function colorChoiceName(value) {
  if (value === "black") return "Black";
  if (value === "white") return "White";
  return "Random";
}

function updatePlayPreferenceLabel() {
  selectedLevelLabelEl.textContent = `${selectedLevel[0].toUpperCase()}${selectedLevel.slice(1)} level · ${colorChoiceName(selectedColor)}`;
  document.querySelectorAll("#colorPicker button").forEach((button) => button.classList.toggle("active", button.dataset.color === selectedColor));
}

function showScreen(screen) {
  homeScreenEl.classList.toggle("hidden", screen !== "home");
  playLayoutEl.classList.toggle("hidden", screen !== "game");
  friendsScreenEl.classList.toggle("hidden", screen !== "friends");
  analyticsScreenEl.classList.toggle("hidden", screen !== "analytics");
  gameTabEl.classList.toggle("active", screen === "game");
  friendsTabEl.classList.toggle("active", screen === "friends");
  analyticsTabEl.classList.toggle("active", screen === "analytics");
  if (screen === "friends") {
    renderFriends();
    renderGameHistory();
  }
  if (screen === "analytics") renderAnalyticsBoard();
  if (screen === "home") resetHomeOpeningPreview();
}

function resetHomeOpeningPreview() {
  homeOpeningPlayed = false;
  clearTimeout(homeOpeningTimer);
  homeScreenEl.classList.remove("opening-enter");
  homeBoardCueEl.textContent = "Tap d3 to play";
  renderHomeOpeningPreview();
}

function renderHomeOpeningPreview() {
  homeMiniBoardEl.innerHTML = "";
  const board = homeOpeningBoard.slice();
  if (homeOpeningPlayed) {
    board[19] = BLACK;
    board[27] = BLACK;
  }
  board.forEach((piece, index) => {
    const cell = document.createElement("span");
    cell.className = "mini-cell";
    cell.setAttribute("aria-label", squareName(index));
    if (index === 19 && !homeOpeningPlayed) {
      cell.classList.add("mini-playable");
      cell.appendChild(document.createElement("i"));
      const label = document.createElement("b");
      label.textContent = "d3";
      cell.appendChild(label);
    }
    if ((index === 19 || index === 27) && homeOpeningPlayed) cell.classList.add("flipped");
    if (piece !== 0) {
      const disc = document.createElement("span");
      disc.className = `piece ${piece === BLACK ? "black" : "white"}`;
      cell.appendChild(disc);
    }
    homeMiniBoardEl.appendChild(cell);
  });
}

function playHomeOpeningMove() {
  if (homeOpeningPlayed) return;
  homeOpeningPlayed = true;
  homeBoardCueEl.textContent = "Nice. Let's play.";
  homeScreenEl.classList.add("opening-enter");
  playMoveSound();
  renderHomeOpeningPreview();
  clearTimeout(homeOpeningTimer);
  homeOpeningTimer = setTimeout(() => showScreen("game"), 780);
}

function renderBoard() {
  boardEl.innerHTML = "";
  const replay = currentRoom ? replayBoardView() : null;
  const board = replay?.board || (currentRoom ? currentRoom.board : previewBoard);
  if (currentRoom) {
    const viewCounts = board.reduce((acc, piece) => {
      if (piece === BLACK) acc.black += 1;
      if (piece === WHITE) acc.white += 1;
      return acc;
    }, { black: 0, white: 0 });
    blackScoreEl.textContent = viewCounts.black;
    whiteScoreEl.textContent = viewCounts.white;
  }
  const liveView = !currentRoom || boardView.mode === "live";
  const legal = currentRoom && liveView ? (currentRoom.turn === BLACK ? currentRoom.legal.black : currentRoom.legal.white) : [];
  const canMove = currentRoom?.status === "playing" && myColor === currentRoom.turn && liveView;
  const showEngineHints = currentRoom?.mode === "computer" || currentRoom?.status === "complete";
  const best = liveView ? latestAnalysis[0]?.index : boardView.bestIndex;
  const good = liveView ? latestAnalysis[1]?.index : null;
  const liveLastIndex = liveView ? currentRoom?.history?.at(-1)?.index : null;
  const showBestHighlight = boardView.mode === "review" || (analysisToggleEl.checked && showEngineHints);
  const flipIndexes = liveView ? animatedFlipIndexes : new Set();
  board.forEach((piece, index) => {
    const cell = cellEl(index, piece);
    if (flipIndexes.has(index)) cell.classList.add("flipped");
    if (index === (replay?.lastIndex ?? liveLastIndex)) cell.classList.add("last-move");
    if (index === boardView.playedIndex) cell.classList.add("played-review");
    if (legal.includes(index) && moveOptionsToggleEl.checked && canMove) {
      cell.classList.add("legal");
    }
    if (legal.includes(index) && canMove) {
      cell.classList.add("playable");
      cell.addEventListener("click", () => {
        pendingLocalSoundIndex = index;
        playMoveSound();
        send({ type: "move", index });
      });
    }
    if (showBestHighlight && index === best) cell.classList.add("best");
    if (analysisToggleEl.checked && showEngineHints && index === good) cell.classList.add("good");
    boardEl.appendChild(cell);
  });
  if (liveView && animatedFlipIndexes.size) {
    const renderedSet = animatedFlipIndexes;
    setTimeout(() => {
      if (animatedFlipIndexes === renderedSet) animatedFlipIndexes = new Set();
    }, 560);
  }
}

function replayBoardView() {
  if (!currentRoom || boardView.mode === "live") return null;
  const history = currentRoom.history || [];
  const beforeMove = boardView.mode === "review";
  const target = Math.max(0, Math.min(boardView.ply || 0, history.length));
  const applyCount = beforeMove ? Math.max(0, target - 1) : target;
  const board = initialClientBoard();
  for (let i = 0; i < applyCount; i += 1) applyReplayMove(board, history[i]);
  const last = beforeMove ? history[target - 1] : history[applyCount - 1];
  return { board, lastIndex: last?.index ?? null };
}

function applyReplayMove(board, entry) {
  const flips = clientCaptures(board, entry.index, entry.color);
  board[entry.index] = entry.color;
  flips.forEach((flip) => { board[flip] = entry.color; });
}

function cellEl(index, piece) {
  const cell = document.createElement("button");
  cell.className = "cell";
  cell.type = "button";
  cell.setAttribute("aria-label", squareName(index));
  if (piece !== 0) {
    const disc = document.createElement("span");
    disc.className = `piece ${piece === BLACK ? "black" : "white"}`;
    cell.appendChild(disc);
  }
  return cell;
}

function squareName(index) {
  return `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
}

function renderHistory() {
  if (!currentRoom?.history.length) {
    historyEl.className = "history empty";
    historyEl.textContent = "Moves will appear here.";
    return;
  }
  historyEl.className = "history";
  historyEl.innerHTML = "";
  currentRoom.history.forEach((entry, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "move-item";
    if (boardView.mode === "after" && boardView.ply === i + 1) item.classList.add("active");
    item.innerHTML = `<span>${i + 1}. ${entry.color === BLACK ? "Black" : "White"} ${entry.move}</span><span class="tag">${entry.color === BLACK ? "B" : "W"}</span>`;
    item.addEventListener("click", () => showBoardAfterMove(i + 1));
    historyEl.appendChild(item);
  });
  const liveButton = document.createElement("button");
  liveButton.type = "button";
  liveButton.className = "move-item live-position";
  liveButton.innerHTML = "<span>Live position</span><span class=\"tag\">Now</span>";
  liveButton.addEventListener("click", showLiveBoard);
  historyEl.appendChild(liveButton);
}

function showBoardAfterMove(ply) {
  boardView = { mode: "after", ply, bestIndex: null, playedIndex: null };
  renderBoard();
  renderHistory();
  renderBoardViewStatus();
}

function showReviewPosition(row) {
  boardView = { mode: "review", ply: row.turn, bestIndex: moveIndexClient(row.bestMove), playedIndex: moveIndexClient(row.move) };
  renderBoard();
  renderHistory();
  renderBoardViewStatus(row);
}

function renderBoardViewStatus(reviewRow = null) {
  if (!currentRoom || boardView.mode === "live") return;
  const total = currentRoom.history?.length || 0;
  const ply = Math.max(0, Math.min(boardView.ply || 0, total));
  const entry = currentRoom.history?.[ply - 1];
  const distance = Math.max(0, total - ply);
  const ago = distance === 0 ? "current move" : `${distance} move${distance === 1 ? "" : "s"} ago`;
  if (boardView.mode === "review") {
    const row = reviewRow || currentRoom.report?.find((item) => item.turn === ply);
    const best = row?.bestMove ? ` · best ${row.bestMove}` : "";
    statusEl.textContent = `Reviewing ${ply}. ${entry ? `${colorName(entry.color)} ${entry.move}` : "position"} · ${ago}${best}`;
    return;
  }
  statusEl.textContent = `Showing after ${ply}. ${entry ? `${colorName(entry.color)} ${entry.move}` : "starting position"} · ${ago}`;
}

function showLiveBoard() {
  boardView = { mode: "live", ply: null, bestIndex: null, playedIndex: null };
  renderBoard();
  renderHistory();
  renderRoom();
}

function renderAnalysis() {
  if (!analysisToggleEl.checked) {
    analysisEl.className = "analysis empty";
    analysisEl.textContent = "Turn analysis on to see candidate moves.";
    return;
  }
  if (currentRoom && currentRoom.mode !== "computer" && currentRoom.status !== "complete") {
    analysisEl.className = "analysis empty";
    analysisEl.textContent = "Best-move hints are only shown in computer games.";
    return;
  }
  if (!latestAnalysis.length) {
    analysisEl.className = "analysis empty";
    analysisEl.textContent = "No legal moves in this position.";
    return;
  }
  analysisEl.className = "analysis";
  analysisEl.innerHTML = `<div class="engine-source">Using ${latestAnalysisSource}</div>`;
  latestAnalysis.slice(0, 5).forEach((move, i) => {
    const item = document.createElement("div");
    item.className = "analysis-item";
    const score = Number(move.score).toFixed(2);
    item.innerHTML = `<strong>${i + 1}. ${move.move}</strong><span class="tag ${i === 0 ? "best" : i === 1 ? "solid" : ""}">${score}</span>`;
    analysisEl.appendChild(item);
  });
}

function renderReport() {
  const shouldShowReview = currentRoom?.status === "complete" && currentRoom?.report;
  reviewPanelEl.classList.toggle("hidden", !shouldShowReview);
  if (!shouldShowReview) {
    ratingEl.textContent = "Stars appear after the game.";
    reportEl.className = "report empty";
    reportEl.textContent = "Finish a game to see Zebra-backed blunders, good moves, solid moves, and star summaries.";
    return;
  }
  const moves = currentRoom.report.filter((row) => typeof row.turn === "number");
  const blackAvg = averageScore(moves.filter((row) => row.color === BLACK));
  const whiteAvg = averageScore(moves.filter((row) => row.color === WHITE));
  ratingEl.textContent = `Black ${stars(blackAvg)}  White ${stars(whiteAvg)}`;
  reportEl.className = "report";
  reportEl.innerHTML = `<div class="engine-source">Review source: ${currentRoom.analysisSource || moves[0]?.source || "local"}</div>`;
  moves.forEach((row) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "report-item";
    if (boardView.mode === "review" && boardView.ply === row.turn) item.classList.add("active");
    item.innerHTML = `<span>${row.turn}. ${row.color === BLACK ? "Black" : "White"} ${row.move}<br><small>Best: ${row.bestMove} | loss ${Number(row.loss).toFixed(1)}</small></span><span class="tag ${row.label}">${row.label}</span>`;
    item.addEventListener("click", () => showReviewPosition(row));
    reportEl.appendChild(item);
  });
}

function averageScore(rows) {
  if (!rows.length) return 0;
  const labelBoost = { best: 1, good: 0.72, solid: 0.48, mistake: 0.22, blunder: 0.04 };
  return rows.reduce((sum, row) => sum + (labelBoost[row.label] ?? 0.4), 0) / rows.length;
}

function stars(value) {
  const filled = Math.max(1, Math.round(value * 5));
  return "★★★★★".slice(0, filled) + "☆☆☆☆☆".slice(0, 5 - filled);
}

function resetAnalytics() {
  analyticsBoardState = initialClientBoard();
  analyticsTurn = BLACK;
  analyticsHistory = [];
  analyticsMoveTextEl.value = "";
  analyticsSummaryEl.textContent = "Add moves to begin.";
  analyticsReportEl.className = "report empty";
  analyticsReportEl.textContent = "Each clicked move will appear here with best move, loss, and label.";
  renderAnalyticsBoard();
}

function initialClientBoard() {
  const board = Array(64).fill(0);
  board[27] = WHITE;
  board[28] = BLACK;
  board[35] = BLACK;
  board[36] = WHITE;
  return board;
}

function clientCaptures(board, index, color) {
  if (board[index] !== 0) return [];
  const row = Math.floor(index / 8);
  const col = index % 8;
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const result = [];
  dirs.forEach(([dr, dc]) => {
    let r = row + dr;
    let c = col + dc;
    const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const next = r * 8 + c;
      if (board[next] === -color) {
        line.push(next);
      } else {
        if (board[next] === color && line.length) result.push(...line);
        break;
      }
      r += dr;
      c += dc;
    }
  });
  return result;
}

function clientLegalMoves(board, color) {
  const moves = [];
  for (let i = 0; i < 64; i += 1) {
    if (clientCaptures(board, i, color).length) moves.push(i);
  }
  return moves;
}

function applyAnalyticsMove(index) {
  if (!commitAnalyticsMove(index)) return;
  renderAnalyticsBoard();
  queueImportedAnalysis();
}

function commitAnalyticsMove(index, options = {}) {
  const { sound = true } = options;
  let legal = clientLegalMoves(analyticsBoardState, analyticsTurn);
  if (!legal.length && clientLegalMoves(analyticsBoardState, -analyticsTurn).length) {
    analyticsTurn = -analyticsTurn;
    legal = clientLegalMoves(analyticsBoardState, analyticsTurn);
  }
  if (!legal.includes(index)) return false;
  const flips = clientCaptures(analyticsBoardState, index, analyticsTurn);
  const next = analyticsBoardState.slice();
  next[index] = analyticsTurn;
  flips.forEach((flip) => { next[flip] = analyticsTurn; });
  if (sound) playMoveSound();
  analyticsHistory.push({ color: analyticsTurn, index, move: squareName(index) });
  analyticsBoardState = next;
  analyticsTurn = -analyticsTurn;
  analyticsMoveTextEl.value = analyticsHistory.map((move) => move.move).join(" ");
  return true;
}

function renderAnalyticsBoard() {
  if (!analyticsBoardState.length) analyticsBoardState = initialClientBoard();
  analyticsBoardEl.innerHTML = "";
  const counts = analyticsBoardState.reduce((acc, piece) => {
    if (piece === BLACK) acc.black += 1;
    if (piece === WHITE) acc.white += 1;
    return acc;
  }, { black: 0, white: 0 });
  const blackName = analyticsBlackNameEl.value.trim() || "Black";
  const whiteName = analyticsWhiteNameEl.value.trim() || "White";
  analyticsBlackLabelEl.textContent = blackName;
  analyticsWhiteLabelEl.textContent = whiteName;
  analyticsBlackScoreEl.textContent = counts.black;
  analyticsWhiteScoreEl.textContent = counts.white;
  let legal = clientLegalMoves(analyticsBoardState, analyticsTurn);
  let passText = "";
  if (!legal.length && clientLegalMoves(analyticsBoardState, -analyticsTurn).length) {
    passText = `${colorName(analyticsTurn)} has no moves. `;
    analyticsTurn = -analyticsTurn;
    legal = clientLegalMoves(analyticsBoardState, analyticsTurn);
  }
  analyticsStatusEl.textContent = legal.length ? `${passText}${colorName(analyticsTurn)} to move` : `Game over ${counts.black}-${counts.white}`;
  analyticsBoardState.forEach((piece, index) => {
    const cell = cellEl(index, piece);
    if (legal.includes(index)) {
      cell.classList.add("legal", "playable");
      cell.addEventListener("click", () => applyAnalyticsMove(index));
    }
    analyticsBoardEl.appendChild(cell);
  });
  renderAnalyticsMoves();
}

function renderAnalyticsMoves() {
  if (!analyticsHistory.length) {
    analyticsMovesEl.className = "history empty";
    analyticsMovesEl.textContent = "Click a legal square to add moves.";
    return;
  }
  analyticsMovesEl.className = "history";
  analyticsMovesEl.innerHTML = "";
  analyticsHistory.forEach((entry, i) => {
    const item = document.createElement("div");
    item.className = "move-item";
    item.innerHTML = `<span>${i + 1}. ${colorName(entry.color)} ${entry.move}</span><span class="tag">${entry.color === BLACK ? "B" : "W"}</span>`;
    analyticsMovesEl.appendChild(item);
  });
}

function loadAnalyticsMoveText() {
  const moves = analyticsMoveTextEl.value.toLowerCase().match(/[a-h][1-8]/g) || [];
  loadMovesIntoAnalytics(moves);
}

function loadMovesIntoAnalytics(moves, options = {}) {
  const { blackName = "Black", whiteName = "White", summary = "Analyzing saved game..." } = options;
  resetAnalytics();
  if (!moves.length) return;
  analyticsBlackNameEl.value = blackName;
  analyticsWhiteNameEl.value = whiteName;
  analyticsSummaryEl.textContent = summary;
  moves.forEach((move) => commitAnalyticsMove(moveIndexClient(move), { sound: false }));
  analyticsMoveTextEl.value = analyticsHistory.map((move) => move.move).join(" ");
  renderAnalyticsBoard();
  requestImportedAnalysis();
}

function moveIndexClient(move) {
  const col = "abcdefgh".indexOf(move[0]);
  const row = Number(move[1]) - 1;
  return row * 8 + col;
}

function queueImportedAnalysis() {
  clearTimeout(analyticsTimer);
  analyticsTimer = setTimeout(requestImportedAnalysis, 250);
}

function requestImportedAnalysis() {
  const moves = analyticsHistory.map((move) => move.move).join(" ");
  if (!moves) return;
  analyticsSummaryEl.textContent = "Analyzing...";
  send({
    type: "analyze-import",
    moves,
    blackName: analyticsBlackNameEl.value.trim() || "Black",
    whiteName: analyticsWhiteNameEl.value.trim() || "White"
  });
}

function renderImportedAnalysis(review) {
  if (!review || review.error) {
    analyticsSummaryEl.textContent = "Could not analyze.";
    analyticsReportEl.className = "report empty";
    analyticsReportEl.textContent = review?.error || "Check the move list and try again.";
    return;
  }
  const rows = review.report.filter((row) => typeof row.turn === "number");
  const blackAvg = averageScore(rows.filter((row) => row.color === BLACK));
  const whiteAvg = averageScore(rows.filter((row) => row.color === WHITE));
  analyticsSummaryEl.textContent = `${review.players.black} ${stars(blackAvg)}  ${review.players.white} ${stars(whiteAvg)}`;
  analyticsReportEl.className = "report";
  analyticsReportEl.innerHTML = `<div class="engine-source">Review source: ${review.source}</div>`;
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.innerHTML = `<span>${row.turn}. ${colorName(row.color)} ${row.move}<br><small>Best: ${row.bestMove} | loss ${Number(row.loss).toFixed(1)}</small></span><span class="tag ${row.label}">${row.label}</span>`;
    analyticsReportEl.appendChild(item);
  });
}

function renderLobby(data) {
  lobbyOnlinePlayers = data.onlinePlayers || [];
  renderConnectionStatus(`${data.online} online`);
  renderFriends();
  const rooms = data.rooms.filter((room) => room.mode === "online");
  if (!rooms.length) {
    roomListEl.className = "room-list empty";
    roomListEl.textContent = "No open friend rooms yet.";
    return;
  }
  roomListEl.className = "room-list";
  roomListEl.innerHTML = "";
  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "room-item";
    item.innerHTML = `<span>${room.id}<br><small>${room.players}/2 players | ${room.status}</small></span>`;
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "Join";
    button.addEventListener("click", () => joinRoom(room.id));
    item.appendChild(button);
    roomListEl.appendChild(item);
  });
}

function friends() {
  return JSON.parse(localStorage.getItem("othellitFriends") || localStorage.getItem("zebraFriends") || "[]");
}

function saveFriends(list) {
  localStorage.setItem("othellitFriends", JSON.stringify([...new Set(list.filter(Boolean))]));
}

function renderFriends() {
  const list = friends();
  const onlineSet = new Set(lobbyOnlinePlayers);
  const onlineCount = list.filter((friend) => onlineSet.has(friend)).length;
  friendCountEl.textContent = `${onlineCount} online`;
  friendCountLargeEl.textContent = `${onlineCount} online`;
  if (!list.length) {
    friendListEl.className = "friend-list empty";
    friendListEl.textContent = "Add friends by username.";
    friendListLargeEl.className = "friend-list empty";
    friendListLargeEl.textContent = "Add friends by username.";
    return;
  }
  friendListEl.className = "friend-list";
  friendListLargeEl.className = "friend-list";
  friendListEl.innerHTML = "";
  friendListLargeEl.innerHTML = "";
  list.forEach((friend) => {
    const online = onlineSet.has(friend);
    const html = `<span><i class="${online ? "online" : ""}"></i>${friend}</span><small>${online ? "online" : "offline"}</small>`;
    const row = document.createElement("div");
    row.className = "friend-row";
    row.innerHTML = html;
    const largeRow = document.createElement("div");
    largeRow.className = "friend-row";
    largeRow.innerHTML = html;
    friendListEl.appendChild(row);
    friendListLargeEl.appendChild(largeRow);
  });
}

function accounts() {
  return JSON.parse(localStorage.getItem("othellitAccounts") || localStorage.getItem("zebraAccounts") || "[]");
}

function saveAccounts(list) {
  localStorage.setItem("othellitAccounts", JSON.stringify(list));
}

function currentAccount() {
  return JSON.parse(localStorage.getItem("othellitCurrentAccount") || localStorage.getItem("zebraCurrentAccount") || "null");
}

function setCurrentAccount(account) {
  const publicAccount = account ? { username: account.username, email: account.email } : null;
  localStorage.setItem("othellitCurrentAccount", JSON.stringify(publicAccount));
  renderAccount();
}

function renderAccount() {
  const account = currentAccount();
  if (!account) {
    accountStatusEl.textContent = "Guest";
    authToggleEl.textContent = "Log In / Sign Up";
    accountTabsEl.classList.remove("has-profile");
    profileTabEl.classList.add("hidden");
    accountMessageEl.textContent = "Create a local Othellit account to use a username.";
    return;
  }
  accountStatusEl.textContent = account.username;
  authToggleEl.textContent = account.username;
  accountTabsEl.classList.add("has-profile");
  profileTabEl.classList.remove("hidden");
  profileUsernameEl.textContent = account.username;
  profileEmailEl.textContent = account.email;
  profileNewUsernameEl.placeholder = account.username;
  accountMessageEl.textContent = `Signed in as ${account.username}`;
}

function setAccountTab(mode) {
  const signingUp = mode === "signup";
  const signingIn = mode === "signin";
  const profile = mode === "profile";
  signupFormEl.classList.toggle("hidden", !signingUp);
  signinFormEl.classList.toggle("hidden", !signingIn);
  profileFormEl.classList.toggle("hidden", !profile);
  signupTabEl.classList.toggle("active", signingUp);
  signinTabEl.classList.toggle("active", signingIn);
  profileTabEl.classList.toggle("active", profile);
}

function createAccount() {
  const username = signupUsernameEl.value.trim();
  const email = signupEmailEl.value.trim().toLowerCase();
  const password = signupPasswordEl.value;
  if (username.length < 3) {
    accountMessageEl.textContent = "Username needs at least 3 characters.";
    return;
  }
  if (!email.includes("@")) {
    accountMessageEl.textContent = "Enter a valid email.";
    return;
  }
  if (password.length < 8) {
    accountMessageEl.textContent = "Password needs at least 8 characters.";
    return;
  }
  const list = accounts();
  const taken = list.some((account) => account.username.toLowerCase() === username.toLowerCase() || account.email === email);
  if (taken) {
    accountMessageEl.textContent = "That username or email is already saved here.";
    return;
  }
  const account = { username, email, password, createdAt: new Date().toISOString() };
  saveAccounts([...list, account]);
  setCurrentAccount(account);
  setAccountTab("profile");
  authPanelEl.classList.add("hidden");
  signupPasswordEl.value = "";
}

function signIn() {
  const identity = signinIdentityEl.value.trim().toLowerCase();
  const password = signinPasswordEl.value;
  const account = accounts().find((item) => item.username.toLowerCase() === identity || item.email === identity);
  if (!account || account.password !== password) {
    accountMessageEl.textContent = "No local account matched those details.";
    return;
  }
  setCurrentAccount(account);
  setAccountTab("profile");
  signinPasswordEl.value = "";
}

function currentPrivateAccount() {
  const session = currentAccount();
  if (!session) return null;
  return accounts().find((account) => account.email === session.email || account.username === session.username) || null;
}

function updateUsername() {
  const account = currentPrivateAccount();
  const nextUsername = profileNewUsernameEl.value.trim();
  if (!account) {
    accountMessageEl.textContent = "Sign in before editing your account.";
    return;
  }
  if (nextUsername.length < 3) {
    accountMessageEl.textContent = "Username needs at least 3 characters.";
    return;
  }
  const list = accounts();
  const taken = list.some((item) => item.email !== account.email && item.username.toLowerCase() === nextUsername.toLowerCase());
  if (taken) {
    accountMessageEl.textContent = "That username is already saved here.";
    return;
  }
  const updated = { ...account, username: nextUsername };
  saveAccounts(list.map((item) => item.email === account.email ? updated : item));
  setCurrentAccount(updated);
  profileNewUsernameEl.value = "";
  accountMessageEl.textContent = "Username updated.";
}

function updatePassword() {
  const account = currentPrivateAccount();
  const currentPassword = profileCurrentPasswordEl.value;
  const nextPassword = profileNewPasswordEl.value;
  if (!account) {
    accountMessageEl.textContent = "Sign in before editing your account.";
    return;
  }
  if (account.password !== currentPassword) {
    accountMessageEl.textContent = "Current password does not match.";
    return;
  }
  if (nextPassword.length < 8) {
    accountMessageEl.textContent = "New password needs at least 8 characters.";
    return;
  }
  const updated = { ...account, password: nextPassword };
  saveAccounts(accounts().map((item) => item.email === account.email ? updated : item));
  setCurrentAccount(updated);
  profileCurrentPasswordEl.value = "";
  profileNewPasswordEl.value = "";
  accountMessageEl.textContent = "Password updated.";
}

function logout() {
  localStorage.removeItem("othellitCurrentAccount");
  localStorage.removeItem("zebraCurrentAccount");
  renderAccount();
  setAccountTab("signin");
  accountMessageEl.textContent = "Logged out.";
}

function gameHistory() {
  return JSON.parse(localStorage.getItem("othellitGameHistory") || "[]");
}

function saveGameHistory(list) {
  localStorage.setItem("othellitGameHistory", JSON.stringify(list.slice(0, 40)));
}

function maybeRecordGame() {
  if (!currentRoom || currentRoom.status !== "complete" || recordedRooms.has(currentRoom.id)) return;
  const account = currentAccount();
  const black = currentRoom.players.black?.name || "Black";
  const white = currentRoom.players.white?.name || "White";
  const entry = {
    id: currentRoom.id,
    date: new Date().toISOString(),
    mode: currentRoom.mode,
    user: account?.username || "Guest",
    black,
    white,
    score: `${currentRoom.counts.black}-${currentRoom.counts.white}`,
    result: currentRoom.winner === 0 ? "Draw" : `${currentRoom.winner === BLACK ? black : white} won`,
    moves: (currentRoom.history || []).map((move) => move.move),
    source: currentRoom.analysisSource || currentRoom.report?.[0]?.source || "local"
  };
  recordedRooms.add(currentRoom.id);
  localStorage.setItem("othellitRecordedRooms", JSON.stringify([...recordedRooms]));
  saveGameHistory([entry, ...gameHistory()]);
  renderGameHistory();
}

function renderGameHistory() {
  const list = gameHistory();
  if (!list.length) {
    friendGamesEl.className = "game-history empty";
    friendGamesEl.textContent = "Finished computer and friend games will appear here.";
    return;
  }
  friendGamesEl.className = "game-history";
  friendGamesEl.innerHTML = "";
  list.forEach((game) => {
    const row = document.createElement(game.moves?.length ? "button" : "div");
    row.className = "game-row";
    if (game.moves?.length) row.type = "button";
    const when = new Date(game.date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const reviewLabel = game.moves?.length ? "Review" : "Summary";
    row.innerHTML = `<span><strong>${game.mode === "computer" ? "Computer" : "Friend"} game</strong><br><small>${game.black} vs ${game.white} | ${game.score} | ${game.result} | ${when}</small></span><span class="tag">${reviewLabel}</span>`;
    if (game.moves?.length) row.addEventListener("click", () => openSavedGameReview(game));
    friendGamesEl.appendChild(row);
  });
}

function openSavedGameReview(game) {
  showScreen("analytics");
  loadMovesIntoAnalytics(game.moves, {
    blackName: game.black || "Black",
    whiteName: game.white || "White",
    summary: `Loading ${game.black || "Black"} vs ${game.white || "White"}...`
  });
}

function requestAnalysis() {
  if (analysisToggleEl.checked && currentRoom?.status !== "complete" && currentRoom?.mode === "computer") send({ type: "analyze" });
}

function resignCurrentGame() {
  if (!currentRoom) {
    statusEl.textContent = "Join or start a game before resigning.";
    return;
  }
  if (currentRoom.status === "complete") {
    statusEl.textContent = "This game is already finished.";
    return;
  }
  statusEl.textContent = "Resigning...";
  send({ type: "resign" });
  clearResignTimer();
  resignTimeout = setTimeout(() => {
    if (currentRoom?.status === "complete") return;
    statusEl.textContent = "Resign did not finish. Restart the local server, then refresh.";
    showServerWarning("The resign request did not complete, which usually means the running server process is stale. Restart the local server and refresh.");
  }, 1800);
}

function clearResignTimer() {
  if (!resignTimeout) return;
  clearTimeout(resignTimeout);
  resignTimeout = null;
}

document.querySelector("#createRoom").addEventListener("click", () => {
  showScreen("game");
  const code = cleanRoomCode(roomCodeEl.value || freshRoomCode("friend"));
  roomCodeEl.value = code;
  roomEl.textContent = code;
  shareHintEl.textContent = `Share ${roomLink(code)}`;
  joinRoom(code);
});
document.querySelector("#joinRoom").addEventListener("click", () => joinRoom());
document.querySelector("#computerGame").addEventListener("click", startComputerGame);
document.querySelector("#resignGame").addEventListener("click", resignCurrentGame);
document.querySelector("#copyLink").addEventListener("click", async () => {
  const id = currentRoom?.id || cleanRoomCode(roomCodeEl.value || roomEl.textContent);
  if (!id || id === "not-joined") return;
  const link = roomLink(id);
  await navigator.clipboard.writeText(link);
  shareHintEl.textContent = `Copied ${link}`;
});
document.querySelector("#levelPicker").addEventListener("click", (event) => {
  if (!event.target.matches("button")) return;
  selectedLevel = event.target.dataset.level;
  updatePlayPreferenceLabel();
  document.querySelectorAll("#levelPicker button").forEach((button) => button.classList.toggle("active", button === event.target));
});
document.querySelector("#colorPicker").addEventListener("click", (event) => {
  if (!event.target.matches("button")) return;
  selectedColor = normalizeColorChoice(event.target.dataset.color);
  localStorage.setItem("othellitPreferredColor", selectedColor);
  updatePlayPreferenceLabel();
});
document.querySelector("#addFriend").addEventListener("click", () => {
  const friend = friendNameEl.value.trim();
  if (!friend) return;
  saveFriends([...friends(), friend]);
  friendNameEl.value = "";
  renderFriends();
});
document.querySelector("#addFriendLarge").addEventListener("click", () => {
  const friend = friendNameLargeEl.value.trim();
  if (!friend) return;
  saveFriends([...friends(), friend]);
  friendNameLargeEl.value = "";
  renderFriends();
});
document.querySelector("#playNow").addEventListener("click", () => showScreen("game"));
document.querySelector("#homeFriends").addEventListener("click", () => showScreen("friends"));
document.querySelector("#brandHome").addEventListener("click", () => showScreen("home"));
homeMiniBoardEl.addEventListener("click", playHomeOpeningMove);
homeMiniBoardEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  playHomeOpeningMove();
});
gameTabEl.addEventListener("click", () => showScreen("game"));
friendsTabEl.addEventListener("click", () => showScreen("friends"));
analyticsTabEl.addEventListener("click", () => showScreen("analytics"));
authToggleEl.addEventListener("click", () => {
  authPanelEl.classList.toggle("hidden");
});
signupTabEl.addEventListener("click", () => setAccountTab("signup"));
signinTabEl.addEventListener("click", () => setAccountTab("signin"));
profileTabEl.addEventListener("click", () => setAccountTab("profile"));
document.querySelector("#signupButton").addEventListener("click", createAccount);
document.querySelector("#signinButton").addEventListener("click", signIn);
document.querySelector("#updateUsernameButton").addEventListener("click", updateUsername);
document.querySelector("#updatePasswordButton").addEventListener("click", updatePassword);
document.querySelector("#logoutButton").addEventListener("click", logout);
analysisToggleEl.addEventListener("change", () => {
  requestAnalysis();
  renderAnalysis();
  renderBoard();
});
moveOptionsToggleEl.addEventListener("change", renderBoard);
document.querySelector("#loadAnalyticsMoves").addEventListener("click", loadAnalyticsMoveText);
document.querySelector("#resetAnalytics").addEventListener("click", resetAnalytics);
document.querySelector("#analyzeImportedGame").addEventListener("click", requestImportedAnalysis);
analyticsBlackNameEl.addEventListener("input", renderAnalyticsBoard);
analyticsWhiteNameEl.addEventListener("input", renderAnalyticsBoard);

renderBoard();
renderFriends();
renderGameHistory();
resetAnalytics();
updatePlayPreferenceLabel();
showScreen("home");
window.addEventListener("online", () => renderConnectionStatus());
window.addEventListener("offline", () => renderConnectionStatus());
connect();
