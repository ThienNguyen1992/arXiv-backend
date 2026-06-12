import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AbstractSummaryResult {
  description: string;
  key_points: string[];
  summary_model: string;
  summarized_at: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  isSummarizationEnabled(): boolean {
    return this.configService.get<string>('OLLAMA_ENABLED', 'true') !== 'false';
  }

  shouldSummarizeOnImport(): boolean {
    return this.configService.get<string>('OLLAMA_SUMMARIZE_ON_IMPORT', 'false') === 'true';
  }

  getSummarizeConcurrency(): number {
    const value = Number(this.configService.get<string>('OLLAMA_SUMMARIZE_CONCURRENCY', '8'));
    return Number.isFinite(value) && value > 0 ? Math.min(value, 32) : 8;
  }

  private getOllamaConfig() {
    return {
      baseUrl: this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434').replace(/\/$/, ''),
      model: this.configService.get<string>('OLLAMA_MODEL', 'llama3.2:3b'),
      timeoutMs: Number(this.configService.get<string>('OLLAMA_TIMEOUT_MS', '120000')),
      keepAlive: this.configService.get<string>('OLLAMA_KEEP_ALIVE', '30m'),
      abstractMaxChars: Number(this.configService.get<string>('OLLAMA_ABSTRACT_MAX_CHARS', '1800')),
      numPredict: Number(this.configService.get<string>('OLLAMA_NUM_PREDICT', '220')),
      numCtx: Number(this.configService.get<string>('OLLAMA_NUM_CTX', '2048')),
    };
  }

  async warmupModel(): Promise<void> {
    if (!this.isSummarizationEnabled()) {
      return;
    }

    const { baseUrl, model, keepAlive } = this.getOllamaConfig();

    try {
      await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: 'ok',
          stream: false,
          keep_alive: keepAlive,
          options: { num_predict: 1, num_ctx: 512 },
        }),
      });
      this.logger.log(`Ollama model warmed up: ${model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Ollama warmup failed: ${message}`);
    }
  }

  async summarizeAbstract(title: string, abstract: string): Promise<AbstractSummaryResult | null> {
    if (!this.isSummarizationEnabled()) {
      return null;
    }

    const normalizedAbstract = abstract?.replace(/\s+/g, ' ').trim();
    if (!normalizedAbstract || normalizedAbstract.length < 50) {
      return null;
    }

    const { baseUrl, model, timeoutMs, keepAlive, abstractMaxChars, numPredict, numCtx } =
      this.getOllamaConfig();

    const prompt = [
      'Summarize this paper abstract. Return ONLY JSON:',
      '{"description":"max 2 sentences","key_points":["3 short bullets"]}',
      `Title: ${title || 'Untitled'}`,
      `Abstract: ${normalizedAbstract.slice(0, abstractMaxChars)}`,
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
          keep_alive: keepAlive,
          options: {
            temperature: 0.1,
            num_predict: numPredict,
            num_ctx: numCtx,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ServiceUnavailableException(
          `Ollama request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const payload = (await response.json()) as { response?: string };
      const parsed = this.parseSummaryResponse(payload.response ?? '');
      if (!parsed) {
        this.logger.warn('Ollama returned unparseable summary JSON');
        return null;
      }

      return {
        description: parsed.description.slice(0, 500),
        key_points: parsed.key_points.slice(0, 6),
        summary_model: model,
        summarized_at: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Ollama summarize failed: ${message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseSummaryResponse(raw: string): { description: string; key_points: string[] } | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const json = JSON.parse(trimmed) as { description?: unknown; key_points?: unknown };
      const description = typeof json.description === 'string' ? json.description.trim() : '';
      const key_points = Array.isArray(json.key_points)
        ? json.key_points.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];

      if (!description && key_points.length === 0) {
        return null;
      }

      return {
        description: description || key_points.slice(0, 2).join(' '),
        key_points: key_points.length > 0 ? key_points : [description],
      };
    } catch {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      try {
        return this.parseSummaryResponse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }
}
