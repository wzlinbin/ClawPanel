import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ScrollText, Radio, Sparkles, Clock, Settings,
  Moon, Sun, LogOut, Menu, FolderOpen, Languages, MessageSquare,
  RotateCw, RefreshCw, Power, Puzzle, Bot, Search, Bell, ChevronDown, GitBranch, Network, BriefcaseBusiness, Activity, Brain, TerminalSquare, Wallet, Key, X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import AIAssistant from './AIAssistant';
import MessageCenter, { TaskInfo } from './MessageCenter';
import { api } from '../lib/api';
import { resolveOpenClawRuntime } from '../lib/openclawRuntime';

interface Props { onLogout: () => void; napcatStatus: any; wechatStatus?: any; openclawStatus?: any; processStatus?: any; wsMessages?: any[]; }

const ACTIVE_AGENT_KEY = 'clawpanel-active-agent';

interface RuntimeChannelSummary {
  label: string;
  detail: string;
  connected: boolean;
}

interface PanelUpdateSummary {
  loading: boolean;
  checking: boolean;
  navigating: boolean;
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  error?: string;
}

const DISPLAY_CHANNEL_IDS = new Set([
  'qq', 'wechat', 'whatsapp', 'telegram', 'discord', 'irc', 'slack', 'signal', 'googlechat',
  'bluebubbles', 'imessage', 'webchat', 'feishu', 'qqbot', 'dingtalk', 'wecom', 'wecom-app',
  'msteams', 'mattermost', 'line', 'matrix', 'nextcloud-talk', 'nostr', 'qa-channel',
  'synology-chat', 'tlon', 'twitch', 'voice-call', 'zalo', 'zalouser', 'openclaw-weixin',
]);

function mapWorkflowRunToTask(run: any): TaskInfo {
  let status: TaskInfo['status'] = 'pending';
  if (run?.status === 'completed') status = 'success';
  else if (run?.status === 'failed') status = 'failed';
  else if (run?.status === 'cancelled') status = 'canceled';
  else if (run?.status === 'running' || run?.status === 'paused' || run?.status === 'waiting_for_user' || run?.status === 'waiting_for_approval') status = 'running';

  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const finished = steps.filter((step: any) => step?.status === 'completed' || step?.status === 'skipped').length;
  const progress = run?.status === 'completed' ? 100 : steps.length > 0 ? Math.round((finished / steps.length) * 100) : 0;

  return {
    id: `workflow-${run.id}`,
    name: `${run.name || '工作流'} ${run.shortId || ''}`.trim(),
    type: 'workflow_run',
    status,
    progress,
    error: run?.status === 'failed' ? run?.lastMessage : undefined,
    createdAt: new Date(run?.createdAt || Date.now()).toISOString(),
    updatedAt: new Date(run?.updatedAt || Date.now()).toISOString(),
    logCount: run?.lastMessage ? 1 : 0,
    log: run?.lastMessage ? [run.lastMessage] : [],
  };
}

