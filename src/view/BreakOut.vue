<template>
  <div class="main-content">
    <router-link to="/" class="home-link">
      <button>Homeへ遷移</button>
    </router-link>
    
    <div class="game-container">
      <div id="difficultySelect">
        <h2>難易度を選択</h2>
        <div class="difficulty-buttons">
          <button
            class="difficulty-btn normal"
            :class="{ selected: currentDifficulty === 'normal' }"
            @click="selectDifficulty('normal')"
          >
            普通
          </button>
          <button
            class="difficulty-btn hard"
            :class="{ selected: currentDifficulty === 'hard' }"
            @click="selectDifficulty('hard')"
          >
            難しい
          </button>
          <button
            class="difficulty-btn mystery"
            :class="{ selected: currentDifficulty === 'mystery' }"
            @click="selectDifficulty('mystery')"
          >
            ？？？
          </button>
        </div>
        <div id="difficultyInfo">{{ difficultyInfoText }}</div>
        </div>
        
      <canvas ref="gameCanvas" width="400" height="500"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";

// --- Vueのリアクティブ変数定義 ---
const gameCanvas = ref(null); // canvas要素への参照
let ctx = null; // canvasの描画コンテキスト

const currentDifficulty = ref(null);
const score = ref(0);
const gameOver = ref(false);
const gameClear = ref(false);
const waitingForStart = ref(false);
let gameStarted = false;

// --- ゲームオブジェクトのクラス定義 (変更なし) ---
class Ball {
  // ... (元のHTMLファイルからBallクラスのコードをそのままコピー)
  constructor(x, y, diameter, dx, dy, color) {
    this.x = x;
    this.y = y;
    this.diameter = diameter;
    this.dx = dx;
    this.dy = dy;
    this.baseSpeed = Math.sqrt(dx * dx + dy * dy);
    this.color = color;
    this.gameOver = false;
  }
  update(panelWidth, panelHeight) {
    this.x += this.dx;
    this.y += this.dy;
    if (this.x <= 0) {
      this.x = 0;
      this.dx = -this.dx;
    } else if (this.x + this.diameter >= panelWidth) {
      this.x = panelWidth - this.diameter;
      this.dx = -this.dx;
    }
    if (this.y <= 0) {
      this.y = 0;
      this.dy = -this.dy;
    }
    if (this.y + this.diameter >= panelHeight) {
      this.gameOver = true;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(
      this.x + this.diameter / 2,
      this.y + this.diameter / 2,
      this.diameter / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.diameter,
      height: this.diameter,
    };
  }
  speedUp(factor) {
    this.dx *= factor;
    this.dy *= factor;
    this.baseSpeed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
  }
  setRandomSpeed() {
    const speedMultiplier = 0.5 + Math.random() * 2.5;
    const currentAngle = Math.atan2(this.dy, this.dx);
    const newSpeed = this.baseSpeed * speedMultiplier;
    this.dx = Math.cos(currentAngle) * newSpeed;
    this.dy = Math.sin(currentAngle) * newSpeed;
  }
  isGameOver() {
    return this.gameOver;
  }
}
class Paddle {
  // ... (元のHTMLファイルからPaddleクラスのコードをそのままコピー)
  constructor(x, y, width, height, color) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = 5;
    this.color = color;
  }
  moveLeft() {
    this.x -= this.speed;
  }
  moveRight() {
    this.x += this.speed;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
}
class Block {
  // ... (元のHTMLファイルからBlockクラスのコードをそのままコピー)
  constructor(x, y, width, height, color) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.destroyed = false;
    this.color = color;
  }
  draw(ctx) {
    if (!this.destroyed) {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.strokeStyle = "black";
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
  }
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
}

// --- ゲームの状態管理変数 ---
let ball, paddle;
let blocks = [];
let nextSpeedUpScore = 100;
let leftPressed = false;
let rightPressed = false;
const WIDTH = 400;
const HEIGHT = 500;

// --- Vueの算出プロパティで難易度情報を動的に生成 ---
const difficultyInfoText = computed(() => {
  if (currentDifficulty.value === "normal") return "100点ごとに速度20%アップ";
  if (currentDifficulty.value === "hard") return "100点ごとに速度40%アップ！";
  if (currentDifficulty.value === "mystery")
    return "ブロックを壊すたびに速度がランダム変化！？";
  return "";
});

// --- ゲームロジック (元の関数をVueのリアクティブ変数を使うように修正) ---
function intersects(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

function selectDifficulty(difficulty) {
  currentDifficulty.value = difficulty;
  if (!gameStarted) {
    initGame();
    gameStarted = true;
  } else {
    initGame();
  }
}

function initGame() {
  if (!currentDifficulty.value) return;

  ball = new Ball(WIDTH / 2, HEIGHT / 2, 20, 2, 3, "white");
  paddle = new Paddle(WIDTH / 2 - 50, HEIGHT - 40, 100, 10, "blue");

  blocks = [];
  const rows = 5,
    cols = 8;
  const blockWidth = 40,
    blockHeight = 20;
  const startX = 20,
    startY = 40;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = startX + col * (blockWidth + 5);
      const y = startY + row * (blockHeight + 5);
      blocks.push(new Block(x, y, blockWidth, blockHeight, "red"));
    }
  }

