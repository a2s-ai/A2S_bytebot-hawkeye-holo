import OpenAI from 'openai';
import { agentTools, getToolsForTask } from '../agent/agent.tools';

function agentToolToOpenAITool(agentTool: any): OpenAI.Responses.FunctionTool {
  return {
    type: 'function',
    name: agentTool.name,
    description: agentTool.description,
    parameters: agentTool.input_schema,
  } as OpenAI.Responses.FunctionTool;
}

/**
 * Creates a mapped object of tools by name
 */
const toolMap = agentTools.reduce(
  (acc, tool) => {
    const anthropicTool = agentToolToOpenAITool(tool);
    const camelCaseName = tool.name
      .split('_')
      .map((part, index) => {
        if (index === 0) return part;
        if (part === 'computer') return '';
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('')
      .replace(/^computer/, '');

    acc[camelCaseName + 'Tool'] = anthropicTool;
    return acc;
  },
  {} as Record<string, OpenAI.Responses.FunctionTool>,
);

// Export individual tools with proper names
export const moveMouseTool = toolMap.moveMouseTool;
export const traceMouseTool = toolMap.traceMouseTool;
export const clickMouseTool = toolMap.clickMouseTool;
export const pressMouseTool = toolMap.pressMouseTool;
export const dragMouseTool = toolMap.dragMouseTool;
export const scrollTool = toolMap.scrollTool;
export const typeKeysTool = toolMap.typeKeysTool;
export const pressKeysTool = toolMap.pressKeysTool;
export const typeTextTool = toolMap.typeTextTool;
export const pasteTextTool = toolMap.pasteTextTool;
export const waitTool = toolMap.waitTool;
export const screenshotTool = toolMap.screenshotTool;
export const cursorPositionTool = toolMap.cursorPositionTool;
export const screenInfoTool = toolMap.screenInfoTool;
export const setTaskStatusTool = toolMap.setTaskStatusTool;
export const createTaskTool = toolMap.createTaskTool;
export const applicationTool = toolMap.applicationTool;

// Array of all tools (default - includes CV tools)
export const openaiTools: OpenAI.Responses.FunctionTool[] = agentTools.map(
  agentToolToOpenAITool,
);

/**
 * Get OpenAI tools based on task configuration
 * @param directVisionMode - If true, exclude CV tools (Holo 1.5-7B detection)
 * @returns Filtered OpenAI tool array
 */
export function getOpenAITools(directVisionMode: boolean = false): OpenAI.Responses.FunctionTool[] {
  return getToolsForTask(directVisionMode).map(agentToolToOpenAITool);
}
