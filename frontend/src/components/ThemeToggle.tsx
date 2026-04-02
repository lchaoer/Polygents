import useFlowStore from "../store/flowStore";

export default function ThemeToggle() {
  const theme = useFlowStore((s) => s.theme);
  const toggleTheme = useFlowStore((s) => s.toggleTheme);

  return (
    <button className="theme-toggle" onClick={toggleTheme} title="切换主题">
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
