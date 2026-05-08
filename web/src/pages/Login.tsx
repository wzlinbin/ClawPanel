import { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n';

export default function Login({ onLogin }: { onLogin: (pw: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const isDemo = import.meta.env.VITE_DEMO === 'true';
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.dataset.uiMode = 'modern';
    return () => {
      delete document.body.dataset.uiMode;
    };
  }, []);

  const submit = async () => {
    if (loading || !pw) return;
    setLoading(true);
    setErr('');
    const ok = await onLogin(pw);
    if (!ok) setErr(t.login.wrongPassword);
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <div className="min-h-screen overflow-hidden bg-transparent p-4 sm:p-6">
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl place-items-center">
        <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-panel)] shadow-[var(--ui-shadow-strong)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden border-r border-[var(--ui-border)] bg-[var(--ui-panel-muted)] p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--ui-accent)]">
                <ShieldCheck size={13} />
                Control Gate
              </div>
              <h1 className="mt-8 text-4xl font-black tracking-[-0.05em] text-[var(--ui-heading)]">ClawPanel</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--ui-muted)]">{t.login.subtitle}</p>
            </div>
            <div className="space-y-3 text-xs text-[var(--ui-faint)]">
              <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-3"><span>Runtime</span><span className="font-bold text-[var(--ui-heading)]">OpenClaw</span></div>
              <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-3"><span>Access</span><span className="font-bold text-[var(--ui-heading)]">Local Panel</span></div>
              <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-3"><span>Mode</span><span className="font-bold text-[var(--ui-heading)]">Operator</span></div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <img src="/logo.png" alt="API2CN" className="h-auto w-44 max-w-full object-contain sm:w-52" />
              <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-muted)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ui-accent)]">
                <ShieldCheck size={12} />
                <span>{t.login.subtitle}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto max-w-md">
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--ui-muted)]">{t.login.passwordLabel}</label>
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel-strong)] p-1 shadow-sm">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock size={16} />
                    </div>
                    <input
                      type="password"
                      value={pw}
                      onChange={e => setPw(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                      placeholder={t.login.passwordPlaceholder}
                      className="w-full rounded-lg border-0 bg-transparent px-11 py-3.5 text-sm font-semibold text-[var(--ui-heading)] outline-none ring-0 placeholder:text-[var(--ui-faint)] focus:outline-none focus:ring-0"
                      autoComplete="current-password"
                      autoFocus
                    />
                  </div>
                </div>
                {isDemo && (
                  <p className="ml-1 text-xs font-semibold text-[var(--ui-accent)]">
                    {t.login.demoPasswordHint}
                  </p>
                )}
              </div>

              {err && (
                <div className="rounded-lg border border-red-300/70 bg-red-50 px-4 py-3 text-center text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !pw}
                className="page-modern-accent w-full py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t.login.loggingIn : t.login.loginButton}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
