import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getStats } from '../db/queries.js';

export async function getThoughtStats(): Promise<CallToolResult> {
  try {
    const stats = await getStats();

    const lines = [
      `=== Open Brain Stats ===`,
      ``,
      `Total thoughts: ${stats.total_thoughts}`,
      ``,
      `By context:`,
      `  Work: ${stats.by_context.work}`,
      `  Personal: ${stats.by_context.personal}`,
      `  Unclassified: ${stats.by_context.unclassified}`,
      ``,
      `By type:`,
    ];

    const typeEntries = Object.entries(stats.by_type);
    if (typeEntries.length > 0) {
      for (const [type, count] of typeEntries) {
        lines.push(`  ${type}: ${count}`);
      }
    } else {
      lines.push(`  (none yet)`);
    }

    lines.push('', `Top topics:`);
    if (stats.top_topics.length > 0) {
      for (const { topic, count } of stats.top_topics.slice(0, 10)) {
        lines.push(`  ${topic}: ${count}`);
      }
    } else {
      lines.push(`  (none yet)`);
    }

    lines.push('', `Top people:`);
    if (stats.top_people.length > 0) {
      for (const { person, count } of stats.top_people.slice(0, 10)) {
        lines.push(`  ${person}: ${count}`);
      }
    } else {
      lines.push(`  (none yet)`);
    }

    lines.push(
      '',
      `Activity:`,
      `  Last 7 days: ${stats.thoughts_last_7_days}`,
      `  Last 30 days: ${stats.thoughts_last_30_days}`,
    );

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error getting stats: ${message}` }], isError: true };
  }
}
