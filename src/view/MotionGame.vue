<template>
  <router-link to="/" class="home-link">
    <button>Homeへ遷移</button>
  </router-link>
  <div class="motion-game-container">
    <h2>モーショントラッキング STG</h2>

    <button
      @click="startGame"
      :disabled="gameStatus === 'playing' || gameStatus === 'loading'"
    >
      {{
        gameStatus === "gameover" || gameStatus === "win"
          ? "リトライ"
          : "ゲーム開始"
      }}
    </button>
    <p v-if="gameStatus === 'loading'">画像を読み込み中...</p>

    <div class="game-area">
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="game-video"
      ></video>
      <canvas ref="canvasRef" class="game-canvas"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";

// 型定義
interface Player {
  x: number;
  y: number;
  width: number; // 画像の幅
  height: number; // 画像の高さ
  hitboxRadius: number; // 当たり判定用の円の半径
}

interface Grunt {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hitboxRadius: number;
  speed: number;
  hp: number;
  lastShotTime: number;
  shootCooldown: number;
}

interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  speedX: number;
  lastShotTime: number;
  shootCooldown: number;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hitboxRadius: number;
  speed: number;
}

interface EnemyBullet {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hitboxRadius: number;
  speedX: number;
  speedY: number;
}

type GameStatus = "loading" | "ready" | "playing" | "gameover" | "win";
type GamePhase = "grunt" | "boss";

// 定数
const GAME_WIDTH = 960;
const GAME_HEIGHT = 720;

// Player
const PLAYER_WIDTH = 60; // 画像の幅
const PLAYER_HEIGHT = 60; // 画像の高さ
const PLAYER_HITBOX_RADIUS = 20; // 当たり判定は小さめに設定
const PLAYER_START_HP = 5;
const SHOOT_COOLDOWN = 400;
const PLAYER_HP_GAUGE_WIDTH = 60;
const PLAYER_HP_GAUGE_HEIGHT = 60;

// Bullet
const BULLET_WIDTH = 20;
const BULLET_HEIGHT = 20;
const BULLET_HITBOX_RADIUS = 6;
const BULLET_SPEED = 8;

// Grunt (雑魚)
const GRUNT_WIDTH = 60;
const GRUNT_HEIGHT = 60;
const GRUNT_HITBOX_RADIUS = 20;
const GRUNT_SPAWN_RATE = 0.02;
const GRUNT_SPEED = 2;
const GRUNT_HP = 1;
const GRUNT_SHOOT_COOLDOWN = 2000;

// Boss
const BOSS_SCORE_THRESHOLD = 10;
const BOSS_WIDTH = 300;
const BOSS_HEIGHT = 150;
const BOSS_START_HP = 50;
const BOSS_SPEED_X = 3;
const BOSS_SHOOT_COOLDOWN = 1000;

// Enemy Bullet
const ENEMY_BULLET_WIDTH = 20;
const ENEMY_BULLET_HEIGHT = 20;
const ENEMY_BULLET_HITBOX_RADIUS = 6;
const ENEMY_BULLET_SPEED = 3;

// Boss出現アニメーション用
const FLASH_TOTAL_DURATION = 700; //ミリ秒

// ViteのBASE_URLを取得(ローカルの場合：'/'、GitHub Pagesの場合：'/<リポジトリ名>/')
const BASE_URL = import.meta.env.BASE_URL;

// 画像アセットのパス
const ASSET_PATHS = {
  player: `${BASE_URL}images/player.png`,
  grunt: `${BASE_URL}images/grunt.png`,
  boss: `${BASE_URL}images/boss.png`,
  bullet: `${BASE_URL}images/bullet.png`,
  enemyBullet: `${BASE_URL}images/enemy_bullet.png`,
  playerHPGauge: `${BASE_URL}images/gauge_heart.png`,
};

// リアクティブな参照
const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const ctxRef = ref<CanvasRenderingContext2D | null>(null);
const gameStatus = ref<GameStatus>("loading");
const gamePhase = ref<GamePhase>("grunt");
const score = ref(0);
const playerHp = ref(PLAYER_START_HP);
const flashDuration = ref(0);

