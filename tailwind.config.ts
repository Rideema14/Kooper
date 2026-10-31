import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: { ink: "#1b2420", forest: "#17302a", leaf: "#3b7658", paper: "#f3efe6" } } },
  plugins: [],
};
export default config;
