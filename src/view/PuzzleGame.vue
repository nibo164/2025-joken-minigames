<script setup>
// Vue 3 の Composition API で必要な関数をインポート
import { ref, onMounted, onUnmounted, computed } from 'vue';

// --- 定数 ---
// 16x14 マス
const BOARD_WIDTH = 16;
const BOARD_HEIGHT = 14;
const COLORS = [
  '#dc3545', // Red (1)
  '#0d6efd', // Blue (2)
  '#198754', // Green (3)
  '#ffc107', // Yellow (4)
];
const PUYO_COLORS = {
  EMPTY: 0,
  RED: 1,
  BLUE: 2,
  GREEN: 3,
  YELLOW: 4,
};

// 連鎖ボーナス
const CHAIN_BONUS = [
  0, 0, 8, 16, 32, 64, 96, 128, 160, 512
];

// 消去したぷよ1個あたりの基本点
const BASE_SCORE_PER_PUYO = 10;


// --- 状態 (State) ---

// 盤面
const board = ref(createEmptyBoard());

// 現在操作中のぷよ
const activePuyo = ref(createNewPuyo());

// ゲームループのタイマーID
let gameInterval = null;

// ゲームの状態 (0: 待機中/終了, 1: 操作中, 2: 連鎖処理中)
const gameState = ref(0);

// 現在のスコア
const score = ref(0);

// 速度アップ用の変数
const currentFallInterval = ref(1000);
let speedUpInterval = null;

// 時間制限用の変数
const remainingTime = ref(120); // 120秒 = 2分
let timerInterval = null; // カウントダウンタイマーのID

// ★追加: 難易度 (null, 'easy', 'hard')
const difficulty = ref(null);

// --- ヘルパー関数 ---

// 空の盤面を生成
function createEmptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(PUYO_COLORS.EMPTY));
}

// 新しいぷよを生成 (2個1組)
function createNewPuyo() {
  return {
    p1: {
      x: Math.floor(BOARD_WIDTH / 2) - 1, // 新しい幅に対応
      y: 0, 
      color: Math.floor(Math.random() * COLORS.length) + 1,
    },
    p2: {
      x: Math.floor(BOARD_WIDTH / 2) - 1, // 新しい幅に対応
      y: 1, 
      color: Math.floor(Math.random() * COLORS.length) + 1,
    },
    rotationState: 2, // 2 = 下
  };
}

// 座標が盤面内か？
function isValidPos(x, y) {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
}

// 簡易スリープ関数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 色IDからCSSカラーコードを取得
function getCssColor(cellValue) {
  if (cellValue > 0 && cellValue <= COLORS.length) {
    return COLORS[cellValue - 1];
  }
  return 'transparent'; // Empty
}

// --- 描画用の計算プロパティ (Computed) ---

// 盤面と操作中のブロックを合成
const displayBoard = computed(() => {
  const newBoard = board.value.map(row => [...row]);

  if (gameState.value === 1) {
    const { p1, p2 } = activePuyo.value;
    if (isValidPos(p1.x, p1.y)) {
      newBoard[p1.y][p1.x] = p1.color;
    }
    if (isValidPos(p2.x, p2.y)) {
      newBoard[p2.y][p2.x] = p2.color;
    }
  }
  
  return newBoard;
});