// Image オブジェクト用の ref
const playerImage = ref<HTMLImageElement | null>(null);
const gruntImage = ref<HTMLImageElement | null>(null);
const bossImage = ref<HTMLImageElement | null>(null);
const bulletImage = ref<HTMLImageElement | null>(null);
const enemyBulletImage = ref<HTMLImageElement | null>(null);
const playerHPGaugeImage = ref<HTMLImageElement | null>(null);

// ゲームロジック
const player = ref<Player>({
  x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2, // 画像の中心を合わせるために-width/2
  y: GAME_HEIGHT - PLAYER_HEIGHT - 20, // 画面下部に配置
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  hitboxRadius: PLAYER_HITBOX_RADIUS,
});
const grunts = ref<Grunt[]>([]);
const boss = ref<Boss | null>(null);
const bullets = ref<Bullet[]>([]);
const enemyBullets = ref<EnemyBullet[]>([]);

let detector: poseDetection.PoseDetector | null = null;
let animationFrameId: number | null = null;
let videoStream: MediaStream | null = null;
let lastShotTime = 0;
let entityIdCounter = 0;
let lastFrameTime = 0; //1フレームあたりの経過時間計算用

// 初期化処理 (変更あり：画像読み込みを追加)
onMounted(async () => {
  if (!videoRef.value || !canvasRef.value) return;
  canvasRef.value.width = GAME_WIDTH;
  canvasRef.value.height = GAME_HEIGHT;
  ctxRef.value = canvasRef.value.getContext("2d");
  if (!ctxRef.value) {
    gameStatus.value = "gameover";
    return;
  }

  gameStatus.value = "loading"; // 画像読み込み中はloading
  try {
    // 画像のプリロード
    await preloadImages();

    await tf.setBackend("webgl");
    await setupWebcam();
    await loadMoveNetModel();
    gameStatus.value = "ready"; // 全て準備完了
    detectPoseLoop();
  } catch (error) {
    console.error("初期化に失敗しました:", error);
    gameStatus.value = "gameover";
  }
});

// 画像のプリロード関数 (追加)
const preloadImages = async () => {
  const loadImage = (src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
    });
  };

  try {
    playerImage.value = await loadImage(ASSET_PATHS.player);
    gruntImage.value = await loadImage(ASSET_PATHS.grunt);
    bossImage.value = await loadImage(ASSET_PATHS.boss);
    bulletImage.value = await loadImage(ASSET_PATHS.bullet);
    enemyBulletImage.value = await loadImage(ASSET_PATHS.enemyBullet);
    playerHPGaugeImage.value = await loadImage(ASSET_PATHS.playerHPGauge);
    console.log("全ての画像が読み込まれました。");
  } catch (error) {
    console.error("画像の読み込みに失敗しました:", error);
    throw new Error("画像の読み込みに失敗しました。ゲームを開始できません。");
  }
};

// Webカメラのセットアップ
const setupWebcam = async () => {
  if (!videoRef.value) return;
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: GAME_WIDTH, height: GAME_HEIGHT },
      audio: false,
    });
    videoRef.value.srcObject = videoStream;
    await new Promise((resolve) => {
      if (videoRef.value) {
        videoRef.value.onloadedmetadata = () => resolve(true);
      }
    });
  } catch (err) {
    console.error("Webカメラへのアクセスに失敗しました:", err);
    throw new Error("Webカメラが利用できません。");
  }
};

// MoveNetモデルの読み込み
const loadMoveNetModel = async () => {
  /* (前回のコードと同じ) */
  const model = poseDetection.SupportedModels.MoveNet;

  // public フォルダに置いたモデルのパスを指定
  const modelUrl = "/movenet-model/model.json";

  const detectorConfig: poseDetection.MoveNetModelConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    modelUrl: modelUrl,
  };

  console.log("ローカルモデルを読み込んでいます：", modelUrl);
  detector = await poseDetection.createDetector(model, detectorConfig);
  console.log("ローカルのMoveNetモデルの読み込みが完了しました。");
};

