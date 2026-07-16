const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('fiji_token');
}

// C6: CSRF token helper
function getCsrfToken() {
  const match = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
  return match ? match.split('=')[1] : null;
}

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // C6: Add X-CSRF-Token header to all mutating requests
  if (options.method && MUTATING_METHODS.includes(options.method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const config = { ...options, headers };

  try {
    const response = await fetch(url, config);
    if (response.status === 401) {
      // Token expired or invalid — force re-login
      localStorage.removeItem('fiji_token');
      localStorage.removeItem('fiji_refresh_token');
      localStorage.removeItem('fiji_user');
      window.location.href = '/login';
      return null;
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  } catch (err) {
    // H9: Network failure detection
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Network error — please check your connection and try again.');
    }
    throw err;
  }
}

// ===== Leads =====
export const getLeads = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/leads${qs ? '?' + qs : ''}`);
};
export const createLead = (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) });
export const reviewLead = (leadId, data) => request(`/leads/${leadId}/review`, { method: 'POST', body: JSON.stringify(data) });

// ===== Tickets =====
export const getTickets = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/tickets${qs ? '?' + qs : ''}`);
};
export const getTicket = (id) => request(`/tickets/${id}`);
export const createTicket = (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) });
export const updateTicket = (id, data) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const closeTicket = (id) => request(`/tickets/${id}/close`, { method: 'POST' });
export const deleteTicket = (id) => request(`/tickets/${id}`, { method: 'DELETE' });

// ===== Time Entries =====
export const getTimeEntries = (ticketId) => request(`/tickets/${ticketId}/time`);
export const startTime = (ticketId, userId) => {
  const qs = userId ? `?user_id=${userId}` : '';
  return request(`/tickets/${ticketId}/time/start${qs}`, { method: 'POST' });
};
export const stopTime = (ticketId, userId) => {
  const qs = userId ? `?user_id=${userId}` : '';
  return request(`/tickets/${ticketId}/time/stop${qs}`, { method: 'POST' });
};
export const updateTimeEntry = (ticketId, entryId, data) =>
  request(`/tickets/${ticketId}/time/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTimeEntry = (ticketId, entryId) =>
  request(`/tickets/${ticketId}/time/${entryId}`, { method: 'DELETE' });
export const addManualTimeEntry = (ticketId, data) =>
  request(`/tickets/${ticketId}/time/manual`, { method: 'POST', body: JSON.stringify(data) });

// ===== Comments =====
export const getComments = (ticketId) => request(`/comments/ticket/${ticketId}`);
export const createComment = (ticketId, data) => {
  const payload = { ...data };
  if ('is_private' in payload) {
    payload.visibility = payload.is_private ? 'PRIVATE' : 'PUBLIC';
    delete payload.is_private;
  }
  return request(`/comments/?ticket_id=${ticketId}`, { method: 'POST', body: JSON.stringify(payload) });
};

// ===== Clients =====
export const getClients = () => request('/clients');
export const getClient = (id) => request(`/clients/${id}`);
export const createClient = (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id, data) => request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ===== Client Members =====
export const getClientMembers = (clientId) => request(`/clients/${clientId}/members`);
export const createClientMember = (clientId, data) => request(`/clients/${clientId}/members`, { method: 'POST', body: JSON.stringify(data) });
export const updateClientMember = (clientId, memberId, data) => request(`/clients/${clientId}/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteClientMember = (clientId, memberId) => request(`/clients/${clientId}/members/${memberId}`, { method: 'DELETE' });

// ===== Knowledge Base =====
export const getKB = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/kb${qs ? '?' + qs : ''}`);
};
export const createKB = (data) => request('/kb', { method: 'POST', body: JSON.stringify(data) });
export const updateKB = (articleId, data) => request(`/kb/${articleId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteKB = (articleId) => request(`/kb/${articleId}`, { method: 'DELETE' });
export const searchKB = (query) => request(`/kb?search=${encodeURIComponent(query)}`);

// ===== Users =====
export const getUsers = () => request('/users');

// ===== Invoices =====
export const getInvoices = () => request('/invoices');
export const getInvoice = (id) => request(`/invoices/${id}`);
export const createInvoice = (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) });
export const sendInvoice = (id) => request(`/invoices/${id}/send`, { method: 'POST' });

// ===== Poppy AI =====
const API_BASE_POPPY = '/api';

function poppyGetToken() {
  return localStorage.getItem('fiji_token');
}