// 残り時間をフォーマット (例: 120 -> "2:00", 59 -> "0:59")
const formattedTime = computed(() => {
  const minutes = Math.floor(remainingTime.value / 60);
  const seconds = remainingTime.value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// --- ゲームロジック (操作) ---

// 衝突判定
function checkCollision(dx, dy) {
  const { p1, p2 } = activePuyo.value;
  const nextP1 = { x: p1.x + dx, y: p1.y + dy };
  const nextP2 = { x: p2.x + dx, y: p2.y + dy };

  if (nextP1.y >= BOARD_HEIGHT || nextP2.y >= BOARD_HEIGHT) return true; // 底
  if (nextP1.x < 0 || nextP1.x >= BOARD_WIDTH || nextP2.x < 0 || nextP2.x >= BOARD_WIDTH) return true; // 壁
  if (isValidPos(nextP1.x, nextP1.y) && board.value[nextP1.y][nextP1.x] !== 0) return true;
  if (isValidPos(nextP2.x, nextP2.y) && board.value[nextP2.y][nextP2.x] !== 0) return true;
  
  return false;
}

function moveLeft() {
  if (gameState.value !== 1) return;
  if (!checkCollision(-1, 0)) {
    activePuyo.value.p1.x--;
    activePuyo.value.p2.x--;
  }
}

function moveRight() {
  if (gameState.value !== 1) return;
  if (!checkCollision(1, 0)) {
    activePuyo.value.p1.x++;
    activePuyo.value.p2.x++;
  }
}

function moveDown() {
  if (gameState.value !== 1) return;

  if (checkCollision(0, 1)) {
    fixPuyo(); // 衝突したら固定
  } else {
    activePuyo.value.p1.y++;
    activePuyo.value.p2.y++;
  }
}

// 回転処理
function rotate(direction) {
  if (gameState.value !== 1) return;

  const { p1, rotationState } = activePuyo.value;
  const nextRotationState = (rotationState + direction + 4) % 4;
  
  let nextP2_x = p1.x;
  let nextP2_y = p1.y;

  switch (nextRotationState) {
    case 0: nextP2_y--; break; // 上
    case 1: nextP2_x++; break; // 右
    case 2: nextP2_y++; break; // 下
    case 3: nextP2_x--; break; // 左
  }

  if (!isValidPos(nextP2_x, nextP2_y)) return; // 壁
  if (board.value[nextP2_y][nextP2_x] !== 0) return; // 固定ぷよ

  // 回転実行
  activePuyo.value.p2.x = nextP2_x;
  activePuyo.value.p2.y = nextP2_y;
  activePuyo.value.rotationState = nextRotationState;
}


// --- ゲームロジック (固定と連鎖) ---

// ぷよを盤面に固定
async function fixPuyo() {
  gameState.value = 2; // 連鎖処理中に
  clearInterval(gameInterval);
  gameInterval = null;

  const { p1, p2 } = activePuyo.value;
  const puyos = [p1, p2].sort((a, b) => a.y - b.y);
  
  for (const puyo of puyos) {
     if (isValidPos(puyo.x, puyo.y)) {
        board.value[puyo.y][puyo.x] = puyo.color;
     } else {
        gameOver("ぷよが枠外に溢れました");
        return;
     }
  }
  
  await sleep(50);

  // 連鎖処理を開始
  await handleChain();

  // ゲームオーバーチェック (窒息) 
  const spawnX = Math.floor(BOARD_WIDTH / 2) - 1;
  if (board.value[0][spawnX] !== 0 || board.value[1][spawnX] !== 0) {
    gameOver("窒息しました");
    return;
  }

  // 連鎖が終了したらゲーム再開
  if (gameState.value === 2) { 
    activePuyo.value = createNewPuyo();
    gameState.value = 1; // 操作可能に
    
    // 現在の速度(currentFallInterval)で落下を再開
    gameInterval = setInterval(moveDown, currentFallInterval.value);
  }
}

// 連鎖処理のメインループ
async function handleChain() {
  let chainCount = 0;
  let totalScoreThisTurn = 0; 

  while (true) {
    // 1. 連結判定
    const puyosToClear = findConnections();

    if (puyosToClear.length === 0) {
      break; // 連鎖終了
    }

    chainCount++;
    const puyoCount = puyosToClear.length;

    // --- スコア計算 ---
    const bonus = CHAIN_BONUS[chainCount] || CHAIN_BONUS[CHAIN_BONUS.length - 1];
    const puyoBonus = 0; 
    const totalBonus = Math.max(1, bonus + puyoBonus);
    const scoreThisChain = (puyoCount * BASE_SCORE_PER_PUYO) * totalBonus;
    totalScoreThisTurn += scoreThisChain;
    // --- スコア計算終了 ---

    console.log(`Chain ${chainCount}! Clearing ${puyoCount} puyos.`);

    // 2. ぷよを消去
    clearPuyos(puyosToClear);
    await sleep(300);

    // 3. ぷよを落下
    applyGravity();
    await sleep(300);
  }

  // 合計スコアを反映
  if (totalScoreThisTurn > 0) {
    score.value += totalScoreThisTurn;
  }
}

// 連結判定 (DFS)
function findConnections() {
  const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
  const puyosToClearSet = new Set();

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      
      const color = board.value[y][x];
      if (color === PUYO_COLORS.EMPTY || visited[y][x]) {
        continue;
      }

      // --- DFS 開始 ---
      const connectedGroup = [];
      const stack = [{ x, y }];
      visited[y][x] = true;

      while (stack.length > 0) {
        const current = stack.pop();
        connectedGroup.push(current);

        const neighbors = [
          { x: current.x, y: current.y - 1 }, // 上
          { x: current.x, y: current.y + 1 }, // 下
          { x: current.x - 1, y: current.y }, // 左
          { x: current.x + 1, y: current.y }, // 右
        ];

        for (const neighbor of neighbors) {
          const { nx, ny } = { nx: neighbor.x, ny: neighbor.y };

          if (
            isValidPos(nx, ny) &&
            !visited[ny][nx] &&
            board.value[ny][nx] === color
          ) {
            visited[ny][nx] = true;
            stack.push({ x: nx, y: ny });
          }
        }
      } // --- DFS終了 ---

      if (connectedGroup.length >= 4) {
        connectedGroup.forEach(puyo => puyosToClearSet.add(`${puyo.x},${puyo.y}`));
      }
    }
  }
  
  return Array.from(puyosToClearSet).map(coord => {
    const [x, y] = coord.split(',').map(Number);
    return { x, y };
  });
}

