<template>
  <router-link to="/" class="home-button-corner">
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
    const PLAYER_SIZE = 5;
    const PLAYER_SPEED = 5;
    const MAX_HP = 5;
    const INITIAL_ENEMY_SPAWN_INTERVAL = 30; // 難易度1の時のスポーン間隔 (フレーム数)
    const BASE_ENEMY_SPEED = 3; // 難易度1の時の基本敵スピード
    const INVULNERABILITY_TIME = 1000;

    // 必殺技の定数
    const SPECIAL_ATTACK_INTERVAL = 10000; // 10秒ごと (ミリ秒)
    const SPECIAL_ATTACK_DURATION = 3000; // 必殺技の継続時間 (3秒)
    // ★ 必殺技のサイドごとの弾数ベース。ここを調整すると全体に影響します。
    const BASE_BULLETS_PER_SIDE = 60;
    // const SPECIAL_BULLET_SPEED = 3; // スピードはロジック内で使われますが、定数化しておきます

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
        '10秒ごとに画面上部からの必殺技発動！(Lv3, 6, 9で発射方向が増える)',
        canvas.width / 2,
        canvas.height / 2 + 90
      );

      ctx.fillText(
        '必殺技の後には難易度が上がり、HPも1回復するぞ！',
        canvas.width / 2,
        canvas.height / 2 + 120
      );
    };

    const drawGameOver = () => {
      ctx.font = '40px Arial';
      ctx.textAlign = 'center';

      if (elapsedTime >= 120000) {
        ctx.fillStyle = 'gold';
        ctx.fillText(
          '制作者越えの強者現る！Σ(･ω･ﾉ)ﾉ！🏆✨',
          canvas.width / 2,
          canvas.height / 2 - 60
        );
        ctx.font = '36px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
      } else if (elapsedTime >= 90000) {
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

      // ★ 修正点: 定数として定義したBASE_BULLETS_PER_SIDEを使用
      // const NUM_BULLETS = 60; // 以前の値
      const SPECIAL_BULLET_SIZE = 5;
      const SPECIAL_BULLET_SPEED = 3.5;

      // レベルに応じて、発射するサイドを決定
      const activeSides = [];
      activeSides.push(0); // ベースは常に上から

      const level = difficultyLevel.value;

      // レベル3以上で右を追加
      if (level >= 3) {
        activeSides.push(1);
      }
      // レベル6以上で左を追加
      if (level >= 6) {
        activeSides.push(2);
      }
      // レベル9以上で下を追加
      if (level >= 9) {
        activeSides.push(3);
      }

      // 弾を生成
      activeSides.forEach((side) => {
        let startX, startY, minAngle, maxAngle;
        let numBullets = BASE_BULLETS_PER_SIDE; // 各サイドの弾数の初期値

        if (side === 0) {
          // 上から下 (ベース数)
          startX = canvas.width / 2;
          startY = 0;
          minAngle = (Math.PI * 1) / 12; // 15度
          maxAngle = (Math.PI * 11) / 12; // 165度
          numBullets = BASE_BULLETS_PER_SIDE;
        } else if (side === 1) {
          // 右から左 (レベル3で追加)
          startX = canvas.width;
          startY = canvas.height / 2;
          minAngle = (Math.PI * 7) / 12; // 105度
          maxAngle = (Math.PI * 17) / 12; // 255度
          // ★ 左右の弾数をベースの75%に設定
          numBullets = Math.floor(BASE_BULLETS_PER_SIDE * 0.8);
        } else if (side === 2) {
          // 左から右 (レベル6で追加)
          startX = 0;
          startY = canvas.height / 2;
          minAngle = (Math.PI * -5) / 12; // -75度 (285度)
          maxAngle = (Math.PI * 5) / 12; // 75度
          // ★ 左右の弾数をベースの75%に設定
          numBullets = Math.floor(BASE_BULLETS_PER_SIDE * 0.8);
        } else if (side === 3) {
          // 下から上 (レベル9で追加)
          startX = canvas.width / 2;
          startY = canvas.height;
          minAngle = (Math.PI * 13) / 12; // 195度
          maxAngle = (Math.PI * 23) / 12; // 345度
          // ★ 下の弾数をベースの50%に設定
          numBullets = Math.floor(BASE_BULLETS_PER_SIDE * 0.5);
        }

        // 各サイドで弾を生成
        for (let i = 0; i < numBullets; i++) {
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
      });

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

      // 10秒ごとの必殺技チェック
      timeUntilNextSpecial.value = nextSpecialTime - now;

      if (now - specialAttackTimer > SPECIAL_ATTACK_INTERVAL) {
        activateSpecialAttack();
        return;
      }

      if (frameCount % enemySpawnInterval === 0) {
        const rand = Math.random();
        // 0:上から, 1:左から, 2:右から (上からの敵を多めに)
        const spawnSide = Math.floor(Math.random() * 3);
        let enemyData = {};
        const ENEMY_SIZE = 10;
        const difficultyMultiplier = 1 + (difficultyLevel.value - 1) * 0.2;
        const ENEMY_SPEED =
          (BASE_ENEMY_SPEED + Math.random() * 3) * difficultyMultiplier;

        if (rand < 0.15) {
          // 爆弾タイプの敵
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
          // 通常の敵
          if (spawnSide === 0) {
            // 上から出現
            enemyData = {
              x: Math.random() * (canvas.width - ENEMY_SIZE),
              y: -ENEMY_SIZE,
              size: ENEMY_SIZE,
              speedX: 0,
              speedY: ENEMY_SPEED,
              type: 'normal',
            };
          } else if (spawnSide === 1) {
            // 左から出現 (縦移動を追加して安全地帯を解消)
            const randomSpeedY = (Math.random() - 0.5) * ENEMY_SPEED * 0.5;
            enemyData = {
              x: -ENEMY_SIZE,
              y: Math.random() * (canvas.height - ENEMY_SIZE),
              size: ENEMY_SIZE,
              speedX: ENEMY_SPEED * 0.8,
              speedY: randomSpeedY,
            };
          } else {
            // 右から出現 (縦移動を追加して安全地帯を解消)
            const randomSpeedY = (Math.random() - 0.5) * ENEMY_SPEED * 0.5;
            enemyData = {
              x: canvas.width,
              y: Math.random() * (canvas.height - ENEMY_SIZE),
              size: ENEMY_SIZE,
              speedX: -ENEMY_SPEED * 0.8,
              speedY: randomSpeedY,
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
              speedX: (Math.random() - 0.5) * 5,
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
          currentEnemy.y > canvas.height + 50 ||
          currentEnemy.y < -currentEnemy.size - 50;
        const isOutOfBoundsX =
          currentEnemy.x > canvas.width + 50 ||
          currentEnemy.x < -currentEnemy.size - 50;

        // 敵が画面外に出たら削除
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
/*
  【キャンバス表示エリアの設定】
  ゲームエリア全体を画面に固定し、キャンバスをその中に配置
*/
.game-container {
  margin: 0;
  overflow: hidden; /* スクロールを禁止 */
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh; /* ビューポートの高さ全体 */
  width: 100vw; /* ビューポートの幅全体 */
  background-color: #f0f0f0;
  position: fixed; /* ゲーム画面全体を固定 */
  top: 0;
  left: 0;
  z-index: 1; /* キャンバスはレイヤー1 */
}

canvas {
  border: 2px solid #333;
  background-color: #fff;
  width: 100vw;
  height: 100vh;
}

/* 【ホームボタン位置の修正】
  ホームボタンをHP表示の右隣 (より上) に固定配置
*/
.home-button-corner {
  /* ボタンコンテナを画面上に固定 */
  position: fixed;
  /* HP表示 (Y座標 30px) の隣に配置 */
  top: 25px; /* HP表示の縦位置に合わせるため、25pxに設定 */
  left: 60px; /* HP表示の横幅の後に配置 */
  z-index: 10; /* キャンバスより前面 (z-index: 1) に表示 */
}

.home-button-corner button {
  padding: 5px 10px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid #333;
  background-color: #eee;
  color: #333;
  border-radius: 4px;
}
</style>
