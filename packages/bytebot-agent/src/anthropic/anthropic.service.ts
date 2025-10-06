import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic, { APIUserAbortError } from '@anthropic-ai/sdk';
import {
  MessageContentBlock,
  MessageContentType,
  TextContentBlock,
  ToolUseContentBlock,
  ThinkingContentBlock,
  RedactedThinkingContentBlock,
  isUserActionContentBlock,
  isComputerToolUseContentBlock,
} from '@bytebot/shared';
import { DEFAULT_MODEL } from './anthropic.constants';
import { Message, Role } from '@prisma/client';
import { anthropicTools } from './anthropic.tools';
import {
  BytebotAgentService,
  BytebotAgentInterrupt,
  BytebotAgentResponse,
  BytebotAgentModel,
} from '../agent/agent.types';
import { supportsVision } from '../agent/vision-capability.util';
import { transformImagesForNonVision } from '../agent/message-transformer.util';

@Injectable()
export class AnthropicService implements BytebotAgentService {
  private anthropic: Anthropic | null = null;
  private currentApiKey: string | null = null;
  private hasLoggedMissingKey = false;
  private readonly logger = new Logger(AnthropicService.name);

  constructor(private readonly configService: ConfigService) {
    this.initializeClient();
  }

  async generateMessage(
    systemPrompt: string,
    messages: Message[],
    modelName: string = DEFAULT_MODEL.name,
    modelMetadata: BytebotAgentModel,
    useTools: boolean = true,
    signal?: AbortSignal,
  ): Promise<BytebotAgentResponse> {
    try {
      const anthropicClient = this.getAnthropicClient();
      const maxTokens = 8192;

      // Transform images to text for non-vision models
      const processedMessages = supportsVision(modelMetadata)
        ? messages  // Keep images for vision models
        : transformImagesForNonVision(messages);  // Replace images with text for non-vision models

      // Convert our message content blocks to Anthropic's expected format
      const anthropicMessages = this.formatMessagesForAnthropic(processedMessages);

      // add cache_control to last tool
      anthropicTools[anthropicTools.length - 1].cache_control = {
        type: 'ephemeral',
      };

      // Make the API call
      const response = await anthropicClient.messages.create(
        {
          model: modelName,
          max_tokens: maxTokens * 2,
          thinking: { type: 'disabled' },
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: anthropicMessages,
          tools: useTools ? anthropicTools : [],
        },
        { signal },
      );

      // Convert Anthropic's response to our message content blocks format
      return {
        contentBlocks: this.formatAnthropicResponse(response.content),
        tokenUsage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      this.logger.log(error);

      if (error instanceof APIUserAbortError) {
        this.logger.log('Anthropic API call aborted');
        throw new BytebotAgentInterrupt();
      }
      this.logger.error(
        `Error sending message to Anthropic: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private initializeClient() {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    if (!apiKey) {
      this.logMissingKey();
      this.anthropic = new Anthropic({
        apiKey: 'dummy-key-for-initialization',
      });
      this.currentApiKey = null;
      return;
    }

    this.anthropic = new Anthropic({
      apiKey,
    });
    this.currentApiKey = apiKey;
    this.hasLoggedMissingKey = false;
  }

  private getAnthropicClient(): Anthropic {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    if (apiKey && apiKey !== this.currentApiKey) {
      this.anthropic = new Anthropic({ apiKey });
      this.currentApiKey = apiKey;
      this.hasLoggedMissingKey = false;
    }

    if (!apiKey) {
      this.logMissingKey();

      if (!this.anthropic) {
        this.anthropic = new Anthropic({
          apiKey: 'dummy-key-for-initialization',
        });
      }

      this.currentApiKey = null;
    }

    return this.anthropic!;
  }

  private logMissingKey() {
    if (!this.hasLoggedMissingKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set. AnthropicService will not work properly.',
      );
      this.hasLoggedMissingKey = true;
    }
  }

  /**
   * Convert our MessageContentBlock format to Anthropic's message format
   */
  private formatMessagesForAnthropic(
    messages: Message[],
  ): Anthropic.MessageParam[] {
    const anthropicMessages: Anthropic.MessageParam[] = [];

    // Process each message content block
    for (const [index, message] of messages.entries()) {
      const messageContentBlocks = message.content as MessageContentBlock[];

      const content: Anthropic.ContentBlockParam[] = [];

      if (
        messageContentBlocks.every((block) => isUserActionContentBlock(block))
      ) {
        const userActionContentBlocks = messageContentBlocks.flatMap(
          (block) => block.content,
        );
        for (const block of userActionContentBlocks) {
          if (isComputerToolUseContentBlock(block)) {
            content.push({
              type: 'text',
              text: `User performed action: ${block.name}\n${JSON.stringify(block.input, null, 2)}`,
            });
          } else {
            content.push(block as Anthropic.ContentBlockParam);
          }
        }
      } else {
        content.push(
          ...messageContentBlocks.map(
            (block) => block as Anthropic.ContentBlockParam,
          ),
        );
      }

      if (index === messages.length - 1) {
        content[content.length - 1]['cache_control'] = {
          type: 'ephemeral',
        };
      }
      anthropicMessages.push({
        role: message.role === Role.USER ? 'user' : 'assistant',
        content: content,
      });
    }

    return anthropicMessages;
  }

  /**
   * Convert Anthropic's response content to our MessageContentBlock format
   */
  private formatAnthropicResponse(
    content: Anthropic.ContentBlock[],
  ): MessageContentBlock[] {
    return content.map((block) => {
      switch (block.type) {
        case 'text':
          return {
            type: MessageContentType.Text,
            text: block.text,
          } as TextContentBlock;

        case 'tool_use':
          return {
            type: MessageContentType.ToolUse,
            id: block.id,
            name: block.name,
            input: block.input,
          } as ToolUseContentBlock;

        case 'thinking':
          return {
            type: MessageContentType.Thinking,
            thinking: block.thinking,
            signature: block.signature,
          } as ThinkingContentBlock;

        case 'redacted_thinking':
          return {
            type: MessageContentType.RedactedThinking,
            data: block.data,
          } as RedactedThinkingContentBlock;
      }
    });
  }
}