// ぷよの消去
function clearPuyos(puyosToClear) {
  for (const puyo of puyosToClear) {
    board.value[puyo.y][puyo.x] = PUYO_COLORS.EMPTY;
  }
}

// 重力処理
function applyGravity() {
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const column = [];
    // 1. 列からぷよだけを抽出
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (board.value[y][x] !== PUYO_COLORS.EMPTY) {
        column.push(board.value[y][x]);
      }
    }
    
    // 2. 列を一度空にする
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      board.value[y][x] = PUYO_COLORS.EMPTY;
    }

    // 3. ぷよを列の下から配置し直す
    let writeIndex = BOARD_HEIGHT - 1;
    while(column.length > 0) {
      const puyoColor = column.pop();
      board.value[writeIndex][x] = puyoColor;
      writeIndex--;
    }
  }
}

// --- ゲーム制御 ---

// ★追加: 難易度を選択する関数
function setDifficulty(level) {
  if (gameState.value !== 0) return; // ゲーム中は変更不可
  difficulty.value = level;
}

// ゲームオーバー処理
function gameOver(message = "Game Over") {
  alert(message);
  clearInterval(gameInterval);
  clearInterval(speedUpInterval); 
  clearInterval(timerInterval); // カウントダウンタイマーも停止
  gameInterval = null;
  speedUpInterval = null;
  timerInterval = null; 
  gameState.value = 0; // 待機状態
  score.value = 0; 
  difficulty.value = null; // ★追加: 難易度をリセット
}

// ストップボタンの処理
function stopGame() {
  if (gameState.value === 0) return;

  clearInterval(gameInterval);
  clearInterval(speedUpInterval); 
  clearInterval(timerInterval); // カウントダウンタイマーも停止
  gameInterval = null;
  speedUpInterval = null;
  timerInterval = null; 
  gameState.value = 0; 
  score.value = 0; 
  board.value = createEmptyBoard();
  difficulty.value = null; // ★追加: 難易度をリセット
}

// ★変更: ゲーム開始ロジック
function startGame() {
  // 難易度が未選択、またはゲーム中なら開始しない
  if (difficulty.value === null || gameState.value !== 0) return; 
  
  board.value = createEmptyBoard();
  activePuyo.value = createNewPuyo();
  score.value = 0; 
  currentFallInterval.value = 1000; 
  remainingTime.value = 120; // 時間をリセット (120秒)
  gameState.value = 1;

  // 落下タイマーを開始
  gameInterval = setInterval(moveDown, currentFallInterval.value); 

  // ★変更: 速度アップタイマーを、難易度に応じて分岐して開始
  clearInterval(speedUpInterval); 

  if (difficulty.value === 'easy') {
    // 【EASY】: 15秒ごとに 100ms 短縮 (上限 200ms)
    speedUpInterval = setInterval(() => {
      if (currentFallInterval.value > 200) {
        currentFallInterval.value -= 100; 
        clearInterval(gameInterval);
        gameInterval = setInterval(moveDown, currentFallInterval.value);
        console.log(`(Easy) 速度アップ！ 次の間隔: ${currentFallInterval.value}ms`);
      }
    }, 10000); // 10秒ごとに実行

  } else if (difficulty.value === 'hard') {
    // 【HARD】: 1秒ごとに 100ms 短縮 (上限 100ms)
    speedUpInterval = setInterval(() => {
      if (currentFallInterval.value > 100) {
        currentFallInterval.value -= 100; 
        clearInterval(gameInterval);
        gameInterval = setInterval(moveDown, currentFallInterval.value);
        console.log(`(Hard) 速度アップ！ 次の間隔: ${currentFallInterval.value}ms`);
      }
    }, 1000); // 1秒ごとに実行
  }

  // カウントダウンタイマーを開始
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remainingTime.value--;
    if (remainingTime.value <= 0) {
      gameOver("Time's Up!"); // 時間切れでゲームオーバー
    }
  }, 1000); // 1秒ごとに実行
}


