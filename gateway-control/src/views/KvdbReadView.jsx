import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ErrorNotice, PanelHeader } from "../components/Common";
import { APP_USERSPACE } from "../config/constants";
import { isMissingKey } from "../services/kvdbClient";

function normalizeQueryKey(key) {
  const value = String(key || "").trim();
  if (value.startsWith(`${APP_USERSPACE}:`)) return value.slice(APP_USERSPACE.length + 1);
  if (value.startsWith(`${APP_USERSPACE}/`)) return value.slice(APP_USERSPACE.length + 1);
  return value;
}

function kvdbSuggestions(state) {
  const keys = ["meta", "domains", "users"];
  for (const item of state.domains) {
    const host = item.domain?.host;
    if (!host) continue;
    keys.push(`domain:${host}`, `access:domain:${host}`);
    if (item.domain?.origin_id) keys.push(`origin:${item.domain.origin_id}`);
  }
  for (const item of state.users) {
    const email = item.user?.email;
    if (!email) continue;
    keys.push(`user:${email}`, `access:user:${email}`);
  }
  return Array.from(new Set(keys)).sort();
}

export function KvdbReadView({ client, state }) {
  const suggestions = useMemo(() => kvdbSuggestions(state), [state]);
  const [key, setKey] = useState("domains");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function query(event) {
    event?.preventDefault();
    const logicalKey = normalizeQueryKey(key);
    if (!logicalKey) return setError("KVDB_KEY_REQUIRED");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const [head, value] = await Promise.all([client.head(logicalKey), client.get(logicalKey)]);
      setResult({
        key: logicalKey,
        userspace: APP_USERSPACE,
        metadata: head,
        value,
        raw: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      });
    } catch (err) {
      if (isMissingKey(err)) {
        setError("KEY_NOT_FOUND");
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  function choose(nextKey) {
    setKey(nextKey);
    setError("");
    setResult(null);
  }

  return (
    <div className="content-grid">
      <section className="panel kvdb-query-panel">
        <PanelHeader title="KVDB 原始内容查询" />
        <p className="panel-copy">只读视图。这里仅调用 HTTPKVDB GET/HEAD 展示原始 key 内容，不提供保存、删除或事务操作。</p>
        <form className="kvdb-query-form" onSubmit={query}>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="domains 或 ztafirewall/domains" />
          <button className="primary" disabled={busy}><Search size={16} />{busy ? "查询中" : "查询"}</button>
        </form>
        <div className="kvdb-key-list">
          {suggestions.map(item => <button key={item} className={item === normalizeQueryKey(key) ? "active" : ""} onClick={() => choose(item)}>{item}</button>)}
        </div>
      </section>
      <section className="panel kvdb-result-panel">
        <PanelHeader title="查询结果" />
        <ErrorNotice error={error} fallbackName="KVDB_REQUEST_FAILED" className="banner error" />
        {result ? (
          <>
            <div className="kvdb-meta">
              <div><span>Userspace</span><strong>{result.userspace}</strong></div>
              <div><span>Key</span><strong>{result.key}</strong></div>
              <div><span>Version</span><strong>{result.metadata.version || "-"}</strong></div>
              <div><span>Size</span><strong>{result.metadata.size || "-"}</strong></div>
              <div><span>Checksum</span><strong>{result.metadata.checksum || "-"}</strong></div>
            </div>
            <pre className="json-block kvdb-json-block">{result.raw}</pre>
          </>
        ) : (
          <div className="empty-state">选择或输入一个 key 后查询，结果会以只读原始内容展示。</div>
        )}
      </section>
    </div>
  );
}
