import { useState } from "react";
import { ConfigScreen } from "../views/ConfigScreen";
import { Shell } from "./Shell";
import { clearConfig, loadConfig, saveConfig } from "../services/configStorage";

export function App() {
  const [config, setConfig] = useState(loadConfig());
  if (!config?.baseUrl || !config?.apiKey) {
    return <ConfigScreen onSave={value => { saveConfig(value); setConfig(value); }} />;
  }
  return <Shell config={config} onReset={() => { clearConfig(); setConfig(null); }} />;
}

