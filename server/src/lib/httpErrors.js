/** Map HTTP/status codes to user-friendly messages. */
export function friendlyError(err, context = '') {
  const status = err?.status || err?.statusCode;
  const raw = err?.message || String(err);

  if (status === 401) {
    return 'Your session expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission to do that.';
  }
  if (status === 404) {
    if (context === 'saved_meeting') {
      return 'This saved meeting was not found. It may have been deleted or belongs to another account.';
    }
    if (context === 'fathom_summary' || context === 'fathom_recording') {
      return 'Fathom could not find this meeting or its summary yet. Click Refresh to sync, then try importing again.';
    }
    if (context === 'fathom_folder') {
      return 'This meeting is not in your local cache. Click Refresh to sync from Fathom.';
    }
    if (context === 'api_route') {
      return 'API endpoint not found. Make sure the server is running (npm run dev from the project root).';
    }
    return 'The requested item was not found.';
  }
  if (status === 429) {
    return 'Fathom rate limit exceeded. Wait a few minutes, then click Refresh.';
  }
  if (status === 503) {
    return raw.includes('Google') ? raw : 'This feature is not available right now. Check server configuration.';
  }

  // Replace generic messages
  if (/^not found$/i.test(raw)) {
    return friendlyError({ status: 404 }, context);
  }

  return raw;
}

export function logError(label, err, meta = {}) {
  console.error(`[${label}]`, {
    message: err?.message,
    status: err?.status || err?.statusCode,
    ...meta,
  });
  if (err?.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
}

export function sendError(res, err, context = '', statusOverride) {
  const status = statusOverride || err?.status || err?.statusCode || 500;
  const error = friendlyError(err, context);
  logError(context || 'API', err, { status });
  return res.status(status).json({ error });
}
