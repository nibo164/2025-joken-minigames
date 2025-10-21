<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";

//リアクティブな変数を定義
const selectedIndex = ref(0);
const router = useRouter();

//ボタンに対応するルートの配列を定義
//ゲームが増えたらここにルート追加
const buttonRoutes = ["/EvationGame", "/BreakOut", "/MotionGame"];
const buttonCount = buttonRoutes.length;

//キーボードイベントのハンドラを定義
const handleKeyDown = (event) => {
  event.preventDefault();

  switch (event.key) {
    //インデックスを1つ進める場合
    case "ArrowRight":
    case "ArrowDown":
      selectedIndex.value = (selectedIndex.value + 1) % buttonCount;
      break;
    //インデックスを1つ戻す場合
    case "ArrowLeft":
    case "ArrowUp":
      selectedIndex.value =
        (selectedIndex.value - 1 + buttonCount) % buttonCount;
      break;
    //選択されたインデックスのルートに遷移する場合
    case "Enter":
      router.push(buttonRoutes[selectedIndex.value]);
      break;
  }
};

//イベントリスナーの登録・解除
onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div id="home_wrapper">
    <div class="fluffy">
      <h1 id="home_h1">Welcome to Joken Minigames!</h1>
    </div>
    <h2 id="home_h2">Select a game from the buttons below</h2>
    <router-link to="/EvationGame">
      <button
        id="home_button_to_game"
        :class="{ selected: selectedIndex === 0 }"
      >
        避けゲー
      </button>
    </router-link>
    <router-link to="/BreakOut">
      <button
        id="home_button_to_game"
        :class="{ selected: selectedIndex === 1 }"
      >
        ブロック崩し
      </button>
    </router-link>
    <router-link to="/MotionGame">
      <button
        id="home_button_to_game"
        :class="{ selected: selectedIndex === 2 }"
      >
        モーショントラッキング 避けゲー
      </button>
    </router-link>
    <router-link to="/PuzzleGame">
      <button
        id="home_button_to_game"
        :class="{ selected: selectedIndex === 3 }"
      >
        パズルゲー
      </button>
    </router-link>

    
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=DotGothic16&display=swap");
#home_h1 {
  font-family: "DotGothic16";
  font-size: 10vh;
  line-height: 1.2;
  margin: 0;
}
#home_h2 {
  font-family: "DotGothic16";
  font-size: 5vh;
  line-height: 1.1;
}
#home_button_to_game {
  font-family: "DotGothic16";
  font-size: 3vh;
  color: white;
  background-color: transparent;
  border: 2px solid white;
}

#home_button_to_game:hover,
#home_button_to_game.selected {
  color: orange;
  border: 2px solid orange;
  cursor: pointer;
  transition: 0.3s;
}

#home_wrapper {
  background-color: black;
  color: white;
  min-height: 80vh;
  min-width: 100vh;
  padding: 3%;
  margin: 0 auto;
  outline: 5px solid white;
  outline-offset: -20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.fluffy {
  animation: fluffy 3s infinite;
}

@keyframes fluffy {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(10px);
  }
}
</style>
