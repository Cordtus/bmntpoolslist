import { expect, test } from 'bun:test';
import { buildPromptedQuery, parseNaturalLanguageQuery } from '../search-flow.js';

test('recognizes a plain-language token query', () => {
	expect(parseNaturalLanguageQuery('find pools with uatom')).toEqual({
		command: 'token',
		args: ['uatom'],
	});
});

test('builds a channel query one answer at a time', async () => {
	const answers = ['2', 'channel-0'];
	const query = await buildPromptedQuery(async () => answers.shift());

	expect(query).toEqual({ command: 'channel', args: ['channel-0'] });
});

test('builds an asset query from the guided selection', async () => {
	const answers = ['3', 'uosmo'];
	const query = await buildPromptedQuery(async () => answers.shift());

	expect(query).toEqual({ command: 'asset', args: ['uosmo'] });
});

test('builds an all-assets query from a guided selection', async () => {
	const answers = ['4', 'all', 'uosmo, uatom'];
	const query = await buildPromptedQuery(async () => answers.shift());

	expect(query).toEqual({ command: 'assets', args: ['all', 'uosmo', 'uatom'] });
});
