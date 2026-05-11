import { useState } from "react";
import { ConfigScreen } from "../views/ConfigScreen";
import { TokenDebugView } from "../views/TokenDebugView";
import { Shell } from "./Shell";
import { clearConfig, loadConfig, saveConfig } from "../services/configStorage";

export function App() {
  const [config, setConfig] = useState(loadConfig());
  const [localTool, setLocalTool] = useState("");
  if (localTool === "token-debug") {
    return (
      <main className="local-tool-page">
        <header className="local-tool-header">
          <div>
            <div className="eyebrow">Local Debug Tool</div>
            <h1>令牌调试</h1>
          </div>
          <button className="ghost" onClick={() => setLocalTool("")}>返回连接</button>
        </header>
        <TokenDebugView />
      </main>
    );
  }
  if (!config?.baseUrl || !config?.apiKey) {
    return <ConfigScreen onOpenTokenDebug={() => setLocalTool("token-debug")} onSave={value => { saveConfig(value); setConfig(value); }} />;
  }
  return <Shell config={config} onReset={() => { clearConfig(); setConfig(null); }} />;
}
