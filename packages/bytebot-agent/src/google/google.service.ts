import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isComputerToolUseContentBlock,
  isImageContentBlock,
  isUserActionContentBlock,
  MessageContentBlock,
  MessageContentType,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
} from '@bytebot/shared';
import {
  BytebotAgentService,
  BytebotAgentInterrupt,
  BytebotAgentResponse,
  BytebotAgentModel,
} from '../agent/agent.types';
import { supportsVision } from '../agent/vision-capability.util';
import { transformImagesForNonVision } from '../agent/message-transformer.util';
import { Message, Role } from '@prisma/client';
import { googleTools, getGoogleTools } from './google.tools';
import {
  Content,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai';
import { v4 as uuid } from 'uuid';
import { DEFAULT_MODEL } from './google.constants';

@Injectable()
export class GoogleService implements BytebotAgentService {
  private google: GoogleGenAI | null = null;
  private currentApiKey: string | null = null;
  private hasLoggedMissingKey = false;
  private readonly logger = new Logger(GoogleService.name);

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
    directVisionMode: boolean = false,
  ): Promise<BytebotAgentResponse> {
    try {
      const googleClient = this.getGoogleClient();
      const maxTokens = 8192;

      // Transform images to text for non-vision models
      const processedMessages = supportsVision(modelMetadata)
        ? messages  // Keep images for vision models
        : transformImagesForNonVision(messages);  // Replace images with text for non-vision models

      // Convert our message content blocks to Anthropic's expected format
      const googleMessages = this.formatMessagesForGoogle(processedMessages);

      const response: GenerateContentResponse =
        await googleClient.models.generateContent({
          model: modelName,
          contents: googleMessages,
          config: {
            thinkingConfig: {
              thinkingBudget: 24576,
            },
            maxOutputTokens: maxTokens,
            systemInstruction: systemPrompt,
            tools: useTools
              ? [
                  {
                    functionDeclarations: getGoogleTools(directVisionMode),
                  },
                ]
              : [],
            abortSignal: signal,
          },
        });

      const candidate = response.candidates?.[0];

      if (!candidate) {
        throw new Error('No candidate found in response');
      }

      const content = candidate.content;

      if (!content) {
        throw new Error('No content found in candidate');
      }

      if (!content.parts) {
        throw new Error('No parts found in content');
      }

      return {
        contentBlocks: this.formatGoogleResponse(content.parts),
        tokenUsage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (error) {
      if (error.message.includes('AbortError')) {
        throw new BytebotAgentInterrupt();
      }
      this.logger.error(
        `Error sending message to Google Gemini: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private initializeClient() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logMissingKey();
      this.google = new GoogleGenAI({
        apiKey: 'dummy-key-for-initialization',
      });
      this.currentApiKey = null;
      return;
    }

    this.google = new GoogleGenAI({ apiKey });
    this.currentApiKey = apiKey;
    this.hasLoggedMissingKey = false;
  }

  private getGoogleClient(): GoogleGenAI {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (apiKey && apiKey !== this.currentApiKey) {
      this.google = new GoogleGenAI({ apiKey });
      this.currentApiKey = apiKey;
      this.hasLoggedMissingKey = false;
    }

    if (!apiKey) {
      this.logMissingKey();

      if (!this.google) {
        this.google = new GoogleGenAI({
          apiKey: 'dummy-key-for-initialization',
        });
      }

      this.currentApiKey = null;
    }

    return this.google!;
  }

  private logMissingKey() {
    if (!this.hasLoggedMissingKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set. GoogleService will not work properly.',
      );
      this.hasLoggedMissingKey = true;
    }
  }

  /**
   * Convert our MessageContentBlock format to Google Gemini's message format
   */
  private formatMessagesForGoogle(messages: Message[]): Content[] {
    const googleMessages: Content[] = [];

    // Process each message content block
    for (const message of messages) {
      const messageContentBlocks = message.content as MessageContentBlock[];

      const parts: Part[] = [];

      if (
        messageContentBlocks.every((block) => isUserActionContentBlock(block))
      ) {
        const userActionContentBlocks = messageContentBlocks.flatMap(
          (block) => block.content,
        );
        for (const block of userActionContentBlocks) {
          if (isComputerToolUseContentBlock(block)) {
            parts.push({
              text: `User performed action: ${block.name}\n${JSON.stringify(block.input, null, 2)}`,
            });
          } else if (isImageContentBlock(block)) {
            parts.push({
              inlineData: {
                data: block.source.data,
                mimeType: block.source.media_type,
              },
            });
          }
        }
      } else {
        for (const block of messageContentBlocks) {
          switch (block.type) {
            case MessageContentType.Text:
              parts.push({
                text: block.text,
              });
              break;
            case MessageContentType.ToolUse:
              parts.push({
                functionCall: {
                  id: block.id,
                  name: block.name,
                  args: block.input,
                },
              });
              break;
            case MessageContentType.Image:
              parts.push({
                inlineData: {
                  data: block.source.data,
                  mimeType: block.source.media_type,
                },
              });
              break;
            case MessageContentType.ToolResult: {
              const toolResultContentBlock = block.content[0];
              if (toolResultContentBlock.type === MessageContentType.Image) {
                parts.push({
                  functionResponse: {
                    id: block.tool_use_id,
                    name: 'screenshot',
                    response: {
                      ...(!block.is_error && {
                        output: 'screenshot successful',
                      }),
                      ...(block.is_error && { error: block.content[0] }),
                    },
                  },
                });
                parts.push({
                  inlineData: {
                    data: toolResultContentBlock.source.data,
                    mimeType: toolResultContentBlock.source.media_type,
                  },
                });
                break;
              }

              parts.push({
                functionResponse: {
                  id: block.tool_use_id,
                  name: this.getToolName(block.tool_use_id, messages),
                  response: {
                    ...(!block.is_error && { output: block.content[0] }),
                    ...(block.is_error && { error: block.content[0] }),
                  },
                },
              });
              break;
            }
            case MessageContentType.Thinking:
              parts.push({
                text: block.thinking,
                thoughtSignature: block.signature,
                thought: true,
              });
              break;
            default:
              parts.push({
                text: JSON.stringify(block),
              });
              break;
          }
        }
      }

      googleMessages.push({
        role: message.role === Role.USER ? 'user' : 'model',
        parts: parts,
      });
    }

    return googleMessages;
  }

  // Find the content block with the tool_use_id and return the name
  private getToolName(
    tool_use_id: string,
    messages: Message[],
  ): string | undefined {
    const toolMessage = messages.find((message) =>
      (message.content as MessageContentBlock[]).some(
        (block) =>
          block.type === MessageContentType.ToolUse && block.id === tool_use_id,
      ),
    );
    if (!toolMessage) {
      return undefined;
    }

    const toolBlock = (toolMessage.content as MessageContentBlock[]).find(
      (block) =>
        block.type === MessageContentType.ToolUse && block.id === tool_use_id,
    );
    if (!toolBlock) {
      return undefined;
    }
    return (toolBlock as ToolUseContentBlock).name;
  }

  /**
   * Convert Google Gemini's response content to our MessageContentBlock format
   */
  private formatGoogleResponse(parts: Part[]): MessageContentBlock[] {
    return parts.map((part) => {
      if (part.text) {
        return {
          type: MessageContentType.Text,
          text: part.text,
        } as TextContentBlock;
      }

      if (part.thought) {
        return {
          type: MessageContentType.Thinking,
          signature: part.thoughtSignature,
          thinking: part.text,
        } as ThinkingContentBlock;
      }

      if (part.functionCall) {
        return {
          type: MessageContentType.ToolUse,
          id: part.functionCall.id || uuid(),
          name: part.functionCall.name,
          input: part.functionCall.args,
        } as ToolUseContentBlock;
      }

      this.logger.warn(`Unknown content type from Google: ${part}`);
      return {
        type: MessageContentType.Text,
        text: JSON.stringify(part),
      } as TextContentBlock;
    });
  }
}
