# 云梦镜像安全网络错误代码

本文档用于解释边缘访问网关和 Gateway Control 管理台对外展示的标准错误码。用户界面不展示底层异常字符串；排障时请优先记录 `错误码`、`错误名`、`HTTP 状态` 和发生页面。

错误码说明页地址:

https://doc.dreamreflex.com/info/%E4%BA%91%E6%A2%A6%E9%95%9C%E5%83%8F%E5%AE%89%E5%85%A8%E7%BD%91%E7%BB%9C/%E9%94%99%E8%AF%AF%E4%BB%A3%E7%A0%81.html

## 边缘访问网关 E1xxx

| 错误码 | 错误名 | 含义 | 建议处理 |
| --- | --- | --- | --- |
| E1000 | BAD_HOST | 请求主机头无效或缺失。 | 检查访问域名、代理转发的 Host 头和边缘平台域名绑定。 |
| E1001 | DOMAIN_NOT_FOUND | 当前域名未接入网关配置。 | 在 Gateway Control 中新增或修复域名配置，并确认 KVDB 中存在对应 `domain:{host}` 记录。 |
| E1002 | ORIGIN_NOT_CONFIGURED | 域名缺少可用源站配置。 | 检查源站 IP/主机、Host 头、源站配置键和域名引用的 `origin_id`。 |
| E1003 | UNAUTHENTICATED | 请求没有有效认证凭据。 | 重新登录；若仍失败，检查 Cookie 域、网关令牌密钥和登录回调地址。 |
| E1004 | TOKEN_STALE | 认证凭据与当前访问策略或域名配置版本不一致。 | 重新登录；如大量出现，确认策略发布后用户会话刷新流程正常。 |
| E1005 | ACCESS_DENIED | 当前身份没有访问该域名的许可。 | 在许可矩阵中为用户或邮箱域名授予访问权限。 |
| E1101 | OAUTH_NOT_CONFIGURED | OAuth 登录服务不可用。 | 检查 OAuth 客户端、发现地址、Issuer、密钥和域名认证方式。 |
| E1102 | OAUTH_STATE_INVALID | OAuth 会话状态校验失败。 | 重新发起登录；检查回调域名、会话 Cookie 和系统时间。 |
| E1103 | OAUTH_CODE_MISSING | OAuth 回调缺少授权码。 | 重新发起登录；检查身份提供商回调参数。 |
| E1104 | OAUTH_TOKEN_FAILED | OAuth 授权码换取令牌失败。 | 检查客户端凭据、回调 URI、令牌端点和身份提供商日志。 |
| E1105 | ID_TOKEN_INVALID | 身份令牌校验失败。 | 检查 Issuer、Audience、JWKS、签名算法、Nonce 和令牌有效期。 |
| E1106 | EMAIL_UNVERIFIED | 身份提供商返回的邮箱未验证。 | 要求用户在身份提供商完成邮箱验证。 |
| E1107 | EMAIL_MISSING | 身份令牌未提供可识别邮箱。 | 检查 OAuth scope、声明映射和身份提供商用户资料。 |
| E1201 | ORIGIN_SCHEME_DENIED | 源站协议不在允许范围内。 | 使用 `http` 或 `https`，并修正域名源站配置。 |
| E1202 | ORIGIN_DENIED | 源站目标不符合安全策略。 | 检查源站地址；默认不允许私网、回环或非法目标。 |
| E1203 | ORIGIN_TOKEN_MISSING | 源站访问令牌环境变量不可用。 | 检查边缘环境变量和域名配置中的 `zta_token_env`。 |
| E1500 | GATEWAY_INTERNAL_ERROR | 网关处理请求时发生内部错误。 | 查看边缘运行日志，并核对 KVDB、网关令牌密钥和环境变量配置。 |
| E1501 | OAUTH_INTERNAL_ERROR | OAuth 登录或回调流程发生内部错误。 | 查看边缘运行日志，并核对 OAuth 相关环境变量。 |
| E1999 | UNKNOWN_GATEWAY_ERROR | 未分类的边缘访问错误。 | 收集请求信息和边缘日志后升级排查。 |

## Gateway Control 管理台 E2xxx

| 错误码 | 错误名 | 含义 | 建议处理 |
| --- | --- | --- | --- |
| E2001 | CONFIG_REQUIRED | 管理台连接配置不完整。 | 填写数据源地址和访问密钥。 |
| E2002 | LOGIN_CHECK_FAILED | 管理台连接检查失败。 | 检查 HTTPKVDB 地址、网络连通性和访问密钥。 |
| E2003 | DATA_LOAD_FAILED | 管理台数据加载失败。 | 刷新页面；若持续失败，检查 KVDB 服务状态和权限。 |
| E2004 | OPERATION_FAILED | 管理台操作失败。 | 根据当前操作检查输入、权限和服务状态。 |
| E2101 | KVDB_KEY_REQUIRED | KVDB 查询键为空。 | 输入要查询的逻辑 key。 |
| E2102 | KEY_NOT_FOUND | KVDB 记录不存在。 | 确认 key 是否正确，或先初始化/创建对应记录。 |
| E2103 | KVDB_UNAUTHORIZED | KVDB 访问凭据无效。 | 更新访问密钥。 |
| E2104 | KVDB_FORBIDDEN | KVDB 访问权限不足。 | 检查 APIKey 主体是否允许访问目标 userspace。 |
| E2105 | KVDB_REQUEST_FAILED | KVDB 请求失败。 | 检查 HTTPKVDB 服务、网络和请求路径。 |
| E2106 | KVDB_TRANSACTION_FAILED | KVDB 事务提交失败。 | 重试操作；若持续失败，检查事务接口日志。 |
| E2201 | BAD_HOST | 域名格式无效。 | 输入标准域名，不包含协议、路径或空格。 |
| E2202 | BAD_ORIGIN | 源站配置不完整。 | 填写源站 IP/主机和源站 Host 头。 |
| E2203 | BAD_EMAIL | 邮箱格式无效。 | 输入标准邮箱地址。 |
| E2204 | BAD_ACCESS_INPUT | 许可参数无效。 | 选择有效用户和域名后再修改许可。 |
| E2205 | USER_NOT_FOUND | 用户记录不存在。 | 先创建用户，或修复用户索引。 |
| E2206 | DOMAIN_NOT_FOUND | 域名记录不存在。 | 先创建域名，或修复域名索引。 |
| E2301 | DOMAIN_INDEX_CONFIG_MISSING | 域名索引指向的配置不存在。 | 使用状态检查修复索引，或补齐域名记录。 |
| E2302 | DOMAIN_ACCESS_POLICY_MISSING | 域名访问策略缺失。 | 重新保存域名或运行索引一致性修复。 |
| E2303 | DOMAIN_ORIGIN_MISSING | 域名源站配置缺失。 | 补齐源站配置，确认 `origin_id` 引用正确。 |
| E2304 | USER_INDEX_CONFIG_MISSING | 用户索引指向的配置不存在。 | 使用状态检查修复索引，或补齐用户记录。 |
| E2305 | USER_ACCESS_INDEX_MISSING | 用户访问索引缺失。 | 重新保存用户或运行索引一致性修复。 |
| E2306 | USER_ACCESS_INDEX_MISMATCH | 用户访问索引与域名策略不一致。 | 运行索引一致性修复。 |
| E2307 | DOMAIN_KEY_MISSING | 域名配置键不存在。 | 创建域名记录或运行索引一致性修复。 |
| E2999 | UNKNOWN_ADMIN_ERROR | 未分类的管理台错误。 | 收集浏览器控制台、网络请求和服务日志后升级排查。 |
