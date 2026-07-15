import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, Plus, X, Edit, Trash2, Tag, AlertCircle, ChevronDown, ChevronUp, TrendingUp, Clock, Paperclip, Upload, Image, FileText } from 'lucide-react';
import { getKB, createKB, updateKB, deleteKB, searchKB, uploadAttachment } from '../services/api';

const CATEGORIES = [
  'networking',
  'hardware',
  'software',
  'email',
  'security',
  'billing',
  'general',
];

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Simple debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function KBModal({ article, onClose, onSaved }) {
  const [form, setForm] = useState(
    article || {
      title: '',
      content: '',
      category: 'general',
      tags: '',
    }
  );
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Initialize attachments from existing article
  const [attachments, setAttachments] = useState(article?.attachments || []);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    setUploading(true);
    try {
      const tagsStr = Array.isArray(form.tags)
        ? form.tags.join(', ')
        : (typeof form.tags === 'string' ? form.tags : '');
      const payload = { ...form, tags: tagsStr };

      // Upload pending files first using the attachment API
      const uploadedAttachments = [...attachments];
      for (const file of pendingFiles) {
        try {
          // Use ticket 0 or a dummy endpoint - for KB we use the /kb endpoint pattern
          // Since there's no ticket, we upload to a general endpoint
          const formData = new FormData();
          formData.append('file', file);
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
          const token = localStorage.getItem('token') || sessionStorage.getItem('token');
          const headers = { Authorization: `Bearer ${token}` };
          if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

          // Use the ticket attachment endpoint with a temporary approach
          // For KB articles, we store attachment metadata directly
          const reader = new FileReader();
          const base64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });

          uploadedAttachments.push({
            url: base64,
            filename: file.name,
            mime_type: file.type,
            size: file.size,
          });
        } catch (err) {
          console.error('Failed to upload attachment:', err);
        }
      }

      payload.attachments = uploadedAttachments.length > 0 ? uploadedAttachments : undefined;

      if (article) {
        await updateKB(article.id, payload);
      } else {
        await createKB(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const hasAttachments = attachments.length > 0 || pendingFiles.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{article ? 'Edit Article' : 'New Article'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              className="form-control"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="two-col">
            <div className="form-group">
              <label>Category</label>
              <select
                className="form-control"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tags (comma-separated)</label>
              <input
                className="form-control"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="e.g. wifi, router, troubleshooting"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Content *</label>
            <textarea
              className="form-control"
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>

          {/* Attachments Section */}
          <div className="form-group">
            <label>
              <Paperclip size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Attachments
            </label>
            <div
              style={{
                border: '1px dashed #d0d0d0',
                borderRadius: 8,
                padding: 16,
                background: '#fafafa',
                cursor: 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ textAlign: 'center', color: '#888' }}>
                <Upload size={24} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 13 }}>Click to upload or drag files here</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#aaa' }}>
                  Images, PDFs, documents up to 10MB
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Existing attachments */}
            {attachments.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {attachments.map((att, idx) => (
                  <div
                    key={`att-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      background: '#f0f7ff',
                      borderRadius: 6,
                      marginBottom: 4,
                      fontSize: 13,
                    }}
                  >
                    {att.mime_type && att.mime_type.startsWith('image/') ? (
                      <Image size={14} color="#6366f1" />
                    ) : (
                      <FileText size={14} color="#6366f1" />
                    )}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.filename}
                    </span>
                    {att.size && (
                      <span style={{ color: '#888', fontSize: 11 }}>{formatFileSize(att.size)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: 2,
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {pendingFiles.map((file, idx) => (
                  <div
                    key={`pending-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      background: '#fff3cd',
                      borderRadius: 6,
                      marginBottom: 4,
                      fontSize: 13,
                    }}
                  >
                    {file.type && file.type.startsWith('image/') ? (
                      <Image size={14} color="#f59e0b" />
                    ) : (
                      <FileText size={14} color="#f59e0b" />
                    )}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </span>
                    <span style={{ color: '#888', fontSize: 11 }}>{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: 2,
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !form.title.trim() || !form.content.trim()}
            >
              {saving ? 'Saving…' : article ? 'Update Article' : 'Create Article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }) {
  if (attachment.mime_type && attachment.mime_type.startsWith('image/')) {
    return (
      <div style={{ marginBottom: 8 }}>
        <img
          src={attachment.url}
          alt={attachment.filename || 'attachment'}
          style={{
            maxWidth: '100%',
            maxHeight: 400,
            borderRadius: 8,
            border: '1px solid #e0e0e0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        />
        {attachment.filename && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {attachment.filename}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <a
        href={attachment.url}
        download={attachment.filename}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: '#f0f7ff',
          borderRadius: 8,
          border: '1px solid #d0e0ff',
          color: '#2563eb',
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        <FileText size={16} />
        <span>{attachment.filename || 'Download'}</span>
        {attachment.size && (
          <span style={{ color: '#888', fontSize: 11 }}>({formatFileSize(attachment.size)})</span>
        )}
      </a>
    </div>
  );
}

function KBArticle({ article, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const tags = Array.isArray(article.tags)
    ? article.tags
    : typeof article.tags === 'string'
    ? article.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const attachments = article.attachments || [];

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div
        className="flex justify-between items-start"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
            {article.title}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted flex-wrap">
            <span
              className="badge"
              style={{
                background: '#f0f0f0',
                color: '#555',
              }}
            >
              {article.category}
            </span>
            {tags.slice(0, 5).map((tag) => (
              <span key={tag} className="flex items-center gap-1">
                <Tag size={10} /> {tag}
              </span>
            ))}
            {attachments.length > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#6366f1' }}>
                <Paperclip size={10} /> {attachments.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ marginLeft: 16 }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ padding: '4px 8px' }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(article);
            }}
            title="Edit article"
          >
            <Edit size={14} />
          </button>
          <button
            className="btn btn-outline btn-sm"
            style={{ padding: '4px 8px', color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(article);
            }}
            title="Delete article"
          >
            <Trash2 size={14} />
          </button>
          <div style={{ marginLeft: 4 }}>
            {expanded ? <ChevronUp size={18} color="#999" /> : <ChevronDown size={18} color="#999" />}
          </div>
        </div>
      </div>

      {!expanded && (
        <div className="text-sm text-muted mt-2">
          {article.content?.substring(0, 150)}
          {article.content?.length > 150 ? '…' : ''}
        </div>
      )}

      {expanded && (
        <div>
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              fontSize: 14,
            }}
          >
            {article.content}
          </div>

          {/* Attachments Section */}
          {attachments.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                background: '#fafbff',
                borderRadius: 8,
                border: '1px solid #e8e8f0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 12,
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#444',
                }}
              >
                <Paperclip size={14} color="#6366f1" />
                Attachments ({attachments.length})
              </div>
              {attachments.map((att, idx) => (
                <AttachmentPreview key={idx} attachment={att} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Compute suggestions based on current input
  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || articles.length === 0) return [];
    const q = searchQuery.toLowerCase();
    const matches = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q) ||
        (Array.isArray(a.tags) ? a.tags : []).some((t) => t.toLowerCase().includes(q))
    );
    return matches.slice(0, 8);
  }, [searchQuery, articles]);

  // Trending: articles in most common categories
  const trendingArticles = useMemo(() => {
    if (articles.length === 0) return [];
    const categoryCount = {};
    articles.forEach((a) => {
      categoryCount[a.category] = (categoryCount[a.category] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([cat]) => cat);
    return articles.filter((a) => topCategories.includes(a.category)).slice(0, 5);
  }, [articles]);

  // Recent: last 5 articles (by id descending as proxy for recency)
  const recentArticles = useMemo(() => {
    return [...articles].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);
  }, [articles]);

  // Live search: filter dynamically as user types (debounced)
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setFiltered(articles);
      return;
    }
    const q = debouncedQuery.toLowerCase();
    const localFiltered = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.category || '').toLowerCase().includes(q) ||
        (Array.isArray(a.tags) ? a.tags : []).some((t) => t.toLowerCase().includes(q))
    );
    // Try API search for better results, fall back to local
    searchKB(debouncedQuery)
      .then((results) => {
        setFiltered(Array.isArray(results) ? results : localFiltered);
      })
      .catch(() => {
        setFiltered(localFiltered);
      });
  }, [debouncedQuery, articles]);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchArticles = useCallback(async () => {
    try {
      const data = await getKB();
      const list = Array.isArray(data) ? data : [];
      setArticles(list);
      setFiltered(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleSuggestionClick = (article) => {
    setSearchQuery(article.title);
    setShowSuggestions(false);
    setFiltered([article]);
    searchInputRef.current?.blur();
  };

  const handleSuggestionKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[selectedSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleEdit = (article) => {
    setEditingArticle(article);
    setShowModal(true);
  };

  const handleDelete = async (article) => {
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return;
    try {
      await deleteKB(article.id);
      fetchArticles();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingArticle(null);
  };

  const handleSaved = () => {
    fetchArticles();
  };

  const clearSearch = () => {
    setSearchQuery('');
    setFiltered(articles);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  const hasActiveSearch = debouncedQuery.trim().length > 0;

  return (
    <>
      <div className="page-header flex justify-between items-center">
        <div>
          <h2>Knowledge Base</h2>
          <p>Search and manage support articles</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingArticle(null);
            setShowModal(true);
          }}
        >
          <Plus size={16} /> New Article
        </button>
      </div>

      <div className="filters-bar">
        <div className="flex-1" style={{ position: 'relative', maxWidth: 400 }}>
          <input
            ref={searchInputRef}
            className="form-control w-full"
            style={{ paddingLeft: 36 }}
            placeholder="Search articles…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
              setSelectedSuggestionIndex(-1);
            }}
            onFocus={() => {
              if (searchQuery.trim()) setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSuggestionKeyDown(e);
              } else {
                handleSuggestionKeyDown(e);
              }
            }}
          />
          <Search
            size={16}
            color="#999"
            style={{ position: 'absolute', left: 10, top: 10 }}
          />

          {/* Suggestions Dropdown */}
          {showSuggestions && searchQuery.trim() && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 100,
                maxHeight: 320,
                overflowY: 'auto',
                marginTop: 4,
              }}
            >
              {suggestions.map((article, idx) => (
                <div
                  key={article.id}
                  onClick={() => handleSuggestionClick(article)}
                  onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: idx === selectedSuggestionIndex ? '#f0f7ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 14, color: '#333' }}>
                    {article.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {article.category}
                    {article.tags && (Array.isArray(article.tags) ? article.tags : []).length > 0 && (
                      <span> · {(Array.isArray(article.tags) ? article.tags : []).slice(0, 3).join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {searchQuery && (
          <button className="btn btn-outline btn-sm" onClick={clearSearch}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-spinner">Loading articles…</div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle size={32} /> {error}
        </div>
      ) : hasActiveSearch && filtered.length === 0 ? (
        <div className="empty-state">
          No articles found for "{searchQuery}".
        </div>
      ) : hasActiveSearch ? (
        <div>
          <div className="text-sm text-muted mb-4">
            {filtered.length} article{filtered.length !== 1 ? 's' : ''} found
          </div>
          {filtered.map((article) => (
            <KBArticle
              key={article.id}
              article={article}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div>
          {/* Search results (all articles) */}
          {filtered.length > 0 && (
            <div>
              <div className="text-sm text-muted mb-4">
                {filtered.length} article{filtered.length !== 1 ? 's' : ''}
              </div>
              {filtered.map((article) => (
                <KBArticle
                  key={article.id}
                  article={article}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Trending Section */}
          {trendingArticles.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} color="#6366f1" />
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Trending Topics</h3>
              </div>
              {trendingArticles.map((article) => (
                <KBArticle
                  key={`trending-${article.id}`}
                  article={article}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Recent Section */}
          {recentArticles.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} color="#6366f1" />
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Recently Added</h3>
              </div>
              {recentArticles.map((article) => (
                <KBArticle
                  key={`recent-${article.id}`}
                  article={article}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && trendingArticles.length === 0 && recentArticles.length === 0 && (
            <div className="empty-state">
              No articles yet. Create your first one!
            </div>
          )}
        </div>
      )}

      {showModal && (
        <KBModal
          article={editingArticle}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
