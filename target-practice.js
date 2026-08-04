const range = document.getElementById("range");
const startScreen = document.getElementById("start-screen");
const endScreen = document.getElementById("end-screen");
const startButton = document.getElementById("start-button");
const replayButton = document.getElementById("replay-button");
const soundButton = document.getElementById("sound-button");
const scoreDisplay = document.getElementById("score");
const timeDisplay = document.getElementById("time");
const streakDisplay = document.getElementById("streak");
const bestDisplay = document.getElementById("best");
const countdownDisplay = document.getElementById("countdown");
const callout = document.getElementById("callout");
const prizeProgress = document.getElementById("prize-progress");
const prizeMeterLabel = document.getElementById("prize-meter-label");
const rewardStatus = document.getElementById("reward-status");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardChallenge = document.getElementById("leaderboard-challenge");
const leaderboardSignin = document.getElementById("leaderboard-signin");
const rankStatus = document.getElementById("rank-status");
const crosshair = document.getElementById("crosshair");

const ROUND_SECONDS = 30;
const TARGET_LIFETIME = 1050;
const PRIZE_SCORE = 2000;
const client = window.DONPONLINE_CONFIG?.supabaseUrl && window.supabase
  ? window.supabase.createClient(
      window.DONPONLINE_CONFIG.supabaseUrl,
      window.DONPONLINE_CONFIG.supabasePublishableKey
    )
  : null;
const soundtrack = new Audio("assets/music/a-win-is-a-win.mp3");
soundtrack.loop = true;
soundtrack.volume = 0.4;

let score = 0;
let streak = 0;
let topStreak = 0;
let hits = 0;
let attempts = 0;
let remaining = ROUND_SECONDS;
let gameActive = false;
let soundOn = false;
let gameTimer;
let spawnTimer;
let targetTimer;
let prizeReached = false;
let roundId = null;

const storedBest = Number.parseInt(localStorage.getItem("tp4-best") || "0", 10);
bestDisplay.textContent = formatScore(storedBest);

function formatScore(value) {
  return String(value).padStart(4, "0");
}

function createRoundId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function updateStats() {
  scoreDisplay.textContent = formatScore(score);
  timeDisplay.textContent = String(remaining).padStart(2, "0");
  streakDisplay.textContent = `${streak}×`;
  const progress = Math.min(100, (score / PRIZE_SCORE) * 100);
  prizeProgress.style.width = `${progress}%`;
  prizeMeterLabel.textContent = score >= PRIZE_SCORE ? "PRIZE UNLOCKED" : `${score.toLocaleString()} / ${PRIZE_SCORE.toLocaleString()}`;
  if (score >= PRIZE_SCORE && !prizeReached) {
    prizeReached = true;
    showCallout("5 COINS UNLOCKED");
    range.classList.add("prize-burst");
    setTimeout(() => range.classList.remove("prize-burst"), 650);
  }
}

function showCallout(message) {
  callout.textContent = message;
  callout.classList.remove("show");
  void callout.offsetWidth;
  callout.classList.add("show");
}

function playHitTone() {
  if (!soundOn) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(150, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(70, context.currentTime + .08);
  gain.gain.setValueAtTime(.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .09);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + .1);
  oscillator.addEventListener("ended", () => context.close());
}

function createHitBurst(target, gold) {
  const x = target.offsetLeft + target.offsetWidth / 2;
  const y = target.offsetTop + target.offsetHeight / 2;
  for (let i = 0; i < 12; i += 1) {
    const particle = document.createElement("i");
    const angle = (Math.PI * 2 * i) / 12;
    const distance = 50 + Math.random() * 45;
    particle.className = `hit-particle${gold ? " gold" : ""}`;
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    range.appendChild(particle);
    setTimeout(() => particle.remove(), 500);
  }
}

