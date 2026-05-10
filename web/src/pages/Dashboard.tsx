import { memo, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Wifi, Users, Cpu, Clock,
  MemoryStick, Radio, TrendingUp, AlertTriangle, Download, Brain, Loader2,
} from 'lucide-react';
import type { LogEntry } from '../hooks/useWebSocket';
import { useI18n } from '../i18n';
import { resolveOpenClawRuntime } from '../lib/openclawRuntime';

const DISPLAY_CHANNEL_IDS = new Set([
  'qq', 'wechat', 'whatsapp', 'telegram', 'discord', 'irc', 'slack', 'signal', 'googlechat',
  'bluebubbles', 'imessage', 'webchat', 'feishu', 'qqbot', 'dingtalk', 'wecom', 'wecom-app',
  'msteams', 'mattermost', 'line', 'matrix', 'nextcloud-talk', 'nostr', 'qa-channel',
  'synology-chat', 'tlon', 'twitch', 'voice-call', 'zalo', 'zalouser', 'openclaw-weixin',
]);

interface SessionActivityItem {
  agentId?: string;
  sessionId: string;
  lastChannel?: string;
  updatedAt: number;
  originLabel?: string;
  originProvider?: string;
  lastTo?: string;
  messageCount?: number;
  chatType?: string;
  recentMessages?: Array<{ id?: string; role?: string; content?: string; timestamp?: string }>;
}

interface RecentFeedItem {
  id: string;
  time: number;
  source: string;
  summary: string;
  detail: string;
  synthetic?: boolean;
}

interface TaskPressureSummary {
  total?: number;
  active?: number;
  failures?: number;
  visible?: number;
  byStatus?: Record<string, number>;
  byRuntime?: Record<string, number>;
  focusTask?: {
    taskId?: string;
    label?: string;
    task?: string;
    status?: string;
    progressSummary?: string;
    terminalSummary?: string;
    error?: string;
  };
}

interface DashboardProps {
  logEntries: LogEntry[];
  refreshLog: () => void;
}

