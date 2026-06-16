const BASE = '/api';

function formatClientError(res, data, path) {
  if (data?.error && !/^not found$/i.test(data.error)) {
    return data.error;
  }
  if (res.status === 404) {
    if (path.includes('/summary')) {
      return 'Fathom could not find a summary for this meeting yet. Click Refresh to sync, then try again.';
    }
    if (path.includes('/process/')) {
      return 'Import failed — the server could not process this meeting. Check the terminal logs for details.';
    }
    return 'Not found. Make sure the server is running (npm run dev from the project root) and you are signed in.';
  }
  if (res.status === 401) return 'Please sign in again to continue.';
  if (res.status === 429) return 'Fathom rate limit exceeded. Wait a few minutes and try Refresh.';
  if (res.status === 503) return data?.error || 'This feature is not configured on the server.';
  return data?.error || `Something went wrong (HTTP ${res.status}).`;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok && !text) {
      const msg = 'Cannot reach the API server. Run npm run dev from the project root (not just the client folder).';
      console.error('[API]', path, res.status, msg);
      throw new Error(msg);
    }
    const msg = 'The server returned an invalid response. Check that npm run dev is running from the project root.';
    console.error('[API]', path, res.status, text?.slice(0, 200));
    throw new Error(msg);
  }

  if (!res.ok) {
    const message = formatClientError(res, data, path);
    console.error('[API Error]', {
      path,
      status: res.status,
      message,
      serverError: data?.error,
      body: data,
    });
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  getMe: () => request('/auth/me'),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  verifyEmail: (body) => request('/auth/verify-email', { method: 'POST', body }),
  resendCode: (body) => request('/auth/resend-code', { method: 'POST', body }),
  setupEncryption: () => request('/auth/setup-encryption', { method: 'POST' }),
  unlockVault: (body) => request('/auth/unlock-vault', { method: 'POST', body }),
  lockVault: () => request('/auth/lock-vault', { method: 'POST' }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  googleLoginUrl: () => `${BASE}/auth/google`,

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (body) => request('/settings', { method: 'PATCH', body }),

  // Fathom (DB-backed; sync only on explicit refresh)
  listFathomMeetings: () => request('/fathom/meetings'),
  syncFathomMeetings: () => request('/fathom/meetings/sync', { method: 'POST' }),
  moveFathomFolder: (recordingId, body) =>
    request(`/fathom/meetings/${recordingId}/folder`, { method: 'PATCH', body }),
  getFathomSummary: (fathomId) => request(`/fathom/meetings/${fathomId}/summary`),

  // DB meetings
  getMeetings: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.folder_id) qs.set('folder_id', params.folder_id);
    const query = qs.toString();
    return request(`/meetings${query ? `?${query}` : ''}`);
  },
  getFolders: () => request('/meetings/folders'),
  createFolder: (name) => request('/meetings/folders', { method: 'POST', body: { name } }),
  deleteFolder: (folderId) => request(`/meetings/folders/${folderId}`, { method: 'DELETE' }),
  organizeMeetings: () => request('/meetings/organize', { method: 'POST' }),
  updateMeeting: (id, body) => request(`/meetings/${id}`, { method: 'PATCH', body }),
  getMeeting: (id) => request(`/meetings/${id}`),
  deleteMeeting: (id) => request(`/meetings/${id}`, { method: 'DELETE' }),
  getAllCommitments: () => request('/meetings/commitments/all'),

  updateActionItem: (id, body) => request(`/meetings/action-items/${id}`, { method: 'PATCH', body }),
  updateNextStep: (id, body) => request(`/meetings/next-steps/${id}`, { method: 'PATCH', body }),

  processMeeting: (body) => request('/process/meeting', { method: 'POST', body }),
};
