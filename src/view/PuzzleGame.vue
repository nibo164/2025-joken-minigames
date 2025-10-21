<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// --- 定数 ---
const BOARD_WIDTH = 6;  // ぷよぷよの標準幅
const BOARD_HEIGHT = 12; // ぷよぷよの標準高さ (見える範囲)
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

// --- 状態 (State) ---

// 盤面 (0: 空, 1-4: ぷよの色)
const board = ref(createEmptyBoard());

// 現在操作中のぷよ (Tsumo)
const activePuyo = ref(createNewPuyo());

// ゲームループのタイマーID
let gameInterval = null;

// ゲームの状態 (0: 待機中/終了, 1: 操作中, 2: 連鎖処理中)
const gameState = ref(0);

// --- ヘルパー関数 ---

// 空の盤面を生成
function createEmptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(PUYO_COLORS.EMPTY));
}

// 新しいぷよを生成 (2個1組)
function createNewPuyo() {
  return {
    // p1 (軸ぷよ)
    p1: {
      x: Math.floor(BOARD_WIDTH / 2) - 1, // 画面中央やや左
      y: 0, // 最上段
      color: Math.floor(Math.random() * COLORS.length) + 1,
    },
    // p2 (子ぷよ)
    p2: {
      x: Math.floor(BOARD_WIDTH / 2) - 1,
      y: 1, // 軸ぷよの下
      color: Math.floor(Math.random() * COLORS.length) + 1,
    },
    // 0: 上, 1: 右, 2: 下, 3: 左 (p2 の p1 に対する相対位置)
    rotationState: 2, // 2 = 下
  };
}

// 座標が盤面内か？
function isValidPos(x, y) {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
}

// 簡易スリープ関数 (連鎖アニメーション用)
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

