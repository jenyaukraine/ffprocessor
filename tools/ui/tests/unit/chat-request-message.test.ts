import { ContentPartType, MessageRole, ToolCallType } from '$lib/enums';
import type { ApiChatMessageData } from '$lib/types/api';
import {
	agentCompletionLimit,
	compactToolContext,
	ExplorationGuard,
	hasInvalidToolArguments
} from '$lib/utils/agentic-context';
import { toChatRequestMessage } from '$lib/utils/chat-request-message';
import { describe, expect, it } from 'vitest';

const toolTurn: ApiChatMessageData = {
	content: '',
	reasoning_content: 'Read the file before editing it.',
	role: MessageRole.ASSISTANT,
	tool_calls: [
		{
			function: { arguments: '{"path":"a.ts"}', name: 'read_file' },
			id: 'call_1',
			type: 'function'
		}
	]
};

describe('chat request reasoning replay', () => {
	it.each([false, true])('preserves tool reasoning with exclusion=%s', (exclude) => {
		expect(toChatRequestMessage(toolTurn, exclude)).toEqual(toolTurn);
	});
	it('preserves an explicitly empty reasoning field', () => {
		expect(
			toChatRequestMessage({ ...toolTurn, reasoning_content: '' }, true).reasoning_content
		).toBe('');
	});
	it('does not fabricate missing reasoning', () => {
		const { reasoning_content: _reasoning, ...message } = toolTurn;

		expect(toChatRequestMessage(message, true)).not.toHaveProperty('reasoning_content');
	});
	it('still excludes reasoning for ordinary answers', () => {
		const message = {
			content: 'Done',
			reasoning_content: 'Check result',
			role: MessageRole.ASSISTANT
		};

		expect(toChatRequestMessage(message, true)).not.toHaveProperty('reasoning_content');
		expect(toChatRequestMessage(message, false).reasoning_content).toBe('Check result');
		expect(message.reasoning_content).toBe('Check result');
	});
	it('keeps tool results paired across multiple turns and JSON serialization', () => {
		const result = { content: 'file contents', role: MessageRole.TOOL, tool_call_id: 'call_1' };
		const history = [
			toolTurn,
			result,
			{ ...toolTurn, tool_calls: [{ ...toolTurn.tool_calls![0], id: 'call_2' }] }
		];

		expect(
			JSON.parse(JSON.stringify(history.map((msg) => toChatRequestMessage(msg, true))))
		).toEqual(history);
	});
});

function readHistory(count: number, size = 10_000): ApiChatMessageData[] {
	return Array.from({ length: count }, (_, i) => [
		{ ...toolTurn, tool_calls: [{ ...toolTurn.tool_calls![0], id: `read_${i}` }] },
		{
			content: `head-${i}\n${'x'.repeat(size)}\ntail-${i}`,
			role: MessageRole.TOOL,
			tool_call_id: `read_${i}`
		}
	]).flat();
}

describe('tool context projection', () => {
	it('caps large reads but preserves tool IDs, reasoning, head/tail and full saved history', () => {
		const history = readHistory(1, 100_000);
		const before = JSON.stringify(history);
		const projected = compactToolContext(history);

		expect(projected[0]).toBe(history[0]);
		expect(projected[1].tool_call_id).toBe('read_0');
		expect(projected[1].content).toHaveLength(16_000);
		expect(projected[1].content).toContain('middle omitted');
		expect(projected[1].content).toContain('head-0');
		expect(projected[1].content).toContain('tail-0');
		expect(JSON.stringify(history)).toBe(before);
		expect(compactToolContext(history)).toEqual(projected);
	});
	it('compacts oldest reads under pressure and protects four recent results', () => {
		const history = readHistory(10);
		const projected = compactToolContext(history);

		for (let i = 0; i < 6; i++) expect(projected[i * 2 + 1].content).toHaveLength(1_000);
		expect(projected.slice(-8)).toEqual(history.slice(-8));
	});
	it('does not compact small history or grow excerpts on a fresh reread', () => {
		const history = readHistory(2, 100);

		expect(compactToolContext(history)).toEqual(history);
		const long = readHistory(10);
		const extended = [
			...long,
			...readHistory(1, 100).map((m) => ({
				...m,
				tool_call_id: m.tool_call_id ? 'fresh' : undefined,
				tool_calls: m.tool_calls?.map((c) => ({ ...c, id: 'fresh' }))
			}))
		];

		expect(compactToolContext(extended).at(-1)?.content).toBe(extended.at(-1)?.content);
	});
	it('preserves user text, write/shell results, unknown tools and multimodal data', () => {
		for (const name of ['edit_file', 'write_file', 'exec_shell_command', 'custom_read']) {
			const history = readHistory(1, 100_000);

			history[0].tool_calls![0].function!.name = name;
			expect(compactToolContext(history)).toEqual(history);
		}
		const multimodal = readHistory(1);

		multimodal[1].content = [
			{ text: 'x'.repeat(100_000), type: ContentPartType.TEXT },
			{ image_url: { url: 'data:image/png;base64,AA==' }, type: ContentPartType.IMAGE_URL }
		];
		expect(compactToolContext(multimodal)).toEqual(multimodal);
		const user = [{ content: 'x'.repeat(100_000), role: MessageRole.USER }];

		expect(compactToolContext(user)).toEqual(user);
	});
});

describe('exploration checkpoints', () => {
	it.each(['{"edits":[{"old":"x","new":"y"]}', 'null', '[]', '"path"', ''])(
		'rejects malformed or non-object tool arguments: %s',
		(args) => {
			expect(
				hasInvalidToolArguments([
					{
						function: { arguments: args, name: 'edit_file' },
						id: 'edit',
						type: ToolCallType.FUNCTION
					}
				])
			).toBe(true);
		}
	);
	it('accepts complete object arguments without rewriting them', () => {
		const calls = [
			{
				function: { arguments: '{"edits":[{"old":"x","new":"y"}]}', name: 'edit_file' },
				id: 'edit',
				type: ToolCallType.FUNCTION as const
			}
		];

		expect(hasInvalidToolArguments(calls)).toBe(false);
		expect(calls[0].function.arguments).toBe('{"edits":[{"old":"x","new":"y"}]}');
	});
	it.each([undefined, null, -1, 0, Infinity, NaN])(
		'bounds unlimited completion setting %s',
		(value) => {
			expect(agentCompletionLimit(value)).toBe(4096);
		}
	);
	it('respects a positive configured completion limit', () => {
		expect(agentCompletionLimit(8192)).toBe(8192);
	});
	it('reminds once after 8 reads and pauses after 16, including failed reads', () => {
		const guard = new ExplorationGuard();

		for (let i = 0; i < 7; i++) guard.record('read_file', true);
		expect(guard.checkpoint()).toBe('continue');
		guard.record('grep_search', false);
		expect(guard.checkpoint()).toBe('remind');
		expect(guard.checkpoint()).toBe('continue');
		for (let i = 0; i < 8; i++) guard.record('file_glob_search', true);
		expect(guard.checkpoint()).toBe('pause');
		guard.reset();
		expect(guard.checkpoint()).toBe('continue');
	});
	it('failed edits do not count as progress, successful actions reset the streak', () => {
		const guard = new ExplorationGuard();

		for (let i = 0; i < 16; i++) guard.record('read_file', true);
		guard.record('edit_file', false);
		expect(guard.checkpoint()).toBe('pause');
		guard.record('edit_file', true);
		expect(guard.checkpoint()).toBe('continue');
	});
});
