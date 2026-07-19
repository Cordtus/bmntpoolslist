import { expect, test } from 'bun:test';
import { resolveCollectionMode } from '../mode.js';

test('uses an explicit mode without prompting', async () => {
	let prompted = false;

	const mode = await resolveCollectionMode(['--mode', 'fresh'], async () => {
		prompted = true;
		return 'partial';
	});

	expect(mode).toBe('fresh');
	expect(prompted).toBeFalse();
});

test('prompts for fresh or partial mode when no flag is supplied', async () => {
	const mode = await resolveCollectionMode([], async () => 'partial');

	expect(mode).toBe('partial');
});
