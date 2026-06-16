import { decryptJson, decryptString, encryptJson, encryptString } from './encryption.js';

export function encryptFathomMeetingRow(row, vaultKey) {
  return {
    title_enc: encryptString(row.title, vaultKey),
    participants_enc: encryptJson(row.participants, vaultKey),
    summary_enc: row.summary ? encryptString(row.summary, vaultKey) : null,
    action_items_enc: encryptJson(row.action_items, vaultKey),
    raw_payload_enc: encryptJson(row.raw_payload, vaultKey),
  };
}

export function decryptFathomMeetingRow(row, vaultKey) {
  return {
    ...row,
    title: decryptString(row.title_enc, vaultKey),
    participants: decryptJson(row.participants_enc, vaultKey) || [],
    summary: row.summary_enc ? decryptString(row.summary_enc, vaultKey) : null,
    action_items: decryptJson(row.action_items_enc, vaultKey) || [],
    raw_payload: row.raw_payload_enc ? decryptJson(row.raw_payload_enc, vaultKey) : null,
  };
}

export function encryptMeetingRow(row, vaultKey) {
  return {
    title_enc: encryptString(row.title, vaultKey),
    participants_enc: encryptJson(row.participants, vaultKey),
    summary_enc: row.summary ? encryptString(row.summary, vaultKey) : null,
    summary_raw_enc: row.summary_raw ? encryptString(row.summary_raw, vaultKey) : null,
  };
}

export function decryptMeetingRow(row, vaultKey) {
  return {
    ...row,
    title: decryptString(row.title_enc, vaultKey),
    participants: decryptJson(row.participants_enc, vaultKey) || [],
    summary: row.summary_enc ? decryptString(row.summary_enc, vaultKey) : null,
    summary_raw: row.summary_raw_enc ? decryptString(row.summary_raw_enc, vaultKey) : null,
  };
}

export function encryptTranscriptRow(row, vaultKey) {
  return {
    content_enc: encryptString(row.content, vaultKey),
    speakers_enc: encryptJson(row.speakers, vaultKey),
  };
}

export function decryptTranscriptRow(row, vaultKey) {
  return {
    ...row,
    content: decryptString(row.content_enc, vaultKey),
    speakers: decryptJson(row.speakers_enc, vaultKey) || [],
  };
}

export function encryptActionItemRow(row, vaultKey) {
  return {
    assignee_enc: encryptString(row.assignee, vaultKey),
    description_enc: encryptString(row.description, vaultKey),
    notes_enc: row.notes ? encryptString(row.notes, vaultKey) : null,
  };
}

export function decryptActionItemRow(row, vaultKey) {
  return {
    ...row,
    assignee: decryptString(row.assignee_enc, vaultKey),
    description: decryptString(row.description_enc, vaultKey),
    notes: row.notes_enc ? decryptString(row.notes_enc, vaultKey) : null,
  };
}

export function encryptNextStepRow(row, vaultKey) {
  return {
    description_enc: encryptString(row.description, vaultKey),
    owner_enc: row.owner ? encryptString(row.owner, vaultKey) : null,
  };
}

export function decryptNextStepRow(row, vaultKey) {
  return {
    ...row,
    description: decryptString(row.description_enc, vaultKey),
    owner: row.owner_enc ? decryptString(row.owner_enc, vaultKey) : null,
  };
}
