export const ERROR_DOC_URL = "https://doc.dreamreflex.com/info/%E4%BA%91%E6%A2%A6%E9%95%9C%E5%83%8F%E5%AE%89%E5%85%A8%E7%BD%91%E7%BB%9C/%E9%94%99%E8%AF%AF%E4%BB%A3%E7%A0%81.html";

const ERROR_CATALOG = {
  CONFIG_REQUIRED: { code: "E2001", title: "管理台连接配置不完整" },
  LOGIN_CHECK_FAILED: { code: "E2002", title: "管理台连接检查失败" },
  DATA_LOAD_FAILED: { code: "E2003", title: "管理台数据加载失败" },
  OPERATION_FAILED: { code: "E2004", title: "管理台操作失败" },
  KVDB_KEY_REQUIRED: { code: "E2101", title: "KVDB 查询键不能为空" },
  KEY_NOT_FOUND: { code: "E2102", title: "KVDB 记录不存在" },
  KVDB_UNAUTHORIZED: { code: "E2103", title: "KVDB 访问凭据无效" },
  KVDB_FORBIDDEN: { code: "E2104", title: "KVDB 访问权限不足" },
  KVDB_REQUEST_FAILED: { code: "E2105", title: "KVDB 请求失败" },
  KVDB_TRANSACTION_FAILED: { code: "E2106", title: "KVDB 事务提交失败" },
  BAD_HOST: { code: "E2201", title: "域名格式无效" },
  BAD_ORIGIN: { code: "E2202", title: "源站配置不完整" },
  BAD_EMAIL: { code: "E2203", title: "邮箱格式无效" },
  BAD_ACCESS_INPUT: { code: "E2204", title: "许可参数无效" },
  USER_NOT_FOUND: { code: "E2205", title: "用户记录不存在" },
  DOMAIN_NOT_FOUND: { code: "E2206", title: "域名记录不存在" },
  DOMAIN_INDEX_CONFIG_MISSING: { code: "E2301", title: "域名索引指向的配置不存在" },
  DOMAIN_ACCESS_POLICY_MISSING: { code: "E2302", title: "域名访问策略缺失" },
  DOMAIN_ORIGIN_MISSING: { code: "E2303", title: "域名源站配置缺失" },
  USER_INDEX_CONFIG_MISSING: { code: "E2304", title: "用户索引指向的配置不存在" },
  USER_ACCESS_INDEX_MISSING: { code: "E2305", title: "用户访问索引缺失" },
  USER_ACCESS_INDEX_MISMATCH: { code: "E2306", title: "用户访问索引与域名策略不一致" },
  DOMAIN_KEY_MISSING: { code: "E2307", title: "域名配置键不存在" },
  TOKEN_FORMAT_INVALID: { code: "E2401", title: "令牌格式无效" },
  TOKEN_HEADER_UNSUPPORTED: { code: "E2402", title: "令牌头不受支持" },
  TOKEN_KEY_NOT_FOUND: { code: "E2403", title: "未找到匹配解密密钥" },
  TOKEN_KEY_INVALID: { code: "E2404", title: "解密密钥无效" },
  TOKEN_DECRYPT_FAILED: { code: "E2405", title: "令牌解密失败" },
  UNKNOWN_ADMIN_ERROR: { code: "E2999", title: "未分类的管理台错误" }
};

const MESSAGE_NAME_MAP = {
  "BAD_HOST": "BAD_HOST",
  "BAD_ORIGIN": "BAD_ORIGIN",
  "BAD_EMAIL": "BAD_EMAIL",
  "BAD_ACCESS_INPUT": "BAD_ACCESS_INPUT",
  "USER_NOT_FOUND": "USER_NOT_FOUND",
  "DOMAIN_NOT_FOUND": "DOMAIN_NOT_FOUND",
  "TOKEN_FORMAT_INVALID": "TOKEN_FORMAT_INVALID",
  "TOKEN_HEADER_UNSUPPORTED": "TOKEN_HEADER_UNSUPPORTED",
  "TOKEN_KEY_NOT_FOUND": "TOKEN_KEY_NOT_FOUND",
  "TOKEN_KEY_INVALID": "TOKEN_KEY_INVALID",
  "TOKEN_DECRYPT_FAILED": "TOKEN_DECRYPT_FAILED"
};

function nameFromError(error, fallbackName) {
  if (typeof error === "string") return error;
  if (error?.code) return error.code;
  const message = String(error?.message || "");
  if (MESSAGE_NAME_MAP[message]) return MESSAGE_NAME_MAP[message];
  if (message.indexOf("KVDB transaction") >= 0) return "KVDB_TRANSACTION_FAILED";
  if (error?.status === 401) return "KVDB_UNAUTHORIZED";
  if (error?.status === 403) return "KVDB_FORBIDDEN";
  if (error?.status === 404) return "KEY_NOT_FOUND";
  if (error?.status || message) return "KVDB_REQUEST_FAILED";
  return fallbackName;
}

export function normalizeError(error, fallbackName = "OPERATION_FAILED") {
  const name = nameFromError(error, fallbackName) || fallbackName;
  const catalogItem = ERROR_CATALOG[name] || ERROR_CATALOG[fallbackName] || ERROR_CATALOG.UNKNOWN_ADMIN_ERROR;
  return {
    name: ERROR_CATALOG[name] ? name : fallbackName,
    documentation_url: ERROR_DOC_URL,
    ...catalogItem
  };
}
