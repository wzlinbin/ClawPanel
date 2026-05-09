import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { RefreshCw, Play, TerminalSquare, Wrench, Sparkles, Clock3, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';

interface HermesAction {
  id: string;
  label: string;
  description?: string;
  command?: string;
}

interface HermesTask {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'canceled';
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  log?: string[];
}

function statusTone(status: HermesTask['status']) {
  if (status === 'running') return 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-200';
  if (status === 'pending') return 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-200';
  if (status === 'success') return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-200';
  if (status === 'failed') return 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-200';
  return 'text-gray-700 bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
}

export default function HermesActions() {
  const { locale } = useI18n();
  const { uiMode } = (useOutletContext() as { uiMode?: 'modern' }) || {};
  const navigate = useNavigate();
  const modern = uiMode === 'modern';
  const [actions, setActions] = useState<HermesAction[]>([]);
  const [tasks, setTasks] = useState<HermesTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [actionRes, taskRes] = await Promise.all([
        api.getHermesActions(),
        api.getHermesTasks(),
      ]);
      if (actionRes?.ok) setActions(Array.isArray(actionRes.actions) ? actionRes.actions.filter((action: HermesAction) => action.id !== 'pairing-approve') : []);
      if (taskRes?.ok) setTasks(Array.isArray(taskRes.tasks) ? taskRes.tasks : []);
    } catch {
      setErr(locale === 'zh-CN' ? '\u52a0\u8f7d Hermes \u52a8\u4f5c\u5931\u8d25' : 'Failed to load Hermes actions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!tasks.some(task => task.status === 'running' || task.status === 'pending')) return;
    const timer = setInterval(() => {
      void load();
    }, 2500);
    return () => clearInterval(timer);
  }, [tasks]);

  const summary = useMemo(() => tasks.reduce((acc, task) => {
    acc.total += 1;
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, { total: 0, pending: 0, running: 0, success: 0, failed: 0, canceled: 0 } as Record<string, number>), [tasks]);

  const focusTask = useMemo(
    () => tasks.find(task => task.status === 'running') || tasks.find(task => task.status === 'pending') || tasks[0] || null,
    [tasks],
  );
  const runAction = async (action: HermesAction) => {
    setRunningAction(action.id);
    setMsg('');
    setErr('');
    try {
      const res = await api.runHermesAction(action.id);
      if (!res?.ok) {
        setErr(res?.error || (locale === 'zh-CN' ? '\u89e6\u53d1 Hermes \u52a8\u4f5c\u5931\u8d25' : 'Failed to run Hermes action'));
        return;
      }
      setMsg(locale === 'zh-CN'
        ? `\u5df2\u89e6\u53d1 ${action.label}\uff0c\u4efb\u52a1 ID: ${res.taskId || '-'}`
        : `${action.label} triggered. Task ID: ${res.taskId || '-'}`);
      await load();
    } catch {
      setErr(locale === 'zh-CN' ? '\u89e6\u53d1 Hermes \u52a8\u4f5c\u5931\u8d25' : 'Failed to run Hermes action');
    } finally {
      setRunningAction('');
    }
  };

  return (
    <div className={`space-y-6 ${modern ? 'page-modern' : ''}`}>
      <div className={`${modern ? 'page-modern-header' : 'flex items-center justify-between'}`}>
        <div>
          <h2 className={`${modern ? 'page-modern-title text-xl' : 'text-xl font-bold text-gray-900 dark:text-white'}`}>
            {locale === 'zh-CN' ? 'Hermes \u52a8\u4f5c\u4e2d\u5fc3' : 'Hermes Actions'}
          </h2>
          <p className={`${modern ? 'page-modern-subtitle mt-1 text-sm' : 'mt-1 text-sm text-gray-500'}`}>
            {locale === 'zh-CN'
              ? '\u7edf\u4e00\u89e6\u53d1 doctor\u3001update \u548c gateway \u7b49 Hermes CLI \u52a8\u4f5c\uff0c\u5e76\u548c\u4efb\u52a1\u8d26\u672c\u8054\u52a8\u67e5\u770b\u7ed3\u679c\u3002'
              : 'Run Hermes CLI actions such as doctor, update, and gateway operations with task feedback.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/hermes/tasks')}
            className={`${modern ? 'page-modern-action px-3 py-2 text-xs' : 'rounded-lg bg-gray-100 px-3 py-2 text-xs dark:bg-gray-800'}`}
          >
            {locale === 'zh-CN' ? '\u4efb\u52a1\u8d26\u672c' : 'Task Ledger'}
          </button>
          <button
            onClick={() => void load()}
            className={`${modern ? 'page-modern-action px-3 py-2 text-xs' : 'rounded-lg bg-gray-100 px-3 py-2 text-xs dark:bg-gray-800'} inline-flex items-center gap-2`}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {locale === 'zh-CN' ? '\u5237\u65b0' : 'Refresh'}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-300">{msg}</div>}
      {err && <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">{err}</div>}

      <div className={`${modern ? 'rounded-[30px] border border-white/60 dark:border-slate-700/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(239,246,255,0.68))] dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.9),rgba(30,64,175,0.12))] backdrop-blur-xl shadow-[0_24px_54px_rgba(15,23,42,0.08)]' : 'rounded-2xl border border-gray-100 bg-white dark:bg-gray-800 dark:border-gray-700/50'} p-5`}>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-400/15 dark:bg-slate-900/50 dark:text-blue-200">
              <Sparkles size={13} />
              {locale === 'zh-CN' ? '\u52a8\u4f5c\u6267\u884c\u53f0' : 'Action Control'}
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {locale === 'zh-CN'
                ? '\u628a\u5e38\u7528 CLI \u52a8\u4f5c\u505a\u6210\u9762\u677f\u91cc\u7684\u53ef\u6267\u884c\u64cd\u4f5c'
                : 'Turn common CLI operations into direct panel actions'}
            </div>
            <div className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {locale === 'zh-CN'
              ? '\u8fd9\u91cc\u9002\u5408\u6267\u884c doctor\u3001gateway restart \u548c update \u8fd9\u7c7b\u660e\u786e\u7684\u4e00\u6b65\u64cd\u4f5c\u3002'
                : 'Use this area for clear one-step operations like doctor, gateway restart, and update.'}
            </div>
          </div>
          <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] dark:border-slate-700/50 dark:bg-slate-900/45">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {locale === 'zh-CN' ? '\u5f53\u524d\u4efb\u52a1\u7126\u70b9' : 'Task Focus'}
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  {focusTask?.name || (locale === 'zh-CN' ? '\u5f53\u524d\u6ca1\u6709\u6d3b\u8dc3\u4efb\u52a1' : 'No active task')}
                </div>
              </div>
              {focusTask && <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${statusTone(focusTask.status)}`}>{focusTask.status}</span>}
            </div>
            <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {focusTask
                ? `${focusTask.type} 璺?${focusTask.updatedAt}`
                : (locale === 'zh-CN' ? '\u6700\u8fd1\u6ca1\u6709 Hermes \u52a8\u4f5c\u6b63\u5728\u6267\u884c\u3002' : 'No Hermes action is currently active.')}
            </div>
            {focusTask && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{locale === 'zh-CN' ? '\u8fdb\u5ea6' : 'Progress'}</span>
                  <span>{focusTask.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(6, focusTask.progress || 0)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: locale === 'zh-CN' ? '\u52a8\u4f5c\u603b\u6570' : 'Actions', value: actions.length },
          { label: locale === 'zh-CN' ? '\u8fd0\u884c\u4e2d' : 'Running', value: summary.running || 0 },
          { label: locale === 'zh-CN' ? '\u5f85\u5904\u7406' : 'Pending', value: summary.pending || 0 },
          { label: locale === 'zh-CN' ? '\u5931\u8d25' : 'Failed', value: summary.failed || 0 },
        ].map(card => (
          <div key={card.label} className={`${modern ? 'page-modern-card' : 'bg-white dark:bg-gray-800'} rounded-2xl border border-gray-100 p-4 dark:border-gray-700/50`}>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{card.label}</div>
            <div className="mt-3 text-lg font-bold text-gray-900 dark:text-white">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {actions.map(action => {
            const commandPreview = action.command || action.id;
            return (
              <div key={action.id} className={`${modern ? 'page-modern-panel' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50'} relative overflow-hidden rounded-[28px] p-5`}>
                <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-slate-200/20" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
                      <TerminalSquare size={16} className="text-blue-500" />
                      <span className="truncate">{action.label}</span>
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{action.description || '-'}</div>
                  </div>
                  <button
                    onClick={() => void runAction(action)}
                    disabled={runningAction === action.id}
                    className={`${modern ? 'page-modern-accent px-3 py-2 text-xs disabled:opacity-50' : 'rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50'} shrink-0 inline-flex items-center gap-2`}
                  >
                    {runningAction === action.id ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {locale === 'zh-CN' ? '\u6267\u884c' : 'Run'}
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <Clock3 size={12} />
                  <span>{locale === 'zh-CN' ? 'CLI \u547d\u4ee4\u9884\u89c8' : 'CLI Command Preview'}</span>
                </div>
                <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-xs font-mono text-gray-700 dark:border-gray-700/50 dark:bg-gray-900/40 dark:text-gray-200">
                  {commandPreview}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`${modern ? 'page-modern-panel' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50'} rounded-2xl p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Wrench size={17} className="text-blue-500" />
              {locale === 'zh-CN' ? '\u6700\u8fd1\u52a8\u4f5c\u4efb\u52a1' : 'Recent Hermes Tasks'}
            </div>
            <button
              onClick={() => navigate('/hermes/tasks')}
              className={`${modern ? 'page-modern-action px-3 py-2 text-xs' : 'rounded-lg bg-gray-100 px-3 py-2 text-xs dark:bg-gray-800'}`}
            >
              {locale === 'zh-CN' ? '\u5c55\u5f00\u5168\u90e8' : 'View All'}
            </button>
          </div>
          <div className="space-y-3">
            {tasks.slice(0, 8).map(task => (
              <button
                key={task.id}
                onClick={() => navigate(`/hermes/tasks?task=${encodeURIComponent(task.id)}`)}
                className="w-full rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-left transition-colors hover:bg-gray-100/80 dark:border-gray-700/50 dark:bg-gray-900/40 dark:hover:bg-gray-900/70"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900 dark:text-white">{task.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{task.type}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusTone(task.status)}`}>
                    {task.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span>{task.updatedAt}</span>
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-300">
                    {locale === 'zh-CN' ? '\u67e5\u770b\u8be6\u60c5' : 'Open'}
                    <ArrowRight size={12} />
                  </span>
                </div>
              </button>
            ))}
            {tasks.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-gray-700/50 dark:text-gray-400">
                {locale === 'zh-CN' ? '\u5f53\u524d\u8fd8\u6ca1\u6709 Hermes \u52a8\u4f5c\u4efb\u52a1' : 'No Hermes tasks yet'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
