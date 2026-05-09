import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Brain, CheckCircle, Key, RefreshCw, Save, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

interface StructuredConfig {
  model?: Record<string, any>;
  gateway?: Record<string, any>;
  session?: Record<string, any>;
  tools?: Record<string, any>;
  memory?: Record<string, any>;
  personality?: Record<string, any>;
  profiles?: Record<string, any>;
}

type ProviderModel = string | { id?: string; name?: string };

interface OpenClawProvider {
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  _note?: string;
  models?: ProviderModel[];
}

interface OpenClawModels {
  providers?: Record<string, OpenClawProvider>;
}

const API2CN_PROVIDER_ID = 'api2cn';
const API2CN_BASE_URL = 'https://api.api2cn.com';
const API2CN_MODEL_LIST_BASE_URL = 'https://api.api2cn.com/v1';
const normalizeProviderModels = (models?: ProviderModel[]) => {
  const values = (models || [])
    .map(model => (typeof model === 'string' ? model : model?.id || model?.name || ''))
    .map(model => String(model).trim())
    .filter(Boolean);
  return Array.from(new Set(values));
};

const normalizeModelsPayload = (payload: any): OpenClawModels => {
  if (payload?.models?.providers) return payload.models;
  if (payload?.providers) return { providers: payload.providers };
  return { providers: {} };
};

const removeLegacyModelKeys = (model: Record<string, any>) => {
  const next = { ...model };
  delete next.name;
  delete next.model;
  delete next.baseUrl;
  delete next.apiKey;
  return next;
};

const getModelApiKey = (model?: Record<string, any>, provider?: OpenClawProvider) => {
  return String(model?.api_key || model?.apiKey || provider?.apiKey || '').trim();
};

const buildModelConfig = (model: Record<string, any> | undefined, apiKey: string) => {
  const next = {
    ...removeLegacyModelKeys(model || {}),
    base_url: API2CN_BASE_URL,
    api_key: apiKey,
    provider: String(model?.provider || 'auto').trim() || 'auto',
  };
  delete (next as Record<string, any>).headers;
  return next;
};

