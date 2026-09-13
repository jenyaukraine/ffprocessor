import { MessageRole } from '$lib/enums';
import type { ApiChatMessageData } from '$lib/types/api';

export function toChatRequestMessage(
	message: ApiChatMessageData,
	excludeReasoning = false
): ApiChatMessageData {
	const mapped: ApiChatMessageData = {
		content: message.content,
		role: message.role,
		tool_call_id: message.tool_call_id,
		tool_calls: message.tool_calls
	};
	// Tool-call reasoning is part of the replay protocol, not optional display text.
	const needsReplay = message.role === MessageRole.ASSISTANT && !!message.tool_calls?.length;
	if ((!excludeReasoning || needsReplay) && message.reasoning_content !== undefined) {
		mapped.reasoning_content = message.reasoning_content;
	}
	return mapped;
}
