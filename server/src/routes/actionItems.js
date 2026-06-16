import { Router } from 'express';
import { requireAuth, getUserId, getVaultKey, requireVault } from '../middleware/auth.js';
import {
  getEmailSuggestions,
  listAssignmentsForUser,
  updateAssignmentStatus,
} from '../lib/actionAssignments.js';
import { listActionItemsQueue } from '../lib/actionItemsQueue.js';
import { listArchivedActionItems } from '../lib/actionItemArchive.js';
import { listComments, addComment } from '../lib/actionItemComments.js';
import { sendError } from '../lib/httpErrors.js';

const router = Router();
router.use(requireAuth);

router.get('/queue', requireVault, async (req, res) => {
  try {
    const items = await listActionItemsQueue(getUserId(req), req.user.email, getVaultKey(req));
    res.json({ items });
  } catch (err) {
    return sendError(res, err, 'action_items_queue');
  }
});

router.get('/archive', requireVault, async (req, res) => {
  try {
    const items = await listArchivedActionItems(getUserId(req), req.user.email, getVaultKey(req));
    res.json({ items });
  } catch (err) {
    return sendError(res, err, 'action_items_archive');
  }
});

router.get('/assigned', async (req, res) => {
  try {
    const userId = getUserId(req);
    const assignments = await listAssignmentsForUser(userId, req.user.email);
    res.json({ assignments });
  } catch (err) {
    return sendError(res, err, 'assigned_action_items');
  }
});

router.get('/email-suggestions', async (req, res) => {
  try {
    const emails = await getEmailSuggestions(getUserId(req));
    res.json({ emails });
  } catch (err) {
    return sendError(res, err, 'email_suggestions');
  }
});

router.get('/:actionItemId/comments', async (req, res) => {
  try {
    const comments = await listComments(
      Number(req.params.actionItemId),
      getUserId(req),
      req.user.email,
    );
    res.json({ comments });
  } catch (err) {
    return sendError(res, err, 'action_item_comments', err.status);
  }
});

router.post('/:actionItemId/comments', async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

  try {
    const comment = await addComment(
      Number(req.params.actionItemId),
      getUserId(req),
      req.user.email,
      req.user.name,
      body,
    );
    res.status(201).json({ comment });
  } catch (err) {
    return sendError(res, err, 'action_item_comment_create', err.status);
  }
});

router.patch('/assigned/:id', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  try {
    const assignment = await updateAssignmentStatus(
      req.params.id,
      getUserId(req),
      req.user.email,
      status,
    );
    res.json({ assignment });
  } catch (err) {
    return sendError(res, err, 'assignment_update', err.status);
  }
});

export default router;
