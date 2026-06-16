import { useState, useMemo } from 'react';
import {
  Search, Calendar, Clock, ChevronRight, ChevronDown, Zap, Database,
  Folder, FolderOpen, Plus, Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api.js';

function formatDate(dateStr) {
  if (!dateStr) return 'No date';
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
}

function formatDuration(secs) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function meetingMatchesSearch(meeting, search, isSaved) {
  if (!search) return true;
  const q = search.toLowerCase();
  const title = meeting.title || meeting.call_title || meeting.meeting_title || '';
  const category = meeting.category || '';
  const folder = meeting.folder_name || '';
  const summary = (meeting.summary || meeting.default_summary?.markdown_formatted || '').slice(0, 500);
  return [title, category, folder, summary].some((s) => s.toLowerCase().includes(q));
}

function MeetingRow({ meeting, isSelected, isSaved, onSelect, activeTab, folders, onMoveFolder, onOpenSaved }) {
  const id = meeting.id || meeting.recording_id || meeting.call_id;
  const title = meeting.title || meeting.call_title || meeting.meeting_title || 'Untitled';
  const date = meeting.meeting_date || meeting.started_at || meeting.date;
  const duration = meeting.duration_secs || meeting.duration;
  const isImported = !isSaved && meeting.is_imported;

  function handleClick() {
    if (isImported && meeting.saved_meeting_id) {
      onOpenSaved?.(meeting.saved_meeting_id);
      return;
    }
    onSelect(meeting, activeTab);
  }

  return (
    <div style={{
      padding: '4px 4px',
      borderRadius: 6,
      marginBottom: 2,
      background: isSelected ? 'var(--indigo-dim)' : 'transparent',
      border: isSelected ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
    }}>
      <button
        onClick={handleClick}
        style={{ width: '100%', textAlign: 'left', padding: '4px 6px', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? 'var(--indigo-light)' : 'var(--white-soft)', lineHeight: 1.3, flex: 1 }}>
            {title}
          </span>
          {isImported ? (
            <span className="badge badge-green" style={{ fontSize: 9, flexShrink: 0 }}>Saved</span>
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--slate-400)', flexShrink: 0, marginTop: 2 }} />
          )}
        </div>
        {meeting.category && (
          <div style={{ fontSize: 10, color: 'var(--slate-300)', marginTop: 3 }}>{meeting.category}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {date && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--slate-300)' }}>
              <Calendar size={9} />{formatDate(date)}
            </span>
          )}
          {duration && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--slate-300)' }}>
              <Clock size={9} />{formatDuration(duration)}
            </span>
          )}
        </div>
      </button>
      {folders?.length > 0 && onMoveFolder && (
        <select
          value={meeting.folder_id || 'uncategorized'}
          onChange={(e) => { e.stopPropagation(); onMoveFolder(meeting, activeTab, e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%', fontSize: 10, padding: '3px 6px', marginTop: 4, background: 'var(--navy-700)', border: '1px solid var(--navy-600)', borderRadius: 4, color: 'var(--slate-200)' }}
        >
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      )}
      {isSaved && (meeting.action_item_count > 0 || meeting.next_step_count > 0) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 4, padding: '0 6px 4px' }}>
          {meeting.action_item_count > 0 && (
            <span className="badge badge-indigo" style={{ fontSize: 10 }}>
              {meeting.action_item_count} actions
            </span>
          )}
          {meeting.next_step_count > 0 && (
            <span className="badge badge-green" style={{ fontSize: 10 }}>
              {meeting.next_step_count} steps
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FolderAccordion({
  folderId, folderName, meetings, expanded, onToggle, selectedId, isSaved, onSelect, activeTab,
  folders, onMoveFolder, onOpenSaved, onDeleteFolder, canDelete,
}) {
  const FolderIcon = expanded ? FolderOpen : Folder;

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 8px',
          borderRadius: 8,
          background: 'var(--navy-800)',
          border: '1px solid var(--navy-600)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <ChevronDown
          size={14}
          color="var(--slate-300)"
          style={{
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        />
        <FolderIcon size={14} color="var(--indigo-light)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white-soft)', flex: 1 }}>
          {folderName}
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--slate-300)',
          background: 'var(--navy-700)',
          borderRadius: 10,
          padding: '1px 7px',
        }}>
          {meetings.length}
        </span>
        {canDelete && onDeleteFolder && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Delete empty category"
            onClick={(e) => { e.stopPropagation(); onDeleteFolder(folderId, folderName); }}
            style={{ padding: '2px 4px', minWidth: 0 }}
          >
            <Trash2 size={11} color="var(--slate-400)" />
          </button>
        )}
      </button>
      {expanded && (
        <div style={{ padding: '4px 0 0 6px', marginLeft: 6, borderLeft: '1px solid var(--navy-700)' }}>
          {meetings.map((meeting) => {
            const id = meeting.id || meeting.recording_id || meeting.call_id;
            return (
              <MeetingRow
                key={id}
                meeting={meeting}
                isSelected={selectedId === id}
                isSaved={isSaved}
                onSelect={onSelect}
                activeTab={activeTab}
                folders={folders}
                onMoveFolder={onMoveFolder}
                onOpenSaved={onOpenSaved}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  dbMeetings, fathomMeetings, folders, loadingFathom, syncing, hasFathomKey,
  selectedId, onSelect, activeTab, onTabChange, onMoveFolder, onOpenSettings,
  onFoldersChange, onOpenSaved,
}) {
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [folderError, setFolderError] = useState(null);

  const sourceMeetings = activeTab === 'fathom' ? fathomMeetings : dbMeetings;
  const isSaved = activeTab === 'saved';

  const filtered = useMemo(
    () => sourceMeetings.filter((m) => meetingMatchesSearch(m, search, isSaved)),
    [sourceMeetings, search, isSaved],
  );

  const folderOrder = useMemo(() => {
    const order = new Map((folders || []).map((f) => [f.id, f.sort_order ?? 99]));
    return (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99);
  }, [folders]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const folder of folders || []) {
      groups[folder.id] = {
        folderId: folder.id,
        folderName: folder.name,
        meetings: [],
        usageCount: folder.usage_count ?? 0,
      };
    }
    for (const meeting of filtered) {
      const folderId = meeting.folder_id || 'uncategorized';
      const folderName = meeting.folder_name
        || folders?.find((f) => f.id === folderId)?.name
        || 'Uncategorized';
      if (!groups[folderId]) {
        groups[folderId] = { folderId, folderName, meetings: [], usageCount: 0 };
      }
      groups[folderId].meetings.push(meeting);
    }

    return Object.values(groups)
      .filter((g) => g.meetings.length > 0 || (!search && g.usageCount === 0))
      .sort((a, b) => folderOrder(a.folderId, b.folderId))
      .map((g) => ({
        ...g,
        meetings: g.meetings.sort((a, b) => {
          const da = a.meeting_date || a.started_at || a.date || '';
          const db = b.meeting_date || b.started_at || b.date || '';
          return db.localeCompare(da);
        }),
      }));
  }, [filtered, folders, folderOrder, search]);

  const allFolderIds = grouped.map((g) => g.folderId);
  const isExpanded = (folderId) => {
    if (expandedFolders === null) return true;
    return expandedFolders.has(folderId);
  };

  function toggleFolder(folderId) {
    setExpandedFolders((prev) => {
      const base = prev === null ? new Set(allFolderIds) : new Set(prev);
      if (base.has(folderId)) base.delete(folderId);
      else base.add(folderId);
      return base;
    });
  }

  function expandAll() {
    setExpandedFolders(null);
  }

  function collapseAll() {
    setExpandedFolders(new Set());
  }

  async function handleAddCategory(e) {
    e?.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setFolderError(null);
    try {
      await api.createFolder(name);
      setNewCategoryName('');
      setShowAddCategory(false);
      onFoldersChange?.();
    } catch (err) {
      setFolderError(err.message);
    }
  }

  async function handleDeleteFolder(folderId, folderName) {
    if (!confirm(`Delete empty category "${folderName}"?`)) return;
    setFolderError(null);
    try {
      await api.deleteFolder(folderId);
      onFoldersChange?.();
    } catch (err) {
      setFolderError(err.message);
    }
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      background: 'var(--navy-950)',
      borderRight: '1px solid var(--navy-700)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--indigo-dim)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={16} color="var(--indigo-light)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--white-soft)' }}>Meeting Intel</div>
            <div style={{ fontSize: 11, color: 'var(--slate-300)' }}>Cached locally · Refresh to sync</div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          background: 'var(--navy-800)',
          borderRadius: 8,
          padding: 3,
          marginBottom: 12,
        }}>
          {[
            { id: 'fathom', label: 'Fathom', icon: <Zap size={11} /> },
            { id: 'saved', label: 'Saved', icon: <Database size={11} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '5px 8px',
                borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                background: activeTab === tab.id ? 'var(--indigo)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--slate-200)',
                transition: 'all 0.15s',
              }}
            >
              {tab.icon}{tab.label}
              {tab.id === 'saved' && dbMeetings.length > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  padding: '0 5px',
                  fontSize: 10,
                }}>
                  {dbMeetings.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-300)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, folder, category…"
            style={{ paddingLeft: 28, fontSize: 12 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={expandAll} style={{ fontSize: 10, padding: '3px 8px' }}>
            Expand all
          </button>
          <button className="btn btn-ghost btn-sm" onClick={collapseAll} style={{ fontSize: 10, padding: '3px 8px' }}>
            Collapse all
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowAddCategory((v) => !v); setFolderError(null); }}
            style={{ fontSize: 10, padding: '3px 8px' }}
            title="Add category"
          >
            <Plus size={10} /> Category
          </button>
          {!hasFathomKey && (
            <button className="btn btn-ghost btn-sm" onClick={onOpenSettings} style={{ fontSize: 10, padding: '3px 8px', marginLeft: 'auto' }}>
              Add Fathom Key
            </button>
          )}
        </div>

        {showAddCategory && (
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              style={{ fontSize: 11, flex: 1 }}
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-sm" style={{ fontSize: 10 }}>Add</button>
          </form>
        )}
        {folderError && (
          <p style={{ fontSize: 10, color: 'var(--red)', marginBottom: 8 }}>{folderError}</p>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {loadingFathom || syncing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 8px', color: 'var(--slate-300)', fontSize: 12 }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
            {syncing ? 'Syncing from Fathom…' : 'Loading meetings…'}
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ padding: '20px 8px', color: 'var(--slate-300)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
            {search ? 'No meetings match your search' : activeTab === 'fathom' ? (
              hasFathomKey
                ? 'No meetings cached yet. Click Refresh in the top bar to sync from Fathom.'
                : 'Add your Fathom API key in Settings, then click Refresh.'
            ) : 'No saved meetings yet'}
          </div>
        ) : (
          grouped.map((group) => (
            <FolderAccordion
              key={group.folderId}
              folderId={group.folderId}
              folderName={group.folderName}
              meetings={group.meetings}
              expanded={isExpanded(group.folderId)}
              onToggle={() => toggleFolder(group.folderId)}
              selectedId={selectedId}
              isSaved={isSaved}
              onSelect={onSelect}
              activeTab={activeTab}
              folders={folders}
              onMoveFolder={onMoveFolder}
              onOpenSaved={onOpenSaved}
              onDeleteFolder={handleDeleteFolder}
              canDelete={
                group.folderId !== 'uncategorized'
                && (folders.find((f) => f.id === group.folderId)?.usage_count === 0)
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}
