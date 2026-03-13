import { type ItemStatus, VALID_STATUS_TRANSITIONS } from '@ctrlpane/shared';
import { describe, expect, it } from 'vitest';

describe('Status State Machine [unit]', () => {
  it('allows pending -> in_progress', () => {
    expect(VALID_STATUS_TRANSITIONS.pending).toContain('in_progress');
  });

  it('allows in_progress -> done', () => {
    expect(VALID_STATUS_TRANSITIONS.in_progress).toContain('done');
  });

  it('allows in_progress -> pending (reassign)', () => {
    expect(VALID_STATUS_TRANSITIONS.in_progress).toContain('pending');
  });

  it('allows done -> in_progress (reopen)', () => {
    expect(VALID_STATUS_TRANSITIONS.done).toContain('in_progress');
  });

  it('rejects pending -> done (must go through in_progress)', () => {
    expect(VALID_STATUS_TRANSITIONS.pending).not.toContain('done');
  });

  it('rejects done -> pending (must reopen first)', () => {
    expect(VALID_STATUS_TRANSITIONS.done).not.toContain('pending');
  });

  it('covers all statuses in transition map', () => {
    const allStatuses: ItemStatus[] = ['pending', 'in_progress', 'done'];
    for (const status of allStatuses) {
      expect(VALID_STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('each status has at least one valid transition', () => {
    for (const [_status, transitions] of Object.entries(VALID_STATUS_TRANSITIONS)) {
      expect(transitions.length).toBeGreaterThan(0);
    }
  });

  it('no self-transitions are allowed', () => {
    for (const [_status, transitions] of Object.entries(VALID_STATUS_TRANSITIONS)) {
      expect(transitions).not.toContain(_status);
    }
  });
});
