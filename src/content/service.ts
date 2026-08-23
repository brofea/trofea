import { ContentNotFoundError, FrontMatterError, UpstreamError } from "../errors.js";
import { type FetchLike, type ParsedContent } from "../types.js";
import { formatDate } from "../utils/date.js";
import { parseFrontMatter } from "../utils/frontmatter.js";


/**
 * 内容获取服务：从 GitHub Raw URL 读取 `YYYY-MM-DD.md` 并解析。
 *
 * 上游错误策略（已批准决策）：当日缺失或上游不可用时抛出可诊断错误，
 * 调度层负责跳过发送，不回退旧内容。
 */
export class ContentService {
  constructor(
    private readonly contentBaseUrl: string,
    private readonly fetchLike: FetchLike,
  ) {}

  /** 构造某日期的内容文件 Raw URL。纯逻辑，便于测试。 */
  urlFor(date: Date): string {
    return `${this.contentBaseUrl}${formatDate(date)}.md`;
  }

  /** 获取并解析某日期的内容。404 → ContentNotFoundError；其它失败 → UpstreamError。 */
  async fetchContent(date: Date): Promise<ParsedContent> {
    const url = this.urlFor(date);
    let res: Response;
    try {
      res = await this.fetchLike.fetch(url, {
        headers: { Accept: "text/plain, text/markdown; charset=utf-8" },
        cf: { cacheTtl: 60 },
      } as RequestInit);
    } catch (e) {
      throw new UpstreamError(`GitHub 请求失败: ${url}`, e);
    }
    if (res.status === 404) {
      throw new ContentNotFoundError(formatDate(date));
    }
    if (!res.ok) {
      throw new UpstreamError(
        `GitHub 返回非 2xx: ${res.status} ${res.statusText} @ ${url}`,
      );
    }
    const text = await res.text();
    if (!text.trim()) {
      throw new FrontMatterError(`内容为空: ${url}`);
    }
    return parseFrontMatter(text);
  }
}
