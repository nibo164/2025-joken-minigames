<template>
  <router-link to="/">
    <button>Homeへ遷移</button>
  </router-link>
  <div class="game-container">
    <canvas id="gameCanvas" ref="gameCanvas"></canvas>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';

export default {
  name: 'EvationGame',
  setup() {
    const gameCanvas = ref(null);
    let canvas;
    let ctx;

    // --- 定数 ---
    const PLAYER_SIZE = 10;
    const PLAYER_SPEED = 5;
    const MAX_HP = 5; // 難易度制御の定数
    const INITIAL_ENEMY_SPAWN_INTERVAL = 30; // 難易度1の時のスポーン間隔 (フレーム数)
    const BASE_ENEMY_SPEED = 3; // 難易度1の時の基本敵スピード
    const INVULNERABILITY_TIME = 1000;
    const SPECIAL_ATTACK_INTERVAL = 10000; // 10秒ごと (ミリ秒)
    const SPECIAL_ATTACK_DURATION = 3000; // 必殺技の継続時間 (3秒)

    // --- リアクティブな状態と通常の変数 ---
    let playerX = ref(0);
    let playerY = ref(0);
    let playerHP = ref(MAX_HP);
    let enemies = ref([]);
    let gameOver = ref(false);
    let gameStarted = ref(false);

    let startTime = 0;
    let elapsedTime = 0;
    let finalTimeText = '00:00.000';

    let rightPressed = false;
    let leftPressed = false;
    let upPressed = false;
    let downPressed = false;

    let enemySpawnInterval = INITIAL_ENEMY_SPAWN_INTERVAL;
    let frameCount = 0;
    let lastHitTime = 0;
    let animationFrameId = null;

    let isSpecialAttackActive = ref(false);
    let specialAttackTimer = 0;
    let nextSpecialTime = 0;

    let timeUntilNextSpecial = ref(0);

    let difficultyLevel = ref(1);

    // --- 関数定義 ---

    const resizeCanvas = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!gameStarted.value) {
        playerX.value = canvas.width / 2 - PLAYER_SIZE / 2;
        playerY.value = canvas.height / 2;
      }
    };

    const resetGame = () => {
      resizeCanvas();
      playerX.value = canvas.width / 2 - PLAYER_SIZE / 2;
      playerY.value = canvas.height / 2;
      playerHP.value = MAX_HP;

      enemies.value = [];
      gameOver.value = false;
      rightPressed = false;
      leftPressed = false;
      upPressed = false;
      downPressed = false;
      frameCount = 0;

      difficultyLevel.value = 1;
      enemySpawnInterval = INITIAL_ENEMY_SPAWN_INTERVAL;
      lastHitTime = 0;

      startTime = 0;
      elapsedTime = 0;
      finalTimeText = '00:00.000';

      isSpecialAttackActive.value = false;
      const now = Date.now();
      specialAttackTimer = now;
      nextSpecialTime = now + SPECIAL_ATTACK_INTERVAL;
      timeUntilNextSpecial.value = SPECIAL_ATTACK_INTERVAL;
    };

    const keyDownHandler = (e) => {
      if (e.key === 'Right' || e.key === 'ArrowRight') {
        rightPressed = true;
      } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
        leftPressed = true;
      } else if (e.key === 'Up' || e.key === 'ArrowUp') {
        upPressed = true;
      } else if (e.key === 'Down' || e.key === 'ArrowDown') {
        downPressed = true;
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        if (!gameStarted.value) {
          gameStarted.value = true;
          const now = Date.now();
          startTime = now;
          specialAttackTimer = now;
          nextSpecialTime = now + SPECIAL_ATTACK_INTERVAL;
          rightPressed = false;
          leftPressed = false;
        } else if (gameOver.value) {
          resetGame();
          gameStarted.value = true;
          const now = Date.now();
          startTime = now;
          specialAttackTimer = now;
          nextSpecialTime = now + SPECIAL_ATTACK_INTERVAL;
        }
      }
    };

    const keyUpHandler = (e) => {
      if (e.key === 'Right' || e.key === 'ArrowRight') {
        rightPressed = false;
      } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
        leftPressed = false;
      } else if (e.key === 'Up' || e.key === 'ArrowUp') {
        upPressed = false;
      } else if (e.key === 'Down' || e.key === 'ArrowDown') {
        downPressed = false;
      }
    };

    const formatTime = (ms) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const milliseconds = ms % 1000;

      const minStr = String(minutes).padStart(2, '0');
      const secStr = String(seconds).padStart(2, '0');
      const msStr = String(milliseconds).padStart(3, '0').slice(0, 3);
      return `${minStr}:${secStr}.${msStr}`;
    };

    const formatCountdown = (ms) => {
      const safeMs = Math.max(0, ms);
      const seconds = Math.floor(safeMs / 1000);
      const milliseconds = safeMs % 1000;

      const secStr = String(seconds);
      const msStr = String(milliseconds).padStart(3, '0').slice(0, 3);
      return `${secStr}.${msStr}`;
    };

    // --- 描画関数 ---

    const drawPlayer = () => {
      const currentTime = Date.now();
      const isInvulnerable = currentTime - lastHitTime < INVULNERABILITY_TIME;

      if (isInvulnerable && Math.floor(currentTime / 100) % 2 === 0) {
        ctx.fillStyle = 'lightblue';
      } else {
        ctx.fillStyle = 'blue';
      }
      ctx.fillRect(playerX.value, playerY.value, PLAYER_SIZE, PLAYER_SIZE);
    };

    const drawEnemies = () => {
      enemies.value.forEach((enemy) => {
        if (enemy.type === 'bomb') {
          ctx.fillStyle = 'green';
        } else if (enemy.type === 'special') {
          ctx.fillStyle = 'purple';
        } else {
          ctx.fillStyle = 'red';
        }
        ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);
      });
    };

    const drawSpecialAttackWarning = () => {
      if (isSpecialAttackActive.value) {
        ctx.font = '36px Arial';
        ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.textAlign = 'center';
        ctx.fillText('DANGER!!!', canvas.width / 2, canvas.height * 0.2);
      }
    };

    const drawScoreAndHP = () => {
      ctx.font = '20px Arial';
      ctx.fillStyle = '#333';

      ctx.textAlign = 'left';
      const hpText = 'HP: ' + '❤️'.repeat(playerHP.value);
      ctx.fillText(hpText, 10, 30);

      ctx.fillText(`Lv: ${difficultyLevel.value}`, 10, 60);

      ctx.textAlign = 'right';
      const timeText = formatTime(elapsedTime);
      ctx.fillText('Time: ' + timeText, canvas.width - 10, 30);

      ctx.textAlign = 'center';
      let countdownText = '---';
      if (!isSpecialAttackActive.value) {
        countdownText = formatCountdown(timeUntilNextSpecial.value);
        ctx.fillStyle = timeUntilNextSpecial.value < 3000 ? 'red' : '#333';
      } else {
        countdownText = 'NOW!';
        ctx.fillStyle = 'red';
      }

      ctx.fillText('必殺技カウント: ' + countdownText, canvas.width / 2, 30);
    };

    const drawStartScreen = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.font = '40px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      ctx.fillText('避けるゲーム', canvas.width / 2, canvas.height / 2 - 80);

      ctx.font = '24px Arial';
      ctx.fillStyle = '#555';
      ctx.fillText(
        '↑ ↓ ← → キーで操作',
        canvas.width / 2,
        canvas.height / 2 - 20
      );

      ctx.font = '30px Arial';
      ctx.fillStyle = 'blue';
      ctx.fillText(
        'スペースキーでスタート',
        canvas.width / 2,
        canvas.height / 2 + 40
      );

      ctx.font = '20px Arial';
      ctx.fillStyle = 'darkgreen';
      ctx.fillText(
        '10秒ごとに画面上部からの必殺技発動！画面上部のカウントを確認しよう！',
        canvas.width / 2,
        canvas.height / 2 + 90
      );

      ctx.fillText(
        '必殺技の後には難易度が上がり、HPも1回復するぞ！',
        canvas.width / 2,
        canvas.height / 2 + 120
      );
      ctx.fillText(
        '敵を避け続けて、できるだけ長く生き延びよう！',
        canvas.width / 2,
        canvas.height / 2 + 150
      );
      ctx.fillText(
        '1,2,3分を超えると特別なメッセージが出てくるよ！',
        canvas.width / 2,
        canvas.height / 2 + 180
      );
    };

    const drawGameOver = () => {
      ctx.font = '40px Arial';
      ctx.textAlign = 'center';

      if (elapsedTime >= 180000) {
        ctx.fillStyle = 'gold';
        ctx.fillText(
          '制作者越えの強者現る！Σ(･ω･ﾉ)ﾉ！🏆✨',
          canvas.width / 2,
          canvas.height / 2 - 60
        );
        ctx.font = '36px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      } else if (elapsedTime >= 120000) {
        ctx.fillStyle = 'purple';
        ctx.fillText(
          '制作者もこれには✌(^O^)✌🏆',
          canvas.width / 2,
          canvas.height / 2 - 60
        );
        ctx.font = '36px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      } else if (elapsedTime >= 60000) {
        ctx.fillStyle = 'orange';
        ctx.fillText(
          'おお！1分越え！すごい！🎉',
          canvas.width / 2,
          canvas.height / 2 - 60
        );
        ctx.font = '36px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      } else {
        ctx.fillStyle = 'red';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      }

      ctx.font = '30px Arial';
      ctx.fillStyle = '#333';

      const scoreYOffset = 50;
      ctx.fillText(
        'Time Survived: ' + finalTimeText,
        canvas.width / 2,
        canvas.height / 2 + scoreYOffset
      );

      ctx.font = '26px Arial';
      ctx.fillStyle = 'blue';

      const restartYOffset = 100;
      ctx.fillText(
        'スペースキーでリスタート',
        canvas.width / 2,
        canvas.height / 2 + restartYOffset
      );
    };

    // --- ゲームロジック ---

    const movePlayer = () => {
      if (rightPressed && playerX.value < canvas.width - PLAYER_SIZE) {
        playerX.value += PLAYER_SPEED;
      } else if (leftPressed && playerX.value > 0) {
        playerX.value -= PLAYER_SPEED;
      }
      if (upPressed && playerY.value > 0) {
        playerY.value -= PLAYER_SPEED;
      } else if (downPressed && playerY.value < canvas.height - PLAYER_SIZE) {
        playerY.value += PLAYER_SPEED;
      }
    };

    const activateSpecialAttack = () => {
      isSpecialAttackActive.value = true;
      enemies.value = [];

      const NUM_BULLETS = 60;
      const SPECIAL_BULLET_SIZE = 5;
      const SPECIAL_BULLET_SPEED = 7;
      const startX = canvas.width / 2;
      const startY = 0;

      for (let i = 0; i < NUM_BULLETS; i++) {
        const minAngle = (Math.PI * 1) / 12;
        const maxAngle = (Math.PI * 11) / 12;

        const angle = minAngle + Math.random() * (maxAngle - minAngle);

        const speed = SPECIAL_BULLET_SPEED + Math.random() * 2;

        enemies.value.push({
          x: startX,
          y: startY,
          size: SPECIAL_BULLET_SIZE,
          speedX: Math.cos(angle) * speed,
          speedY: Math.sin(angle) * speed,
          type: 'special',
        });
      }

      setTimeout(() => {
        isSpecialAttackActive.value = false;
        difficultyLevel.value++;

        if (playerHP.value < MAX_HP) {
          playerHP.value++;
        }

        enemySpawnInterval = Math.max(
          5,
          INITIAL_ENEMY_SPAWN_INTERVAL - (difficultyLevel.value - 1) * 5
        );

        const now = Date.now();
        specialAttackTimer = now;
        nextSpecialTime = now + SPECIAL_ATTACK_INTERVAL;

        enemies.value = [];
      }, SPECIAL_ATTACK_DURATION);
    };

    const spawnEnemy = () => {
      const now = Date.now();

      if (isSpecialAttackActive.value) {
        frameCount++;
        return;
      }

      timeUntilNextSpecial.value = nextSpecialTime - now;

      if (now - specialAttackTimer > SPECIAL_ATTACK_INTERVAL) {
        activateSpecialAttack();
        return;
      }

      if (frameCount % enemySpawnInterval === 0) {
        const rand = Math.random();
        const spawnSide = Math.floor(Math.random() * 3);
        let enemyData = {};
        const ENEMY_SIZE = 10;
        const difficultyMultiplier = 1 + (difficultyLevel.value - 1) * 0.2;
        const ENEMY_SPEED =
          (BASE_ENEMY_SPEED + Math.random() * 3) * difficultyMultiplier;

        if (rand < 0.15) {
          enemyData = {
            x: Math.random() * (canvas.width - 50),
            y: -50,
            size: 50,
            speedX: 0,
            speedY:
              (BASE_ENEMY_SPEED + Math.random() * 1.5) * difficultyMultiplier,
            type: 'bomb',
            hasExploded: false,
          };
        } else {
          if (spawnSide === 0) {
            enemyData = {
              x: Math.random() * (canvas.width - ENEMY_SIZE),
              y: -ENEMY_SIZE,
              size: ENEMY_SIZE,
              speedX: 0,
              speedY: ENEMY_SPEED,
              type: 'normal',
            };
          } else if (spawnSide === 1) {
            enemyData = {
              x: -ENEMY_SIZE,
              y: Math.random() * (canvas.height - ENEMY_SIZE),
              size: ENEMY_SIZE,
              speedX: ENEMY_SPEED * 0.8,
              speedY: 0,
            };
          } else {
            enemyData = {
              x: canvas.width,
              y: Math.random() * (canvas.height - ENEMY_SIZE),
              size: ENEMY_SIZE,
              speedX: -ENEMY_SPEED * 0.8,
              speedY: 0,
            };
          }
        }
        enemies.value.push(enemyData);
      }
      frameCount++;
    };

    const updateEnemies = () => {
      for (let i = 0; i < enemies.value.length; i++) {
        if (enemies.value[i].speedX)
          enemies.value[i].x += enemies.value[i].speedX;
        if (enemies.value[i].speedY)
          enemies.value[i].y += enemies.value[i].speedY;

        const currentEnemy = enemies.value[i];

        if (
          currentEnemy.type === 'bomb' &&
          !currentEnemy.hasExploded &&
          currentEnemy.y > canvas.height / 4
        ) {
          const numFragments = 3 + Math.floor(Math.random() * 5);
          for (let j = 0; j < numFragments; j++) {
            enemies.value.push({
              x:
                currentEnemy.x + currentEnemy.size / 2 - 5 + Math.random() * 10,
              y: currentEnemy.y,
              size: 5 + Math.random() * 5,
              speedX: 0,
              speedY: 3 + Math.random() * 3,
              type: 'fragment',
            });
          }
          currentEnemy.hasExploded = true;
          enemies.value.splice(i, 1);
          i--;
          continue;
        }

        const isOutOfBoundsY =
          currentEnemy.y > canvas.height || currentEnemy.y < -currentEnemy.size;
        const isOutOfBoundsX =
          currentEnemy.x > canvas.width || currentEnemy.x < -currentEnemy.size;

        if (isOutOfBoundsY || isOutOfBoundsX) {
          enemies.value.splice(i, 1);
          i--;
        }
      }
    };

    const checkCollision = () => {
      const currentTime = Date.now();
      if (currentTime - lastHitTime < INVULNERABILITY_TIME) {
        return;
      }

      for (let i = 0; i < enemies.value.length; i++) {
        const enemy = enemies.value[i];
        if (
          playerX.value < enemy.x + enemy.size &&
          playerX.value + PLAYER_SIZE > enemy.x &&
          playerY.value < enemy.y + enemy.size &&
          playerY.value + PLAYER_SIZE > enemy.y
        ) {
          playerHP.value -= 1;
          lastHitTime = currentTime;

          if (playerHP.value <= 0) {
            gameOver.value = true;
            finalTimeText = formatTime(elapsedTime);
            cancelAnimationFrame(animationFrameId);
          }
          break; // 衝突したらループを抜ける (1フレーム1ヒットを想定)
        }
      }
    };

    // --- メインゲームループ ---

    const gameLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!gameStarted.value) {
        drawStartScreen();
      } else if (!gameOver.value) {
        elapsedTime = Date.now() - startTime;

        movePlayer();
        spawnEnemy();
        updateEnemies();
        checkCollision();

        drawPlayer();
        drawEnemies();
        drawSpecialAttackWarning();
        drawScoreAndHP();
      } else {
        drawGameOver();
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    // --- ライフサイクルフック ---

    onMounted(() => {
      canvas = gameCanvas.value;
      if (!canvas) return;
      ctx = canvas.getContext('2d');

      resetGame();
      gameLoop();

      document.addEventListener('keydown', keyDownHandler, false);
      document.addEventListener('keyup', keyUpHandler, false);
      window.addEventListener('resize', resizeCanvas);
    });

    onUnmounted(() => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('keydown', keyDownHandler);
      document.removeEventListener('keyup', keyUpHandler);
      window.removeEventListener('resize', resizeCanvas);
    });

    return {
      gameCanvas,
    };
  },
};
</script>

<style scoped>
.game-container {
  margin: 0;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f0f0f0;
}

canvas {
  border: 2px solid #333;
  background-color: #fff;
  width: 100vw;
  height: 100vh;
}
</style>