// ゲーム開始処理
const startGame = () => {
  if (gameStatus.value === "playing" || !detector) return;

  score.value = 0;
  playerHp.value = PLAYER_START_HP;
  gamePhase.value = "grunt";

  // プレイヤーの初期位置を再設定 (画像の中心がキーポイントに合うように)
  player.value.x = GAME_WIDTH / 2 - player.value.width / 2;
  player.value.y = GAME_HEIGHT - player.value.height - 20;

  grunts.value = [];
  boss.value = null;
  bullets.value = [];
  enemyBullets.value = [];

  gameStatus.value = "playing";
  lastFrameTime = performance.now();
  gameLoop();
};

// 姿勢検出ループ
const detectPoseLoop = async () => {
  if (!detector || !videoRef.value) {
    if (gameStatus.value !== "gameover" && gameStatus.value !== "win")
      requestAnimationFrame(detectPoseLoop);
    return;
  }
  try {
    const poses = await detector.estimatePoses(videoRef.value);
    if (poses && poses.length > 0) {
      const firstPose = poses[0];
      if (firstPose) {
        const keypoints = firstPose.keypoints;
        const nose = keypoints[0];
        if (nose && nose.score && nose.score > 0.3) {
          // 画像の中心が鼻のキーポイントに合うようにオフセットを調整
          player.value.x = GAME_WIDTH - nose.x - player.value.width / 2;
          player.value.y = nose.y - player.value.height / 2;
        }
      }
    }
  } catch (error) {
    console.error("姿勢検出エラー:", error);
  }
  requestAnimationFrame(detectPoseLoop);
};

// 射撃処理
const shootBullet = (now: number) => {
  if (now - lastShotTime > SHOOT_COOLDOWN) {
    lastShotTime = now;
    bullets.value.push({
      id: entityIdCounter++,
      // プレイヤー画像の中心から弾が出るように調整
      x: player.value.x + player.value.width / 2 - BULLET_WIDTH / 2,
      y: player.value.y,
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      hitboxRadius: BULLET_HITBOX_RADIUS,
      speed: BULLET_SPEED,
    });
  }
};