function createPointPop(target, points, gold) {
  const pop = document.createElement("span");
  pop.className = `point-pop${gold ? " gold" : ""}`;
  pop.textContent = `+${points}`;
  pop.style.left = `${target.offsetLeft + target.offsetWidth / 2 - 22}px`;
  pop.style.top = `${target.offsetTop}px`;
  range.appendChild(pop);
  setTimeout(() => pop.remove(), 700);
}

function clearTarget(countMiss = false) {
  const target = range.querySelector(".target");
  if (!target) return;
  target.remove();
  clearTimeout(targetTimer);
  if (countMiss && gameActive) {
    attempts += 1;
    streak = 0;
    updateStats();
  }
}

function spawnTarget() {
  if (!gameActive) return;
  clearTarget(true);
  const target = document.createElement("button");
  target.className = "target";
  target.type = "button";
  target.textContent = "OPP";
  const isGold = Math.random() < .12;
  if (isGold) target.classList.add("gold");
  target.setAttribute("aria-label", isGold ? "Hit bonus skull target" : "Hit skull target");

  const size = Math.min(106, Math.max(68, range.clientWidth * .1));
  const padding = 18;
  const maxX = Math.max(padding, range.clientWidth - size - padding);
  const maxY = Math.max(55, range.clientHeight - size - padding);
  target.style.left = `${padding + Math.random() * (maxX - padding)}px`;
  target.style.top = `${55 + Math.random() * (maxY - 55)}px`;

  target.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!gameActive || target.classList.contains("hit")) return;
    attempts += 1;
    hits += 1;
    streak += 1;
    topStreak = Math.max(topStreak, streak);
    const multiplier = 1 + Math.floor(streak / 5);
    const points = (isGold ? 300 : 100) * multiplier;
    score += points;
    target.classList.add("hit");
    range.classList.remove("flash");
    void range.offsetWidth;
    range.classList.add("flash");
    range.classList.remove("shake");
    void range.offsetWidth;
    range.classList.add("shake");
    createHitBurst(target, isGold);
    createPointPop(target, points, isGold);
    playHitTone();
    if (soundOn) soundtrack.playbackRate = Math.min(1.12, 1 + streak * .004);
    if (isGold) showCallout("GOLD SKULL");
    if (streak === 5) showCallout("HEATING UP");
    if (streak === 10) showCallout("LOCKED IN");
    if (streak > 10 && streak % 5 === 0) showCallout(`${streak} STREAK`);
    updateStats();
    clearTimeout(targetTimer);
    setTimeout(() => target.remove(), 190);
    clearTimeout(spawnTimer);
    spawnTimer = setTimeout(spawnTarget, Math.max(210, 470 - streak * 8));
  });

  range.appendChild(target);
  targetTimer = setTimeout(() => {
    clearTarget(true);
    spawnTimer = setTimeout(spawnTarget, 180);
  }, Math.max(620, TARGET_LIFETIME - hits * 8));
}

function countdown() {
  return new Promise(resolve => {
    let number = 3;
    countdownDisplay.textContent = number;
    const timer = setInterval(() => {
      number -= 1;
      if (number > 0) {
        countdownDisplay.textContent = number;
      } else if (number === 0) {
        countdownDisplay.textContent = "GO";
      } else {
        clearInterval(timer);
        countdownDisplay.textContent = "";
        resolve();
      }
    }, 650);
  });
}

async function startGame() {
  clearInterval(gameTimer);
  clearTimeout(spawnTimer);
  clearTarget();
  score = 0;
  streak = 0;
  topStreak = 0;
  hits = 0;
  attempts = 0;
  remaining = ROUND_SECONDS;
  roundId = createRoundId();
  prizeReached = false;
  rewardStatus.replaceChildren();
  rankStatus.replaceChildren();
  soundtrack.playbackRate = 1;
  gameActive = false;
  startScreen.hidden = true;
  endScreen.hidden = true;
  updateStats();
  if (soundOn) soundtrack.play().catch(() => {});
  await countdown();
  gameActive = true;
  range.classList.add("game-live");
  spawnTarget();
  gameTimer = setInterval(() => {
    remaining -= 1;
    updateStats();
    if (remaining <= 0) endGame();
  }, 1000);
}