// --- キーボード操作 ---
function handleKeydown(e) {
  if (gameState.value !== 1) { 
    return;
  }

  // スクロール防止
  const handledKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'z', 'a', 'x', 's'];
  if (handledKeys.includes(e.key)) {
    e.preventDefault();
  }

  switch (e.key) {
    case 'ArrowLeft':
      moveLeft();
      break;
    case 'ArrowRight':
      moveRight();
      break;
    case 'ArrowDown':
      moveDown();
      break;
    case 'z': // 左回転
    case 'a':
      rotate(-1);
      break;
    case 'x': // 右回転
    case 's':
      rotate(1);
      break;
  }
}

// --- ライフサイクル ---
onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  // 3つすべてのタイマーをクリア
  clearInterval(gameInterval);
  clearInterval(speedUpInterval); 
  clearInterval(timerInterval);
  window.removeEventListener('keydown', handleKeydown);
});

</script>

<template>
  <div class="game-container">
    <h1>Vue Puyo Puyo Clone</h1>
    
    <div class="timer-display">
      Time: {{ formattedTime }}
    </div>

    <div class="score-display">
      Score: {{ score }}
    </div>

    <div class="difficulty-selector">
      <button 
        @click="setDifficulty('easy')"
        :class="{ selected: difficulty === 'easy' }"
        :disabled="gameState !== 0"
        class="easy-button"
      >
        Easy
      </button>
      <button 
        @click="setDifficulty('hard')"
        :class="{ selected: difficulty === 'hard' }"
        :disabled="gameState !== 0"
        class="hard-button"
      >
        Hard
      </button>
    </div>

    <div class="button-group">
      <button @click="startGame" :disabled="gameState !== 0 || difficulty === null">
        Start Game
      </button>
      <button @click="stopGame" :disabled="gameState === 0" class="stop-button">
        Stop Game
      </button>
    </div>
    
    <div 
      class="game-board"
      :style="{
        gridTemplateRows: `repeat(${BOARD_HEIGHT}, 26px)`,
        gridTemplateColumns: `repeat(${BOARD_WIDTH}, 26px)`,
        width: `${BOARD_WIDTH * 26}px`,
        height: `${BOARD_HEIGHT * 26}px`
      }"
    >
      <template v-for="(row, y) in displayBoard" :key="y">
        <div 
          v-for="(cell, x) in row" 
          :key="`${y}-${x}`"
          class="board-cell"
          :style="{ backgroundColor: getCssColor(cell) }"
        >
          </div>
      </template>
    </div>
    
    <div class="controls">
      <p>Left/Right: Move</p>
      <p>Down: Soft Drop</p>
      <p>Z/A: Rotate Left</p>
      <p>X/S: Rotate Right</p>
    </div>

  </div>
</template>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f4f4f4;
  min-height: 100vh;
  margin: 0;
}

.game-container {
  text-align: center;
}

.timer-display {
  font-size: 1.5em;
  font-weight: bold;
  color: #e63946; /* 目立つ赤色 */
  margin: 10px 0;
}

.score-display {
  font-size: 1.5em;
  font-weight: bold;
  color: #333;
  margin: 10px 0;
}

.game-board {
  display: grid;
  border: 3px solid #333;
  background-color: #1a1a1a; 
  margin: 10px auto; 
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}

/* 26px (ぷよサイズ) の設定 */
.board-cell {
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  border-radius: 50%; 
  border: 2px solid rgba(255, 255, 255, 0.3); 
  transform: scale(0.9); 
  transition: background-color 0.1s, transform 0.1s;
}

.board-cell[style*="background-color: transparent"] {
  background-color: transparent !important;
  border: none;
  transform: scale(1);
}

.controls {
  margin-top: 20px;
  font-size: 0.9em;
  color: #555;
}

/* ★追加: 難易度ボタンのグループ */
.difficulty-selector {
  margin-bottom: 10px;
}

.button-group {
  margin-bottom: 10px;
}

button {
  margin: 5px; 
  padding: 10px 20px;
  font-size: 1em;
  font-weight: bold;
  color: white;
  background-color: #42b883; /* Vue Green */
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
}
button:hover {
  background-color: #34966a;
}
button:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}

button.stop-button {
  background-color: #dc3545; /* 赤色 */
}
button.stop-button:hover {
  background-color: #b02a37;
}

/* ★追加: 難易度ボタンのスタイル */
button.easy-button {
  background-color: #0d6efd; /* 青色 */
}
button.easy-button:hover:not(:disabled) {
  background-color: #0b5ed7;
}

button.hard-button {
  background-color: #ffc107; /* 黄色 */
  color: #333;
}
button.hard-button:hover:not(:disabled) {
  background-color: #ffca2c;
}

/* ★追加: 選択された難易度ボタンのスタイル */
button.selected {
  outline: 4px solid #333;
  transform: scale(1.05);
}
</style>