  score.value = 0;
  gameOver.value = false;
  gameClear.value = false;
  nextSpeedUpScore = 100;
  waitingForStart.value = true;
}

function gameLoop() {
  if (!gameStarted || !currentDifficulty.value) {
    requestAnimationFrame(gameLoop);
    return;
  }
  if (gameOver.value || gameClear.value) {
    draw();
    requestAnimationFrame(gameLoop);
    return;
  }

  if (!waitingForStart.value) {
    ball.update(WIDTH, HEIGHT);
  }

  if (leftPressed) {
    paddle.moveLeft();
    if (paddle.x < 0) paddle.x = 0;
  }
  if (rightPressed) {
    paddle.moveRight();
    if (paddle.x + paddle.width > WIDTH) paddle.x = WIDTH - paddle.width;
  }

  if (
    !waitingForStart.value &&
    intersects(ball.getBounds(), paddle.getBounds())
  ) {
    const ballCenterX = ball.x + ball.diameter / 2;
    const paddleCenterX = paddle.x + paddle.width / 2;
    const hitPos = (ballCenterX - paddleCenterX) / (paddle.width / 2);
    ball.dx = hitPos * 4;
    ball.dy = -Math.abs(ball.dy);
  }

  if (!waitingForStart.value) {
    for (let block of blocks) {
      if (!block.destroyed && intersects(ball.getBounds(), block.getBounds())) {
        block.destroyed = true;
        score.value += 10;

        if (currentDifficulty.value === "normal") {
          if (score.value >= nextSpeedUpScore) {
            ball.speedUp(1.2);
            nextSpeedUpScore += 100;
          }
        } else if (currentDifficulty.value === "hard") {
          if (score.value >= nextSpeedUpScore) {
            ball.speedUp(1.4);
            nextSpeedUpScore += 100;
          }
        } else if (currentDifficulty.value === "mystery") {
          ball.setRandomSpeed();
        }

        const ballRect = ball.getBounds();
        const blockRect = block.getBounds();
        const interLeft = Math.max(ballRect.x, blockRect.x);
        const interRight = Math.min(
          ballRect.x + ballRect.width,
          blockRect.x + blockRect.width
        );
        const interTop = Math.max(ballRect.y, blockRect.y);
        const interBottom = Math.min(
          ballRect.y + ballRect.height,
          blockRect.y + blockRect.height
        );
        const interWidth = interRight - interLeft;
        const interHeight = interBottom - interTop;

        if (interWidth < interHeight) {
          ball.dx = -ball.dx;
        } else {
          ball.dy = -ball.dy;
        }
        break;
      }
    }
  }

  if (blocks.every((b) => b.destroyed)) {
    gameClear.value = true;
  }

  if (ball.isGameOver()) {
    gameOver.value = true;
  }

  draw();
  requestAnimationFrame(gameLoop);
}

