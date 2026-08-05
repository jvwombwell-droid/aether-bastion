import { createFileRoute } from "@tanstack/react-router";
import { TowerDefense } from "@/components/game/TowerDefense";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <TowerDefense />;
}