async function poppyRequest(path, { method = 'GET', body, queryParams = {} } = {}) {
  const params = new URLSearchParams(queryParams).toString();
  const url = `${API_BASE_POPPY}${path}${params ? '?' + params : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  const token = poppyGetToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);
  const response = await fetch(url, config);
  if (response.status === 401) {
    localStorage.removeItem('fiji_token');
    localStorage.removeItem('fiji_refresh_token');
    localStorage.removeItem('fiji_user');
    window.location.href = '/login';
    return null;
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const getPoppyBoards = () => poppyRequest('/poppy/boards');
export const getPoppyChats = (boardId) => poppyRequest(`/poppy/chats/${boardId}`);
export const askPoppy = (boardId, chatId, prompt, model = 'claude-sonnet-4-6') =>
  poppyRequest('/poppy/ask', {
    method: 'POST',
    body: { prompt, model },
    queryParams: { board_id: boardId, chat_id: chatId },
  });
export const createPoppyConversation = (boardId, chatId, name) =>
  poppyRequest('/poppy/conversation', {
    method: 'POST',
    body: { name },
    queryParams: { board_id: boardId, chat_id: chatId },
  });
export const sendPoppyMessage = (conversationId, boardId, chatId, prompt, model = 'claude-sonnet-4-6') =>
  poppyRequest(`/poppy/conversation/${conversationId}`, {
    method: 'POST',
    body: { prompt, model },
    queryParams: { board_id: boardId, chat_id: chatId },
  });

// ===== Kanban Board =====
export const getBoard = () => request('/board');
export const getBoardStats = () => request('/board/stats');
export const reorderBoard = (data) => request('/board/reorder', { method: 'POST', body: JSON.stringify(data) });

// ===== Labels =====
export const getLabels = () => request('/labels');
export const createLabel = (data) => request('/labels', { method: 'POST', body: JSON.stringify(data) });
export const updateLabel = (id, data) => request(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLabel = (id) => request(`/labels/${id}`, { method: 'DELETE' });

// ===== Checklists =====
export const getChecklists = (ticketId) => request(`/tickets/${ticketId}/checklists`);
export const createChecklist = (ticketId, data) => request(`/tickets/${ticketId}/checklists`, { method: 'POST', body: JSON.stringify({ ...data, ticket_id: ticketId }) });
export const updateChecklist = (id, data) => request(`/checklists/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteChecklist = (id) => request(`/checklists/${id}`, { method: 'DELETE' });
export const addChecklistItem = (checklistId, data) => request(`/checklists/${checklistId}/items`, { method: 'POST', body: JSON.stringify({ ...data, checklist_id: checklistId }) });
export const updateChecklistItem = (id, data) => request(`/checklist-items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteChecklistItem = (id) => request(`/checklist-items/${id}`, { method: 'DELETE' });
export const toggleAllChecklistItems = (checklistId) => request(`/checklists/${checklistId}/toggle-all`, { method: 'POST' });

// ===== Attachments =====
export const getAttachments = (ticketId) => request(`/tickets/${ticketId}/attachments`);
export const uploadAttachment = (ticketId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const csrfToken = getCsrfToken();
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return fetch(`${API_BASE}/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers,
    body: formData,
  }).then(r => r.json());
};
export const deleteAttachment = (id) => request(`/attachments/${id}`, { method: 'DELETE' });

// ===== Activity =====
export const getActivity = (ticketId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/tickets/${ticketId}/activity${qs ? '?' + qs : ''}`);
};

// ===== Ticket Actions =====
export const archiveTicket = (id) => request(`/tickets/${id}/archive`, { method: 'POST' });
export const unarchiveTicket = (id) => request(`/tickets/${id}/unarchive`, { method: 'POST' });
export const moveTicket = (id, data) => request(`/tickets/${id}/move`, { method: 'POST', body: JSON.stringify(data) });
export const copyTicket = (id) => request(`/tickets/${id}/copy`, { method: 'POST' });
export const addTicketMember = (ticketId, userId) => request(`/tickets/${ticketId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const removeTicketMember = (ticketId, userId) => request(`/tickets/${ticketId}/members/${userId}`, { method: 'DELETE' });
export const addTicketLabel = (ticketId, labelId) => request(`/tickets/${ticketId}/labels`, { method: 'POST', body: JSON.stringify({ label_id: labelId }) });
export const removeTicketLabel = (ticketId, labelId) => request(`/tickets/${ticketId}/labels/${labelId}`, { method: 'DELETE' });

// ===== Voice Agent Settings =====
export const getVoiceAgentSettings = () => request('/settings/voice-agent');
export const updateVoiceAgentSettings = (data) => request('/settings/voice-agent', { method: 'POST', body: JSON.stringify(data) });

// ===== Call Logs =====
export const createCallLog = (data) => request('/call-logs', { method: 'POST', body: JSON.stringify(data) });
export const getCallLogs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/call-logs${qs ? '?' + qs : ''}`);
};
export const getCallLogStats = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/call-logs/stats${qs ? '?' + qs : ''}`);
};