function mergeTasks(base: TaskInfo[], extra: TaskInfo[]) {
  const merged = new Map<string, TaskInfo>();
  [...extra, ...base].forEach(task => {
    merged.set(task.id, task);
  });
  return Array.from(merged.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function filterVisibleTasks(tasks: TaskInfo[]) {
  return tasks.filter(task => !(task.type === 'workflow_run' && task.status === 'canceled'));
}

function formatBalanceValue(value: any) {
  const numeric = parseBalanceAmount(value);
  if (numeric === undefined) return String(value ?? '--');
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function parseBalanceAmount(value: any) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatBalanceDetail(data: any) {
  const expiresAt = data?.subscription?.expires_at || data?.expires_at;
  const days = getRemainingDays(expiresAt);
  if (days !== undefined) {
    return days > 0 ? `剩余 ${days} 天` : '额度已到期';
  }
  return data?.planName || 'api2cn';
}

function formatUsageRemaining(data: any) {
  const value = data?.remaining !== undefined
    ? data.remaining
    : data?.quota_remaining !== undefined
      ? data.quota_remaining
      : data?.balance;
  const amount = formatBalanceValue(value);
  const unit = data?.unit ? ` ${data.unit}` : '';
  return `${amount}${unit}`;
}

function getRemainingDays(expiresAt: any) {
  if (!expiresAt) return undefined;
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return undefined;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
}

function PanelSettingsModal({ open, onClose, onLogout, locale }: { open: boolean; onClose: () => void; onLogout: () => void; locale: string }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) return;
    if (newPwd !== confirmPwd) {
      setMsg(locale === 'zh-CN' ? '两次输入的密码不一致' : 'Passwords do not match');
      setMsgOk(false);
      return;
    }
    if (newPwd.length < 4) {
      setMsg(locale === 'zh-CN' ? '密码至少4位' : 'Password must be at least 4 characters');
      setMsgOk(false);
      return;
    }
    setSaving(true);
    try {
      const r = await api.changePassword(oldPwd, newPwd);
      if (r?.ok) {
        setMsg(locale === 'zh-CN' ? '密码修改成功，即将退出登录...' : 'Password changed, logging out...');
        setMsgOk(true);
        setTimeout(() => {
          onClose();
          onLogout();
        }, 1600);
      } else {
        setMsg(r?.error === 'Wrong current password'
          ? (locale === 'zh-CN' ? '当前密码错误' : 'Current password is incorrect')
          : (r?.error || (locale === 'zh-CN' ? '修改失败' : 'Change failed')));
        setMsgOk(false);
      }
    } catch {
      setMsg(locale === 'zh-CN' ? '修改失败' : 'Change failed');
      setMsgOk(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/62 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] p-6 shadow-[var(--ui-shadow-strong)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] pb-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ui-accent)]">
              <Settings size={13} />
              {locale === 'zh-CN' ? '面板设置' : 'Panel Settings'}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
              {locale === 'zh-CN' ? '管理面板登录与本地设置' : 'Panel login and local settings'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {locale === 'zh-CN' ? '这里只放与 API2CN 面板自身相关的配置，不影响 OpenClaw 或 Hermes 平台参数。' : 'This dialog only contains API2CN-specific settings, separate from OpenClaw and Hermes.'}
            </p>
          </div>
          <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel)] text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-heading)]">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5">
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel)] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-accent-soft)] p-1.5 text-[var(--ui-accent)]">
                <Key size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{locale === 'zh-CN' ? '修改管理密码' : 'Change Admin Password'}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{locale === 'zh-CN' ? '修改后需重新登录面板。' : 'You will need to log in again after changing it.'}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder={locale === 'zh-CN' ? '当前密码' : 'Current password'} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900" />
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={locale === 'zh-CN' ? '新密码' : 'New password'} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900" />
                <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder={locale === 'zh-CN' ? '确认新密码' : 'Confirm password'} className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900" />
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {locale === 'zh-CN' ? '修改成功后会自动退出当前登录态，请使用新密码重新进入面板。' : 'After a successful change, the current session will be logged out automatically.'}
                </p>
                <button onClick={handleChangePassword} disabled={saving || !oldPwd || !newPwd || !confirmPwd} className="page-modern-accent px-4 py-2.5 text-xs font-medium disabled:opacity-50">
                  {saving ? (locale === 'zh-CN' ? '修改中...' : 'Saving...') : (locale === 'zh-CN' ? '修改密码' : 'Change Password')}
                </button>
              </div>
              {msg && (
                <div className={`rounded-lg border px-3 py-2 text-xs ${msgOk ? 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-red-100 bg-red-50 text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300'}`}>
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutShell({ onLogout, napcatStatus, wechatStatus, openclawStatus, processStatus, wsMessages }: Props) {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const enableAgents = import.meta.env.VITE_FEATURE_AGENTS !== 'false';
  const reducedPerfMode = useMemo(() => {
    const path = location.pathname;
    return [
      '/agents',
      '/monitor',
      '/channels',
      '/skills',
      '/plugins',
      '/workflows',
      '/workspace',
      '/config',
      '/sessions',
      '/logs',
      '/cron',
    ].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  }, [location.pathname]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskLogs, setTaskLogs] = useState<Record<string, string[]>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [panelSettingsOpen, setPanelSettingsOpen] = useState(false);
  const [hermesOverview, setHermesOverview] = useState<any | null>(null);
  const [keyBalance, setKeyBalance] = useState<{ loading: boolean; value?: string; amount?: number; error?: string; detail?: string }>({ loading: true });
  const [panelUpdate, setPanelUpdate] = useState<PanelUpdateSummary>({ loading: true, checking: false, navigating: false });
  const profileRef = useRef<HTMLDivElement | null>(null);
  const isHermesBoard = location.pathname === '/hermes' || location.pathname.startsWith('/hermes/');

  const loadTasks = useCallback(async () => {
    try {
      const [taskRes, workflowRes] = await Promise.all([
        api.getPanelTasks(),
        api.getWorkflowRuns(),
      ]);
      const taskItems = taskRes?.ok ? (taskRes.tasks || []) : [];
      const workflowItems = workflowRes?.ok ? (workflowRes.runs || []).map(mapWorkflowRunToTask) : [];
      setTasks(filterVisibleTasks(mergeTasks(taskItems, workflowItems)));
    } catch {}
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    const loadKeyBalance = () => {
      if (document.hidden) return;
      setKeyBalance(prev => ({ ...prev, loading: true }));
      api.getKeyBalance().then(r => {
        if (r?.ok) {
          setKeyBalance({
            loading: false,
            value: formatUsageRemaining(r),
            amount: parseBalanceAmount(r.remaining !== undefined ? r.remaining : r.quota_remaining !== undefined ? r.quota_remaining : r.balance),
            detail: formatBalanceDetail(r),
          });
        } else {
          setKeyBalance({ loading: false, error: r?.error || '余额获取失败' });
        }
      }).catch((err: any) => setKeyBalance({ loading: false, error: err?.message || '余额获取失败' }));
    };
    loadKeyBalance();
    const timer = setInterval(loadKeyBalance, 60000);
    const onVisible = () => { if (!document.hidden) loadKeyBalance(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const loadPanelUpdateSummary = useCallback(() => {
    if (document.hidden) return;
    setPanelUpdate(prev => ({ ...prev, loading: !prev.currentVersion, checking: true, error: undefined }));
    Promise.all([api.getPanelVersion(), api.checkPanelUpdate(true)]).then(([versionRes, updateRes]) => {
      if (!versionRes?.ok) {
        setPanelUpdate(prev => ({
          ...prev,
          loading: false,
          checking: false,
          currentVersion: prev.currentVersion,
          latestVersion: prev.latestVersion,
          error: versionRes?.error || '版本获取失败',
        }));
        return;
      }
      const currentVersion = String(versionRes.version || versionRes.currentVersion || '');
      if (!updateRes?.ok) {
        setPanelUpdate(prev => ({
          ...prev,
          loading: false,
          checking: false,
          currentVersion,
          latestVersion: currentVersion,
          hasUpdate: false,
          error: updateRes?.error || '更新检查失败',
        }));
        return;
      }
      setPanelUpdate(prev => ({
        ...prev,
        loading: false,
        checking: false,
        currentVersion,
        latestVersion: String(updateRes.latestVersion || currentVersion),
        hasUpdate: !!updateRes.hasUpdate,
        error: undefined,
      }));
    }).catch((err: any) => {
      setPanelUpdate(prev => ({
        ...prev,
        loading: false,
        checking: false,
        error: err?.message || '更新检查失败',
      }));
    });
  }, []);

  useEffect(() => {
    loadPanelUpdateSummary();
    const timer = setInterval(loadPanelUpdateSummary, 30 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) loadPanelUpdateSummary(); };
    window.addEventListener('focus', loadPanelUpdateSummary);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', loadPanelUpdateSummary);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadPanelUpdateSummary]);

  const handlePanelUpdateClick = useCallback(async () => {
    if (!panelUpdate.hasUpdate || panelUpdate.navigating) return;
    setPanelUpdate(prev => ({ ...prev, navigating: true }));
    try {
      const r = await api.generateUpdateToken();
      if (r?.ok && r.updaterURL) {
        window.open(r.updaterURL, '_blank');
      } else {
        const error = r?.error || (locale === 'zh-CN' ? '生成更新令牌失败' : 'Failed to generate update token');
        if (error.includes('认证令牌无效') || error.includes('未提供认证令牌')) {
          localStorage.removeItem('admin-token');
          window.alert(locale === 'zh-CN' ? '登录状态已过期，请重新登录后再试更新。' : 'Login expired. Please sign in again before updating.');
          window.location.href = '/login';
          return;
        }
        window.alert(error);
      }
    } catch (err: any) {
      window.alert(err?.message || (locale === 'zh-CN' ? '打开更新页面失败' : 'Failed to open updater'));
    } finally {
      setPanelUpdate(prev => ({ ...prev, navigating: false }));
    }
  }, [locale, panelUpdate.hasUpdate, panelUpdate.navigating]);

  useEffect(() => {
	if (!tasks.some(task => task.status === 'running' || task.status === 'pending')) return;
	const timer = setInterval(() => {
	  loadTasks();
	}, 2500);
	return () => clearInterval(timer);
  }, [tasks, loadTasks]);

  // Listen for WebSocket task events
  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;
    const last = wsMessages[wsMessages.length - 1];
    if (last?.type === 'task_update') {
      setTasks(prev => {
        if (last.task?.type === 'workflow_run' && last.task?.status === 'canceled') {
          return prev.filter(t => t.id !== last.task.id);
        }
        const idx = prev.findIndex(t => t.id === last.task.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], ...last.task }; return n; }
        return [last.task, ...prev];
      });
    } else if (last?.type === 'task_log') {
      setTaskLogs(prev => ({
        ...prev,
        [last.taskId]: [...(prev[last.taskId] || []), last.line],
      }));
    }
  }, [wsMessages]);

  const openClawNavItems = useMemo(() => [
    { to: '/', icon: LayoutDashboard, label: t.nav.dashboard },
    { to: '/config', icon: Settings, label: t.nav.systemConfig },
    { to: '/chat', icon: MessageSquare, label: t.nav.panelChat },
    { to: '/channels', icon: Radio, label: t.nav.channels },
    { to: '/skills', icon: Sparkles, label: t.nav.skills },
    { to: '/plugins', icon: Puzzle, label: locale === 'zh-CN' ? '插件中心' : 'Plugins' },
    ...(enableAgents ? [{ to: '/agents', icon: Bot, label: locale === 'zh-CN' ? '智能体' : 'Agents' }] : []),
    { to: '/company', icon: BriefcaseBusiness, label: locale === 'zh-CN' ? 'AI公司' : 'AI Company' },
    { to: '/cron', icon: Clock, label: t.nav.cronJobs },
    { to: '/tasks', icon: Activity, label: locale === 'zh-CN' ? '后台任务' : 'Tasks' },
  ], [enableAgents, locale, t]);

  const hermesNavItems = useMemo(() => [
    { to: '/hermes', icon: Brain, label: locale === 'zh-CN' ? '概览' : 'Overview' },
    { to: '/hermes/config', icon: Settings, label: locale === 'zh-CN' ? '模型配置' : 'Config' },
    { to: '/hermes/platforms', icon: Radio, label: locale === 'zh-CN' ? '通道管理' : 'Platforms' },
    { to: '/hermes/tasks', icon: Activity, label: locale === 'zh-CN' ? '任务' : 'Tasks' },
    { to: '/hermes/sessions', icon: MessageSquare, label: locale === 'zh-CN' ? '会话' : 'Sessions' },
    { to: '/hermes/personality', icon: Bot, label: locale === 'zh-CN' ? '人格与路由' : 'Personality & Routing' },
    { to: '/hermes/health', icon: Bell, label: locale === 'zh-CN' ? '健康' : 'Health' },
    { to: '/hermes/logs', icon: ScrollText, label: locale === 'zh-CN' ? '日志' : 'Logs' },
  ], [locale]);

  const openClawMobileNavItems = useMemo(() => [
    { to: '/', icon: LayoutDashboard, label: t.nav.dashboard },
    { to: '/config', icon: Settings, label: t.nav.systemConfig },
    { to: '/chat', icon: MessageSquare, label: t.nav.panelChat },
    { to: '/channels', icon: Radio, label: t.nav.channels },
    ...(enableAgents ? [{ to: '/agents', icon: Bot, label: locale === 'zh-CN' ? '智能体' : 'Agents' }] : [{ to: '/plugins', icon: Puzzle, label: locale === 'zh-CN' ? '插件' : 'Plugins' }]),
    { to: '/company', icon: BriefcaseBusiness, label: locale === 'zh-CN' ? 'AI公司' : 'Company' },
  ], [enableAgents, locale, t]);

  const hermesMobileNavItems = useMemo(() => [
    { to: '/hermes', icon: Brain, label: locale === 'zh-CN' ? '概览' : 'Overview' },
    { to: '/hermes/health', icon: Bell, label: locale === 'zh-CN' ? '健康' : 'Health' },
    { to: '/hermes/platforms', icon: Radio, label: locale === 'zh-CN' ? '平台' : 'Platforms' },
    { to: '/hermes/tasks', icon: Activity, label: locale === 'zh-CN' ? '任务' : 'Tasks' },
  ], [locale]);

  const navItems = isHermesBoard ? hermesNavItems : openClawNavItems;
  const mobileNavItems = isHermesBoard ? hermesMobileNavItems : openClawMobileNavItems;
  const activeAgent = isHermesBoard
    ? {
        id: 'hermes',
        name: 'Hermes',
        subtitle: locale === 'zh-CN' ? '独立 Agent 控制台' : 'Independent Agent Console',
      }
    : {
        id: 'openclaw',
        name: 'OpenClaw',
        subtitle: locale === 'zh-CN' ? '可视化管理面板' : 'Visual Control Panel',
      };

  const [dark, setDark] = useState(() => {
    const s = localStorage.getItem('theme');
    if (s === 'dark' || (!s && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      return true;
    }
    return false;
  });
  const [open, setOpen] = useState(false);
  const outletContext = useMemo(() => ({ uiMode: 'modern' as const }), []);

  useEffect(() => {
    document.body.dataset.uiMode = 'modern';
    return () => {
      delete document.body.dataset.uiMode;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_AGENT_KEY, isHermesBoard ? 'hermes' : 'openclaw');
    } catch {}
  }, [isHermesBoard]);

  useEffect(() => {
    if (!isHermesBoard) return;
    let cancelled = false;

    const loadHermesOverview = async () => {
      try {
        const res = await api.getHermesOverview();
        if (!cancelled && res?.ok) {
          setHermesOverview(res.overview || null);
        }
      } catch {}
    };

    void loadHermesOverview();
    const timer = window.setInterval(loadHermesOverview, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isHermesBoard]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const toggleDark = () => {
    setDark(d => {
      const n = !d;
      localStorage.setItem('theme', n ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', n);
      return n;
    });
  };

  const toggleLocale = () => {
    setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN');
  };

  const handleSearchGo = (path: string) => {
    try {
      localStorage.setItem(ACTIVE_AGENT_KEY, path === '/hermes' || path.startsWith('/hermes/') ? 'hermes' : 'openclaw');
    } catch {}
    navigate(path);
    setOpen(false);
    setProfileOpen(false);
  };

  // Build channel list from enabledChannels returned by /api/status
  const connectedChannels = useMemo(() => {
    if (isHermesBoard) {
		const hermesPlatforms = Array.isArray(hermesOverview?.platforms?.platforms) ? hermesOverview.platforms.platforms : [];
		const hermesChannels: RuntimeChannelSummary[] = hermesPlatforms
			.filter((platform: any) => platform?.enabled)
			.map((platform: any) => {
				const connected = platform?.runtimeStatus === 'healthy' || platform?.runtimeStatus === 'warning';
				const detail = platform?.runtimeStatus === 'error'
					? (locale === 'zh-CN' ? '运行异常' : 'Runtime Error')
					: connected
						? (locale === 'zh-CN' ? '运行中' : 'Running')
						: platform?.enabled
							? (locale === 'zh-CN' ? '已启用' : 'Enabled')
							: (locale === 'zh-CN' ? '未启用' : 'Not enabled');
				return {
					label: platform?.label || platform?.id || 'Platform',
					detail,
            connected,
          };
        });

      hermesChannels.sort((a: RuntimeChannelSummary, b: RuntimeChannelSummary) => (a.connected === b.connected ? a.label.localeCompare(b.label) : a.connected ? -1 : 1));
      return hermesChannels.slice(0, 5);
    }

    const enabledChannels: { id: string; label: string }[] = (openclawStatus?.enabledChannels || [])
      .map((ch: { id: string; label: string }) => ({
        ...ch,
        id: ch.id === 'qqbot-community' ? 'qqbot' : ch.id,
      }))
      .filter((ch: { id: string }) => DISPLAY_CHANNEL_IDS.has(ch.id));
    const channels: RuntimeChannelSummary[] = [];

    for (const ch of enabledChannels) {
      if (ch.id === 'qq') {
        const connected = napcatStatus?.connected;
        channels.push({
          label: 'QQ',
          detail: connected ? `${napcatStatus.nickname || 'QQ'} (${napcatStatus.selfId || ''})` : t.common.notLoggedIn,
          connected: !!connected,
        });
      } else if (ch.id === 'wechat') {
        channels.push({
          label: locale === 'zh-CN' ? '微信' : 'WeChat',
          detail: wechatStatus?.loggedIn ? (wechatStatus.name || t.common.connected) : t.common.notLoggedIn,
          connected: !!wechatStatus?.loggedIn,
        });
      } else if (ch.id === 'wecom') {
        channels.push({
          label: locale === 'zh-CN' ? '企业微信（机器人）' : 'WeCom Bot',
          detail: t.common.enabled,
          connected: true,
        });
      } else if (ch.id === 'wecom-app') {
        channels.push({
          label: locale === 'zh-CN' ? '企业微信（自建应用）' : 'WeCom App',
          detail: t.common.enabled,
          connected: true,
        });
      } else {
        channels.push({ label: ch.label, detail: t.common.enabled, connected: true });
      }
    }

    // Sort: connected channels first, then alphabetical; limit to 5
    channels.sort((a, b) => (a.connected === b.connected ? a.label.localeCompare(b.label) : a.connected ? -1 : 1));
    return channels.slice(0, 5);
  }, [hermesOverview, isHermesBoard, locale, napcatStatus, openclawStatus, t, wechatStatus]);
  const totalEnabledChannels = isHermesBoard
    ? (hermesOverview?.platforms?.platforms || []).filter((platform: any) => platform?.enabled).length
    : (openclawStatus?.enabledChannels || []).length;
  const runtime = useMemo(() => resolveOpenClawRuntime(openclawStatus, processStatus), [openclawStatus, processStatus]);
  const openClawRestartHint = processStatus?.managedExternally
    ? (locale === 'zh-CN' ? '当前 OpenClaw 由外部进程管理，请改用“网关”按钮或在外部环境中重启。' : 'OpenClaw is managed externally. Use “Gateway” or restart it outside the panel.')
    : processStatus?.daemonized
      ? (locale === 'zh-CN' ? '当前 OpenClaw 以 daemon 模式运行，请改用“网关”按钮重启。' : 'OpenClaw is running in daemon mode. Use “Gateway” to restart it.')
      : '';
  const openClawRestartDisabled = !!openClawRestartHint;

  return (
    <div className="flex h-screen overflow-hidden ui-modern-shell" data-ui-perf={reducedPerfMode ? 'reduced' : undefined}>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/56 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[320px] flex-col ui-modern-sidebar transition-transform duration-300 lg:static lg:w-64 lg:max-w-none lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="border-b border-[var(--ui-border)] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] shadow-sm">
              <img src="/logo.jpg" alt="API2CN" className="h-8 w-8 rounded-md object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black tracking-[-0.02em] text-[var(--ui-heading)]">API2CN</h1>
              <p className="-mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-faint)]">{activeAgent.name} · {activeAgent.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Connected channel indicators */}
        {connectedChannels.length > 0 && (
          <div className="space-y-2 border-b border-[var(--ui-border)] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ui-faint)]">
              {isHermesBoard ? (locale === 'zh-CN' ? '运行中的平台' : 'Active Platforms') : t.nav.runningStatus}
            </div>
            {connectedChannels.map((ch: RuntimeChannelSummary) => (
              <div key={ch.label} className="flex items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] px-2.5 py-2 text-xs">
                <span className={`relative flex h-2 w-2 shrink-0`}>
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${ch.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-gray-600 dark:text-gray-300 font-medium block truncate">{ch.label}</span>
                  <span className="text-[10px] text-gray-400 block truncate">{ch.detail}</span>
                </div>
              </div>
            ))}
            {totalEnabledChannels > connectedChannels.length && (
              <div className="text-[10px] text-slate-400 pl-4">+{totalEnabledChannels - connectedChannels.length} {locale === 'zh-CN' ? '个通道' : 'more'}</div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 ui-modern-scrollbar">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/' || to === '/hermes'} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `ui-modern-nav-link group flex items-center gap-3 px-3.5 py-2.5 pl-4 text-[13px] transition-colors ${isActive ? 'active font-bold' : 'font-semibold'}`
              }>
              <Icon size={17} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-[var(--ui-border)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:pb-2">
          <button onClick={toggleLocale} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-panel-muted)] hover:text-[var(--ui-heading)]">
            <Languages size={16} />{locale === 'zh-CN' ? 'English' : '中文（简体）'}
          </button>
          {/* Quick actions */}
          <div className="flex items-center gap-1 px-1 py-1">
            {isHermesBoard ? (
              <>
                <button
                  onClick={() => handleSearchGo('/hermes')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[11px] font-bold text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-panel-strong)]"
                  title="Hermes"
                >
                  <Brain size={13} /><span>Hermes</span>
                </button>
                <button
                  onClick={() => window.open('https://hermes-agent.nousresearch.com/docs/', '_blank', 'noopener,noreferrer')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[11px] font-bold text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-panel-strong)]"
                  title={locale === 'zh-CN' ? 'Hermes 文档' : 'Hermes Docs'}
                >
                  <Search size={13} /><span>{locale === 'zh-CN' ? '文档' : 'Docs'}</span>
                </button>
                <button
                  onClick={async () => { if (!confirm(locale === 'zh-CN' ? '确定重启 API2CN？页面将短暂断开。' : 'Restart API2CN? Page will briefly disconnect.')) return; try { await api.restartPanel(); setTimeout(() => window.location.reload(), 3000); } catch {} }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[11px] font-bold text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-panel-strong)]"
                  title={locale === 'zh-CN' ? '重启面板' : 'Restart Panel'}
                >
                  <Power size={13} /><span>{locale === 'zh-CN' ? '重启面板' : 'Restart Panel'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={async () => {
                    if (openClawRestartDisabled) {
                      window.alert(openClawRestartHint);
                      return;
                    }
                    if (!confirm(locale === 'zh-CN' ? '确定重启 OpenClaw？' : 'Restart OpenClaw?')) return;
                    try {
                      const r = await api.restartProcess();
                      if (!r?.ok) window.alert(r?.error || (locale === 'zh-CN' ? '重启 OpenClaw 失败' : 'Failed to restart OpenClaw'));
                    } catch {
                      window.alert(locale === 'zh-CN' ? '重启 OpenClaw 失败' : 'Failed to restart OpenClaw');
                    }
                  }}
                  aria-disabled={openClawRestartDisabled}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    openClawRestartDisabled
                      ? 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60'
                      : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                  title={openClawRestartHint || (locale === 'zh-CN' ? '重启 OpenClaw' : 'Restart OpenClaw')}
                >
                  <RotateCw size={13} /><span>{locale === 'zh-CN' ? '重启 OpenClaw' : 'Restart OpenClaw'}</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await api.restartGateway();
                      if (!r?.ok) window.alert(r?.error || (locale === 'zh-CN' ? '重启网关失败' : 'Failed to restart gateway'));
                    } catch {
                      window.alert(locale === 'zh-CN' ? '重启网关失败' : 'Failed to restart gateway');
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[11px] font-bold text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-panel-strong)]"
                  title={locale === 'zh-CN' ? '重启网关' : 'Restart Gateway'}
                >
                  <RefreshCw size={13} /><span>{locale === 'zh-CN' ? '重启网关' : 'Restart Gateway'}</span>
                </button>
                <button
                  onClick={async () => { if (!confirm(locale === 'zh-CN' ? '确定重启 API2CN？页面将短暂断开。' : 'Restart API2CN? Page will briefly disconnect.')) return; try { await api.restartPanel(); setTimeout(() => window.location.reload(), 3000); } catch {} }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] text-[11px] font-bold text-[var(--ui-accent)] transition-colors hover:bg-[var(--ui-panel-strong)]"
                  title={locale === 'zh-CN' ? '重启面板' : 'Restart Panel'}
                >
                  <Power size={13} /><span>{locale === 'zh-CN' ? '重启面板' : 'Restart Panel'}</span>
                </button>
              </>
            )}
          </div>
          <button onClick={onLogout} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 w-full">
            <LogOut size={16} />{t.nav.logout}
          </button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden bg-transparent">
          <header className="relative z-[160] hidden items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-panel)] px-6 py-3 lg:flex">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setOpen(true)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white/90 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors lg:hidden">
                <Menu size={18} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden min-w-[220px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] px-3 py-2 shadow-sm 2xl:block" title={panelUpdate.error || undefined}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    panelUpdate.error
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                      : panelUpdate.hasUpdate
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'
                  }`}>
                    {panelUpdate.checking ? <RefreshCw size={16} className="animate-spin" /> : <GitBranch size={16} />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ui-muted)]">
                      {locale === 'zh-CN' ? '系统版本' : 'System Version'}
                    </div>
                    <div className="flex min-w-0 items-center gap-1 text-sm font-black">
                      <span className="truncate font-mono text-[var(--ui-heading)]">
                        {panelUpdate.loading ? '...' : (panelUpdate.currentVersion || '--')}
                      </span>
                      <span className="text-[var(--ui-faint)]">→</span>
                      {panelUpdate.hasUpdate ? (
                        <button
                          type="button"
                          onClick={handlePanelUpdateClick}
                          disabled={panelUpdate.navigating}
                          className="truncate font-mono text-blue-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-blue-300"
                          title={locale === 'zh-CN' ? '点击前往在线更新 ClawPanel 管理系统' : 'Click to update ClawPanel online'}
                        >
                          {panelUpdate.navigating ? '...' : (panelUpdate.latestVersion || '--')}
                        </button>
                      ) : (
                        <span className={`${panelUpdate.error ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'} truncate font-mono`}>
                          {panelUpdate.latestVersion || panelUpdate.currentVersion || '--'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="hidden min-w-[180px] rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] px-3 py-2 shadow-sm 2xl:block">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    keyBalance.error
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                      : keyBalance.amount !== undefined && keyBalance.amount < 20
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'
                  }`}>
                    <Wallet size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ui-muted)]">API2CN 额度</div>
                    <div className={`truncate text-sm font-black ${
                      keyBalance.error
                        ? 'text-amber-600 dark:text-amber-300'
                        : keyBalance.amount !== undefined && keyBalance.amount < 20
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {keyBalance.loading ? '...' : (keyBalance.value || '--')}
                    </div>
                    {!keyBalance.loading && !keyBalance.error && keyBalance.detail && (
                      <div className="truncate text-[10px] font-medium text-[var(--ui-muted)]">
                        {keyBalance.detail}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            <button onClick={toggleDark} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] text-[var(--ui-muted)] transition-colors hover:text-[var(--ui-heading)]">
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <MessageCenter tasks={tasks} taskLogs={taskLogs} onRefresh={loadTasks} mode="icon" />
              <div ref={profileRef} className="relative">
                <button onClick={() => setProfileOpen(v => !v)} className="flex items-center gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] py-1.5 pl-2 pr-3 transition-colors hover:bg-[var(--ui-elevated)]">
                  <img src="/logo.jpg" alt="avatar" className="h-8 w-8 rounded-md object-cover" />
                  <div className="text-left leading-tight">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{activeAgent.name}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      {locale === 'zh-CN' ? '切换 Agent 视图' : 'Switch agent view'}
                    </div>
                  </div>
                  <ChevronDown size={14} className="text-slate-400" />
                </button>
                {profileOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 rounded-2xl ui-modern-card p-2 z-50">
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {locale === 'zh-CN' ? 'Agent 视图' : 'Agent Views'}
                    </div>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        handleSearchGo('/');
                      }}
                      className={`mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        !isHermesBoard ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <LayoutDashboard size={16} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">OpenClaw</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {locale === 'zh-CN' ? 'OpenClaw 可视化管理面板' : 'OpenClaw visual management board'}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        handleSearchGo('/hermes');
                      }}
                      className={`mb-2 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isHermesBoard ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Brain size={16} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">Hermes</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {locale === 'zh-CN' ? 'Hermes 独立 Agent 控制台' : 'Hermes independent agent console'}
                        </span>
                      </span>
                    </button>
                    <div className="mx-2 mb-2 border-t border-slate-200/80 dark:border-slate-700/80" />
                    <div className="px-3 pb-2 text-[11px] text-slate-400">
                      {locale === 'zh-CN' ? '面板设置' : 'Panel Settings'}
                    </div>
                    <button onClick={() => { setProfileOpen(false); setPanelSettingsOpen(true); }} className="mb-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800">
                      <Settings size={15} /> {locale === 'zh-CN' ? '面板设置' : 'Panel Settings'}
                    </button>
                    <button onClick={() => { setProfileOpen(false); onLogout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors">
                      <LogOut size={15} /> 退出登录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
        <header className="shrink-0 border-b border-[var(--ui-border)] bg-[var(--ui-panel)] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setOpen(true)} className="page-modern-action h-11 w-11 rounded-2xl p-0">
              <Menu size={19} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] px-3 py-2.5 shadow-sm">
              <img src="/logo.jpg" alt="API2CN" className="h-9 w-9 rounded-md object-cover shadow-sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">API2CN</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">{isHermesBoard ? (locale === 'zh-CN' ? 'Hermes 板块' : 'Hermes Board') : (locale === 'zh-CN' ? '移动端控制台' : 'Mobile Console')}</div>
              </div>
            </div>
            <button onClick={toggleDark} className="page-modern-action h-11 w-11 rounded-2xl p-0">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <MessageCenter tasks={tasks} taskLogs={taskLogs} onRefresh={loadTasks} mode="icon" />
          </div>
        </header>
        {!isHermesBoard && openclawStatus?.configured && !runtime.healthy && (
          <div className="px-3 pt-3 sm:px-4 lg:px-6 xl:px-7">
            <div className={`rounded-xl border px-4 py-3 shadow-[var(--ui-shadow)] ${runtime.state === 'offline' ? 'border-red-300/70 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/24' : 'border-amber-300/70 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/24'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-2xl p-2 ${runtime.state === 'offline' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                  <Bell size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${runtime.state === 'offline' ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>{runtime.title}</div>
                  <div className={`mt-1 text-xs leading-5 ${runtime.state === 'offline' ? 'text-red-700 dark:text-red-200/90' : 'text-amber-800 dark:text-amber-200/90'}`}>{runtime.message}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="ui-modern-content flex-1 overflow-y-auto ui-modern-scrollbar p-3 pb-24 sm:p-4 sm:pb-28 lg:p-6 lg:pb-6 xl:p-7"><Outlet context={outletContext} /></div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ui-border)] bg-[var(--ui-panel)] px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <div className={`grid gap-2 ${isHermesBoard ? 'grid-cols-5' : 'grid-cols-5'}`}>
          {mobileNavItems.map(({ to, icon: Icon, label }) => {
            const active = to === '/hermes'
              ? location.pathname === '/hermes'
              : location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <button key={to} onClick={() => handleSearchGo(to)} className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-bold transition-colors ${active ? 'border-[var(--ui-border-strong)] bg-[var(--ui-panel-strong)] text-[var(--ui-accent)] shadow-sm' : 'border-transparent bg-transparent text-[var(--ui-muted)]'}`}>
                <Icon size={17} />
                <span className="truncate px-1">{label}</span>
              </button>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-lg bg-transparent text-[11px] font-bold text-[var(--ui-muted)]">
            <Menu size={17} />
            <span>{locale === 'zh-CN' ? '更多' : 'More'}</span>
          </button>
        </div>
      </nav>
      <AIAssistant />
      <PanelSettingsModal open={panelSettingsOpen} onClose={() => setPanelSettingsOpen(false)} onLogout={onLogout} locale={locale} />
    </div>
  );
}

export default memo(LayoutShell);
