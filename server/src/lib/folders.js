import pool from '../db/pool.js';

export const DEFAULT_FOLDERS = [
  { id: 'sales-clients', name: 'Sales & Clients', sort_order: 1 },
  { id: 'engineering-product', name: 'Engineering & Product', sort_order: 2 },
  { id: 'one-on-one-team', name: '1:1 & Team Sync', sort_order: 3 },
  { id: 'leadership-strategy', name: 'Leadership & Strategy', sort_order: 4 },
  { id: 'customer-success', name: 'Customer Success', sort_order: 5 },
  { id: 'vendor-partnerships', name: 'Vendors & Partnerships', sort_order: 6 },
  { id: 'uncategorized', name: 'Uncategorized', sort_order: 99 },
];

export async function ensureDefaultFolders(client = pool) {
  for (const folder of DEFAULT_FOLDERS) {
    await client.query(
      `INSERT INTO folders (id, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`,
      [folder.id, folder.name, folder.sort_order],
    );
  }
}

export async function getFolderById(folderId, client = pool) {
  const { rows } = await client.query('SELECT * FROM folders WHERE id = $1', [folderId]);
  return rows[0] || null;
}

export async function listFolders(client = pool) {
  const { rows } = await client.query(
    `SELECT f.*,
       (SELECT COUNT(*)::int FROM meetings WHERE folder_id = f.id) AS meeting_count,
       (SELECT COUNT(*)::int FROM fathom_meetings WHERE folder_id = f.id) AS fathom_count
     FROM folders f
     ORDER BY f.sort_order ASC, name ASC`,
  );
  return rows.map((row) => ({
    ...row,
    usage_count: row.meeting_count + row.fathom_count,
  }));
}

function slugifyFolderName(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'category';
}

export async function createFolder(name, client = pool) {
  const trimmed = name?.trim();
  if (!trimmed) {
    const err = new Error('Category name is required');
    err.status = 400;
    throw err;
  }

  let id = `custom-${slugifyFolderName(trimmed)}`;
  let suffix = 0;
  while (true) {
    const { rows } = await client.query('SELECT id FROM folders WHERE id = $1', [id]);
    if (!rows.length) break;
    suffix += 1;
    id = `custom-${slugifyFolderName(trimmed)}-${suffix}`;
  }

  const { rows: orderRows } = await client.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM folders WHERE sort_order < 90',
  );
  const sortOrder = Math.min(orderRows[0].next_order, 98);

  const { rows } = await client.query(
    `INSERT INTO folders (id, name, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [id, trimmed, sortOrder],
  );
  return { ...rows[0], meeting_count: 0, fathom_count: 0, usage_count: 0 };
}

export async function deleteFolderIfEmpty(folderId, client = pool) {
  if (folderId === 'uncategorized') {
    const err = new Error('The Uncategorized folder cannot be deleted');
    err.status = 400;
    throw err;
  }

  const folder = await getFolderById(folderId, client);
  if (!folder) {
    const err = new Error('Category not found');
    err.status = 404;
    throw err;
  }

  const { rows } = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM meetings WHERE folder_id = $1) AS meeting_count,
       (SELECT COUNT(*)::int FROM fathom_meetings WHERE folder_id = $1) AS fathom_count`,
    [folderId],
  );
  const usage = rows[0].meeting_count + rows[0].fathom_count;
  if (usage > 0) {
    const err = new Error('Move or remove all meetings from this category before deleting it');
    err.status = 400;
    throw err;
  }

  await client.query('DELETE FROM folders WHERE id = $1', [folderId]);
  return { success: true };
}