function endGame() {
  if (!gameActive) return;
  gameActive = false;
  range.classList.remove("game-live");
  crosshair.classList.remove("visible");
  clearInterval(gameTimer);
  clearTimeout(spawnTimer);
  clearTarget();
  soundtrack.pause();
  const previousBest = Number.parseInt(localStorage.getItem("tp4-best") || "0", 10);
  const isNewBest = score > previousBest;
  const best = Math.max(score, previousBest);
  localStorage.setItem("tp4-best", String(best));
  bestDisplay.textContent = formatScore(best);
  document.getElementById("final-score").textContent = formatScore(score);
  document.getElementById("accuracy").textContent = `${attempts ? Math.round((hits / attempts) * 100) : 0}%`;
  document.getElementById("best-streak").textContent = `${topStreak}×`;
  document.getElementById("result-message").textContent = isNewBest ? "NEW HIGH SCORE. THE RANGE IS YOURS." : "Stay sharp. Run it back and beat your best.";
  endScreen.hidden = false;
  const completedRound = { score, hits, attempts, topStreak, roundId };
  submitLeaderboardScore(completedRound);
  if (score >= PRIZE_SCORE) claimReward(completedRound);
  replayButton.focus();
}

function renderLeaderboard(entries) {
  leaderboardList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "The board is wide open. Sign in and set the first score.";
    leaderboardList.appendChild(empty);
    leaderboardChallenge.textContent = "First place is waiting.";
    return;
  }

  entries.forEach(entry => {
    const row = document.createElement("li");
    const player = document.createElement("div");
    const rank = document.createElement("span");
    const name = document.createElement("strong");
    const accuracyStat = document.createElement("span");
    const streakStat = document.createElement("span");
    const scoreStat = document.createElement("strong");

    row.className = `leaderboard-row${entry.is_current_player ? " current-player" : ""}`;
    player.className = "leaderboard-player";
    rank.className = "leaderboard-rank";
    name.className = "leaderboard-name";
    accuracyStat.className = "leaderboard-stat";
    streakStat.className = "leaderboard-stat";
    scoreStat.className = "leaderboard-score";
    rank.textContent = String(entry.rank).padStart(2, "0");
    name.textContent = entry.display_name;
    accuracyStat.textContent = `${entry.accuracy}%`;
    streakStat.textContent = `${entry.best_streak}×`;
    scoreStat.textContent = Number(entry.best_score).toLocaleString();
    if (entry.is_current_player) {
      const badge = document.createElement("span");
      badge.className = "you-badge";
      badge.textContent = "YOU";
      name.appendChild(badge);
    }
    player.append(rank, name);
    row.append(player, accuracyStat, streakStat, scoreStat);
    leaderboardList.appendChild(row);
  });

  const leader = entries[0];
  leaderboardChallenge.textContent = `Score to beat: ${Number(leader.best_score).toLocaleString()} by ${leader.display_name}.`;
}

async function loadLeaderboard() {
  if (!client) {
    leaderboardList.innerHTML = '<li class="leaderboard-empty">Leaderboard connection is unavailable.</li>';
    leaderboardChallenge.textContent = "Keep your local high score and check back soon.";
    return;
  }
  try {
    const { data, error } = await client.rpc("get_target_practice_leaderboard", { p_limit: 10 });
    if (error) throw error;
    renderLeaderboard(data || []);
    const { data: { user } } = await client.auth.getUser();
    leaderboardSignin.hidden = Boolean(user);
  } catch (error) {
    leaderboardList.innerHTML = '<li class="leaderboard-empty">The leaderboard is warming up.</li>';
    leaderboardChallenge.textContent = "Your score still counts locally.";
  }
}

