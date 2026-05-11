import { useState } from "react";
import { LOGO_URL } from "../config/constants";
import { ErrorNotice } from "../components/Common";
import { makeClient } from "../services/kvdbClient";
import { initializeDataSpace } from "../services/gatewayRepository";
import { normalizeBaseUrl } from "../utils/validators";

export function ConfigScreen({ onSave, onOpenTokenDebug }) {
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_DEFAULT_KVDB_BASE_URL || "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const next = { baseUrl: normalizeBaseUrl(baseUrl), apiKey: apiKey.trim() };
    if (!next.baseUrl || !next.apiKey) return setError("CONFIG_REQUIRED");
    try {
      const client = makeClient(next);
      await client.probe();
      await initializeDataSpace(client);
      onSave(next);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="config-page">
      <section className="config-panel">
        <div className="brand-mark"><img src={LOGO_URL} alt="DreamReflex" /></div>
        <h1>云梦镜像零信任网关</h1>
        <form onSubmit={submit} className="form-stack">
          <label>数据源地址<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://gateway-admin.example.com" /></label>
          <label>访问密钥<input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="请输入访问密钥" /></label>
          <ErrorNotice error={error} fallbackName="LOGIN_CHECK_FAILED" />
          <button className="primary">登录</button>
          <button className="ghost" type="button" onClick={onOpenTokenDebug}>令牌调试</button>
        </form>
      </section>
    </main>
  );
}