export default function HermesConfig() {
  const { locale } = useI18n();
  const { uiMode } = (useOutletContext() as { uiMode?: 'modern' }) || {};
  const modern = uiMode === 'modern';
  const [config, setConfig] = useState<StructuredConfig>({});
  const [openClawModels, setOpenClawModels] = useState<OpenClawModels>({ providers: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelListLoading, setModelListLoading] = useState(false);
  const [modelListResult, setModelListResult] = useState<{ ok?: boolean; error?: string; count?: number }>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [configRes, modelsRes] = await Promise.all([
        api.getHermesStructuredConfig(),
        api.getModels(),
      ]);
      const nextConfig = configRes.ok ? configRes.config || {} : {};
      const nextModels = modelsRes.ok ? normalizeModelsPayload(modelsRes) : { providers: {} };
      setConfig(nextConfig);
      setOpenClawModels(nextModels);
    } catch {
      setErr(locale === 'zh-CN' ? '加载 Hermes 配置失败' : 'Failed to load Hermes config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeProvider = openClawModels.providers?.[API2CN_PROVIDER_ID];
  const providerModelIds = normalizeProviderModels(activeProvider?.models);
  const selectedModelId = String(config.model?.default || config.model?.name || config.model?.model || '').trim();
  const modelOptions = selectedModelId && !providerModelIds.includes(selectedModelId)
    ? [selectedModelId, ...providerModelIds]
    : providerModelIds;
  const apiKey = getModelApiKey(config.model, activeProvider);

  const updateModel = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      model: {
        ...buildModelConfig(prev.model, getModelApiKey(prev.model, activeProvider)),
        [key]: value,
      },
    }));
  };

  const applyModel = (modelId: string) => {
    setConfig(prev => ({
      ...prev,
      model: {
        ...buildModelConfig(prev.model, getModelApiKey(prev.model, activeProvider)),
        default: modelId,
      },
    }));
  };

  const fetchProviderModels = async () => {
    if (!apiKey) {
      setModelListResult({ ok: false, error: locale === 'zh-CN' ? '请先输入 API Key' : 'Enter API Key first' });
      return;
    }

    setModelListLoading(true);
    setModelListResult({});
    try {
      const response = await api.fetchModelList(API2CN_MODEL_LIST_BASE_URL, apiKey);
      if (!response.ok) {
        setModelListResult({ ok: false, error: response.error || (locale === 'zh-CN' ? '获取模型列表失败' : 'Failed to fetch model list') });
        return;
      }

      const models: string[] = Array.from(new Set<string>((response.models || []).map((model: any) => String(model || '').trim()).filter(Boolean)));
      setOpenClawModels(prev => ({
        ...prev,
        providers: {
          ...(prev.providers || {}),
          [API2CN_PROVIDER_ID]: {
            ...(() => {
              const provider: Record<string, any> = { ...(prev.providers?.[API2CN_PROVIDER_ID] || {}) };
              delete provider.headers;
              return provider;
            })(),
            baseUrl: API2CN_BASE_URL,
            apiKey,
            api: 'openai-completions',
            models,
          },
        },
      }));
      if (models.length && !selectedModelId) applyModel(models[0]);
      setModelListResult({ ok: true, count: models.length });
    } catch (error: any) {
      setModelListResult({ ok: false, error: error?.message || (locale === 'zh-CN' ? '获取模型列表失败' : 'Failed to fetch model list') });
    } finally {
      setModelListLoading(false);
    }
  };

  const addCustomModel = () => {
    const modelId = window.prompt(locale === 'zh-CN' ? '请输入模型 ID' : 'Enter model ID', selectedModelId || '');
    const trimmed = String(modelId || '').trim();
    if (trimmed) applyModel(trimmed);
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const payload = {
        ...config,
        model: buildModelConfig(config.model, apiKey),
      };
      const response = await api.updateHermesStructuredConfig(payload);
      if (response.ok) {
        setMsg(locale === 'zh-CN' ? 'Hermes 模型配置已保存' : 'Hermes model config saved');
        await load();
      } else {
        setErr(response.error || 'Save failed');
      }
    } catch {
      setErr(locale === 'zh-CN' ? '保存 Hermes 配置失败' : 'Failed to save Hermes config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-6 ${modern ? 'page-modern' : ''}`}>
      <div className={`${modern ? 'page-modern-header' : 'flex items-center justify-between'}`}>
        <div>
          <h2 className={`${modern ? 'page-modern-title text-xl' : 'text-xl font-bold text-gray-900 dark:text-white'}`}>
            {locale === 'zh-CN' ? 'Hermes 配置' : 'Hermes Config'}
          </h2>
          <p className={`${modern ? 'page-modern-subtitle mt-1 text-sm' : 'text-sm text-gray-500 mt-1'}`}>
            {locale === 'zh-CN'
              ? '这里优先配置 Hermes 的模型提供商，模型列表通过 API2CN 拉取后下拉选择。'
              : 'Configure the Hermes model provider here. Models are fetched from API2CN for selection.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className={`${modern ? 'page-modern-action px-3 py-2 text-xs' : 'px-3 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800'} inline-flex items-center gap-2`}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {locale === 'zh-CN' ? '刷新' : 'Refresh'}
          </button>
          <button onClick={save} disabled={saving} className={`${modern ? 'page-modern-accent px-4 py-2 text-xs disabled:opacity-50' : 'px-4 py-2 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50'} inline-flex items-center gap-2`}>
            <Save size={14} />
            {locale === 'zh-CN' ? '保存' : 'Save'}
          </button>
        </div>
      </div>

      {msg && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-300">{msg}</div>}
      {err && <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">{err}</div>}

      <div className={`${modern ? 'page-modern-panel overflow-hidden' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50'} rounded-2xl p-5 space-y-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="p-2 rounded-xl border border-blue-100/80 dark:border-blue-800/40 bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(14,165,233,0.08))] dark:bg-[linear-gradient(135deg,rgba(37,99,235,0.2),rgba(14,165,233,0.12))] text-blue-600 dark:text-blue-300">
              <Brain size={18} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <select
                value={API2CN_PROVIDER_ID}
                disabled
                className="min-w-[180px] max-w-full rounded-lg border-0 border-b border-dashed border-gray-300 bg-transparent px-1 py-1 text-base font-bold text-gray-900 outline-none disabled:opacity-100 dark:border-gray-600 dark:text-white"
              >
                <option value={API2CN_PROVIDER_ID}>api2cn</option>
              </select>
              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {modelOptions.length} {locale === 'zh-CN' ? '模型' : 'models'}
              </span>
            </div>
          </div>
          {selectedModelId && (
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              {locale === 'zh-CN' ? '当前模型：' : 'Current: '}{selectedModelId}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Base URL</label>
            <input
              value={API2CN_BASE_URL}
              readOnly
              className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2 text-sm font-mono text-gray-500 outline-none cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            />
          </div>
          <div>
            <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-black leading-snug text-red-600 dark:text-red-400 md:text-base">
                在本站购买相关订阅套餐后，需在API密钥中设置对应的订阅组，并复制API KEY填写到此处。
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400"><Key size={10} /> API2CN</span>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={event => updateModel('api_key', event.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2 text-sm font-mono tracking-wider text-gray-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">API 类型</label>
            <select
              value="openai-completions"
              disabled
              className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2 text-sm text-gray-500 outline-none disabled:opacity-100 cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
              <option value="openai-completions">OpenAI Chat Completions API</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">备注（可选）</label>
            <input
              value={String(config.model?._note || '')}
              onChange={event => updateModel('_note', event.target.value)}
              placeholder="例：公司账号 / 个人测试"
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2 text-sm text-gray-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Hermes Provider</label>
            <input
              value={String(config.model?.provider || 'auto')}
              onChange={event => updateModel('provider', event.target.value)}
              placeholder="auto"
              className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Temperature</label>
              <input
                type="number"
                step="0.1"
                value={config.model?.temperature ?? ''}
                onChange={event => updateModel('temperature', event.target.value === '' ? undefined : Number(event.target.value))}
                placeholder="0.7"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={config.model?.max_tokens ?? config.model?.maxTokens ?? ''}
                onChange={event => updateModel('max_tokens', event.target.value === '' ? undefined : Number(event.target.value))}
                placeholder="4096"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900/40"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={fetchProviderModels}
            disabled={modelListLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900/40"
          >
            {modelListLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {modelListLoading ? (locale === 'zh-CN' ? '获取中...' : 'Fetching...') : (locale === 'zh-CN' ? '获取模型列表' : 'Fetch Models')}
          </button>
          {modelListResult.ok !== undefined && (
            <span className={`rounded-full px-3 py-1 text-xs ${
              modelListResult.ok
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              {modelListResult.ok
                ? (locale === 'zh-CN' ? `已获取 ${modelListResult.count || 0} 个模型` : `Fetched ${modelListResult.count || 0} models`)
                : modelListResult.error}
            </span>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            {locale === 'zh-CN' ? '模型列表' : 'Model List'}
          </label>
          <div className="space-y-2">
            {modelOptions.map(model => {
              const selected = model === selectedModelId;
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => applyModel(model)}
                  className={`group flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-blue-200 bg-blue-50/80 dark:border-blue-700/60 dark:bg-blue-900/20'
                      : 'border-gray-100 bg-white/60 hover:border-blue-200 dark:border-gray-700/50 dark:bg-slate-800/60 dark:hover:border-blue-700/50'
                  }`}
                >
                  <Box size={12} className="shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-gray-900 dark:text-white">{model}</span>
                  {selected ? <CheckCircle size={14} className="text-blue-500" /> : <span className="text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">{locale === 'zh-CN' ? '选择' : 'Select'}</span>}
                </button>
              );
            })}
            {!modelOptions.length && (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400 dark:border-gray-700">
                {locale === 'zh-CN' ? '当前没有模型，请先输入 API Key 并获取模型列表。' : 'No models yet. Enter API Key and fetch the model list first.'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={addCustomModel}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:bg-blue-900/20"
          >
            + {locale === 'zh-CN' ? '自定义模型' : 'Custom Model'}
          </button>
        </div>
      </div>
    </div>
  );
}