// 盤面と操作中のブロックを合成して表示用の盤面を作成
const displayBoard = computed(() => {
  // board のディープコピーを作成
  const newBoard = board.value.map(row => [...row]);

  // 操作中ぷよを描画 (連鎖中は描画しない)
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

// --- ゲームロジック (操作) ---

/**
 * 衝突判定
 * 操作中のぷよ2つが指定座標(dx, dy)に移動可能かチェック
 */
function checkCollision(dx, dy) {
  const { p1, p2 } = activePuyo.value;
  const nextP1 = { x: p1.x + dx, y: p1.y + dy };
  const nextP2 = { x: p2.x + dx, y: p2.y + dy };

  // 1. 盤面の底か？
  if (nextP1.y >= BOARD_HEIGHT || nextP2.y >= BOARD_HEIGHT) {
    return true; // 着地
  }
  // 2. 左右の壁か？
  if (nextP1.x < 0 || nextP1.x >= BOARD_WIDTH || nextP2.x < 0 || nextP2.x >= BOARD_WIDTH) {
    return true; // 壁
  }
  // 3. 他に固定されたブロックがあるか？
  if (board.value[nextP1.y][nextP1.x] !== 0) {
    return true; // 固定ぷよ
  }
  if (board.value[nextP2.y][nextP2.x] !== 0) {
    return true; // 固定ぷよ
  }
  
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
    // 衝突したら固定処理へ
    fixPuyo();
  } else {
    // 衝突しなければ、下に移動
    activePuyo.value.p1.y++;
    activePuyo.value.p2.y++;
  }
}

/**
 * 回転処理
 * @param {number} direction - 1 = 右回転, -1 = 左回転
 */
function rotate(direction) {
  if (gameState.value !== 1) return;

  const { p1, rotationState } = activePuyo.value;
  
  // 0: 上, 1: 右, 2: 下, 3: 左
  const nextRotationState = (rotationState + direction + 4) % 4;
  
  let nextP2_x = p1.x;
  let nextP2_y = p1.y;

  switch (nextRotationState) {
    case 0: nextP2_y--; break; // 上
    case 1: nextP2_x++; break; // 右
    case 2: nextP2_y++; break; // 下
    case 3: nextP2_x--; break; // 左
  }

  // --- 回転の衝突判定 ---
  
  // 1. 壁や床にめり込むか？
  if (!isValidPos(nextP2_x, nextP2_y)) {
    // 簡略化のため、回転失敗 (本来は壁キックなどの補正が入る)
    return; 
  }

  // 2. 他の固定ぷよにめり込むか？
  if (board.value[nextP2_y][nextP2_x] !== 0) {
    // 簡略化のため、回転失敗
    return;
  }

  // 回転実行
  activePuyo.value.p2.x = nextP2_x;
  activePuyo.value.p2.y = nextP2_y;
  activePuyo.value.rotationState = nextRotationState;
}


// --- ゲームロジック (固定と連鎖) ---

/**
 * ぷよを盤面に固定し、連鎖処理を開始する
 */
async function fixPuyo() {
  // ゲーム状態を「連鎖中」にし、操作と落下を停止
  gameState.value = 2;
  clearInterval(gameInterval);
  gameInterval = null;

  const { p1, p2 } = activePuyo.value;
  
  // 盤面に書き込む (y座標が小さい方＝上にある方から書き込む)
  const puyos = [p1, p2].sort((a, b) => a.y - b.y);
  
  for (const puyo of puyos) {
     if (isValidPos(puyo.x, puyo.y)) {
        board.value[puyo.y][puyo.x] = puyo.color;
     } else {
        // 1つでも盤面外 (最上段より上) で固定されたらゲームオーバー
        gameOver("ぷよが枠外に溢れました");
        return;
     }
  }
  
  // (描画更新を待つため、少し待機)
  await sleep(50); 

  // 連鎖処理を開始
  await handleChain();

  // ゲームオーバーチェック (左から3列目 = x:2 が埋まったら)
  if (board.value[0][2] !== 0) {
    gameOver("窒息しました");
    return;
  }

  // 連鎖が終了したら、新しいぷよを生成してゲーム再開
  if (gameState.value === 2) { // gameOver で 0 になっていない場合
    activePuyo.value = createNewPuyo();
    gameState.value = 1; // 操作可能に
    gameInterval = setInterval(moveDown, 1000); // 落下再開
  }
}

/**
 * 連鎖処理のメインループ (非同期)
 */
async function handleChain() {
  let chainCount = 0;

  while (true) {
    // 1. 連結判定
    const puyosToClear = findConnections();

    if (puyosToClear.length === 0) {
      // 消えるぷよがなければ連鎖終了
      break;
    }

    chainCount++;
    console.log(`Chain ${chainCount}! Clearing ${puyosToClear.length} puyos.`);

    // 2. ぷよを消去
    clearPuyos(puyosToClear);
    
    // アニメーションのための待機 (消去エフェクト)
    await sleep(300); 

    // 3. ぷよを落下（重力処理）
    applyGravity();

    // アニメーションのための待機 (落下エフェクト)
    await sleep(300);

    // ループの最初に戻り、再度連結判定
  }
}

/**
 * 連結判定 (DFS: 深さ優先探索)
 * 盤面全体をスキャンし、4つ以上連結しているぷよの座標リストを返す
 */
function findConnections() {
  // 訪問済みフラグ
  const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
  // 消去対象のぷよリスト (重複なしで管理)
  const puyosToClearSet = new Set(); 

  // 盤面全体をスキャン
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      
      const color = board.value[y][x];
      
      // 空 or 訪問済み はスキップ
      if (color === PUYO_COLORS.EMPTY || visited[y][x]) {
        continue;
      }

      // --- DFS (深さ優先探索) 開始 ---
      const connectedGroup = []; // この色・この位置からつながるグループ
      const stack = [{ x, y }]; // 探索スタック
      visited[y][x] = true;

      while (stack.length > 0) {
        const current = stack.pop();
        connectedGroup.push(current);

        // 上下左右の4方向をチェック
        const neighbors = [
          { x: current.x, y: current.y - 1 }, // 上
          { x: current.x, y: current.y + 1 }, // 下
          { x: current.x - 1, y: current.y }, // 左
          { x: current.x + 1, y: current.y }, // 右
        ];

        for (const neighbor of neighbors) {
          const { nx, ny } = { nx: neighbor.x, ny: neighbor.y };

          // 盤面内か？ / 訪問済みか？ / 同じ色か？
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

      // グループが4つ以上つながっていたか？
      if (connectedGroup.length >= 4) {
        // 消去対象セットに追加
        connectedGroup.forEach(puyo => puyosToClearSet.add(`${puyo.x},${puyo.y}`));
      }
    }
  }
  
  // Set を {x, y} オブジェクトの配列に変換して返す
  return Array.from(puyosToClearSet).map(coord => {
    const [x, y] = coord.split(',').map(Number);
    return { x, y };
  });
}

/**
 * ぷよの消去
 * @param {Array} puyosToClear - 消去対象の {x, y} 座標リスト
 */
function clearPuyos(puyosToClear) {
  for (const puyo of puyosToClear) {
    board.value[puyo.y][puyo.x] = PUYO_COLORS.EMPTY;
  }
}

/**
 * 重力処理 (ぷよの落下)
 * 盤面全体をスキャンし、宙に浮いたぷよを下に落とす
 */
function applyGravity() {
  // 各「列」ごとに処理する
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const column = [];
    // 1. 列からぷよだけを抽出する (空マスは除く)
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (board.value[y][x] !== PUYO_COLORS.EMPTY) {
        column.push(board.value[y][x]);
      }
    }
    
    // 2. 盤面の列を一度空にする
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      board.value[y][x] = PUYO_COLORS.EMPTY;
    }

    // 3. 抽出したぷよを、列の「下」から詰めて配置し直す
    let writeIndex = BOARD_HEIGHT - 1;
    while(column.length > 0) {
      const puyoColor = column.pop(); // 元々上の方にあったぷよから取り出す
      board.value[writeIndex][x] = puyoColor;
      writeIndex--;
    }
  }
}