function draw() {
  if (!ctx) return;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (ball && paddle) {
    ball.draw(ctx);
    paddle.draw(ctx);
  }
  blocks.forEach((block) => block.draw(ctx));

  ctx.fillStyle = "white";
  ctx.font = "16px SansSerif";
  ctx.fillText("Score: " + score.value, 10, 20);

  if (currentDifficulty.value) {
    let diffText = "";
    if (currentDifficulty.value === "normal") diffText = "Normal";
    else if (currentDifficulty.value === "hard") diffText = "Hard";
    else if (currentDifficulty.value === "mystery") diffText = "？？？";
    ctx.fillText("Difficulty: " + diffText, 10, 40);
  }

  if (waitingForStart.value && !gameOver.value && !gameClear.value) {
    ctx.font = "bold 24px SansSerif";
    ctx.fillStyle = "cyan";
    ctx.textAlign = "center";
    ctx.fillText("Press S to Start", WIDTH / 2, HEIGHT / 2);
    ctx.textAlign = "left";
  }

  if (gameOver.value) {
    ctx.font = "bold 36px SansSerif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2);
    ctx.font = "18px SansSerif";
    ctx.fillText("Press R to Retry", WIDTH / 2, HEIGHT / 2 + 40);
    ctx.textAlign = "left";
  }

  if (gameClear.value) {
    ctx.font = "bold 36px SansSerif";
    ctx.fillStyle = "yellow";
    ctx.textAlign = "center";
    ctx.fillText("GAME CLEAR!", WIDTH / 2, HEIGHT / 2);
    ctx.font = "18px SansSerif";
    ctx.fillText("Press R to Retry", WIDTH / 2, HEIGHT / 2 + 40);
    ctx.textAlign = "left";
  }
}

// --- キーボードイベントハンドラ ---
function handleKeyDown(e) {
  if (e.key === "ArrowLeft") leftPressed = true;
  if (e.key === "ArrowRight") rightPressed = true;
  if ((e.key === "s" || e.key === "S") && waitingForStart.value) {
    waitingForStart.value = false;
  }
  if (e.key === "r" || e.key === "R") {
    if (currentDifficulty.value) {
      initGame();
    }
  }
}

function handleKeyUp(e) {
  if (e.key === "ArrowLeft") leftPressed = false;
  if (e.key === "ArrowRight") rightPressed = false;
}

// --- Vueライフサイクルフック ---
onMounted(() => {
  // コンポーネントがマウントされたらcanvasのコンテキストを取得
  ctx = gameCanvas.value.getContext("2d");

  // グローバルなイベントリスナーを登録
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // ゲームループを開始
  gameLoop();
});

onUnmounted(() => {
  // コンポーネントが破棄されるときにイベントリスナーを解除 (メモリリーク防止)
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
});
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=DotGothic16&display=swap");

/* スタイルは元のHTMLからそのままコピー */
.game-container {
  margin: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
}

.main-content {
  display: flex; /* 子要素（ボタンとゲームコンテナ）を横並びにする */
  align-items: flex-start; /* 縦方向のアイテムを上端に揃える */
  min-height: 100vh; /* 画面全体の高さを占める */
  padding: 20px; /* 全体の余白 */
  background: #1a1a1a;
  font-family: "DotGothic16";
}

#difficultySelect {
  margin-bottom: 0px;
  padding: 15px;
  background: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}
#difficultySelect h2 {
  margin: 0 0 15px 0;
  color: #fff;
  text-align: center;
  font-size: 24px;
}
.difficulty-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.difficulty-btn {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s;
  color: white;
}
.difficulty-btn.normal {
  background: #4caf50;
}
.difficulty-btn.normal:hover {
  background: #45a049;
}
.difficulty-btn.hard {
  background: #ff9800;
}
.difficulty-btn.hard:hover {
  background: #e68900;
}
.difficulty-btn.mystery {
  background: linear-gradient(45deg, #9c27b0, #e91e63, #2196f3);
  background-size: 200% 200%;
  animation: gradientShift 3s ease infinite;
}
.difficulty-btn.mystery:hover {
  transform: scale(1.05);
}
@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
.difficulty-btn.selected {
  transform: scale(1.1);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.5);
}
#gameCanvas {
  border: 2px solid #444;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}
#difficultyInfo {
  margin-top: 15px;
  padding: 10px;
  background: #333;
  border-radius: 5px;
  color: #fff;
  text-align: center;
  min-height: 40px;
}
.home-link {
  /* ゲームコンテナの下からの隙間を設定 */
  margin-right: 50px; /* 例として30pxの隙間を設定 */
  margin-top: 15px; /* 上部に少し余白を追加 */
  display: inline-block; /* marginが適用されやすいように設定 (通常はデフォルトで適用されますが念のため) */
}
</style>
