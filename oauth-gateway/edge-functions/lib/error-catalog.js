export const ERROR_DOC_URL = "https://doc.dreamreflex.com/info/%E4%BA%91%E6%A2%A6%E9%95%9C%E5%83%8F%E5%AE%89%E5%85%A8%E7%BD%91%E7%BB%9C/%E9%94%99%E8%AF%AF%E4%BB%A3%E7%A0%81.html";

const ERROR_CATALOG = {
  BAD_HOST: { code: "E1000", title: "请求主机无效" },
  DOMAIN_NOT_FOUND: { code: "E1001", title: "域名未接入网关" },
  ORIGIN_NOT_CONFIGURED: { code: "E1002", title: "源站配置不可用" },
  UNAUTHENTICATED: { code: "E1003", title: "需要重新认证" },
  TOKEN_STALE: { code: "E1004", title: "认证凭据已失效" },
  ACCESS_DENIED: { code: "E1005", title: "访问许可不足" },
  OAUTH_NOT_CONFIGURED: { code: "E1101", title: "认证服务不可用" },
  OAUTH_STATE_INVALID: { code: "E1102", title: "认证会话无效" },
  OAUTH_CODE_MISSING: { code: "E1103", title: "认证授权缺失" },
  OAUTH_TOKEN_FAILED: { code: "E1104", title: "认证令牌交换失败" },
  ID_TOKEN_INVALID: { code: "E1105", title: "身份令牌校验失败" },
  EMAIL_UNVERIFIED: { code: "E1106", title: "邮箱未完成验证" },
  EMAIL_MISSING: { code: "E1107", title: "身份邮箱缺失" },
  ORIGIN_SCHEME_DENIED: { code: "E1201", title: "源站协议不被允许" },
  ORIGIN_DENIED: { code: "E1202", title: "源站目标不被允许" },
  ORIGIN_TOKEN_MISSING: { code: "E1203", title: "源站访问凭据不可用" },
  GATEWAY_INTERNAL_ERROR: { code: "E1500", title: "网关内部错误" },
  OAUTH_INTERNAL_ERROR: { code: "E1501", title: "认证流程内部错误" }
};

const FALLBACK_ERROR = { name: "UNKNOWN_GATEWAY_ERROR", code: "E1999", title: "边缘访问请求失败" };

export function resolveGatewayError(name) {
  const errorName = String(name || "GATEWAY_INTERNAL_ERROR").trim() || "GATEWAY_INTERNAL_ERROR";
  const catalogItem = ERROR_CATALOG[errorName];
  return {
    name: catalogItem ? errorName : FALLBACK_ERROR.name,
    documentation_url: ERROR_DOC_URL,
    ...(catalogItem || FALLBACK_ERROR)
  };
}
