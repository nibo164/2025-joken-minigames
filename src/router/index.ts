import { createRouter, createWebHistory } from "vue-router";
import Home from "../view/Home.vue";
import EvationGame from "../view/EvationGame.vue";
import BreakOut from "../view/BreakOut.vue";
import MotionGame from "../view/MotionGame.vue";

const routes = [
  {
    path: "/",
    name: "home",
    component: Home,
  },
  {
    path: "/EvationGame",
    name: "EvationGame",
    component: EvationGame,
  },
  {
    path: "/BreakOut",
    name: "BreakOut",
    component: BreakOut,
  },
  {
    path: "/MotionGame",
    name: "MotionGame",
    component: MotionGame,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
