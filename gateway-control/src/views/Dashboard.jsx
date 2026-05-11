import { Activity, Database, Globe2, Link2, Search, ShieldCheck, UsersRound } from "lucide-react";
import { APP_USERSPACE } from "../config/constants";
import { Metric, PanelHeader } from "../components/Common";

export function Dashboard({ state, setTab }) {
  const enabledDomains = state.domains.filter(item => item.domain?.enabled !== false).length;
  const enabledUsers = state.users.filter(item => item.user?.enabled !== false).length;
  const permissionCount = state.domains.reduce((sum, item) => sum + (item.access?.allowed_emails?.length || 0), 0);

  return (
    <div className="content-grid">
      <section className="panel wide app-summary">
        <div>
          <div className="eyebrow">固定 KVDB Userspace</div>
          <h2>{APP_USERSPACE}</h2>
          <p>控制面和边缘函数固定使用 HTTPKVDB userspace `ztafirewall`，业务 key 直接写入该应用空间。</p>
        </div>
        <button className="ghost" onClick={() => setTab("status")}><ShieldCheck size={16} />状态检查</button>
      </section>
      <Metric icon={Globe2} label="域名" value={state.domains.length} sub={`${enabledDomains} 个启用`} />
      <Metric icon={UsersRound} label="用户" value={state.users.length} sub={`${enabledUsers} 个启用`} />
      <Metric icon={Link2} label="邮箱许可" value={permissionCount} sub="domain email grants" />
      <Metric icon={Database} label="KVDB" value={state.status?.kvdb?.ready?.ok ? "Ready" : "Unknown"} sub={state.status?.kvdb?.base_url || "未连接"} />
      <section className="panel wide">
        <PanelHeader title="快速操作" />
        <div className="quick-actions">
          <button onClick={() => setTab("domains")}><Globe2 size={18} />配置域名库</button>
          <button onClick={() => setTab("users")}><UsersRound size={18} />配置用户库</button>
          <button onClick={() => setTab("permissions")}><Link2 size={18} />配置用户域名许可</button>
          <button onClick={() => setTab("kvdb")}><Search size={18} />只读查询 KVDB</button>
          <button onClick={() => setTab("status")}><Activity size={18} />运行状态检查</button>
        </div>
      </section>
    </div>
  );
}