// メインゲームループ
const gameLoop = () => {
  if (gameStatus.value !== "playing") return;

  const now = performance.now();
  const deltaTime = now - lastFrameTime; //経過時間を計算
  lastFrameTime = now; //最終フレーム時間を更新

  updateGameState(now, deltaTime);
  drawCanvas();
  checkCollisions();

  if (gameStatus.value === "playing") {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
};

// ゲーム状態の更新
const updateGameState = (now: number, deltaTime: number) => {
  shootBullet(now);

  //フラッシュアニメーションの更新
  if (flashDuration.value > 0) {
    flashDuration.value -= deltaTime;
    if (flashDuration.value < 0) {
      flashDuration.value = 0;
    }
  }
  bullets.value = bullets.value
    .map((b) => ({ ...b, y: b.y - b.speed }))
    .filter((b) => b.y > -b.height); // heightを使用

  enemyBullets.value = enemyBullets.value
    .map((b) => ({ ...b, x: b.x + b.speedX, y: b.y + b.speedY }))
    .filter(
      (b) =>
        b.y < GAME_HEIGHT + b.height &&
        b.y > -b.height &&
        b.x > -b.width &&
        b.x < GAME_WIDTH + b.width
    );

  if (gamePhase.value === "grunt") {
    grunts.value = grunts.value
      .map((g) => ({ ...g, y: g.y + g.speed }))
      .filter((g) => g.y < GAME_HEIGHT + g.height); // heightを使用

    grunts.value.forEach((g) => {
      if (now - g.lastShotTime > g.shootCooldown) {
        g.lastShotTime = now;
        gruntShoot(g);
      }
    });

    if (Math.random() < GRUNT_SPAWN_RATE) {
      grunts.value.push({
        id: entityIdCounter++,
        x: Math.random() * (GAME_WIDTH - GRUNT_WIDTH), // 画像の幅を考慮
        y: -GRUNT_HEIGHT, // 画面外上部から出現
        width: GRUNT_WIDTH,
        height: GRUNT_HEIGHT,
        hitboxRadius: GRUNT_HITBOX_RADIUS,
        speed: GRUNT_SPEED,
        hp: GRUNT_HP,
        lastShotTime: now,
        shootCooldown: GRUNT_SHOOT_COOLDOWN + Math.random() * 1000,
      });
    }

    if (score.value >= BOSS_SCORE_THRESHOLD) {
      transitionToBoss();
    }
  } else if (gamePhase.value === "boss") {
    if (boss.value) {
      boss.value.x += boss.value.speedX;
      if (boss.value.x < 0 || boss.value.x + boss.value.width > GAME_WIDTH) {
        boss.value.speedX *= -1;
      }

      if (now - boss.value.lastShotTime > boss.value.shootCooldown) {
        boss.value.lastShotTime = now;
        bossShoot(boss.value);
      }
    }
  }
};

// 雑魚の射撃
const gruntShoot = (grunt: Grunt) => {
  const angle = Math.atan2(player.value.y - grunt.y, player.value.x - grunt.x);

  enemyBullets.value.push({
    id: entityIdCounter++,
    x: grunt.x + grunt.width / 2 - ENEMY_BULLET_WIDTH / 2, // 敵の中心から発射
    y: grunt.y + grunt.height, // 敵の下部から発射
    width: ENEMY_BULLET_WIDTH,
    height: ENEMY_BULLET_HEIGHT,
    hitboxRadius: ENEMY_BULLET_HITBOX_RADIUS,
    speedX: Math.cos(angle) * ENEMY_BULLET_SPEED,
    speedY: Math.sin(angle) * ENEMY_BULLET_SPEED,
  });
};

// ボス戦への移行
const transitionToBoss = () => {
  gamePhase.value = "boss";
  grunts.value = [];
  enemyBullets.value = [];

  boss.value = {
    x: GAME_WIDTH / 2 - BOSS_WIDTH / 2, // 中央に配置
    y: 100,
    width: BOSS_WIDTH,
    height: BOSS_HEIGHT,
    hp: BOSS_START_HP,
    maxHp: BOSS_START_HP,
    speedX: BOSS_SPEED_X,
    lastShotTime: performance.now(),
    shootCooldown: BOSS_SHOOT_COOLDOWN,
  };

  flashDuration.value = FLASH_TOTAL_DURATION; //フラッシュアニメーションをトリガー
};

// ボスの射撃
const bossShoot = (b: Boss) => {
  const bossCenterX = b.x + b.width / 2;
  const bossCenterY = b.y + b.height / 2;

  const baseAngle = Math.atan2(
    player.value.y - bossCenterY,
    player.value.x - bossCenterX
  );

  const angles = [baseAngle - 0.2, baseAngle, baseAngle + 0.2];

  angles.forEach((angle) => {
    enemyBullets.value.push({
      id: entityIdCounter++,
      x: bossCenterX - ENEMY_BULLET_WIDTH / 2, // ボスの中心から
      y: bossCenterY + b.height / 2 - ENEMY_BULLET_HEIGHT / 2, // ボスの下部から発射
      width: ENEMY_BULLET_WIDTH,
      height: ENEMY_BULLET_HEIGHT,
      hitboxRadius: ENEMY_BULLET_HITBOX_RADIUS,
      speedX: Math.cos(angle) * ENEMY_BULLET_SPEED,
      speedY: Math.sin(angle) * ENEMY_BULLET_SPEED,
    });
  });
};

// Canvasの描画
const drawCanvas = () => {
  if (!ctxRef.value || !canvasRef.value) return;
  const ctx = ctxRef.value;
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // プレイヤー
  if (playerImage.value) {
    ctx.drawImage(
      playerImage.value,
      player.value.x,
      player.value.y,
      player.value.width,
      player.value.height
    );
  } else {
    // 画像がない場合の代替描画 (デバッグ用)
    ctx.fillStyle = "blue";
    ctx.fillRect(
      player.value.x,
      player.value.y,
      player.value.width,
      player.value.height
    );
  }

  // 雑魚
  if (gruntImage.value) {
    grunts.value.forEach((g) => {
      ctx.drawImage(gruntImage.value!, g.x, g.y, g.width, g.height);
    });
  } else {
    ctx.fillStyle = "red";
    grunts.value.forEach((g) => {
      ctx.fillRect(g.x, g.y, g.width, g.height);
    });
  }

  // ボス
  if (boss.value) {
    const b = boss.value;
    if (bossImage.value) {
      ctx.drawImage(bossImage.value, b.x, b.y, b.width, b.height);
    } else {
      ctx.fillStyle = "purple";
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // ボスHPバー (画像とは関係なく描画)
    ctx.fillStyle = "red";
    ctx.fillRect(b.x, b.y - 20, b.width, 10);
    ctx.fillStyle = "lime";
    ctx.fillRect(b.x, b.y - 20, b.width * (b.hp / b.maxHp), 10);
  }

  //プレイヤーHP(画像とは関係なく描画)
  for (let i = 0; i < playerHp.value; i++) {
    if (playerHPGaugeImage.value) {
      ctx.drawImage(
        playerHPGaugeImage.value,
        10 + i * 40,
        10,
        PLAYER_HP_GAUGE_WIDTH,
        PLAYER_HP_GAUGE_HEIGHT
      );
    } else {
      ctx.fillStyle = "pink";
      ctx.fillRect(
        10 + i * 40,
        10,
        PLAYER_HP_GAUGE_WIDTH,
        PLAYER_HP_GAUGE_HEIGHT
      );
    }
  }

  // スコア表示(右上)
  ctx.font = "40px DotGothic16";
  ctx.fillStyle = "white";
  ctx.textAlign = "right"; // 右揃え
  ctx.textBaseline = "top"; // 上揃え
  if (gamePhase.value === "grunt") {
    ctx.fillText(
      "ボス出現まで、あと " + (BOSS_SCORE_THRESHOLD - score.value),
      GAME_WIDTH - 20,
      10
    );
  } else {
    ctx.fillText("ボスを倒せ！！", GAME_WIDTH - 20, 10);
  }

  // プレイヤーの弾
  if (bulletImage.value) {
    bullets.value.forEach((b) => {
      ctx.drawImage(bulletImage.value!, b.x, b.y, b.width, b.height);
    });
  } else {
    ctx.fillStyle = "white";
    bullets.value.forEach((b) => {
      ctx.fillRect(b.x, b.y, b.width, b.height);
    });
  }

  // 敵の弾
  if (enemyBulletImage.value) {
    enemyBullets.value.forEach((b) => {
      ctx.drawImage(enemyBulletImage.value!, b.x, b.y, b.width, b.height);
    });
  } else {
    ctx.fillStyle = "orange";
    enemyBullets.value.forEach((b) => {
      ctx.fillRect(b.x, b.y, b.width, b.height);
    });
  }

  // フラッシュアニメーション
  if (flashDuration.value > 0) {
    //残り時間に応じて透明度計算(1から0へ)
    const opacity = flashDuration.value / FLASH_TOTAL_DURATION;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  // ゲームオーバー・クリアメッセージ
  if (gameStatus.value === "gameover") {
    drawTextOverlay("GAME OVER", "red");
  } else if (gameStatus.value === "win") {
    drawTextOverlay("GAME CLEAR!", "gold");
  }
};

// 衝突判定
const checkCollisions = () => {
  // プレイヤーの弾 vs 敵 (円同士の判定)
  for (const bullet of bullets.value) {
    // vs 雑魚
    for (const grunt of grunts.value) {
      if (isColliding(bullet, grunt)) {
        // 衝突判定に hitBoxRadius を使用
        grunt.hp--;
        if (grunt.hp <= 0) {
          grunts.value = grunts.value.filter((g) => g.id !== grunt.id);
          score.value++;
        }
        bullets.value = bullets.value.filter((b) => b.id !== bullet.id);
        break;
      }
    }

    // vs ボス
    if (boss.value) {
      const b = boss.value;
      // 弾 (円) vs ボス (四角) の簡易判定
      // 弾の中心がボスの四角形内に入っているかをざっくり判定
      if (
        bullet.x + bullet.width / 2 > b.x &&
        bullet.x + bullet.width / 2 < b.x + b.width &&
        bullet.y + bullet.height / 2 > b.y &&
        bullet.y + bullet.height / 2 < b.y + b.height
      ) {
        boss.value.hp--;
        bullets.value = bullets.value.filter((bu) => bu.id !== bullet.id);

        if (boss.value.hp <= 0) {
          gameWin();
          return;
        }
        break;
      }
    }
  }

  // 敵の弾 vs プレイヤー (円同士の判定)
  for (const enemyBullet of enemyBullets.value) {
    if (isColliding(enemyBullet, player.value)) {
      // 衝突判定に hitBoxRadius を使用
      enemyBullets.value = enemyBullets.value.filter(
        (eb) => eb.id !== enemyBullet.id
      );
      playerHp.value--;

      if (playerHp.value <= 0) {
        gameOver();
        return;
      }
      break;
    }
  }
};

// 円同士の衝突判定ヘルパー
const isColliding = (
  entityA: {
    x: number;
    y: number;
    width: number;
    height: number;
    hitboxRadius: number;
  },
  entityB: {
    x: number;
    y: number;
    width: number;
    height: number;
    hitboxRadius: number;
  }
): boolean => {
  // 各エンティティの中心座標を計算
  const centerX_A = entityA.x + entityA.width / 2;
  const centerY_A = entityA.y + entityA.height / 2;
  const centerX_B = entityB.x + entityB.width / 2;
  const centerY_B = entityB.y + entityB.height / 2;

  const distance = Math.sqrt(
    Math.pow(centerX_A - centerX_B, 2) + Math.pow(centerY_A - centerY_B, 2)
  );
  // 当たり判定半径の合計よりも距離が短ければ衝突
  return distance < entityA.hitboxRadius + entityB.hitboxRadius;
};

const drawTextOverlay = (text: string, color: string) => {
  if (!ctxRef.value) return;
  const ctx = ctxRef.value;

  ctx.font = "bold 80px DotGothic16"; //80pxの太字
  ctx.fillStyle = color;
  ctx.textAlign = "center"; //左右中央揃え
  ctx.textBaseline = "middle"; //上下中央揃え

  const x = GAME_WIDTH / 2;
  const y = GAME_HEIGHT / 2;
  ctx.fillText(text, x, y);
};

// ゲームオーバー処理
const gameOver = () => {
  gameStatus.value = "gameover";
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  drawCanvas(); // 最終フレームを描画
};

// ゲームクリア処理 (変更なし)
const gameWin = () => {
  gameStatus.value = "win";
  boss.value = null;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  drawCanvas(); // 最終フレームを描画
};

// クリーンアップ処理 (変更なし)
onUnmounted(() => {
  /* (前回のコードと同じ) */
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }
  if (detector) {
    detector.dispose();
  }
});
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=DotGothic16&display=swap");
.motion-game-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: sans-serif;
}
.game-stats {
  display: flex;
  gap: 20px;
  font-size: 1.2rem;
  font-weight: bold;
}
button {
  padding: 10px 20px;
  font-size: 1rem;
  cursor: pointer;
  margin: 10px;
}
.game-area {
  position: relative;
  width: 960px;
  height: 720px;
  border: 2px solid #333;
  background-color: #000; /* 黒背景 */
  overflow: hidden; /* 画像がはみ出さないように */
}
.game-video {
  width: 100%;
  height: 100%;
  transform: scaleX(-1);
  object-fit: cover;
}
.game-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* デバッグ用にカメラ映像を少し見せる場合は opacity: 0.5; などに */
}

.home-link button {
  font-family: "DotGothic16";
  font-size: 2vh;
  margin: 0;
}
</style>
