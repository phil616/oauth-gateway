import { useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { ErrorNotice, PanelHeader } from "../components/Common";
import { decryptGatewayToken, redactGatewayTokenPayload } from "../services/gatewayTokenDebugger";

function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function TokenDebugView() {
  const [token, setToken] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  const visiblePayload = useMemo(() => {
    if (!result?.payload) return null;
    return showSensitive ? result.payload : redactGatewayTokenPayload(result.payload);
  }, [result, showSensitive]);

  async function decrypt(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await decryptGatewayToken(token, keyInput));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copyPayload() {
    if (!visiblePayload) return;
    await navigator.clipboard.writeText(toPrettyJson(visiblePayload));
  }

  function clear() {
    setToken("");
    setKeyInput("");
    setResult(null);
    setError("");
    setShowSensitive(false);
  }

  return (
    <div className="content-grid token-debug-layout">
      <section className="panel token-debug-input-panel">
        <PanelHeader title="加密令牌解密" action={<span className="local-only"><ShieldCheck size={15} />本地处理</span>} />
        <form className="token-debug-form" onSubmit={decrypt}>
          <label>
            df_oauth_token
            <textarea value={token} onChange={e => setToken(e.target.value)} spellCheck="false" placeholder="header.iv.ciphertext" />
          </label>
          <label>
            解密密钥或 GATEWAY_TOKEN_KEYS
            <textarea value={keyInput} onChange={e => setKeyInput(e.target.value)} spellCheck="false" placeholder={'{"v1":"base64url-key"}'} />
          </label>
          <div className="token-debug-actions">
            <button className="primary" disabled={busy || !token.trim() || !keyInput.trim()}><KeyRound size={16} />{busy ? "解密中" : "解密"}</button>
            <button className="ghost" type="button" onClick={clear}><Trash2 size={16} />清空</button>
          </div>
        </form>
        <ErrorNotice error={error} fallbackName="OPERATION_FAILED" />
      </section>

      <section className="panel token-debug-output-panel">
        <PanelHeader
          title="解密结果"
          action={result ? (
            <div className="token-debug-actions compact-actions">
              <button className="ghost" onClick={() => setShowSensitive(value => !value)}>{showSensitive ? <EyeOff size={16} /> : <Eye size={16} />}{showSensitive ? "隐藏敏感字段" : "显示完整内容"}</button>
              <button className="ghost" onClick={copyPayload}><Copy size={16} />复制</button>
            </div>
          ) : null}
        />
        {result ? (
          <div className="token-debug-result">
            <div className="kvdb-meta">
              <div><span>Token Kid</span><strong>{result.header.kid || "-"}</strong></div>
              <div><span>Selected Key</span><strong>{result.selected_kid || "-"}</strong></div>
              <div><span>Algorithm</span><strong>{result.header.alg}/{result.header.enc}</strong></div>
              <div><span>Subject</span><strong>{visiblePayload?.sub || "-"}</strong></div>
            </div>
            <pre className="json-block token-json-block">{toPrettyJson({ header: result.header, payload: visiblePayload })}</pre>
          </div>
        ) : (
          <div className="empty-state">粘贴令牌和密钥后解密。</div>
        )}
      </section>
    </div>
  );
}
