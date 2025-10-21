<template>
<router-link to="/">
    <button>Homeへ遷移</button>
  </router-link>
  <div>
    <h1>Blackjack</h1>

    <div class="hand">
      <strong>ディーラー</strong>
      <div class="cards">
        <div
          v-for="(c, i) in dealer"
          :key="i"
          class="card"
        >
          {{ i === 0 && dealerHidden ? '？' : cardLabel(c) }}
        </div>
      </div>
      <div>合計: <span>{{ dealerHidden ? '--' : calcScore(dealer) }}</span></div>
    </div>

    <div class="hand">
      <strong>プレイヤー</strong>
      <div class="cards">
        <div
          v-for="(c, i) in player"
          :key="i"
          class="card"
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

#controls {
  margin-top: 10px;
  text-align: center;
}

button {
  padding: 8px 12px;
  margin: 4px;
  border: none;
  border-radius: 6px;
  background: #0078d7;
  color: white;
  cursor: pointer;
  transition: 0.2s;
}

button:hover:not(:disabled) {
  background: #005fa3;
}

button:disabled {
  background: #aaa;
  cursor: not-allowed;
}

#result {
  margin-top: 12px;
  font-weight: 700;
  text-align: center;
  font-size: 1.1em;
}
</style>