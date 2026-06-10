import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull, In } from 'typeorm';
import { NotificationGateway } from './notification.gateway';
import { Notification } from './entities/notification.entity';
import { Paper } from '../papers/entities/paper.entity';
import { User } from '../users/entities/user.entity';
import { PaperTopic } from '../papers/entities/paper-topic.entity';
import { ArxivPaperDto } from '../papers/papers.service';

export type { ArxivPaperDto };

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Paper)
    private paperRepository: Repository<Paper>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PaperTopic)
    private paperTopicRepository: Repository<PaperTopic>,
    private notificationGateway: NotificationGateway,
  ) {}

  // ─── Dùng bởi cron: query papers từ DB theo ngày ───────────────────────
  async processNotifications(startTime: Date, endTime: Date) {
    try {
      this.logger.log(
        `Querying papers with published_at BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}`,
      );

      const papers = await this.paperRepository.find({
        where: { published_at: Between(startTime, endTime) },
        select: ['id', 'title', 'arxiv_id', 'published_at', 'abstract'],
        relations: ['paperTopics'],
      });

      const totalInDb = await this.paperRepository.count();
      this.logger.log(
        `Found ${papers.length} papers in range | Total papers in DB: ${totalInDb}`,
      );

      if (papers.length === 0) {
        this.logger.warn(`No papers found between ${startTime.toISOString()} and ${endTime.toISOString()}.`);
        return { success: true, count: 0, message: 'No papers found in this time range' };
      }

      // Lấy topic_id của từng paper từ paper_topics
      const paperIds = papers.map((p) => p.id);
      const paperTopics = await this.paperTopicRepository.find({
        where: { paper_id: In(paperIds) },
        relations: ['topic'],
      });

      // Build map: paperId → [{ topicId, topicCode }]
      const paperTopicMap = new Map<string, { topicId: number; topicCode: string }[]>();
      for (const pt of paperTopics) {
        if (!paperTopicMap.has(pt.paper_id)) paperTopicMap.set(pt.paper_id, []);
        paperTopicMap.get(pt.paper_id)!.push({
          topicId: pt.topic_id,
          topicCode: pt.topic?.code ?? '',
        });
      }

      await this.pushNotificationsToMatchedUsers(papers, paperTopicMap);

      return { success: true, count: papers.length };
    } catch (error) {
      this.logger.error('Error processing notifications', error);
      throw error;
    }
  }

  // ─── Dùng bởi scheduler: nhận paper list thẳng từ arXiv API ───────────
  async pushFromArxivPapers(newPapers: ArxivPaperDto[]) {
    if (newPapers.length === 0) return;

    // Lấy tất cả users kèm topics họ follow
    const users = await this.userRepository.find({
      relations: ['topics'],
    });

    let totalPushed = 0;

    for (const user of users) {
      if (!user.topics || user.topics.length === 0) continue;

      const userTopicCodes = new Set(user.topics.map((t) => t.code.toLowerCase()));

      // Lọc papers có ít nhất 1 category trùng topic của user
      const matchedPapers = newPapers.filter((paper) =>
        paper.allCategories.some((cat) => userTopicCodes.has(cat.toLowerCase())),
      );

      if (matchedPapers.length === 0) {
        this.logger.log(`👤 User ${user.email || user.id} (Topics: ${Array.from(userTopicCodes).join(', ')}) -> Không có paper nào match.`);
        continue;
      }

      this.logger.log(`👤 User ${user.email || user.id} (Topics: ${Array.from(userTopicCodes).join(', ')}) -> Có ${matchedPapers.length} papers match!`);

      // Group theo topic: mỗi topic match → 1 notification
      const matchedTopics = user.topics.filter((t) =>
        newPapers.some((p) =>
          p.allCategories.some((cat) => cat.toLowerCase() === t.code.toLowerCase()),
        ),
      );

      for (const topic of matchedTopics) {
        const papersForTopic = matchedPapers.filter((p) =>
          p.allCategories.some((cat) => cat.toLowerCase() === topic.code.toLowerCase()),
        );

        if (papersForTopic.length === 0) continue;

        this.logger.log(`   └─ 📌 Topic [${topic.code}]: Match ${papersForTopic.length} papers (VD: ${papersForTopic[0].title.substring(0, 50)}...)`);

        const notification = this.notificationRepository.create({
          userId: user.id,
          title: `${papersForTopic.length} bài báo mới về ${topic.code}`,
          message: `Có ${papersForTopic.length} bài báo arXiv mới trong topic ${topic.code} (${topic.title}) hôm nay.`,
          content: papersForTopic
            .slice(0, 3) // preview 3 bài đầu
            .map((p) => `• ${p.title}`)
            .join('\n'),
          topicId: topic.id,
          topicCode: topic.code,
          type: 'topic_match',
          isRead: false,
          data: papersForTopic.map((p) => ({
            arxiv_id: p.id,
            title: p.title,
            summary: p.summary?.substring(0, 200),
            authors: p.authors,
            publishedDate: p.publishedDate,
            pdfLink: p.pdfLink || `https://arxiv.org/pdf/${p.id}.pdf`,
            topicId: topic.id,
            topicCode: topic.code,
          })),
        });

        const saved = await this.notificationRepository.save(notification);

        // Push WebSocket đến đúng user
        this.notificationGateway.sendToUser(user.id, saved);
        totalPushed++;

        this.logger.log(
          `Pushed to user ${user.id} | topic: ${topic.code} | papers: ${papersForTopic.length}`,
        );
      }
    }

    this.logger.log(`Total notifications pushed: ${totalPushed}`);
  }

  // ─── Internal: dùng khi query từ DB ────────────────────────────────────
  private async pushNotificationsToMatchedUsers(
    papers: Paper[],
    paperTopicMap: Map<string, { topicId: number; topicCode: string }[]>,
  ) {
    const users = await this.userRepository.find({ relations: ['topics'] });

    for (const user of users) {
      if (!user.topics || user.topics.length === 0) continue;

      const userTopicIds = new Set(user.topics.map((t) => t.id));

      for (const topic of user.topics) {
        const matchedPapers = papers.filter((p) =>
          (paperTopicMap.get(p.id) ?? []).some((pt) => pt.topicId === topic.id),
        );

        if (matchedPapers.length === 0) continue;

        const notification = this.notificationRepository.create({
          userId: user.id,
          title: `${matchedPapers.length} bài báo mới về ${topic.code}`,
          message: `Có ${matchedPapers.length} bài báo mới trong topic ${topic.code} (${topic.title}).`,
          content: matchedPapers
            .slice(0, 3)
            .map((p) => `• ${p.title}`)
            .join('\n'),
          topicId: topic.id,
          topicCode: topic.code,
          type: 'topic_match',
          isRead: false,
          data: matchedPapers.map((p) => ({
            id: p.id,
            arxiv_id: p.arxiv_id,
            title: p.title,
            abstract: p.abstract?.substring(0, 200),
            published_at: p.published_at,
            topicId: topic.id,
            topicCode: topic.code,
          })),
        });

        const saved = await this.notificationRepository.save(notification);
        this.notificationGateway.sendToUser(user.id, saved);
        this.logger.log(`Pushed to ${user.id} | topic: ${topic.code} | papers: ${matchedPapers.length}`);
      }
    }
  }

  // ─── Test push: không lưu DB ────────────────────────────────────────────
  async pushTestNotification(payload?: { title?: string; message?: string; data?: any }) {
    const notification = {
      id: `test-${Date.now()}`,
      title: payload?.title ?? 'Test Notification',
      message: payload?.message ?? 'This is a test push — not saved to DB',
      content: payload?.message ?? null,
      data: payload?.data ?? null,
      topicId: null,
      topicCode: null,
      timestamp: new Date(),
      type: 'test',
    };

    this.notificationGateway.sendNotification(notification);
    this.logger.log(`[TEST] Pushed notification (no DB write): ${notification.title}`);

    return { success: true, pushed: notification };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────
  async saveNotification(notification: Partial<Notification>): Promise<Notification> {
    const entity = this.notificationRepository.create(notification);
    return this.notificationRepository.save(entity);
  }

  async getNotifications(userId: string, page = 1, limit = 5): Promise<any> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.notificationRepository.findAndCount({
      where: [
        { userId },           // notification riêng cho user
        { userId: IsNull() }, // broadcast tới tất cả
      ],
      order: { createdAt: 'DESC' },
      skip: skip,
      take: limit,
    });

    const unreadCount = await this.notificationRepository.count({
      where: [
        { userId, isRead: false },
        { userId: IsNull(), isRead: false },
      ],
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markAsRead(notificationId: string) {
    return this.notificationRepository.update(notificationId, { isRead: true });
  }

  // BE xử lý mark all as read cho userId
  async markAllAsRead(userId: string) {
    return this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: [
        { userId, isRead: false },
        { userId: IsNull(), isRead: false },
      ],
    });
  }
}
