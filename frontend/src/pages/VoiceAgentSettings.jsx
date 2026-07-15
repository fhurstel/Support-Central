import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Cpu, Key, Save, Check, AlertCircle, RotateCcw, Zap } from 'lucide-react';
import { getVoiceAgentSettings, updateVoiceAgentSettings } from '../services/api';
import PoppyChat from '../components/PoppyChat';

const PROVIDER_OPENROUTER = 'openrouter';
const PROVIDER_NVIDIA_NIM = 'nvidia_nim';

export default function VoiceAgentSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'ok'|'error', text: string }

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getVoiceAgentSettings();
      if (data) setSettings(data);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to load settings: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateVoiceAgentSettings({
        provider: settings.provider,
        openrouter_key_slot: settings.openrouter_key_slot,
        openrouter_model: settings.openrouter_model,
        nvidia_nim_key_slot: settings.nvidia_nim_key_slot,
        nvidia_nim_model: settings.nvidia_nim_model,
      });
      setMessage({ type: 'ok', text: 'Settings saved. Restart the voice agent to apply.' });
    } catch (err) {
      setMessage({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-spinner">Loading settings…</div>;
  if (!settings) return <div className="card"><p>Could not load settings.</p></div>;

  const activeProvider = settings.provider || PROVIDER_OPENROUTER;

  const openrouterKeyLabels = {
    OPENROUTER_API_KEY: 'Key 1 (primary)',
    OPENROUTER_API_KEY_2: 'Key 2 (backup)',
    OPENROUTER_API_KEY_3: 'Key 3 (backup)',
    OPENROUTER_API_KEY_4: 'Key 4 (backup)',
  };

  const nvidiaNimKeyLabels = {
    NVIDIA_NIM_API_KEY: 'Key 1 (primary)',
    NVIDIA_NIM_API_KEY_2: 'Key 2 (backup)',
    NVIDIA_NIM_API_KEY_3: 'Key 3 (backup)',
  };

  // Filter models by active provider
  const providerModels = (settings.available_models || []).filter(
    (m) => (m.provider || PROVIDER_OPENROUTER) === activeProvider
  );

  // When switching provider, reset to first model of that provider
  const handleProviderChange = (newProvider) => {
    const modelsForProvider = (settings.available_models || []).filter(
      (m) => (m.provider || PROVIDER_OPENROUTER) === newProvider
    );
    const defaultModel = modelsForProvider[0]?.id || '';
    setSettings(s => ({
      ...s,
      provider: newProvider,
      ...(newProvider === PROVIDER_NVIDIA_NIM
        ? { nvidia_nim_model: defaultModel }
        : { openrouter_model: defaultModel }),
    }));
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Settings size={22} />
        <h2 style={{ margin: 0 }}>Voice &amp; AI Settings</h2>
      </div>

      {message && (
        <div className={`card`} style={{
          marginBottom: 20,
          borderLeft: `4px solid ${message.type === 'ok' ? '#16a34a' : '#ef4444'}`,
          background: message.type === 'ok' ? '#052e16' : '#1f1414',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {message.type === 'ok' ? <Check size={16} color="#16a34a" /> : <AlertCircle size={16} color="#ef4444" />}
          <span style={{ fontSize: 14 }}>{message.text}</span>
        </div>
      )}

      {/* ── Provider Selector ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Zap size={16} />
          <h3 style={{ margin: 0, fontSize: 15 }}>Provider</h3>
        </div>
        <p style={{ fontSize: 13, color: '#888', marginTop: -4, marginBottom: 14 }}>
          Choose which API provider the voice agent uses for LLM calls.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 8,
            border: activeProvider === PROVIDER_OPENROUTER ? '2px solid #4a90e2' : '1px solid #333',
            background: activeProvider === PROVIDER_OPENROUTER ? '#0c1a2e' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            <input
              type="radio"
              name="provider"
              value={PROVIDER_OPENROUTER}
              checked={activeProvider === PROVIDER_OPENROUTER}
              onChange={() => handleProviderChange(PROVIDER_OPENROUTER)}
              style={{ accentColor: '#4a90e2' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>OpenRouter</div>
              <div style={{ fontSize: 11, color: '#666' }}>Multiple free models · auto-fallback</div>
            </div>
          </label>
          <label style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 8,
            border: activeProvider === PROVIDER_NVIDIA_NIM ? '2px solid #76b900' : '1px solid #333',
            background: activeProvider === PROVIDER_NVIDIA_NIM ? '#0e1a00' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
            <input
              type="radio"
              name="provider"
              value={PROVIDER_NVIDIA_NIM}
              checked={activeProvider === PROVIDER_NVIDIA_NIM}
              onChange={() => handleProviderChange(PROVIDER_NVIDIA_NIM)}
              style={{ accentColor: '#76b900' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>NVIDIA NIM</div>
              <div style={{ fontSize: 11, color: '#666' }}>Nemotron Ultra 550B · direct API</div>
            </div>
          </label>
        </div>
      </div>

      {/* ── API Key (context-sensitive) ── */}
      {activeProvider === PROVIDER_OPENROUTER && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Key size={16} />
            <h3 style={{ margin: 0, fontSize: 15 }}>OpenRouter API Key</h3>
          </div>
          <p style={{ fontSize: 13, color: '#888', marginTop: -4, marginBottom: 14 }}>
            Select which API key to use. Keys are grouped by shared quota pool, so the preferred pool is shown first.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(settings.available_key_groups || [
              { label: 'Preferred pool (Key 2 + Key 4)', keys: ['OPENROUTER_API_KEY_2', 'OPENROUTER_API_KEY_4'] },
              { label: 'Secondary pool (Key 1 + Key 3)', keys: ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEY_3'] },
            ]).map((group) => {
              const visibleKeys = (group.keys || []).filter((key) => (settings.available_keys || []).includes(key));
              if (!visibleKeys.length) return null;
              return (
                <div key={group.label} style={{ border: '1px solid #2a2a2a', borderRadius: 10, padding: 12, background: '#141414' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{group.label}</div>
                      <div style={{ fontSize: 12, color: '#777' }}>Shared quota pool</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleKeys.map((key) => (
                      <label key={key} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: settings.openrouter_key_slot === key ? '2px solid #4a90e2' : '1px solid #333',
                        background: settings.openrouter_key_slot === key ? '#0c1a2e' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        <input
                          type="radio"
                          name="key_slot"
                          value={key}
                          checked={settings.openrouter_key_slot === key}
                          onChange={() => setSettings(s => ({ ...s, openrouter_key_slot: key }))}
                          style={{ accentColor: '#4a90e2' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{openrouterKeyLabels[key] || key}</div>
                          <div style={{ fontSize: 12, color: '#666' }}>{key}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeProvider === PROVIDER_NVIDIA_NIM && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Key size={16} />
            <h3 style={{ margin: 0, fontSize: 15 }}>NVIDIA NIM API Key</h3>
          </div>
          <p style={{ fontSize: 13, color: '#888', marginTop: -4, marginBottom: 14 }}>
            Select which NVIDIA NIM API key to use. Falls back to the next key on auth errors.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(settings.nvidia_nim_keys || []).map((key) => (
              <label key={key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                border: (settings.nvidia_nim_key_slot || settings.nvidia_nim_keys?.[0]) === key ? '2px solid #76b900' : '1px solid #333',
                background: (settings.nvidia_nim_key_slot || settings.nvidia_nim_keys?.[0]) === key ? '#0e1a00' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                <input
                  type="radio"
                  name="nv_key_slot"
                  value={key}
                  checked={(settings.nvidia_nim_key_slot || settings.nvidia_nim_keys?.[0]) === key}
                  onChange={() => setSettings(s => ({ ...s, nvidia_nim_key_slot: key }))}
                  style={{ accentColor: '#76b900' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{nvidiaNimKeyLabels[key] || key}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{key}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ── Model ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Cpu size={16} />
          <h3 style={{ margin: 0, fontSize: 15 }}>
            LLM Model
            {activeProvider === PROVIDER_NVIDIA_NIM && (
              <span style={{ fontSize: 12, fontWeight: 400, color: '#76b900', marginLeft: 8 }}>— NVIDIA NIM</span>
            )}
          </h3>
        </div>
        <p style={{ fontSize: 13, color: '#888', marginTop: -4, marginBottom: 14 }}>
          {activeProvider === PROVIDER_OPENROUTER
            ? 'Select the OpenRouter model for the voice agent. All models are free-tier.'
            : 'Select the NVIDIA NIM model. Uses your direct NVIDIA API key.'}
        </p>
        <select
          value={activeProvider === PROVIDER_NVIDIA_NIM ? settings.nvidia_nim_model : settings.openrouter_model}
          onChange={(e) => setSettings(s => ({
            ...s,
            ...(activeProvider === PROVIDER_NVIDIA_NIM
              ? { nvidia_nim_model: e.target.value }
              : { openrouter_model: e.target.value }),
          }))}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#eee',
            fontSize: 14,
          }}
        >
          {providerModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── Save ── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {saving ? <RotateCcw size={14} className="spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button className="btn btn-outline" onClick={fetchSettings} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      <hr style={{ borderColor: '#222', margin: '24px 0' }} />

      {/* ── Poppy AI Chat ── */}
      <PoppyChat />
    </div>
  );
}
