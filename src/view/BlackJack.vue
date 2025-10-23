<template>
  <div>
    <h1>Blackjack</h1>

    <div class="hand">
      <strong><span class = "dealer">ディーラー</span></strong>
      <div class="cards">
        <div
          v-for="(c, i) in dealer"
          :key="i"
          class="card"
          :class="{ 'red-suit': !dealerHidden && ['♥', '♦'].includes(c.suit) }"
        >
          {{ i === 0 && dealerHidden ? '？' : cardLabel(c) }}
        </div>
      </div>
      <div>合計: <span>{{ dealerHidden ? '--' : calcScore(dealer) }}</span></div>
    </div>

    <div class="hand">
      <strong><span class = "player">プレイヤー</span></strong>
      <div class="cards">
        <div
          v-for="(c, i) in player"
          :key="i"
          class="card"
          :class="{ 'red-suit': ['♥', '♦'].includes(c.suit) }"
        >
          {{ cardLabel(c) }}
        </div>
      </div>
      <div>合計: <span>{{ calcScore(player) }}</span></div>
    </div>

    <div id="controls">
      <button @click="deal" :disabled="dealDisabled">ディール</button>
      <button @click="hit" :disabled="hitDisabled">ヒット</button>
      <button @click="stand" :disabled="standDisabled">スタンド</button>
      <button @click="resetGame">リセット</button>
    </div>

    <div id="result">{{ result }}</div>
  </div>

  <div id="rule">
    <h2>ルール</h2>
    <h3>遊び方</h3>
    <p>
      ブラックジャックは、プレイヤーとディーラーが互いに山札を引き合い、手札の合計を21に近づけるゲームです。<br>
      手札の合計が21を超えた時点で負けになります。<br>
      ディーラーは手札の合計が17以上になるように引くことを繰り返します。<br>
      プレイヤーはヒット(1枚引く)かスタンド(勝負)を選択できます。<br>
      最終的に手札の合計が21に近い方が勝ちとなります。<br>
    </p>
    <h3>手札の点数について</h3>
    <p>
      A     --> 1 or 11<br>
      J,Q,K --> 10<br>
      2 ~ 9 --> 2 ~ 9<br>
    </p>
    <h3>用語の説明</h3>
    <p>
      ディール：新しくゲームを始める。<br>
      ヒット　：山札から1枚引く。<br>
      スタンド：現在の手札でディーラーと勝負する。<br>
      リセット：初期状態に戻す。<br>
    </p>
  </div>

  <router-link to="/">
    <button>Homeへ遷移</button>
  </router-link>
</template>

<script setup>
import { ref } from 'vue';

const deck = ref([]);
const player = ref([]);
const dealer = ref([]);
const dealerHidden = ref(false);

const result = ref('');
const dealDisabled = ref(false);
const hitDisabled = ref(true);
const standDisabled = ref(true);

// カード作成
function createDeck() {
  const suits = ['♠','♥','♦','♣'];
  const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const d = [];
  for (let s of suits){
    for (let v of values){
      d.push({ suit: s, value: v });
    }
  }
  return d;
}

// シャッフル
function shuffle(d) {
  for (let i = d.length -1; i > 0; i--){
    const j = Math.floor(Math.random() * (i+1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// カードラベル
function cardLabel(c) { return `${c.suit}${c.value}`; }

// 点数計算
function calcScore(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand){
    const v = c.value;
    if (v === 'A'){ total += 11; aces++; }
    else if (['J','Q','K'].includes(v)) total += 10;
    else total += Number(v);
  }
  while (total > 21 && aces > 0){
    total -= 10;
    aces--;
  }
  return total;
}

// 勝敗判定
function decideWinner() {
  const p = calcScore(player.value);
  const d = calcScore(dealer.value);
  let msg = '';

  if (p > 21) msg = 'バースト！ディーラーの勝ち';
  else if (d > 21) msg = 'ディーラーがバースト！プレイヤーの勝ち';
  else if (p === d) msg = '引き分け（プッシュ）';
  else if (p === 21 && player.value.length === 2 && !(d === 21 && dealer.value.length === 2)) msg = 'ブラックジャック！プレイヤーの勝ち';
  else if (d === 21 && dealer.value.length === 2 && !(p === 21 && player.value.length === 2)) msg = 'ディーラー ブラックジャック！';
  else if (p > d) msg = 'プレイヤーの勝ち';
  else msg = 'ディーラーの勝ち';

  result.value = msg;
  dealDisabled.value = false;
}

// ディーラー自動プレイ
function dealerPlay() {
  dealerHidden.value = false;
  while (calcScore(dealer.value) < 17){
    dealer.value.push(deck.value.pop());
  }
  decideWinner();
  hitDisabled.value = true;
  standDisabled.value = true;
}

// ディール
function deal() {
  dealDisabled.value = true;
  deck.value = shuffle(createDeck());
  player.value = [];
  dealer.value = [];
  result.value = '';
  dealerHidden.value = true;

  player.value.push(deck.value.pop());
  dealer.value.push(deck.value.pop());
  player.value.push(deck.value.pop());
  dealer.value.push(deck.value.pop());

  hitDisabled.value = false;
  standDisabled.value = false;

  const playerScore = calcScore(player.value);
  if (playerScore === 21) {
    dealerHidden.value = false;
    result.value = 'ブラックジャック！プレイヤーの勝ち！';
    hitDisabled.value = true;
    standDisabled.value = true;
    dealDisabled.value = false;
  }
}

// ヒット
function hit() {
  player.value.push(deck.value.pop());
  const score = calcScore(player.value);
  if (score > 21){
    dealerHidden.value = false;
    decideWinner();
    hitDisabled.value = true;
    standDisabled.value = true;
    dealDisabled.value = false;
  } else if (score === 21){
    dealerPlay();
  }
}

// スタンド
function stand() {
  dealerPlay();
}

// リセット
function resetGame() {
  deck.value = [];
  player.value = [];
  dealer.value = [];
  dealerHidden.value = false;
  result.value = '';
  hitDisabled.value = true;
  standDisabled.value = true;
  dealDisabled.value = false;
}
</script>

<style scoped>
body {
  font-family: system-ui, -apple-system, "Segoe UI", Meiryo, Arial;
  margin: 20px;
  background: #f9f9f9;
}

h1 {
  text-align: center;
  color: #333;
}

.hand {
  border: 1px solid #ccc;
  padding: 10px;
  margin: 8px 0;
  border-radius: 6px;
  background-color: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.dealer {
  color: #ed6e6eff;
}

.player {
  color: #7494d4ff;
}

.cards {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.card {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #888;
  min-width: 44px;
  text-align: center;
  background: #fff;
}

.red-suit {
  color: red !important; /* !important は既存の .card スタイルより優先させるため */
}

#controls {
  margin-top: 10px;
  text-align: center;
}

button {
  padding: 8px 12px;
  margin: 8px;
  border: none;
  border-radius: 6px;
  background: #afde52ff;
  color: white;
  cursor: pointer;
  transition: 0.2s;
}

button:hover:not(:disabled) {
  background: #afde52ff;
}

button:disabled {
  background: #aaa;
  cursor: not-allowed;
}

#result {
  margin-top: 15px;
  font-weight: 700;
  text-align: center;
  font-size: 1.4em;
  margin-bottom: 15px;
}

#rule {
  text-align: left;
  padding: 20px;
  border: 1px solid #ccc;
}
</style>