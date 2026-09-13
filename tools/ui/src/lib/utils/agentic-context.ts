import { ContentPartType, MessageRole } from '$lib/enums';
import type { AgenticToolCallPayload } from '$lib/types/agentic';
import type { ApiChatMessageData } from '$lib/types/api';

const INSPECTION_TOOLS = new Set(['read_file', 'file_glob_search', 'grep_search', 'get_info']);
const RESULT_LIMIT = 16_000;
const HISTORY_HIGH_WATER = 64_000;
const HISTORY_TARGET = 32_000;
const RECENT_RESULTS = 4;
const OLD_RESULT_LIMIT = 1_000;

export class AgentTurnTruncatedError extends Error {
	constructor() {
		super(
			'Agent response reached its token limit. No tools from this incomplete turn were executed. Use a smaller task or increase the completion limit.'
		);
		this.name = 'AgentTurnTruncatedError';
	}
}

function excerpt(text: string, limit: number): string {
	if (text.length <= limit) return text;

	const marker =
		'\n[Tool output excerpt: middle omitted from model context, not from saved history. This is not a finding that the file is OK. Read the relevant line range again before editing omitted content.]\n';
	const remaining = limit - marker.length;

	return text.slice(0, Math.ceil(remaining / 2)) + marker + text.slice(-Math.floor(remaining / 2));
}

export function hasInvalidToolArguments(calls: AgenticToolCallPayload[]): boolean {
	return calls.some((call) => {
		try {
			const args: unknown = JSON.parse(call.function.arguments);

			return args === null || typeof args !== 'object' || Array.isArray(args);
		} catch {
			return true;
		}
	});
}

/** Project raw history into request context; never persist this lossy projection. */
export function compactToolContext(messages: ApiChatMessageData[]): ApiChatMessageData[] {
	const calls = new Map<string, string>();
	const candidates: { index: number; text: string }[] = [];
	const result = messages.map((message, index) => {
		if (message.role === MessageRole.ASSISTANT) {
			for (const call of message.tool_calls ?? []) {
				if (call.id) calls.set(call.id, call.function?.name ?? '');
			}
		}

		if (
			message.role !== MessageRole.TOOL ||
			!INSPECTION_TOOLS.has(calls.get(message.tool_call_id ?? '') ?? '')
		)
			return message;

		const content = message.content;
		const text =
			typeof content === 'string'
				? content
				: content.length === 1 && content[0].type === ContentPartType.TEXT
					? content[0].text
					: undefined;

		if (typeof text !== 'string') return message;

		candidates.push({ index, text });

		return { ...message, content: excerpt(text, RESULT_LIMIT) };
	});

	let size = candidates.reduce((sum, item) => sum + Math.min(item.text.length, RESULT_LIMIT), 0);

	if (size > HISTORY_HIGH_WATER) {
		for (const item of candidates.slice(0, -RECENT_RESULTS)) {
			const compact = excerpt(item.text, OLD_RESULT_LIMIT);

			size -= (result[item.index].content as string).length - compact.length;
			result[item.index] = { ...result[item.index], content: compact };

			if (size <= HISTORY_TARGET) break;
		}
	}

	return result;
}

export const EXPLORATION_REMINDER =
	'Agent execution checkpoint: several read/search calls have completed without an intervening action. Use the evidence already collected. If the user requested changes and enough context is available, make the smallest justified change and verify it now. If this is a question or review, report concrete findings instead. If essential information is missing, read only that specific information. Never edit just to satisfy a counter, invent results, or claim unexecuted work.';

/** Counts inspection calls, not model tokens; checked only after a complete tool batch. */
export class ExplorationGuard {
	private reads = 0;
	private reminded = false;

	checkpoint(): 'continue' | 'remind' {
		if (this.reads >= 8 && !this.reminded) {
			this.reminded = true;

			return 'remind';
		}

		return 'continue';
	}

	record(name: string, success: boolean): void {
		if (INSPECTION_TOOLS.has(name)) this.reads++;
		else if (success) this.reset();
	}

	reset(): void {
		this.reads = 0;
		this.reminded = false;
	}
}
