import { createRouter, createWebHistory } from "vue-router";
import Home from "../view/Home.vue";
import Game1 from "../view/Game1.vue";

const routes = [
  {
    path: "/",
    name: "home",
    component: Home,
  },
  {
    path: "/game1",
    name: "game1",
    component: Game1,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