async function submitLeaderboardScore(round) {
  if (!client) return;
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      leaderboardChallenge.textContent = "Sign in to save this score and challenge the board.";
      const text = document.createTextNode("Want this score on the board? ");
      const link = document.createElement("a");
      link.href = "members.html";
      link.textContent = "Sign in";
      rankStatus.append(text, link);
      return;
    }
    leaderboardChallenge.textContent = "Posting your score…";
    rankStatus.textContent = "POSTING SCORE…";
    const { data, error } = await client.rpc("submit_target_practice_score", {
      p_score: round.score,
      p_hits: round.hits,
      p_attempts: round.attempts,
      p_best_streak: round.topStreak,
      p_duration_ms: ROUND_SECONDS * 1000
    });
    if (error) throw error;
    await loadLeaderboard();
    const nextScore = Number(data?.next_score || 0);
    leaderboardChallenge.textContent = Number(data?.rank) === 1
      ? "You own the #1 spot. Defend the crown."
      : `You are #${data?.rank}. Score ${nextScore.toLocaleString()} to move up.`;
    rankStatus.textContent = Number(data?.rank) === 1
      ? "#1 ON THE BOARD — DEFEND THE CROWN"
      : `RANK #${data?.rank} · NEXT TARGET ${nextScore.toLocaleString()}`;
  } catch (error) {
    leaderboardChallenge.textContent = "This round could not be posted. Run it back.";
    rankStatus.textContent = "SCORE SAVED ON THIS DEVICE";
  }
}

async function claimReward(round) {
  try {
    if (!client) {
      rewardStatus.textContent = "Prize unlocked. Motion Coins connection is unavailable right now.";
      return;
    }
    rewardStatus.textContent = "Checking your Motion Coins prize…";
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      rewardStatus.replaceChildren();
      const text = document.createTextNode("5 COINS UNLOCKED — ");
      const link = document.createElement("a");
      link.href = "members.html";
      link.textContent = "sign in to collect";
      rewardStatus.append(text, link);
      return;
    }
    const { data, error } = await client.rpc("claim_target_practice_reward", {
      p_score: round.score,
      p_hits: round.hits,
      p_duration_ms: ROUND_SECONDS * 1000,
      p_round_id: round.roundId
    });
    if (error) throw error;
    rewardStatus.textContent = data?.status === "already_claimed"
      ? "This round’s 5 coins were already collected. Play again to earn 5 more."
      : `+5 MOTION COINS — new balance: ${Number(data?.balance || 0).toLocaleString()}`;
  } catch (error) {
    rewardStatus.textContent = error.message || "Your prize could not be collected yet.";
  }
}

range.addEventListener("click", (event) => {
  if (!gameActive || event.target !== range && !event.target.classList.contains("range-grid")) return;
  attempts += 1;
  streak = 0;
  showCallout("MISS");
  updateStats();
});

range.addEventListener("pointermove", event => {
  if (!gameActive || event.pointerType === "touch") return;
  const bounds = range.getBoundingClientRect();
  crosshair.style.left = `${event.clientX - bounds.left}px`;
  crosshair.style.top = `${event.clientY - bounds.top}px`;
  crosshair.classList.add("visible");
});

range.addEventListener("pointerleave", () => crosshair.classList.remove("visible"));
range.addEventListener("pointerdown", event => {
  if (!gameActive || event.pointerType === "touch") return;
  crosshair.classList.remove("fire");
  void crosshair.offsetWidth;
  crosshair.classList.add("fire");
});

soundButton.addEventListener("click", () => {
  soundOn = !soundOn;
  soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.textContent = soundOn ? "♪ Sound on" : "♪ Sound off";
  if (gameActive && soundOn) soundtrack.play().catch(() => {});
  if (!soundOn) soundtrack.pause();
});

startButton.addEventListener("click", startGame);
replayButton.addEventListener("click", startGame);
document.addEventListener("keydown", event => {
  if (event.code === "Space" && !gameActive && !countdownDisplay.textContent) {
    event.preventDefault();
    startGame();
  }
});

updateStats();
loadLeaderboard();