// --- ゲーム制御 ---

// ゲームオーバー処理
function gameOver(message = "Game Over") {
  alert(message);
  clearInterval(gameInterval);
  gameInterval = null;
  gameState.value = 0; // 待機状態
}

// ゲーム開始
function startGame() {
  if (gameState.value !== 0) return; // プレイ中は無効
  board.value = createEmptyBoard();
  activePuyo.value = createNewPuyo();
  gameState.value = 1;
  gameInterval = setInterval(moveDown, 1000); // 1秒ごとに自動落下
}


// --- キーボード操作 ---
function handleKeydown(e) {
  if (gameState.value !== 1) { // 操作中以外はキーを受け付けない
    return;
  }
  // 連続入力を防ぐため、キー操作中は一時的に自動落下をリセット（お好みで）
  // clearInterval(gameInterval);
  // gameInterval = setInterval(moveDown, 1000);

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
  clearInterval(gameInterval);
  window.removeEventListener('keydown', handleKeydown);
});

</script>

<template>
  <div class="game-container">
    <h1>Vue Puyo Puyo Clone</h1>
    
    <button @click="startGame" :disabled="gameState !== 0">
      Start Game
    </button>
    
    <div 
      class="game-board"
      :style="{
        gridTemplateRows: `repeat(${BOARD_HEIGHT}, 30px)`,
        gridTemplateColumns: `repeat(${BOARD_WIDTH}, 30px)`,
        width: `${BOARD_WIDTH * 30}px`,
        height: `${BOARD_HEIGHT * 30}px`
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
  margin-top: 20px;
}

.game-container {
  text-align: center;
}

.game-board {
  display: grid;
  border: 3px solid #333;
  background-color: #1a1a1a; /* 暗い背景 */
  margin-top: 10px;
  /* ぷよぷよのグリッド線は通常見えない */
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}

.board-cell {
  width: 30px;
  height: 30px;
  box-sizing: border-box; 
  
  /* ぷよ風の見た目 */
  border-radius: 50%; /* 真円 */
  border: 2px solid rgba(255, 255, 255, 0.3); /* ぷよのフチ */
  transform: scale(0.9); /* セル間にわずかな隙間を作る */
  transition: background-color 0.1s, transform 0.1s;
}

/* 空のセルは非表示にする */
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

button {
  margin-top: 10px;
  margin-bottom: 10px;
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
</style>