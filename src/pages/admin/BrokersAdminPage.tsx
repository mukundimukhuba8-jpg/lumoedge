import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useAdminSession } from '../../context/AdminContext';
import { apiUrl } from '../../lib/apiBase';
import type { BrokerCatalogEntry } from '../../lib/mt5Api';

type Draft = {
  id: string;
  name: string;
  aliases: string;
  site: string;
  logoUrl: string;
  platforms: string;
  accountTypes: string;
  servers: string;
  enabled: boolean;
  recommended: boolean;
};

function toDraft(b?: BrokerCatalogEntry | null): Draft {
  return {
    id: b?.id || '',
    name: b?.name || '',
    aliases: (b?.aliases || []).join(', '),
    site: b?.site || '',
    logoUrl: b?.logoUrl || '',
    platforms: (b?.platforms || ['MT5']).join(', '),
    accountTypes: (b?.accountTypes || [])
      .map((t) => (t.platform ? `${t.name}|${t.platform}` : t.name))
      .join('\n'),
    servers: (b?.servers || [])
      .map((s) => `${s.name}|${s.platform || 'MT5'}|${s.mode || 'live'}`)
      .join('\n'),
    enabled: b?.enabled !== false,
    recommended: Boolean(b?.recommended),
  };
}

function parseDraft(d: Draft): BrokerCatalogEntry {
  const accountTypes = d.accountTypes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, platform] = line.split('|').map((s) => s.trim());
      return { name, platform: (platform || 'MT5').toUpperCase() };
    });
  const servers = d.servers
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, platform, mode] = line.split('|').map((s) => s.trim());
      return {
        name,
        platform: (platform || 'MT5').toUpperCase(),
        mode: (mode || 'live').toLowerCase(),
      };
    });
  return {
    id: d.id.trim(),
    name: d.name.trim(),
    aliases: d.aliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    site: d.site.trim(),
    logoUrl: d.logoUrl.trim(),
    platforms: d.platforms
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    accountTypes,
    servers,
    enabled: d.enabled,
    recommended: d.recommended,
  };
}

export function BrokersAdminPage() {
  const { admin } = useAdminSession();
  const [brokers, setBrokers] = useState<BrokerCatalogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/brokers/catalog'), { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        brokers?: BrokerCatalogEntry[];
      };
      setBrokers(Array.isArray(data.brokers) ? data.brokers : []);
    } catch {
      setBrokers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter((b) => {
      const hay = [b.name, b.id, ...(b.aliases || []), ...(b.servers || []).map((s) => s.name)]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [brokers, query]);

  const save = async (action: 'upsert' | 'delete' = 'upsert') => {
    if (saving) return;
    setSaving(true);
    setStatus('');
    setError(false);
    try {
      if (!password.trim()) throw new Error('Enter your admin password to save.');
      const broker = parseDraft(draft);
      if (action === 'upsert' && !broker.name) throw new Error('Broker name required.');
      const res = await fetch(apiUrl('/api/brokers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: broker.id || draft.id,
          broker,
          adminEmail: admin?.email || '',
          adminPassword: password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        brokers?: BrokerCatalogEntry[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setBrokers(Array.isArray(data.brokers) ? data.brokers : []);
      setStatus(action === 'delete' ? 'Broker removed.' : 'Broker saved — Android will use this catalog.');
      if (action === 'delete') setDraft(toDraft(null));
      setPassword('');
    } catch (e) {
      setError(true);
      setStatus(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="broker-admin">
      <div className="glow-card cyber-card">
        <h2 style={{ margin: 0 }}>Broker Database</h2>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
          Central catalog for Admin + Android. Live MT5 search supplies servers; account types and
          enable flags come from here.
        </p>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Search brokers</label>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Exness, XM, Razor…"
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="muted">
          <Loader2 size={16} className="spin" /> Loading catalog…
        </p>
      ) : (
        <div className="broker-admin-grid">
          {filtered.map((b) => (
            <article key={b.id} className="glow-card cyber-card broker-admin-card">
              <header>
                <div>
                  <h3>{b.name}</h3>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {(b.accountTypes || []).length} account types · {(b.servers || []).length} curated
                    servers
                  </p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(b))}>
                  Edit
                </button>
              </header>
              <div className="broker-admin-meta">
                <span className={`broker-admin-chip${b.enabled === false ? ' off' : ' on'}`}>
                  {b.enabled === false ? 'Disabled' : 'Enabled'}
                </span>
                {(b.platforms || []).map((p) => (
                  <span key={p} className="broker-admin-chip">
                    {p}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="glow-card cyber-card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{draft.id ? `Edit ${draft.name || draft.id}` : 'Add broker'}</h3>
          <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(null))}>
            <Plus size={14} /> New
          </button>
        </div>
        <div className="field">
          <label>Name</label>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label>ID (optional)</label>
          <input
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            placeholder="exness"
          />
        </div>
        <div className="field">
          <label>Aliases (comma-separated)</label>
          <input
            value={draft.aliases}
            onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
            placeholder="Exness (KE) Limited, Exness Technologies Ltd"
          />
        </div>
        <div className="field">
          <label>Site</label>
          <input value={draft.site} onChange={(e) => setDraft({ ...draft, site: e.target.value })} />
        </div>
        <div className="field">
          <label>Logo URL</label>
          <input
            value={draft.logoUrl}
            onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Platforms (comma-separated)</label>
          <input
            value={draft.platforms}
            onChange={(e) => setDraft({ ...draft, platforms: e.target.value })}
            placeholder="MT4, MT5"
          />
        </div>
        <div className="field">
          <label>Account types (one per line: Name or Name|MT5)</label>
          <textarea
            rows={5}
            value={draft.accountTypes}
            onChange={(e) => setDraft({ ...draft, accountTypes: e.target.value })}
            placeholder={'Standard|MT5\nPro|MT5\nRaw Spread|MT5'}
          />
        </div>
        <div className="field">
          <label>Curated servers (one per line: Server|MT5|live)</label>
          <textarea
            rows={4}
            value={draft.servers}
            onChange={(e) => setDraft({ ...draft, servers: e.target.value })}
            placeholder={'ExnessKE-MT5Real9|MT5|live'}
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enabled for Android / Admin search
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={draft.recommended}
            onChange={(e) => setDraft({ ...draft, recommended: e.target.checked })}
          />
          Recommended
        </label>
        <div className="field">
          <label>Admin password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-blue" disabled={saving} onClick={() => void save('upsert')}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Save broker
          </button>
          {draft.id ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={saving}
              onClick={() => void save('delete')}
            >
              <Trash2 size={16} /> Delete
            </button>
          ) : null}
        </div>
        {status ? (
          <p style={{ margin: 0, fontWeight: 700, color: error ? '#f87171' : 'var(--green)' }}>
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
