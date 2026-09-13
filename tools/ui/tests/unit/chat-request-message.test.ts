import { MessageRole } from '$lib/enums';
import type { ApiChatMessageData } from '$lib/types/api';
import { toChatRequestMessage } from '$lib/utils/chat-request-message';
import { describe, expect, it } from 'vitest';

const toolTurn: ApiChatMessageData = {
	role: MessageRole.ASSISTANT,
	content: '',
	reasoning_content: 'Read the file before editing it.',
	tool_calls: [
		{
			id: 'call_1',
			type: 'function',
			function: { name: 'read_file', arguments: '{"path":"a.ts"}' }
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
			role: MessageRole.ASSISTANT,
			content: 'Done',
			reasoning_content: 'Check result'
		};
		expect(toChatRequestMessage(message, true)).not.toHaveProperty('reasoning_content');
		expect(toChatRequestMessage(message, false).reasoning_content).toBe('Check result');
		expect(message.reasoning_content).toBe('Check result');
	});
	it('keeps tool results paired across multiple turns and JSON serialization', () => {
		const result = { role: MessageRole.TOOL, content: 'file contents', tool_call_id: 'call_1' };
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
