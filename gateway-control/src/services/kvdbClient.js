import { APP_USERSPACE } from "../config/constants";
import { normalizeBaseUrl } from "../utils/validators";

function kvPath(key) {
  return `/api/v1/${APP_USERSPACE}/${encodeURIComponent(key)}`;
}

export function isMissingKey(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 404 || error?.code === "KEY_NOT_FOUND" || message.includes("key not found");
}

export function makeClient(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey;
  const headers = extra => ({
    APIKey: apiKey,
    ...extra
  });

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const message = data?.message || data?.error || `${response.status} ${path}`;
      const error = new Error(message);
      error.status = response.status;
      error.code = data?.error || "";
      error.path = path;
      throw error;
    }
    return { response, data };
  }

  return {
    baseUrl,
    authHeaders(extra = {}) {
      return headers(extra);
    },
    async request(path, options = {}) {
      return request(path, options);
    },
    async get(key) {
      const { data } = await request(kvPath(key), {
        headers: headers({ Accept: "application/json" })
      });
      return data;
    },
    async head(key) {
      const response = await fetch(`${baseUrl}${kvPath(key)}`, {
        method: "HEAD",
        headers: headers()
      });
      if (response.status === 404) return { exists: false };
      if (!response.ok) throw new Error(`HEAD ${key} failed: ${response.status}`);
      return {
        exists: true,
        version: response.headers.get("x-kv-version"),
        size: response.headers.get("x-kv-size"),
        checksum: response.headers.get("x-kv-checksum")
      };
    },
    async put(key, value) {
      await request(kvPath(key), {
        method: "PUT",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(value)
      });
    },
    async delete(key) {
      const response = await fetch(`${baseUrl}${kvPath(key)}`, {
        method: "DELETE",
        headers: headers()
      });
      if (response.status === 404) return false;
      if (!response.ok && response.status !== 204) throw new Error(`DELETE ${key} failed: ${response.status}`);
      return true;
    },
    async probe() {
      const ready = await fetch(`${baseUrl}/readyz`).catch(error => ({ ok: false, status: 0, error: error.message }));
      const health = await fetch(`${baseUrl}/healthz`).catch(error => ({ ok: false, status: 0, error: error.message }));
      return {
        base_url: baseUrl,
        ready: { ok: ready.ok, status: ready.status, error: ready.error || null },
        health: { ok: health.ok, status: health.status, error: health.error || null }
      };
    },
    async transaction(ops) {
      if (!ops.length) return { status: "noop", results: [] };
      const totalOps = ops.length;
      const create = await request("/v1/tx", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ total_ops: totalOps, timeout_ms: 30000 })
      });
      const txId = create.data.tx_id;
      for (let index = 0; index < ops.length; index += 1) {
        const op = ops[index];
        const body = op.value == null ? "" : JSON.stringify(op.value);
        await request(`/v1/tx/${encodeURIComponent(txId)}/ops/${index + 1}`, {
          method: "POST",
          headers: headers({
            "X-KV-Op": op.op,
            "X-KV-Key": op.key,
            "X-KV-Op-Id": op.id || `${op.op.toLowerCase()}-${index + 1}`,
            ...(op.value == null ? {} : { "Content-Type": "application/json" })
          }),
          body: op.value == null ? undefined : body
        });
      }
      const commit = await request(`/v1/tx/${encodeURIComponent(txId)}/commit`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ total_ops: totalOps })
      });
      return commit.data;
    }
  };
}