function DashboardPage({ logEntries, refreshLog }: DashboardProps) {
  const { t } = useI18n();
  const { uiMode } = (useOutletContext() as { uiMode?: 'modern' }) || {};
  const modern = uiMode === 'modern';
  const [status, setStatus] = useState<any>(null);
  const [sessionActivity, setSessionActivity] = useState<SessionActivityItem[]>([]);
  const [openClawInstalled, setOpenClawInstalled] = useState<boolean | null>(null);

  const refreshOpenClawInstallState = async () => {
    try {
      const r = await api.getSoftwareList();
      if (!r?.ok || !Array.isArray(r.software)) return;
      const openClaw = r.software.find((item: any) => item?.id === 'openclaw');
      if (openClaw) setOpenClawInstalled(!!openClaw.installed && openClaw.status !== 'not_installed');
    } catch {
      // keep the last known state
    }
  };

  useEffect(() => {
    api.getStatus().then(r => { if (r.ok) setStatus(r); });
    void refreshOpenClawInstallState();
    const poll = () => { if (!document.hidden) api.getStatus().then(r => { if (r.ok) setStatus(r); }); };
    const t = setInterval(poll, 10000);
    // Resume immediately when tab becomes visible again
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    if (typeof status?.openclaw?.installed === 'boolean') {
      setOpenClawInstalled(status.openclaw.installed);
    }
  }, [status?.openclaw?.installed]);

  useEffect(() => {
    const loadSessionActivity = () => {
      if (document.hidden) return;
      api.getSessions('all').then(r => {
        if (!r.ok || !Array.isArray(r.sessions)) return;
        setSessionActivity(dedupeSessionActivity(r.sessions as SessionActivityItem[]).slice(0, 100));
      }).catch(() => {});
    };
    loadSessionActivity();
    const t = setInterval(loadSessionActivity, 10000);
    const onVisible = () => { if (!document.hidden) loadSessionActivity(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const nc = status?.napcat || {};
  const wc = status?.wechat || {};
  const oc = status?.openclaw || {};
  const gateway = status?.gateway || {};
  const proc = status?.process || {};
  const adm = status?.admin || {};
  const taskPressure: TaskPressureSummary = oc.taskPressure || {};
  const runtime = resolveOpenClawRuntime(oc, proc, gateway);
  const openClawRuntimeInstalled = typeof oc.installed === 'boolean' ? oc.installed : openClawInstalled;
  const openClawMissing = !!status && (!oc.configured || openClawRuntimeInstalled === false);
  const runtimeTone = openClawMissing
    ? 'amber'
    : runtime.healthy
      ? 'emerald'
      : runtime.state === 'offline'
        ? 'red'
        : 'amber';

  const messageLogCount = sessionActivity.reduce((sum, item) => sum + (item.messageCount || 0), 0);
  const inboundCount = sessionActivity.length;
  const botCount = sessionActivity.filter(item => (item.messageCount || 0) > 1).length;

  // Build connected channels dynamically from enabledChannels returned by /api/status
  const enabledChannels: { id: string; label: string; type: string }[] = (oc.enabledChannels || [])
    .map((ch: { id: string; label: string; type: string }) => ({
      ...ch,
      id: ch.id === 'qqbot-community' ? 'qqbot' : ch.id,
    }))
    .filter((ch: { id: string }) => DISPLAY_CHANNEL_IDS.has(ch.id));
  const connectedChannels: { name: string; status: string; details: { label: string; value: string }[] }[] = [];

  for (const ch of enabledChannels) {
    if (ch.id === 'qq') {
      // QQ (NapCat) — has detailed status from OneBot client
      connectedChannels.push({
        name: ch.label,
        status: nc.connected ? t.common.connected : t.common.notLoggedIn,
        details: [
          { label: t.dashboard.nickname, value: nc.nickname || '-' },
          { label: t.dashboard.qqNumber, value: nc.selfId || '-' },
          { label: t.dashboard.groups, value: String(nc.groupCount || 0) },
          { label: t.dashboard.friends, value: String(nc.friendCount || 0) },
        ],
      });
    } else if (ch.id === 'wechat') {
      // WeChat — has detailed status from wechat client
      connectedChannels.push({
        name: ch.label,
        status: wc.loggedIn ? t.common.connected : t.common.notLoggedIn,
        details: [
          { label: t.dashboard.user, value: wc.name || '-' },
          { label: t.common.status, value: wc.loggedIn ? t.dashboard.loggedIn : t.common.notLoggedIn },
        ],
      });
    } else {
      // All other channels (feishu, qqbot, dingtalk, etc.) — enabled in config
      connectedChannels.push({
        name: ch.label,
        status: t.common.enabled,
        details: [
          { label: t.dashboard.channelType, value: ch.type === 'plugin' ? t.dashboard.pluginChannel : t.dashboard.builtinChannel },
          { label: t.common.status, value: t.dashboard.managedByGateway },
        ],
      });
    }
  }

  const liveChannelCount = connectedChannels.filter((channel) => channel.status !== t.common.notLoggedIn).length;
  const queuedTasks = Number(taskPressure.byStatus?.queued || 0);
  const runningTasks = Number(taskPressure.byStatus?.running || 0);
  const taskIssues = Number(taskPressure.failures || 0);
  const taskFocusTitle = taskPressure.focusTask?.label || taskPressure.focusTask?.task || '';
  const taskFocusDetail = taskPressure.focusTask?.error || taskPressure.focusTask?.progressSummary || taskPressure.focusTask?.terminalSummary || '';

  const [installingOC, setInstallingOC] = useState(false);
  const [installOpenClawMsg, setInstallOpenClawMsg] = useState('');
  const [installOpenClawErr, setInstallOpenClawErr] = useState('');

  const pollOpenClawReady = async () => {
    for (let i = 0; i < 12; i += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 5000));
      try {
        const r = await api.getStatus();
        if (r?.ok) {
          setStatus(r);
          if (r?.openclaw?.configured || r?.openclaw?.installed) {
            void refreshOpenClawInstallState();
            setInstallOpenClawMsg('OpenClaw 已检测到，面板状态已自动刷新。');
            setInstallOpenClawErr('');
            return;
          }
        }
      } catch {
        // ignore transient polling errors
      }
    }
  };

  const handleInstallOpenClaw = async () => {
    setInstallingOC(true);
    setInstallOpenClawMsg('');
    setInstallOpenClawErr('');
    try {
      const r = await api.installSoftware('openclaw');
      if (!r?.ok) {
        setInstallOpenClawErr(r?.error || 'OpenClaw 安装任务创建失败');
        return;
      }
      setInstallOpenClawMsg(r?.message || 'OpenClaw 安装任务已创建，请在右上角消息中心查看实时进度。安装完成后会自动重新检测。');
      void refreshOpenClawInstallState();
      void pollOpenClawReady();
    } catch {
      setInstallOpenClawErr('OpenClaw 安装请求失败，请检查网络或稍后重试');
    }
    finally { setInstallingOC(false); }
  };

  return (
    <div className={`space-y-6 h-full flex flex-col ${modern ? 'p-0' : 'p-2'}`}>
      {/* OpenClaw not installed banner */}
      {openClawMissing && (
        <div className="console-panel shrink-0 flex flex-col items-center gap-4 border-amber-300/70 bg-amber-50/90 p-6 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-amber-300/70 bg-amber-100 text-amber-700 shadow-sm dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-300">
            <Brain size={28} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {openClawRuntimeInstalled === false && oc.configured ? '未检测到 OpenClaw 运行时' : 'OpenClaw 尚未安装'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              {openClawRuntimeInstalled === false && oc.configured
                ? '当前已有 OpenClaw 配置，但未检测到可用的 openclaw 命令或安装目录。可以重新执行一键安装来修复运行时。'
                : 'API2CN 需要 OpenClaw AI 引擎才能正常工作。安装后即可配置模型、管理技能和连接通道。'}
            </p>
            {installOpenClawMsg && <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-3 max-w-md mx-auto">{installOpenClawMsg}</p>}
            {installOpenClawErr && <p className="text-xs text-red-600 dark:text-red-300 mt-3 max-w-md mx-auto">{installOpenClawErr}</p>}
          </div>
          <button onClick={handleInstallOpenClaw} disabled={installingOC}
            className={`${modern ? 'page-modern-accent px-6 py-3 text-sm' : 'inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all shadow-lg shadow-violet-200 dark:shadow-none'}`}>
            {installingOC ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {installingOC ? '安装中...' : (openClawRuntimeInstalled === false && oc.configured ? '一键安装 / 修复 OpenClaw' : '一键安装 OpenClaw')}
          </button>
          <p className="text-[11px] text-gray-400">安装进度可在右上角铃铛中的消息中心实时查看</p>
        </div>
      )}

      {/* Header */}
      <div className={`page-modern-header shrink-0 ${modern ? '' : 'flex items-center justify-between'}`}>
        <div>
          <h2 className={modern ? 'page-modern-title' : 'text-xl font-bold tracking-tight text-gray-900 dark:text-white'}>{t.dashboard.title}</h2>
          <p className={modern ? 'page-modern-subtitle' : 'mt-1 text-sm text-gray-500'}>{t.dashboard.subtitle}</p>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2 ${runtimeTone === 'emerald' ? 'border-emerald-300/60 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/20' : runtimeTone === 'red' ? 'border-red-300/70 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/20' : 'border-amber-300/70 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/20'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${runtimeTone === 'emerald' ? 'bg-emerald-500' : runtimeTone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
          <span className={`text-xs font-medium ${runtimeTone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : runtimeTone === 'red' ? 'text-red-600 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{runtime.healthy ? t.dashboard.systemNormal : runtime.title}</span>
        </div>
      </div>

      {oc.configured && !runtime.healthy && !openClawMissing && (
        <div className={`shrink-0 rounded-xl border p-5 shadow-[var(--ui-shadow)] ${runtime.state === 'offline' ? 'border-red-300/70 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/20' : 'border-amber-300/70 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/20'}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-2xl p-2 ${runtime.state === 'offline' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold ${runtime.state === 'offline' ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>{runtime.title}</h3>
              <p className={`mt-1 text-sm leading-6 ${runtime.state === 'offline' ? 'text-red-700 dark:text-red-200/90' : 'text-amber-800 dark:text-amber-200/90'}`}>{runtime.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className={`grid ${modern ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'} gap-4 shrink-0`}>
        <StatCard icon={Brain} label="OpenClaw" value={proc.running ? '运行中' : '未运行'}
          sub={proc.running ? `PID ${proc.pid || '-'}` : '需要启动'}
          color={proc.running ? 'text-emerald-600' : 'text-red-600'}
          bg={proc.running ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'} modern={modern} />
        <StatCard icon={Wifi} label="网关" value={gateway.running ? '在线' : '离线'}
          sub={gateway.running ? '消息链路可用' : '建议重启网关'}
          color={gateway.running ? 'text-blue-600' : 'text-amber-600'}
          bg={gateway.running ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-amber-50 dark:bg-amber-900/20'} modern={modern} />
        <StatCard icon={Clock} label="后台任务" value={`${queuedTasks + runningTasks}`} unit="个"
          sub={taskIssues > 0 ? `${taskIssues} 个异常` : `${queuedTasks} 排队 · ${runningTasks} 运行中`}
          color={taskIssues > 0 ? 'text-red-600' : (queuedTasks + runningTasks) > 0 ? 'text-amber-600' : 'text-emerald-600'}
          bg={taskIssues > 0 ? 'bg-red-50 dark:bg-red-900/20' : (queuedTasks + runningTasks) > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'} modern={modern} />
        <StatCard icon={Radio} label={t.dashboard.activeChannels} value={`${connectedChannels.length}`} unit={t.dashboard.channelUnit || undefined}
          sub={connectedChannels.length > 0 ? connectedChannels.map(c => c.name).join(', ') : t.dashboard.noChannels}
          color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/20" modern={modern} />
        <StatCard icon={Cpu} label={t.dashboard.aiModel} value={oc.currentModel ? shortenModel(oc.currentModel) : t.dashboard.notSet}
          sub={oc.currentModel || ''} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-900/20" modern={modern} />
        <StatCard icon={Clock} label={t.dashboard.uptime} value={formatUptime(adm.uptime || 0, t).split(/(\d+)/)[1]} unit={formatUptime(adm.uptime || 0, t).split(/(\d+)/)[2]}
          color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/20" modern={modern} />
        <StatCard icon={MemoryStick} label={t.dashboard.memory} value={`${adm.memoryMB || 0}`} unit="MB"
          color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-900/20" modern={modern} />
        <StatCard icon={TrendingUp} label={t.dashboard.todayMessages} value={`${messageLogCount}`} unit={t.dashboard.msgUnit || undefined}
          sub={`${t.dashboard.received} ${inboundCount} / ${t.dashboard.sent} ${botCount}`} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/20" modern={modern} />
        {modern && (
          <StatCard icon={Users} label={t.dashboard.connectedChannels} value={`${liveChannelCount}`} unit={t.dashboard.channelUnit || undefined}
            sub={connectedChannels.length > 0 ? 'Live status' : t.dashboard.noChannels} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-900/20" modern={modern} />
        )}
      </div>

      {oc.configured && (queuedTasks + runningTasks > 0 || taskIssues > 0 || taskFocusTitle) && (
        <div className={`${modern ? 'console-panel' : 'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700/50'} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">OpenClaw 后台任务</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {queuedTasks} 排队 · {runningTasks} 运行中 · {taskIssues} 异常
              </p>
            </div>
            <button
              onClick={() => window.location.assign('/tasks')}
              className={`${modern ? 'page-modern-action px-3 py-1.5 text-xs' : 'px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors'}`}
            >
              查看任务账本
            </button>
          </div>
          {taskFocusTitle && (
            <div className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] px-4 py-3">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{taskFocusTitle}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{taskFocusDetail || '当前有后台任务活动，详细信息见任务账本。'}</div>
            </div>
          )}
        </div>
      )}

      {/* Connected channel cards — only show connected */}
      {connectedChannels.length > 0 && (
        <div className="shrink-0">
          <h3 className="mb-3 px-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--ui-faint)]">{t.dashboard.connectedChannels}</h3>
          <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3`}>
            {connectedChannels.map(ch => (
              <div key={ch.name} className={`${modern ? 'console-panel p-4' : 'bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/50'} transition-shadow hover:shadow-md`}>
                {modern && <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-slate-200/20" />}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-xl border ${ch.status === t.common.connected ? 'bg-emerald-50/80 border-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800/40' : ch.status === t.common.enabled ? 'bg-blue-50/80 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800/40' : 'bg-amber-50/80 border-amber-100 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800/40'}`}>
                      <Wifi size={16} />
                    </div>
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight">{ch.name}</span>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border ${ch.status === t.common.connected ? 'bg-emerald-50/90 border-emerald-100 text-emerald-600 dark:bg-emerald-900/25 dark:border-emerald-800/40 dark:text-emerald-400' : ch.status === t.common.enabled ? 'bg-blue-50/90 border-blue-100 text-blue-600 dark:bg-blue-900/25 dark:border-blue-800/40 dark:text-blue-400' : 'bg-amber-50/90 border-amber-100 text-amber-600 dark:bg-amber-900/25 dark:border-amber-800/40 dark:text-amber-400'}`}>{ch.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  {ch.details.map(d => (
                    <div key={d.label} className="flex flex-col">
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{d.label}</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function StatCard({ icon: Icon, label, value, unit, color, bg, sub, modern, labelClassName = '', valueClassName = '' }: { icon: any; label: string; value: string; unit?: string; color: string; bg: string; sub?: string; modern?: boolean; labelClassName?: string; valueClassName?: string }) {
  return (
    <div className={`${modern ? 'console-kpi relative h-[132px] overflow-hidden p-5 pl-6' : 'bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700/50 h-24'} group flex flex-col justify-between transition-shadow hover:shadow-md`}>
      {modern && <div className="pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full bg-[var(--ui-accent)] opacity-70" />}
      <div className="flex items-start justify-between">
        <div className={`rounded-lg border border-[var(--ui-border)] p-2 ${bg} ${color} shadow-sm`}>
          <Icon size={18} />
        </div>
        {sub && <span className={`max-w-[124px] truncate rounded-md border px-2.5 py-1 text-[10px] font-bold ${modern ? 'border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[var(--ui-muted)]' : 'bg-gray-50 dark:bg-gray-700 text-gray-500'}`}>{sub}</span>}
      </div>
      <div>
        <p className={`mb-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${modern ? 'text-[var(--ui-faint)]' : 'text-gray-400'} ${labelClassName}`}>{label}</p>
        <div className="flex items-baseline gap-1">
          <span className={`${modern ? 'text-[28px] leading-none' : 'text-lg'} font-bold text-gray-900 dark:text-white tracking-tight ${valueClassName}`}>{value}</span>
          {unit && <span className={`font-medium ${modern ? 'text-xs text-slate-400' : 'text-[10px] text-gray-400'}`}>{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function sourceColor(s: string) {
  switch (s) {
    case 'qq': return 'bg-blue-100/90 border-blue-100 text-blue-700 dark:bg-blue-900/25 dark:border-blue-800/40 dark:text-blue-300';
    case 'qqbot': return 'bg-indigo-100/90 border-indigo-100 text-indigo-700 dark:bg-indigo-900/25 dark:border-indigo-800/40 dark:text-indigo-300';
    case 'wecom': return 'bg-emerald-100/90 border-emerald-100 text-emerald-700 dark:bg-emerald-900/25 dark:border-emerald-800/40 dark:text-emerald-300';
    case 'feishu': return 'bg-cyan-100/90 border-cyan-100 text-cyan-700 dark:bg-cyan-900/25 dark:border-cyan-800/40 dark:text-cyan-300';
    case 'telegram': return 'bg-sky-100/90 border-sky-100 text-sky-700 dark:bg-sky-900/25 dark:border-sky-800/40 dark:text-sky-300';
    case 'discord': return 'bg-violet-100/90 border-violet-100 text-violet-700 dark:bg-violet-900/25 dark:border-violet-800/40 dark:text-violet-300';
    case 'slack': return 'bg-pink-100/90 border-pink-100 text-pink-700 dark:bg-pink-900/25 dark:border-pink-800/40 dark:text-pink-300';
    case 'line': return 'bg-green-100/90 border-green-100 text-green-700 dark:bg-green-900/25 dark:border-green-800/40 dark:text-green-300';
    case 'wechat': return 'bg-emerald-100/90 border-emerald-100 text-emerald-700 dark:bg-emerald-900/25 dark:border-emerald-800/40 dark:text-emerald-300';
    case 'system': return 'bg-slate-100/90 border-slate-200 text-slate-700 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-300';
    case 'openclaw': return 'bg-sky-100/90 border-sky-100 text-sky-700 dark:bg-sky-900/25 dark:border-sky-800/40 dark:text-sky-300';
    case 'workflow': return 'bg-amber-100/90 border-amber-100 text-amber-700 dark:bg-amber-900/25 dark:border-amber-800/40 dark:text-amber-300';
    default: return 'bg-slate-100/90 border-slate-200 text-slate-600';
  }
}

function sourceLabel(s: string) {
  switch (s) {
    case 'qq': return 'QQ';
    case 'qqbot': return 'QQBot';
    case 'wecom': return '企微';
    case 'feishu': return '飞书';
    case 'telegram': return 'Telegram';
    case 'discord': return 'Discord';
    case 'slack': return 'Slack';
    case 'line': return 'LINE';
    case 'wechat': return 'WeChat';
    case 'system': return 'SYS';
    case 'openclaw': return 'Bot';
    case 'workflow': return 'Flow';
    default: return s;
  }
}

function shortenModel(m: string) {
  if (m.length > 20) {
    const parts = m.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : m.slice(0, 20) + '...';
  }
  return m;
}

function formatLogTime(ts: number) {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  const nowParts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const isToday = get('year') === (nowParts.find((part) => part.type === 'year')?.value || '') &&
    get('month') === (nowParts.find((part) => part.type === 'month')?.value || '') &&
    get('day') === (nowParts.find((part) => part.type === 'day')?.value || '');
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  if (isToday) return time;
  return `${get('year')}-${get('month')}-${get('day')} ${time}`;
}

function formatUptime(s: number, t: any) {
  if (s < 60) return `${Math.floor(s)}${t.dashboard.seconds}`;
  if (s < 3600) return `${Math.floor(s / 60)}${t.dashboard.minutes}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${t.dashboard.hours}${Math.floor((s % 3600) / 60)}${t.dashboard.minutes}`;
  return `${Math.floor(s / 86400)}${t.dashboard.days}${Math.floor((s % 86400) / 3600)}${t.dashboard.hours}`;
}

function isNoiseEvent(entry: { source: string; type: string; summary: string }) {
  return entry.source === 'qq' && entry.type === 'notice.notify';
}

function dedupeSessionActivity(items: SessionActivityItem[]) {
  const map = new Map<string, SessionActivityItem>();
  items.forEach((item) => {
    const key = `${item.agentId || 'main'}:${item.sessionId}`;
    const current = map.get(key);
    if (!current || (item.updatedAt || 0) > (current.updatedAt || 0)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function normalizeSessionChannel(raw: string) {
  const channel = String(raw || '').trim().toLowerCase();
  if (!channel) return 'agent';
  if (channel === 'openclaw-weixin') return 'wechat';
  if (channel === 'qqbot-community') return 'qqbot';
  return channel;
}

function isSyntheticApprovalCallbackMessage(message: { role?: string; content?: string } | null | undefined) {
  const text = String(message?.content || '').trim().toLowerCase();
  if (!text) return false;
  return (
    text.includes('an async command the user already approved has completed') ||
    text.includes('do not run the command again') ||
    text.includes('exact completion details:') ||
    text.includes('exec denied (') ||
    text.includes('approval-timeout')
  );
}

function buildRecentFeed(logs: LogEntry[], sessions: SessionActivityItem[]): RecentFeedItem[] {
  const feed: RecentFeedItem[] = logs.map(entry => ({
    id: String(entry.id),
    time: entry.time,
    source: entry.source,
    summary: entry.summary,
    detail: entry.detail || entry.summary || '',
  }));

  const normalizeForFingerprint = (text: string) => String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
    .toLowerCase();
  const seenFingerprint = new Set(
    feed.map(item => `${item.source}|${Math.floor(item.time / 5000)}|${normalizeForFingerprint(item.summary)}`),
  );

  sessions.forEach((session) => {
    const key = `${session.agentId || 'main'}:${session.sessionId}`;
    const channel = normalizeSessionChannel(session.lastChannel || session.originProvider || 'agent');
    const recentMessages = Array.isArray(session.recentMessages) ? session.recentMessages : [];
    if (recentMessages.length > 0) {
      let skipNextAssistantReply = false;
      recentMessages.forEach((msg, idx) => {
        if (isSyntheticApprovalCallbackMessage(msg)) {
          skipNextAssistantReply = true;
          return;
        }

        const role = String(msg.role || 'user');
        if (skipNextAssistantReply && role === 'assistant') {
          skipNextAssistantReply = false;
          return;
        }
        skipNextAssistantReply = false;

        const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : (session.updatedAt || 0) + idx;
        const source = role === 'assistant' ? 'openclaw' : channel;
        const content = String(msg.content || '').trim();
        if (!content) return;
        const fingerprint = `${source}|${Math.floor((Number.isFinite(ts) ? ts : (session.updatedAt || 0)) / 5000)}|${normalizeForFingerprint(content)}`;
        if (seenFingerprint.has(fingerprint)) return;
        seenFingerprint.add(fingerprint);
        feed.push({
          id: `session:${key}:${msg.id || idx}`,
          time: Number.isFinite(ts) ? ts : (session.updatedAt || 0),
          source,
          summary: content,
          detail: [
            `通道: ${sourceLabel(channel)}`,
            `智能体: ${session.agentId || 'main'}`,
            `来源: ${session.originLabel || '-'}`,
            `目标: ${session.lastTo || '-'}`,
          ].join('\n'),
          synthetic: true,
        });
      });
      return;
    }
    if (channel === 'agent') return;
  });

  return feed.sort((a, b) => b.time - a.time);
}

export default memo(DashboardPage);
