import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

// Original extension stylesheet bundle
import "@/assets/style.css"
import "mind-elixir/style.css"
import "@/assets/mind-elixir-override.css"
import "sonner/dist/styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
