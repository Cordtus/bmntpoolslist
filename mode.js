const MODES = new Set(['fresh', 'partial']);

function modeFromArgs(args) {
	for (let index = 0; index < args.length; index++) {
		if (args[index] === '--mode') return args[index + 1];
		if (args[index].startsWith('--mode=')) return args[index].slice('--mode='.length);
	}
	return undefined;
}

export async function resolveCollectionMode(args, prompt) {
	const requested = modeFromArgs(args);
	if (requested) {
		if (!MODES.has(requested)) throw new Error(`Unknown collection mode "${requested}". Use fresh or partial.`);
		return requested;
	}

	const answer = String(await prompt()).trim().toLowerCase();
	if (!MODES.has(answer)) throw new Error('Choose "fresh" or "partial".');
	return answer;
}
